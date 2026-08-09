import React from 'react';
import { Home, HardDriveDownload, Settings, Info } from 'lucide-react';

export type NavTab = 'home' | 'model' | 'settings' | 'about';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  hasModelInstalled: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, hasModelInstalled }) => {
  const tabs = [
    { id: 'home' as NavTab, label: 'Home', icon: Home },
    { 
      id: 'model' as NavTab, 
      label: 'Voice Model', 
      icon: HardDriveDownload,
      badge: !hasModelInstalled ? 'Install' : null,
    },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
    { id: 'about' as NavTab, label: 'About', icon: Info },
  ];

  return (
    <nav className="bg-[#121212] border-t border-[#222] px-2 py-2 flex items-center justify-around z-30">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-lg transition-all duration-200 relative ${
              isActive
                ? 'bg-[#1F1F1F] text-amber-500 font-bold border border-[#333]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#1A1A1A]'
            }`}
          >
            <div className="relative">
              <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              {tab.badge && (
                <span className="absolute -top-1 -right-3 bg-amber-500 text-black text-[8px] font-extrabold px-1.5 rounded-full animate-pulse uppercase">
                  {tab.badge}
                </span>
              )}
            </div>

            <span className="text-[10px] uppercase font-medium tracking-wide mt-1">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
