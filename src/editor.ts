import {
  ForbiddenError,
  Handler,
  NotFoundError,
  PERM,
  Types,
  ValidationError,
  param,
} from 'hydrooj';
import { buildScratchEditorUrl } from './assets';
import { pluginEnabledForDomain } from './config';
import { ScratchValidationError } from './errors';
import { HydroApi } from './hydro-api';
import { ScratchModel } from './model';
import { limitsFromMB, validateScratchProject } from './sb3';
import type { PluginConfig, ScratchProblemConfig } from './types';

function filenameFor(originalName: string | undefined, fallback: string) {
  const name = (originalName || fallback).replace(/[\\/:*?"<>|]/g, '_');
  return name.toLowerCase().endsWith('.sb3') ? name : `${name}.sb3`;
}

function resolveOrigin(editorUrl: string, explicitOrigin: string) {
  if (explicitOrigin) return explicitOrigin;
  if (!editorUrl) return '';
  try {
    return new URL(editorUrl).origin;
  } catch {
    return '';
  }
}

function appendQuery(url: string, query: Record<string, string | number | boolean | undefined>) {
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

function getFirstQueryValue(handler: Handler, names: string[]) {
  for (const name of names) {
    const value = getQueryValue(handler, name);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function getRequestHeader(handler: Handler, name: string) {
  const request: any = handler.request as any;
  const getter = request?.get || request?.header;
  if (typeof getter === 'function') {
    try {
      const value = getter.call(request, name);
      if (value) return value;
    } catch { /* fall through to header object lookup */ }
  }
  const headers = request?.headers || {};
  return headers[name.toLowerCase()] || headers[name] || '';
}

function getRefererQueryValue(handler: Handler, names: string[]) {
  const referer = String(getRequestHeader(handler, 'referer') || getRequestHeader(handler, 'referrer') || '');
  if (!referer) return '';
  try {
    const url = new URL(referer, 'http://hydro.local');
    for (const name of names) {
      const value = url.searchParams.get(name);
      if (value) return value;
    }
  } catch {
    return '';
  }
  return '';
}

function normalizeObjectIdText(value: unknown) {
  const text = String(value || '').trim();
  return /^[0-9a-f]{24}$/i.test(text) ? text : '';
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

abstract class ScratchEditorBaseHandler extends Handler {
  pluginConfig!: PluginConfig;
  pdoc: any;
  scratchConfig!: ScratchProblemConfig;

  @param('pid', Types.ProblemId)
  async prepare(domainId: string, pid: number) {
    if (!pluginEnabledForDomain(this.pluginConfig, domainId)) throw new NotFoundError('Scratch plugin');
    this.pdoc = await HydroApi.problem.get(domainId, pid);
    if (!this.pdoc) throw new NotFoundError(`Problem ${pid}`);
    this.scratchConfig = await ScratchModel.getProblemConfig(domainId, this.pdoc.docId, this.pluginConfig);
    if (!this.scratchConfig.enabled) throw new NotFoundError('Scratch problem');
  }

  ensureEditorEnabled() {
    if (!['editor', 'both'].includes(this.scratchConfig.submitMode)) {
      throw new ValidationError('scratch.editor_disabled');
    }
  }
}

export class ScratchEditorHandler extends ScratchEditorBaseHandler {
  async get() {
    this.ensureEditorEnabled();
    if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) throw new ForbiddenError();
    const editorUrl = buildScratchEditorUrl(this.pluginConfig);
    const tid = normalizeObjectIdText(getQueryValue(this, 'tid') || getRefererQueryValue(this, ['tid'])) || undefined;
    const problemQuery = { scratch: 0, tid };
    const problemUrl = appendQuery(this.url('problem_detail', { pid: this.pdoc.docId }), problemQuery);
    const canManage = userCanManageProblem(this.user, this.pdoc);
    const requestedReturnUrl = safeLocalUrl(getFirstQueryValue(this, ['returnUrl', 'return', 'redirect']));
    const trainingId = getFirstQueryValue(this, ['training', 'trainingId', 'trid']);
    let returnListUrl = '';
    let returnListLabel = '';
    let contestRule = '';
    if (tid) {
      try {
        const tdoc = await HydroApi.contest.get(this.pdoc.domainId, tid);
        contestRule = String(tdoc?.rule || '');
        if (tdoc?.rule === 'homework') {
          returnListUrl = this.url('homework_detail', { tid });
          returnListLabel = '返回作业';
        } else {
          returnListUrl = this.url('contest_problemlist', { tid });
          returnListLabel = '返回比赛题目列表';
        }
      } catch {
        returnListUrl = this.url('contest_problemlist', { tid });
        returnListLabel = '返回比赛题目列表';
        contestRule = 'contest';
      }
    } else if (trainingId) {
      returnListUrl = this.url('training_detail', { tid: trainingId });
      returnListLabel = '返回训练';
    }
    this.response.template = 'scratch_editor.html';
    this.response.body = {
      pdoc: this.pdoc,
      config: this.scratchConfig,
      tid: tid || '',
      editorUrl,
      editorOrigin: resolveOrigin(editorUrl, this.pluginConfig.scratchEditorOrigin),
      problemUrl,
      problemDescriptionUrl: appendQuery(this.url('scratch_problem_statement', { pid: this.pdoc.docId }), { tid }),
      templateUrl: this.scratchConfig.templatePath ? this.url('scratch_problem_template', { pid: this.pdoc.docId }) : '',
      templateProjectUrl: this.scratchConfig.templatePath
        ? appendQuery(this.url('scratch_problem_template', { pid: this.pdoc.docId }), { raw: 1 })
        : '',
      submitUrl: this.url('scratch_submit', { pid: this.pdoc.docId }),
      saveDraftUrl: this.url('scratch_save_draft', { pid: this.pdoc.docId }),
      loadDraftUrl: this.url('scratch_load_draft', { pid: this.pdoc.docId }),
      draftProjectUrl: this.url('scratch_draft_project', { pid: this.pdoc.docId }),
      previewUrl: problemUrl,
      submissionsUrl: this.url('scratch_problem_submissions', { pid: this.pdoc.docId }),
      submissionsLabel: canManage ? 'Review Submissions' : 'My Submissions',
      returnUrl: requestedReturnUrl || problemUrl,
      returnListUrl,
      returnListLabel,
      contestRule,
      canManage,
    };
  }
}

export class ScratchDraftSaveHandler extends ScratchEditorBaseHandler {
  async post() {
    this.ensureEditorEnabled();
    if (!this.user.hasPerm(PERM.PERM_SUBMIT_PROBLEM)) throw new ForbiddenError();
    const domainId = String(this.pdoc.domainId || this.args.domainId || 'system');
    const file = this.request.files?.project || this.request.files?.file;
    if (!file || file.size === 0) throw new ValidationError('file');
    const originalName = filenameFor(file.originalFilename, `draft-${this.pdoc.docId}.sb3`);
    const validation = await this.validateProject(file.filepath, originalName);
    const draftId = `p${this.pdoc.docId}-u${this.user._id}`;
    const draftPath = `${this.pluginConfig.storagePrefix}/${domainId}/draft/${this.pdoc.docId}/${this.user._id}/current.sb3`;
    await HydroApi.storage.put(draftPath, file.filepath, this.user._id);
    const meta = await HydroApi.storage.getMeta(draftPath);
    await ScratchModel.saveDraft({
      domainId,
      problemId: this.pdoc.docId,
      userId: this.user._id,
      draftId,
      draftPath,
      originalName,
      fileSize: meta?.size || file.size,
      validation,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.response.body = {
      draftId,
      originalName,
      fileSize: meta?.size || file.size,
      updatedAt: new Date(),
      validation,
    };
  }

  private async validateProject(filePath: string, originalName: string) {
    try {
      return await validateScratchProject(filePath, originalName, limitsFromMB(this.scratchConfig));
    } catch (error) {
      if (error instanceof ScratchValidationError) throw new ValidationError(`${error.code}: ${error.message}`);
      throw error;
    }
  }
}

export class ScratchDraftLoadHandler extends ScratchEditorBaseHandler {
  async get() {
    this.ensureEditorEnabled();
    if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) throw new ForbiddenError();
    const domainId = String(this.pdoc.domainId || this.args.domainId || 'system');
    const draft = await ScratchModel.getLatestDraft(domainId, this.pdoc.docId, this.user._id);
    if (!draft) {
      this.response.body = { draft: null };
      return;
    }
    const fileUrl = await HydroApi.storage.signDownloadLink(draft.draftPath, draft.originalName, false, 'user');
    this.response.body = {
      draft: {
        draftId: draft.draftId,
        fileUrl,
        originalName: draft.originalName,
        fileSize: draft.fileSize,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        validation: draft.validation,
      },
    };
  }
}

export class ScratchDraftProjectHandler extends ScratchEditorBaseHandler {
  async get() {
    this.ensureEditorEnabled();
    if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) throw new ForbiddenError();
    const domainId = String(this.pdoc.domainId || this.args.domainId || 'system');
    const draft = await ScratchModel.getLatestDraft(domainId, this.pdoc.docId, this.user._id);
    if (!draft) throw new NotFoundError('Scratch draft');
    this.response.body = await HydroApi.storage.get(draft.draftPath);
    this.response.type = 'application/octet-stream';
    this.response.disposition = `attachment; filename="${encodeURIComponent(draft.originalName)}"`;
  }
}
