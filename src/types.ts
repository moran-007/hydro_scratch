export type ScratchSubmitMode = 'upload' | 'editor' | 'both';
export type ScratchJudgeMode = 'manual' | 'static' | 'dynamic' | 'hybrid';
export type ScratchSubmitSource = 'upload' | 'editor';
export type ScratchProblemKind = 'task' | 'algorithm';
export type ScratchJudgeCategory = 'static' | 'structure' | 'dynamic' | 'algorithm';
export type ScratchAlgorithmCompareMode = 'exact' | 'trim' | 'tokens' | 'number';
export type ScratchAlgorithmInputSplit = 'none' | 'lines' | 'tokens';
export type ScratchAlgorithmInputMode = 'variable' | 'list' | 'ask';
export type ScratchAlgorithmOutputMode = 'variable' | 'list' | 'say';
export type ScratchAlgorithmValue = string | number | boolean | Array<string | number | boolean>;

export interface ScratchCheckBase {
  name: string;
  score: number;
  hint?: string;
}

export type ScratchStaticCheck =
  | (ScratchCheckBase & {
      type: 'sprite_exists';
      sprite: string;
    })
  | (ScratchCheckBase & {
      type: 'variable_exists';
      variable: string;
    })
  | (ScratchCheckBase & {
      type: 'list_exists';
      list: string;
    })
  | (ScratchCheckBase & {
      type: 'broadcast_exists';
      broadcast: string;
    })
  | (ScratchCheckBase & {
      type: 'block_exists';
      opcode: string;
    })
  | (ScratchCheckBase & {
      type: 'block_exists_any';
      opcodes: string[];
    })
  | (ScratchCheckBase & {
      type: 'forbidden_block_absent';
      opcode: string;
    })
  | (ScratchCheckBase & {
      type: 'min_block_count';
      opcode: string;
      count: number;
    });

export type ScratchSequenceMode = 'ordered_subsequence' | 'exact_prefix';

export type ScratchStructureCheck =
  | (ScratchCheckBase & {
      type: 'target_script_exists';
      target: string;
      hat: string;
    })
  | (ScratchCheckBase & {
      type: 'script_sequence';
      target: string;
      hat?: string;
      sequence: string[];
      mode?: ScratchSequenceMode;
    })
  | (ScratchCheckBase & {
      type: 'script_module';
      target: string;
      hat?: string;
      requiredOpcodes: string[];
      ordered?: boolean;
    })
  | (ScratchCheckBase & {
      type: 'block_input_equals';
      target: string;
      hat?: string;
      opcode: string;
      inputs: Record<string, string | number | boolean>;
      occurrence?: number;
    })
  | (ScratchCheckBase & {
      type: 'block_field_equals';
      target: string;
      hat?: string;
      opcode: string;
      fields: Record<string, string | number | boolean>;
      occurrence?: number;
    });

export type ScratchDynamicStep =
  | {
      action: 'green_flag';
    }
  | {
      action: 'wait';
      ms: number;
    }
  | {
      action: 'key_down';
      key: string;
    }
  | {
      action: 'key_up';
      key: string;
    }
  | {
      action: 'key_press';
      key: string;
      ms?: number;
    };

export type ScratchDynamicComparison =
  | 'exists'
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_or_equal'
  | 'less_than'
  | 'less_or_equal'
  | 'changed';

export type ScratchDynamicCheck =
  | (ScratchCheckBase & {
      type: 'runtime_runs';
      steps?: ScratchDynamicStep[];
      timeoutMs?: number;
    })
  | (ScratchCheckBase & {
      type: 'variable_value';
      variable: string;
      target?: string;
      expected?: unknown;
      operator?: ScratchDynamicComparison;
      steps?: ScratchDynamicStep[];
      timeoutMs?: number;
    })
  | (ScratchCheckBase & {
      type: 'sprite_position';
      target: string;
      expected: {
        x?: number;
        y?: number;
      };
      tolerance?: number;
      steps?: ScratchDynamicStep[];
      timeoutMs?: number;
    });

export interface ScratchDynamicOptions {
  defaultWaitMs?: number;
  keyPressMs?: number;
  timeoutMs?: number;
  positionTolerance?: number;
}

export interface ScratchAlgorithmCase {
  name: string;
  input: ScratchAlgorithmValue;
  expectedOutput: ScratchAlgorithmValue;
  score?: number;
  hint?: string;
  hidden?: boolean;
  compareMode?: ScratchAlgorithmCompareMode;
}

export interface ScratchAlgorithmConfig {
  target?: string;
  inputMode?: ScratchAlgorithmInputMode;
  inputVariable?: string;
  inputList?: string;
  outputMode?: ScratchAlgorithmOutputMode;
  outputVariable?: string;
  outputList?: string;
  inputSplit?: ScratchAlgorithmInputSplit;
  outputJoin?: string;
  compareMode?: ScratchAlgorithmCompareMode;
  numericTolerance?: number;
  waitMs?: number;
  timeoutMs?: number;
  cases?: ScratchAlgorithmCase[];
}

export interface ScratchJudgeConfig {
  schemaVersion?: number;
  problemId?: string | number;
  title?: string;
  totalScore?: number;
  staticChecks?: ScratchStaticCheck[];
  structureChecks?: ScratchStructureCheck[];
  dynamicChecks?: ScratchDynamicCheck[];
  dynamicOptions?: ScratchDynamicOptions;
  algorithm?: ScratchAlgorithmConfig;
}

export interface ScratchScriptMeta {
  target: string;
  hat?: string;
  opcodes: string[];
  blockCount: number;
}

export interface ScratchProjectMeta {
  stageName?: string;
  spriteNames: string[];
  variableNames: string[];
  listNames: string[];
  broadcastNames: string[];
  blockOpcodes: string[];
  blockCount: number;
  scripts?: ScratchScriptMeta[];
}

export type ScratchJudgeDetailType =
  | ScratchStaticCheck['type']
  | ScratchStructureCheck['type']
  | ScratchDynamicCheck['type']
  | 'algorithm_case';

export interface ScratchJudgeDetail {
  name: string;
  type: ScratchJudgeDetailType;
  category?: ScratchJudgeCategory;
  target?: string;
  passed: boolean;
  score: number;
  maxScore: number;
  message: string;
  hint?: string;
  evidence?: string[];
  actualValue?: unknown;
  expectedValue?: unknown;
}

export interface ScratchJudgeResult {
  mode: 'static' | 'dynamic' | 'hybrid' | 'algorithm';
  totalScore: number;
  maxScore: number;
  passed: boolean;
  details: ScratchJudgeDetail[];
  summary: {
    passedChecks: number;
    totalChecks: number;
    rawScore: number;
    rawMaxScore: number;
  };
  projectMeta: ScratchProjectMeta;
}

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
  problemKind: ScratchProblemKind;
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
  judgeConfig: ScratchJudgeConfig;
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
  autoJudgeResult?: ScratchJudgeResult;
  autoJudgeAt?: Date;
  autoJudgeError?: string;
  status?: number;
  scored?: boolean;
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
  enabledDomains: string[];
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
