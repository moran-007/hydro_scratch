import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { afterEach, describe, expect, it } from 'vitest';
import { ScratchValidationError } from '../src/errors';
import { validateScratchProject } from '../src/sb3';
import { judgeScratchFile, judgeScratchStaticFile } from '../src/static-judge';

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

function minimalSvgCostume() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#000"/></svg>';
  const assetId = createHash('md5').update(svg).digest('hex');
  return {
    svg,
    assetId,
    fileName: `${assetId}.svg`,
    costume: {
      assetId,
      name: 'costume1',
      bitmapResolution: 1,
      md5ext: `${assetId}.svg`,
      dataFormat: 'svg',
      rotationCenterX: 1,
      rotationCenterY: 1,
    },
  };
}

function stageTarget(costume: unknown) {
  return {
    isStage: true,
    name: 'Stage',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [costume],
    sounds: [],
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'on',
    textToSpeechLanguage: null,
  };
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

  it('scores Scratch static checks from project.json', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, {
      'project.json': JSON.stringify({
        targets: [
          { isStage: true, name: 'Stage', variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
          {
            isStage: false,
            name: 'Player',
            variables: { scoreVar: ['score', 0] },
            lists: {},
            blocks: {
              event: { opcode: 'event_whenflagclicked' },
              move: { opcode: 'motion_movesteps' },
            },
            costumes: [],
            sounds: [],
          },
        ],
        monitors: [],
        extensions: [],
        meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
      }),
    });

    await expect(judgeScratchStaticFile(filePath, {
      totalScore: 100,
      staticChecks: [
        { type: 'sprite_exists', name: '存在 Player', sprite: 'Player', score: 25 },
        { type: 'variable_exists', name: '存在 score', variable: 'score', score: 25 },
        { type: 'block_exists', name: '点击绿旗', opcode: 'event_whenflagclicked', score: 25 },
        { type: 'block_exists', name: '使用循环', opcode: 'control_forever', score: 25 },
      ],
    })).resolves.toMatchObject({
      totalScore: 75,
      maxScore: 100,
      passed: false,
      summary: {
        passedChecks: 3,
        totalChecks: 4,
      },
      projectMeta: {
        spriteNames: ['Player'],
        variableNames: ['score'],
      },
    });
  });

  it('scores structure checks only when the required script is in the target sprite and order', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, {
      'project.json': JSON.stringify({
        targets: [
          { isStage: true, name: 'Stage', variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
          {
            isStage: false,
            name: 'Player',
            variables: {},
            lists: {},
            blocks: {
              event: {
                opcode: 'event_whenflagclicked',
                parent: null,
                next: 'go',
                topLevel: true,
              },
              go: {
                opcode: 'motion_gotoxy',
                parent: 'event',
                next: 'move',
                inputs: {
                  X: [1, [4, '-150']],
                  Y: [1, [4, '0']],
                },
              },
              move: {
                opcode: 'motion_movesteps',
                parent: 'go',
                next: null,
                inputs: {
                  STEPS: [1, [4, '250']],
                },
              },
            },
            costumes: [],
            sounds: [],
          },
        ],
        monitors: [],
        extensions: [],
        meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
      }),
    });

    await expect(judgeScratchFile(filePath, {
      totalScore: 100,
      staticChecks: [
        { type: 'sprite_exists', name: 'Player exists', sprite: 'Player', score: 10 },
      ],
      structureChecks: [
        {
          type: 'target_script_exists',
          name: 'Player green flag script',
          target: 'Player',
          hat: 'event_whenflagclicked',
          score: 20,
        },
        {
          type: 'script_sequence',
          name: 'Player initializes then moves',
          target: 'Player',
          hat: 'event_whenflagclicked',
          sequence: ['event_whenflagclicked', 'motion_gotoxy', 'motion_movesteps'],
          score: 30,
        },
        {
          type: 'block_input_equals',
          name: 'Player starts at expected position',
          target: 'Player',
          hat: 'event_whenflagclicked',
          opcode: 'motion_gotoxy',
          inputs: { X: -150, Y: 0 },
          score: 40,
        },
      ],
    })).resolves.toMatchObject({
      mode: 'static',
      totalScore: 100,
      passed: true,
      summary: {
        passedChecks: 4,
        totalChecks: 4,
      },
    });
  });

  it('fails structure checks when blocks are present but not in the required target script order', async () => {
    const filePath = await tempFile('project.sb3');
    await writeZip(filePath, {
      'project.json': JSON.stringify({
        targets: [
          { isStage: true, name: 'Stage', variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
          {
            isStage: false,
            name: 'Player',
            variables: {},
            lists: {},
            blocks: {
              event: { opcode: 'event_whenflagclicked', parent: null, next: 'move', topLevel: true },
              move: { opcode: 'motion_movesteps', parent: 'event', next: 'go' },
              go: { opcode: 'motion_gotoxy', parent: 'move', next: null },
            },
            costumes: [],
            sounds: [],
          },
          {
            isStage: false,
            name: 'Cat',
            variables: {},
            lists: {},
            blocks: {
              catEvent: { opcode: 'event_whenflagclicked', parent: null, next: 'catMove', topLevel: true },
              catMove: { opcode: 'motion_movesteps', parent: 'catEvent', next: null },
            },
            costumes: [],
            sounds: [],
          },
        ],
        monitors: [],
        extensions: [],
        meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
      }),
    });

    await expect(judgeScratchFile(filePath, {
      totalScore: 100,
      staticChecks: [
        { type: 'block_exists', name: 'Move block exists somewhere', opcode: 'motion_movesteps', score: 20 },
      ],
      structureChecks: [
        {
          type: 'script_sequence',
          name: 'Player sequence is correct',
          target: 'Player',
          hat: 'event_whenflagclicked',
          sequence: ['event_whenflagclicked', 'motion_gotoxy', 'motion_movesteps'],
          score: 80,
        },
      ],
    })).resolves.toMatchObject({
      totalScore: 20,
      passed: false,
      summary: {
        passedChecks: 1,
        totalChecks: 2,
      },
    });
  });

  it('checks dynamic sprite position after loading the project in Scratch VM', async () => {
    const filePath = await tempFile('project.sb3');
    const asset = minimalSvgCostume();
    await writeZip(filePath, {
      'project.json': JSON.stringify({
        targets: [
          stageTarget(asset.costume),
          {
            isStage: false,
            name: 'Player',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [asset.costume],
            sounds: [],
            volume: 100,
            layerOrder: 1,
            x: 100,
            y: 0,
            direction: 90,
            visible: true,
            size: 100,
            rotationStyle: 'all around',
            draggable: false,
          },
        ],
        monitors: [],
        extensions: [],
        meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
      }),
      [asset.fileName]: asset.svg,
    });

    await expect(judgeScratchFile(filePath, {
      totalScore: 100,
      dynamicChecks: [
        {
          type: 'sprite_position',
          name: 'Player reaches target position',
          target: 'Player',
          expected: { x: 100, y: 0 },
          tolerance: 1,
          score: 100,
          steps: [{ action: 'wait', ms: 10 }],
        },
      ],
      dynamicOptions: {
        timeoutMs: 5000,
      },
    })).resolves.toMatchObject({
      mode: 'dynamic',
      totalScore: 100,
      passed: true,
      details: [
        {
          type: 'sprite_position',
          category: 'dynamic',
          passed: true,
        },
      ],
    });
  });
});
