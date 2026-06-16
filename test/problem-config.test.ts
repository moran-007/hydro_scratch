import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';

const hydroState = vi.hoisted(() => {
  type UpdateDoc = {
    $set?: Record<string, unknown>;
    $setOnInsert?: Record<string, unknown>;
  };

  type CollectionState = {
    docs: Record<string, unknown>[];
    lastUpdate?: {
      filter: Record<string, unknown>;
      update: UpdateDoc;
      options?: Record<string, unknown>;
    };
  };

  const collections = new Map<string, CollectionState>();

  const clone = <T>(value: T): T => structuredClone(value);

  const ensureCollection = (name: string): CollectionState => {
    if (!collections.has(name)) collections.set(name, { docs: [] });
    return collections.get(name)!;
  };

  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => doc[key] === value);

  const assertNoPathConflict = (update: UpdateDoc) => {
    const setKeys = Object.keys(update.$set || {});
    const insertKeys = new Set(Object.keys(update.$setOnInsert || {}));
    const conflict = setKeys.find((key) => insertKeys.has(key));
    if (conflict) {
      throw new Error(`Updating the path '${conflict}' would create a conflict at '${conflict}'`);
    }
  };

  const applyUpdate = (
    doc: Record<string, unknown>,
    update: UpdateDoc,
    isInsert: boolean,
  ) => {
    assertNoPathConflict(update);
    if (update.$set) Object.assign(doc, clone(update.$set));
    if (isInsert && update.$setOnInsert) Object.assign(doc, clone(update.$setOnInsert));
  };

  const problemAdd = vi.fn(async () => 1001);
  const problemGet = vi.fn();
  const problemEdit = vi.fn(async (_domainId: string, docId: number, update: Record<string, unknown>) => ({
    docId,
    ...update,
  }));
  const problemInc = vi.fn();
  const recordAdd = vi.fn();
  const recordUpdate = vi.fn();
  const recordGet = vi.fn();
  const recordGetMulti = vi.fn();
  const domainInc = vi.fn();
  const contestGet = vi.fn();
  const contestUpdateStatus = vi.fn();
  const userGetList = vi.fn();
  const storagePut = vi.fn();
  const storageGetMeta = vi.fn();
  const storageSignDownloadLink = vi.fn();
  const storageGet = vi.fn();
  const judgeEnd = vi.fn();

  return {
    reset() {
      collections.clear();
      problemAdd.mockReset();
      problemAdd.mockResolvedValue(1001);
      problemGet.mockReset();
      problemGet.mockResolvedValue(null);
      problemEdit.mockReset();
      problemInc.mockReset();
      recordAdd.mockReset();
      recordUpdate.mockReset();
      recordGet.mockReset();
      recordGetMulti.mockReset();
      domainInc.mockReset();
      contestGet.mockReset();
      contestGet.mockResolvedValue(null);
      contestUpdateStatus.mockReset();
      userGetList.mockReset();
      userGetList.mockResolvedValue({});
      storagePut.mockReset();
      storageGetMeta.mockReset();
      storageSignDownloadLink.mockReset();
      storageGet.mockReset();
      judgeEnd.mockReset();
    },
    collection(name: string) {
      const state = ensureCollection(name);
      return {
        findOne: async (filter: Record<string, unknown>) => {
          const doc = state.docs.find((item) => matches(item, filter));
          return doc ? clone(doc) : null;
        },
        updateOne: async (
          filter: Record<string, unknown>,
          update: UpdateDoc,
          options?: Record<string, unknown>,
        ) => {
          state.lastUpdate = { filter: clone(filter), update: clone(update), options: clone(options) };
          let doc = state.docs.find((item) => matches(item, filter));
          const isInsert = !doc;
          if (!doc) {
            if (!options?.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            doc = clone(filter);
            state.docs.push(doc);
          }
          applyUpdate(doc, update, isInsert);
          return {
            matchedCount: isInsert ? 0 : 1,
            modifiedCount: 1,
            upsertedCount: isInsert ? 1 : 0,
          };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          state.docs.push(clone(doc));
          return { acknowledged: true };
        },
        findOneAndUpdate: async (
          filter: Record<string, unknown>,
          update: UpdateDoc,
          options?: Record<string, unknown>,
        ) => {
          const doc = state.docs.find((item) => matches(item, filter));
          if (!doc) return null;
          applyUpdate(doc, update, false);
          return options?.returnDocument === 'after' ? clone(doc) : null;
        },
        find: (filter: Record<string, unknown>) => {
          let docs = state.docs.filter((item) => matches(item, filter)).map((item) => clone(item));
          return {
            sort(sortSpec: Record<string, number> | string, directionArg?: number) {
              const [key, direction] = typeof sortSpec === 'string'
                ? [sortSpec, directionArg || 1]
                : Object.entries(sortSpec)[0] || [];
              if (key) {
                docs = docs.sort((left, right) => {
                  const leftValue = left[key] as Date | number | string | undefined;
                  const rightValue = right[key] as Date | number | string | undefined;
                  if (leftValue === rightValue) return 0;
                  if (leftValue === undefined) return 1;
                  if (rightValue === undefined) return -1;
                  return leftValue > rightValue ? -direction : direction;
                });
              }
              return this;
            },
            limit(count: number) {
              docs = docs.slice(0, count);
              return this;
            },
            async toArray() {
              return docs;
            },
          };
        },
      };
    },
    getDocs(name: string) {
      return ensureCollection(name).docs.map((doc) => clone(doc));
    },
    getLastUpdate(name: string) {
      const lastUpdate = ensureCollection(name).lastUpdate;
      return lastUpdate ? clone(lastUpdate) : undefined;
    },
    problemAdd,
    problemGet,
    problemEdit,
    problemInc,
    recordAdd,
    recordUpdate,
    recordGet,
    recordGetMulti,
    domainInc,
    contestGet,
    contestUpdateStatus,
    userGetList,
    storagePut,
    storageGetMeta,
    storageSignDownloadLink,
    storageGet,
    judgeEnd,
  };
});

vi.mock('hydrooj', () => {
  const noopDecorator = () => () => {};

  class Handler {
    user = {
      _id: 1,
      own: () => false,
      hasPerm: () => true,
    };

    request = {};
    response: Record<string, unknown> = {};
    args = {};

    url(name: string, params: Record<string, unknown> = {}) {
      if (name === 'problem_file_download') return `/${name}/${params.pid}/file/${params.filename}`;
      const suffix = params.pid ?? params.rid;
      return suffix === undefined ? `/${name}` : `/${name}/${suffix}`;
    }

    async renderHTML(_name: string, data: Record<string, any>) {
      return `<div class="rendered">${data.pdoc.content}</div>`;
    }
  }

  return {
    db: {
      collection: (name: string) => hydroState.collection(name),
    },
    ContestModel: {
      get: hydroState.contestGet,
      updateStatus: hydroState.contestUpdateStatus,
    },
    DomainModel: {
      incUserInDomain: hydroState.domainInc,
    },
    FileTooLargeError: class FileTooLargeError extends Error {},
    ForbiddenError: class ForbiddenError extends Error {},
    Handler,
    JudgeResultCallbackContext: {
      end: hydroState.judgeEnd,
    },
    NotFoundError: class NotFoundError extends Error {},
    PERM: {
      PERM_CREATE_PROBLEM: 1,
      PERM_VIEW_PROBLEM: 2,
      PERM_EDIT_PROBLEM_SELF: 3,
      PERM_EDIT_PROBLEM: 4,
      PERM_SUBMIT_PROBLEM: 5,
      PERM_READ_RECORD_CODE: 6,
    },
    ProblemModel: {
      add: hydroState.problemAdd,
      get: hydroState.problemGet,
      edit: hydroState.problemEdit,
      inc: hydroState.problemInc,
    },
    RecordModel: {
      add: hydroState.recordAdd,
      update: hydroState.recordUpdate,
      get: hydroState.recordGet,
      getMulti: hydroState.recordGetMulti,
    },
    STATUS: {
      STATUS_ACCEPTED: 0,
      STATUS_WRONG_ANSWER: 1,
    },
    StorageModel: {
      put: hydroState.storagePut,
      get: hydroState.storageGet,
      getMeta: hydroState.storageGetMeta,
      signDownloadLink: hydroState.storageSignDownloadLink,
    },
    UserModel: {
      getList: hydroState.userGetList,
    },
    Types: {
      ProblemId: 'ProblemId',
      Title: 'Title',
      Content: 'Content',
      Boolean: 'Boolean',
      ObjectId: 'ObjectId',
      Float: 'Float',
      String: 'String',
      Range: () => 'Range',
    },
    ValidationError: class ValidationError extends Error {},
    nanoid: () => 'mock-id',
    param: noopDecorator,
    post: noopDecorator,
  };
}, { virtual: true });

beforeEach(() => {
  hydroState.reset();
  vi.resetModules();
});

describe('Scratch problem config upsert', () => {
  it('ScratchProblemCreateHandler.prepare rejects a disabled domain before creating a problem', async () => {
    const { ScratchProblemCreateHandler } = await import('../src/http');

    const handler = new ScratchProblemCreateHandler();
    handler.pluginConfig = {
      ...DEFAULT_PLUGIN_CONFIG,
      enabledDomains: ['scratch'],
    };

    await expect(handler.prepare({ domainId: 'system' })).rejects.toThrow('Scratch plugin');
    expect(hydroState.problemAdd).not.toHaveBeenCalled();
  });

  it('首次写入时仅在 $setOnInsert 中设置 createdAt', async () => {
    const { ScratchModel } = await import('../src/model');

    const result = await ScratchModel.setProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG, {
      enabled: true,
      updatedBy: 7,
    });

    const update = hydroState.getLastUpdate('scratch.problem');
    const [storedDoc] = hydroState.getDocs('scratch.problem');

    expect(update?.update.$set).not.toHaveProperty('createdAt');
    expect(update?.update.$setOnInsert).toHaveProperty('createdAt');
    expect(update?.options).toMatchObject({ upsert: true });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      enabled: true,
      updatedBy: 7,
    });
    expect(storedDoc.createdAt).toBeInstanceOf(Date);
    expect(storedDoc.updatedAt).toBeInstanceOf(Date);
  });

  it('更新已有配置时保留原 createdAt 并刷新 updatedAt', async () => {
    const { ScratchModel } = await import('../src/model');

    const first = await ScratchModel.setProblemConfig('system', 1002, DEFAULT_PLUGIN_CONFIG, {
      enabled: true,
      submitMode: 'upload',
      updatedBy: 7,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await ScratchModel.setProblemConfig('system', 1002, DEFAULT_PLUGIN_CONFIG, {
      submitMode: 'both',
      maxScore: 120,
      updatedBy: 9,
    });

    const update = hydroState.getLastUpdate('scratch.problem');
    const [storedDoc] = hydroState.getDocs('scratch.problem').filter((doc) => doc.problemId === 1002);

    expect(update?.update.$set).not.toHaveProperty('createdAt');
    expect(update?.update.$setOnInsert).toMatchObject({ createdAt: first.createdAt });
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    expect(storedDoc.createdAt).toEqual(first.createdAt);
    expect(storedDoc.updatedAt).toEqual(second.updatedAt);
    expect(storedDoc).toMatchObject({
      submitMode: 'both',
      maxScore: 120,
      updatedBy: 9,
    });
  });

  it('ScratchProblemCreateHandler.post 初始化配置时不再触发 createdAt 冲突', async () => {
    const { ScratchProblemCreateHandler } = await import('../src/http');

    const handler = new ScratchProblemCreateHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };

    await expect(
      handler.post('system', 'Scratch Demo', 'Scratch assignment.', 'P100', false),
    ).resolves.toBeUndefined();

    const [storedDoc] = hydroState.getDocs('scratch.problem');

    expect(hydroState.problemAdd).toHaveBeenCalledWith(
      'system',
      'P100',
      'Scratch Demo',
      'Scratch assignment.',
      11,
      ['Scratch'],
      { hidden: false },
    );
    expect(handler.response).toMatchObject({
      body: { pid: 'P100' },
      redirect: '/scratch_problem_edit/P100',
    });
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      enabled: true,
      submitMode: 'editor',
      judgeMode: 'manual',
      maxScore: DEFAULT_PLUGIN_CONFIG.maxScore,
      updatedBy: 11,
    });
    expect(storedDoc.createdAt).toBeInstanceOf(Date);
    expect(storedDoc.updatedAt).toBeInstanceOf(Date);
  });

  it('ScratchProblemCreateHandler.post initializes algorithm problems for automatic IO judging', async () => {
    const { ScratchProblemCreateHandler } = await import('../src/http');

    const handler = new ScratchProblemCreateHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };

    await expect(
      handler.post('system', 'Algorithm Demo', 'Read input and write output.', 'P200', false, 'algorithm'),
    ).resolves.toBeUndefined();

    const [storedDoc] = hydroState.getDocs('scratch.problem');
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      enabled: true,
      problemKind: 'algorithm',
      submitMode: 'editor',
      judgeMode: 'dynamic',
      maxScore: DEFAULT_PLUGIN_CONFIG.maxScore,
      updatedBy: 11,
    });
  });

  it('ScratchProblemCreateHandler.post saves one-stop algorithm judging settings with 10 quick IO cases', async () => {
    const { ScratchProblemCreateHandler } = await import('../src/http');

    const handler = new ScratchProblemCreateHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    handler.args = {
      enabled: 'on',
      problemKind: 'algorithm',
      submitMode: 'both',
      judgeMode: 'hybrid',
      maxScore: '100',
      allowDownloadTemplate: 'on',
      algorithmTarget: 'Stage',
      algorithmInputName: 'input',
      algorithmOutputName: 'output',
      algorithmCompareMode: 'tokens',
      algorithmWaitMs: '300',
      algorithmTimeoutMs: '2000',
      algorithmCases: [
        '1 => 1 => 5 => 单值输入',
        '1 2 => 3 => 5 => 单行多个输入',
        '2\\n3 => 5 => 10 => 多次输入',
        '[1,2,3] => 6 => 10 => 列表数字输入',
        '["a","b"] => a b => 10 => 列表字符串输入',
        'true => 1 => 5 => 布尔输入',
        '10 20 30 => 60 => 15 => 三数求和',
        '0 => 0 => 5 => 零值',
        '* 100 200 => 300 => 20 => 隐藏大数据',
        '5\\n5\\n5 => 15 => 15 => 三行输入',
      ].join('\n'),
    };

    await expect(
      handler.post('system', 'Algorithm Demo', 'Read input and write output.', 'P201', false),
    ).resolves.toBeUndefined();

    const [storedDoc] = hydroState.getDocs('scratch.problem');
    expect(handler.response).toMatchObject({
      body: { pid: 'P201' },
      redirect: '/scratch_problem_edit/P201',
    });
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      enabled: true,
      problemKind: 'algorithm',
      submitMode: 'both',
      judgeMode: 'hybrid',
      maxScore: 100,
      judgeConfig: {
        totalScore: 100,
        algorithm: {
          target: 'Stage',
          inputVariable: 'input',
          outputVariable: 'output',
          compareMode: 'tokens',
          waitMs: 300,
          timeoutMs: 2000,
        },
      },
    });
    expect((storedDoc as any).judgeConfig.algorithm.cases).toHaveLength(10);
    expect((storedDoc as any).judgeConfig.algorithm.cases[2]).toMatchObject({
      name: '多次输入',
      input: '2\n3',
      expectedOutput: '5',
      score: 10,
      hidden: false,
    });
    expect((storedDoc as any).judgeConfig.algorithm.cases[3]).toMatchObject({
      name: '列表数字输入',
      input: [1, 2, 3],
      expectedOutput: '6',
      score: 10,
    });
    expect((storedDoc as any).judgeConfig.algorithm.cases[8]).toMatchObject({
      name: '隐藏大数据',
      hidden: true,
      score: 20,
    });
  });

  it('ScratchProblemEditHandler.post updates the problem and Scratch config together', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemEditHandler } = await import('../src/http');

    const handler = new ScratchProblemEditHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Old title',
      content: 'Old statement.',
      hidden: false,
    };
    handler.scratchConfig = defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG);
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    handler.args = {
      enabled: 'on',
      submitMode: 'both',
      judgeMode: 'manual',
      maxScore: '120',
      allowDownloadTemplate: 'on',
      disabledScratchExtensions: 'videoSensing, translate',
    };
    handler.request = {};

    await expect(
      handler.post('system', 'New title', 'New statement.', 'P101', true),
    ).resolves.toBeUndefined();

    expect(hydroState.problemGet).toHaveBeenCalledWith('system', 'P101');
    expect(hydroState.problemEdit).toHaveBeenCalledWith('system', 1001, {
      title: 'New title',
      content: 'New statement.',
      pid: 'P101',
      hidden: true,
      html: false,
    });
    const [storedDoc] = hydroState.getDocs('scratch.problem');
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      enabled: true,
      submitMode: 'both',
      maxScore: 120,
      disabledScratchExtensions: ['videoSensing', 'translate'],
      updatedBy: 11,
    });
    expect(handler.response).toMatchObject({
      redirect: '/scratch_problem_edit/P101',
    });
  });

  it('ScratchProblemConfigHandler.post stores static judgeConfig JSON', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemConfigHandler } = await import('../src/http');

    const handler = new ScratchProblemConfigHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
    };
    handler.scratchConfig = defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG);
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    handler.args = {
      enabled: 'on',
      submitMode: 'editor',
      judgeMode: 'static',
      maxScore: '100',
      judgeConfig: JSON.stringify({
        totalScore: 100,
        staticChecks: [
          { type: 'sprite_exists', name: '存在 Player', sprite: 'Player', score: 50 },
          { type: 'block_exists', name: '点击绿旗', opcode: 'event_whenflagclicked', score: 50 },
        ],
      }),
    };
    handler.request = {};

    await expect(handler.post()).resolves.toBeUndefined();

    const [storedDoc] = hydroState.getDocs('scratch.problem');
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      judgeMode: 'static',
      judgeConfig: {
        totalScore: 100,
        staticChecks: [
          { type: 'sprite_exists', name: '存在 Player', sprite: 'Player', score: 50 },
          { type: 'block_exists', name: '点击绿旗', opcode: 'event_whenflagclicked', score: 50 },
        ],
      },
    });
  });

  it('ScratchProblemConfigHandler.post stores compact algorithm IO test cases from the teacher form', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemConfigHandler } = await import('../src/http');

    const handler = new ScratchProblemConfigHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Algorithm title',
    };
    handler.scratchConfig = defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG);
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    handler.args = {
      enabled: 'on',
      problemKind: 'algorithm',
      submitMode: 'editor',
      judgeMode: 'dynamic',
      maxScore: '100',
      judgeConfig: JSON.stringify({ totalScore: 100, algorithm: { cases: [] } }),
      algorithmTarget: 'Stage',
      algorithmInputName: 'input',
      algorithmOutputName: 'output',
      algorithmCompareMode: 'tokens',
      algorithmWaitMs: '500',
      algorithmTimeoutMs: '3000',
      algorithmCases: [
        '1 2 => 3 => 30 => 样例 1',
        '* 2\\n3 => 5 => 70 => 隐藏测试',
      ].join('\n'),
    };
    handler.request = {};

    await expect(handler.post()).resolves.toBeUndefined();

    const [storedDoc] = hydroState.getDocs('scratch.problem');
    expect(storedDoc).toMatchObject({
      domainId: 'system',
      problemId: 1001,
      problemKind: 'algorithm',
      judgeMode: 'dynamic',
      judgeConfig: {
        totalScore: 100,
        algorithm: {
          target: 'Stage',
          inputVariable: 'input',
          outputVariable: 'output',
          compareMode: 'tokens',
          waitMs: 500,
          timeoutMs: 3000,
          cases: [
            {
              name: '样例 1',
              input: '1 2',
              expectedOutput: '3',
              score: 30,
              hidden: false,
            },
            {
              name: '隐藏测试',
              input: '2\n3',
              expectedOutput: '5',
              score: 70,
              hidden: true,
            },
          ],
        },
      },
    });
  });

  it('ScratchEditorHandler.get preserves contest/homework tid for editor submission', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchEditorHandler } = await import('../src/editor');

    const handler = new ScratchEditorHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
      content: 'Statement.',
    };
    handler.scratchConfig = {
      ...defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG),
      enabled: true,
      submitMode: 'editor',
    };
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    handler.request = { query: { tid: '64f000000000000000000001' } };

    await expect(handler.get()).resolves.toBeUndefined();

    expect(handler.response.body).toMatchObject({
      tid: '64f000000000000000000001',
      submitUrl: '/scratch_submit/1001',
      previewUrl: '/problem_detail/1001?scratch=0&tid=64f000000000000000000001',
      problemDescriptionUrl: '/scratch_problem_statement/1001?tid=64f000000000000000000001',
    });
  });

  it('problem/get exposes Scratch editor through the online programming entry', async () => {
    const { ScratchModel } = await import('../src/model');
    const { applyHandlers } = await import('../src/http');

    const events: Record<string, (...args: any[]) => Promise<void>> = {};
    const ctx = {
      Route: vi.fn(),
      on: vi.fn((name: string, callback: (...args: any[]) => Promise<void>) => {
        events[name] = callback;
      }),
    };

    applyHandlers(ctx, DEFAULT_PLUGIN_CONFIG);
    await ScratchModel.setProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG, {
      enabled: true,
      submitMode: 'editor',
      updatedBy: 11,
    });

    const pdoc: Record<string, any> = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
      content: [
        'Statement.',
        '',
        '<!-- hydro-scratch-actions -->',
        '',
        '---',
        '',
        '**Scratch 在线答题**',
        '',
        '[进入 Scratch 答题页面](/d/system/scratch/problem/1001/editor)',
      ].join('\n'),
    };
    const handler = {
      request: { query: { tid: '64f000000000000000000001' } },
      args: { domainId: 'system' },
      user: {
        _id: 22,
        own: () => false,
        hasPerm: () => false,
      },
      url(name: string, params: Record<string, unknown> = {}) {
        const suffix = params.pid ?? params.rid;
        return suffix === undefined ? `/${name}` : `/${name}/${suffix}`;
      },
    };

    await events['problem/get'](pdoc, handler as any);

    expect(pdoc.scratchEditorUrl).toBe('/scratch_editor/1001?tid=64f000000000000000000001');
    expect(pdoc.scratchSubmissionsUrl).toBe('/scratch_problem_submissions/1001');
    expect(pdoc.content).toContain('**进入在线编程模式**');
    expect(pdoc.content).toContain('[打开 Scratch 答题页面](/scratch_editor/1001?tid=64f000000000000000000001)');
    expect(pdoc.content).not.toContain('**Scratch 在线答题**');
    expect(pdoc.content.match(/hydro-scratch-actions/g)).toHaveLength(1);
  });

  it('ScratchProblemStatementHandler.get returns rendered statement html with rewritten problem files', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemStatementHandler } = await import('../src/http');

    const handler = new ScratchProblemStatementHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
      content: 'Look: ![cat](file://cat.png)',
      additional_file: [{ name: 'cat.png' }],
    };
    handler.scratchConfig = {
      ...defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG),
      enabled: true,
    };
    handler.request = { query: { tid: '64f000000000000000000001' } };

    await expect(handler.get()).resolves.toBeUndefined();

    expect(handler.response.body).toMatchObject({
      html: '<div class="rendered">Look: ![cat](/problem_file_download/1001/file/cat.png?tid=64f000000000000000000001)</div>',
      content: 'Look: ![cat](/problem_file_download/1001/file/cat.png?tid=64f000000000000000000001)',
    });
  });

  it('ScratchSubmissionScoreHandler.get exposes a dedicated teacher scoring page', async () => {
    const { ScratchSubmissionScoreHandler } = await import('../src/http');

    const handler = new ScratchSubmissionScoreHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
    };
    handler.rdoc = {
      _id: 'rid-1',
      pid: 1001,
      uid: 22,
      score: 0,
      status: 30,
    };
    handler.submission = {
      domainId: 'system',
      rid: 'rid-1',
      problemId: 1001,
      userId: 22,
      projectPath: 'submission/22/mock',
      originalName: 'project.sb3',
      projectSize: 100,
      source: 'editor',
      validation: {
        projectJsonSize: 1,
        unpackedSize: 1,
        assetCount: 1,
        targets: 1,
        spriteCount: 1,
        hasStage: true,
        warnings: [],
      },
      maxScore: 100,
      previewAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };

    await expect(handler.get()).resolves.toBeUndefined();

    expect(handler.response).toMatchObject({
      template: 'scratch_score.html',
      body: {
        scoreUrl: '/scratch_submission_score/rid-1',
        previewUrl: '/scratch_submission_preview/rid-1',
        submissionsUrl: '/scratch_problem_submissions/1001',
      },
    });
  });

  it('ScratchProblemSubmissionsHandler.get falls back to Hydro records when plugin metadata is missing', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemSubmissionsHandler } = await import('../src/http');

    const handler = new ScratchProblemSubmissionsHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
    };
    handler.scratchConfig = {
      ...defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG),
      enabled: true,
      maxScore: 100,
    };
    handler.request = {};
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };
    hydroState.recordGetMulti.mockReturnValue({
      sort() { return this; },
      limit() { return this; },
      async toArray() {
        return [{
          _id: 'rid-record-only',
          domainId: 'system',
          pid: 1001,
          uid: 22,
          lang: 'scratch3',
          source: 'scratch',
          score: 0,
          files: { code: '22/project-file#Scratch作品.sb3' },
          judgeAt: new Date('2026-05-26T11:47:40.443Z'),
        }];
      },
    });

    await expect(handler.get('system')).resolves.toBeUndefined();

    expect(handler.response.body).toMatchObject({
      submissions: [{
        rid: 'rid-record-only',
        problemId: 1001,
        userId: 22,
        projectPath: 'submission/22/project-file',
        originalName: 'Scratch作品.sb3',
      }],
    });
  });

  it('ScratchProblemSubmissionsHandler.get treats numeric problem owner as teacher access', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemSubmissionsHandler } = await import('../src/http');

    const handler = new ScratchProblemSubmissionsHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
      owner: 11,
    };
    handler.scratchConfig = {
      ...defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG),
      enabled: true,
      maxScore: 100,
    };
    handler.request = {};
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => false,
    };
    hydroState.recordGetMulti.mockReturnValue({
      sort() { return this; },
      limit() { return this; },
      async toArray() {
        return [{
          _id: 'rid-student',
          domainId: 'system',
          pid: 1001,
          uid: 22,
          lang: 'scratch3',
          source: 'scratch',
          score: 0,
          files: { code: '22/project-file#student.sb3' },
          judgeAt: new Date('2026-05-26T11:47:40.443Z'),
        }];
      },
    });

    await expect(handler.get('system')).resolves.toBeUndefined();

    expect(hydroState.recordGetMulti).toHaveBeenCalledWith('system', { pid: 1001 });
    expect(handler.response.body).toMatchObject({
      canManage: true,
      canReadAll: true,
      canScore: true,
      submissions: [{
        rid: 'rid-student',
        userId: 22,
      }],
    });
  });

  it('ScratchProblemSubmissionsHandler.get also searches the route pid for older records', async () => {
    const { defaultProblemConfig } = await import('../src/config');
    const { ScratchProblemSubmissionsHandler } = await import('../src/http');

    const handler = new ScratchProblemSubmissionsHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.routePid = 1;
    handler.pdoc = {
      domainId: 'system',
      docId: 1001,
      pid: 'P100',
      title: 'Scratch title',
      owner: 11,
    };
    handler.scratchConfig = {
      ...defaultProblemConfig('system', 1001, DEFAULT_PLUGIN_CONFIG),
      enabled: true,
      maxScore: 100,
    };
    handler.request = {};
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => false,
    };
    hydroState.recordGetMulti.mockImplementation((_domainId: string, query: Record<string, unknown>) => ({
      sort() { return this; },
      limit() { return this; },
      async toArray() {
        if (query.pid !== 1) return [];
        return [{
          _id: 'rid-route-pid',
          domainId: 'system',
          pid: 1,
          uid: 22,
          lang: 'scratch3',
          source: 'scratch',
          status: 0,
          score: 100,
          files: { code: '22/project-file#route.sb3' },
          judgeAt: new Date('2026-05-26T11:47:40.443Z'),
        }];
      },
    }));

    await expect(handler.get('system')).resolves.toBeUndefined();

    expect(hydroState.recordGetMulti).toHaveBeenCalledWith('system', { pid: 1 });
    expect(handler.response.body).toMatchObject({
      submissions: [{
        rid: 'rid-route-pid',
        problemId: 1,
        userId: 22,
        scored: true,
        score: 100,
      }],
    });
  });

  it('ScratchReviewQueueHandler.get lists pending submissions across problems and filters by problem', async () => {
    const { ScratchModel } = await import('../src/model');
    const { ScratchReviewQueueHandler } = await import('../src/http');

    const now = new Date();
    const validation = {
      projectJsonSize: 1,
      unpackedSize: 1,
      assetCount: 1,
      targets: 1,
      spriteCount: 1,
      hasStage: true,
      warnings: [],
    };
    await ScratchModel.addSubmission({
      domainId: 'system',
      rid: 'rid-pending-1001',
      problemId: 1001,
      userId: 21,
      projectPath: 'submission/21/pending',
      originalName: 'pending.sb3',
      projectSize: 10,
      source: 'editor',
      validation,
      maxScore: 100,
      status: 0,
      scored: false,
      previewAvailable: true,
      createdAt: now,
      updatedAt: now,
    });
    await ScratchModel.addSubmission({
      domainId: 'system',
      rid: 'rid-scored-1002',
      problemId: 1002,
      userId: 22,
      projectPath: 'submission/22/scored',
      originalName: 'scored.sb3',
      projectSize: 10,
      source: 'editor',
      validation,
      score: 100,
      maxScore: 100,
      status: 1,
      scored: true,
      previewAvailable: true,
      createdAt: new Date(now.getTime() - 1000),
      updatedAt: now,
    });
    hydroState.problemGet.mockImplementation(async (_domainId: string, pid: number) => ({
      domainId: 'system',
      docId: pid,
      pid: `P${pid}`,
      title: pid === 1001 ? 'Pending problem' : 'Scored problem',
      owner: 11,
    }));

    const handler = new ScratchReviewQueueHandler();
    handler.pluginConfig = DEFAULT_PLUGIN_CONFIG;
    handler.args = { domainId: 'system' };
    handler.request = { query: {} };
    handler.user = {
      _id: 11,
      own: () => false,
      hasPerm: () => true,
    };

    await expect(handler.get()).resolves.toBeUndefined();

    expect(handler.response).toMatchObject({
      template: 'scratch_submissions.html',
      body: {
        isGlobalQueue: true,
        totalSubmissions: 2,
        pendingCount: 1,
        statusFilter: 'waiting',
        submissions: [{
          rid: 'rid-pending-1001',
          problemId: 1001,
          problemLabel: 'P1001 Pending problem',
        }],
      },
    });

    handler.request = { query: { status: 'all', problem: 'P1002' } };
    await expect(handler.get()).resolves.toBeUndefined();

    expect(handler.response.body).toMatchObject({
      statusFilter: 'all',
      problemFilter: 'P1002',
      submissions: [{
        rid: 'rid-scored-1002',
        problemId: 1002,
      }],
    });
  });
});
