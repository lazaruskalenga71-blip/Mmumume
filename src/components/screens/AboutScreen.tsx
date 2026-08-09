import React from 'react';
import { Info, Volume2, ShieldCheck, Cpu, Layers } from 'lucide-react';

export const AboutScreen: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4 bg-[#0A0A0A]">
      {/* Hero Header */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-5 text-center space-y-3 shadow-lg">
        <div className="w-12 h-12 rounded-lg bg-amber-500 text-black flex items-center justify-center mx-auto shadow-md">
          <Volume2 className="w-7 h-7 stroke-[2.5]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-amber-500 uppercase tracking-wider">Muntu Bemba</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Offline Bemba Voice Engine</p>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
          Providing high-quality, local, and privacy-preserving text-to-speech synthesis for the Bemba language in Africa and across the world.
        </p>
      </div>

      {/* Why Offline Bemba Speech */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-2">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <Info className="w-4 h-4 text-amber-500" />
          <span>Why Offline Bemba Voice?</span>
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Bemba (Ichibemba) is spoken by millions across Zambia, the Democratic Republic of Congo, and Tanzania. Access to internet connections can be intermittent or costly. By running voice synthesis completely offline on the phone, Muntu Bemba guarantees reliable access to voice technology everywhere without bandwidth fees or connectivity requirements.
        </p>
      </div>

      {/* Architecture Principles */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-2">
          <Layers className="w-4 h-4 text-amber-500" />
          <span>Architecture Principles</span>
        </h3>

        <div className="space-y-2.5 text-xs text-gray-300">
          <div className="flex items-start space-x-2.5 bg-[#0A0A0A] p-3 rounded-lg border border-[#222]">
            <Cpu className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-500 uppercase tracking-wider text-[11px] block">Decoupled Model Architecture</strong>
              <span className="text-gray-400">Voice models are imported via ZIP files and stored in private application storage (<code className="text-amber-500 font-mono">models/bemba/</code>) rather than being hardcoded.</span>
            </div>
          </div>

          <div className="flex items-start space-x-2.5 bg-[#0A0A0A] p-3 rounded-lg border border-[#222]">
            <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-500 uppercase tracking-wider text-[11px] block">ZIP Security & Audit</strong>
              <span className="text-gray-400">Every imported archive undergoes Path Traversal validation (<code className="text-amber-500 font-mono">../</code> rejection), file integrity inspection, and ONNX binary header verification.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Roadmap Stages */}
      <div className="bg-[#161616] border border-[#222] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Implementation Roadmap</h3>

        <div className="space-y-2 text-xs font-mono">
          <div className="bg-[#0A0A0A] border border-amber-500/30 p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="font-bold text-amber-500 uppercase tracking-wider">Stage 1 — Foundation (Current)</div>
              <div className="text-[10px] text-gray-400 font-sans mt-0.5">App structure, Model Manager, ZIP security audit, IndexedDB private storage, BembaTtsEngine state machine.</div>
            </div>
            <span className="text-[9px] bg-amber-500 text-black font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ml-2">
              ACTIVE
            </span>
          </div>

          <div className="bg-[#0A0A0A] border border-[#222] p-3 rounded-lg flex items-center justify-between opacity-75">
            <div>
              <div className="font-bold text-gray-400 uppercase tracking-wider">Stage 2 — ONNX Runtime Web Binding</div>
              <div className="text-[10px] text-gray-500 font-sans mt-0.5">ONNX inference session setup, Grapheme-to-Phoneme Bemba tokenizer, WebAudio PCM buffer rendering.</div>
            </div>
            <span className="text-[9px] bg-[#222] text-gray-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ml-2">
              NEXT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
