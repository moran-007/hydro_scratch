import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { afterEach, describe, expect, it } from 'vitest';
import { ScratchValidationError } from '../src/errors';
import { validateScratchProject } from '../src/sb3';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempFile(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'scratch-sb3-'));
  tempDirs.push(dir);
  return join(dir, name);
}

async function writeZip(filePath: string, entries: Record<string, Buffer | string>) {
  await new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [name, content] of Object.entries(entries)) {
      zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
    }
    zip.outputStream
      .pipe(createWriteStream(filePath))
      .on('close', resolve)
      .on('error', reject);
    zip.end();
  });
}

async function writeUnsafeZip(filePath: string) {
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks: Buffer[] = [];
    zip.addBuffer(Buffer.from(validProjectJson()), 'project.json');
    zip.addBuffer(Buffer.alloc(0), 'aa/evil.txt');
    zip.outputStream.on('data', (chunk) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
  const safeName = Buffer.from('aa/evil.txt');
  const unsafeName = Buffer.from('../evil.txt');
  let offset = buffer.indexOf(safeName);
  while (offset !== -1) {
    unsafeName.copy(buffer, offset);
    offset = buffer.indexOf(safeName, offset + unsafeName.length);
  }
  await writeFile(filePath, buffer);
}

function validProjectJson() {
  return JSON.stringify({
    targets: [
      { isStage: true, name: 'Stage', variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
      { isStage: false, name: 'Sprite1', variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
  });
}

describe('validateScratchProject', () => {
  it('accepts a minimal valid Scratch 3 project', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, {
      'project.json': validProjectJson(),
      'asset.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });

    await expect(validateScratchProject(filePath, 'project.sb3')).resolves.toMatchObject({
      assetCount: 1,
      hasStage: true,
      spriteCount: 1,
      targets: 2,
    });
  });

  it('rejects non-sb3 extensions before zip parsing', async () => {
    const filePath = await tempFile('project.zip');
    await writeZip(filePath, { 'project.json': validProjectJson() });

    await expect(validateScratchProject(filePath, 'project.zip')).rejects.toMatchObject({
      code: 'invalid_extension',
    });
  });

  it('rejects missing project.json', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, { 'asset.svg': '<svg />' });

    await expect(validateScratchProject(filePath, 'project.sb3')).rejects.toMatchObject({
      code: 'missing_project_json',
    });
  });

  it('rejects zip-slip entries', async () => {
    const filePath = await tempFile('project.sb3');
    await writeUnsafeZip(filePath);

    await expect(validateScratchProject(filePath, 'project.sb3')).rejects.toBeInstanceOf(ScratchValidationError);
    await expect(validateScratchProject(filePath, 'project.sb3')).rejects.toMatchObject({
      code: 'zip_slip',
    });
  });

  it('enforces unpacked size limits', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, {
      'project.json': validProjectJson(),
      'large.bin': Buffer.alloc(1024),
    });

    await expect(validateScratchProject(filePath, 'project.sb3', {
      maxUnpackedSizeBytes: 256,
    })).rejects.toMatchObject({
      code: 'unpacked_too_large',
    });
  });
});
