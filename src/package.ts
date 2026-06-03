import { open, type Entry, type ZipFile } from 'yauzl';
import yazl from 'yazl';
import YAML from 'yaml';
import type { PluginConfig, ScratchJudgeConfig, ScratchJudgeMode, ScratchSubmitMode } from './types';
import { normalizeJudgeConfig } from './static-judge';

export interface ScratchProblemPackageManifest {
  format: 'hydro-scratch-problem';
  version: number;
  pid?: string;
  title: string;
  hidden?: boolean;
  tags?: string[];
  scratch?: {
    enabled?: boolean;
    submitMode?: ScratchSubmitMode;
    judgeMode?: ScratchJudgeMode;
    maxScore?: number;
    allowDownloadTemplate?: boolean;
    disabledScratchExtensions?: string[];
    limits?: {
      maxProjectSizeMB?: number;
      maxUnpackedSizeMB?: number;
      maxAssetSizeMB?: number;
      maxAssetCount?: number;
      maxProjectJsonSizeMB?: number;
    };
    template?: string;
  };
}

export interface ScratchProblemPackage {
  manifest: ScratchProblemPackageManifest;
  statement: string;
  judgeConfig: ScratchJudgeConfig;
  template?: {
    filename: string;
    content: Buffer;
  };
}

export interface ScratchProblemPackageSource {
  pid?: string | number;
  title: string;
  hidden?: boolean;
  tags?: string[];
  statement: string;
  scratch: {
    enabled: boolean;
    submitMode: ScratchSubmitMode;
    judgeMode: ScratchJudgeMode;
    maxScore: number;
    allowDownloadTemplate: boolean;
    disabledScratchExtensions: string[];
    maxProjectSizeMB: number;
    maxUnpackedSizeMB: number;
    maxAssetSizeMB: number;
    maxAssetCount: number;
    maxProjectJsonSizeMB: number;
    judgeConfig: ScratchJudgeConfig;
  };
  template?: {
    filename: string;
    content: Buffer;
  };
}

interface PackageEntries {
  manifest?: Buffer;
  statement?: Buffer;
  judgeConfig?: Buffer;
  template?: {
    filename: string;
    content: Buffer;
  };
}

const PACKAGE_FORMAT = 'hydro-scratch-problem';
const PACKAGE_VERSION = 1;
const MAX_PACKAGE_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_PACKAGE_TOTAL_BYTES = 128 * 1024 * 1024;

export async function readScratchProblemPackage(
  filePath: string,
  pluginConfig: PluginConfig,
): Promise<ScratchProblemPackage> {
  const entries = await readPackageEntries(filePath);
  if (!entries.manifest) throw new Error('problem.yaml was not found in the package.');
  if (!entries.statement) throw new Error('statement.md was not found in the package.');
  if (!entries.judgeConfig) throw new Error('scratch-judge.json was not found in the package.');

  const rawManifest = YAML.parse(entries.manifest.toString('utf8')) as unknown;
  const manifest = normalizeManifest(rawManifest);
  const statement = entries.statement.toString('utf8');

  let judgeConfigInput: unknown;
  try {
    judgeConfigInput = JSON.parse(entries.judgeConfig.toString('utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`scratch-judge.json is not valid JSON: ${message}`);
  }
  const judgeConfig = normalizeJudgeConfig(judgeConfigInput, manifest.scratch?.maxScore || pluginConfig.maxScore);

  return {
    manifest,
    statement,
    judgeConfig,
    template: entries.template,
  };
}

export async function createScratchProblemPackageZip(source: ScratchProblemPackageSource): Promise<Buffer> {
  const manifest = buildManifest(source);
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(YAML.stringify(manifest), 'utf8'), 'problem.yaml');
  zip.addBuffer(Buffer.from(source.statement || '', 'utf8'), 'statement.md');
  zip.addBuffer(Buffer.from(JSON.stringify(source.scratch.judgeConfig || {}, null, 2), 'utf8'), 'scratch-judge.json');
  if (source.template) zip.addBuffer(source.template.content, source.template.filename || 'template.sb3');
  return zipToBuffer(zip);
}

function buildManifest(source: ScratchProblemPackageSource): ScratchProblemPackageManifest {
  const templateName = source.template?.filename || undefined;
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    pid: source.pid === undefined || source.pid === null ? undefined : String(source.pid),
    title: source.title || 'Scratch Problem',
    hidden: !!source.hidden,
    tags: uniqueTags([...(source.tags || []), 'Scratch']),
    scratch: {
      enabled: source.scratch.enabled,
      submitMode: source.scratch.submitMode,
      judgeMode: source.scratch.judgeMode,
      maxScore: source.scratch.maxScore,
      allowDownloadTemplate: source.scratch.allowDownloadTemplate,
      disabledScratchExtensions: source.scratch.disabledScratchExtensions,
      limits: {
        maxProjectSizeMB: source.scratch.maxProjectSizeMB,
        maxUnpackedSizeMB: source.scratch.maxUnpackedSizeMB,
        maxAssetSizeMB: source.scratch.maxAssetSizeMB,
        maxAssetCount: source.scratch.maxAssetCount,
        maxProjectJsonSizeMB: source.scratch.maxProjectJsonSizeMB,
      },
      ...(templateName ? { template: templateName } : {}),
    },
  };
}

function normalizeManifest(input: unknown): ScratchProblemPackageManifest {
  if (!isPlainObject(input)) throw new Error('problem.yaml must contain a YAML object.');
  const manifest = input as Record<string, unknown>;
  const format = stringValue(manifest.format, '');
  if (format !== PACKAGE_FORMAT) throw new Error(`problem.yaml format must be ${PACKAGE_FORMAT}.`);
  const title = requiredString(manifest.title, 'problem.yaml.title');
  const scratch = isPlainObject(manifest.scratch) ? manifest.scratch as Record<string, unknown> : {};
  return {
    format: PACKAGE_FORMAT,
    version: positiveInteger(manifest.version, PACKAGE_VERSION),
    pid: optionalString(manifest.pid),
    title,
    hidden: Boolean(manifest.hidden),
    tags: parseStringArray(manifest.tags),
    scratch: {
      enabled: scratch.enabled === undefined ? true : Boolean(scratch.enabled),
      submitMode: parseSubmitMode(scratch.submitMode),
      judgeMode: parseJudgeMode(scratch.judgeMode),
      maxScore: positiveNumber(scratch.maxScore, 100),
      allowDownloadTemplate: scratch.allowDownloadTemplate === undefined ? true : Boolean(scratch.allowDownloadTemplate),
      disabledScratchExtensions: parseStringArray(scratch.disabledScratchExtensions),
      limits: parseLimits(scratch.limits),
      template: optionalString(scratch.template),
    },
  };
}

function parseLimits(input: unknown): NonNullable<NonNullable<ScratchProblemPackageManifest['scratch']>['limits']> {
  const limits = isPlainObject(input) ? input as Record<string, unknown> : {};
  return {
    maxProjectSizeMB: optionalPositiveNumber(limits.maxProjectSizeMB),
    maxUnpackedSizeMB: optionalPositiveNumber(limits.maxUnpackedSizeMB),
    maxAssetSizeMB: optionalPositiveNumber(limits.maxAssetSizeMB),
    maxAssetCount: optionalPositiveInteger(limits.maxAssetCount),
    maxProjectJsonSizeMB: optionalPositiveNumber(limits.maxProjectJsonSizeMB),
  };
}

async function readPackageEntries(filePath: string): Promise<PackageEntries> {
  return withZip(filePath, (zip) => new Promise<PackageEntries>((resolve, reject) => {
    const entries: PackageEntries = {};
    let total = 0;

    const fail = (error: Error) => {
      try {
        zip.close();
      } catch { /* ignore close errors */ }
      reject(error);
    };

    zip.readEntry();
    zip.on('entry', (entry: Entry) => {
      if (/\/$/.test(entry.fileName)) {
        zip.readEntry();
        return;
      }

      let safeName: string;
      try {
        safeName = normalizePackageEntryName(entry.fileName);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (!isKnownEntry(safeName)) {
        zip.readEntry();
        return;
      }

      if (entry.uncompressedSize > MAX_PACKAGE_ENTRY_BYTES) {
        fail(new Error(`${safeName} exceeds ${MAX_PACKAGE_ENTRY_BYTES} bytes.`));
        return;
      }

      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          fail(error || new Error(`Unable to read ${safeName}.`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          total += chunk.length;
          if (size > MAX_PACKAGE_ENTRY_BYTES || total > MAX_PACKAGE_TOTAL_BYTES) {
            stream.destroy(new Error('Scratch problem package is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('error', fail);
        stream.on('end', () => {
          const content = Buffer.concat(chunks);
          if (safeName === 'problem.yaml' || safeName === 'problem.yml') entries.manifest = content;
          else if (safeName === 'statement.md') entries.statement = content;
          else if (safeName === 'scratch-judge.json') entries.judgeConfig = content;
          else if (safeName.endsWith('.sb3')) entries.template = { filename: safeName, content };
          zip.readEntry();
        });
      });
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', fail);
  }));
}

function zipToBuffer(zip: yazl.ZipFile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}

function withZip<T>(filePath: string, fn: (zip: ZipFile) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(error || new Error('Unable to read Scratch problem package.'));
        return;
      }
      fn(zip).then(resolve, reject);
    });
  });
}

function normalizePackageEntryName(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) throw new Error('Invalid package entry name.');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error(`Unsafe package entry: ${value}`);
  const basename = parts[parts.length - 1];
  if (!basename) throw new Error(`Invalid package entry: ${value}`);
  return basename;
}

function isKnownEntry(name: string) {
  return name === 'problem.yaml'
    || name === 'problem.yml'
    || name === 'statement.md'
    || name === 'scratch-judge.json'
    || name === 'template.sb3'
    || name.endsWith('.sb3');
}

function parseSubmitMode(value: unknown): ScratchSubmitMode {
  return value === 'upload' || value === 'editor' || value === 'both' ? value : 'both';
}

function parseJudgeMode(value: unknown): ScratchJudgeMode {
  return value === 'manual' || value === 'static' || value === 'dynamic' || value === 'hybrid' ? value : 'hybrid';
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueTags(value.map(String));
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : fallback;
}

function optionalPositiveInteger(value: unknown) {
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : undefined;
}

function positiveNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function optionalPositiveNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
