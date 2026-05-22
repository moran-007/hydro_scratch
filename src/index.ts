import { Schema, definePlugin } from 'hydrooj';
import { DEFAULT_PLUGIN_CONFIG } from './config';
import { applyHandlers } from './http';
import { ScratchModel } from './model';
import type { PluginConfig } from './types';

export * from './errors';
export * from './sb3';
export * from './types';

function normalizePluginConfig(config: Partial<PluginConfig> = {}): PluginConfig {
  return {
    ...DEFAULT_PLUGIN_CONFIG,
    ...config,
    storagePrefix: (config.storagePrefix || DEFAULT_PLUGIN_CONFIG.storagePrefix).replace(/^\/+|\/+$/g, ''),
    maxProjectSizeMB: Number(config.maxProjectSizeMB || DEFAULT_PLUGIN_CONFIG.maxProjectSizeMB),
    maxUnpackedSizeMB: Number(config.maxUnpackedSizeMB || DEFAULT_PLUGIN_CONFIG.maxUnpackedSizeMB),
    maxAssetSizeMB: Number(config.maxAssetSizeMB || DEFAULT_PLUGIN_CONFIG.maxAssetSizeMB),
    maxAssetCount: Number(config.maxAssetCount || DEFAULT_PLUGIN_CONFIG.maxAssetCount),
    maxProjectJsonSizeMB: Number(config.maxProjectJsonSizeMB || DEFAULT_PLUGIN_CONFIG.maxProjectJsonSizeMB),
    maxScore: Number(config.maxScore || DEFAULT_PLUGIN_CONFIG.maxScore),
    previewPlayerUrl: config.previewPlayerUrl ?? DEFAULT_PLUGIN_CONFIG.previewPlayerUrl,
  };
}

export default definePlugin<PluginConfig>({
  name: 'hydro-plugin-scratch',
  schema: Schema.object({
    storagePrefix: Schema.string().default(DEFAULT_PLUGIN_CONFIG.storagePrefix).description('Storage path prefix for Scratch projects'),
    maxProjectSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxProjectSizeMB).min(1).description('Maximum .sb3 upload size in MB'),
    maxUnpackedSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxUnpackedSizeMB).min(1).description('Maximum unpacked .sb3 size in MB'),
    maxAssetSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxAssetSizeMB).min(1).description('Maximum single asset size in MB'),
    maxAssetCount: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxAssetCount).min(1).description('Maximum asset count'),
    maxProjectJsonSizeMB: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxProjectJsonSizeMB).min(1).description('Maximum project.json size in MB'),
    maxScore: Schema.number().default(DEFAULT_PLUGIN_CONFIG.maxScore).min(1).description('Default manual score maximum'),
    previewPlayerUrl: Schema.string().default(DEFAULT_PLUGIN_CONFIG.previewPlayerUrl).description('Preview player URL. Leave empty to show download-only preview.'),
  }).description('Scratch MVP'),
  async apply(ctx, rawConfig) {
    const config = normalizePluginConfig(rawConfig);
    applyHandlers(ctx, config);
    ctx.injectUI?.('ProblemAdd', 'scratch_problem_create', { icon: 'edit', text: 'Scratch Problem' });
    ctx.i18n?.load?.('zh', {
      'Scratch Problem': 'Scratch 题目',
      'Create Scratch Problem': '创建 Scratch 题目',
      'Scratch Preview': 'Scratch 预览',
      'Manual Score': '人工评分',
    });
    ctx.i18n?.load?.('en', {
      'Scratch Problem': 'Scratch Problem',
      'Create Scratch Problem': 'Create Scratch Problem',
      'Scratch Preview': 'Scratch Preview',
      'Manual Score': 'Manual Score',
    });
    await ScratchModel.ensureIndexes();
  },
});

