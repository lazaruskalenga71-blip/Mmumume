import React, { useState, useEffect, useRef } from 'react';
import { Upload, HardDriveDownload, ShieldAlert, CheckCircle2, Trash2, FileText, FileCode, AlertOctagon, RefreshCw, FolderTree, Terminal, Search } from 'lucide-react';
import { InstalledModel, ModelStatus, ValidationResult, ValidationLog, ModelFileInfo, ZipInspectionReport } from '../../types/model';
import { ModelValidator } from '../../services/validator/modelValidator';
import { modelStorage } from '../../services/storage/modelStorage';
import { SampleZipGenerator } from '../../services/zip/sampleZipGenerator';
import { bembaTtsEngine } from '../../services/engine/BembaTtsEngine';

interface VoiceModelScreenProps {
  modelStatus: ModelStatus;
  installedModel: InstalledModel | null;
  onModelUpdated: () => void;
  onStatusChange?: (status: ModelStatus) => void;
}

export const VoiceModelScreen: React.FC<VoiceModelScreenProps> = ({
  modelStatus,
  installedModel,
  onModelUpdated,
  onStatusChange,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<ValidationLog[]>([]);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const [storedFiles, setStoredFiles] = useState<ModelFileInfo[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState<{ path: string; text: string } | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<boolean>(false);
  const [inspection, setInspection] = useState<Awaited<ReturnType<typeof modelStorage.inspectInstalledModel>> | null>(null);
  const [dryRunReport, setDryRunReport] = useState<ZipInspectionReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inspectFileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), level, message }]);
  };

  // Load stored files and inspect model on mount or model change
  useEffect(() => {
    const fetchFilesAndInspect = async () => {
      try {
        const files = await modelStorage.listModelFiles();
        setStoredFiles(files);
        if (installedModel) {
          const res = await modelStorage.inspectInstalledModel();
          setInspection(res);
        } else {
          setInspection(null);
        }
      } catch {
        setStoredFiles([]);
        setInspection(null);
      }
    };
    fetchFilesAndInspect();
  }, [installedModel, modelStatus]);

  const processZipBuffer = async (zipBuffer: ArrayBuffer, sourceName: string) => {
    setIsProcessing(true);
    setLogs([]);
    setSelectedFileContent(null);

    // [1] ZIP selected
    if (onStatusChange) onStatusChange('INSTALLING');
    addLog('info', `[1] ZIP selected: "${sourceName}" (${zipBuffer.byteLength} bytes)`);

    try {
      // Step 2 & 3: Read ZIP & Entry Discovery
      addLog('info', '[2] ZIP opened');

      const { validation, extractedFiles } = await ModelValidator.validateAndExtractZip(
        zipBuffer,
        (log) => {
          if (log.message.includes('Archived entry count')) {
            const count = log.message.match(/\d+/)?.[0] || '0';
            addLog('info', `[3] ZIP entries found: ${count}`);
          }
        }
      );

      setLastValidation(validation);

      if (!validation.isValid) {
        const errorReason = validation.errors[0] || 'Model validation failed.';
        addLog('error', `FAILED: ${errorReason}`);
        if (onStatusChange) onStatusChange('INVALID');
        setIsProcessing(false);
        return;
      }

      // Step 4: model.onnx path
      const onnxFileEntry = validation.detectedFiles.find((f) => f.toLowerCase().endsWith('.onnx'));
      const onnxPathInZip = onnxFileEntry || 'model.onnx';
      addLog('info', `[4] model.onnx found at: ${onnxPathInZip}`);

      // Step 5: model.onnx size
      if (validation.modelOnnxSize <= 0) {
        addLog('error', 'FAILED: model.onnx is empty (0 bytes)');
        if (onStatusChange) onStatusChange('INVALID');
        setIsProcessing(false);
        return;
      }
      addLog('info', `[5] model.onnx size: ${validation.modelOnnxSize} bytes`);

      // Step 6: Configuration files found
      const configFiles = validation.detectedFiles.filter((f) => !f.toLowerCase().endsWith('.onnx'));
      addLog('info', `[6] configuration files found: ${configFiles.join(', ') || 'None (using defaults)'}`);

      // Step 7 & 8: Extraction
      if (onStatusChange) onStatusChange('VERIFYING');
      addLog('info', '[7] extraction started');
      addLog('info', `[8] extraction completed (${extractedFiles.size} files prepared)`);

      // Calculate pre-extraction SHA-256 directly from extracted in-memory buffer
      const rawOnnxBuffer = extractedFiles.get('models/bemba/model.onnx');
      let preExtractionSha256: string | undefined = undefined;
      if (rawOnnxBuffer) {
        preExtractionSha256 = await modelStorage.calculateSha256(rawOnnxBuffer);
        addLog('info', `Pre-extraction SHA-256 calculated: ${preExtractionSha256}`);
      }

      // Step 9: Save files to IndexedDB
      addLog('info', 'Saving extracted model files to IndexedDB storage...');
      for (const [path, buffer] of extractedFiles.entries()) {
        await modelStorage.saveModelFile(path, buffer);
      }

      // Verify model.onnx actually exists in storage and byte size matches imported size exactly
      const storedOnnxBuffer = await modelStorage.getModelFile('models/bemba/model.onnx');
      const importedOnnxBuffer = extractedFiles.get('models/bemba/model.onnx');
      const expectedOnnxSize = importedOnnxBuffer ? importedOnnxBuffer.byteLength : validation.modelOnnxSize;

      if (!storedOnnxBuffer || storedOnnxBuffer.byteLength === 0) {
        addLog('error', 'FAILED: model.onnx was not successfully written to IndexedDB storage (0 bytes retrieved)');
        if (onStatusChange) onStatusChange('INVALID');
        setIsProcessing(false);
        return;
      }

      if (storedOnnxBuffer.byteLength !== expectedOnnxSize) {
        addLog('error', `FAILED: Stored model size mismatch! Expected ${expectedOnnxSize.toLocaleString()} bytes, but IndexedDB contains ${storedOnnxBuffer.byteLength.toLocaleString()} bytes.`);
        if (onStatusChange) onStatusChange('INVALID');
        setIsProcessing(false);
        return;
      }

      addLog('info', `[9] files stored & verified: model.onnx in IndexedDB matches imported size (${storedOnnxBuffer.byteLength.toLocaleString()} bytes)`);

      // Step 10: Metadata saved
      const modelMeta: InstalledModel = {
        id: `bemba-model-${Date.now()}`,
        name: validation.config?.modelName || sourceName.replace(/\.zip$/i, '') || 'Muntu Bemba Voice Model',
        installedAt: Date.now(),
        totalSizeBytes: Array.from(extractedFiles.values()).reduce((acc, buf) => acc + buf.byteLength, 0),
        files: Array.from(extractedFiles.entries()).map(([path, buf]) => ({
          path,
          size: buf.byteLength,
          type: path.endsWith('.onnx') ? 'onnx' : path.endsWith('.json') ? 'json' : 'binary',
        })),
        config: validation.config,
        tokenizerConfig: validation.tokenizerConfig,
        vocab: validation.vocab,
        onnxValid: true,
        modelPath: 'models/bemba/model.onnx',
        preExtractionSha256,
      };

      await modelStorage.saveModelMetadata(modelMeta);

      const verifiedMeta = await modelStorage.getModelMetadata();
      if (!verifiedMeta) {
        addLog('error', 'FAILED: Metadata save verification failed in IndexedDB');
        if (onStatusChange) onStatusChange('INVALID');
        setIsProcessing(false);
        return;
      }
      addLog('info', '[10] metadata saved');

      // Step 11: Model status READY
      if (onStatusChange) onStatusChange('READY');
      addLog('success', '[11] model status: READY');

      await bembaTtsEngine.initialize(modelMeta.name);

      // Refresh stored files view
      const files = await modelStorage.listModelFiles();
      setStoredFiles(files);

      onModelUpdated();
    } catch (err) {
      addLog('error', `FAILED: ${err instanceof Error ? err.message : String(err)}`);
      if (onStatusChange) onStatusChange('INVALID');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      addLog('error', 'FAILED: No file selected');
      return;
    }
    const buffer = await file.arrayBuffer();
    await processZipBuffer(buffer, file.name);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInspectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    addLog('info', `Running Dry-Run ZIP Inspection on "${file.name}" (${file.size} bytes)...`);
    try {
      const buffer = await file.arrayBuffer();
      const report = await ModelValidator.inspectZipReport(buffer);
      setDryRunReport(report);
      addLog('success', `Inspection report generated for "${file.name}".`);
    } catch (err) {
      addLog('error', `Dry-run inspection failed: ${String(err)}`);
    } finally {
      setIsProcessing(false);
      if (inspectFileInputRef.current) inspectFileInputRef.current.value = '';
    }
  };

  const handleGenerateSampleZip = async () => {
    addLog('info', 'Attempting sample Bemba Voice ZIP creation...');
    try {
      const zipBlob = await SampleZipGenerator.generateSampleZip();
      const buffer = await zipBlob.arrayBuffer();
      await processZipBuffer(buffer, 'muntu-bemba-voice-v1.zip');
    } catch (err) {
      addLog('warn', `Prohibition Notice: ${err instanceof Error ? err.message : String(err)}`);
      addLog('info', 'To use the Muntu Bemba TTS Engine, export a genuine ONNX model from target "facebook/mms-tts-bem" and upload the zip file.');
    }
  };

  const handleTestMaliciousZip = async () => {
    addLog('info', 'Testing security audit against malicious ZIP with path traversal...');
    const zipBlob = await SampleZipGenerator.generateMaliciousZip();
    const buffer = await zipBlob.arrayBuffer();
    await processZipBuffer(buffer, 'attack_path_traversal.zip');
  };

  const handleTestMissingModelZip = async () => {
    addLog('info', 'Testing validation against ZIP missing "model.onnx"...');
    const zipBlob = await SampleZipGenerator.generateMissingModelZip();
    const buffer = await zipBlob.arrayBuffer();
    await processZipBuffer(buffer, 'invalid_missing_onnx.zip');
  };

  const handleTestEmptyModelZip = async () => {
    addLog('info', 'Testing validation against ZIP with 0-byte "model.onnx"...');
    const zipBlob = await SampleZipGenerator.generateEmptyModelZip();
    const buffer = await zipBlob.arrayBuffer();
    await processZipBuffer(buffer, 'invalid_empty_onnx.zip');
  };

  const handleTestHtmlModelZip = async () => {
    addLog('info', 'Testing validation against ZIP containing HTML error page as "model.onnx"...');
    const zipBlob = await SampleZipGenerator.generateHtmlModelZip();
    const buffer = await zipBlob.arrayBuffer();
    await processZipBuffer(buffer, 'invalid_html_model.zip');
  };

  const handleRemoveModel = async () => {
    await modelStorage.deleteModel();
    bembaTtsEngine.release();
    setShowRemoveConfirm(false);
    setLastValidation(null);
    setLogs([]);
    setStoredFiles([]);
    setSelectedFileContent(null);
    addLog('info', 'Model removed from private storage.');
    if (onStatusChange) onStatusChange('NO_MODEL');
    onModelUpdated();
  };

  const handleViewFile = async (path: string) => {
    const buffer = await modelStorage.getModelFile(path);
    if (!buffer) return;
    const text = new TextDecoder('utf-8').decode(buffer);
    setSelectedFileContent({ path, text });
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4 bg-[#0A0A0A]">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
            <HardDriveDownload className="w-5 h-5 text-amber-500" />
            <span>Bemba Voice Model Manager</span>
          </h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
            Import, verify, and store Bemba voice models offline.
          </p>
        </div>
      </div>

      {/* Installed Model Card */}
      {installedModel && (
        <div className="bg-[#161616] border border-amber-500/30 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-[#262626] pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">{installedModel.name}</h3>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                  INSTALLED • {(installedModel.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg border border-red-800/40 transition-colors shadow-sm"
              title="Remove Installed Model"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-[#0A0A0A] p-3 rounded-lg border border-[#222]">
            <div>
              <span className="text-gray-500">Path:</span>{' '}
              <span className="text-gray-300">{installedModel.modelPath}</span>
            </div>
            <div>
              <span className="text-gray-500">Language:</span>{' '}
              <span className="text-gray-300">{installedModel.config?.language || 'Bemba (bem)'}</span>
            </div>
            <div>
              <span className="text-gray-500">Sample Rate:</span>{' '}
              <span className="text-gray-300">
                {installedModel.config?.sampleRate !== undefined && installedModel.config?.sampleRate !== null
                  ? `${installedModel.config.sampleRate} Hz`
                  : 'Not specified in config.json'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Files Count:</span>{' '}
              <span className="text-gray-300">{installedModel.files.length} items</span>
            </div>
          </div>

          {/* Stage 1.5 Artifact Integrity Diagnostic Panel */}
          {inspection && inspection.installed && (
            <div className="bg-[#0D0D0D] border border-amber-500/20 rounded-lg p-3 space-y-2 text-[11px] font-mono text-gray-300">
              <div className="flex items-center justify-between border-b border-[#222] pb-1.5 text-xs text-amber-500 font-bold uppercase tracking-wider">
                <span>Stage 1.5 Artifact Integrity Diagnostic</span>
                <span className="text-[10px] text-emerald-400 font-normal">REAL STORAGE MEASUREMENT</span>
              </div>

              <div className="space-y-1.5 leading-relaxed">
                <div className="flex justify-between border-b border-[#181818] pb-1">
                  <span className="text-gray-500">1. Exact model.onnx Byte Size:</span>
                  <span className="text-amber-400 font-bold">{inspection.exactByteSize.toLocaleString()} bytes</span>
                </div>

                <div className="flex flex-col border-b border-[#181818] pb-1">
                  <span className="text-gray-500">2. SHA-256 (Web Crypto stored bytes):</span>
                  <span className="text-emerald-400 text-[10px] break-all select-all font-mono">{inspection.sha256}</span>
                </div>

                <div className="flex flex-col border-b border-[#181818] pb-1">
                  <span className="text-gray-500">3. First 32 Bytes (Hex):</span>
                  <span className="text-sky-300 text-[10px] break-all font-mono">{inspection.first32Hex}</span>
                </div>

                <div className="flex flex-col border-b border-[#181818] pb-1">
                  <span className="text-gray-500">4. Last 32 Bytes (Hex):</span>
                  <span className="text-sky-300 text-[10px] break-all font-mono">{inspection.last32Hex}</span>
                </div>

                <div className="flex justify-between border-b border-[#181818] pb-1">
                  <span className="text-gray-500">5. Byte-for-Byte Storage Readback:</span>
                  <span className={inspection.readBackVerified ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {inspection.readBackVerified ? 'VERIFIED (100% IDB Readback Match)' : 'FAILED'}
                  </span>
                </div>

                <div className="flex flex-col border-b border-[#181818] pb-1">
                  <span className="text-gray-500">6. Pre-Extraction vs Stored SHA-256 Comparison:</span>
                  <span className="text-amber-300 text-[10px]">{inspection.sha256ComparisonStatus}</span>
                </div>

                <div className="flex justify-between border-b border-[#181818] pb-1">
                  <span className="text-gray-500">7. Declared Sample Rate (config.json):</span>
                  <span className="text-gray-200">{inspection.declaredSampleRate}</span>
                </div>

                <div className="flex justify-between border-b border-[#181818] pb-1">
                  <span className="text-gray-500">8. ONNX Models in ZIP:</span>
                  <span className="text-gray-200">{inspection.onnxFilesCount} file(s)</span>
                </div>

                <div className="flex flex-col border-b border-[#181818] pb-1">
                  <span className="text-gray-500">9. Configuration Files Installed:</span>
                  <span className="text-gray-300 text-[10px]">
                    {inspection.configFilesInstalled.length > 0
                      ? inspection.configFilesInstalled.join(', ')
                      : 'None (Default configurations assumed)'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-[#181818] pb-1">
                  <span className="text-gray-500">10. Artifact Classification:</span>
                  <span className={inspection.artifactValid ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                    {inspection.artifactClassification}
                  </span>
                </div>

                {inspection.artifactError && (
                  <div className="text-red-400 text-[10px] font-bold bg-red-950/40 p-2 rounded border border-red-800/40 mt-1">
                    {inspection.artifactError}
                  </div>
                )}

                <div className="pt-1 text-[10px] text-gray-400 italic">
                  * Raw ONNX binary model artifact is verified in app-private storage. ONNX Runtime model execution and speech synthesis compatibility will be tested in Stage 2.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dry Run ZIP Inspection Report Card */}
      {dryRunReport && (
        <div className="bg-[#111111] border-2 border-cyan-500/50 rounded-xl p-4 shadow-2xl space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-[#262626] pb-3">
            <div className="flex items-center space-x-2">
              <Search className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  ZIP Inspection Report (Dry Run Mode - No Import)
                </h3>
                <div className="text-[10px] text-gray-400">
                  Read-only byte & structure verification • Archive unimported
                </div>
              </div>
            </div>
            <button
              onClick={() => setDryRunReport(null)}
              className="text-[10px] bg-[#222] hover:bg-[#333] text-gray-300 py-1 px-2.5 rounded border border-[#444]"
            >
              Clear Report
            </button>
          </div>

          <div className="space-y-2 text-[11px] text-gray-300">
            {/* Item 1 */}
            <div className="flex justify-between border-b border-[#1A1A1A] pb-1">
              <span className="text-gray-500">1. Exact ZIP Size:</span>
              <span className="text-cyan-300 font-bold">
                {dryRunReport.zipSizeBytes.toLocaleString()} bytes ({(dryRunReport.zipSizeBytes / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>

            {/* Item 2 */}
            <div className="flex justify-between border-b border-[#1A1A1A] pb-1">
              <span className="text-gray-500">2. Total Files Inside:</span>
              <span className="text-cyan-300 font-bold">{dryRunReport.entryCount} items</span>
            </div>

            {/* Item 3 & 4 */}
            <div className="border-b border-[#1A1A1A] pb-2 space-y-1">
              <div className="text-gray-500 font-bold">3 & 4. Full File List & Uncompressed Sizes:</div>
              <div className="bg-[#0A0A0A] p-2 rounded border border-[#222] max-h-36 overflow-y-auto space-y-1">
                {dryRunReport.fileList.map((f, i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="text-gray-300 truncate max-w-[220px]">{f.path}</span>
                    <span className="text-gray-400 font-mono">{f.uncompressedSizeBytes.toLocaleString()} bytes</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Item 5 & 6 */}
            <div className="border-b border-[#1A1A1A] pb-2 space-y-1">
              <div className="text-gray-500 font-bold">5 & 6. ONNX Files Inspection:</div>
              {dryRunReport.onnxFiles.length === 0 ? (
                <div className="text-red-400 text-[10px] p-2 bg-red-950/30 rounded border border-red-800/30">
                  No .onnx model files found in ZIP archive!
                </div>
              ) : (
                dryRunReport.onnxFiles.map((onnx, idx) => (
                  <div key={idx} className="bg-[#0A0A0A] p-2 rounded border border-[#222] space-y-1 text-[10px]">
                    <div className="flex justify-between text-cyan-300 font-bold">
                      <span>Path: {onnx.path}</span>
                      <span>{onnx.exactByteSize.toLocaleString()} bytes ({(onnx.exactByteSize / (1024 * 1024)).toFixed(2)} MB)</span>
                    </div>
                    <div>
                      <span className="text-gray-500">First 32 Bytes (Hex):</span>{' '}
                      <span className="text-emerald-400 font-mono break-all">{onnx.first32Hex}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SHA-256 Hash:</span>{' '}
                      <span className="text-amber-400 font-mono break-all">{onnx.sha256}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Artifact Classification:</span>{' '}
                      <span className={onnx.isValidOnnx ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {onnx.classification}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Item 7 */}
            <div className="flex justify-between border-b border-[#1A1A1A] pb-1">
              <span className="text-gray-500">7. model.onnx Artifact Verification:</span>
              <span className={dryRunReport.modelOnnxDetails.isBinaryOnnx ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {dryRunReport.modelOnnxDetails.isBinaryOnnx
                  ? 'GENUINE BINARY ONNX DATA'
                  : dryRunReport.modelOnnxDetails.isHtmlOrText
                  ? 'INVALID (HTML/TEXT DOCUMENT)'
                  : dryRunReport.modelOnnxDetails.classification}
              </span>
            </div>

            {/* Item 8 */}
            <div className="border-b border-[#1A1A1A] pb-2 space-y-1">
              <div className="text-gray-500 font-bold">8. JSON / Config / Tokenizer Files:</div>
              <div className="bg-[#0A0A0A] p-2 rounded border border-[#222] space-y-1 text-[10px]">
                {dryRunReport.jsonConfigTokenizerFiles.length === 0 ? (
                  <div className="text-gray-500">None detected</div>
                ) : (
                  dryRunReport.jsonConfigTokenizerFiles.map((cfg, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-amber-300">{cfg.path}</span>
                      <span className="text-gray-400">{cfg.uncompressedSizeBytes.toLocaleString()} bytes</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Item 9 */}
            <div className="border-b border-[#1A1A1A] pb-1">
              <div className="text-gray-500 font-bold">9. Duplicate or Unexpected Large Files:</div>
              {dryRunReport.duplicateOrUnexpectedFiles.length === 0 ? (
                <div className="text-emerald-400 text-[10px] mt-0.5">None detected (Clean archive)</div>
              ) : (
                <div className="bg-[#0A0A0A] p-2 rounded border border-amber-900/40 text-[10px] space-y-1 mt-1">
                  {dryRunReport.duplicateOrUnexpectedFiles.map((dup, i) => (
                    <div key={i} className="text-amber-400">
                      • {dup.path} ({(dup.sizeBytes / (1024 * 1024)).toFixed(2)} MB): {dup.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Item 10 */}
            <div className="flex justify-between pt-1">
              <span className="text-gray-500 font-bold">10. Total Uncompressed Size:</span>
              <span className="text-cyan-300 font-bold">
                {dryRunReport.totalUncompressedSizeBytes.toLocaleString()} bytes ({(dryRunReport.totalUncompressedSizeBytes / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Import Model Dropzone */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider">
            Import Voice Model ZIP
          </h3>
          <button
            onClick={() => inspectFileInputRef.current?.click()}
            className="text-[10px] bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-400 font-bold py-1.5 px-3 rounded-lg border border-cyan-800/40 transition-colors uppercase tracking-wider flex items-center space-x-1"
            title="Inspect ZIP contents without importing"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Inspect ZIP Only (No Import)</span>
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".zip"
          onChange={handleFileUpload}
          className="hidden"
        />

        <input
          type="file"
          ref={inspectFileInputRef}
          accept=".zip"
          onChange={handleInspectFileUpload}
          className="hidden"
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-[#333] hover:border-amber-500 bg-[#0A0A0A] hover:bg-[#121212] rounded-xl p-5 text-center cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto group-hover:scale-105 transition-transform">
            <Upload className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-200 uppercase tracking-wider group-hover:text-amber-500 transition-colors">
              Click to select Bemba Model ZIP file
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
              Must contain <code className="text-amber-500 font-mono">model.onnx</code> & configuration JSONs
            </div>
          </div>
        </div>

        {/* Generate Sample Model ZIP Button & Export Guide */}
        <div className="pt-1 flex flex-col space-y-2">
          <button
            onClick={handleGenerateSampleZip}
            disabled={isProcessing}
            className="w-full py-2.5 px-3 bg-[#1F1F1F] hover:bg-[#282828] active:bg-[#333] text-amber-500 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center space-x-2 border border-[#333] transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>Generate & Test Sample Bemba Voice ZIP</span>
          </button>
        </div>

        {/* HuggingFace facebook/mms-tts-bem ONNX Export Guide */}
        <div className="bg-[#121212] border border-amber-500/20 rounded-lg p-3 space-y-2 text-xs">
          <div className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
            <span>Genuine Model Export Guide (facebook/mms-tts-bem)</span>
          </div>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            Since synthetic models are prohibited and the web browser environment cannot compile PyTorch models natively, run this Python script externally to convert the official Facebook MMS Bemba model:
          </p>
          <pre className="bg-[#0a0a0a] border border-[#222] p-2.5 rounded text-[10px] text-emerald-400 font-mono overflow-x-auto leading-normal">
{`import torch, json, zipfile
from transformers import VitsModel, AutoTokenizer

model_id = "facebook/mms-tts-bem"
model = VitsModel.from_pretrained(model_id)
tokenizer = AutoTokenizer.from_pretrained(model_id)

dummy_input = torch.tensor([[1, 2, 3, 4, 5]], dtype=torch.long)
torch.onnx.export(
    model,
    (dummy_input,),
    "model.onnx",
    input_names=["input_ids"],
    output_names=["waveform"],
    dynamic_axes={"input_ids": {0: "batch_size", 1: "sequence_length"}},
    opset_version=17
)

with open("vocab.json", "w") as f:
    json.dump(tokenizer.get_vocab(), f, indent=2)

with zipfile.ZipFile("muntu-bemba-voice-v1.zip", "w") as z:
    z.write("model.onnx")
    z.write("vocab.json")`}
          </pre>
        </div>
      </div>

      {/* ZIP Security & Validation Test Suite Controls */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-2.5">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-500 uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <span>ZIP Security & Edge Case Tests</span>
        </div>
        <p className="text-[11px] text-gray-400">
          Verify safety defenses against malicious ZIP attacks or invalid models:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            onClick={handleTestMaliciousZip}
            disabled={isProcessing}
            className="text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-400 py-2 px-1 rounded border border-red-800/40 transition-colors font-bold uppercase tracking-wider text-center"
            title="Test Path Traversal Rejection"
          >
            Path Traversal
          </button>
          <button
            onClick={handleTestMissingModelZip}
            disabled={isProcessing}
            className="text-[10px] bg-[#1F1F1F] hover:bg-[#282828] text-gray-300 py-2 px-1 rounded border border-[#333] transition-colors font-bold uppercase tracking-wider text-center"
            title="Test Missing model.onnx"
          >
            Missing ONNX
          </button>
          <button
            onClick={handleTestEmptyModelZip}
            disabled={isProcessing}
            className="text-[10px] bg-[#1F1F1F] hover:bg-[#282828] text-gray-300 py-2 px-1 rounded border border-[#333] transition-colors font-bold uppercase tracking-wider text-center"
            title="Test 0-byte empty model.onnx"
          >
            Empty ONNX
          </button>
          <button
            onClick={handleTestHtmlModelZip}
            disabled={isProcessing}
            className="text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-300 py-2 px-1 rounded border border-red-800/40 transition-colors font-bold uppercase tracking-wider text-center"
            title="Test HTML Document Model Rejection"
          >
            HTML ONNX
          </button>
        </div>
      </div>

      {/* Verification Audit Console */}
      {logs.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#222] rounded-xl p-3.5 space-y-2 font-mono">
          <div className="flex items-center justify-between text-xs text-gray-400 pb-1.5 border-b border-[#222]">
            <div className="flex items-center space-x-1.5 font-bold text-amber-500 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-amber-500" />
              <span>Model Validator Console Audit Log</span>
            </div>
            <span className="text-[10px] font-bold text-gray-500 uppercase">{logs.length} logs</span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 text-[11px] leading-relaxed pr-1">
            {logs.map((log, index) => {
              let color = 'text-gray-300';
              if (log.level === 'error') color = 'text-red-400 font-bold';
              else if (log.level === 'warn') color = 'text-amber-400';
              else if (log.level === 'success') color = 'text-emerald-400 font-bold';

              return (
                <div key={index} className={`flex items-start space-x-2 ${color}`}>
                  <span className="text-gray-600 shrink-0 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span>{log.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Private Storage Explorer */}
      {storedFiles.length > 0 && (
        <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-500 uppercase tracking-wider">
            <FolderTree className="w-4 h-4 text-amber-500" />
            <span>Private App Storage Explorer (models/bemba/)</span>
          </div>

          <div className="space-y-1.5 pt-1">
            {storedFiles.map((f, i) => (
              <div
                key={i}
                onClick={() => handleViewFile(f.path)}
                className="flex items-center justify-between bg-[#0A0A0A] hover:bg-[#121212] p-2.5 rounded-lg border border-[#222] cursor-pointer transition-colors text-xs font-mono"
              >
                <div className="flex items-center space-x-2 truncate">
                  {f.type === 'json' ? (
                    <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : f.type === 'onnx' ? (
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                  )}
                  <span className="text-gray-300 truncate">{f.path}</span>
                </div>
                <span className="text-[10px] text-gray-500 shrink-0 font-mono">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>

          {selectedFileContent && (
            <div className="mt-3 bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-amber-500 font-mono text-[11px] font-bold border-b border-[#222] pb-1.5 uppercase">
                <span>File Content: {selectedFileContent.path}</span>
                <button
                  onClick={() => setSelectedFileContent(null)}
                  className="text-gray-500 hover:text-gray-300 text-[10px]"
                >
                  Close
                </button>
              </div>
              <pre className="text-[10px] text-gray-300 font-mono overflow-x-auto max-h-40 pt-1 leading-relaxed">
                {selectedFileContent.text}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#262626] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertOctagon className="w-6 h-6" />
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">Remove Bemba Voice Model?</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              This will delete all model files from <code className="text-amber-500 font-mono">models/bemba/</code> in private app storage.
            </p>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="flex-1 py-2.5 bg-[#1F1F1F] hover:bg-[#282828] text-gray-300 font-bold text-xs uppercase tracking-wider rounded-lg border border-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveModel}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-black font-extrabold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-md"
              >
                Delete Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
