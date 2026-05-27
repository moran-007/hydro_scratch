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
import {
  ScratchDraftLoadHandler,
  ScratchDraftProjectHandler,
  ScratchDraftSaveHandler,
  ScratchEditorHandler,
} from './editor';
import { ScratchValidationError } from './errors';
import { HydroApi } from './hydro-api';
import { ScratchModel } from './model';
import { limitsFromMB, validateScratchProject } from './sb3';
import type { PluginConfig, ScratchProblemConfig, ScratchSubmitSource, ScratchSubmissionMeta } from './types';

const SCRATCH_LANG = 'scratch3';
const STATUS_IGNORED = STATUS?.STATUS_IGNORED ?? 30;
const SCRATCH_ACTIONS_MARKER = '<!-- hydro-scratch-actions -->';

function parseBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
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

function filenameFor(originalName: string | undefined, fallback: string) {
  const name = (originalName || fallback).replace(/[\\/:*?"<>|]/g, '_');
  return name.toLowerCase().endsWith('.sb3') ? name : `${name}.sb3`;
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

function appendScratchProblemActions(pdoc: any, handler: Handler, config: ScratchProblemConfig) {
  if (!config.enabled || typeof pdoc.content !== 'string' || pdoc.content.includes(SCRATCH_ACTIONS_MARKER)) return;
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
  if (!config.enabled || typeof pdoc.content !== 'string' || pdoc.content.includes(SCRATCH_ACTIONS_MARKER)) return;
  const tid = getQueryValue(handler, 'tid') as string | undefined;
  const editorUrl = buildHandlerUrl(handler, 'scratch_editor', { pid: pdoc.docId }, { tid });
  const submissionsUrl = buildHandlerUrl(handler, 'scratch_problem_submissions', { pid: pdoc.docId });
  const editUrl = buildHandlerUrl(handler, 'scratch_problem_edit', { pid: pdoc.docId });
  const canManage = userCanManageProblem(handler.user, pdoc);
  const managerLinks = canManage
    ? `\n\nTeacher entry: [Submissions / Manual score](${submissionsUrl}) | [Edit Scratch problem](${editUrl})`
    : '';
  pdoc.content = `${pdoc.content}

${SCRATCH_ACTIONS_MARKER}

---

**Scratch Online Editor**

[Open Scratch Online Editor](${editorUrl}) | [My Scratch submissions](${submissionsUrl})
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
  if (rdoc.status !== undefined && Number(rdoc.status) !== STATUS_IGNORED) return true;
  const texts = Array.isArray(rdoc.judgeTexts) ? rdoc.judgeTexts.join('\n') : String(rdoc.judgeTexts || '');
  return /Manual Scratch score|Scratch score/i.test(texts);
}

function recordStatusLabel(status: unknown) {
  const value = Number(status);
  if (value === STATUS.STATUS_ACCEPTED) return 'Accepted';
  if (value === STATUS.STATUS_WRONG_ANSWER) return 'Wrong Answer';
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

function recordContestId(rdoc: any) {
  const value = rdoc?.contest;
  if (!value) return '';
  const text = typeof value?.toHexString === 'function' ? value.toHexString() : String(value);
  if (!text || /^0{24}$/.test(text) || /^0{23}[01]$/.test(text)) return '';
  return text;
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

async function listScratchRecordsForProblem(
  domainId: string,
  problemIds: any[],
  uid: number | undefined,
) {
  const docs: any[] = [];
  const addDocs = (rows: any[]) => {
    for (const row of rows || []) {
      const rid = recordId(row);
      if (rid && !docs.some((item) => sameRecordId(recordId(item), rid))) docs.push(row);
    }
  };
  const ownerQuery = uid === undefined ? {} : { uid };
  addDocs(await HydroApi.record.listByProblems(domainId, problemIds, uid, { sort: { _id: -1 }, limit: uid === undefined ? 1000 : 500 }));
  for (const problemId of problemIds) {
    addDocs(await HydroApi.record.list(domainId, { ...ownerQuery, pid: problemId }, { sort: { _id: -1 }, limit: 100 }));
  }
  addDocs(await HydroApi.record.listScratchCandidates(domainId, uid, { sort: { _id: -1 }, limit: uid === undefined ? 1000 : 500 }));
  const scratchDocs = docs.filter((rdoc) => isScratchRecord(rdoc) && !!parseRecordProjectFile(rdoc));
  const problemDocs = scratchDocs.filter((rdoc) => recordBelongsToProblem(rdoc, problemIds));
  return problemDocs.length ? problemDocs : scratchDocs;
}

async function buildSubmissionRows(handler: Handler, domainId: string, docs: ScratchSubmissionMeta[], rdocs: any[]) {
  const recordByRid = new Map<string, any>();
  for (const rdoc of rdocs || []) {
    const rid = recordId(rdoc);
    if (rid) recordByRid.set(String(rid), rdoc);
  }
  const userIds = docs.map((item) => Number(item.userId)).filter((uid) => Number.isFinite(uid));
  const udict = await HydroApi.user.getList(domainId, userIds);
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
    const contestId = recordContestId(rdoc);
    const tdoc = contestId ? contestDict[contestId] : null;
    const originType = !contestId ? 'normal' : tdoc?.rule === 'homework' ? 'homework' : 'contest';
    const originLabel = originType === 'normal'
      ? 'Normal'
      : `${originType === 'homework' ? 'Homework' : 'Contest'}${tdoc?.title ? `: ${tdoc.title}` : ''}`;
    const originUrl = contestId
      ? handler.url(originType === 'homework' ? 'homework_detail' : 'contest_detail', { tid: contestId })
      : '';
    const status = rdoc?.status ?? item.status;
    const scored = !!item.scored || isRecordScored(rdoc);
    return {
      ...item,
      userId: rdoc?.uid ?? item.userId,
      userName: udoc.displayName || udoc.uname || String(item.userId),
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

function filterSubmissionRows(rows: any[], originFilter: string, statusFilter: string) {
  return rows.filter((item) => {
    if (originFilter !== 'all' && item.sourceType !== originFilter) return false;
    if (statusFilter === 'waiting' && item.scored) return false;
    if (statusFilter === 'scored' && !item.scored) return false;
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

function buildScratchConfigPatch(
  current: ScratchProblemConfig,
  body: Record<string, any>,
  userId: number,
  isFormPost: boolean,
) {
  const disabledScratchExtensions = (body.disabledScratchExtensions ?? body.disabled_scratch_extensions) === undefined
    ? current.disabledScratchExtensions
    : parseStringArray(body.disabledScratchExtensions || body.disabled_scratch_extensions);
  return {
    enabled: parseBoolean(body.enabled, isFormPost ? false : current.enabled),
    submitMode: body.submitMode || body.submit_mode || current.submitMode,
    judgeMode: body.judgeMode || body.judge_mode || current.judgeMode,
    allowDownloadTemplate: parseBoolean(body.allowDownloadTemplate, isFormPost ? false : current.allowDownloadTemplate),
    maxProjectSizeMB: Number(body.maxProjectSizeMB || body.max_project_size_mb || current.maxProjectSizeMB),
    maxUnpackedSizeMB: Number(body.maxUnpackedSizeMB || body.max_unpacked_size_mb || current.maxUnpackedSizeMB),
    maxAssetSizeMB: Number(body.maxAssetSizeMB || body.max_asset_size_mb || current.maxAssetSizeMB),
    maxAssetCount: Number(body.maxAssetCount || body.max_asset_count || current.maxAssetCount),
    maxProjectJsonSizeMB: Number(body.maxProjectJsonSizeMB || body.max_project_json_size_mb || current.maxProjectJsonSizeMB),
    disabledScratchExtensions,
    maxScore: Number(body.maxScore || body.max_score || current.maxScore),
    updatedBy: userId,
  };
}

abstract class ScratchProblemHandler extends Handler {
  pluginConfig!: PluginConfig;
  pdoc: any;
  routePid?: string | number;
  scratchConfig!: ScratchProblemConfig;

  @param('pid', Types.ProblemId)
  async prepare(domainId: string, pid: string | number) {
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
      editUrl: this.url('scratch_problem_edit', { pid: this.pdoc.docId }),
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

export class ScratchProblemCreateHandler extends Handler {
  pluginConfig!: PluginConfig;

  async get() {
    this.response.template = 'scratch_problem_create.html';
    this.response.body = {
      defaultContent: 'Scratch project assignment.\n\nUpload a .sb3 file to submit your work.',
      defaultMaxScore: this.pluginConfig.maxScore,
    };
  }

  @post('title', Types.Title)
  @post('content', Types.Content, true)
  @post('pid', Types.ProblemId, true)
  @post('hidden', Types.Boolean, true)
  async post(domainId: string, title: string, content = '', pid: string | number = '', hidden = false) {
    if (typeof pid !== 'string') pid = `P${pid}`;
    const docId = await HydroApi.problem.add(
      domainId,
      pid,
      title,
      content || 'Scratch project assignment.',
      this.user._id,
      ['Scratch'],
      { hidden },
    );
    await ScratchModel.setProblemConfig(domainId, docId, this.pluginConfig, {
      enabled: true,
      submitMode: 'editor',
      judgeMode: 'manual',
      maxScore: this.pluginConfig.maxScore,
      updatedBy: this.user._id,
    });
    this.response.body = { pid: pid || docId };
    this.response.redirect = this.url('problem_detail', { pid: pid || docId });
  }
}

export class ScratchProblemEditHandler extends ScratchProblemHandler {
  async get() {
    this.ensureProblemManager();
    this.response.template = 'scratch_problem_edit.html';
    this.response.body = {
      pdoc: this.pdoc,
      config: this.scratchConfig,
      templateUploadUrl: this.url('scratch_problem_template', { pid: this.pdoc.docId }),
      templateDownloadUrl: this.scratchConfig.templatePath
        ? this.url('scratch_problem_template', { pid: this.pdoc.docId })
        : '',
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

export class ScratchSubmitHandler extends ScratchProblemHandler {
  @post('source', Types.Range(['upload', 'editor']), true)
  @post('tid', Types.ObjectId, true)
  async post(domainId: string, source: ScratchSubmitSource = 'upload', tid?: any) {
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
      maxScore: this.scratchConfig.maxScore,
      status: STATUS_IGNORED,
      scored: false,
      previewAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await ScratchModel.addSubmission(submission);
    const problemUrl = buildHandlerUrl(this, 'problem_detail', { pid: this.pdoc.docId }, {
      scratch: 0,
      tid: tid ? String(tid) : undefined,
    });
    const previewUrl = this.url('scratch_submission_preview', { rid });
    const historyUrl = this.url('scratch_problem_submissions', { pid: this.pdoc.docId });
    const scoreUrl = this.url('scratch_submission_score', { rid });
    await HydroApi.record.update(effectiveDomainId, rid, {
      code: [
        'Scratch project submitted.',
        `Preview: ${previewUrl}`,
        `History: ${historyUrl}`,
        `Manual score: ${scoreUrl}`,
        `File: ${originalName}`,
      ].join('\n'),
      files: { code: `${submissionFileId}#${originalName}` },
      status: STATUS_IGNORED,
      score: 0,
      time: 0,
      memory: 0,
      progress: 100,
      judgeAt: new Date(),
      judger: 'scratch',
      source: 'scratch',
      judgeTexts: [
        'Scratch submission uploaded. Waiting for manual score.',
        `Scratch preview: ${previewUrl}`,
        `Scratch history: ${historyUrl}`,
      ],
      testCases: [{
        id: 0,
        subtaskId: 0,
        status: STATUS_IGNORED,
        score: 0,
        time: 0,
        memory: 0,
        message: 'Scratch project saved without automatic judging.',
      }],
    });
    await Promise.all([
      HydroApi.problem.inc(effectiveDomainId, this.pdoc.docId, 'nSubmit', 1),
      HydroApi.domain.incUserInDomain(effectiveDomainId, this.user._id, 'nSubmit'),
      tid && HydroApi.contest.updateStatus(effectiveDomainId, tid, this.user._id, rid, this.pdoc.docId),
    ]);
    this.response.body = {
      ok: true,
      rid,
      status: 'Waiting',
      projectPath,
      validation,
      redirectUrl: problemUrl,
      problemUrl,
      previewUrl,
      historyUrl,
      recordUrl: this.url('record_detail', { rid }),
      downloadUrl: this.url('scratch_submission_project', { rid }),
      scoreUrl,
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
    this.rdoc = await HydroApi.record.get(domainId, rid) || await HydroApi.record.get(rid);
    if (!this.rdoc) throw new NotFoundError(`Record ${rid}`);
    const effectiveDomainId = this.rdoc.domainId || domainId;
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
    };
  }
}

export class ScratchSubmissionScoreHandler extends ScratchSubmissionHandler {
  async get() {
    this.ensureCanScoreSubmission();
    const projectUrl = appendQuery(this.url('scratch_submission_project', { rid: this.rdoc._id }), { raw: 1 });
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
    };
  }

  @post('score', Types.Float)
  @post('comment', Types.String, true)
  async post(domainId: string, score: number, comment = '') {
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
    await HydroApi.judge.end(effectiveDomainId, this.rdoc._id, {
      status,
      score,
      time: 0,
      memory: 0,
      message: comment || `Manual Scratch score: ${score}/${maxScore}`,
      case: {
        id: 0,
        subtaskId: 0,
        status,
        score,
        time: 0,
        memory: 0,
        message: comment || `Manual Scratch score: ${score}/${maxScore}`,
      },
      judger: this.user._id,
    });
    this.response.body = {
      rid: this.rdoc._id,
      score,
      maxScore,
      status,
      redirectUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
    };
    if (!this.request.json) this.response.redirect = appendQuery(
      this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
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
    const query = canReadAll ? {} : { userId: this.user._id };
    const metaDocs = await listScratchSubmissionMeta(effectiveDomainId, problemIds, query);
    const rdocs = await listScratchRecordsForProblem(effectiveDomainId, problemIds, canReadAll ? undefined : this.user._id);
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
        filters: { origin: originFilter, status: statusFilter },
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
      scoredRid: getQueryValue(this, 'scored') || '',
      editorUrl: this.url('scratch_editor', { pid: this.pdoc.docId }),
      problemUrl: this.url('problem_detail', { pid: this.pdoc.docId }),
      recordListUrl: appendQuery(this.url('record_main'), { pid: String(this.routePid || this.pdoc.docId) }),
      editUrl: this.url('scratch_problem_edit', { pid: this.pdoc.docId }),
      configUrl: this.url('scratch_problem_config', { pid: this.pdoc.docId }),
    };
  }
}

export function applyHandlers(ctx: any, pluginConfig: PluginConfig) {
  const bindConfig = (klass: any) => class extends klass {
    pluginConfig = pluginConfig;
  };
  ctx.Route('scratch_problem_create', '/scratch/problem/create', bindConfig(ScratchProblemCreateHandler), PERM.PERM_CREATE_PROBLEM);
  ctx.Route('scratch_problem_edit', '/scratch/problem/:pid/edit', bindConfig(ScratchProblemEditHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_config', '/scratch/problem/:pid/config', bindConfig(ScratchProblemConfigHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_template', '/scratch/problem/:pid/template', bindConfig(ScratchProblemTemplateHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_statement', '/scratch/problem/:pid/statement', bindConfig(ScratchProblemStatementHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_submissions', '/scratch/problem/:pid/submissions', bindConfig(ScratchProblemSubmissionsHandler), PERM.PERM_VIEW_PROBLEM);
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
    const config = await ScratchModel.getProblemConfig(pdoc.domainId, pdoc.docId, pluginConfig);
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
