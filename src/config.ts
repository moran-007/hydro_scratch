import type { PluginConfig, ScratchProblemConfig } from './types';
import { defaultJudgeConfig, normalizeJudgeConfig } from './static-judge';

export const DEFAULT_DISABLED_EXTENSIONS = [
  'videoSensing',
  'text2speech',
  'translate',
  'cloudVariables',
  'externalDevice',
  'thirdPartyNetwork',
];

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  enabledDomains: [],
  storagePrefix: 'scratch',
  maxProjectSizeMB: 20,
  maxUnpackedSizeMB: 80,
  maxAssetSizeMB: 10,
  maxAssetCount: 300,
  maxProjectJsonSizeMB: 10,
  maxScore: 100,
  previewPlayerUrl: '',
  scratchEditorUrl: '/scratch-editor/index.html',
  scratchEditorOrigin: '',
  scratchAssetHost: '/scratch-assets',
};

export function normalizeEnabledDomains(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];
  return [...new Set(items
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean))];
}

export function pluginEnabledForDomain(
  pluginConfig: Pick<PluginConfig, 'enabledDomains'>,
  domainId: unknown,
): boolean {
  const enabledDomains = normalizeEnabledDomains(pluginConfig.enabledDomains);
  if (!enabledDomains.length) return true;
  const normalizedDomainId = String(domainId || '').trim().toLowerCase();
  return Boolean(normalizedDomainId) && enabledDomains.includes(normalizedDomainId);
}

export function pluginEnabledForHandlerDomain(
  pluginConfig: Pick<PluginConfig, 'enabledDomains'>,
  handler: any,
): boolean {
  const domainId = handler?.args?.domainId
    || handler?.UiContext?.domainId
    || handler?.domain?._id
    || handler?.domain?.docId;
  return pluginEnabledForDomain(pluginConfig, domainId);
}

export function defaultProblemConfig(domainId: string, problemId: number, pluginConfig: PluginConfig): ScratchProblemConfig {
  const now = new Date();
  return {
    domainId,
    problemId,
    enabled: false,
    problemKind: 'task',
    submitMode: 'upload',
    judgeMode: 'manual',
    allowDownloadTemplate: true,
    maxProjectSizeMB: pluginConfig.maxProjectSizeMB,
    maxUnpackedSizeMB: pluginConfig.maxUnpackedSizeMB,
    maxAssetSizeMB: pluginConfig.maxAssetSizeMB,
    maxAssetCount: pluginConfig.maxAssetCount,
    maxProjectJsonSizeMB: pluginConfig.maxProjectJsonSizeMB,
    disabledScratchExtensions: DEFAULT_DISABLED_EXTENSIONS,
    judgeConfig: defaultJudgeConfig(pluginConfig.maxScore),
    maxScore: pluginConfig.maxScore,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeProblemConfig(
  domainId: string,
  problemId: number,
  pluginConfig: PluginConfig,
  input: Partial<ScratchProblemConfig> = {},
): ScratchProblemConfig {
  const base = defaultProblemConfig(domainId, problemId, pluginConfig);
  const maxScore = positiveNumber(input.maxScore, base.maxScore);
  return {
    ...base,
    ...input,
    domainId,
    problemId,
    enabled: Boolean(input.enabled ?? base.enabled),
    problemKind: input.problemKind === 'algorithm' ? 'algorithm' : base.problemKind,
    submitMode: ['upload', 'editor', 'both'].includes(input.submitMode || '') ? input.submitMode! : base.submitMode,
    judgeMode: ['manual', 'static', 'dynamic', 'hybrid'].includes(input.judgeMode || '') ? input.judgeMode! : base.judgeMode,
    allowDownloadTemplate: Boolean(input.allowDownloadTemplate ?? base.allowDownloadTemplate),
    maxProjectSizeMB: positiveNumber(input.maxProjectSizeMB, base.maxProjectSizeMB),
    maxUnpackedSizeMB: positiveNumber(input.maxUnpackedSizeMB, base.maxUnpackedSizeMB),
    maxAssetSizeMB: positiveNumber(input.maxAssetSizeMB, base.maxAssetSizeMB),
    maxAssetCount: positiveInteger(input.maxAssetCount, base.maxAssetCount),
    maxProjectJsonSizeMB: positiveNumber(input.maxProjectJsonSizeMB, base.maxProjectJsonSizeMB),
    disabledScratchExtensions: Array.isArray(input.disabledScratchExtensions)
      ? input.disabledScratchExtensions.filter((item) => typeof item === 'string' && item)
      : base.disabledScratchExtensions,
    judgeConfig: normalizeJudgeConfig(input.judgeConfig, maxScore),
    maxScore,
    createdAt: input.createdAt || base.createdAt,
    updatedAt: new Date(),
  };
}

function positiveNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function positiveInteger(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : fallback;
}
