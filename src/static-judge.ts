import { open, type Entry, type ZipFile } from 'yauzl';
import { runAlgorithmCases } from './algorithm-judge';
import { runDynamicChecks } from './dynamic-judge';
import type {
  ScratchAlgorithmCase,
  ScratchAlgorithmCompareMode,
  ScratchAlgorithmConfig,
  ScratchAlgorithmInputMode,
  ScratchAlgorithmInputSplit,
  ScratchAlgorithmOutputMode,
  ScratchAlgorithmValue,
  ScratchDynamicCheck,
  ScratchDynamicComparison,
  ScratchDynamicOptions,
  ScratchDynamicStep,
  ScratchJudgeConfig,
  ScratchJudgeDetail,
  ScratchJudgeMode,
  ScratchJudgeResult,
  ScratchProjectMeta,
  ScratchScriptMeta,
  ScratchSequenceMode,
  ScratchStaticCheck,
  ScratchStructureCheck,
} from './types';

interface ScratchBlock {
  opcode?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  mutation?: unknown;
  parent?: string | null;
  next?: string | null;
  topLevel?: boolean;
}

interface ScratchTarget {
  isStage?: boolean;
  name?: string;
  variables?: Record<string, [string, unknown]>;
  lists?: Record<string, [string, unknown[]]>;
  broadcasts?: Record<string, string>;
  blocks?: Record<string, ScratchBlock>;
}

interface ScratchProject {
  targets?: ScratchTarget[];
}

interface ScratchScriptBlock {
  id: string;
  opcode: string;
  block: ScratchBlock;
}

interface ScratchScript {
  targetName: string;
  targetIsStage: boolean;
  hat?: string;
  blocks: ScratchScriptBlock[];
  blockMap: Record<string, ScratchBlock>;
}

const STATIC_CHECK_TYPES = new Set([
  'sprite_exists',
  'variable_exists',
  'list_exists',
  'broadcast_exists',
  'block_exists',
  'block_exists_any',
  'forbidden_block_absent',
  'min_block_count',
]);

const STRUCTURE_CHECK_TYPES = new Set([
  'target_script_exists',
  'script_sequence',
  'script_module',
  'block_input_equals',
  'block_field_equals',
]);

const DYNAMIC_CHECK_TYPES = new Set([
  'runtime_runs',
  'variable_value',
  'sprite_position',
]);

const DYNAMIC_OPERATORS = new Set([
  'exists',
  'equals',
  'not_equals',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'changed',
]);

const DYNAMIC_STEP_ACTIONS = new Set([
  'green_flag',
  'wait',
  'key_down',
  'key_up',
  'key_press',
]);

const ALGORITHM_COMPARE_MODES = new Set([
  'exact',
  'trim',
  'tokens',
  'number',
]);

const ALGORITHM_INPUT_SPLITS = new Set([
  'none',
  'lines',
  'tokens',
]);

const ALGORITHM_INPUT_MODES = new Set([
  'variable',
  'list',
  'ask',
]);

const ALGORITHM_OUTPUT_MODES = new Set([
  'variable',
  'list',
  'say',
]);

export function defaultJudgeConfig(maxScore: number): ScratchJudgeConfig {
  return {
    schemaVersion: 2,
    totalScore: maxScore,
    staticChecks: [],
    structureChecks: [],
    dynamicChecks: [],
  };
}

export function stringifyJudgeConfig(config: ScratchJudgeConfig) {
  return JSON.stringify(config || defaultJudgeConfig(100), null, 2);
}

export function normalizeJudgeConfig(input: unknown, maxScore: number): ScratchJudgeConfig {
  const fallback = defaultJudgeConfig(maxScore);
  if (input === undefined || input === null || input === '') return fallback;

  let raw = input;
  if (typeof input === 'string') raw = JSON.parse(input);
  if (!isPlainObject(raw)) throw new Error('judgeConfig must be a JSON object.');

  const config = raw as Record<string, unknown>;
  const totalScore = nonNegativeNumber(config.totalScore, maxScore);
  return {
    schemaVersion: optionalPositiveInteger(config.schemaVersion),
    problemId: typeof config.problemId === 'string' || typeof config.problemId === 'number'
      ? config.problemId
      : undefined,
    title: typeof config.title === 'string' ? config.title : undefined,
    totalScore,
    staticChecks: parseStaticChecks(config.staticChecks),
    structureChecks: parseStructureChecks(config.structureChecks),
    dynamicChecks: parseDynamicChecks(config.dynamicChecks),
    dynamicOptions: parseDynamicOptions(config.dynamicOptions),
    algorithm: parseAlgorithmConfig(config.algorithm),
  };
}

export function prepareStaticJudgeConfig(config: ScratchJudgeConfig, maxScore: number): ScratchJudgeConfig {
  const normalized = normalizeJudgeConfig({
    ...config,
    totalScore: config.totalScore ?? maxScore,
  }, maxScore);
  return {
    ...normalized,
    dynamicChecks: [],
    dynamicOptions: undefined,
    algorithm: undefined,
  };
}

export function prepareJudgeConfigForMode(
  config: ScratchJudgeConfig,
  maxScore: number,
  mode: ScratchJudgeMode,
): ScratchJudgeConfig {
  const normalized = normalizeJudgeConfig({
    ...config,
    totalScore: config.totalScore ?? maxScore,
  }, maxScore);

  if (mode === 'manual') {
    return {
      ...normalized,
      staticChecks: [],
      structureChecks: [],
      dynamicChecks: [],
      dynamicOptions: undefined,
      algorithm: undefined,
    };
  }

  if (mode === 'static') {
    return {
      ...normalized,
      dynamicChecks: [],
      dynamicOptions: undefined,
      algorithm: undefined,
    };
  }

  if (mode === 'dynamic') {
    return {
      ...normalized,
      staticChecks: [],
      structureChecks: [],
    };
  }

  return normalized;
}

export function judgeConfigHasTaskChecks(config: ScratchJudgeConfig): boolean {
  return (config.staticChecks?.length || 0) > 0
    || (config.structureChecks?.length || 0) > 0
    || (config.dynamicChecks?.length || 0) > 0;
}

export function judgeConfigHasAlgorithmCases(config: ScratchJudgeConfig): boolean {
  return (config.algorithm?.cases?.length || 0) > 0;
}

export function judgeConfigHasChecks(config: ScratchJudgeConfig): boolean {
  return judgeConfigHasTaskChecks(config) || judgeConfigHasAlgorithmCases(config);
}

export async function judgeScratchStaticFile(filePath: string, config: ScratchJudgeConfig): Promise<ScratchJudgeResult> {
  return judgeScratchFile(filePath, prepareStaticJudgeConfig(config, config.totalScore ?? 100));
}

export async function judgeScratchFile(filePath: string, config: ScratchJudgeConfig): Promise<ScratchJudgeResult> {
  const project = await readProjectFromSb3(filePath);
  const scripts = buildScriptGraph(project);
  const projectMeta = collectProjectMeta(project, scripts);
  const details = [
    ...(config.staticChecks || []).map((check) => evaluateStaticCheck(check, projectMeta)),
    ...(config.structureChecks || []).map((check) => evaluateStructureCheck(check, scripts)),
    ...(await runDynamicChecks(filePath, config.dynamicChecks || [], config.dynamicOptions)),
  ];
  return createJudgeResult(projectMeta, config, details, resultMode(config));
}

export async function judgeScratchAlgorithmFile(filePath: string, config: ScratchJudgeConfig): Promise<ScratchJudgeResult> {
  const project = await readProjectFromSb3(filePath);
  const scripts = buildScriptGraph(project);
  const projectMeta = collectProjectMeta(project, scripts);
  const details = await runAlgorithmCases(filePath, config.algorithm);
  return createJudgeResult(projectMeta, config, details, 'algorithm');
}

export async function readProjectFromSb3(filePath: string): Promise<ScratchProject> {
  const content = await readZipEntry(filePath, 'project.json', 16 * 1024 * 1024);
  try {
    return JSON.parse(content.toString('utf8')) as ScratchProject;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`project.json is not valid JSON: ${message}`);
  }
}

export function collectProjectMeta(project: ScratchProject, scripts = buildScriptGraph(project)): ScratchProjectMeta {
  const targets = Array.isArray(project.targets) ? project.targets : [];
  const stage = targets.find((target) => target?.isStage);
  const sprites = targets.filter((target) => !target?.isStage);
  const variableNames = new Set<string>();
  const listNames = new Set<string>();
  const broadcastNames = new Set<string>();
  const blockOpcodes: string[] = [];

  for (const target of targets) {
    for (const variable of Object.values(target.variables || {})) {
      if (Array.isArray(variable) && variable[0]) variableNames.add(String(variable[0]));
    }

    for (const list of Object.values(target.lists || {})) {
      if (Array.isArray(list) && list[0]) listNames.add(String(list[0]));
    }

    for (const broadcast of Object.values(target.broadcasts || {})) {
      if (broadcast) broadcastNames.add(String(broadcast));
    }

    for (const block of Object.values(target.blocks || {})) {
      if (block?.opcode) blockOpcodes.push(block.opcode);
      collectBroadcastFieldNames(block).forEach((name) => broadcastNames.add(name));
    }
  }

  return {
    stageName: stage?.name,
    spriteNames: sprites.map((target) => target.name).filter(Boolean) as string[],
    variableNames: [...variableNames],
    listNames: [...listNames],
    broadcastNames: [...broadcastNames],
    blockOpcodes,
    blockCount: blockOpcodes.length,
    scripts: scripts.map(scriptMeta),
  };
}

export function buildScriptGraph(project: ScratchProject): ScratchScript[] {
  const targets = Array.isArray(project.targets) ? project.targets : [];
  const scripts: ScratchScript[] = [];

  for (const target of targets) {
    const blockMap = target.blocks || {};
    const targetName = target.name || (target.isStage ? 'Stage' : '<unnamed>');
    for (const [id, block] of Object.entries(blockMap)) {
      if (!block?.opcode || !isTopLevelBlock(block)) continue;
      const chain = walkBlockChain(id, blockMap);
      if (!chain.length) continue;
      scripts.push({
        targetName,
        targetIsStage: !!target.isStage,
        hat: chain[0]?.opcode,
        blocks: chain,
        blockMap,
      });
    }
  }

  return scripts;
}

function parseStaticChecks(input: unknown): ScratchStaticCheck[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('judgeConfig.staticChecks must be an array.');
  return input.map((item, index) => parseStaticCheck(item, index));
}

function parseStaticCheck(input: unknown, index: number): ScratchStaticCheck {
  if (!isPlainObject(input)) throw new Error(`staticChecks[${index}] must be an object.`);
  const check = input as Record<string, unknown>;
  const type = String(check.type || '');
  if (!STATIC_CHECK_TYPES.has(type)) throw new Error(`staticChecks[${index}].type is not supported: ${type}`);
  const base = parseBaseCheck(check, type, `staticChecks[${index}]`);

  switch (type) {
    case 'sprite_exists':
      return { ...base, type, sprite: requiredString(check.sprite, `staticChecks[${index}].sprite`) };
    case 'variable_exists':
      return { ...base, type, variable: requiredString(check.variable, `staticChecks[${index}].variable`) };
    case 'list_exists':
      return { ...base, type, list: requiredString(check.list, `staticChecks[${index}].list`) };
    case 'broadcast_exists':
      return { ...base, type, broadcast: requiredString(check.broadcast, `staticChecks[${index}].broadcast`) };
    case 'block_exists':
    case 'forbidden_block_absent':
      return { ...base, type, opcode: requiredString(check.opcode, `staticChecks[${index}].opcode`) };
    case 'block_exists_any':
      return { ...base, type, opcodes: requiredStringArray(check.opcodes, `staticChecks[${index}].opcodes`) };
    case 'min_block_count':
      return {
        ...base,
        type,
        opcode: requiredString(check.opcode, `staticChecks[${index}].opcode`),
        count: nonNegativeNumber(check.count, 1),
      };
    default:
      throw new Error(`Unsupported static check type: ${type}`);
  }
}

function parseStructureChecks(input: unknown): ScratchStructureCheck[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('judgeConfig.structureChecks must be an array.');
  return input.map((item, index) => parseStructureCheck(item, index));
}

function parseStructureCheck(input: unknown, index: number): ScratchStructureCheck {
  if (!isPlainObject(input)) throw new Error(`structureChecks[${index}] must be an object.`);
  const check = input as Record<string, unknown>;
  const type = String(check.type || '');
  if (!STRUCTURE_CHECK_TYPES.has(type)) throw new Error(`structureChecks[${index}].type is not supported: ${type}`);
  const base = parseBaseCheck(check, type, `structureChecks[${index}]`);

  switch (type) {
    case 'target_script_exists':
      return {
        ...base,
        type,
        target: requiredString(check.target, `structureChecks[${index}].target`),
        hat: requiredString(check.hat, `structureChecks[${index}].hat`),
      };
    case 'script_sequence':
      return {
        ...base,
        type,
        target: requiredString(check.target, `structureChecks[${index}].target`),
        hat: optionalString(check.hat),
        sequence: requiredStringArray(check.sequence, `structureChecks[${index}].sequence`),
        mode: parseSequenceMode(check.mode),
      };
    case 'script_module':
      return {
        ...base,
        type,
        target: requiredString(check.target, `structureChecks[${index}].target`),
        hat: optionalString(check.hat),
        requiredOpcodes: requiredStringArray(check.requiredOpcodes, `structureChecks[${index}].requiredOpcodes`),
        ordered: check.ordered === undefined ? true : Boolean(check.ordered),
      };
    case 'block_input_equals':
      return {
        ...base,
        type,
        target: requiredString(check.target, `structureChecks[${index}].target`),
        hat: optionalString(check.hat),
        opcode: requiredString(check.opcode, `structureChecks[${index}].opcode`),
        inputs: requiredComparableMap(check.inputs, `structureChecks[${index}].inputs`),
        occurrence: optionalPositiveInteger(check.occurrence),
      };
    case 'block_field_equals':
      return {
        ...base,
        type,
        target: requiredString(check.target, `structureChecks[${index}].target`),
        hat: optionalString(check.hat),
        opcode: requiredString(check.opcode, `structureChecks[${index}].opcode`),
        fields: requiredComparableMap(check.fields, `structureChecks[${index}].fields`),
        occurrence: optionalPositiveInteger(check.occurrence),
      };
    default:
      throw new Error(`Unsupported structure check type: ${type}`);
  }
}

function parseDynamicChecks(input: unknown): ScratchDynamicCheck[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('judgeConfig.dynamicChecks must be an array.');
  return input.map((item, index) => parseDynamicCheck(item, index));
}

function parseDynamicCheck(input: unknown, index: number): ScratchDynamicCheck {
  if (!isPlainObject(input)) throw new Error(`dynamicChecks[${index}] must be an object.`);
  const check = input as Record<string, unknown>;
  const type = String(check.type || '');
  if (!DYNAMIC_CHECK_TYPES.has(type)) throw new Error(`dynamicChecks[${index}].type is not supported: ${type}`);
  const base = parseBaseCheck(check, type, `dynamicChecks[${index}]`);
  const common = {
    ...base,
    steps: parseDynamicSteps(check.steps, `dynamicChecks[${index}].steps`),
    timeoutMs: optionalNonNegativeNumber(check.timeoutMs),
  };

  switch (type) {
    case 'runtime_runs':
      return { ...common, type };
    case 'variable_value': {
      const operator = optionalString(check.operator);
      if (operator && !DYNAMIC_OPERATORS.has(operator)) {
        throw new Error(`dynamicChecks[${index}].operator is not supported: ${operator}`);
      }
      return {
        ...common,
        type,
        variable: requiredString(check.variable, `dynamicChecks[${index}].variable`),
        target: optionalString(check.target),
        expected: check.expected,
        operator: operator as ScratchDynamicComparison | undefined,
      };
    }
    case 'sprite_position':
      return {
        ...common,
        type,
        target: requiredString(check.target, `dynamicChecks[${index}].target`),
        expected: parsePositionExpected(check.expected, `dynamicChecks[${index}].expected`),
        tolerance: optionalNonNegativeNumber(check.tolerance),
      };
    default:
      throw new Error(`Unsupported dynamic check type: ${type}`);
  }
}

function parseDynamicSteps(input: unknown, name: string): ScratchDynamicStep[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) throw new Error(`${name} must be an array.`);
  return input.map((item, index) => {
    if (!isPlainObject(item)) throw new Error(`${name}[${index}] must be an object.`);
    const step = item as Record<string, unknown>;
    const action = String(step.action || '');
    if (!DYNAMIC_STEP_ACTIONS.has(action)) throw new Error(`${name}[${index}].action is not supported: ${action}`);
    switch (action) {
      case 'green_flag':
        return { action };
      case 'wait':
        return { action, ms: nonNegativeNumber(step.ms, 0) };
      case 'key_down':
      case 'key_up':
        return { action, key: requiredString(step.key, `${name}[${index}].key`) };
      case 'key_press':
        return {
          action,
          key: requiredString(step.key, `${name}[${index}].key`),
          ms: optionalNonNegativeNumber(step.ms),
        };
      default:
        throw new Error(`${name}[${index}].action is not supported: ${action}`);
    }
  });
}

function parseDynamicOptions(input: unknown): ScratchDynamicOptions | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isPlainObject(input)) throw new Error('judgeConfig.dynamicOptions must be an object.');
  return {
    defaultWaitMs: optionalNonNegativeNumber(input.defaultWaitMs),
    keyPressMs: optionalNonNegativeNumber(input.keyPressMs),
    timeoutMs: optionalNonNegativeNumber(input.timeoutMs),
    positionTolerance: optionalNonNegativeNumber(input.positionTolerance),
  };
}

function parseAlgorithmConfig(input: unknown): ScratchAlgorithmConfig | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isPlainObject(input)) throw new Error('judgeConfig.algorithm must be an object.');
  return {
    target: optionalString(input.target),
    inputMode: parseAlgorithmInputMode(input.inputMode, 'judgeConfig.algorithm.inputMode'),
    inputVariable: optionalString(input.inputVariable),
    inputList: optionalString(input.inputList),
    outputMode: parseAlgorithmOutputMode(input.outputMode, 'judgeConfig.algorithm.outputMode'),
    outputVariable: optionalString(input.outputVariable),
    outputList: optionalString(input.outputList),
    inputSplit: parseAlgorithmInputSplit(input.inputSplit, 'judgeConfig.algorithm.inputSplit'),
    outputJoin: typeof input.outputJoin === 'string' ? input.outputJoin : undefined,
    compareMode: parseAlgorithmCompareMode(input.compareMode, 'judgeConfig.algorithm.compareMode'),
    numericTolerance: optionalNonNegativeNumber(input.numericTolerance),
    waitMs: optionalNonNegativeNumber(input.waitMs),
    timeoutMs: optionalNonNegativeNumber(input.timeoutMs),
    cases: parseAlgorithmCases(input.cases),
  };
}

function parseAlgorithmCases(input: unknown): ScratchAlgorithmCase[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('judgeConfig.algorithm.cases must be an array.');
  return input.map((item, index) => parseAlgorithmCase(item, index));
}

function parseAlgorithmCase(input: unknown, index: number): ScratchAlgorithmCase {
  if (!isPlainObject(input)) throw new Error(`algorithm.cases[${index}] must be an object.`);
  const item = input as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(item, 'expectedOutput')) {
    throw new Error(`algorithm.cases[${index}].expectedOutput is required.`);
  }
  return {
    name: stringValue(item.name, `Algorithm case #${index + 1}`),
    input: parseAlgorithmValue(item.input ?? '', `algorithm.cases[${index}].input`),
    expectedOutput: parseAlgorithmValue(item.expectedOutput, `algorithm.cases[${index}].expectedOutput`),
    score: optionalNonNegativeNumber(item.score),
    hint: typeof item.hint === 'string' ? item.hint : undefined,
    hidden: item.hidden === undefined ? undefined : Boolean(item.hidden),
    compareMode: parseAlgorithmCompareMode(item.compareMode, `algorithm.cases[${index}].compareMode`),
  };
}

function parseAlgorithmValue(input: unknown, name: string): ScratchAlgorithmValue {
  if (Array.isArray(input)) {
    return input.map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return item;
      throw new Error(`${name}[${index}] must be a string, number, or boolean.`);
    });
  }
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;
  throw new Error(`${name} must be a string, number, boolean, or array.`);
}

function parseAlgorithmCompareMode(input: unknown, name: string): ScratchAlgorithmCompareMode | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const value = String(input);
  if (ALGORITHM_COMPARE_MODES.has(value)) return value as ScratchAlgorithmCompareMode;
  throw new Error(`${name} is not supported: ${value}`);
}

function parseAlgorithmInputSplit(input: unknown, name: string): ScratchAlgorithmInputSplit | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const value = String(input);
  if (ALGORITHM_INPUT_SPLITS.has(value)) return value as ScratchAlgorithmInputSplit;
  throw new Error(`${name} is not supported: ${value}`);
}

function parseAlgorithmInputMode(input: unknown, name: string): ScratchAlgorithmInputMode | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const value = String(input);
  if (ALGORITHM_INPUT_MODES.has(value)) return value as ScratchAlgorithmInputMode;
  throw new Error(`${name} is not supported: ${value}`);
}

function parseAlgorithmOutputMode(input: unknown, name: string): ScratchAlgorithmOutputMode | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const value = String(input);
  if (ALGORITHM_OUTPUT_MODES.has(value)) return value as ScratchAlgorithmOutputMode;
  throw new Error(`${name} is not supported: ${value}`);
}

function evaluateStaticCheck(check: ScratchStaticCheck, meta: ScratchProjectMeta): ScratchJudgeDetail {
  switch (check.type) {
    case 'sprite_exists':
      return boolDetail(
        check,
        'static',
        meta.spriteNames.includes(check.sprite),
        `Found sprite: ${check.sprite}`,
        `Missing sprite: ${check.sprite}`,
        meta.spriteNames,
      );
    case 'variable_exists':
      return boolDetail(
        check,
        'static',
        meta.variableNames.includes(check.variable),
        `Found variable: ${check.variable}`,
        `Missing variable: ${check.variable}`,
        meta.variableNames,
      );
    case 'list_exists':
      return boolDetail(
        check,
        'static',
        meta.listNames.includes(check.list),
        `Found list: ${check.list}`,
        `Missing list: ${check.list}`,
        meta.listNames,
      );
    case 'broadcast_exists':
      return boolDetail(
        check,
        'static',
        meta.broadcastNames.includes(check.broadcast),
        `Found broadcast: ${check.broadcast}`,
        `Missing broadcast: ${check.broadcast}`,
        meta.broadcastNames,
      );
    case 'block_exists':
      return boolDetail(
        check,
        'static',
        meta.blockOpcodes.includes(check.opcode),
        `Found block: ${check.opcode}`,
        `Missing block: ${check.opcode}`,
        summarizeOpcodes(meta.blockOpcodes),
      );
    case 'block_exists_any': {
      const matched = check.opcodes.filter((opcode) => meta.blockOpcodes.includes(opcode));
      return boolDetail(
        check,
        'static',
        matched.length > 0,
        `Found block: ${matched.join(', ')}`,
        `Missing any block: ${check.opcodes.join(', ')}`,
        matched.length ? matched : summarizeOpcodes(meta.blockOpcodes),
      );
    }
    case 'forbidden_block_absent':
      return boolDetail(
        check,
        'static',
        !meta.blockOpcodes.includes(check.opcode),
        `Forbidden block was not used: ${check.opcode}`,
        `Forbidden block was used: ${check.opcode}`,
        summarizeOpcodes(meta.blockOpcodes),
      );
    case 'min_block_count': {
      const count = meta.blockOpcodes.filter((opcode) => opcode === check.opcode).length;
      return boolDetail(
        check,
        'static',
        count >= check.count,
        `Block ${check.opcode} count is ${count}`,
        `Block ${check.opcode} count is ${count}; expected at least ${check.count}`,
        [`${check.opcode}: ${count}`],
      );
    }
  }
}

function evaluateStructureCheck(check: ScratchStructureCheck, scripts: ScratchScript[]): ScratchJudgeDetail {
  switch (check.type) {
    case 'target_script_exists': {
      const matched = scripts.some((script) => script.targetName === check.target && script.hat === check.hat);
      return boolDetail(
        check,
        'structure',
        matched,
        `Found ${check.hat} script in ${check.target}.`,
        `Missing ${check.hat} script in ${check.target}.`,
        summarizeScripts(scripts, check.target),
        check.target,
      );
    }

    case 'script_sequence': {
      const mode = check.mode || 'ordered_subsequence';
      const matched = scriptsForCheck(scripts, check)
        .find((script) => sequenceMatches(script.blocks.map((block) => block.opcode), check.sequence, mode));
      return boolDetail(
        check,
        'structure',
        !!matched,
        `Found sequence in ${check.target}: ${check.sequence.join(' -> ')}.`,
        `Missing ordered sequence in ${check.target}: ${check.sequence.join(' -> ')}.`,
        matched ? matched.blocks.map((block) => block.opcode) : summarizeScripts(scripts, check.target),
        check.target,
      );
    }

    case 'script_module': {
      const matched = scriptsForCheck(scripts, check).find((script) => {
        const opcodes = script.blocks.map((block) => block.opcode);
        return check.ordered
          ? sequenceMatches(opcodes, check.requiredOpcodes, 'ordered_subsequence')
          : check.requiredOpcodes.every((opcode) => opcodes.includes(opcode));
      });
      return boolDetail(
        check,
        'structure',
        !!matched,
        `Found module in ${check.target}: ${check.requiredOpcodes.join(', ')}.`,
        `Missing module in ${check.target}: ${check.requiredOpcodes.join(', ')}.`,
        matched ? matched.blocks.map((block) => block.opcode) : summarizeScripts(scripts, check.target),
        check.target,
      );
    }

    case 'block_input_equals':
      return evaluateBlockValueCheck(check, scripts, 'inputs');

    case 'block_field_equals':
      return evaluateBlockValueCheck(check, scripts, 'fields');
  }
}

function evaluateBlockValueCheck(
  check: Extract<ScratchStructureCheck, { type: 'block_input_equals' | 'block_field_equals' }>,
  scripts: ScratchScript[],
  valueKind: 'inputs' | 'fields',
): ScratchJudgeDetail {
  const isInputCheck = check.type === 'block_input_equals';
  const candidates = scriptsForCheck(scripts, check)
    .flatMap((script) => script.blocks
      .filter((item) => item.opcode === check.opcode)
      .map((item) => ({ script, item })));
  const occurrence = check.occurrence || 1;
  const candidate = candidates[occurrence - 1];
  const expectedMap: Record<string, string | number | boolean> = isInputCheck ? check.inputs : check.fields;
  const actualMap: Record<string, unknown> = {};

  if (candidate) {
    for (const key of Object.keys(expectedMap)) {
      actualMap[key] = isInputCheck
        ? resolveInputValue(candidate.item.block, key, candidate.script.blockMap)
        : resolveFieldValue(candidate.item.block, key);
    }
  }

  const passed = !!candidate && Object.entries(expectedMap)
    .every(([key, expected]) => comparableEquals(actualMap[key], expected));

  return {
    name: check.name,
    type: check.type,
    category: 'structure',
    target: check.target,
    passed,
    score: passed ? check.score : 0,
    maxScore: check.score,
    message: passed
      ? `Block ${check.opcode} ${valueKind} matched in ${check.target}.`
      : `Block ${check.opcode} ${valueKind} did not match in ${check.target}.`,
    hint: passed ? undefined : check.hint,
    evidence: candidate ? Object.entries(actualMap).map(([key, value]) => `${key}: ${formatValue(value)}`) : summarizeScripts(scripts, check.target),
    actualValue: candidate ? actualMap : undefined,
    expectedValue: expectedMap,
  };
}

function createJudgeResult(
  projectMeta: ScratchProjectMeta,
  config: ScratchJudgeConfig,
  details: ScratchJudgeDetail[],
  mode: ScratchJudgeResult['mode'],
): ScratchJudgeResult {
  const rawScore = details.reduce((sum, detail) => sum + detail.score, 0);
  const rawMaxScore = details.reduce((sum, detail) => sum + detail.maxScore, 0);
  const maxScore = config.totalScore ?? rawMaxScore;
  const totalScore = rawMaxScore > 0 && maxScore !== rawMaxScore
    ? Math.round((rawScore / rawMaxScore) * maxScore)
    : rawScore;

  return {
    mode,
    totalScore,
    maxScore,
    passed: maxScore === 0 ? details.every((detail) => detail.passed) : totalScore >= maxScore,
    details,
    summary: {
      passedChecks: details.filter((detail) => detail.passed).length,
      totalChecks: details.length,
      rawScore,
      rawMaxScore,
    },
    projectMeta,
  };
}

function boolDetail(
  check: ScratchStaticCheck | ScratchStructureCheck,
  category: 'static' | 'structure',
  passed: boolean,
  passedMessage: string,
  failedMessage: string,
  evidence?: string[],
  target?: string,
): ScratchJudgeDetail {
  return {
    name: check.name,
    type: check.type,
    category,
    target,
    passed,
    score: passed ? check.score : 0,
    maxScore: check.score,
    message: passed ? passedMessage : failedMessage,
    hint: passed ? undefined : check.hint,
    evidence,
  };
}

function resultMode(config: ScratchJudgeConfig): ScratchJudgeResult['mode'] {
  const hasStaticLike = (config.staticChecks?.length || 0) > 0 || (config.structureChecks?.length || 0) > 0;
  const hasDynamic = (config.dynamicChecks?.length || 0) > 0;
  if (hasStaticLike && hasDynamic) return 'hybrid';
  if (hasDynamic) return 'dynamic';
  return 'static';
}

function scriptMeta(script: ScratchScript): ScratchScriptMeta {
  return {
    target: script.targetName,
    hat: script.hat,
    opcodes: script.blocks.map((block) => block.opcode),
    blockCount: script.blocks.length,
  };
}

function isTopLevelBlock(block: ScratchBlock): boolean {
  return !!block.opcode && (block.topLevel === true || block.parent === null || block.parent === undefined);
}

function walkBlockChain(startId: string, blockMap: Record<string, ScratchBlock>): ScratchScriptBlock[] {
  const result: ScratchScriptBlock[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = startId;

  while (currentId && !seen.has(currentId) && result.length < 10000) {
    seen.add(currentId);
    const block: ScratchBlock | undefined = blockMap[currentId];
    if (!block?.opcode) break;
    result.push({ id: currentId, opcode: block.opcode, block });
    currentId = typeof block.next === 'string' ? block.next : undefined;
  }

  return result;
}

function scriptsForCheck(scripts: ScratchScript[], check: { target: string; hat?: string }): ScratchScript[] {
  return scripts.filter((script) => script.targetName === check.target && (!check.hat || script.hat === check.hat));
}

function sequenceMatches(opcodes: string[], expected: string[], mode: ScratchSequenceMode): boolean {
  if (!expected.length) return false;
  if (mode === 'exact_prefix') {
    return expected.every((opcode, index) => opcodes[index] === opcode);
  }

  let cursor = 0;
  for (const opcode of opcodes) {
    if (opcode === expected[cursor]) cursor += 1;
    if (cursor >= expected.length) return true;
  }
  return false;
}

function resolveInputValue(block: ScratchBlock, inputName: string, blockMap: Record<string, ScratchBlock>): unknown {
  return resolveInputPart(block.inputs?.[inputName], blockMap);
}

function resolveInputPart(value: unknown, blockMap: Record<string, ScratchBlock>): unknown {
  if (Array.isArray(value)) {
    for (const part of value.slice(1)) {
      const resolved = resolveInputPart(part, blockMap);
      if (resolved !== undefined) return resolved;
    }
    return undefined;
  }

  if (typeof value === 'string') {
    const block = blockMap[value];
    return block ? resolveBlockValue(block) : value;
  }

  return value;
}

function resolveBlockValue(block: ScratchBlock): unknown {
  if (block.opcode === 'math_number' || block.opcode === 'math_integer' || block.opcode === 'math_whole_number') {
    return numberOrString(resolveFieldValue(block, 'NUM'));
  }
  if (block.opcode === 'math_positive_number') return numberOrString(resolveFieldValue(block, 'NUM'));
  if (block.opcode === 'math_angle') return numberOrString(resolveFieldValue(block, 'NUM'));
  if (block.opcode === 'text') return resolveFieldValue(block, 'TEXT');
  if (block.opcode === 'data_variable') return resolveFieldValue(block, 'VARIABLE');

  for (const key of Object.keys(block.fields || {})) {
    const value = resolveFieldValue(block, key);
    if (value !== undefined) return numberOrString(value);
  }
  return undefined;
}

function resolveFieldValue(block: ScratchBlock, fieldName: string): unknown {
  const field = block.fields?.[fieldName];
  if (Array.isArray(field)) return field[0];
  return field;
}

function comparableEquals(actual: unknown, expected: string | number | boolean): boolean {
  if (typeof expected === 'number') {
    const actualNumber = Number(actual);
    return Number.isFinite(actualNumber) && actualNumber === expected;
  }
  if (typeof expected === 'boolean') return Boolean(actual) === expected;
  return String(actual) === String(expected);
}

function readZipEntry(filePath: string, entryName: string, maxBytes: number): Promise<Buffer> {
  return withZip(filePath, (zip) => new Promise<Buffer>((resolve, reject) => {
    let resolved = false;

    zip.readEntry();
    zip.on('entry', (entry: Entry) => {
      if (entry.fileName !== entryName) {
        zip.readEntry();
        return;
      }
      if (entry.uncompressedSize > maxBytes) {
        reject(new Error(`${entryName} exceeds ${maxBytes} bytes.`));
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error || new Error(`Unable to read ${entryName}.`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            stream.destroy(new Error(`${entryName} exceeds ${maxBytes} bytes.`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('error', reject);
        stream.on('end', () => {
          resolved = true;
          resolve(Buffer.concat(chunks));
        });
      });
    });
    zip.on('end', () => {
      if (!resolved) reject(new Error(`${entryName} was not found in the .sb3 archive.`));
    });
    zip.on('error', reject);
  }));
}

function withZip<T>(filePath: string, fn: (zip: ZipFile) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(error || new Error('Unable to read .sb3 archive.'));
        return;
      }
      fn(zip).then(resolve, reject);
    });
  });
}

function collectBroadcastFieldNames(block: ScratchBlock | undefined): string[] {
  const result: string[] = [];
  if (!block) return result;

  for (const field of Object.values(block.fields || {})) {
    if (!Array.isArray(field)) continue;
    const [value] = field;
    const isBroadcastBlock =
      block.opcode === 'event_broadcast' ||
      block.opcode === 'event_broadcastandwait' ||
      block.opcode === 'event_whenbroadcastreceived';
    if (isBroadcastBlock && typeof value === 'string' && value.trim()) result.push(value);
  }

  return result;
}

function summarizeOpcodes(opcodes: string[]): string[] {
  const counts = new Map<string, number>();
  for (const opcode of opcodes) counts.set(opcode, (counts.get(opcode) || 0) + 1);
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 12)
    .map(([opcode, count]) => `${opcode}: ${count}`);
}

function summarizeScripts(scripts: ScratchScript[], target?: string): string[] {
  const filtered = target ? scripts.filter((script) => script.targetName === target) : scripts;
  if (!filtered.length) return target ? [`No scripts found in ${target}`] : ['No scripts found'];
  return filtered.slice(0, 12).map((script) => `${script.targetName}/${script.hat || '<top>'}: ${script.blocks.map((block) => block.opcode).join(' -> ')}`);
}

function parseBaseCheck(check: Record<string, unknown>, type: string, name: string) {
  return {
    name: stringValue(check.name, `${type} #${name.split('[').pop()?.replace(']', '') || '1'}`),
    score: nonNegativeNumber(check.score, 0),
    hint: typeof check.hint === 'string' ? check.hint : undefined,
  };
}

function parseSequenceMode(value: unknown): ScratchSequenceMode | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'ordered_subsequence' || value === 'exact_prefix') return value;
  throw new Error(`sequence mode is not supported: ${String(value)}`);
}

function parsePositionExpected(value: unknown, name: string): { x?: number; y?: number } {
  if (!isPlainObject(value)) throw new Error(`${name} must be an object.`);
  const result = {
    x: optionalNumber(value.x),
    y: optionalNumber(value.y),
  };
  if (result.x === undefined && result.y === undefined) throw new Error(`${name} must contain x or y.`);
  return result;
}

function requiredComparableMap(value: unknown, name: string): Record<string, string | number | boolean> {
  if (!isPlainObject(value)) throw new Error(`${name} must be an object.`);
  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['string', 'number', 'boolean'].includes(typeof item)) {
      throw new Error(`${name}.${key} must be a string, number, or boolean.`);
    }
    result[key] = item as string | number | boolean;
  }
  if (!Object.keys(result).length) throw new Error(`${name} must not be empty.`);
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function requiredStringArray(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${name} must be an array of non-empty strings.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : undefined;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function optionalNonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return nonNegativeNumber(value, undefined);
}

function nonNegativeNumber(value: unknown, fallback: number): number;
function nonNegativeNumber(value: unknown, fallback: undefined): number | undefined;
function nonNegativeNumber(value: unknown, fallback: number | undefined) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

function numberOrString(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
}

function formatValue(value: unknown): string {
  return value === undefined ? '<missing>' : JSON.stringify(value);
}
