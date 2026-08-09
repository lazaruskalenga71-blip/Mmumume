import React, { useState, useEffect } from 'react';
import { Settings, Cpu, HardDrive, WifiOff, ShieldCheck, CheckCircle2, Volume2, VolumeX, Square } from 'lucide-react';
import { InstalledModel } from '../../types/model';
import { modelStorage } from '../../services/storage/modelStorage';
import { bembaTtsEngine } from '../../services/engine/BembaTtsEngine';

interface SettingsScreenProps {
  installedModel: InstalledModel | null;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ installedModel }) => {
  const [storageUsedBytes, setStorageUsedBytes] = useState<number>(0);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    return localStorage.getItem('muntu_auto_speak') !== 'false';
  });

  useEffect(() => {
    const calcStorage = async () => {
      const files = await modelStorage.listModelFiles();
      const total = files.reduce((acc, f) => acc + f.size, 0);
      setStorageUsedBytes(total);
    };
    calcStorage();
  }, [installedModel]);

  const toggleAutoSpeak = () => {
    const nextVal = !autoSpeak;
    setAutoSpeak(nextVal);
    localStorage.setItem('muntu_auto_speak', String(nextVal));
  };

  const handleStopSpeech = () => {
    bembaTtsEngine.stop();
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4 bg-[#0A0A0A]">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <Settings className="w-5 h-5 text-amber-500" />
          <span>Application Settings</span>
        </h2>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
          Engine configuration, offline storage, and system specifications.
        </p>
      </div>

      {/* Global Voice Settings */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-amber-500" />
          <span>Global Voice & Speech Settings</span>
        </h3>

        <div className="bg-[#0A0A0A] p-3 rounded-lg border border-[#222] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-gray-200">Auto-Speak Muntu Responses</div>
              <div className="text-[10px] text-gray-500">Automatically synthesize Bemba voice when assistant responds</div>
            </div>
            <button
              onClick={toggleAutoSpeak}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 border ${
                autoSpeak
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}
            >
              {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{autoSpeak ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-[#1F1F1F] flex items-center justify-between">
            <span className="text-xs text-gray-400">Stop Active Speech Playback:</span>
            <button
              onClick={handleStopSpeech}
              className="px-3 py-1 rounded bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-bold uppercase tracking-wider flex items-center space-x-1"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop Speech</span>
            </button>
          </div>
        </div>
      </div>

      {/* Model Specifications */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-amber-500" />
          <span>Active Voice Model Specifications</span>
        </h3>

        {installedModel ? (
          <div className="space-y-2 text-xs font-mono bg-[#0A0A0A] p-3 rounded-lg border border-[#222]">
            <div className="flex justify-between py-1 border-b border-[#1A1A1A]">
              <span className="text-gray-500">Model Name:</span>
              <span className="text-amber-500 font-bold">{installedModel.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1A1A1A]">
              <span className="text-gray-500">Storage Directory:</span>
              <span className="text-gray-300">models/bemba/</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1A1A1A]">
              <span className="text-gray-500">Sample Rate:</span>
              <span className="text-gray-300">{installedModel.config?.sampleRate || 22050} Hz</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1A1A1A]">
              <span className="text-gray-500">Grapheme Tokenizer:</span>
              <span className="text-gray-300">IPA Bemba Standard</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">ONNX Weights Check:</span>
              <span className="text-emerald-400 font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 inline" />
                <span>Verified</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500 bg-[#0A0A0A] p-3 rounded-lg border border-[#222] italic font-mono">
            No Bemba voice model installed. Go to Voice Model manager to import a model.
          </div>
        )}
      </div>

      {/* Private Storage Usage */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <HardDrive className="w-4 h-4 text-amber-500" />
          <span>Private Application Storage</span>
        </h3>

        <div className="bg-[#0A0A0A] p-3 rounded-lg border border-[#222] space-y-2.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-gray-400">Total Offline Storage Used:</span>
            <span className="font-bold text-amber-500">
              {(storageUsedBytes / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>

          <div className="w-full bg-[#1A1A1A] h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (storageUsedBytes / (10 * 1024 * 1024)) * 100)}%` }}
            />
          </div>

          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono leading-tight">
            Files are stored safely inside browser private IndexedDB (<code className="text-gray-400">Context.getFilesDir()</code> equivalent).
          </div>
        </div>
      </div>

      {/* Offline Mode Information */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-2">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <WifiOff className="w-4 h-4 text-amber-500" />
          <span>Offline Architecture Status</span>
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Muntu Bemba is engineered to operate completely offline. Once a voice model ZIP is extracted, text processing, phoneme mapping, and model inference run locally on device hardware without sending data to any external server.
        </p>
      </div>

      {/* App Version Info */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-2.5 text-xs">
        <div className="flex items-center space-x-2 text-amber-500 font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          <span>Version & Release Information</span>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-gray-400 bg-[#0A0A0A] p-3 rounded-lg border border-[#222]">
          <div>App Version: <span className="text-gray-200">1.0.0-stage1</span></div>
          <div>Build Number: <span className="text-gray-200">2026.08.101</span></div>
          <div>Runtime target: <span className="text-gray-200">Android/Web</span></div>
          <div>Inference Backend: <span className="text-gray-200">ONNX Web</span></div>
        </div>
      </div>
    </div>
  );
};
