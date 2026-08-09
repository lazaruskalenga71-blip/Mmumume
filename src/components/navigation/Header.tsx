import React from 'react';
import { Volume2, ShieldCheck, Cpu } from 'lucide-react';
import { ModelStatus } from '../../types/model';

interface HeaderProps {
  modelStatus: ModelStatus;
  activeModelName?: string | null;
  onRunTests: () => void;
}

export const Header: React.FC<HeaderProps> = ({ modelStatus, activeModelName, onRunTests }) => {
  const getStatusBadge = () => {
    switch (modelStatus) {
      case 'READY':
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Bemba Voice Ready</span>
          </span>
        );
      case 'INSTALLING':
      case 'VERIFYING':
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>{modelStatus === 'INSTALLING' ? 'Installing...' : 'Verifying...'}</span>
          </span>
        );
      case 'INVALID':
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border border-red-900/50 bg-red-900/20 text-red-500 text-[10px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Invalid Model</span>
          </span>
        );
      case 'NO_MODEL':
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border border-[#333] bg-[#161616] text-gray-400 text-[10px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            <span>No Model Installed</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0D0D0D] px-4 py-3 border-b border-[#222] flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500 text-black font-bold flex items-center justify-center shadow-md">
          <Volume2 className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold tracking-tighter text-amber-500 uppercase leading-none">
              Muntu Bemba
            </h1>
            <span className="text-[9px] font-mono text-gray-400 border border-[#333] bg-[#161616] px-1.5 py-0.2 rounded uppercase">
              v1.0
            </span>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
            Offline Voice Engine
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {getStatusBadge()}
        
        <button
          onClick={onRunTests}
          className="p-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-gray-300 hover:text-amber-500 rounded-lg border border-[#333] transition-colors shadow-sm"
          title="Run Automated Security & Model Manager Tests"
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
