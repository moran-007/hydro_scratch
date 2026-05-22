import { extname } from 'node:path';
import {
  ContestModel,
  DomainModel,
  FileTooLargeError,
  ForbiddenError,
  Handler,
  JudgeResultCallbackContext,
  NotFoundError,
  PERM,
  ProblemModel,
  RecordModel,
  STATUS,
  StorageModel,
  Types,
  ValidationError,
  nanoid,
  param,
  post,
} from 'hydrooj';
import { ScratchValidationError } from './errors';
import { ScratchModel } from './model';
import { limitsFromMB, validateScratchProject } from './sb3';
import type { PluginConfig, ScratchProblemConfig, ScratchSubmitSource, ScratchSubmissionMeta } from './types';

const SCRATCH_LANG = 'scratch3';

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

function buildPreviewUrl(baseUrl: string, projectUrl: string) {
  if (!baseUrl) return '';
  const url = new URL(baseUrl);
  url.searchParams.set('project_url', projectUrl);
  return url.toString();
}

async function validateUploadedScratchProject(filePath: string, originalName: string, config: ScratchProblemConfig) {
  try {
    return await validateScratchProject(filePath, originalName, limitsFromMB(config));
  } catch (error) {
    if (error instanceof ScratchValidationError) throw new ValidationError(`${error.code}: ${error.message}`);
    throw error;
  }
}

abstract class ScratchProblemHandler extends Handler {
  pluginConfig!: PluginConfig;
  pdoc: any;
  scratchConfig!: ScratchProblemConfig;

  @param('pid', Types.ProblemId)
  async prepare(domainId: string, pid: number) {
    this.pdoc = await ProblemModel.get(domainId, pid);
    if (!this.pdoc) throw new NotFoundError(`Problem ${pid}`);
    this.scratchConfig = await ScratchModel.getProblemConfig(domainId, this.pdoc.docId, this.pluginConfig);
  }

  ensureProblemManager() {
    if (!this.user.own?.(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF) && !this.user.hasPerm(PERM.PERM_EDIT_PROBLEM)) {
      throw new ForbiddenError();
    }
  }

  ensureScratchEnabled() {
    if (!this.scratchConfig.enabled) throw new ValidationError('scratch.enabled');
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
      templateUploadUrl: this.url('scratch_problem_template', { pid: this.pdoc.docId }),
      templateDownloadUrl: this.scratchConfig.templatePath
        ? this.url('scratch_problem_template', { pid: this.pdoc.docId })
        : '',
    };
  }

  async post() {
    this.ensureProblemManager();
    const body = this.args || {};
    const isFormPost = !this.request.json;
    const disabledScratchExtensions = (body.disabledScratchExtensions ?? body.disabled_scratch_extensions) === undefined
      ? this.scratchConfig.disabledScratchExtensions
      : parseStringArray(body.disabledScratchExtensions || body.disabled_scratch_extensions);
    const config = await ScratchModel.setProblemConfig(this.pdoc.domainId, this.pdoc.docId, this.pluginConfig, {
      enabled: parseBoolean(body.enabled, isFormPost ? false : this.scratchConfig.enabled),
      submitMode: body.submitMode || body.submit_mode,
      judgeMode: body.judgeMode || body.judge_mode || 'manual',
      allowDownloadTemplate: parseBoolean(body.allowDownloadTemplate, isFormPost ? false : this.scratchConfig.allowDownloadTemplate),
      maxProjectSizeMB: Number(body.maxProjectSizeMB || body.max_project_size_mb || this.scratchConfig.maxProjectSizeMB),
      maxUnpackedSizeMB: Number(body.maxUnpackedSizeMB || body.max_unpacked_size_mb || this.scratchConfig.maxUnpackedSizeMB),
      maxAssetSizeMB: Number(body.maxAssetSizeMB || body.max_asset_size_mb || this.scratchConfig.maxAssetSizeMB),
      maxAssetCount: Number(body.maxAssetCount || body.max_asset_count || this.scratchConfig.maxAssetCount),
      maxProjectJsonSizeMB: Number(body.maxProjectJsonSizeMB || body.max_project_json_size_mb || this.scratchConfig.maxProjectJsonSizeMB),
      disabledScratchExtensions,
      maxScore: Number(body.maxScore || body.max_score || this.scratchConfig.maxScore),
      updatedBy: this.user._id,
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
    const docId = await ProblemModel.add(
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
      submitMode: 'upload',
      judgeMode: 'manual',
      maxScore: this.pluginConfig.maxScore,
      updatedBy: this.user._id,
    });
    this.response.body = { pid: pid || docId };
    this.response.redirect = this.url('scratch_problem_config', { pid: pid || docId });
  }
}

export class ScratchProblemTemplateHandler extends ScratchProblemHandler {
  async get() {
    this.ensureScratchEnabled();
    if (!this.scratchConfig.templatePath) throw new NotFoundError('Scratch template');
    if (!this.scratchConfig.allowDownloadTemplate) this.ensureProblemManager();
    this.response.redirect = await StorageModel.signDownloadLink(
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
    await StorageModel.put(templatePath, file.filepath, this.user._id);
    const meta = await StorageModel.getMeta(templatePath);
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
    if (!['upload', 'both'].includes(this.scratchConfig.submitMode) && source === 'upload') throw new ValidationError('source');
    if (!['editor', 'both'].includes(this.scratchConfig.submitMode) && source === 'editor') throw new ValidationError('source');
    const file = this.request.files?.file;
    if (!file || file.size === 0) throw new ValidationError('file');
    if (file.size > this.scratchConfig.maxProjectSizeMB * 1024 * 1024) throw new FileTooLargeError('file');

    await this.limitRate('add_record', 60, 20, '{{user}}');
    const originalName = filenameFor(file.originalFilename, `scratch-${Date.now()}.sb3`);
    const validation = await validateUploadedScratchProject(file.filepath, originalName, this.scratchConfig);

    const rid = await RecordModel.add(
      domainId,
      this.pdoc.docId,
      this.user._id,
      SCRATCH_LANG,
      '',
      false,
      { contest: tid, files: {}, type: 'judge' },
    );
    const storageId = nanoid();
    const projectPath = `${this.pluginConfig.storagePrefix}/${domainId}/submission/${this.user._id}/${storageId}${extname(originalName) || '.sb3'}`;
    await StorageModel.put(projectPath, file.filepath, this.user._id);
    const meta = await StorageModel.getMeta(projectPath);
    const submission: ScratchSubmissionMeta = {
      domainId,
      rid,
      problemId: this.pdoc.docId,
      userId: this.user._id,
      projectPath,
      originalName,
      projectSize: meta?.size || file.size,
      source,
      validation,
      maxScore: this.scratchConfig.maxScore,
      previewAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await ScratchModel.addSubmission(submission);
    await RecordModel.update(domainId, rid, {
      files: { code: `${projectPath}#${originalName}` },
      judgeTexts: ['Scratch submission uploaded. Waiting for manual score.'],
    });
    await Promise.all([
      ProblemModel.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
      DomainModel.incUserInDomain(domainId, this.user._id, 'nSubmit'),
      tid && ContestModel.updateStatus(domainId, tid, this.user._id, rid, this.pdoc.docId),
    ]);
    this.response.body = {
      rid,
      status: 'Waiting',
      projectPath,
      validation,
      previewUrl: this.url('scratch_submission_preview', { rid }),
      downloadUrl: this.url('scratch_submission_project', { rid }),
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
    this.rdoc = await RecordModel.get(domainId, rid);
    if (!this.rdoc) throw new NotFoundError(`Record ${rid}`);
    const submission = await ScratchModel.getSubmission(domainId, rid);
    if (!submission) throw new NotFoundError('Scratch submission');
    this.submission = submission;
    this.pdoc = await ProblemModel.get(domainId, this.rdoc.pid);
    if (!this.pdoc) throw new NotFoundError(`Problem ${this.rdoc.pid}`);
  }

  canManageProblem() {
    return this.user.own?.(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF) || this.user.hasPerm(PERM.PERM_EDIT_PROBLEM);
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
    this.response.redirect = await StorageModel.signDownloadLink(
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
    const projectUrl = await StorageModel.signDownloadLink(
      this.submission.projectPath,
      this.submission.originalName,
      false,
      'user',
    );
    this.response.template = 'scratch_preview.html';
    this.response.body = {
      pdoc: this.pdoc,
      rdoc: this.rdoc,
      submission: this.submission,
      projectUrl,
      playerUrl: buildPreviewUrl(this.pluginConfig.previewPlayerUrl, projectUrl),
      downloadUrl: this.url('scratch_submission_project', { rid: this.rdoc._id }),
      reportUrl: this.url('scratch_submission_report', { rid: this.rdoc._id }),
      scoreUrl: this.url('scratch_submission_score', { rid: this.rdoc._id }),
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
  @post('score', Types.Float)
  @post('comment', Types.String, true)
  async post(domainId: string, score: number, comment = '') {
    this.ensureCanScoreSubmission();
    const maxScore = this.submission.maxScore || 100;
    if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new ValidationError('score');
    await ScratchModel.updateSubmission(domainId, this.rdoc._id, {
      score,
      maxScore,
      manualScoreBy: this.user._id,
      manualScoreAt: new Date(),
      manualComment: comment,
    });
    await JudgeResultCallbackContext.end(domainId, this.rdoc._id, {
      status: scoreToStatus(score, maxScore),
      score,
      time: 0,
      memory: 0,
      message: comment || `Manual Scratch score: ${score}/${maxScore}`,
      judger: this.user._id,
    });
    this.response.body = {
      rid: this.rdoc._id,
      score,
      maxScore,
      status: scoreToStatus(score, maxScore),
    };
  }
}

export class ScratchProblemSubmissionsHandler extends ScratchProblemHandler {
  async get(domainId: string) {
    this.ensureScratchEnabled();
    const canReadAll = this.user.hasPerm(PERM.PERM_READ_RECORD_CODE) || this.user.own?.(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF) || this.user.hasPerm(PERM.PERM_EDIT_PROBLEM);
    const query = canReadAll ? {} : { userId: this.user._id };
    const docs = await ScratchModel.getProblemSubmissions(domainId, this.pdoc.docId, query).limit(100).toArray();
    this.response.body = { submissions: docs };
  }
}

export function applyHandlers(ctx: any, pluginConfig: PluginConfig) {
  const bindConfig = (klass: any) => class extends klass {
    pluginConfig = pluginConfig;
  };
  ctx.Route('scratch_problem_create', '/scratch/problem/create', bindConfig(ScratchProblemCreateHandler), PERM.PERM_CREATE_PROBLEM);
  ctx.Route('scratch_problem_config', '/scratch/problem/:pid/config', bindConfig(ScratchProblemConfigHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_template', '/scratch/problem/:pid/template', bindConfig(ScratchProblemTemplateHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_problem_submissions', '/scratch/problem/:pid/submissions', bindConfig(ScratchProblemSubmissionsHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submit', '/scratch/submit/:pid', bindConfig(ScratchSubmitHandler), PERM.PERM_SUBMIT_PROBLEM);
  ctx.Route('scratch_submission_project', '/scratch/submission/:rid/project', bindConfig(ScratchSubmissionProjectHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_preview', '/scratch/submission/:rid/preview', bindConfig(ScratchSubmissionPreviewHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_report', '/scratch/submission/:rid/report', bindConfig(ScratchSubmissionReportHandler), PERM.PERM_VIEW_PROBLEM);
  ctx.Route('scratch_submission_score', '/scratch/submission/:rid/score', bindConfig(ScratchSubmissionScoreHandler), PERM.PERM_EDIT_PROBLEM);
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
