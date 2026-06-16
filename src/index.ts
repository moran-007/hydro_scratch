import { PERM, Schema, definePlugin } from 'hydrooj';
import { DEFAULT_PLUGIN_CONFIG, normalizeEnabledDomains, pluginEnabledForHandlerDomain } from './config';
import { applyHandlers } from './http';
import { ScratchModel } from './model';
import type { PluginConfig } from './types';

export * from './errors';
export * from './package';
export * from './sb3';
export * from './static-judge';
export * from './types';

function normalizePluginConfig(config: Partial<PluginConfig> = {}): PluginConfig {
  return {
    ...DEFAULT_PLUGIN_CONFIG,
    ...config,
    enabledDomains: normalizeEnabledDomains(config.enabledDomains),
    storagePrefix: (config.storagePrefix || DEFAULT_PLUGIN_CONFIG.storagePrefix).replace(/^\/+|\/+$/g, ''),
    maxProjectSizeMB: Number(config.maxProjectSizeMB || DEFAULT_PLUGIN_CONFIG.maxProjectSizeMB),
    maxUnpackedSizeMB: Number(config.maxUnpackedSizeMB || DEFAULT_PLUGIN_CONFIG.maxUnpackedSizeMB),
    maxAssetSizeMB: Number(config.maxAssetSizeMB || DEFAULT_PLUGIN_CONFIG.maxAssetSizeMB),
    maxAssetCount: Number(config.maxAssetCount || DEFAULT_PLUGIN_CONFIG.maxAssetCount),
    maxProjectJsonSizeMB: Number(config.maxProjectJsonSizeMB || DEFAULT_PLUGIN_CONFIG.maxProjectJsonSizeMB),
    maxScore: Number(config.maxScore || DEFAULT_PLUGIN_CONFIG.maxScore),
    previewPlayerUrl: config.previewPlayerUrl ?? DEFAULT_PLUGIN_CONFIG.previewPlayerUrl,
    scratchEditorUrl: config.scratchEditorUrl ?? DEFAULT_PLUGIN_CONFIG.scratchEditorUrl,
    scratchEditorOrigin: config.scratchEditorOrigin ?? DEFAULT_PLUGIN_CONFIG.scratchEditorOrigin,
    scratchAssetHost: (config.scratchAssetHost || DEFAULT_PLUGIN_CONFIG.scratchAssetHost).replace(/\/+$/g, ''),
  };
}

function registerScratchLanguage() {
  const langs = (global as any).Hydro?.model?.setting?.langs;
  if (!langs || langs.scratch3) return;
  langs.scratch3 = {
    key: 'scratch3',
    display: 'Scratch',
    highlight: 'text',
    monaco: 'plaintext',
    code_file: 'project.sb3',
    execute: '/w/foo',
    time_limit_rate: 1,
    memory_limit_rate: 1,
    hidden: true,
    disabled: false,
    isBinary: true,
    remote: false,
    validAs: {},
  };
}

function canOpenScratchReviewQueue(pluginConfig: PluginConfig, handler: any) {
  return pluginEnabledForHandlerDomain(pluginConfig, handler)
    && Boolean(
      handler?.user?.hasPerm?.(PERM.PERM_EDIT_PROBLEM)
      || handler?.user?.hasPerm?.(PERM.PERM_EDIT_PROBLEM_SELF),
    );
}

export default definePlugin<PluginConfig>({
  name: 'hydro-plugin-scratch',
  schema: Schema.object({
    enabledDomains: Schema.array(Schema.string()).default(DEFAULT_PLUGIN_CONFIG.enabledDomains).description('启用 Scratch 插件的域 ID。留空表示所有域都启用。'),
    storagePrefix: Schema.string().default(DEFAULT_PLUGIN_CONFIG.storagePrefix).description('Scratch 作品在 Hydro 存储中的路径前缀'),
    maxProjectSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxProjectSizeMB).min(1).description('.sb3 作品文件大小上限 MB'),
    maxUnpackedSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxUnpackedSizeMB).min(1).description('.sb3 解压后总大小上限 MB'),
    maxAssetSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxAssetSizeMB).min(1).description('单个素材文件大小上限 MB'),
    maxAssetCount: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxAssetCount).min(1).description('素材数量上限'),
    maxProjectJsonSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxProjectJsonSizeMB).min(1).description('project.json 大小上限 MB'),
    maxScore: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxScore).min(1).description('默认满分'),
    previewPlayerUrl: Schema.string().default(DEFAULT_PLUGIN_CONFIG.previewPlayerUrl).description('可选外部预览播放器地址。留空时使用内置 Scratch 编辑器预览。'),
    scratchEditorUrl: Schema.string().default(DEFAULT_PLUGIN_CONFIG.scratchEditorUrl).description('内嵌 Scratch 编辑器地址'),
    scratchEditorOrigin: Schema.string().default(DEFAULT_PLUGIN_CONFIG.scratchEditorOrigin).description('允许接收 postMessage 的 Scratch 编辑器来源'),
    scratchAssetHost: Schema.string().default(DEFAULT_PLUGIN_CONFIG.scratchAssetHost).description('传给内嵌编辑器的 Scratch 素材地址'),
  }).description('Scratch 自动测评插件'),
  async apply(ctx, rawConfig) {
    const config = normalizePluginConfig(rawConfig);
    registerScratchLanguage();
    applyHandlers(ctx, config);
    const enabledDomainChecker = (handler: any) => pluginEnabledForHandlerDomain(config, handler);
    const reviewQueueChecker = (handler: any) => canOpenScratchReviewQueue(config, handler);
    ctx.injectUI?.(
      'ProblemAdd',
      'scratch_problem_create',
      { icon: 'edit', text: 'Scratch 题目' },
      enabledDomainChecker,
    );
    ctx.injectUI?.('Nav', 'scratch_review_queue', { prefix: 'scratch_review_queue' }, reviewQueueChecker);
    ctx.injectUI?.('DomainManage', 'scratch_review_queue', { family: 'Content', icon: 'check' }, reviewQueueChecker);
    ctx.i18n?.load?.('zh', {
      'Scratch Problem': 'Scratch 题目',
      'Create Scratch Problem': '创建 Scratch 题目',
      'Edit Scratch Problem': '编辑 Scratch 题目',
      'Scratch Settings': 'Scratch 设置',
      'Validation Limits': '校验限制',
      'Scratch Preview': 'Scratch 预览',
      'Scratch Submissions': 'Scratch 提交',
      'Manual Score': '手动评分',
      'Scratch Editor': 'Scratch 编辑器',
      'Preview / Score': '预览 / 评分',
      'No Scratch submissions yet.': '暂无 Scratch 提交。',
      'Loading problem statement...': '正在加载题面...',
      'Floating Window': '浮动窗口',
      'Dock Editor': '停靠编辑器',
      'Open Score Page': '打开评分页',
      'Back to Scratch submissions': '返回 Scratch 提交列表',
      'Direct scoring URL': '直接评分地址',
      scratch_review_queue: 'Scratch 批改',
    });
    ctx.i18n?.load?.('en', {
      'Scratch Problem': 'Scratch Problem',
      'Create Scratch Problem': 'Create Scratch Problem',
      'Edit Scratch Problem': 'Edit Scratch Problem',
      'Scratch Settings': 'Scratch Settings',
      'Validation Limits': 'Validation Limits',
      'Scratch Preview': 'Scratch Preview',
      'Scratch Submissions': 'Scratch Submissions',
      'Manual Score': 'Manual Score',
      'Scratch Editor': 'Scratch Editor',
      'Preview / Score': 'Preview / Score',
      'No Scratch submissions yet.': 'No Scratch submissions yet.',
      'Loading problem statement...': 'Loading problem statement...',
      'Floating Window': 'Floating Window',
      'Dock Editor': 'Dock Editor',
      'Open Score Page': 'Open Score Page',
      'Back to Scratch submissions': 'Back to Scratch submissions',
      'Direct scoring URL': 'Direct scoring URL',
      scratch_review_queue: 'Scratch Review',
    });
    await ScratchModel.ensureIndexes();
  },
});
