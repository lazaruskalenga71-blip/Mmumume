import * as ort from 'onnxruntime-web';
import { modelStorage } from '../storage/modelStorage';
import { OnnxInspector, OnnxProtobufDiagnostic } from '../engine/onnxInspector';

export type ModelDiagnosticStatus =
  | 'MODEL_MISSING'
  | 'MODEL_TRUNCATED'
  | 'MODEL_LFS_POINTER'
  | 'MODEL_HTML'
  | 'MODEL_CORRUPTED'
  | 'ONNX_SESSION_FAILED'
  | 'ONNX_SESSION_READY';

export interface ModelIntegrityDiagnosticResult {
  status: ModelDiagnosticStatus;
  existsInIndexedDB: boolean;
  exactByteSize: number;
  metadataByteSize?: number;
  sizeMatchesMetadata?: boolean;
  first32Hex: string;
  first32Ascii: string;
  last32Hex: string;
  isLfsPointer: boolean;
  isHtmlResponse: boolean;
  isBinaryData: boolean;
  sha256: string;
  protobufDiag?: OnnxProtobufDiagnostic;
  onnxSessionAttempted: boolean;
  onnxSessionSuccess: boolean;
  onnxErrorMessage?: string;
  diagnosticNotes: string[];
}

/**
 * Diagnostic tool to inspect the exact binary currently stored in IndexedDB at 'models/bemba/model.onnx'.
 * Verifies binary integrity, LFS pointer text, HTML text responses, byte sizes, SHA-256 hash,
 * and attempts ONNX InferenceSession creation only after all integrity checks pass.
 *
 * DOES NOT fetch or download from external networks/URLs.
 */
export async function runModelIntegrityDiagnostic(
  modelPath: string = 'models/bemba/model.onnx'
): Promise<ModelIntegrityDiagnosticResult> {
  const diagnosticNotes: string[] = [];

  // 1. Check whether model exists in IndexedDB
  const rawBuffer = await modelStorage.getModelFile(modelPath);

  if (!rawBuffer || rawBuffer.byteLength === 0) {
    diagnosticNotes.push(`Model artifact '${modelPath}' was not found or is 0 bytes in local IndexedDB storage.`);
    return {
      status: 'MODEL_MISSING',
      existsInIndexedDB: false,
      exactByteSize: 0,
      first32Hex: '',
      first32Ascii: '',
      last32Hex: '',
      isLfsPointer: false,
      isHtmlResponse: false,
      isBinaryData: false,
      sha256: 'N/A',
      onnxSessionAttempted: false,
      onnxSessionSuccess: false,
      diagnosticNotes,
    };
  }

  const exactByteSize = rawBuffer.byteLength;
  const isBinaryData = rawBuffer instanceof ArrayBuffer || (rawBuffer as unknown) instanceof Uint8Array;
  const view = new Uint8Array(rawBuffer);

  // 2. Extract first 32 and last 32 bytes
  const first32Count = Math.min(32, exactByteSize);
  const first32Bytes = view.subarray(0, first32Count);
  const last32Bytes = view.subarray(Math.max(0, exactByteSize - 32));

  const first32Hex = Array.from(first32Bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  const last32Hex = Array.from(last32Bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  const first32Ascii = Array.from(first32Bytes)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('');

  // 3. Decode sample text (up to 4096 bytes) for text pattern checks
  const sampleSize = Math.min(4096, exactByteSize);
  let sampleText = '';
  try {
    sampleText = new TextDecoder('utf-8', { fatal: false }).decode(view.subarray(0, sampleSize)).toLowerCase();
  } catch {
    sampleText = '';
  }

  // 4. Detect Git LFS pointer text
  const isLfsPointer =
    sampleText.includes('version https://git-lfs.github.com/spec/v1') ||
    sampleText.includes('oid sha256:') ||
    (sampleText.startsWith('version https://git-lfs') && exactByteSize < 1000);

  // 5. Detect HTML or text/error responses
  const isHtmlResponse =
    sampleText.includes('<!doctype') ||
    sampleText.includes('<html') ||
    sampleText.includes('<head>') ||
    sampleText.includes('<body>') ||
    sampleText.includes('404 not found') ||
    (sampleText.trim().startsWith('{') && sampleText.includes('"error"'));

  // 6. Calculate SHA-256 hash of complete stored model
  const sha256 = await modelStorage.calculateSha256(rawBuffer);

  // 7. Compare stored byte size against metadata if available
  const meta = await modelStorage.getModelMetadata();
  let metadataByteSize: number | undefined = undefined;
  let sizeMatchesMetadata: boolean | undefined = undefined;

  if (meta && meta.files) {
    const matchedFile = meta.files.find((f) => f.path === modelPath || f.path.endsWith('model.onnx'));
    if (matchedFile && matchedFile.size > 0) {
      metadataByteSize = matchedFile.size;
      sizeMatchesMetadata = exactByteSize === metadataByteSize;
    }
  }

  // Evaluate integrity checks in priority order:
  if (isLfsPointer) {
    diagnosticNotes.push('REJECTED: Stored artifact is a Git LFS pointer text file, not binary ONNX model weights.');
    return {
      status: 'MODEL_LFS_POINTER',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer: true,
      isHtmlResponse,
      isBinaryData: false,
      sha256,
      onnxSessionAttempted: false,
      onnxSessionSuccess: false,
      diagnosticNotes,
    };
  }

  if (isHtmlResponse) {
    diagnosticNotes.push('REJECTED: Stored artifact contains HTML markup or JSON error text response.');
    return {
      status: 'MODEL_HTML',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer,
      isHtmlResponse: true,
      isBinaryData: false,
      sha256,
      onnxSessionAttempted: false,
      onnxSessionSuccess: false,
      diagnosticNotes,
    };
  }

  if (exactByteSize < 1000 || (metadataByteSize && exactByteSize < metadataByteSize - 100)) {
    diagnosticNotes.push(
      `REJECTED: Stored model is truncated or incomplete (${exactByteSize} bytes vs expected ${metadataByteSize || '>100KB'} bytes).`
    );
    return {
      status: 'MODEL_TRUNCATED',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer,
      isHtmlResponse,
      isBinaryData,
      sha256,
      onnxSessionAttempted: false,
      onnxSessionSuccess: false,
      diagnosticNotes,
    };
  }

  // Check binary format / ONNX protobuf header
  // Protobuf field 1 (ir_version) varint usually starts with 0x08
  if (!isBinaryData || (exactByteSize > 20 && view[0] !== 0x08 && sampleText.startsWith('version'))) {
    diagnosticNotes.push('REJECTED: Stored file structure is corrupted or unrecognized binary/text content.');
    return {
      status: 'MODEL_CORRUPTED',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer,
      isHtmlResponse,
      isBinaryData,
      sha256,
      onnxSessionAttempted: false,
      onnxSessionSuccess: false,
      diagnosticNotes,
    };
  }

  // 8. Perform detailed Protobuf deserialization inspection
  const protobufDiag = OnnxInspector.inspectProtobufArtifact(rawBuffer);
  if (!protobufDiag.protobufParsingSucceeded) {
    diagnosticNotes.push(
      `Protobuf Deserialization Audit: FAILED - ${protobufDiag.errorMessage || 'Invalid wire format / corrupt protobuf bytes'}`
    );
  } else {
    diagnosticNotes.push(
      `Protobuf Deserialization Audit: PASSED (IR: ${protobufDiag.irVersion}, Opset: ${protobufDiag.opsetVersion}, Producer: ${protobufDiag.producerName}, Nodes: ${protobufDiag.nodeCount})`
    );
  }

  // 9. Attempt ort.InferenceSession.create() ONLY after all integrity checks pass
  diagnosticNotes.push('All pre-session binary integrity checks PASSED. Attempting ONNX WebAssembly session creation...');

  try {
    const sessionModelArg = new Uint8Array(rawBuffer);
    const session = await ort.InferenceSession.create(sessionModelArg, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    diagnosticNotes.push(
      `ONNX session created successfully! Inputs: [${session.inputNames.join(', ')}], Outputs: [${session.outputNames.join(', ')}]`
    );

    return {
      status: 'ONNX_SESSION_READY',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer,
      isHtmlResponse,
      isBinaryData: true,
      sha256,
      protobufDiag,
      onnxSessionAttempted: true,
      onnxSessionSuccess: true,
      diagnosticNotes,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    diagnosticNotes.push(`ONNX InferenceSession creation failed: ${errorMsg}`);

    return {
      status: 'ONNX_SESSION_FAILED',
      existsInIndexedDB: true,
      exactByteSize,
      metadataByteSize,
      sizeMatchesMetadata,
      first32Hex,
      first32Ascii,
      last32Hex,
      isLfsPointer,
      isHtmlResponse,
      isBinaryData: true,
      sha256,
      protobufDiag,
      onnxSessionAttempted: true,
      onnxSessionSuccess: false,
      onnxErrorMessage: errorMsg,
      diagnosticNotes,
    };
  }
}
