import { basename, extname } from 'node:path';
import { open, type Entry, type ZipFile } from 'yauzl';
import { ScratchValidationError } from './errors';
import type { ScratchLimits, ScratchValidationSummary } from './types';

export const DEFAULT_LIMITS: ScratchLimits = {
  maxProjectSizeBytes: 20 * 1024 * 1024,
  maxUnpackedSizeBytes: 80 * 1024 * 1024,
  maxAssetSizeBytes: 10 * 1024 * 1024,
  maxAssetCount: 300,
  maxProjectJsonSizeBytes: 10 * 1024 * 1024,
};

const nestedArchiveExtensions = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.xz', '.bz2']);

function withZip<T>(filePath: string, fn: (zip: ZipFile) => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error) {
        reject(new ScratchValidationError('invalid_zip', '文件不是合法的 zip/.sb3 项目', { message: error.message }));
        return;
      }
      if (!zip) {
        reject(new ScratchValidationError('invalid_zip', '无法读取 .sb3 项目'));
        return;
      }
      fn(zip).then(resolve, reject);
    });
  });
}

function assertSafeEntryName(name: string) {
  if (!name || name.includes('\\') || name.startsWith('/') || name.match(/^[a-zA-Z]:/)) {
    throw new ScratchValidationError('unsafe_path', '压缩包中包含不安全路径', { name });
  }
  const parts = name.split('/');
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new ScratchValidationError('zip_slip', '压缩包中包含路径穿越条目', { name });
  }
}

function mapZipError(error: unknown) {
  if (error instanceof ScratchValidationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('invalid relative path')) {
    return new ScratchValidationError('zip_slip', '压缩包中包含路径穿越条目', { message });
  }
  return error;
}

function readEntry(zip: ZipFile, entry: Entry, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    if (entry.uncompressedSize > maxBytes) {
      reject(new ScratchValidationError('entry_too_large', 'project.json 超出大小限制', {
        name: entry.fileName,
        size: entry.uncompressedSize,
        maxBytes,
      }));
      return;
    }
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new ScratchValidationError('entry_read_failed', '无法读取 .sb3 内部文件', { name: entry.fileName }));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          stream.destroy(new ScratchValidationError('entry_too_large', 'project.json 超出大小限制', {
            name: entry.fileName,
            size: total,
            maxBytes,
          }));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

function summarizeProjectJson(project: any, projectJsonSize: number, unpackedSize: number, assetCount: number): ScratchValidationSummary {
  const targets = Array.isArray(project?.targets) ? project.targets : [];
  if (!targets.length) {
    throw new ScratchValidationError('invalid_project_json', 'project.json 缺少 targets');
  }
  const hasStage = targets.some((target: any) => target?.isStage === true);
  if (!hasStage) {
    throw new ScratchValidationError('invalid_project_json', 'project.json 缺少舞台 target');
  }
  return {
    projectJsonSize,
    unpackedSize,
    assetCount,
    targets: targets.length,
    spriteCount: targets.filter((target: any) => !target?.isStage).length,
    hasStage,
    warnings: [],
  };
}

export async function validateScratchProject(
  filePath: string,
  originalName = filePath,
  limits: Partial<ScratchLimits> = {},
): Promise<ScratchValidationSummary> {
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };
  if (extname(originalName).toLowerCase() !== '.sb3') {
    throw new ScratchValidationError('invalid_extension', 'Scratch 项目文件扩展名必须是 .sb3', { originalName });
  }

  return withZip(filePath, async (zip) => new Promise<ScratchValidationSummary>((resolve, reject) => {
    let unpackedSize = 0;
    let assetCount = 0;
    let projectJsonBuffer: Buffer | null = null;

    zip.readEntry();
    zip.on('entry', async (entry: Entry) => {
      try {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        assertSafeEntryName(entry.fileName);

        const fileName = basename(entry.fileName);
        const extension = extname(fileName).toLowerCase();
        if (nestedArchiveExtensions.has(extension)) {
          throw new ScratchValidationError('nested_archive', '不允许在 .sb3 中嵌套压缩包', { name: entry.fileName });
        }

        unpackedSize += entry.uncompressedSize;
        if (unpackedSize > resolvedLimits.maxUnpackedSizeBytes) {
          throw new ScratchValidationError('unpacked_too_large', '解压后总大小超出限制', {
            unpackedSize,
            maxBytes: resolvedLimits.maxUnpackedSizeBytes,
          });
        }

        if (entry.fileName === 'project.json') {
          projectJsonBuffer = await readEntry(zip, entry, resolvedLimits.maxProjectJsonSizeBytes);
        } else {
          assetCount += 1;
          if (assetCount > resolvedLimits.maxAssetCount) {
            throw new ScratchValidationError('too_many_assets', '素材数量超出限制', {
              assetCount,
              maxAssetCount: resolvedLimits.maxAssetCount,
            });
          }
          if (entry.uncompressedSize > resolvedLimits.maxAssetSizeBytes) {
            throw new ScratchValidationError('asset_too_large', '单个素材文件超出大小限制', {
              name: entry.fileName,
              size: entry.uncompressedSize,
              maxBytes: resolvedLimits.maxAssetSizeBytes,
            });
          }
          const compressionRatio = entry.compressedSize === 0
            ? Number.POSITIVE_INFINITY
            : entry.uncompressedSize / entry.compressedSize;
          if (entry.uncompressedSize > 1024 * 1024 && compressionRatio > 100) {
            throw new ScratchValidationError('suspicious_compression_ratio', '素材压缩率异常，可能是压缩炸弹', {
              name: entry.fileName,
              compressionRatio,
            });
          }
        }
        zip.readEntry();
      } catch (error) {
        reject(error);
      }
    });
    zip.on('end', async () => {
      try {
        if (!projectJsonBuffer) {
          throw new ScratchValidationError('missing_project_json', '.sb3 必须包含 project.json');
        }
        let project: any;
        try {
          project = JSON.parse(projectJsonBuffer.toString('utf8'));
        } catch (error) {
          throw new ScratchValidationError('invalid_project_json', 'project.json 不是合法 JSON', {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        resolve(summarizeProjectJson(project, projectJsonBuffer.length, unpackedSize, assetCount));
      } catch (error) {
        reject(error);
      }
    });
    zip.on('error', (error) => reject(mapZipError(error)));
  }));
}

export function limitsFromMB(options: {
  maxProjectSizeMB: number;
  maxUnpackedSizeMB: number;
  maxAssetSizeMB: number;
  maxAssetCount: number;
  maxProjectJsonSizeMB: number;
}): ScratchLimits {
  return {
    maxProjectSizeBytes: options.maxProjectSizeMB * 1024 * 1024,
    maxUnpackedSizeBytes: options.maxUnpackedSizeMB * 1024 * 1024,
    maxAssetSizeBytes: options.maxAssetSizeMB * 1024 * 1024,
    maxAssetCount: options.maxAssetCount,
    maxProjectJsonSizeBytes: options.maxProjectJsonSizeMB * 1024 * 1024,
  };
}
