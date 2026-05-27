export type ScratchSubmitMode = 'upload' | 'editor' | 'both';
export type ScratchJudgeMode = 'manual' | 'static' | 'dynamic' | 'hybrid';
export type ScratchSubmitSource = 'upload' | 'editor';

export interface ScratchLimits {
  maxProjectSizeBytes: number;
  maxUnpackedSizeBytes: number;
  maxAssetSizeBytes: number;
  maxAssetCount: number;
  maxProjectJsonSizeBytes: number;
}

export interface ScratchProblemConfig {
  domainId: string;
  problemId: number;
  enabled: boolean;
  submitMode: ScratchSubmitMode;
  judgeMode: ScratchJudgeMode;
  templatePath?: string;
  templateName?: string;
  templateMeta?: {
    size?: number;
    etag?: string;
    lastModified?: Date;
  };
  allowDownloadTemplate: boolean;
  maxProjectSizeMB: number;
  maxUnpackedSizeMB: number;
  maxAssetSizeMB: number;
  maxAssetCount: number;
  maxProjectJsonSizeMB: number;
  disabledScratchExtensions: string[];
  maxScore: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: number;
}

export interface ScratchSubmissionMeta {
  domainId: string;
  rid: any;
  problemId: number;
  userId: number;
  projectPath: string;
  originalName: string;
  projectSize: number;
  source: ScratchSubmitSource;
  validation: ScratchValidationSummary;
  score?: number;
  maxScore: number;
  manualScoreBy?: number;
  manualScoreAt?: Date;
  manualComment?: string;
  previewAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScratchDraftMeta {
  domainId: string;
  problemId: number;
  userId: number;
  draftId: string;
  draftPath: string;
  originalName: string;
  fileSize: number;
  validation: ScratchValidationSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScratchValidationSummary {
  projectJsonSize: number;
  unpackedSize: number;
  assetCount: number;
  targets: number;
  spriteCount: number;
  hasStage: boolean;
  warnings: string[];
}

export interface PluginConfig {
  storagePrefix: string;
  maxProjectSizeMB: number;
  maxUnpackedSizeMB: number;
  maxAssetSizeMB: number;
  maxAssetCount: number;
  maxProjectJsonSizeMB: number;
  maxScore: number;
  previewPlayerUrl: string;
  scratchEditorUrl: string;
  scratchEditorOrigin: string;
  scratchAssetHost: string;
}
