import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type {
  ScratchDynamicCheck,
  ScratchDynamicComparison,
  ScratchDynamicOptions,
  ScratchDynamicStep,
  ScratchJudgeDetail,
} from './types';

interface ScratchVariable {
  name?: string;
  type?: string;
  value?: unknown;
}

interface ScratchVmTarget {
  isStage?: boolean;
  x?: number;
  y?: number;
  direction?: number;
  visible?: boolean;
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
  postIOData: (device: string, data: Record<string, unknown>) => void;
  stopAll?: () => void;
  quit?: () => void;
}

type ScratchVmConstructor = new () => ScratchVm;
type ScratchStorageConstructor = new () => unknown;

interface LoadedScratchVm {
  VirtualMachine: ScratchVmConstructor;
  ScratchStorage?: ScratchStorageConstructor;
}

interface DynamicCheckContext {
  vm: ScratchVm;
  options?: ScratchDynamicOptions;
}

const requireFromHere = createRequire(__filename);
let cachedScratchVm: LoadedScratchVm | undefined;
let cachedScratchVmError: string | undefined;

export async function runDynamicChecks(
  filePath: string,
  checks: ScratchDynamicCheck[] = [],
  options?: ScratchDynamicOptions,
): Promise<ScratchJudgeDetail[]> {
  if (!checks.length) return [];

  let loadedVm: LoadedScratchVm;
  try {
    loadedVm = loadScratchVm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return checks.map((check) => dynamicFailure(check, `Scratch VM is unavailable: ${message}`));
  }

  const projectBuffer = await readFile(filePath);
  const details: ScratchJudgeDetail[] = [];
  for (const check of checks) {
    details.push(await runDynamicCheck(projectBuffer, check, loadedVm, options));
  }
  return details;
}

async function runDynamicCheck(
  projectBuffer: Buffer,
  check: ScratchDynamicCheck,
  loadedVm: LoadedScratchVm,
  options?: ScratchDynamicOptions,
): Promise<ScratchJudgeDetail> {
  const steps = check.steps ?? defaultSteps(options);
  const timeoutMs = check.timeoutMs ?? options?.timeoutMs ?? Math.max(5000, estimateStepTimeMs(steps, options) + 2000);
  const vm = new loadedVm.VirtualMachine();

  try {
    return await withTimeout(executeDynamicCheck(vm, projectBuffer, check, loadedVm, options), timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return dynamicFailure(check, message);
  } finally {
    releaseCommonKeys(vm);
    try {
      vm.stopAll?.();
    } catch { /* ignore cleanup errors */ }
    try {
      vm.quit?.();
    } catch { /* ignore cleanup errors */ }
  }
}

async function executeDynamicCheck(
  vm: ScratchVm,
  projectBuffer: Buffer,
  check: ScratchDynamicCheck,
  loadedVm: LoadedScratchVm,
  options?: ScratchDynamicOptions,
): Promise<ScratchJudgeDetail> {
  if (loadedVm.ScratchStorage && vm.attachStorage) {
    vm.attachStorage(new loadedVm.ScratchStorage());
  }

  vm.start();
  vm.clear();
  vm.setCompatibilityMode?.(false);
  vm.setTurboMode?.(false);

  await vm.loadProject(projectBuffer);
  const initialValue = check.type === 'variable_value'
    ? readVariableValue(vm, check.target, check.variable)
    : undefined;

  const steps = check.steps ?? defaultSteps(options);
  await runSteps({ vm, options }, steps);

  if (check.type === 'runtime_runs') {
    return {
      name: check.name,
      type: check.type,
      category: 'dynamic',
      passed: true,
      score: check.score,
      maxScore: check.score,
      message: 'Runtime steps completed.',
      evidence: formatSteps(steps),
    };
  }

  if (check.type === 'variable_value') {
    const actualValue = readVariableValue(vm, check.target, check.variable);
    const operator = check.operator ?? (Object.prototype.hasOwnProperty.call(check, 'expected') ? 'equals' : 'exists');
    const passed = compareValues(operator, actualValue, check.expected, initialValue);
    return {
      name: check.name,
      type: check.type,
      category: 'dynamic',
      target: check.target,
      passed,
      score: passed ? check.score : 0,
      maxScore: check.score,
      message: buildVariableMessage(check.variable, operator, actualValue, check.expected, initialValue, passed),
      hint: passed ? undefined : check.hint,
      evidence: formatSteps(steps),
      actualValue,
      expectedValue: check.expected,
    };
  }

  const target = findTarget(vm, check.target);
  const expected = check.expected;
  const actual = target
    ? { x: numberOrUndefined(target.x), y: numberOrUndefined(target.y) }
    : undefined;
  const tolerance = check.tolerance ?? options?.positionTolerance ?? 3;
  const passed = !!actual && positionMatches(actual, expected, tolerance);

  return {
    name: check.name,
    type: check.type,
    category: 'dynamic',
    target: check.target,
    passed,
    score: passed ? check.score : 0,
    maxScore: check.score,
    message: buildPositionMessage(check.target, actual, expected, tolerance, passed),
    hint: passed ? undefined : check.hint,
    evidence: formatSteps(steps),
    actualValue: actual,
    expectedValue: expected,
  };
}

async function runSteps(context: DynamicCheckContext, steps: ScratchDynamicStep[]): Promise<void> {
  for (const step of steps) {
    switch (step.action) {
      case 'green_flag':
        context.vm.greenFlag();
        break;
      case 'wait':
        await delay(clampWaitMs(step.ms));
        break;
      case 'key_down':
        context.vm.postIOData('keyboard', {
          key: normalizeDomKey(step.key),
          isDown: true,
        });
        break;
      case 'key_up':
        context.vm.postIOData('keyboard', {
          key: normalizeDomKey(step.key),
          isDown: false,
        });
        break;
      case 'key_press': {
        const key = normalizeDomKey(step.key);
        context.vm.postIOData('keyboard', { key, isDown: true });
        await delay(clampWaitMs(step.ms ?? context.options?.keyPressMs ?? 100));
        context.vm.postIOData('keyboard', { key, isDown: false });
        break;
      }
    }
  }
}

function defaultSteps(options?: ScratchDynamicOptions): ScratchDynamicStep[] {
  return [
    { action: 'green_flag' },
    { action: 'wait', ms: options?.defaultWaitMs ?? 1000 },
  ];
}

function readVariableValue(vm: ScratchVm, targetName: string | undefined, variableName: string): unknown {
  const target = findVariableTarget(vm, targetName, variableName);
  if (!target) return undefined;

  const scopedVariable = target.lookupVariableByNameAndType?.(variableName, '');
  if (scopedVariable) return scopedVariable.value;

  for (const variable of Object.values(target.variables ?? {})) {
    if (variable?.name === variableName && (variable.type ?? '') === '') return variable.value;
  }
  return undefined;
}

function findVariableTarget(
  vm: ScratchVm,
  targetName: string | undefined,
  variableName: string,
): ScratchVmTarget | undefined {
  if (targetName) return findTarget(vm, targetName);
  return (vm.runtime?.targets ?? []).find((target) => hasScalarVariable(target, variableName));
}

function findTarget(vm: ScratchVm, targetName: string): ScratchVmTarget | undefined {
  if (isStageName(targetName)) {
    return vm.runtime?.getTargetForStage?.()
      ?? (vm.runtime?.targets ?? []).find((target) => target.isStage || isStageName(getTargetName(target) || ''));
  }

  return vm.runtime?.getSpriteTargetByName?.(targetName)
    ?? (vm.runtime?.targets ?? []).find((target) => getTargetName(target) === targetName);
}

function hasScalarVariable(target: ScratchVmTarget | undefined, variableName: string): target is ScratchVmTarget {
  if (!target) return false;
  return Object.values(target.variables ?? {}).some(
    (variable) => variable?.name === variableName && (variable.type ?? '') === '',
  );
}

function getTargetName(target: ScratchVmTarget): string | undefined {
  return target.getName?.() ?? target.sprite?.name;
}

function isStageName(targetName: string): boolean {
  const normalized = targetName.trim().toLowerCase();
  return normalized === 'stage' || normalized === '_stage_';
}

function compareValues(
  operator: ScratchDynamicComparison,
  actual: unknown,
  expected: unknown,
  initial: unknown,
): boolean {
  switch (operator) {
    case 'exists':
      return actual !== undefined;
    case 'equals':
      return valuesEqual(actual, expected);
    case 'not_equals':
      return !valuesEqual(actual, expected);
    case 'greater_than':
      return numericCompare(actual, expected, (left, right) => left > right);
    case 'greater_or_equal':
      return numericCompare(actual, expected, (left, right) => left >= right);
    case 'less_than':
      return numericCompare(actual, expected, (left, right) => left < right);
    case 'less_or_equal':
      return numericCompare(actual, expected, (left, right) => left <= right);
    case 'changed':
      return !valuesEqual(actual, initial);
  }
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') {
    const actualNumber = Number(actual);
    return Number.isFinite(actualNumber) && actualNumber === expected;
  }
  return String(actual) === String(expected);
}

function numericCompare(actual: unknown, expected: unknown, compare: (left: number, right: number) => boolean): boolean {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && compare(actualNumber, expectedNumber);
}

function positionMatches(
  actual: { x?: number; y?: number },
  expected: { x?: number; y?: number },
  tolerance: number,
): boolean {
  if (expected.x === undefined && expected.y === undefined) return false;
  if (expected.x !== undefined && (actual.x === undefined || Math.abs(actual.x - expected.x) > tolerance)) return false;
  if (expected.y !== undefined && (actual.y === undefined || Math.abs(actual.y - expected.y) > tolerance)) return false;
  return true;
}

function buildVariableMessage(
  variableName: string,
  operator: ScratchDynamicComparison,
  actual: unknown,
  expected: unknown,
  initial: unknown,
  passed: boolean,
): string {
  const status = passed ? 'passed' : 'failed';
  if (operator === 'changed') {
    return `Variable ${variableName} ${status}: initial=${formatValue(initial)}, actual=${formatValue(actual)}.`;
  }
  if (operator === 'exists') {
    return `Variable ${variableName} ${status}: actual=${formatValue(actual)}.`;
  }
  return `Variable ${variableName} ${status}: actual=${formatValue(actual)}, expected ${operator} ${formatValue(expected)}.`;
}

function buildPositionMessage(
  targetName: string,
  actual: { x?: number; y?: number } | undefined,
  expected: { x?: number; y?: number },
  tolerance: number,
  passed: boolean,
): string {
  const status = passed ? 'passed' : 'failed';
  if (!actual) return `Sprite ${targetName} ${status}: target was not found.`;
  return `Sprite ${targetName} position ${status}: actual=(${formatCoord(actual.x)}, ${formatCoord(actual.y)}), expected=(${formatCoord(expected.x)}, ${formatCoord(expected.y)}), tolerance=${tolerance}.`;
}

function dynamicFailure(check: ScratchDynamicCheck, message: string): ScratchJudgeDetail {
  return {
    name: check.name,
    type: check.type,
    category: 'dynamic',
    target: 'target' in check ? check.target : undefined,
    passed: false,
    score: 0,
    maxScore: check.score,
    message,
    hint: check.hint,
  };
}

function formatValue(value: unknown): string {
  return value === undefined ? '<missing>' : JSON.stringify(value);
}

function formatCoord(value: number | undefined): string {
  return value === undefined ? '*' : String(Math.round(value * 1000) / 1000);
}

function formatSteps(steps: ScratchDynamicStep[]): string[] {
  return steps.map((step) => {
    switch (step.action) {
      case 'green_flag':
        return 'green_flag';
      case 'wait':
        return `wait ${step.ms}ms`;
      case 'key_down':
        return `key_down ${step.key}`;
      case 'key_up':
        return `key_up ${step.key}`;
      case 'key_press':
        return `key_press ${step.key} ${step.ms ?? 100}ms`;
    }
  });
}

function estimateStepTimeMs(steps: ScratchDynamicStep[], options?: ScratchDynamicOptions): number {
  return steps.reduce((sum, step) => {
    if (step.action === 'wait') return sum + clampWaitMs(step.ms);
    if (step.action === 'key_press') return sum + clampWaitMs(step.ms ?? options?.keyPressMs ?? 100);
    return sum;
  }, 0);
}

function normalizeDomKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  switch (normalized) {
    case 'space':
    case 'spacebar':
      return ' ';
    case 'left':
    case 'left arrow':
    case 'arrowleft':
      return 'ArrowLeft';
    case 'up':
    case 'up arrow':
    case 'arrowup':
      return 'ArrowUp';
    case 'right':
    case 'right arrow':
    case 'arrowright':
      return 'ArrowRight';
    case 'down':
    case 'down arrow':
    case 'arrowdown':
      return 'ArrowDown';
    case 'enter':
    case 'return':
      return 'Enter';
    default:
      return key.length === 1 ? key : normalized;
  }
}

function releaseCommonKeys(vm: ScratchVm): void {
  for (const key of [' ', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Enter']) {
    try {
      vm.postIOData('keyboard', { key, isDown: false });
    } catch { /* ignore cleanup errors */ }
  }
}

function clampWaitMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(ms, 10000);
}

function numberOrUndefined(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
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
      reject(new Error(`Dynamic check timed out after ${timeoutMs}ms.`));
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
