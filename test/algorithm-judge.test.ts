import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tempDirs: string[] = [];
const originalScratchVmModule = process.env.SCRATCH_VM_MODULE;

afterEach(async () => {
  if (originalScratchVmModule === undefined) delete process.env.SCRATCH_VM_MODULE;
  else process.env.SCRATCH_VM_MODULE = originalScratchVmModule;
  vi.resetModules();
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'scratch-algorithm-'));
  tempDirs.push(dir);
  return dir;
}

async function tempFile(name: string) {
  return join(await tempDir(), name);
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

function algorithmProjectJson() {
  return JSON.stringify({
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {
          inputVar: ['input', ''],
          outputVar: ['output', ''],
        },
        lists: {
          inputList: ['input', []],
          outputList: ['output', []],
        },
        blocks: {},
        comments: {},
        costumes: [],
        sounds: [],
      },
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' },
  });
}

async function installAlgorithmVmMock() {
  const modulePath = join(await tempDir(), 'scratch-vm-mock.cjs');
  await writeFile(modulePath, `
class FakeVariable {
  constructor(name, type, value) {
    this.name = name;
    this.type = type;
    this.value = value;
  }
}

function makeStage() {
  const variables = {
    inputVar: new FakeVariable('input', '', ''),
    outputVar: new FakeVariable('output', '', ''),
    inputList: new FakeVariable('input', 'list', []),
    outputList: new FakeVariable('output', 'list', []),
  };
  return {
    isStage: true,
    variables,
    getName() { return 'Stage'; },
    lookupVariableByNameAndType(name, type) {
      return Object.values(this.variables).find((variable) => variable.name === name && (variable.type || '') === type);
    },
  };
}

function numericSum(values) {
  const numbers = String(values).match(/-?\\d+(?:\\.\\d+)?/g);
  if (!numbers) return null;
  return String(numbers.map(Number).reduce((sum, value) => sum + value, 0));
}

module.exports = class FakeVirtualMachine {
  constructor() {
    this.loadProject();
  }
  attachStorage() {}
  start() {}
  clear() {
    this.loadProject();
  }
  setCompatibilityMode() {}
  setTurboMode() {}
  async loadProject() {
    this.stage = makeStage();
    this.runtime = {
      targets: [this.stage],
      getTargetForStage: () => this.stage,
      getSpriteTargetByName: () => undefined,
    };
  }
  greenFlag() {
    const inputVar = this.stage.lookupVariableByNameAndType('input', '');
    const inputList = this.stage.lookupVariableByNameAndType('input', 'list');
    const outputVar = this.stage.lookupVariableByNameAndType('output', '');
    const outputList = this.stage.lookupVariableByNameAndType('output', 'list');
    const listValues = Array.isArray(inputList.value) ? inputList.value : [];
    const text = listValues.length ? listValues.join(' ') : String(inputVar.value || '');
    let result;
    if (/fail/.test(text)) result = '999';
    else if (/pi/.test(text)) result = '3.14159';
    else result = numericSum(text) ?? text.trim();
    if (/hello/.test(text)) outputVar.value = '  ' + result.replace(/\\s+/g, '    ') + '  ';
    else outputVar.value = result;
    outputList.value = String(result).trim() ? String(result).trim().split(/\\s+/) : [];
  }
  stopAll() {}
  quit() {}
};
`, 'utf8');
  process.env.SCRATCH_VM_MODULE = modulePath;
  vi.resetModules();
}

describe('Scratch algorithm judge', () => {
  it('runs 10 IO cases with multiline input, list input, output comparison, and score aggregation', async () => {
    await installAlgorithmVmMock();
    const { judgeScratchAlgorithmFile } = await import('../src/static-judge');
    const filePath = await tempFile('algorithm.sb3');
    await writeZip(filePath, {
      'project.json': algorithmProjectJson(),
    });

    const result = await judgeScratchAlgorithmFile(filePath, {
      totalScore: 100,
      algorithm: {
        inputVariable: 'input',
        inputList: 'input',
        outputVariable: 'output',
        compareMode: 'tokens',
        numericTolerance: 0.01,
        waitMs: 0,
        timeoutMs: 1000,
        cases: [
          { name: '测试点 1：单值输入', input: '1', expectedOutput: '1', score: 5 },
          { name: '测试点 2：单行多个输入', input: '1 2', expectedOutput: '3', score: 5 },
          { name: '测试点 3：多次输入', input: '2\n3', expectedOutput: '5', score: 10 },
          { name: '测试点 4：数字列表输入', input: [1, 2, 3], expectedOutput: '6', score: 10 },
          { name: '测试点 5：字符串列表输入', input: ['a', 'b'], expectedOutput: ['a', 'b'], score: 10 },
          { name: '测试点 6：布尔输入', input: true, expectedOutput: 'true', score: 5 },
          { name: '测试点 7：数字容差比较', input: 'pi', expectedOutput: '3.14', score: 10, compareMode: 'number' },
          { name: '测试点 8：按词比较输出', input: 'hello world', expectedOutput: 'hello world', score: 10 },
          { name: '测试点 9：隐藏失败点', input: 'fail 1 2', expectedOutput: '3', score: 20, hidden: true },
          { name: '测试点 10：三行输入', input: '5\n5\n5', expectedOutput: '15', score: 15 },
        ],
      },
    });

    expect(result).toMatchObject({
      mode: 'algorithm',
      maxScore: 100,
      totalScore: 80,
      passed: false,
      summary: {
        passedChecks: 9,
        totalChecks: 10,
        rawScore: 80,
        rawMaxScore: 100,
      },
    });
    expect(result.details.map((detail) => detail.passed)).toEqual([
      true, true, true, true, true, true, true, true, false, true,
    ]);
    expect(result.details[8]).toMatchObject({
      name: '测试点 9：隐藏失败点',
      score: 0,
      maxScore: 20,
      message: 'Algorithm case failed.',
    });
    expect(result.details[8].evidence).toBeUndefined();
  });

  it('reads output from Scratch lists and applies score scaling', async () => {
    await installAlgorithmVmMock();
    const { judgeScratchAlgorithmFile } = await import('../src/static-judge');
    const filePath = await tempFile('algorithm-list.sb3');
    await writeZip(filePath, {
      'project.json': algorithmProjectJson(),
    });

    const result = await judgeScratchAlgorithmFile(filePath, {
      totalScore: 50,
      algorithm: {
        inputVariable: 'missingInput',
        inputList: 'input',
        inputSplit: 'tokens',
        outputVariable: 'missingOutput',
        outputList: 'output',
        outputJoin: '\n',
        compareMode: 'tokens',
        waitMs: 0,
        timeoutMs: 1000,
        cases: [
          { name: '列表输入与列表输出', input: '4 5 6', expectedOutput: ['15'], score: 100 },
        ],
      },
    });

    expect(result).toMatchObject({
      mode: 'algorithm',
      maxScore: 50,
      totalScore: 50,
      passed: true,
      summary: {
        passedChecks: 1,
        totalChecks: 1,
        rawScore: 100,
        rawMaxScore: 100,
      },
    });
    expect(result.details[0]).toMatchObject({
      name: '列表输入与列表输出',
      passed: true,
      score: 100,
      maxScore: 100,
    });
  });
});
