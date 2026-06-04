import { db } from 'hydrooj';
import { defaultProblemConfig, normalizeProblemConfig } from './config';
import type { PluginConfig, ScratchProblemConfig, ScratchSubmissionMeta, ScratchDraftMeta } from './types';

const problemColl = db.collection('scratch.problem');
const submissionColl = db.collection('scratch.submission');
const draftColl = db.collection('scratch.draft');

function buildCreatedAtSafeUpsert<T extends { createdAt: Date }>(doc: T) {
  const { createdAt, ...rest } = doc;
  return {
    $set: rest,
    $setOnInsert: { createdAt },
  };
}

export class ScratchModel {
  static async getProblemConfig(
    domainId: string,
    problemId: number,
    pluginConfig: PluginConfig,
  ): Promise<ScratchProblemConfig> {
    const stored = await problemColl.findOne({ domainId, problemId });
    if (!stored) return defaultProblemConfig(domainId, problemId, pluginConfig);
    return normalizeProblemConfig(domainId, problemId, pluginConfig, stored);
  }

  static async setProblemConfig(
    domainId: string,
    problemId: number,
    pluginConfig: PluginConfig,
    patch: Partial<ScratchProblemConfig>,
  ): Promise<ScratchProblemConfig> {
    const current = await ScratchModel.getProblemConfig(domainId, problemId, pluginConfig);
    const next = normalizeProblemConfig(domainId, problemId, pluginConfig, {
      ...current,
      ...patch,
      createdAt: current.createdAt,
    });
    await problemColl.updateOne(
      { domainId, problemId },
      buildCreatedAtSafeUpsert(next),
      { upsert: true },
    );
    return next;
  }

  static async addSubmission(meta: ScratchSubmissionMeta) {
    await submissionColl.insertOne(meta);
    return meta;
  }

  static async getSubmission(domainId: string, rid: any): Promise<ScratchSubmissionMeta | null> {
    return submissionColl.findOne({ domainId, rid });
  }

  static async updateSubmission(domainId: string, rid: any, patch: Partial<ScratchSubmissionMeta>) {
    return submissionColl.findOneAndUpdate(
      { domainId, rid },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }

  static getProblemSubmissions(domainId: string, problemId: number, query: Record<string, unknown> = {}) {
    return submissionColl.find({ domainId, problemId, ...query }).sort({ createdAt: -1 });
  }

  static getDomainSubmissions(domainId: string, query: Record<string, unknown> = {}) {
    return submissionColl.find({ domainId, ...query }).sort({ createdAt: -1 });
  }

  static async saveDraft(meta: ScratchDraftMeta) {
    await draftColl.updateOne(
      { domainId: meta.domainId, problemId: meta.problemId, userId: meta.userId },
      buildCreatedAtSafeUpsert({ ...meta, updatedAt: new Date() }),
      { upsert: true },
    );
    return meta;
  }

  static async getLatestDraft(domainId: string, problemId: number, userId: number): Promise<ScratchDraftMeta | null> {
    return draftColl.findOne({ domainId, problemId, userId });
  }

  static async ensureIndexes() {
    await Promise.all([
      db.ensureIndexes(
        problemColl,
        { key: { domainId: 1, problemId: 1 }, unique: true, name: 'problem' },
      ),
      db.ensureIndexes(
        submissionColl,
        { key: { domainId: 1, createdAt: -1 }, name: 'domainList' },
        { key: { domainId: 1, scored: 1, createdAt: -1 }, name: 'domainScoreList' },
        { key: { domainId: 1, problemId: 1, createdAt: -1 }, name: 'problemList' },
        { key: { domainId: 1, rid: 1 }, unique: true, name: 'record' },
        { key: { domainId: 1, userId: 1, problemId: 1, createdAt: -1 }, name: 'userProblem' },
      ),
      db.ensureIndexes(
        draftColl,
        { key: { domainId: 1, problemId: 1, userId: 1 }, unique: true, name: 'draftOwner' },
        { key: { domainId: 1, userId: 1, updatedAt: -1 }, name: 'draftRecent' },
      ),
    ]);
  }
}
