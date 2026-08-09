export type ModelStatus = 
  | 'NO_MODEL'
  | 'INSTALLING'
  | 'VERIFYING'
  | 'READY'
  | 'INVALID';

export type FileType = 'onnx' | 'json' | 'text' | 'binary';

export type OnnxArtifactClassification = 
  | 'VALID ONNX ARTIFACT'
  | 'INVALID / HTML ARTIFACT'
  | 'EMPTY ARTIFACT'
  | 'INVALID ARTIFACT'
  | 'CORRUPTED PROTOBUF ARTIFACT'
  | 'SYNTHETIC / NO COMPUTATION NODES'
  | string;

export interface OnnxArtifactInspection {
  classification: OnnxArtifactClassification;
  isValid: boolean;
  errorMessage?: string;
  byteLength: number;
}

export interface ZipInspectionReport {
  zipSizeBytes: number;
  entryCount: number;
  fileList: Array<{
    path: string;
    uncompressedSizeBytes: number;
    isDir: boolean;
  }>;
  onnxFiles: Array<{
    path: string;
    exactByteSize: number;
    first32Hex: string;
    sha256: string;
    classification: string;
    isValidOnnx: boolean;
    errorMessage?: string;
  }>;
  modelOnnxDetails: {
    path: string | null;
    exactByteSize: number;
    classification: string;
    isBinaryOnnx: boolean;
    isHtmlOrText: boolean;
    first32Hex: string;
    sha256: string;
  };
  jsonConfigTokenizerFiles: Array<{
    path: string;
    uncompressedSizeBytes: number;
  }>;
  duplicateOrUnexpectedFiles: Array<{
    path: string;
    sizeBytes: number;
    reason: string;
  }>;
  totalUncompressedSizeBytes: number;
  isValidZip: boolean;
  zipError?: string;
}

export interface ModelFileInfo {
  path: string;
  size: number;
  type: FileType;
  lastModified?: number;
}

export interface BembaModelConfig {
  modelName?: string;
  language?: string;
  languageCode?: string;
  speaker?: string;
  sampleRate?: number;
  phonemeType?: string;
  version?: string;
  [key: string]: unknown;
}

export interface InstalledModel {
  id: string;
  name: string;
  installedAt: number;
  totalSizeBytes: number;
  files: ModelFileInfo[];
  config: BembaModelConfig | null;
  tokenizerConfig: Record<string, unknown> | null;
  vocab: Record<string, number> | string[] | null;
  onnxValid: boolean;
  modelPath: string; // e.g. "models/bemba/model.onnx"
  preExtractionSha256?: string;
}

export interface ValidationLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedFiles: string[];
  modelOnnxSize: number;
  config: BembaModelConfig | null;
  tokenizerConfig: Record<string, unknown> | null;
  vocab: Record<string, number> | string[] | null;
  logs: ValidationLog[];
}

export type EngineStatusType = 
  | 'NOT_INITIALIZED'
  | 'UNINITIALIZED'
  | 'INITIALIZING'
  | 'ONNX_INITIALIZING'
  | 'READY'
  | 'ONNX_READY'
  | 'INFERENCE_RUNNING'
  | 'SYNTHESIZING'
  | 'AUDIO_PLAYING'
  | 'FAILED'
  | 'ONNX_FAILED'
  | 'READY_STAGE1'
  | 'SYNTHESIZING_STAGE1'
  | 'STOPPED'
  | 'ERROR'
  | 'RELEASED';

export interface ModelBytesDiagnostics {
  byteLength: number;
  sha256: string;
  first32Hex: string;
  last32Hex: string;
  idbReturnType: string;
  sessionArgumentType: string;
  sessionArgumentByteLength: number;
  jsonConversionOccurred: boolean;
  stringConversionOccurred: boolean;
  truncationOccurred: boolean;
}

export interface AudioWaveformStats {
  minSample: number;
  maxSample: number;
  peakAmplitude: number;
  rmsAmplitude: number;
  dcOffset?: number;
  durationSeconds: number;
  hasNonZeroAudio: boolean;
  nonZeroSampleCount: number;
  sampleRate: number;
  sampleCount: number;
  zeroCrossingRate?: number;
  percentageNearZero?: number;
  percentageClipped?: number;
  nanCount?: number;
  infCount?: number;
}

export interface InferenceTestReport {
  inputTensorName: string;
  inputShape: string;
  inputDataType: string;
  outputTensorName: string;
  outputShape: string;
  outputDataType: string;
  executionTimeMs: number;
  success: boolean;
  sampleCount?: number;
  sampleRate?: number;
  isAudioWaveform?: boolean;
  waveformStats?: AudioWaveformStats;
}

export type SpeechSpeedType = 0.75 | 0.85 | 1.0 | 1.15;

export interface ListenLatencyBreakdown {
  clickToAudioCtxMs: number;
  audioCtxToModelReadyMs: number;
  modelReadyToTokenMs: number;
  tokenToInferenceMs: number;
  inferenceToPcmMs: number;
  pcmToBufferMs: number;
  bufferToPlaybackMs: number;
  totalLatencyMs: number;
}

export interface ListenDiagnosticLog {
  timestamp: string;
  text: string;
  audioContextState: string;
  audioContextSampleRate: number;
  modelLoaded: boolean;
  modelSessionReused: boolean;
  inferenceStarted: boolean;
  inferenceCompleted: boolean;
  outputTensorName?: string;
  outputTensorDims?: string;
  outputTensorType?: string;
  outputLength?: number;
  pcmLength: number;
  pcmMin: number;
  pcmMax: number;
  pcmRms: number;
  modelSampleRate: number;
  playbackSampleRate: number;
  calculatedDurationSec: number;
  expectedDurationSec: number;
  speechSpeed: number;
  playbackStarted: boolean;
  playbackEnded: boolean;
  latencyBreakdown?: ListenLatencyBreakdown;
  error?: string;
  stackTrace?: string;
}

export interface StagePcmStats {
  minAmplitude: number;
  maxAmplitude: number;
  rms: number;
  peakAmplitude: number;
  dcOffset: number;
  zeroCrossingRate: number;
  percentageNearZero: number;
  sampleCount: number;
  durationSeconds: number;
  nanCount: number;
  infCount: number;
  sampleRate: number;
}

export interface AudioBufferDiffStats {
  sampleCountDiff: number;
  maxAbsDiff: number;
  rmsDiff: number;
}

export type ModelContractVerdict = 
  | 'MODEL + INPUT CONTRACT VALID'
  | 'TOKENIZER/INPUT CONTRACT INVALID'
  | 'OUTPUT TENSOR CONTRACT INVALID'
  | 'SAMPLING RATE CONTRACT INVALID'
  | 'MODEL EXPORT/ARCHITECTURE INVALID'
  | 'INSUFFICIENT EVIDENCE';

export interface ModelInputSpec {
  name: string;
  tensorType: string;
  elemType: number;
  shape: (number | string)[];
  isDynamic: boolean;
  dynamicDimensions: string[];
}

export interface ModelOutputSpec {
  name: string;
  tensorType: string;
  elemType: number;
  shape: (number | string)[];
  isDynamic: boolean;
}

export interface SuppliedFeedInfo {
  name: string;
  shape: number[];
  dataType: string;
  exactValues: number[] | string[];
}

export interface TokenizerComparison {
  appTokenizerCompatibleWithMms: boolean;
  appVocabSize: number;
  modelVocabSize: number | null;
  configJsonPresent: boolean;
  tokenizerConfigJsonPresent: boolean;
  vocabJsonPresent: boolean;
  configJsonDetails: Record<string, unknown> | null;
  tokenizerConfigDetails: Record<string, unknown> | null;
  vocabJsonDetailsSummary: string;
  charTokenMappings: Array<{ char: string; appId: number; vocabJsonId: number | null; match: boolean }>;
  mismatchDetails: string[];
}

export interface ModelContractTestReport {
  timestamp: string;
  textTested: string;
  sessionInputNames: string[];
  inputs: ModelInputSpec[];
  sessionOutputNames: string[];
  outputs: ModelOutputSpec[];
  suppliedFeeds: SuppliedFeedInfo[];
  selectedOutputTensorName: string;
  selectedOutputShape: number[];
  selectedOutputType: string;
  outputWaveformLength: number;
  waveformStats: AudioWaveformStats;
  declaredModelSampleRate: number | null;
  sampleRateSource: string;
  additionalInputsRequired: {
    hasSpeakerId: boolean;
    hasLanguageId: boolean;
    hasNoiseScale: boolean;
    hasLengthScale: boolean;
    hasDurationOrPadding: boolean;
    inputAnalysisDetails: string[];
  };
  tokenizationLog: {
    text: string;
    normalizedText: string;
    tokenIds: number[];
    charTokenPairs: Array<{ char: string; id: number }>;
  };
  tokenizerComparison: TokenizerComparison;
  modelExportVerification: {
    isVitsArchitecture: boolean;
    producerName: string;
    producerVersion: string;
    opsetVersion: number;
    irVersion: number;
    nodeCount: number;
    exportStatus: string;
    exportIssues: string[];
  };
  verdict: ModelContractVerdict;
  verdictEvidence: string[];
}

export interface AbDiagnosticComparison {
  text: string;
  requestId: string;
  mode: 'RAW_ONNX' | 'PURIFIED';
  audioContextState: string;
  audioContextSampleRate: number;
  rawPcmStats: StagePcmStats;
  purifiedPcmStats?: StagePcmStats;
  audioBufferDiff: AudioBufferDiffStats;
  sampleRateMatches22050: boolean;
}

export interface EngineState {
  status: EngineStatusType;
  message: string;
  lastTextSynthesized: string | null;
  activeModelName: string | null;
  onnxRuntimeStatus: 'Uninitialized' | 'Initializing' | 'Ready' | 'Failed';
  onnxErrorMessage?: string;
  modelBytesDiagnostics?: ModelBytesDiagnostics;
  playbackStatus?: 'IDLE' | 'PLAYING' | 'COMPLETED' | 'FAILED';
  playbackError?: string;
  speechSpeed: SpeechSpeedType;
  graphMeta?: {
    irVersion: number;
    opsetVersion: number;
    producerName: string;
    inputs: { name: string; elemType: number; elemTypeName: string; shape: (number | string)[] }[];
    outputs: { name: string; elemType: number; elemTypeName: string; shape: (number | string)[] }[];
  };
  lastInferenceReport?: InferenceTestReport;
  listenDiagnosticLog?: ListenDiagnosticLog;
}

export interface TestLabSentenceResult {
  originalText: string;
  normalizedText: string;
  tokenIds: number[];
  tokenCount: number;
  requestId: string;
  inputTensorNames: string[];
  inputTensorShapes: string[];
  outputTensorNames: string[];
  outputTensorShapes: string[];
  sampleRate: number;
  sampleCount: number;
  durationSec: number;
  minPcm: number;
  maxPcm: number;
  meanPcm: number;
  rmsPcm: number;
  containsSilence: boolean;
  isDuplicateWaveform: boolean;
  waveformHash: string;
  passed: boolean;
  errorReason?: string;
}

export interface TestLabSuiteReport {
  passed: boolean;
  sentenceResults: TestLabSentenceResult[];
  uniqueWaveformsPass: boolean;
  errorReason?: string;
}

export interface IBembaTtsEngine {
  initialize(modelPath?: string): Promise<boolean>;
  synthesize(text: string): Promise<void>;
  runModelContractTest(textToTest?: string): Promise<ModelContractTestReport>;
  runEightSentenceTtsTest(): Promise<TestLabSuiteReport>;
  runFivePhraseTtsTest(): Promise<{
    passed: boolean;
    phraseResults: Array<{
      phrase: string;
      requestId: string;
      tokenCount: number;
      inputHash: string;
      inferenceTimeMs: number;
      outputHash: string;
      sampleCount: number;
      durationSec: number;
      rms: number;
      waveformHash: string;
      valid: boolean;
      errorMessage?: string;
    }>;
    uniqueWaveformsPass: boolean;
    errorReason?: string;
  }>;
  setSpeechSpeed(speed: SpeechSpeedType): void;
  stop(): void;
  stopAudioPlayback(): void;
  release(): void;
  getState(): EngineState;
  subscribe(listener: (state: EngineState) => void): () => void;
}
