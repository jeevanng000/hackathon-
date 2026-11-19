import { Menu, Radar, Loader2 } from 'lucide-react';
import type { AppView } from '../types/autopatch';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onRunAnalysis: () => void;
  isRunning: boolean;
  hasAnalysis: boolean;
  auditCount: number;
  onToggleMobileMenu: () => void;
}

export function TopBar({
  activeView,
  onSelectView,
  onRunAnalysis,
  isRunning,
  hasAnalysis,
  auditCount,
  onToggleMobileMenu,
}: TopBarProps) {
  const navItems: Array<{ id: AppView; label: string; count?: number }> = [
    { id: 'workbench', label: 'Inspector' },
    { id: 'review', label: 'Diff & Review' },
    { id: 'audit', label: 'Audit Ledger', count: auditCount },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8">
      {/* Zone 1: Single-element brand wordmark (+ mobile menu trigger on < lg) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle workspace navigation"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onSelectView('workbench')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] rounded-sm cursor-pointer"
        >
          AutoPatch
        </button>
      </div>

      {/* Zone 2: Concise single-line navigation links */}
      <nav aria-label="Primary workspace views" className="hidden md:flex items-center gap-6 min-w-0">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const isDisabled = item.id === 'review' && !hasAnalysis;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              disabled={isDisabled}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-4 px-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
                isActive
                  ? 'text-slate-950 dark:text-white'
                  : isDisabled
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 cursor-pointer'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <>
                  {' '}
                  <span className="ml-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {item.count}
                  </span>
                </>
              )}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#2563EB] dark:bg-blue-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-400 dark:disabled:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] cursor-pointer disabled:cursor-wait"
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
