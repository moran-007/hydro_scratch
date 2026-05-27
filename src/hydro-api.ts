import {
  ContestModel,
  DomainModel,
  JudgeResultCallbackContext,
  ProblemModel,
  RecordModel,
  StorageModel,
} from 'hydrooj';

type CursorOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
};

function withDomain(domainId: string, query: Record<string, any>) {
  return domainId ? { domainId, ...query } : { ...query };
}

async function cursorToArray(cursor: any, options: CursorOptions = {}) {
  if (!cursor) return [];
  let next = cursor;
  const sortSpec = options.sort || { _id: -1 };
  if (sortSpec && typeof next.sort === 'function') {
    try {
      next = next.sort(sortSpec);
    } catch {
      const [key, direction] = Object.entries(sortSpec)[0] || [];
      if (key) next = next.sort(key, direction);
    }
  }
  if (options.limit && typeof next.limit === 'function') next = next.limit(options.limit);
  if (typeof next.toArray === 'function') return await next.toArray();
  return [];
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
    inc: (...args: any[]) => (ProblemModel as any).inc(...args),
  },

  record: {
    add: (...args: any[]) => (RecordModel as any).add(...args),
    get: (...args: any[]) => (RecordModel as any).get(...args),
    update: (...args: any[]) => (RecordModel as any).update(...args),
    async list(domainId: string, query: Record<string, any>, options: CursorOptions = {}) {
      if (typeof (RecordModel as any).getMulti === 'function') {
        try {
          return await cursorToArray((RecordModel as any).getMulti(domainId, { ...query }), options);
        } catch {
          return await listRecordsFromCollection(domainId, query, options);
        }
      }
      return await listRecordsFromCollection(domainId, query, options);
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
    updateStatus: (...args: any[]) => (ContestModel as any).updateStatus(...args),
  },

  judge: {
    end: (...args: any[]) => (JudgeResultCallbackContext as any).end(...args),
  },
};
