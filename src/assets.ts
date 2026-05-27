import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Handler, NotFoundError, Types, ValidationError, param } from 'hydrooj';
import type { PluginConfig } from './types';

export const PLUGIN_ASSET_VERSION = '0.2.7';

const scratchAssetOrigins = [
  'https://assets.scratch.mit.edu',
  'https://cdn.assets.scratch.mit.edu',
];

const localScratchAssetDir = path.resolve(__dirname, '..', 'public', 'scratch-assets');

export function buildScratchEditorUrl(config: PluginConfig) {
  if (!config.scratchEditorUrl) return '';
  const base = config.scratchEditorUrl;
  const url = new URL(base, 'http://hydro.local');
  if (!url.searchParams.has('assetHost')) url.searchParams.set('assetHost', config.scratchAssetHost || '/scratch-assets');
  if (!url.searchParams.has('ojEmbedVersion')) url.searchParams.set('ojEmbedVersion', `hydro-plugin-${PLUGIN_ASSET_VERSION}`);
  if (!url.searchParams.has('v')) url.searchParams.set('v', PLUGIN_ASSET_VERSION);
  if (/^https?:\/\//i.test(base)) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeAssetFilename(filename: string) {
  const decoded = decodeURIComponent(filename || '');
  if (!/^[a-f0-9]{32}\.(svg|png|jpg|jpeg|gif|wav|mp3|sprite3)$/i.test(decoded)) {
    throw new ValidationError('filename');
  }
  return decoded;
}

function getAssetContentType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'sprite3') return 'application/zip';
  return 'application/octet-stream';
}

async function fetchScratchAsset(filename: string) {
  const localPath = path.join(localScratchAssetDir, filename);
  if (localPath.startsWith(`${localScratchAssetDir}${path.sep}`) && existsSync(localPath)) {
    return readFile(localPath);
  }

  const errors: string[] = [];
  for (const origin of scratchAssetOrigins) {
    const remoteUrl = `${origin}/internalapi/asset/${filename}/get/`;
    try {
      const response = await fetch(remoteUrl, {
        headers: { 'User-Agent': 'Hydro Scratch asset proxy' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        errors.push(`${origin}: HTTP ${response.status}`);
        continue;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      errors.push(`${origin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new NotFoundError(`Scratch asset ${filename}: ${errors.join('; ')}`);
}

export class ScratchAssetProxyHandler extends Handler {
  noCheckPermView = true;

  @param('filename', Types.String)
  async get(_domainId: string, rawFilename: string) {
    const filename = normalizeAssetFilename(rawFilename);
    this.response.body = await fetchScratchAsset(filename);
    this.response.type = getAssetContentType(filename);
    this.response.addHeader?.('Cache-Control', 'public, max-age=86400');
    this.response.addHeader?.('Access-Control-Allow-Origin', '*');
    this.response.addHeader?.('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}
