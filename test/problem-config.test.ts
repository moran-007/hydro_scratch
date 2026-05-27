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
  const contestUpdateStatus = vi.fn();
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
      contestUpdateStatus.mockReset();
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
            sort(sortSpec: Record<string, number>) {
              const [key, direction] = Object.entries(sortSpec)[0] || [];
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
    contestUpdateStatus,
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
      redirect: '/problem_detail/P100',
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
});
