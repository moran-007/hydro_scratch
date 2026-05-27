import {
  ContestModel,
  DomainModel,
  JudgeResultCallbackContext,
  ProblemModel,
  RecordModel,
  StorageModel,
} from 'hydrooj';
import * as HydroRuntime from 'hydrooj';

type CursorOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
};

function withDomain(domainId: string, query: Record<string, any>) {
  return domainId ? { domainId, ...query } : { ...query };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function cursorToArray(cursor: any, options: CursorOptions = {}) {
  if (!cursor) return [];
  let next = cursor;
  const sortSpec = options.sort || { _id: -1 };
  if (sortSpec && typeof next.sort === 'function') {
    const entries = Object.entries(sortSpec);
    try {
      if (entries.length === 1) {
        const [key, direction] = entries[0];
        next = next.sort(key, direction);
      } else {
        next = next.sort(sortSpec);
      }
    } catch {
      try {
        next = next.sort(sortSpec);
      } catch {
        const [key, direction] = entries[0] || [];
        if (key) next = next.sort(key, direction);
      }
    }
  }
  if (options.limit && typeof next.limit === 'function') next = next.limit(options.limit);
  if (typeof next.toArray === 'function') return await next.toArray();
  return [];
}

function uniqueProblemIds(problemIds: any[]) {
  const values: any[] = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    if (value === undefined || value === null || value === '') return;
    const key = `${typeof value}:${String(value)}`;
    if (!seen.has(key)) {
      seen.add(key);
      values.push(value);
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const numeric = Number(value);
      const numericKey = `number:${numeric}`;
      if (!seen.has(numericKey)) {
        seen.add(numericKey);
        values.push(numeric);
      }
    }
  };
  problemIds.forEach(add);
  return values;
}

async function listRecordsFromCollection(domainId: string, query: Record<string, any>, options: CursorOptions) {
  const coll = (RecordModel as any).coll;
  if (!coll?.find) return [];
  return await cursorToArray(coll.find(withDomain(domainId, query)), options);
}

export const HydroApi = {
  problem: {
    add: (...args: any[]) => (ProblemModel as any).add(...args),
    edit: (...args: any[]) => (ProblemModel as any).edit(...args),
    get: (...args: any[]) => (ProblemModel as any).get(...args),
    async getList(domainId: string, problemIds: any[]) {
      const ids = uniqueProblemIds(problemIds)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      if (!ids.length) return {};
      if (typeof (ProblemModel as any).getList === 'function') {
        try {
          return await (ProblemModel as any).getList(domainId, ids, true, false);
        } catch {
          // Fall through to one-by-one lookup for older Hydro versions.
        }
      }
      const result: Record<string, any> = {};
      await Promise.all(ids.map(async (id) => {
        try {
          const pdoc = await (ProblemModel as any).get(domainId, id);
          if (pdoc) result[String(id)] = pdoc;
        } catch {
          // Ignore missing or hidden problems in review list decoration.
        }
      }));
      return result;
    },
    inc: (...args: any[]) => (ProblemModel as any).inc(...args),
  },

  record: {
    add: (...args: any[]) => (RecordModel as any).add(...args),
    get: (...args: any[]) => (RecordModel as any).get(...args),
    update: (...args: any[]) => (RecordModel as any).update(...args),
    async list(domainId: string, query: Record<string, any>, options: CursorOptions = {}) {
      if (typeof (RecordModel as any).getMulti === 'function') {
        try {
          const docs = await cursorToArray((RecordModel as any).getMulti(domainId, { ...query }), options);
          if (docs.length) return docs;
          return await listRecordsFromCollection(domainId, query, options);
        } catch {
          return await listRecordsFromCollection(domainId, query, options);
        }
      }
      return await listRecordsFromCollection(domainId, query, options);
    },
    async listByProblems(domainId: string, problemIds: any[], uid?: number, options: CursorOptions = {}) {
      const pids = uniqueProblemIds(problemIds);
      if (!pids.length) return [];
      const query: Record<string, any> = {
        ...(uid === undefined ? {} : { uid }),
        pid: pids.length === 1 ? pids[0] : { $in: pids },
      };
      return await this.list(domainId, query, options);
    },
    async listScratchCandidates(domainId: string, uid?: number, options: CursorOptions = {}) {
      const query: Record<string, any> = {
        ...(uid === undefined ? {} : { uid }),
        $or: [
          { lang: 'scratch3' },
          { lang: 'scratch' },
          { source: 'scratch' },
          { 'files.code': /#.*\.sb3$/i },
          { code: /Scratch project submitted|\/scratch\/problem\//i },
          { judgeTexts: /Scratch submission|Scratch preview|Scratch history|Manual Scratch score/i },
        ],
      };
      const docs = await listRecordsFromCollection(domainId, query, options);
      if (docs.length) return docs;
      const fallbackQuery = uid === undefined ? {} : { uid };
      return await this.list(domainId, fallbackQuery, { sort: options.sort, limit: options.limit || 500 });
    },
  },

  storage: {
    get: (...args: any[]) => (StorageModel as any).get(...args),
    getMeta: (...args: any[]) => (StorageModel as any).getMeta(...args),
    put: (...args: any[]) => (StorageModel as any).put(...args),
    signDownloadLink: (...args: any[]) => (StorageModel as any).signDownloadLink(...args),
  },

  domain: {
    incUserInDomain: (...args: any[]) => (DomainModel as any).incUserInDomain(...args),
  },

  contest: {
    get: (...args: any[]) => (ContestModel as any).get(...args),
    async list(domainId: string, query: Record<string, any>, options: CursorOptions = {}) {
      if (typeof (ContestModel as any).getMulti !== 'function') return [];
      return await cursorToArray((ContestModel as any).getMulti(domainId, query), options);
    },
    async searchByTitle(domainId: string, title: string, options: CursorOptions = {}) {
      const text = String(title || '').trim();
      if (!text) return [];
      return await this.list(domainId, { title: new RegExp(escapeRegExp(text), 'i') }, {
        sort: options.sort,
        limit: options.limit || 20,
      });
    },
    updateStatus: (...args: any[]) => (ContestModel as any).updateStatus(...args),
  },

  judge: {
    end: (...args: any[]) => (JudgeResultCallbackContext as any).end(...args),
  },

  user: {
    async getList(domainId: string, uids: number[]) {
      const uniqueUids = [...new Set((uids || []).filter((uid) => typeof uid === 'number'))];
      if (!uniqueUids.length) return {};
      if (typeof (HydroRuntime as any).UserModel?.getList === 'function') {
        try {
          return await (HydroRuntime as any).UserModel.getList(domainId, uniqueUids);
        } catch {
          return {};
        }
      }
      return {};
    },
  },
};
