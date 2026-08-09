import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Wifi, WifiOff, Battery, Signal } from 'lucide-react';

interface AndroidFrameProps {
  children: React.ReactNode;
  activeTab: string;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children, activeTab }) => {
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateClock();
    const timer = setInterval(updateClock, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-200 flex flex-col items-center justify-center p-2 sm:p-4 font-sans selection:bg-amber-600 selection:text-white">
      {/* Top Bar / View Mode Toggle */}
      <header className="w-full max-w-md sm:max-w-xl mb-3 flex items-center justify-between px-3.5 py-2 bg-[#121212] rounded-xl border border-[#222] shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold tracking-widest text-amber-500 uppercase">
            Muntu Bemba — Offline Engine
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className="flex items-center space-x-1.5 text-[11px] px-3 py-1 bg-[#1F1F1F] hover:bg-[#282828] text-gray-300 hover:text-white rounded-lg transition-colors border border-[#333] font-medium uppercase tracking-wider"
            title={isPhoneFrame ? "Switch to Expanded View" : "Switch to Android Phone View"}
          >
            {isPhoneFrame ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Expanded</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Android View</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div
        className={`w-full transition-all duration-300 ${
          isPhoneFrame
            ? 'max-w-[410px] h-[830px] rounded-[42px] border-[10px] border-[#181818] bg-[#0A0A0A] shadow-2xl shadow-black flex flex-col relative overflow-hidden ring-1 ring-[#262626]'
            : 'max-w-3xl h-[800px] rounded-2xl border border-[#222] bg-[#0A0A0A] shadow-2xl flex flex-col overflow-hidden'
        }`}
      >
        {/* Android Camera Punch Hole (Phone Frame Mode) */}
        {isPhoneFrame && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#121212] rounded-b-2xl z-50 flex items-center justify-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-[#0A0A0A] border border-[#222] shadow-inner" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A]" />
          </div>
        )}

        {/* Android Status Bar */}
        <div className="w-full bg-[#0D0D0D] text-gray-300 text-xs px-5 pt-2.5 pb-1.5 flex items-center justify-between select-none z-40 border-b border-[#222]">
          <span className="font-mono text-[11px] font-bold tracking-tight text-gray-400">{currentTime || '12:00'}</span>

          <div className="flex items-center space-x-2 text-gray-400 text-[10px]">
            <span className="bg-amber-500/10 text-amber-500 text-[9px] px-2 py-0.5 rounded font-mono uppercase font-bold border border-amber-500/20 tracking-wider">
              OFFLINE APP
            </span>
            {isOnline ? (
              <span className="flex items-center space-x-1 text-emerald-400" title="Online network available, but app functions 100% offline">
                <Wifi className="w-3 h-3" />
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-amber-500" title="100% Offline Mode Active">
                <WifiOff className="w-3 h-3" />
              </span>
            )}
            <Signal className="w-3 h-3" />
            <Battery className="w-3.5 h-3.5 text-gray-300" />
          </div>
        </div>

        {/* App Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative bg-[#0A0A0A]">
          {children}
        </div>

        {/* Android Navigation Pill Bar (Phone Frame) */}
        {isPhoneFrame && (
          <div className="w-full bg-[#0D0D0D] py-1.5 flex justify-center items-center select-none border-t border-[#1F1F1F]">
            <div className="w-28 h-1 bg-[#333] rounded-full opacity-60 hover:opacity-100 transition-opacity" />
          </div>
        )}
      </div>

      <footer className="mt-3 text-center text-[10px] text-gray-600 uppercase tracking-widest max-w-md font-mono">
        Muntu Bemba Foundation • Offline Bemba Speech Engine
      </footer>
    </div>
  );
};
