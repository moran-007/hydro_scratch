import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createScratchProblemPackageZip,
  readScratchProblemPackage,
} from '../src/package';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempFile(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'scratch-package-'));
  tempDirs.push(dir);
  return join(dir, name);
}

describe('Scratch problem packages', () => {
  it('round-trips a Hydro-native Scratch problem package', async () => {
    const packageBuffer = await createScratchProblemPackageZip({
      pid: 'scratchpkg1',
      title: 'Scratch Package Test',
      hidden: false,
      tags: ['Scratch', 'auto'],
      statement: '# Scratch Package Test\n\nMove Player to x=100.',
      scratch: {
        enabled: true,
        problemKind: 'algorithm',
        submitMode: 'both',
        judgeMode: 'hybrid',
        maxScore: 100,
        allowDownloadTemplate: true,
        disabledScratchExtensions: ['videoSensing'],
        maxProjectSizeMB: 20,
        maxUnpackedSizeMB: 80,
        maxAssetSizeMB: 10,
        maxAssetCount: 300,
        maxProjectJsonSizeMB: 10,
        judgeConfig: {
          schemaVersion: 2,
          totalScore: 100,
          staticChecks: [
            { type: 'sprite_exists', name: 'Player exists', sprite: 'Player', score: 20 },
          ],
          structureChecks: [
            {
              type: 'target_script_exists',
              name: 'Player green flag',
              target: 'Player',
              hat: 'event_whenflagclicked',
              score: 30,
            },
          ],
          dynamicChecks: [
            {
              type: 'sprite_position',
              name: 'Player reaches target',
              target: 'Player',
              expected: { x: 100, y: 0 },
              score: 50,
            },
          ],
        },
      },
      template: {
        filename: 'template.sb3',
        content: Buffer.from('template'),
      },
    });
    const filePath = await tempFile('package.zip');
    await writeFile(filePath, packageBuffer);

    await expect(readScratchProblemPackage(filePath, DEFAULT_PLUGIN_CONFIG)).resolves.toMatchObject({
      manifest: {
        format: 'hydro-scratch-problem',
        pid: 'scratchpkg1',
        title: 'Scratch Package Test',
        scratch: {
          problemKind: 'algorithm',
          submitMode: 'both',
          judgeMode: 'hybrid',
          maxScore: 100,
        },
      },
      statement: '# Scratch Package Test\n\nMove Player to x=100.',
      judgeConfig: {
        totalScore: 100,
        staticChecks: [
          { type: 'sprite_exists', sprite: 'Player' },
        ],
        structureChecks: [
          { type: 'target_script_exists', target: 'Player' },
        ],
        dynamicChecks: [
          { type: 'sprite_position', target: 'Player' },
        ],
      },
      template: {
        filename: 'template.sb3',
        content: Buffer.from('template'),
      },
    });
  });
});
