import { Menu, Radar, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { AppView } from '../types/autopatch';
import { VIEW_TRANSITION } from '../utils/motionPresets';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onRunAnalysis: () => void;
  isRunning: boolean;
  auditCount: number;
  onToggleMobileMenu: () => void;
}

export function TopBar({
  activeView,
  onSelectView,
  onRunAnalysis,
  isRunning,
  auditCount,
  onToggleMobileMenu,
}: TopBarProps) {
  const navItems: Array<{ id: AppView; label: string; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Projects' },
    { id: 'history', label: 'History', count: auditCount },
  ];

  return (
    <header className="sticky top-0 z-30 h-15 bg-[#0B1020]/75 backdrop-blur-xl border-b border-white/10 px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8">
      {/* Zone 1: Brand wordmark + mobile menu trigger */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle workspace navigation"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-[#A6B0C8] hover:text-[#F4F7FF] hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7CFF]"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onSelectView('dashboard')}
          className="font-display text-lg font-bold tracking-tight text-[#F4F7FF] hover:text-[#50D7E6] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8B7CFF] rounded-sm cursor-pointer"
        >
          AutoPatch
        </button>
      </div>

      {/* Zone 2: Single-line primary navigation (Dashboard | Projects | History) */}
      <nav
        aria-label="Primary workspace views"
        className="hidden md:flex items-center gap-6 min-w-0"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-4.5 px-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7CFF] cursor-pointer ${
                isActive
                  ? 'text-[#F4F7FF]'
                  : 'text-[#A6B0C8] hover:text-[#F4F7FF]'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="ml-1.5 font-mono text-xs tabular-nums text-[#50D7E6]">
                  {item.count}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="nav-active-indicator"
                  transition={VIEW_TRANSITION}
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 h-0.5 bg-gradient-to-r from-[#8B7CFF] to-[#50D7E6] rounded-full"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Prominent Primary Scan Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isRunning}
          className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-white bg-[#8B7CFF] hover:bg-[#7A69FF] active:scale-[0.98] disabled:bg-[#8B7CFF]/45 disabled:text-white/75 rounded-lg shadow-lg shadow-[#8B7CFF]/20 border border-white/15 transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#50D7E6] cursor-pointer disabled:cursor-wait"
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Radar className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{isRunning ? 'Scanning Code...' : 'Scan & Find Bugs'}</span>
        </button>
      </div>
    </header>
  );
}
