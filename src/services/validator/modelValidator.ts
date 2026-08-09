import JSZip from 'jszip';
import { BembaModelConfig, OnnxArtifactInspection, ValidationLog, ValidationResult, ZipInspectionReport } from '../../types/model';
import { modelStorage } from '../storage/modelStorage';
import { OnnxInspector } from '../engine/onnxInspector';

export class ModelValidator {
  /**
   * Inspects an ONNX binary buffer to classify if it is a genuine ONNX binary artifact,
   * an HTML web page document, an empty file, or another invalid format.
   */
  static inspectOnnxArtifact(buffer: ArrayBuffer | Uint8Array | null | undefined): OnnxArtifactInspection {
    if (!buffer) {
      return {
        classification: 'EMPTY ARTIFACT',
        isValid: false,
        errorMessage: 'Invalid ONNX model: model file is missing or empty (0 bytes).',
        byteLength: 0,
      };
    }

    const byteLength = buffer.byteLength;
    if (byteLength === 0) {
      return {
        classification: 'EMPTY ARTIFACT',
        isValid: false,
        errorMessage: 'Invalid ONNX model: model file is empty (0 bytes).',
        byteLength: 0,
      };
    }

    const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const sampleSize = Math.min(1024, view.length);
    const sampleBytes = view.subarray(0, sampleSize);

    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(sampleBytes).trim().toLowerCase();
    } catch {
      text = '';
    }

    // Check for HTML document signatures
    const isHtmlSignature =
      text.startsWith('<!doctype') ||
      text.startsWith('<!doctype html') ||
      text.startsWith('<html') ||
      text.includes('<!doctype html>') ||
      text.includes('<html') ||
      text.includes('<head>') ||
      text.includes('<body>');

    if (isHtmlSignature) {
      return {
        classification: 'INVALID / HTML ARTIFACT',
        isValid: false,
        errorMessage: 'Invalid ONNX model: file begins with HTML content (<!doctype html>).',
        byteLength,
      };
    }

    if (text.startsWith('{') && (text.includes('"error"') || text.includes('"message"'))) {
      return {
        classification: 'INVALID ARTIFACT',
        isValid: false,
        errorMessage: 'Invalid ONNX model: file contains JSON error response instead of binary ONNX model.',
        byteLength,
      };
    }

    if (text.startsWith('<')) {
      return {
        classification: 'INVALID / HTML ARTIFACT',
        isValid: false,
        errorMessage: 'Invalid ONNX model: file begins with HTML content (<!doctype html>).',
        byteLength,
      };
    }

    // Strict ONNX Protobuf & Node Computation Graph Audit
    const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const protoDiag = OnnxInspector.inspectProtobufArtifact(arrayBuffer);

    if (!protoDiag.protobufParsingSucceeded) {
      return {
        classification: 'CORRUPTED PROTOBUF ARTIFACT',
        isValid: false,
        errorMessage: `Invalid ONNX model: Protobuf deserialization failed (${protoDiag.errorMessage || 'Invalid wire format'}). File is not a valid ONNX ModelProto binary.`,
        byteLength,
      };
    }

    if (protoDiag.nodeCount === 0) {
      return {
        classification: 'SYNTHETIC / NO COMPUTATION NODES',
        isValid: false,
        errorMessage: 'Invalid ONNX model: ModelProto contains 0 graph computation nodes (synthetic or empty model file). A genuine ONNX model is required.',
        byteLength,
      };
    }

    return {
      classification: `GENUINE ONNX MODELPROTO (IR v${protoDiag.irVersion}, Opset ${protoDiag.opsetVersion}, ${protoDiag.nodeCount} nodes, ${protoDiag.producerName})`,
      isValid: true,
      byteLength,
    };
  }

  /**
   * Sanitizes and verifies entry paths against Path Traversal vulnerabilities (e.g. ../, ..\, absolute paths, encodings).
   */
  static isSafePath(entryPath: string): boolean {
    if (!entryPath) return false;

    // Convert backslashes to forward slashes
    let normalized = entryPath.replace(/\\/g, '/');

    // Check for null bytes
    if (normalized.includes('\0')) {
      return false;
    }

    // Decode URL/percentage encodings (e.g. %2e%2e, %2f, %5c)
    try {
      let prev = '';
      while (normalized !== prev && normalized.includes('%')) {
        prev = normalized;
        const decoded = decodeURIComponent(normalized);
        normalized = decoded.replace(/\\/g, '/');
      }
    } catch {
      return false; // Reject malformed URI encoding
    }

    // Reject absolute filesystem paths (Unix leading slash or Windows drive letter e.g. C:)
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
      return false;
    }

    // Check for path traversal segments ('..' or '../' or '..\\')
    const segments = normalized.split('/');
    if (segments.some((seg) => seg === '..' || seg === '.' && segments.length > 1)) {
      return false;
    }

    if (normalized.includes('..')) {
      return false;
    }

    // Verify resolved destination remains strictly inside 'models/bemba/' directory
    const destinationDir = 'models/bemba/';
    const filename = normalized.split('/').pop() || '';
    const resolvedPath = destinationDir + filename;

    if (!resolvedPath.startsWith('models/bemba/') || resolvedPath.includes('..')) {
      return false;
    }

    return true;
  }

  /**
   * Performs full offline inspection, security verification, and extraction planning.
   */
  static async validateAndExtractZip(
    zipBuffer: ArrayBuffer,
    onProgress?: (log: ValidationLog) => void
  ): Promise<{ validation: ValidationResult; extractedFiles: Map<string, ArrayBuffer> }> {
    const logs: ValidationLog[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const detectedFiles: string[] = [];
    const extractedFiles = new Map<string, ArrayBuffer>();

    const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
      const logEntry: ValidationLog = { timestamp: Date.now(), level, message };
      logs.push(logEntry);
      if (onProgress) onProgress(logEntry);
    };

    addLog('info', 'Starting offline ZIP security audit and model verification...');

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
      addLog('success', 'ZIP file loaded into memory successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `Corrupted or invalid ZIP file: ${msg}`);
      errors.push(`ZIP archive is unreadable or corrupted: ${msg}`);
      return {
        validation: {
          isValid: false,
          errors,
          warnings,
          detectedFiles: [],
          modelOnnxSize: 0,
          config: null,
          tokenizerConfig: null,
          vocab: null,
          logs,
        },
        extractedFiles,
      };
    }

    // 1. Path Traversal & Entry Security Audit
    const entries = Object.keys(zip.files);
    addLog('info', `Archived entry count: ${entries.length} items detected.`);

    let onnxPathInZip: string | null = null;
    let configPathInZip: string | null = null;
    let tokenizerPathInZip: string | null = null;
    let vocabPathInZip: string | null = null;

    for (const rawPath of entries) {
      const fileEntry = zip.files[rawPath];
      if (fileEntry.dir) continue;

      // Path Security Check
      if (!this.isSafePath(rawPath)) {
        addLog('error', `SECURITY THREAT REJECTED: Potential path traversal in entry "${rawPath}"!`);
        errors.push(`Security Violation: Unsafe file path detected in ZIP entry "${rawPath}". Extraction aborted.`);
        return {
          validation: {
            isValid: false,
            errors,
            warnings,
            detectedFiles: [],
            modelOnnxSize: 0,
            config: null,
            tokenizerConfig: null,
            vocab: null,
            logs,
          },
          extractedFiles,
        };
      }

      const normalized = rawPath.replace(/\\/g, '/');
      const filename = normalized.split('/').pop() || '';
      const filenameLower = filename.toLowerCase();

      detectedFiles.push(normalized);

      // Locate key ONNX and Config files recursively across all subdirectories
      if (filenameLower === 'model.onnx' || filenameLower.endsWith('.onnx')) {
        if (onnxPathInZip && filenameLower === 'model.onnx') {
          addLog('warn', `Multiple ONNX models found. Preferring exact "model.onnx" at "${normalized}".`);
        }
        if (!onnxPathInZip || filenameLower === 'model.onnx') {
          onnxPathInZip = rawPath;
        }
      } else if (filenameLower === 'config.json' || filenameLower.includes('model_config.json') || (filenameLower.endsWith('.json') && filenameLower.includes('config'))) {
        if (!configPathInZip || filenameLower === 'config.json') {
          configPathInZip = rawPath;
        }
      } else if (filenameLower === 'tokenizer_config.json' || filenameLower === 'tokenizer.json' || filenameLower.includes('tokenizer')) {
        if (!tokenizerPathInZip || filenameLower === 'tokenizer_config.json') {
          tokenizerPathInZip = rawPath;
        }
      } else if (filenameLower === 'vocab.json' || filenameLower === 'tokens.txt' || filenameLower === 'phonemes.json' || filenameLower.includes('vocab') || filenameLower.includes('phoneme')) {
        if (!vocabPathInZip || filenameLower === 'vocab.json') {
          vocabPathInZip = rawPath;
        }
      }
    }

    // 2. Validate model.onnx presence
    if (!onnxPathInZip) {
      addLog('error', 'Validation Failed: Missing "model.onnx" file inside the ZIP archive.');
      errors.push('Missing required model file: "model.onnx" (or .onnx model file) was not found in the root or subfolders.');
    } else {
      addLog('success', `Found ONNX model file: "${onnxPathInZip}".`);
    }

    // 3. Extract and check files safely
    let modelOnnxSize = 0;
    let config: BembaModelConfig | null = null;
    let tokenizerConfig: Record<string, unknown> | null = null;
    let vocab: Record<string, number> | string[] | null = null;

    for (const rawPath of entries) {
      const fileEntry = zip.files[rawPath];
      if (fileEntry.dir) continue;

      const normalized = rawPath.replace(/\\/g, '/');
      const filename = normalized.split('/').pop() || '';

      try {
        const buffer = await fileEntry.async('arraybuffer');
        
        // Target path inside application-private storage: "models/bemba/<filename>"
        // If this entry is the primary ONNX model, strictly map it to "models/bemba/model.onnx"
        const privateStoragePath = (rawPath === onnxPathInZip)
          ? 'models/bemba/model.onnx'
          : `models/bemba/${filename}`;
        
        if (extractedFiles.has(privateStoragePath) && rawPath !== onnxPathInZip) {
          addLog('warn', `Duplicate file resolved in private storage: "${filename}"`);
        }
        
        extractedFiles.set(privateStoragePath, buffer);

        // Specific File Checks
        if (rawPath === onnxPathInZip) {
          modelOnnxSize = buffer.byteLength;
          const artifactCheck = ModelValidator.inspectOnnxArtifact(buffer);
          if (!artifactCheck.isValid) {
            addLog('error', `CRITICAL ERROR: ${artifactCheck.errorMessage}`);
            errors.push(artifactCheck.errorMessage || 'Invalid ONNX model file.');
          } else {
            addLog('info', `Verified ONNX file binary size: ${modelOnnxSize} bytes (${(modelOnnxSize / (1024 * 1024)).toFixed(2)} MB).`);
            addLog('success', `ONNX binary artifact classification verified: [${artifactCheck.classification}].`);

            // Pre-import Protobuf Deserialization Audit
            const protoDiag = OnnxInspector.inspectProtobufArtifact(buffer);
            if (!protoDiag.protobufParsingSucceeded) {
              addLog('warn', `Pre-Import Protobuf Audit: Protobuf parsing failed (${protoDiag.errorMessage || 'Invalid wire format'}).`);
            } else {
              addLog('success', `Pre-Import Protobuf Audit: PASSED (IR: ${protoDiag.irVersion}, Opset: ${protoDiag.opsetVersion}, Producer: ${protoDiag.producerName}, Nodes: ${protoDiag.nodeCount}).`);
            }
          }
        }

        // Parse JSON configs if present
        if (rawPath === configPathInZip) {
          try {
            const text = new TextDecoder('utf-8').decode(buffer);
            config = JSON.parse(text);
            addLog('success', 'Successfully parsed "config.json".');
          } catch (pe) {
            addLog('warn', `Failed to parse config JSON: ${String(pe)}`);
          }
        } else if (rawPath === tokenizerPathInZip) {
          try {
            const text = new TextDecoder('utf-8').decode(buffer);
            tokenizerConfig = JSON.parse(text);
            addLog('success', 'Successfully parsed tokenizer configuration.');
          } catch (pe) {
            addLog('warn', `Failed to parse tokenizer JSON: ${String(pe)}`);
          }
        } else if (rawPath === vocabPathInZip) {
          try {
            const text = new TextDecoder('utf-8').decode(buffer);
            if (filename.endsWith('.json')) {
              vocab = JSON.parse(text);
            } else {
              vocab = text.split('\n').map(line => line.trim()).filter(Boolean);
            }
            addLog('success', 'Successfully parsed vocabulary / phoneme dictionary.');
          } catch (pe) {
            addLog('warn', `Failed to parse vocabulary: ${String(pe)}`);
          }
        }

      } catch (e) {
        addLog('error', `Failed to read or parse file "${normalized}": ${String(e)}`);
        errors.push(`Corrupted file "${normalized}": ${String(e)}`);
      }
    }

    // 4. Config & Metadata checks
    if (!configPathInZip) {
      addLog('warn', 'Notice: "config.json" was not included in the ZIP. Standard defaults will be applied.');
      warnings.push('Notice: "config.json" was not included in the ZIP. Standard defaults applied.');
    }

    if (!tokenizerPathInZip) {
      addLog('warn', 'Notice: "tokenizer_config.json" missing. Standard Bemba grapheme tokenizer assumed.');
      warnings.push('Notice: "tokenizer_config.json" missing.');
    }

    const isValid = errors.length === 0;

    if (isValid) {
      addLog('success', 'Validation passed! Model is valid and ready for installation.');
    } else {
      addLog('error', `Model verification failed with ${errors.length} error(s).`);
    }

    return {
      validation: {
        isValid,
        errors,
        warnings,
        detectedFiles,
        modelOnnxSize,
        config,
        tokenizerConfig,
        vocab,
        logs,
      },
      extractedFiles,
    };
  }

  /**
   * Performs a dry-run inspection of a ZIP archive without modifying, extracting, or storing any files.
   * Produces a complete 10-point inspection report object.
   */
  static async inspectZipReport(zipBuffer: ArrayBuffer): Promise<ZipInspectionReport> {
    const zipSizeBytes = zipBuffer.byteLength;
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch (e) {
      return {
        zipSizeBytes,
        entryCount: 0,
        fileList: [],
        onnxFiles: [],
        modelOnnxDetails: {
          path: null,
          exactByteSize: 0,
          classification: 'EMPTY ARTIFACT',
          isBinaryOnnx: false,
          isHtmlOrText: false,
          first32Hex: 'N/A',
          sha256: 'N/A',
        },
        jsonConfigTokenizerFiles: [],
        duplicateOrUnexpectedFiles: [],
        totalUncompressedSizeBytes: 0,
        isValidZip: false,
        zipError: `Corrupted or invalid ZIP archive: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const entries = Object.keys(zip.files);
    const fileList: Array<{ path: string; uncompressedSizeBytes: number; isDir: boolean }> = [];
    const onnxFiles: ZipInspectionReport['onnxFiles'] = [];
    const jsonConfigTokenizerFiles: Array<{ path: string; uncompressedSizeBytes: number }> = [];
    const duplicateOrUnexpectedFiles: Array<{ path: string; sizeBytes: number; reason: string }> = [];

    let totalUncompressedSizeBytes = 0;
    let mainModelOnnxPath: string | null = null;
    let mainModelOnnxBuffer: ArrayBuffer | null = null;
    const onnxPaths: string[] = [];

    for (const rawPath of entries) {
      const entry = zip.files[rawPath];
      if (entry.dir) continue;

      const normalized = rawPath.replace(/\\/g, '/');
      const filename = normalized.split('/').pop() || '';
      const filenameLower = filename.toLowerCase();

      let buffer: ArrayBuffer;
      try {
        buffer = await entry.async('arraybuffer');
      } catch {
        buffer = new ArrayBuffer(0);
      }

      const byteSize = buffer.byteLength;
      totalUncompressedSizeBytes += byteSize;

      fileList.push({
        path: normalized,
        uncompressedSizeBytes: byteSize,
        isDir: false,
      });

      // Check for .onnx files
      if (filenameLower.endsWith('.onnx')) {
        onnxPaths.push(normalized);
        if (!mainModelOnnxPath || filenameLower === 'model.onnx') {
          mainModelOnnxPath = normalized;
          mainModelOnnxBuffer = buffer;
        }

        const sha256 = await modelStorage.calculateSha256(buffer);
        const uint8View = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
        const first32Hex = Array.from(uint8View)
          .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

        const inspection = ModelValidator.inspectOnnxArtifact(buffer);

        onnxFiles.push({
          path: normalized,
          exactByteSize: byteSize,
          first32Hex: first32Hex || 'N/A',
          sha256,
          classification: inspection.classification,
          isValidOnnx: inspection.isValid,
          errorMessage: inspection.errorMessage,
        });
      }

      // Check for JSON / Config / Tokenizer files
      if (
        filenameLower.endsWith('.json') ||
        filenameLower.endsWith('.txt') ||
        filenameLower.includes('config') ||
        filenameLower.includes('tokenizer') ||
        filenameLower.includes('vocab') ||
        filenameLower.includes('phoneme')
      ) {
        jsonConfigTokenizerFiles.push({
          path: normalized,
          uncompressedSizeBytes: byteSize,
        });
      }

      // Identify unexpected large files (> 5MB non-ONNX)
      if (!filenameLower.endsWith('.onnx') && byteSize > 5 * 1024 * 1024) {
        duplicateOrUnexpectedFiles.push({
          path: normalized,
          sizeBytes: byteSize,
          reason: `Unexpected large non-ONNX file (${(byteSize / (1024 * 1024)).toFixed(2)} MB)`,
        });
      }
    }

    if (onnxPaths.length > 1) {
      for (const p of onnxPaths) {
        if (p !== mainModelOnnxPath) {
          const matched = fileList.find((f) => f.path === p);
          duplicateOrUnexpectedFiles.push({
            path: p,
            sizeBytes: matched?.uncompressedSizeBytes || 0,
            reason: `Secondary duplicate or extra .onnx file (Primary: "${mainModelOnnxPath}")`,
          });
        }
      }
    }

    let modelOnnxDetails: ZipInspectionReport['modelOnnxDetails'] = {
      path: mainModelOnnxPath,
      exactByteSize: mainModelOnnxBuffer ? mainModelOnnxBuffer.byteLength : 0,
      classification: 'EMPTY ARTIFACT',
      isBinaryOnnx: false,
      isHtmlOrText: false,
      first32Hex: 'N/A',
      sha256: 'N/A',
    };

    if (mainModelOnnxBuffer) {
      const inspection = ModelValidator.inspectOnnxArtifact(mainModelOnnxBuffer);
      const sha256 = await modelStorage.calculateSha256(mainModelOnnxBuffer);
      const uint8View = new Uint8Array(mainModelOnnxBuffer, 0, Math.min(32, mainModelOnnxBuffer.byteLength));
      const first32Hex = Array.from(uint8View)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');

      modelOnnxDetails = {
        path: mainModelOnnxPath,
        exactByteSize: mainModelOnnxBuffer.byteLength,
        classification: inspection.classification,
        isBinaryOnnx: inspection.isValid,
        isHtmlOrText: inspection.classification === 'INVALID / HTML ARTIFACT',
        first32Hex: first32Hex || 'N/A',
        sha256,
      };
    }

    return {
      zipSizeBytes,
      entryCount: fileList.length,
      fileList,
      onnxFiles,
      modelOnnxDetails,
      jsonConfigTokenizerFiles,
      duplicateOrUnexpectedFiles,
      totalUncompressedSizeBytes,
      isValidZip: true,
    };
  }
}

