import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type {
  ScratchAlgorithmCase,
  ScratchAlgorithmCompareMode,
  ScratchAlgorithmConfig,
  ScratchAlgorithmInputSplit,
  ScratchAlgorithmValue,
  ScratchJudgeDetail,
} from './types';

interface ScratchVariable {
  name?: string;
  type?: string;
  value?: unknown;
}

interface ScratchVmTarget {
  isStage?: boolean;
  variables?: Record<string, ScratchVariable>;
  getName?: () => string;
  lookupVariableByNameAndType?: (name: string, type: string, skipStage?: boolean) => ScratchVariable | undefined;
  sprite?: {
    name?: string;
  };
}

interface ScratchVmRuntime {
  targets?: ScratchVmTarget[];
  getTargetForStage?: () => ScratchVmTarget | undefined;
  getSpriteTargetByName?: (name: string) => ScratchVmTarget | undefined;
}

interface ScratchVm {
  runtime?: ScratchVmRuntime;
  attachStorage?: (storage: unknown) => void;
  start: () => void;
  clear: () => void;
  setCompatibilityMode?: (enabled: boolean) => void;
  setTurboMode?: (enabled: boolean) => void;
  loadProject: (input: Buffer | ArrayBuffer | object | string) => Promise<unknown>;
  greenFlag: () => void;
  stopAll?: () => void;
  quit?: () => void;
}

type ScratchVmConstructor = new () => ScratchVm;
type ScratchStorageConstructor = new () => unknown;

interface LoadedScratchVm {
  VirtualMachine: ScratchVmConstructor;
  ScratchStorage?: ScratchStorageConstructor;
}

interface AlgorithmCaseContext {
  vm: ScratchVm;
  config: ScratchAlgorithmConfig;
  caseConfig: ScratchAlgorithmCase;
  loadedVm: LoadedScratchVm;
  projectBuffer: Buffer;
}

const requireFromHere = createRequire(__filename);
let cachedScratchVm: LoadedScratchVm | undefined;
let cachedScratchVmError: string | undefined;

export async function runAlgorithmCases(
  filePath: string,
  config: ScratchAlgorithmConfig | undefined,
): Promise<ScratchJudgeDetail[]> {
  const cases = config?.cases || [];
  if (!cases.length) return [];

  let loadedVm: LoadedScratchVm;
  try {
    loadedVm = loadScratchVm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cases.map((caseConfig) => algorithmFailure(caseConfig, `Scratch VM is unavailable: ${message}`));
  }

  const projectBuffer = await readFile(filePath);
  const details: ScratchJudgeDetail[] = [];
  for (const caseConfig of cases) {
    const vm = new loadedVm.VirtualMachine();
    const waitMs = normalizeWaitMs(config?.waitMs ?? 1000);
    const timeoutMs = normalizeTimeoutMs(config?.timeoutMs, waitMs);
    try {
      details.push(await withTimeout(runAlgorithmCase({
        vm,
        config: config || {},
        caseConfig,
        loadedVm,
        projectBuffer,
      }), timeoutMs));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      details.push(algorithmFailure(caseConfig, message));
    } finally {
      try {
        vm.stopAll?.();
      } catch { /* ignore cleanup errors */ }
      try {
        vm.quit?.();
      } catch { /* ignore cleanup errors */ }
    }
  }
  return details;
}

async function runAlgorithmCase(context: AlgorithmCaseContext): Promise<ScratchJudgeDetail> {
  const { vm, config, caseConfig, loadedVm, projectBuffer } = context;
  if (loadedVm.ScratchStorage && vm.attachStorage) {
    vm.attachStorage(new loadedVm.ScratchStorage());
  }

  vm.start();
  vm.clear();
  vm.setCompatibilityMode?.(false);
  vm.setTurboMode?.(false);
  await vm.loadProject(projectBuffer);

  const inputResult = writeInput(vm, config, caseConfig.input);
  if (!inputResult.ok) {
    return algorithmFailure(caseConfig, inputResult.message, {
      maxScore: caseScore(caseConfig),
    });
  }

  vm.greenFlag();
  await delay(normalizeWaitMs(config.waitMs ?? 1000));

  const outputResult = readOutput(vm, config);
  if (!outputResult.ok) {
    return algorithmFailure(caseConfig, outputResult.message, {
      maxScore: caseScore(caseConfig),
    });
  }

  const compareMode = caseConfig.compareMode || config.compareMode || 'trim';
  const comparison = compareAlgorithmOutput(
    outputResult.value,
    caseConfig.expectedOutput,
    compareMode,
    config,
  );
  const score = caseScore(caseConfig);
  const hidden = !!caseConfig.hidden;

  return {
    name: caseConfig.name,
    type: 'algorithm_case',
    category: 'algorithm',
    target: config.target,
    passed: comparison.passed,
    score: comparison.passed ? score : 0,
    maxScore: score,
    message: comparison.passed
      ? `Algorithm case passed using ${compareMode} comparison.`
      : hidden
        ? 'Algorithm case failed.'
        : `Algorithm case failed using ${compareMode} comparison.`,
    hint: comparison.passed ? undefined : caseConfig.hint,
    evidence: hidden ? undefined : [
      `input: ${formatValue(caseConfig.input)}`,
      `actual: ${formatValue(outputResult.value)}`,
      `expected: ${formatValue(caseConfig.expectedOutput)}`,
    ],
    actualValue: hidden ? undefined : outputResult.value,
    expectedValue: hidden ? undefined : caseConfig.expectedOutput,
  };
}

function writeInput(
  vm: ScratchVm,
  config: ScratchAlgorithmConfig,
  input: ScratchAlgorithmValue,
): { ok: true } | { ok: false; message: string } {
  const targetName = config.target;
  const inputVariableName = config.inputVariable || 'input';
  const inputListName = config.inputList || 'input';
  const scalarVariable = findVariable(vm, targetName, inputVariableName, '');
  const listVariable = findVariable(vm, targetName, inputListName, 'list');
  const inputIsEmpty = isEmptyAlgorithmValue(input);

  if (!scalarVariable && !listVariable) {
    return inputIsEmpty
      ? { ok: true }
      : { ok: false, message: `Input variable/list was not found: ${inputVariableName}.` };
  }

  if (scalarVariable) scalarVariable.value = algorithmValueToText(input);
  if (listVariable) listVariable.value = algorithmValueToList(input, config.inputSplit || 'lines');
  return { ok: true };
}

function readOutput(
  vm: ScratchVm,
  config: ScratchAlgorithmConfig,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const targetName = config.target;
  const outputVariableName = config.outputVariable || 'output';
  const outputListName = config.outputList || 'output';
  const scalarVariable = findVariable(vm, targetName, outputVariableName, '');
  if (scalarVariable) return { ok: true, value: scalarVariable.value };

  const listVariable = findVariable(vm, targetName, outputListName, 'list');
  if (listVariable) {
    const value = Array.isArray(listVariable.value)
      ? listVariable.value.join(config.outputJoin ?? '\n')
      : listVariable.value;
    return { ok: true, value };
  }

  return {
    ok: false,
    message: `Output variable/list was not found: ${outputVariableName}.`,
  };
}

function findVariable(
  vm: ScratchVm,
  targetName: string | undefined,
  variableName: string,
  type: '' | 'list',
): ScratchVariable | undefined {
  const targets = targetName ? [findTarget(vm, targetName)].filter(Boolean) as ScratchVmTarget[] : vm.runtime?.targets || [];
  for (const target of targets) {
    const direct = target.lookupVariableByNameAndType?.(variableName, type);
    if (direct) return direct;
    for (const variable of Object.values(target.variables || {})) {
      if (variable?.name === variableName && (variable.type || '') === type) return variable;
    }
  }
  return undefined;
}

function findTarget(vm: ScratchVm, targetName: string): ScratchVmTarget | undefined {
  if (isStageName(targetName)) {
    return vm.runtime?.getTargetForStage?.()
      ?? (vm.runtime?.targets || []).find((target) => target.isStage || isStageName(getTargetName(target) || ''));
  }

  return vm.runtime?.getSpriteTargetByName?.(targetName)
    ?? (vm.runtime?.targets || []).find((target) => getTargetName(target) === targetName);
}

function compareAlgorithmOutput(
  actual: unknown,
  expected: ScratchAlgorithmValue,
  compareMode: ScratchAlgorithmCompareMode,
  config: ScratchAlgorithmConfig,
): { passed: boolean } {
  const actualText = algorithmValueToText(actual as ScratchAlgorithmValue, config.outputJoin);
  const expectedText = algorithmValueToText(expected, config.outputJoin);

  switch (compareMode) {
    case 'exact':
      return { passed: normalizeNewlines(actualText) === normalizeNewlines(expectedText) };
    case 'tokens':
      return { passed: tokenList(actualText).join('\n') === tokenList(expectedText).join('\n') };
    case 'number': {
      const actualNumber = Number(actualText.trim());
      const expectedNumber = Number(expectedText.trim());
      const tolerance = config.numericTolerance ?? 1e-9;
      return {
        passed: Number.isFinite(actualNumber)
          && Number.isFinite(expectedNumber)
          && Math.abs(actualNumber - expectedNumber) <= tolerance,
      };
    }
    case 'trim':
    default:
      return { passed: normalizeNewlines(actualText).trim() === normalizeNewlines(expectedText).trim() };
  }
}

function algorithmValueToText(value: ScratchAlgorithmValue, joiner = '\n'): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(joiner);
  return value === undefined || value === null ? '' : String(value);
}

function algorithmValueToList(value: ScratchAlgorithmValue, split: ScratchAlgorithmInputSplit): Array<string | number | boolean> {
  if (Array.isArray(value)) return value;
  const text = algorithmValueToText(value);
  switch (split) {
    case 'none':
      return [text];
    case 'tokens':
      return text.trim() ? text.trim().split(/\s+/) : [];
    case 'lines':
    default:
      return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }
}

function algorithmFailure(
  caseConfig: ScratchAlgorithmCase,
  message: string,
  options: { maxScore?: number } = {},
): ScratchJudgeDetail {
  const hidden = !!caseConfig.hidden;
  return {
    name: caseConfig.name,
    type: 'algorithm_case',
    category: 'algorithm',
    passed: false,
    score: 0,
    maxScore: options.maxScore ?? caseScore(caseConfig),
    message: hidden ? 'Algorithm case failed.' : message,
    hint: hidden ? undefined : caseConfig.hint,
  };
}

function caseScore(caseConfig: ScratchAlgorithmCase) {
  return Number.isFinite(caseConfig.score) && Number(caseConfig.score) >= 0 ? Number(caseConfig.score) : 1;
}

function isEmptyAlgorithmValue(value: ScratchAlgorithmValue) {
  if (Array.isArray(value)) return value.length === 0;
  return value === '' || value === undefined || value === null;
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function tokenList(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function getTargetName(target: ScratchVmTarget): string | undefined {
  return target.getName?.() ?? target.sprite?.name;
}

function isStageName(targetName: string): boolean {
  const normalized = targetName.trim().toLowerCase();
  return normalized === 'stage' || normalized === '_stage_';
}

function normalizeWaitMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 10000);
}

function normalizeTimeoutMs(value: number | undefined, waitMs: number): number {
  if (Number.isFinite(value) && Number(value) > 0) return Number(value);
  return Math.max(5000, waitMs + 2000);
}

function formatValue(value: unknown) {
  return value === undefined ? '<missing>' : JSON.stringify(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Algorithm case timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function loadScratchVm(): LoadedScratchVm {
  if (cachedScratchVm) return cachedScratchVm;
  if (cachedScratchVmError) throw new Error(cachedScratchVmError);

  const errors: string[] = [];
  const override = process.env.SCRATCH_VM_MODULE?.trim();
  const candidates = [
    override,
    'scratch-vm',
    '@scratch/scratch-vm',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const resolved = requireFromHere.resolve(candidate);
      const moduleRequire = createRequire(resolved);
      const vmModule = moduleRequire(resolved) as unknown;
      const VirtualMachine = getVirtualMachineConstructor(vmModule);
      const ScratchStorage = loadScratchStorage(moduleRequire);
      cachedScratchVm = { VirtualMachine, ScratchStorage };
      return cachedScratchVm;
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  cachedScratchVmError = `Tried ${candidates.join(', ')}. ${errors.join(' | ')}`;
  throw new Error(cachedScratchVmError);
}

function getVirtualMachineConstructor(vmModule: unknown): ScratchVmConstructor {
  if (typeof vmModule === 'function') return vmModule as ScratchVmConstructor;
  if (typeof vmModule === 'object' && vmModule !== null && 'default' in vmModule) {
    const defaultExport = (vmModule as { default?: unknown }).default;
    if (typeof defaultExport === 'function') return defaultExport as ScratchVmConstructor;
  }
  throw new Error('scratch-vm module did not export a VirtualMachine constructor.');
}

function loadScratchStorage(moduleRequire: NodeJS.Require): ScratchStorageConstructor | undefined {
  try {
    const storageModule = moduleRequire('scratch-storage') as { ScratchStorage?: unknown; default?: unknown };
    if (typeof storageModule.ScratchStorage === 'function') return storageModule.ScratchStorage as ScratchStorageConstructor;
    if (typeof storageModule.default === 'function') return storageModule.default as ScratchStorageConstructor;
    return undefined;
  } catch {
    return undefined;
  }
}
