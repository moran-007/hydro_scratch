import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileTooLargeError,
  ForbiddenError,
  Handler,
  NotFoundError,
  PERM,
  STATUS,
  Types,
  ValidationError,
  nanoid,
  param,
  post,
} from 'hydrooj';
import { ScratchAssetProxyHandler, buildScratchEditorUrl } from './assets';
import { defaultProblemConfig, pluginEnabledForDomain } from './config';
import {
  ScratchDraftLoadHandler,
  ScratchDraftProjectHandler,
  ScratchDraftSaveHandler,
  ScratchEditorHandler,
} from './editor';
import { ScratchValidationError } from './errors';
import { HydroApi } from './hydro-api';
import { ScratchModel } from './model';
import {
  createScratchProblemPackageZip,
  readScratchProblemPackage,
} from './package';
import { limitsFromMB, validateScratchProject } from './sb3';
import {
  judgeConfigHasAlgorithmCases,
  judgeConfigHasTaskChecks,
  judgeScratchAlgorithmFile,
  judgeScratchFile,
  normalizeJudgeConfig,
  prepareJudgeConfigForMode,
  stringifyJudgeConfig,
} from './static-judge';
import type {
  PluginConfig,
  ScratchAlgorithmCase,
  ScratchAlgorithmCompareMode,
  ScratchAlgorithmConfig,
  ScratchAlgorithmValue,
  ScratchProblemConfig,
  ScratchProblemKind,
  ScratchSubmitSource,
  ScratchSubmissionMeta,
} from './types';

const SCRATCH_LANG = 'scratch3';
const STATUS_WAITING = STATUS?.STATUS_WAITING ?? 0;
const STATUS_IGNORED = STATUS?.STATUS_IGNORED ?? 30;
const STATUS_SYSTEM_ERROR = STATUS?.STATUS_SYSTEM_ERROR ?? STATUS.STATUS_WRONG_ANSWER;
const SCRATCH_ACTIONS_MARKER = '<!-- hydro-scratch-actions -->';

function ensurePluginDomainEnabled(pluginConfig: PluginConfig, domainId: unknown) {
  if (!pluginEnabledForDomain(pluginConfig, domainId)) throw new NotFoundError('Scratch plugin');
}

function parseBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseProblemKind(value: unknown): ScratchProblemKind {
  return value === 'algorithm' ? 'algorithm' : 'task';
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* fall through */ }
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function scoreToStatus(score: number, maxScore: number) {
  return score >= maxScore ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
}

function autoJudgeEnabled(config: ScratchProblemConfig) {
  if (config.judgeMode === 'manual') return false;
  const judgeConfig = prepareJudgeConfigForMode(config.judgeConfig, config.maxScore, config.judgeMode);
  return isAlgorithmProblem(config)
    ? judgeConfigHasAlgorithmCases(judgeConfig)
    : judgeConfigHasTaskChecks(judgeConfig);
}

function isAlgorithmProblem(config: ScratchProblemConfig) {
  return config.problemKind === 'algorithm';
}

function autoJudgeSummaryText(result: NonNullable<ScratchSubmissionMeta['autoJudgeResult']>) {
  return [
    `Scratch ${result.mode} auto judge finished.`,
    `Score: ${result.totalScore}/${result.maxScore}`,
    `Passed checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`,
  ];
}

function autoJudgeFailedText(error: string) {
  return [
    'Scratch auto judge failed.',
    error,
    'The submission is waiting for manual score.',
  ];
}

function autoJudgeTestCases(result: NonNullable<ScratchSubmissionMeta['autoJudgeResult']>) {
  if (!result.details.length) {
    const status = result.passed ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
    return [{
      id: 0,
      subtaskId: 0,
      status,
      score: result.totalScore,
      time: 0,
      memory: 0,
      message: `Scratch ${result.mode} auto judge: ${result.totalScore}/${result.maxScore}`,
    }];
  }

  return result.details.map((detail, index) => ({
    id: index,
    subtaskId: 0,
    status: detail.passed ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER,
    score: detail.score,
    time: 0,
    memory: 0,
    message: detail.hint ? `${detail.message} Hint: ${detail.hint}` : detail.message,
  }));
}

function autoJudgeRecordPatch(
  result: ScratchSubmissionMeta['autoJudgeResult'] | undefined,
  error: string | undefined,
) {
  if (result) {
    const status = scoreToStatus(result.totalScore, result.maxScore);
    return {
      status,
      score: result.totalScore,
      judgeTexts: autoJudgeSummaryText(result),
      testCases: autoJudgeTestCases(result),
      message: `Scratch ${result.mode} auto judge: ${result.totalScore}/${result.maxScore}`,
    };
  }

  if (error) {
    return {
      status: STATUS_WAITING,
      score: 0,
      judgeTexts: autoJudgeFailedText(error),
      testCases: [{
        id: 0,
        subtaskId: 0,
        status: STATUS_SYSTEM_ERROR,
        score: 0,
        time: 0,
        memory: 0,
        message: `Scratch auto judge failed: ${error}`,
      }],
      message: `Scratch auto judge failed: ${error}`,
    };
  }

  return {
    status: STATUS_WAITING,
    score: 0,
    judgeTexts: undefined,
    testCases: [{
      id: 0,
      subtaskId: 0,
      status: STATUS_WAITING,
      score: 0,
      time: 0,
      memory: 0,
      message: 'Scratch project saved without automatic judging.',
    }],
    message: 'Scratch project saved without automatic judging.',
  };
}

async function syncHydroScoreState(
  domainId: string,
  rid: any,
  pid: number,
  uid: number,
  tid: any,
  patch: ReturnType<typeof autoJudgeRecordPatch>,
  judger: string | number,
) {
  await Promise.all([
    HydroApi.problem.updateStatus(domainId, pid, uid, rid, patch.status, patch.score),
    tid && HydroApi.contest.updateStatus(domainId, tid, uid, rid, pid, {
      status: patch.status,
      score: patch.score,
      lang: SCRATCH_LANG,
    }),
  ].filter(Boolean));
  if (patch.status === STATUS_WAITING) return;
  await HydroApi.judge.end(domainId, rid, {
    status: patch.status,
    score: patch.score,
    time: 0,
    memory: 0,
    message: patch.message,
    judger,
  });
}

async function contestReturnInfo(handler: Handler, domainId: string, tid: any) {
  if (!tid) return { returnListUrl: '', returnListLabel: '', contestRule: '', isContest: false };
  try {
    const tdoc = await HydroApi.contest.get(domainId, tid);
    if (tdoc?.rule === 'homework') {
      return {
        returnListUrl: handler.url('homework_detail', { tid }),
        returnListLabel: '返回作业',
        contestRule: 'homework',
        isContest: false,
      };
    }
    return {
      returnListUrl: handler.url('contest_problemlist', { tid }),
      returnListLabel: '返回比赛题目列表',
      contestRule: String(tdoc?.rule || ''),
      isContest: true,
    };
  } catch {
    // Fall back to the contest problem list route below.
  }
  return {
    returnListUrl: handler.url('contest_problemlist', { tid }),
    returnListLabel: '返回比赛题目列表',
    contestRule: 'contest',
    isContest: true,
  };
}

function filenameFor(originalName: string | undefined, fallback: string) {
  const name = (originalName || fallback).replace(/[\\/:*?"<>|]/g, '_');
  return name.toLowerCase().endsWith('.sb3') ? name : `${name}.sb3`;
}

function packageFilenameFor(originalName: string | undefined, fallback: string) {
  return (originalName || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

async function validateUploadedScratchProject(filePath: string, originalName: string, config: ScratchProblemConfig) {
  try {
    return await validateScratchProject(filePath, originalName, limitsFromMB(config));
  } catch (error) {
    if (error instanceof ScratchValidationError) throw new ValidationError(`${error.code}: ${error.message}`);
    throw error;
  }
}

function hasQueryFlag(handler: Handler, name: string) {
  const value = handler.request.query?.[name] ?? handler.args?.[name];
  return value !== undefined && value !== null && value !== '' && value !== '0' && value !== false;
}

function appendQuery(url: string, query: Record<string, string | number | boolean>) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  if (!search.toString()) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${search.toString()}`;
}

function safeLocalUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text || /[\r\n]/.test(text)) return '';
  if (!text.startsWith('/') || text.startsWith('//')) return '';
  return text;
}

function getQueryValue(handler: Handler, name: string) {
  return handler.request.query?.[name] ?? handler.args?.[name];
}

function buildHandlerUrl(
  handler: Handler,
  name: string,
  params: Record<string, unknown>,
  query: Record<string, string | number | boolean | undefined> = {},
) {
  const cleanQuery = Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Record<string, string | number | boolean>;
  const base = handler.url(name, params);
  return Object.keys(cleanQuery).length ? appendQuery(base, cleanQuery) : base;
}

function sameUserId(left: unknown, right: unknown) {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
}

function includesUserId(value: unknown, userId: unknown) {
  if (Array.isArray(value)) return value.some((item) => sameUserId(item, userId));
  return sameUserId(value, userId);
}

function userOwnsProblem(user: any, pdoc: any) {
  if (!user || !pdoc) return false;
  if (typeof user.own === 'function') {
    try {
      if (user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) return true;
    } catch { /* fall through to field checks */ }
  }
  return includesUserId(pdoc.owner, user._id) || includesUserId(pdoc.maintainer, user._id);
}

function userCanManageProblem(user: any, pdoc: any) {
  return userOwnsProblem(user, pdoc) || user?.hasPerm?.(PERM.PERM_EDIT_PROBLEM);
}

function userCanReadAllScratchRecords(user: any, pdoc: any) {
  return userCanManageProblem(user, pdoc) || user?.hasPerm?.(PERM.PERM_READ_RECORD_CODE);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteScratchProblemActionUrls(pdoc: any, handler: Handler, content: string) {
  const tid = getQueryValue(handler, 'tid') as string | undefined;
  const editorUrl = buildHandlerUrl(handler, 'scratch_editor', { pid: pdoc.docId }, { tid });
  const pidPattern = escapeRegExp(String(pdoc.docId));
  const markdownEditorLink = new RegExp(`\\((?:https?:\\/\\/[^)\\s]+)?[^)\\s]*\\/scratch\\/problem\\/${pidPattern}\\/editor(?:\\?[^)]*)?\\)`, 'g');
  const htmlEditorHref = new RegExp(`href=(["'])(?:https?:\\/\\/[^"']+)?[^"']*\\/scratch\\/problem\\/${pidPattern}\\/editor(?:\\?[^"']*)?\\1`, 'g');
  return content
    .replace(markdownEditorLink, `(${editorUrl})`)
    .replace(htmlEditorHref, (_raw, quote) => `href=${quote}${editorUrl}${quote}`);
}

function buildScratchProblemEntry(pdoc: any, handler: Handler) {
  const tid = getQueryValue(handler, 'tid') as string | undefined;
  return {
    editorUrl: buildHandlerUrl(handler, 'scratch_editor', { pid: pdoc.docId }, { tid }),
    submissionsUrl: buildHandlerUrl(handler, 'scratch_problem_submissions', { pid: pdoc.docId }),
    editUrl: buildHandlerUrl(handler, 'scratch_problem_edit', { pid: pdoc.docId }),
  };
}

function exposeScratchProblemEntry(pdoc: any, handler: Handler, config: ScratchProblemConfig) {
  if (!config.enabled || !['editor', 'both'].includes(config.submitMode)) return;
  const entry = buildScratchProblemEntry(pdoc, handler);
  pdoc.scratchEditorUrl = entry.editorUrl;
  pdoc.scratchSubmissionsUrl = entry.submissionsUrl;
  pdoc.scratchProblemEditUrl = entry.editUrl;
  pdoc.scratchSubmitMode = config.submitMode;
}

function buildScratchProblemActions(pdoc: any, handler: Handler) {
  const { editorUrl, submissionsUrl, editUrl } = buildScratchProblemEntry(pdoc, handler);
  const canManage = userCanManageProblem(handler.user, pdoc);
  const managerLinks = canManage
    ? `\n\n教师入口：[查看提交 / 手动评分](${submissionsUrl}) | [编辑 Scratch 题目](${editUrl})`
    : '';
  return `${SCRATCH_ACTIONS_MARKER}

---

**进入在线编程模式**

[打开 Scratch 答题页面](${editorUrl}) | [查看我的提交](${submissionsUrl})
${managerLinks}`;
}

function appendScratchProblemActions(pdoc: any, handler: Handler, config: ScratchProblemConfig) {
  appendScratchProblemActionsSafe(pdoc, handler, config);
  return;
  if (!config.enabled || typeof pdoc.content !== 'string') return;
  pdoc.content = rewriteScratchProblemActionUrls(pdoc, handler, pdoc.content);
  if (pdoc.content.includes(SCRATCH_ACTIONS_MARKER)) return;
  const tid = getQueryValue(handler, 'tid') as string | undefined;
  const editorUrl = buildHandlerUrl(handler, 'scratch_editor', { pid: pdoc.docId }, { tid });
  const submissionsUrl = buildHandlerUrl(handler, 'scratch_problem_submissions', { pid: pdoc.docId });
  const editUrl = buildHandlerUrl(handler, 'scratch_problem_edit', { pid: pdoc.docId });
  const canManage = userCanManageProblem(handler.user, pdoc);
  const managerLinks = canManage
    ? `\n\n教师入口：[查看提交 / 手动评分](${submissionsUrl}) | [编辑 Scratch 题目](${editUrl})`
    : '';
  pdoc.content = `${pdoc.content}

${SCRATCH_ACTIONS_MARKER}

---

**Scratch 在线答题**

[打开 Scratch 在线编辑器](${editorUrl})
${managerLinks}`;
}

function appendScratchProblemActionsSafe(pdoc: any, handler: Handler, config: ScratchProblemConfig) {
  if (!config.enabled || typeof pdoc.content !== 'string') return;
  exposeScratchProblemEntry(pdoc, handler, config);
  const rewrittenContent = rewriteScratchProblemActionUrls(pdoc, handler, pdoc.content);
  const baseContent = stripScratchActions(rewrittenContent);
  pdoc.content = `${baseContent}

${buildScratchProblemActions(pdoc, handler)}`;
  return;
  pdoc.content = rewriteScratchProblemActionUrls(pdoc, handler, pdoc.content);
  if (pdoc.content.includes(SCRATCH_ACTIONS_MARKER)) return;
  const tid = getQueryValue(handler, 'tid') as string | undefined;
  const editorUrl = buildHandlerUrl(handler, 'scratch_editor', { pid: pdoc.docId }, { tid });
  const submissionsUrl = buildHandlerUrl(handler, 'scratch_problem_submissions', { pid: pdoc.docId });
  const editUrl = buildHandlerUrl(handler, 'scratch_problem_edit', { pid: pdoc.docId });
  const canManage = userCanManageProblem(handler.user, pdoc);
  const managerLinks = canManage
    ? `\n\n教师入口：[查看提交 / 手动评分](${submissionsUrl}) | [编辑 Scratch 题目](${editUrl})`
    : '';
  pdoc.content = `${pdoc.content}

${SCRATCH_ACTIONS_MARKER}

---

**Scratch 在线答题**

[进入 Scratch 答题页面](${editorUrl}) | [查看我的提交](${submissionsUrl})
${managerLinks}`;
}

function recordId(rdoc: any) {
  return rdoc?._id ?? rdoc?.rid;
}

function sameRecordId(left: any, right: any) {
  if (left === right) return true;
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
}

function recordCreatedAt(rdoc: any) {
  const timestamp = rdoc?._id?.getTimestamp?.();
  if (timestamp instanceof Date) return timestamp;
  if (rdoc?.judgeAt instanceof Date) return rdoc.judgeAt;
  return new Date();
}

function getProblemIdCandidates(pdoc: any, routePid?: string | number) {
  const values: unknown[] = [pdoc?.docId, pdoc?.pid, routePid];
  const result: any[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const key = `${typeof value}:${String(value)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const numeric = Number(value);
      const numericKey = `number:${numeric}`;
      if (!seen.has(numericKey)) {
        seen.add(numericKey);
        result.push(numeric);
      }
    }
  };
  values.forEach(add);
  return result;
}

function textContainsProblemLink(value: unknown, problemIds: any[]) {
  if (!value) return false;
  const text = Array.isArray(value) ? value.join('\n') : String(value);
  return problemIds.some((id) => {
    const encoded = encodeURIComponent(String(id));
    return text.includes(`/problem/${id}/`) || text.includes(`/problem/${encoded}/`);
  });
}

function recordBelongsToProblem(rdoc: any, problemIds: any[]) {
  if (problemIds.some((id) => sameRecordId(rdoc?.pid, id))) return true;
  if (textContainsProblemLink(rdoc?.code, problemIds)) return true;
  if (textContainsProblemLink(rdoc?.judgeTexts, problemIds)) return true;
  return false;
}

function isRecordScored(rdoc: any) {
  if (!rdoc) return false;
  const score = Number(rdoc.score);
  if (Number.isFinite(score) && score > 0) return true;
  const pendingStatuses = [
    STATUS_WAITING,
    STATUS_IGNORED,
    STATUS?.STATUS_JUDGING,
    STATUS?.STATUS_COMPILING,
    STATUS?.STATUS_FETCHED,
  ].filter((item) => item !== undefined).map(Number);
  if (rdoc.status !== undefined && !pendingStatuses.includes(Number(rdoc.status))) return true;
  const texts = Array.isArray(rdoc.judgeTexts) ? rdoc.judgeTexts.join('\n') : String(rdoc.judgeTexts || '');
  return /Manual Scratch score|Scratch score/i.test(texts);
}

function recordStatusLabel(status: unknown) {
  const value = Number(status);
  if (value === STATUS.STATUS_ACCEPTED) return 'Accepted';
  if (value === STATUS.STATUS_WRONG_ANSWER) return 'Wrong Answer';
  if (value === STATUS_WAITING) return 'Waiting for manual score';
  if (value === STATUS_IGNORED) return 'Waiting for manual score';
  if (Number.isFinite(value)) return `Status ${value}`;
  return 'Unknown';
}

function formatDateTime(value: unknown) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value as any);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function compactRecordId(value: unknown) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

function recordProblemId(rdoc: any) {
  return rdoc?.pid ?? rdoc?.problemId;
}

function recordContestId(rdoc: any) {
  const value = rdoc?.contest;
  if (!value) return '';
  const text = typeof value?.toHexString === 'function' ? value.toHexString() : String(value);
  if (!text || /^0{24}$/.test(text) || /^0{23}[01]$/.test(text)) return '';
  return text;
}

function contestDocId(tdoc: any) {
  return tdoc?.docId ?? tdoc?._id;
}

function normalizedQueryText(value: unknown) {
  return String(value || '').trim();
}

function problemDisplayLabel(pdoc: any, fallbackId: unknown) {
  const docId = pdoc?.docId ?? fallbackId;
  const pid = pdoc?.pid || normalizeProblemPid(undefined, docId);
  return pdoc?.title ? `${pid} ${pdoc.title}` : String(pid);
}

function submissionFilterValue(value: unknown, allowed: string[], fallback: string) {
  const text = String(value || fallback).toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function isScratchRecord(rdoc: any) {
  if (!rdoc) return false;
  if ([SCRATCH_LANG, 'scratch'].includes(String(rdoc.lang || '').toLowerCase())) return true;
  if (rdoc.source === 'scratch') return true;
  const codeFile = String(rdoc.files?.code || '');
  if (/\.sb3(?:$|[#?])/i.test(codeFile) || /#.*\.sb3$/i.test(codeFile)) return true;
  const codeText = Array.isArray(rdoc.code) ? rdoc.code.join('\n') : String(rdoc.code || '');
  if (/Scratch project submitted|\/scratch\/problem\//i.test(codeText)) return true;
  const judgeText = Array.isArray(rdoc.judgeTexts) ? rdoc.judgeTexts.join('\n') : String(rdoc.judgeTexts || '');
  return /Scratch submission|Scratch preview|Scratch history|Manual Scratch score/i.test(judgeText);
}

function parseRecordProjectFile(rdoc: any) {
  const raw = rdoc?.files?.code;
  if (!raw || typeof raw !== 'string') return null;
  const [storageId, ...nameParts] = raw.split('#');
  if (!storageId) return null;
  return {
    projectPath: `submission/${storageId}`,
    originalName: nameParts.join('#') || 'scratch-project.sb3',
  };
}

function buildEmptyValidation() {
  return {
    projectJsonSize: 0,
    unpackedSize: 0,
    assetCount: 0,
    targets: 0,
    spriteCount: 0,
    hasStage: false,
    warnings: ['Scratch metadata was rebuilt from the Hydro record.'],
  };
}

function buildSubmissionFromRecord(
  domainId: string,
  pdoc: any,
  rdoc: any,
  config: ScratchProblemConfig,
): ScratchSubmissionMeta | null {
  const rid = recordId(rdoc);
  const file = parseRecordProjectFile(rdoc);
  if (!rid || !file) return null;
  const createdAt = recordCreatedAt(rdoc);
  return {
    domainId,
    rid,
    problemId: rdoc.pid ?? pdoc.docId,
    userId: rdoc.uid,
    projectPath: file.projectPath,
    originalName: file.originalName,
    projectSize: 0,
    source: 'editor',
    validation: buildEmptyValidation(),
    score: rdoc.score,
    maxScore: config.maxScore || 100,
    status: rdoc.status,
    scored: isRecordScored(rdoc),
    previewAvailable: true,
    createdAt,
    updatedAt: rdoc.judgeAt instanceof Date ? rdoc.judgeAt : createdAt,
  };
}

function mergeSubmissionRecords(metaDocs: ScratchSubmissionMeta[], fallbackDocs: ScratchSubmissionMeta[]) {
  const merged = metaDocs.map((item) => ({ ...item }));
  for (const fallback of fallbackDocs) {
    const existing = merged.find((item) => sameRecordId(item.rid, fallback.rid));
    if (!existing) {
      merged.push(fallback);
      continue;
    }
    if (existing.score === undefined && fallback.score !== undefined) existing.score = fallback.score;
    if (existing.status === undefined && fallback.status !== undefined) existing.status = fallback.status;
    if (!existing.scored && fallback.scored) existing.scored = true;
    if (!existing.manualScoreAt && fallback.scored) existing.updatedAt = fallback.updatedAt;
  }
  return merged.sort((left, right) => {
    const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : new Date(left.createdAt).getTime();
    const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : new Date(right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

async function listScratchSubmissionMeta(
  domainId: string,
  problemIds: any[],
  query: Record<string, unknown>,
) {
  const docs: ScratchSubmissionMeta[] = [];
  for (const problemId of problemIds) {
    const rows = await ScratchModel.getProblemSubmissions(domainId, problemId as number, query).limit(100).toArray();
    for (const row of rows) {
      if (!docs.some((item) => sameRecordId(item.rid, row.rid))) docs.push(row);
    }
  }
  return docs;
}

function addUniqueRecords(target: any[], rows: any[]) {
  for (const row of rows || []) {
    const rid = recordId(row);
    if (rid && !target.some((item) => sameRecordId(recordId(item), rid))) target.push(row);
  }
}

async function listScratchRecordsForProblem(
  domainId: string,
  problemIds: any[],
  uid: number | undefined,
) {
  const docs: any[] = [];
  const ownerQuery = uid === undefined ? {} : { uid };
  addUniqueRecords(docs, await HydroApi.record.listByProblems(domainId, problemIds, uid, { sort: { _id: -1 }, limit: uid === undefined ? 1000 : 500 }));
  for (const problemId of problemIds) {
    addUniqueRecords(docs, await HydroApi.record.list(domainId, { ...ownerQuery, pid: problemId }, { sort: { _id: -1 }, limit: 100 }));
  }
  addUniqueRecords(docs, await HydroApi.record.listScratchCandidates(domainId, uid, { sort: { _id: -1 }, limit: uid === undefined ? 1000 : 500 }));
  const scratchDocs = docs.filter((rdoc) => isScratchRecord(rdoc) && !!parseRecordProjectFile(rdoc));
  const problemDocs = scratchDocs.filter((rdoc) => recordBelongsToProblem(rdoc, problemIds));
  return problemDocs.length ? problemDocs : scratchDocs;
}

async function listScratchRecordsForDomain(domainId: string) {
  const docs = await HydroApi.record.listScratchCandidates(domainId, undefined, { sort: { _id: -1 }, limit: 2000 });
  return docs.filter((rdoc: any) => isScratchRecord(rdoc) && !!parseRecordProjectFile(rdoc));
}

async function listScratchRecordsForContests(
  domainId: string,
  contestDocs: any[],
  uid: number | undefined,
) {
  const contestValues: any[] = [];
  const seen = new Set<string>();
  const addContestValue = (value: any) => {
    if (value === undefined || value === null || value === '') return;
    for (const item of [value, String(value)]) {
      const key = `${typeof item}:${String(item)}`;
      if (!seen.has(key)) {
        seen.add(key);
        contestValues.push(item);
      }
    }
  };
  for (const tdoc of contestDocs) addContestValue(contestDocId(tdoc));
  if (!contestValues.length) return [];
  const ownerQuery = uid === undefined ? {} : { uid };
  const query = {
    ...ownerQuery,
    contest: contestValues.length === 1 ? contestValues[0] : { $in: contestValues },
  };
  const docs = await HydroApi.record.list(domainId, query, { sort: { _id: -1 }, limit: uid === undefined ? 2000 : 500 });
  return docs.filter((rdoc: any) => isScratchRecord(rdoc) && !!parseRecordProjectFile(rdoc));
}

async function buildFallbackSubmissionsForRecords(
  domainId: string,
  rdocs: any[],
  pluginConfig: PluginConfig,
) {
  const problemIds = [...new Set((rdocs || [])
    .map((rdoc) => Number(recordProblemId(rdoc)))
    .filter((pid) => Number.isFinite(pid)))];
  const pdict = await HydroApi.problem.getList(domainId, problemIds);
  const configs = new Map<number, ScratchProblemConfig>();
  await Promise.all(problemIds.map(async (problemId) => {
    configs.set(problemId, await ScratchModel.getProblemConfig(domainId, problemId, pluginConfig));
  }));
  return (rdocs || [])
    .map((rdoc) => {
      const problemId = Number(recordProblemId(rdoc));
      if (!Number.isFinite(problemId)) return null;
      const pdoc = pdict?.[problemId] || pdict?.[String(problemId)] || { docId: problemId };
      const config = configs.get(problemId);
      if (!config) return null;
      return buildSubmissionFromRecord(domainId, pdoc, rdoc, config);
    })
    .filter(Boolean) as ScratchSubmissionMeta[];
}

async function buildSubmissionRows(handler: Handler, domainId: string, docs: ScratchSubmissionMeta[], rdocs: any[]) {
  const recordByRid = new Map<string, any>();
  for (const rdoc of rdocs || []) {
    const rid = recordId(rdoc);
    if (rid) recordByRid.set(String(rid), rdoc);
  }
  const userIds = docs.map((item) => Number(item.userId)).filter((uid) => Number.isFinite(uid));
  const udict = await HydroApi.user.getList(domainId, userIds);
  const problemIds = docs
    .map((item) => recordProblemId(recordByRid.get(String(item.rid))) ?? item.problemId)
    .filter((pid) => pid !== undefined && pid !== null && pid !== '');
  const pdict = await HydroApi.problem.getList(domainId, problemIds);
  const contestIds = new Map<string, any>();
  for (const rdoc of rdocs || []) {
    const contestId = recordContestId(rdoc);
    if (contestId && !contestIds.has(contestId)) contestIds.set(contestId, rdoc.contest);
  }
  const contestDict: Record<string, any> = {};
  await Promise.all([...contestIds].map(async ([tid, contestValue]) => {
    try {
      contestDict[tid] = await HydroApi.contest.get(domainId, contestValue);
    } catch {
      contestDict[tid] = null;
    }
  }));
  return docs.map((item) => {
    const rdoc = recordByRid.get(String(item.rid));
    const uid = Number(item.userId);
    const udoc = udict?.[uid] || udict?.[String(uid)] || {};
    const problemId = recordProblemId(rdoc) ?? item.problemId;
    const rowPdoc = pdict?.[problemId] || pdict?.[String(problemId)] || {};
    const contestId = recordContestId(rdoc);
    const tdoc = contestId ? contestDict[contestId] : null;
    const originType = !contestId ? 'normal' : tdoc?.rule === 'homework' ? 'homework' : 'contest';
    const originLabel = originType === 'normal'
      ? '常规提交'
      : tdoc?.title || (originType === 'homework' ? '作业' : '比赛');
    const originUrl = contestId
      ? handler.url(originType === 'homework' ? 'homework_detail' : 'contest_detail', { tid: contestId })
      : '';
    const status = rdoc?.status ?? item.status;
    const scored = !!item.scored || isRecordScored(rdoc);
    return {
      ...item,
      userId: rdoc?.uid ?? item.userId,
      userName: udoc.displayName || udoc.uname || String(item.userId),
      ridText: compactRecordId(item.rid),
      problemId,
      problemLabel: problemDisplayLabel(rowPdoc, problemId),
      problemUrl: handler.url('problem_detail', { pid: problemId }),
      canScore: userCanManageProblem(handler.user, rowPdoc),
      submitMethod: item.source || 'editor',
      sourceType: originType,
      sourceLabel: originLabel,
      sourceUrl: originUrl,
      judgeStatus: status,
      judgeStatusLabel: recordStatusLabel(status),
      scored,
      score: item.score ?? rdoc?.score,
      recordUrl: handler.url('record_detail', { rid: item.rid }),
      previewUrl: handler.url('scratch_submission_preview', { rid: item.rid }),
      downloadUrl: handler.url('scratch_submission_project', { rid: item.rid }),
      scoreUrl: handler.url('scratch_submission_score', { rid: item.rid }),
      createdAtText: formatDateTime(item.createdAt),
    };
  });
}

function filterSubmissionRows(rows: any[], originFilter: string, statusFilter: string, problemFilter = '') {
  const normalizedProblemFilter = normalizedQueryText(problemFilter).toLowerCase();
  return rows.filter((item) => {
    if (originFilter !== 'all' && item.sourceType !== originFilter) return false;
    if (statusFilter === 'waiting' && item.scored) return false;
    if (statusFilter === 'scored' && !item.scored) return false;
    if (normalizedProblemFilter) {
      const problemText = `${item.problemId || ''} ${item.problemLabel || ''}`.toLowerCase();
      if (!problemText.includes(normalizedProblemFilter)) return false;
    }
    return true;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rewriteProblemFileUrls(handler: Handler, pdoc: any, content: string, tid?: string) {
  return content.replace(/file:\/\/([^ \n)\\"]+)/g, (raw, fileinfo: string) => {
    const [filenameWithEncoding, query = ''] = fileinfo.split('?');
    let filename = filenameWithEncoding;
    try {
      filename = decodeURIComponent(filenameWithEncoding);
    } catch { /* keep original */ }
    if (pdoc.additional_file?.length && !pdoc.additional_file.find((item: any) => item.name === filename)) return raw;
    const base = handler.url('problem_file_download', { pid: pdoc.docId, filename });
    const params = new URLSearchParams(query);
    if (tid) params.set('tid', String(tid));
    const suffix = params.toString();
    return suffix ? `${base}?${suffix}` : base;
  });
}

function normalizeProblemPid(pid: string | number | undefined, fallback: string | number) {
  const next = pid === undefined || pid === null || pid === '' ? fallback : pid;
  return typeof next === 'string' ? next : `P${next}`;
}

function validateImportPid(pid: string) {
  if (/^\d+$/.test(pid)) return '';
  if (pid && !/^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(pid)) throw new ValidationError('pid');
  return pid;
}

function portableProblemPid(pdoc: any, routePid?: string | number) {
  const pid = pdoc?.pid || routePid;
  if (pid === undefined || pid === null || pid === '') return undefined;
  const value = String(pid);
  return /^\d+$/.test(value) ? undefined : value;
}

function problemTags(pdoc: any) {
  const raw = pdoc?.tag ?? pdoc?.tags ?? pdoc?.categories ?? [];
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function stripScratchActions(content: string) {
  const markerIndex = content.indexOf(SCRATCH_ACTIONS_MARKER);
  if (markerIndex < 0) return content;
  return content.slice(0, markerIndex).replace(/\n*---\s*$/m, '').trimEnd();
}

function bufferFromStorage(value: unknown) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from([]);
}

function downloadFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '-').toLowerCase();
}

interface AlgorithmQuickForm {
  target: string;
  inputName: string;
  outputName: string;
  compareMode: ScratchAlgorithmCompareMode;
  waitMs: number;
  timeoutMs: number;
  casesText: string;
}

function algorithmValueToQuickText(value: ScratchAlgorithmValue | undefined) {
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n');
}

function unescapeQuickText(value: string) {
  return value
    .replace(/\\\\/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\u0000/g, '\\');
}

function quickValueFromText(value: string): ScratchAlgorithmValue {
  const text = unescapeQuickText(value.trim());
  if (!text) return '';
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((item) => (
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      ))) return parsed;
    } catch { /* keep plain text */ }
  }
  return text;
}

function algorithmCasesToQuickText(cases: ScratchAlgorithmCase[] | undefined) {
  return (cases || []).map((item, index) => {
    const parts = [
      algorithmValueToQuickText(item.input),
      algorithmValueToQuickText(item.expectedOutput),
      String(Number.isFinite(item.score) ? item.score : ''),
      item.name || `测试点 ${index + 1}`,
    ];
    if (item.hint) parts.push(item.hint);
    const line = parts.join(' => ');
    return item.hidden ? `* ${line}` : line;
  }).join('\n');
}

function algorithmQuickForm(config: ScratchProblemConfig): AlgorithmQuickForm {
  const algorithm = config.judgeConfig.algorithm || {};
  return {
    target: algorithm.target || 'Stage',
    inputName: algorithm.inputVariable || algorithm.inputList || 'input',
    outputName: algorithm.outputVariable || algorithm.outputList || 'output',
    compareMode: algorithm.compareMode || 'trim',
    waitMs: Number(algorithm.waitMs ?? 1000),
    timeoutMs: Number(algorithm.timeoutMs ?? 6000),
    casesText: algorithmCasesToQuickText(algorithm.cases),
  };
}

function parseAlgorithmQuickCases(text: string) {
  const cases: ScratchAlgorithmCase[] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  lines.forEach((rawLine, rawIndex) => {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    let hidden = false;
    if (/^(?:\*|hidden[:：]?|hide[:：]?|隐藏[:：]?)/i.test(line)) {
      hidden = true;
      line = line.replace(/^(?:\*|hidden[:：]?|hide[:：]?|隐藏[:：]?)/i, '').trim();
    }
    const parts = line.split(/\s*=>\s*/);
    if (parts.length < 2) {
      throw new ValidationError(`算法测试点第 ${rawIndex + 1} 行格式错误，请使用：输入 => 期望输出 => 分值 => 名称`);
    }
    const scoreText = (parts[2] || '').trim();
    const score = scoreText ? Number(scoreText) : undefined;
    if (scoreText && (!Number.isFinite(score) || Number(score) < 0)) {
      throw new ValidationError(`算法测试点第 ${rawIndex + 1} 行分值必须是非负数字`);
    }
    cases.push({
      name: (parts[3] || '').trim() || `${hidden ? '隐藏测试' : '测试点'} ${cases.length + 1}`,
      input: quickValueFromText(parts[0]),
      expectedOutput: quickValueFromText(parts[1]),
      score,
      hidden,
      hint: (parts[4] || '').trim() || undefined,
    });
  });
  return cases;
}

function buildAlgorithmQuickConfig(
  body: Record<string, any>,
  current: ScratchProblemConfig,
): ScratchAlgorithmConfig | undefined {
  const casesText = body.algorithmCases ?? body.algorithm_cases;
  if (casesText === undefined) return undefined;
  const currentAlgorithm = current.judgeConfig.algorithm || {};
  const compareMode = String(body.algorithmCompareMode || body.algorithm_compare_mode || currentAlgorithm.compareMode || 'trim');
  if (!['exact', 'trim', 'tokens', 'number'].includes(compareMode)) {
    throw new ValidationError('算法输出比较方式无效');
  }
  const waitMs = Number(body.algorithmWaitMs || body.algorithm_wait_ms || currentAlgorithm.waitMs || 1000);
  const timeoutMs = Number(body.algorithmTimeoutMs || body.algorithm_timeout_ms || currentAlgorithm.timeoutMs || 6000);
  if (!Number.isFinite(waitMs) || waitMs < 0) throw new ValidationError('算法等待时间必须是非负数字');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new ValidationError('算法超时时间必须大于 0');
  return {
    ...currentAlgorithm,
    target: String(body.algorithmTarget || body.algorithm_target || currentAlgorithm.target || 'Stage').trim() || undefined,
    inputVariable: String(body.algorithmInputName || body.algorithm_input_name || currentAlgorithm.inputVariable || currentAlgorithm.inputList || 'input').trim() || 'input',
    inputList: undefined,
    outputVariable: String(body.algorithmOutputName || body.algorithm_output_name || currentAlgorithm.outputVariable || currentAlgorithm.outputList || 'output').trim() || 'output',
    outputList: undefined,
    compareMode: compareMode as ScratchAlgorithmCompareMode,
    waitMs,
    timeoutMs,
    cases: parseAlgorithmQuickCases(String(casesText || '')),
  };
}

function buildScratchConfigPatch(
  current: ScratchProblemConfig,
  body: Record<string, any>,
  userId: number,
  isFormPost: boolean,
) {
  const disabledScratchExtensions = (body.disabledScratchExtensions ?? body.disabled_scratch_extensions) === undefined
    ? current.disabledScratchExtensions
    : parseStringArray(body.disabledScratchExtensions || body.disabled_scratch_extensions);
  const maxScore = Number(body.maxScore || body.max_score || current.maxScore);
  const judgeConfigInput = body.judgeConfig ?? body.judge_config;
  let judgeConfig = current.judgeConfig;
  if (judgeConfigInput !== undefined) {
    try {
      judgeConfig = normalizeJudgeConfig(judgeConfigInput, maxScore);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`judgeConfig: ${message}`);
    }
  }
  const algorithmConfig = buildAlgorithmQuickConfig(body, current);
  if (algorithmConfig) {
    judgeConfig = normalizeJudgeConfig({
      ...judgeConfig,
      totalScore: maxScore,
      algorithm: algorithmConfig,
    }, maxScore);
  }
  return {
    enabled: parseBoolean(body.enabled, isFormPost ? false : current.enabled),
    problemKind: parseProblemKind(body.problemKind || body.problem_kind || current.problemKind),
    submitMode: body.submitMode || body.submit_mode || current.submitMode,
    judgeMode: body.judgeMode || body.judge_mode || current.judgeMode,
    allowDownloadTemplate: parseBoolean(body.allowDownloadTemplate, isFormPost ? false : current.allowDownloadTemplate),
    maxProjectSizeMB: Number(body.maxProjectSizeMB || body.max_project_size_mb || current.maxProjectSizeMB),
    maxUnpackedSizeMB: Number(body.maxUnpackedSizeMB || body.max_unpacked_size_mb || current.maxUnpackedSizeMB),
    maxAssetSizeMB: Number(body.maxAssetSizeMB || body.max_asset_size_mb || current.maxAssetSizeMB),
    maxAssetCount: Number(body.maxAssetCount || body.max_asset_count || current.maxAssetCount),
    maxProjectJsonSizeMB: Number(body.maxProjectJsonSizeMB || body.max_project_json_size_mb || current.maxProjectJsonSizeMB),
    disabledScratchExtensions,
    judgeConfig,
    maxScore,
    updatedBy: userId,
  };
}

function scratchCreateDefaultConfig(
  domainId: string,
  problemId: number,
  pluginConfig: PluginConfig,
  problemKind: ScratchProblemKind = 'task',
): ScratchProblemConfig {
  const normalizedProblemKind = parseProblemKind(problemKind);
  return {
    ...defaultProblemConfig(domainId, problemId, pluginConfig),
    enabled: true,
    problemKind: normalizedProblemKind,
    submitMode: 'editor',
    judgeMode: normalizedProblemKind === 'algorithm' ? 'dynamic' : 'manual',
    allowDownloadTemplate: true,
    maxScore: pluginConfig.maxScore,
  };
}

function normalizeCreateConfigBody(
  body: Record<string, any>,
  current: ScratchProblemConfig,
): Record<string, any> {
  return {
    enabled: 'on',
    problemKind: current.problemKind,
    submitMode: current.submitMode,
    judgeMode: current.judgeMode,
    allowDownloadTemplate: current.allowDownloadTemplate ? 'on' : '',
    maxScore: current.maxScore,
    maxProjectSizeMB: current.maxProjectSizeMB,
    maxUnpackedSizeMB: current.maxUnpackedSizeMB,
    maxAssetSizeMB: current.maxAssetSizeMB,
    maxAssetCount: current.maxAssetCount,
    maxProjectJsonSizeMB: current.maxProjectJsonSizeMB,
    disabledScratchExtensions: current.disabledScratchExtensions.join(', '),
    judgeConfig: stringifyJudgeConfig(current.judgeConfig),
    ...body,
  };
}

abstract class ScratchProblemHandler extends Handler {
  pluginConfig!: PluginConfig;
  pdoc: any;
  routePid?: string | number;
  scratchConfig!: ScratchProblemConfig;

  @param('pid', Types.ProblemId)
  async prepare(domainId: string, pid: string | number) {
    ensurePluginDomainEnabled(this.pluginConfig, domainId);
    this.routePid = pid;
    this.pdoc = await HydroApi.problem.get(domainId, pid);
    if (!this.pdoc) throw new NotFoundError(`Problem ${pid}`);
    this.scratchConfig = await ScratchModel.getProblemConfig(domainId, this.pdoc.docId, this.pluginConfig);
  }

  ensureProblemManager() {
    if (!userCanManageProblem(this.user, this.pdoc)) {
      throw new ForbiddenError();
    }
  }

  ensureScratchEnabled() {
    if (!this.scratchConfig.enabled) throw new ValidationError('scratch.enabled');
  }
}

export class ScratchProblemStatementHandler extends ScratchProblemHandler {
  async get() {
    this.ensureScratchEnabled();
    const tid = getQueryValue(this, 'tid') as string | undefined;
    const pdoc = {
      ...this.pdoc,
      content: rewriteProblemFileUrls(this, this.pdoc, this.pdoc.content || '', tid),
    };
    let html: string;
    if (typeof (this as any).renderHTML === 'function') {
      html = await (this as any).renderHTML('partials/problem_description.html', { pdoc, tdoc: null });
    } else {
      html = `<div class="typo">${escapeHtml(pdoc.content).replace(/\n/g, '<br>')}</div>`;
    }
    this.response.body = {
      html,
      content: pdoc.content,
      problemUrl: buildHandlerUrl(this, 'problem_detail', { pid: this.pdoc.docId }, { tid }),
    };
  }
}

export class ScratchProblemConfigHandler extends ScratchProblemHandler {
  async get() {
    if (this.request.json) {
      this.response.body = { config: this.scratchConfig };
      return;
    }
    this.response.template = 'scratch_problem_config.html';
    this.response.body = {
      pdoc: this.pdoc,
      config: this.scratchConfig,
      algorithmForm: algorithmQuickForm(this.scratchConfig),
      judgeConfigText: stringifyJudgeConfig(this.scratchConfig.judgeConfig),
      editUrl: this.url('scratch_problem_edit', { pid: this.pdoc.docId }),
      exportUrl: this.url('scratch_problem_export', { pid: this.pdoc.docId }),
      guideUrl: this.url('scratch_problem_guide'),
      templateUploadUrl: this.url('scratch_problem_template', { pid: this.pdoc.docId }),
      submissionsUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
      templateDownloadUrl: this.scratchConfig.templatePath
        ? this.url('scratch_problem_template', { pid: this.pdoc.docId })
        : '',
      editorWorkspaceUrl: ['editor', 'both'].includes(this.scratchConfig.submitMode)
        ? this.url('scratch_editor', { pid: this.pdoc.docId })
        : '',
    };
  }

  async post() {
    this.ensureProblemManager();
    const body = this.args || {};
    const isFormPost = !this.request.json;
    const config = await ScratchModel.setProblemConfig(this.pdoc.domainId, this.pdoc.docId, this.pluginConfig, {
      ...buildScratchConfigPatch(this.scratchConfig, body, this.user._id, isFormPost),
    });
    this.response.body = { config };
    if (!this.request.json) this.response.redirect = this.url('scratch_problem_config', { pid: this.pdoc.docId });
  }
}

abstract class ScratchDomainHandler extends Handler {
  pluginConfig!: PluginConfig;

  async prepare({ domainId }: { domainId: string }) {
    ensurePluginDomainEnabled(this.pluginConfig, domainId);
  }
}

export class ScratchProblemCreateHandler extends ScratchDomainHandler {
  async get() {
    const config = scratchCreateDefaultConfig('system', 0, this.pluginConfig);
    this.response.template = 'scratch_problem_create.html';
    this.response.body = {
      config,
      algorithmForm: algorithmQuickForm(config),
      judgeConfigText: stringifyJudgeConfig(config.judgeConfig),
      defaultContent: '请在这里写清楚学生需要完成的 Scratch 任务、保留的角色/变量、提交要求和评分说明。',
      defaultMaxScore: this.pluginConfig.maxScore,
      importUrl: this.url('scratch_problem_import'),
      guideUrl: this.url('scratch_problem_guide'),
    };
  }

  @post('title', Types.Title)
  @post('content', Types.Content, true)
  @post('pid', Types.ProblemId, true)
  @post('hidden', Types.Boolean, true)
  @post('problemKind', Types.String, true)
  async post(
    domainId: string,
    title: string,
    content = '',
    pid: string | number = '',
    hidden = false,
    problemKind: ScratchProblemKind = 'task',
  ) {
    if (typeof pid !== 'string') pid = `P${pid}`;
    const rawBody = this.args || {};
    const normalizedProblemKind = parseProblemKind(rawBody.problemKind || rawBody.problem_kind || problemKind);
    const body = normalizeCreateConfigBody(
      rawBody,
      scratchCreateDefaultConfig(domainId, 0, this.pluginConfig, normalizedProblemKind),
    );
    const docId = await HydroApi.problem.add(
      domainId,
      pid,
      title,
      content || '请在这里写清楚学生需要完成的 Scratch 任务、保留的角色/变量、提交要求和评分说明。',
      this.user._id,
      ['Scratch'],
      { hidden },
    );
    const baseConfig = scratchCreateDefaultConfig(domainId, docId, this.pluginConfig, normalizedProblemKind);
    await ScratchModel.setProblemConfig(domainId, docId, this.pluginConfig, {
      ...buildScratchConfigPatch(baseConfig, body, this.user._id, true),
    });
    this.response.body = { pid: pid || docId };
    this.response.redirect = this.url('scratch_problem_edit', { pid: pid || docId });
  }
}

export class ScratchProblemImportHandler extends ScratchDomainHandler {
  async get() {
    this.response.template = 'scratch_problem_import.html';
    this.response.body = {
      createUrl: this.url('scratch_problem_create'),
      guideUrl: this.url('scratch_problem_guide'),
    };
  }

  async post() {
    const domainId = String(this.args.domainId || 'system');
    const file = this.request.files?.file;
    if (!file || file.size === 0) throw new ValidationError('file');
    if (!String(file.originalFilename || '').toLowerCase().endsWith('.zip')) throw new ValidationError('file');
    if (file.size > 128 * 1024 * 1024) throw new FileTooLargeError('file');

    const body = this.args || {};
    const problemPackage = await readScratchProblemPackage(file.filepath, this.pluginConfig);
    const manifest = problemPackage.manifest;
    const scratch = manifest.scratch || {};
    const limits = scratch.limits || {};
    const requestedPid = validateImportPid(String(body.pid || manifest.pid || '').trim());
    if (requestedPid && await HydroApi.problem.get(domainId, requestedPid)) {
      throw new ValidationError(`Problem ${requestedPid} already exists.`);
    }

    const hidden = body.hidden === undefined ? !!manifest.hidden : parseBoolean(body.hidden, false);
    const tags = [...new Set([...(manifest.tags || []), 'Scratch'])];
    const docId = await HydroApi.problem.add(
      domainId,
      requestedPid,
      manifest.title,
      problemPackage.statement || 'Scratch project assignment.',
      this.user._id,
      tags,
      { hidden },
    );

    let config = await ScratchModel.setProblemConfig(domainId, docId, this.pluginConfig, {
      enabled: scratch.enabled ?? true,
      problemKind: scratch.problemKind || 'task',
      submitMode: scratch.submitMode || 'both',
      judgeMode: scratch.judgeMode || 'hybrid',
      allowDownloadTemplate: scratch.allowDownloadTemplate ?? true,
      maxScore: scratch.maxScore || this.pluginConfig.maxScore,
      maxProjectSizeMB: limits.maxProjectSizeMB || this.pluginConfig.maxProjectSizeMB,
      maxUnpackedSizeMB: limits.maxUnpackedSizeMB || this.pluginConfig.maxUnpackedSizeMB,
      maxAssetSizeMB: limits.maxAssetSizeMB || this.pluginConfig.maxAssetSizeMB,
      maxAssetCount: limits.maxAssetCount || this.pluginConfig.maxAssetCount,
      maxProjectJsonSizeMB: limits.maxProjectJsonSizeMB || this.pluginConfig.maxProjectJsonSizeMB,
      disabledScratchExtensions: scratch.disabledScratchExtensions?.length
        ? scratch.disabledScratchExtensions
        : undefined,
      judgeConfig: problemPackage.judgeConfig,
      updatedBy: this.user._id,
    });

    if (problemPackage.template) {
      const tmpDir = await mkdtemp(join(tmpdir(), 'scratch-package-template-'));
      const tmpFile = join(tmpDir, packageFilenameFor(problemPackage.template.filename, 'template.sb3'));
      try {
        await writeFile(tmpFile, problemPackage.template.content);
        const originalName = filenameFor(problemPackage.template.filename, `problem-${docId}-template.sb3`);
        const validation = await validateUploadedScratchProject(tmpFile, originalName, config);
        const templatePath = `${this.pluginConfig.storagePrefix}/${domainId}/problem/${docId}/template.sb3`;
        await HydroApi.storage.put(templatePath, tmpFile, this.user._id);
        const meta = await HydroApi.storage.getMeta(templatePath);
        config = await ScratchModel.setProblemConfig(domainId, docId, this.pluginConfig, {
          ...config,
          templatePath,
          templateName: originalName,
          templateMeta: meta || {
            size: problemPackage.template.content.length,
          },
          updatedBy: this.user._id,
        });
        this.response.body = { pid: requestedPid || docId, docId, config, validation };
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    } else {
      this.response.body = { pid: requestedPid || docId, docId, config };
    }

    if (!this.request.json) this.response.redirect = this.url('scratch_problem_config', { pid: requestedPid || docId });
  }
}

export class ScratchProblemEditHandler extends ScratchProblemHandler {
  async get() {
    this.ensureProblemManager();
    this.response.template = 'scratch_problem_edit.html';
    this.response.body = {
      pdoc: this.pdoc,
      config: this.scratchConfig,
      algorithmForm: algorithmQuickForm(this.scratchConfig),
      judgeConfigText: stringifyJudgeConfig(this.scratchConfig.judgeConfig),
      templateUploadUrl: this.url('scratch_problem_template', { pid: this.pdoc.docId }),
      templateDownloadUrl: this.scratchConfig.templatePath
        ? this.url('scratch_problem_template', { pid: this.pdoc.docId })
        : '',
      exportUrl: this.url('scratch_problem_export', { pid: this.pdoc.docId }),
      guideUrl: this.url('scratch_problem_guide'),
      editorWorkspaceUrl: ['editor', 'both'].includes(this.scratchConfig.submitMode)
        ? this.url('scratch_editor', { pid: this.pdoc.docId })
        : '',
      configUrl: this.url('scratch_problem_config', { pid: this.pdoc.docId }),
      submissionsUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
    };
  }

  @post('title', Types.Title)
  @post('content', Types.Content)
  @post('pid', Types.ProblemId, true)
  @post('hidden', Types.Boolean, true)
  async post(domainId: string, title: string, content: string, pid: string | number = '', hidden = false) {
    this.ensureProblemManager();
    if (typeof pid === 'string' && pid && !/^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(pid)) throw new ValidationError('pid');
    const nextPid = normalizeProblemPid(pid, this.pdoc.pid || this.pdoc.docId);
    if (nextPid !== this.pdoc.pid && await HydroApi.problem.get(domainId, nextPid)) {
      throw new ValidationError(`Problem ${nextPid} already exists.`);
    }
    const pdoc = await HydroApi.problem.edit(domainId, this.pdoc.docId, {
      title,
      content,
      pid: nextPid,
      hidden,
      html: false,
    });
    const body = this.args || {};
    const config = await ScratchModel.setProblemConfig(domainId, this.pdoc.docId, this.pluginConfig, {
      ...buildScratchConfigPatch(this.scratchConfig, body, this.user._id, !this.request.json),
    });
    this.response.body = { pdoc, config };
    if (!this.request.json) this.response.redirect = this.url('scratch_problem_edit', { pid: nextPid || pdoc.docId });
  }
}

export class ScratchProblemTemplateHandler extends ScratchProblemHandler {
  async get() {
    this.ensureScratchEnabled();
    if (!this.scratchConfig.templatePath) throw new NotFoundError('Scratch template');
    if (!this.scratchConfig.allowDownloadTemplate) this.ensureProblemManager();
    if (this.request.query?.raw || this.args.raw) {
      this.response.body = await HydroApi.storage.get(this.scratchConfig.templatePath);
      this.response.type = 'application/octet-stream';
      this.response.disposition = `attachment; filename="${encodeURIComponent(this.scratchConfig.templateName || `problem-${this.pdoc.docId}-template.sb3`)}"`;
      return;
    }
    this.response.redirect = await HydroApi.storage.signDownloadLink(
      this.scratchConfig.templatePath,
      this.scratchConfig.templateName || `problem-${this.pdoc.docId}-template.sb3`,
      false,
      'user',
    );
  }

  async post() {
    this.ensureProblemManager();
    const file = this.request.files?.file;
    if (!file || file.size === 0) throw new ValidationError('file');
    if (file.size > this.scratchConfig.maxProjectSizeMB * 1024 * 1024) throw new FileTooLargeError('file');
    const originalName = filenameFor(file.originalFilename, `problem-${this.pdoc.docId}-template.sb3`);
    const validation = await validateUploadedScratchProject(file.filepath, originalName, this.scratchConfig);
    const templatePath = `${this.pluginConfig.storagePrefix}/${this.pdoc.domainId}/problem/${this.pdoc.docId}/template.sb3`;
    await HydroApi.storage.put(templatePath, file.filepath, this.user._id);
    const meta = await HydroApi.storage.getMeta(templatePath);
    const config = await ScratchModel.setProblemConfig(this.pdoc.domainId, this.pdoc.docId, this.pluginConfig, {
      ...this.scratchConfig,
      templatePath,
      templateName: originalName,
      templateMeta: meta || undefined,
      updatedBy: this.user._id,
    });
    this.response.body = { config, validation };
    if (!this.request.json) this.response.redirect = this.url('scratch_problem_config', { pid: this.pdoc.docId });
  }
}

export class ScratchProblemExportHandler extends ScratchProblemHandler {
  async get() {
    this.ensureProblemManager();
    let template: { filename: string; content: Buffer } | undefined;
    if (this.scratchConfig.templatePath) {
      const content = bufferFromStorage(await HydroApi.storage.get(this.scratchConfig.templatePath));
      if (content.length) {
        template = {
          filename: filenameFor(this.scratchConfig.templateName, `problem-${this.pdoc.docId}-template.sb3`),
          content,
        };
      }
    }

    const buffer = await createScratchProblemPackageZip({
      pid: portableProblemPid(this.pdoc, this.routePid),
      title: this.pdoc.title || `Scratch Problem ${this.pdoc.docId}`,
      hidden: !!this.pdoc.hidden,
      tags: problemTags(this.pdoc),
      statement: stripScratchActions(String(this.pdoc.content || '')),
      scratch: {
        enabled: this.scratchConfig.enabled,
        problemKind: this.scratchConfig.problemKind,
        submitMode: this.scratchConfig.submitMode,
        judgeMode: this.scratchConfig.judgeMode,
        maxScore: this.scratchConfig.maxScore,
        allowDownloadTemplate: this.scratchConfig.allowDownloadTemplate,
        disabledScratchExtensions: this.scratchConfig.disabledScratchExtensions,
        maxProjectSizeMB: this.scratchConfig.maxProjectSizeMB,
        maxUnpackedSizeMB: this.scratchConfig.maxUnpackedSizeMB,
        maxAssetSizeMB: this.scratchConfig.maxAssetSizeMB,
        maxAssetCount: this.scratchConfig.maxAssetCount,
        maxProjectJsonSizeMB: this.scratchConfig.maxProjectJsonSizeMB,
        judgeConfig: this.scratchConfig.judgeConfig,
      },
      template,
    });

    const name = downloadFilename(String(this.pdoc.pid || this.routePid || this.pdoc.docId || 'scratch-problem'));
    this.response.body = buffer;
    this.response.type = 'application/zip';
    this.response.disposition = `attachment; filename="${name}.scratch-problem.zip"`;
  }
}

export class ScratchSubmitHandler extends ScratchProblemHandler {
  @post('source', Types.Range(['upload', 'editor']), true)
  @post('tid', Types.ObjectId, true)
  @post('returnUrl', Types.String, true)
  @post('returnListUrl', Types.String, true)
  async post(domainId: string, source: ScratchSubmitSource = 'upload', tid?: any, returnUrl = '', returnListUrl = '') {
    this.ensureScratchEnabled();
    const effectiveDomainId = this.pdoc.domainId || domainId;
    if (!['upload', 'both'].includes(this.scratchConfig.submitMode) && source === 'upload') throw new ValidationError('source');
    if (!['editor', 'both'].includes(this.scratchConfig.submitMode) && source === 'editor') throw new ValidationError('source');
    const file = this.request.files?.file;
    if (!file || file.size === 0) throw new ValidationError('file');
    if (file.size > this.scratchConfig.maxProjectSizeMB * 1024 * 1024) throw new FileTooLargeError('file');

    await this.limitRate('add_record', 60, 20, '{{user}}');
    const originalName = filenameFor(file.originalFilename, `scratch-${Date.now()}.sb3`);
    const validation = await validateUploadedScratchProject(file.filepath, originalName, this.scratchConfig);

    const rid = await HydroApi.record.add(
      effectiveDomainId,
      this.pdoc.docId,
      this.user._id,
      SCRATCH_LANG,
      '',
      false,
      { contest: tid, files: {}, type: 'judge' },
    );
    const submissionFileId = `${this.user._id}/${nanoid()}`;
    const projectPath = `submission/${submissionFileId}`;
    await HydroApi.storage.put(projectPath, file.filepath, this.user._id);
    const meta = await HydroApi.storage.getMeta(projectPath);
    let autoJudgeResult: ScratchSubmissionMeta['autoJudgeResult'] | undefined;
    let autoJudgeError: string | undefined;
    if (autoJudgeEnabled(this.scratchConfig)) {
      try {
        const judgeConfig = prepareJudgeConfigForMode(
          this.scratchConfig.judgeConfig,
          this.scratchConfig.maxScore,
          this.scratchConfig.judgeMode,
        );
        autoJudgeResult = isAlgorithmProblem(this.scratchConfig)
          ? await judgeScratchAlgorithmFile(file.filepath, judgeConfig)
          : await judgeScratchFile(file.filepath, judgeConfig);
      } catch (error) {
        autoJudgeError = error instanceof Error ? error.message : String(error);
      }
    }
    const recordPatch = autoJudgeRecordPatch(autoJudgeResult, autoJudgeError);
    const autoJudgeAt = autoJudgeResult || autoJudgeError ? new Date() : undefined;
    const submission: ScratchSubmissionMeta = {
      domainId: effectiveDomainId,
      rid,
      problemId: this.pdoc.docId,
      userId: this.user._id,
      projectPath,
      originalName,
      projectSize: meta?.size || file.size,
      source,
      validation,
      score: autoJudgeResult ? autoJudgeResult.totalScore : undefined,
      maxScore: this.scratchConfig.maxScore,
      status: recordPatch.status,
      scored: !!autoJudgeResult,
      autoJudgeResult,
      autoJudgeAt,
      autoJudgeError,
      previewAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await ScratchModel.addSubmission(submission);
    const problemUrl = buildHandlerUrl(this, 'problem_detail', { pid: this.pdoc.docId }, {
      scratch: 0,
      tid: tid ? String(tid) : undefined,
    });
    const contestReturn = await contestReturnInfo(this, effectiveDomainId, tid);
    const safeReturnListUrl = safeLocalUrl(returnListUrl) || contestReturn.returnListUrl;
    const safeReturnUrl = contestReturn.isContest
      ? safeReturnListUrl
      : safeLocalUrl(returnUrl) || problemUrl;
    const previewUrl = this.url('scratch_submission_preview', { rid });
    const historyUrl = this.url('scratch_problem_submissions', { pid: this.pdoc.docId });
    const scoreUrl = this.url('scratch_submission_score', { rid });
    const reportUrl = this.url('scratch_submission_report', { rid });
    await HydroApi.record.update(effectiveDomainId, rid, {
      code: [
        'Scratch project submitted.',
        `Preview: ${previewUrl}`,
        `History: ${historyUrl}`,
        `Manual score: ${scoreUrl}`,
        `File: ${originalName}`,
      ].join('\n'),
      files: { code: `${submissionFileId}#${originalName}` },
      status: recordPatch.status,
      score: recordPatch.score,
      time: 0,
      memory: 0,
      progress: 100,
      judgeAt: new Date(),
      judger: 'scratch',
      source: 'scratch',
      judgeTexts: recordPatch.judgeTexts || [
        'Scratch submission uploaded. Waiting for manual score.',
        `Scratch preview: ${previewUrl}`,
        `Scratch history: ${historyUrl}`,
      ],
      testCases: recordPatch.testCases,
    });
    await Promise.all([
      HydroApi.problem.inc(effectiveDomainId, this.pdoc.docId, 'nSubmit', 1),
      HydroApi.domain.incUserInDomain(effectiveDomainId, this.user._id, 'nSubmit'),
    ]);
    await syncHydroScoreState(
      effectiveDomainId,
      rid,
      this.pdoc.docId,
      this.user._id,
      tid,
      recordPatch,
      autoJudgeResult ? 'scratch-auto' : 'scratch',
    );
    this.response.body = {
      ok: true,
      rid,
      status: autoJudgeResult ? (autoJudgeResult.passed ? 'Accepted' : 'Wrong Answer') : 'Waiting',
      score: autoJudgeResult?.totalScore,
      maxScore: autoJudgeResult?.maxScore || this.scratchConfig.maxScore,
      autoJudgeResult,
      autoJudgeError,
      projectPath,
      validation,
      redirectUrl: safeReturnUrl,
      returnUrl: safeReturnUrl,
      returnListUrl: safeReturnListUrl,
      returnListLabel: safeReturnListUrl ? contestReturn.returnListLabel || '' : '',
      contestRule: contestReturn.contestRule,
      contestMode: contestReturn.isContest,
      problemUrl,
      previewUrl,
      historyUrl,
      recordUrl: this.url('record_detail', { rid }),
      downloadUrl: this.url('scratch_submission_project', { rid }),
      scoreUrl,
      reportUrl,
    };
  }
}

abstract class ScratchSubmissionHandler extends Handler {
  pluginConfig!: PluginConfig;
  rdoc: any;
  pdoc: any;
  submission!: ScratchSubmissionMeta;

  @param('rid', Types.ObjectId)
  async prepare(domainId: string, rid: any) {
    ensurePluginDomainEnabled(this.pluginConfig, domainId);
    this.rdoc = await HydroApi.record.get(domainId, rid) || await HydroApi.record.get(rid);
    if (!this.rdoc) throw new NotFoundError(`Record ${rid}`);
    const effectiveDomainId = this.rdoc.domainId || domainId;
    ensurePluginDomainEnabled(this.pluginConfig, effectiveDomainId);
    this.pdoc = await HydroApi.problem.get(effectiveDomainId, this.rdoc.pid);
    if (!this.pdoc) throw new NotFoundError(`Problem ${this.rdoc.pid}`);
    const submission = await ScratchModel.getSubmission(effectiveDomainId, rid);
    if (submission) {
      this.submission = {
        ...submission,
        score: submission.score ?? this.rdoc.score,
        status: submission.status ?? this.rdoc.status,
        scored: submission.scored ?? isRecordScored(this.rdoc),
      };
      return;
    }
    const config = await ScratchModel.getProblemConfig(effectiveDomainId, this.pdoc.docId, this.pluginConfig);
    const fallback = buildSubmissionFromRecord(effectiveDomainId, this.pdoc, this.rdoc, config);
    if (!fallback) throw new NotFoundError('Scratch submission');
    this.submission = fallback;
  }

  canManageProblem() {
    return userCanManageProblem(this.user, this.pdoc);
  }

  ensureCanReadSubmission() {
    if (this.rdoc.uid === this.user._id) return;
    if (this.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) return;
    if (this.canManageProblem()) return;
    throw new ForbiddenError();
  }

  ensureCanScoreSubmission() {
    if (!this.canManageProblem()) throw new ForbiddenError();
  }
}

export class ScratchSubmissionProjectHandler extends ScratchSubmissionHandler {
  async get() {
    this.ensureCanReadSubmission();
    if (hasQueryFlag(this, 'raw')) {
      this.response.body = await HydroApi.storage.get(this.submission.projectPath);
      this.response.type = 'application/octet-stream';
      this.response.disposition = `attachment; filename="${encodeURIComponent(this.submission.originalName)}"`;
      return;
    }
    this.response.redirect = await HydroApi.storage.signDownloadLink(
      this.submission.projectPath,
      this.submission.originalName,
      false,
      'user',
    );
  }
}

export class ScratchSubmissionPreviewHandler extends ScratchSubmissionHandler {
  async get() {
    this.ensureCanReadSubmission();
    const projectUrl = appendQuery(this.url('scratch_submission_project', { rid: this.rdoc._id }), { raw: 1 });
    this.response.template = 'scratch_preview.html';
    this.response.body = {
      pdoc: this.pdoc,
      rdoc: this.rdoc,
      submission: this.submission,
      projectUrl,
      previewEditorUrl: buildScratchEditorUrl(this.pluginConfig),
      downloadUrl: this.url('scratch_submission_project', { rid: this.rdoc._id }),
      reportUrl: this.url('scratch_submission_report', { rid: this.rdoc._id }),
      scoreUrl: this.url('scratch_submission_score', { rid: this.rdoc._id }),
      problemUrl: this.url('problem_detail', { pid: this.pdoc.docId }),
      submissionsUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
      canScore: this.canManageProblem(),
    };
  }
}

export class ScratchSubmissionReportHandler extends ScratchSubmissionHandler {
  async get() {
    this.ensureCanReadSubmission();
    this.response.body = {
      score: this.rdoc.score,
      maxScore: this.submission.maxScore,
      status: this.rdoc.status,
      judgeTexts: this.rdoc.judgeTexts || [],
      validation: this.submission.validation,
      manualScore: {
        score: this.submission.score,
        by: this.submission.manualScoreBy,
        at: this.submission.manualScoreAt,
        comment: this.submission.manualComment,
      },
      autoJudge: {
        result: this.submission.autoJudgeResult,
        at: this.submission.autoJudgeAt,
        error: this.submission.autoJudgeError,
      },
    };
  }
}

export class ScratchSubmissionScoreHandler extends ScratchSubmissionHandler {
  async get() {
    this.ensureCanScoreSubmission();
    const projectUrl = appendQuery(this.url('scratch_submission_project', { rid: this.rdoc._id }), { raw: 1 });
    const returnUrl = safeLocalUrl(getQueryValue(this, 'returnUrl'));
    this.response.template = 'scratch_score.html';
    this.response.body = {
      pdoc: this.pdoc,
      rdoc: this.rdoc,
      submission: this.submission,
      projectUrl,
      previewEditorUrl: buildScratchEditorUrl(this.pluginConfig),
      scoreUrl: this.url('scratch_submission_score', { rid: this.rdoc._id }),
      previewUrl: this.url('scratch_submission_preview', { rid: this.rdoc._id }),
      downloadUrl: this.url('scratch_submission_project', { rid: this.rdoc._id }),
      submissionsUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
      recordUrl: this.url('record_detail', { rid: this.rdoc._id }),
      returnUrl,
    };
  }

  @post('score', Types.Float)
  @post('comment', Types.String, true)
  @post('returnUrl', Types.String, true)
  async post(domainId: string, score: number, comment = '', returnUrl = '') {
    this.ensureCanScoreSubmission();
    const effectiveDomainId = this.pdoc.domainId || this.rdoc.domainId || domainId;
    const maxScore = this.submission.maxScore || 100;
    if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new ValidationError('score');
    const status = scoreToStatus(score, maxScore);
    const scorePatch = {
      score,
      maxScore,
      status,
      scored: true,
      manualScoreBy: this.user._id,
      manualScoreAt: new Date(),
      manualComment: comment,
    };
    const updated = await ScratchModel.updateSubmission(effectiveDomainId, this.rdoc._id, scorePatch);
    if (!updated) await ScratchModel.addSubmission({
      ...this.submission,
      domainId: effectiveDomainId,
      ...scorePatch,
      updatedAt: new Date(),
    });
    const message = comment || `Manual Scratch score: ${score}/${maxScore}`;
    const manualPatch = {
      status,
      score,
      judgeTexts: [message],
      testCases: [{
        id: 0,
        subtaskId: 0,
        status,
        score,
        time: 0,
        memory: 0,
        message,
      }],
      message,
    };
    await HydroApi.record.update(effectiveDomainId, this.rdoc._id, {
      status,
      score,
      time: 0,
      memory: 0,
      progress: 100,
      judgeAt: new Date(),
      judger: this.user._id,
      source: 'scratch',
    });
    await syncHydroScoreState(
      effectiveDomainId,
      this.rdoc._id,
      this.rdoc.pid,
      this.rdoc.uid,
      this.rdoc.contest,
      manualPatch,
      this.user._id,
    );
    const defaultRedirectUrl = this.url('scratch_problem_submissions', { pid: this.pdoc.docId });
    const redirectUrl = safeLocalUrl(returnUrl) || defaultRedirectUrl;
    this.response.body = {
      rid: this.rdoc._id,
      score,
      maxScore,
      status,
      redirectUrl,
    };
    if (!this.request.json) this.response.redirect = appendQuery(
      redirectUrl,
      { scored: String(this.rdoc._id) },
    );
  }
}

export class ScratchProblemSubmissionsHandler extends ScratchProblemHandler {
  async get(domainId: string) {
    this.ensureScratchEnabled();
    const effectiveDomainId = this.pdoc.domainId || domainId;
    const canManage = userCanManageProblem(this.user, this.pdoc);
    const canReadAll = userCanReadAllScratchRecords(this.user, this.pdoc);
    const problemIds = getProblemIdCandidates(this.pdoc, this.routePid);
    const contestQuery = normalizedQueryText(getQueryValue(this, 'contest'));
    const query = canReadAll ? {} : { userId: this.user._id };
    const contestDocs = contestQuery ? await HydroApi.contest.searchByTitle(effectiveDomainId, contestQuery, { limit: 20 }) : [];
    const contestMode = !!contestQuery;
    const metaDocs = contestMode ? [] : await listScratchSubmissionMeta(effectiveDomainId, problemIds, query);
    const rdocs = contestMode
      ? await listScratchRecordsForContests(effectiveDomainId, contestDocs, canReadAll ? undefined : this.user._id)
      : await listScratchRecordsForProblem(effectiveDomainId, problemIds, canReadAll ? undefined : this.user._id);
    const fallbackDocs = rdocs
      .filter((rdoc: any) => isScratchRecord(rdoc) && !!parseRecordProjectFile(rdoc))
      .map((rdoc: any) => buildSubmissionFromRecord(effectiveDomainId, this.pdoc, rdoc, this.scratchConfig))
      .filter(Boolean) as ScratchSubmissionMeta[];
    const docs = mergeSubmissionRecords(metaDocs, fallbackDocs);
    const originFilter = submissionFilterValue(getQueryValue(this, 'origin'), ['all', 'normal', 'contest', 'homework'], 'all');
    const statusFilter = submissionFilterValue(getQueryValue(this, 'status'), ['all', 'waiting', 'scored'], 'all');
    const rows = await buildSubmissionRows(this, effectiveDomainId, docs, rdocs);
    const filteredRows = filterSubmissionRows(rows, originFilter, statusFilter);
    if (this.request.json) {
      this.response.body = {
        submissions: filteredRows,
        totalSubmissions: rows.length,
        canManage,
        canReadAll,
        problemIds,
        contestMatches: contestDocs.map((tdoc: any) => ({ id: contestDocId(tdoc), title: tdoc.title, rule: tdoc.rule })),
        filters: { origin: originFilter, status: statusFilter, contest: contestQuery },
      };
      return;
    }
    this.response.template = 'scratch_submissions.html';
    this.response.body = {
      pdoc: this.pdoc,
      submissions: filteredRows,
      totalSubmissions: rows.length,
      canManage,
      canReadAll,
      canScore: canManage,
      originFilter,
      statusFilter,
      problemFilter: '',
      contestFilter: contestQuery,
      contestMatches: contestDocs.map((tdoc: any) => ({ id: contestDocId(tdoc), title: tdoc.title, rule: tdoc.rule })),
      scoredRid: getQueryValue(this, 'scored') || '',
      isGlobalQueue: false,
      pendingCount: rows.filter((item) => !item.scored).length,
      editorUrl: this.url('scratch_editor', { pid: this.pdoc.docId }),
      problemUrl: this.url('problem_detail', { pid: this.pdoc.docId }),
      recordListUrl: appendQuery(this.url('record_main'), { pid: String(this.routePid || this.pdoc.docId) }),
      editUrl: this.url('scratch_problem_edit', { pid: this.pdoc.docId }),
      configUrl: this.url('scratch_problem_config', { pid: this.pdoc.docId }),
      reviewQueueUrl: this.url('scratch_review_queue'),
      resetUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
    };
  }
}

export class ScratchReviewQueueHandler extends ScratchDomainHandler {
  async get() {
    const domainId = String(this.args.domainId || 'system');
    const contestQuery = normalizedQueryText(getQueryValue(this, 'contest'));
    const problemQuery = normalizedQueryText(getQueryValue(this, 'problem'));
    const contestDocs = contestQuery ? await HydroApi.contest.searchByTitle(domainId, contestQuery, { limit: 20 }) : [];
    const contestMode = !!contestQuery;
    const metaDocs = contestMode
      ? []
      : await ScratchModel.getDomainSubmissions(domainId).limit(2000).toArray();
    const rdocs = contestMode
      ? await listScratchRecordsForContests(domainId, contestDocs, undefined)
      : await listScratchRecordsForDomain(domainId);
    const fallbackDocs = await buildFallbackSubmissionsForRecords(domainId, rdocs, this.pluginConfig);
    const docs = mergeSubmissionRecords(metaDocs, fallbackDocs);
    const originFilter = submissionFilterValue(getQueryValue(this, 'origin'), ['all', 'normal', 'contest', 'homework'], 'all');
    const statusFilter = submissionFilterValue(getQueryValue(this, 'status'), ['all', 'waiting', 'scored'], 'waiting');
    const rows = await buildSubmissionRows(this, domainId, docs, rdocs);
    const reviewableRows = rows.filter((item) => item.canScore);
    const canReviewProblems = this.user?.hasPerm?.(PERM.PERM_EDIT_PROBLEM)
      || this.user?.hasPerm?.(PERM.PERM_EDIT_PROBLEM_SELF);
    if (!canReviewProblems && !reviewableRows.length) throw new ForbiddenError();
    const filteredRows = filterSubmissionRows(reviewableRows, originFilter, statusFilter, problemQuery);
    const resetUrl = this.url('scratch_review_queue');
    const returnUrl = appendQuery(resetUrl, {
      problem: problemQuery,
      contest: contestQuery,
      origin: originFilter,
      status: statusFilter,
    });
    for (const row of filteredRows) {
      row.scoreUrl = appendQuery(row.scoreUrl, { returnUrl });
    }
    if (this.request.json) {
      this.response.body = {
        submissions: filteredRows,
        totalSubmissions: reviewableRows.length,
        pendingCount: reviewableRows.filter((item) => !item.scored).length,
        filters: {
          problem: problemQuery,
          contest: contestQuery,
          origin: originFilter,
          status: statusFilter,
        },
      };
      return;
    }
    this.response.template = 'scratch_submissions.html';
    this.response.body = {
      pdoc: null,
      submissions: filteredRows,
      totalSubmissions: reviewableRows.length,
      pendingCount: reviewableRows.filter((item) => !item.scored).length,
      canManage: true,
      canReadAll: true,
      canScore: true,
      originFilter,
      statusFilter,
      problemFilter: problemQuery,
      contestFilter: contestQuery,
      contestMatches: contestDocs.map((tdoc: any) => ({ id: contestDocId(tdoc), title: tdoc.title, rule: tdoc.rule })),
      scoredRid: getQueryValue(this, 'scored') || '',
      isGlobalQueue: true,
      problemListUrl: this.url('problem_main'),
      recordListUrl: appendQuery(this.url('record_main'), { status: STATUS_WAITING }),
      reviewQueueUrl: resetUrl,
      resetUrl,
    };
  }
}

export class ScratchProblemGuideHandler extends ScratchDomainHandler {
  async get() {
    const guidePath = join(__dirname, '..', 'docs', 'teacher-judge-config-guide.md');
    this.response.body = await readFile(guidePath);
    this.response.type = 'text/markdown; charset=utf-8';
    this.response.disposition = 'attachment; filename="scratch-problem-testpoint-guide.md"';
  }
}

export function applyHandlers(ctx: any, pluginConfig: PluginConfig) {
  const bindConfig = (klass: any) => class extends klass {
    pluginConfig = pluginConfig;
  };
  ctx.Route('scratch_problem_create', '/scratch/problem/create', bindConfig(ScratchProblemCreateHandler), PERM.PERM_CREATE_PROBLEM);
  ctx.Route('scratch_problem_import', '/scratch/problem/import', bindConfig(ScratchProblemImportHandler), PERM.PERM_CREATE_PROBLEM);
  ctx.Route('scratch_problem_edit', '/scratch/problem/:pid/edit', bindConfig(ScratchProblemEditHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_config', '/scratch/problem/:pid/config', bindConfig(ScratchProblemConfigHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_guide', '/scratch/problem/guide', bindConfig(ScratchProblemGuideHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_export', '/scratch/problem/:pid/export', bindConfig(ScratchProblemExportHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_template', '/scratch/problem/:pid/template', bindConfig(ScratchProblemTemplateHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_statement', '/scratch/problem/:pid/statement', bindConfig(ScratchProblemStatementHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_submissions', '/scratch/problem/:pid/submissions', bindConfig(ScratchProblemSubmissionsHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_review_queue', '/scratch/review', bindConfig(ScratchReviewQueueHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_editor', '/scratch/problem/:pid/editor', bindConfig(ScratchEditorHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_save_draft', '/scratch/problem/:pid/draft', bindConfig(ScratchDraftSaveHandler), PERM.PERM_SUBMIT_PROBLEM);
  ctx.Route('scratch_load_draft', '/scratch/problem/:pid/draft', bindConfig(ScratchDraftLoadHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_draft_project', '/scratch/problem/:pid/draft/project', bindConfig(ScratchDraftProjectHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submit', '/scratch/submit/:pid', bindConfig(ScratchSubmitHandler), PERM.PERM_SUBMIT_PROBLEM);
  ctx.Route('scratch_submission_project', '/scratch/submission/:rid/project', bindConfig(ScratchSubmissionProjectHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_preview', '/scratch/submission/:rid/preview', bindConfig(ScratchSubmissionPreviewHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_report', '/scratch/submission/:rid/report', bindConfig(ScratchSubmissionReportHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_score', '/scratch/submission/:rid/score', bindConfig(ScratchSubmissionScoreHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_asset_internal', '/scratch-assets/internalapi/asset/:filename/get', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_internal_slash', '/scratch-assets/internalapi/asset/:filename/get/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_internal_direct', '/scratch-assets/internalapi/asset/:filename', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_internal_direct_slash', '/scratch-assets/internalapi/asset/:filename/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_direct_get', '/scratch-assets/:filename/get', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_direct_get_slash', '/scratch-assets/:filename/get/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_direct', '/scratch-assets/:filename', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_internal', '/api/scratch-assets/internalapi/asset/:filename/get', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_internal_slash', '/api/scratch-assets/internalapi/asset/:filename/get/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_internal_direct', '/api/scratch-assets/internalapi/asset/:filename', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_internal_direct_slash', '/api/scratch-assets/internalapi/asset/:filename/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_direct_get', '/api/scratch-assets/:filename/get', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_direct_get_slash', '/api/scratch-assets/:filename/get/', ScratchAssetProxyHandler);
  ctx.Route('scratch_asset_api_direct', '/api/scratch-assets/:filename', ScratchAssetProxyHandler);

  ctx.on?.('problem/get', async (pdoc: any, handler: Handler) => {
    if (handler.request.json) return;
    if (getQueryValue(handler, 'scratchActions') === '0') return;
    if (!pdoc?.docId) return undefined;
    const domainId = pdoc.domainId || handler.args?.domainId;
    if (!pluginEnabledForDomain(pluginConfig, domainId)) return;
    const config = await ScratchModel.getProblemConfig(domainId, pdoc.docId, pluginConfig);
    if (!['editor', 'both'].includes(config.submitMode)) return;
    appendScratchProblemActionsSafe(pdoc, handler, config);
  });
}

export function mapValidationError(error: unknown) {
  if (error instanceof ScratchValidationError) {
    return {
      code: error.code,
      message: error.message,
      evidence: error.evidence,
    };
  }
  return null;
}
