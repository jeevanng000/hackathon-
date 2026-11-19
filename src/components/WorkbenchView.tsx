import { useRef, useState } from 'react';
import {
  RotateCcw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Bug,
  Radar,
  Sun,
  Moon,
  Undo2,
  Wand2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Code2,
  Mic,
} from 'lucide-react';
import type {
  AnalysisResponse,
  BugCategory,
  ExplanationMode,
  UnifiedBugFinding,
  VoiceNote,
} from '../types/autopatch';
import {
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  type SupportedLanguage,
} from '../utils/languageDetect';
import { BugCodeStage, type CodeStageMode } from './BugCodeStage';

interface WorkbenchViewProps {
  filename: string;
  testFilename: string;
  sourceCode: string;
  testCode: string;
  bugContext: string;
  caseDescription: string;
  selectedLanguage: 'auto' | SupportedLanguage;
  resolvedLanguage: SupportedLanguage;
  onChangeLanguage: (lang: 'auto' | SupportedLanguage) => void;
  onChangeFilename: (name: string) => void;
  onChangeTestFilename: (name: string) => void;
  onChangeSourceCode: (code: string) => void;
  onChangeTestCode: (code: string) => void;
  onChangeBugContext: (ctx: string) => void;
  onUploadSource: (filename: string, content: string) => void;
  onResetDemo: () => void;
  canResetDemo: boolean;
  analysis: AnalysisResponse | null;
  unifiedFindings: UnifiedBugFinding[];
  activeFindingId: string | null;
  onSelectFinding: (id: string | null) => void;
  resolvedFindingIds: Set<string>;
  onApplyFix: (finding: UnifiedBugFinding) => void;
  onApplyAllSafeFixes: () => void;
  onUndoFix: () => void;
  canUndoFix: boolean;
  hasLocalEdits: boolean;
  onVerifyCurrentCode: () => void;
  isValidating: boolean;
  isRunning: boolean;
  errorMessage: string | null;
  onOpenReview: () => void;
  explanationMode: ExplanationMode;
  onChangeExplanationMode: (mode: ExplanationMode) => void;
  stageMode: CodeStageMode;
  onChangeStageMode: (mode: CodeStageMode) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  voiceNotes: VoiceNote[];
  onAddVoiceNote: (note: VoiceNote) => void;
  onUpdateVoiceNote: (noteId: string, patch: Partial<VoiceNote>) => void;
  onDeleteVoiceNote: (noteId: string) => void;
}

type CategoryFilter = 'all' | BugCategory;

function TestEditorBox({
  id,
  label,
  filename,
  onChangeFilename,
  value,
  onChange,
}: {
  id: string;
  label: string;
  filename: string;
  onChangeFilename: (val: string) => void;
  value: string;
  onChange: (val: string) => void;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split('\n').length;

  return (
    <section
      aria-label={label}
      className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <label
            htmlFor={`${id}-filename`}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0"
          >
            {label}
          </label>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            /
          </span>
          <input
            id={`${id}-filename`}
            type="text"
            value={filename}
            onChange={(e) => onChangeFilename(e.target.value)}
            aria-label={`${label} filename`}
            className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#2563EB] dark:focus:border-blue-400 focus:outline-none px-1 py-0.5 min-w-0 w-full max-w-[220px]"
          />
        </div>
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
          {lineCount} lines
        </span>
      </div>
      <div className="relative flex min-h-[180px] max-h-[260px] overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="select-none bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-100 dark:border-slate-800 py-2.5 px-2 text-right font-mono text-xs leading-6 text-slate-400 dark:text-slate-500 tabular-nums overflow-hidden shrink-0 w-10"
        >
          {Array.from({ length: Math.max(lineCount, 8) }, (_, idx) => (
            <div key={idx + 1}>{idx + 1}</div>
          ))}
        </div>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
          spellCheck={false}
          aria-label={`${label} code editor`}
          className="code-editor code-scroll flex-1 w-full resize-none bg-white dark:bg-[#0F172A] px-3.5 py-2.5 font-mono text-[12px] leading-6 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#2563EB]/25 overflow-auto whitespace-pre"
        />
      </div>
    </section>
  );
}

export function WorkbenchView({
  filename,
  testFilename,
  sourceCode,
  testCode,
  bugContext,
  caseDescription,
  selectedLanguage,
  resolvedLanguage,
  onChangeLanguage,
  onChangeFilename,
  onChangeTestFilename,
  onChangeSourceCode,
  onChangeTestCode,
  onChangeBugContext,
  onUploadSource,
  onResetDemo,
  canResetDemo,
  analysis,
  unifiedFindings,
  activeFindingId,
  onSelectFinding,
  resolvedFindingIds,
  onApplyFix,
  onApplyAllSafeFixes,
  onUndoFix,
  canUndoFix,
  hasLocalEdits,
  onVerifyCurrentCode,
  isValidating,
  isRunning,
  errorMessage,
  onOpenReview,
  explanationMode,
  onChangeExplanationMode,
  stageMode,
  onChangeStageMode,
  theme,
  onToggleTheme,
  voiceNotes,
  onAddVoiceNote,
  onUpdateVoiceNote,
  onDeleteVoiceNote,
}: WorkbenchViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showTestsPanel, setShowTestsPanel] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const langMeta = getLanguageMeta(resolvedLanguage);

  const filteredFindings =
    categoryFilter === 'all'
      ? unifiedFindings
      : unifiedFindings.filter((f) => f.category === categoryFilter);

  const safeFixableRemaining = unifiedFindings.filter(
    (f) => f.canAutoFix && !resolvedFindingIds.has(f.id)
  );
  const resolvedCount = unifiedFindings.filter((f) =>
    resolvedFindingIds.has(f.id)
  ).length;

  // Guided step status
  const currentStep = !analysis
    ? 1
    : resolvedCount === 0 && !hasLocalEdits
    ? 2
    : 3;

  const filterButtons: Array<{
    id: CategoryFilter;
    label: string;
    count: number;
    colorCls: string;
  }> = [
    {
      id: 'all',
      label: 'All Bugs',
      count: unifiedFindings.length,
      colorCls: '',
    },
    {
      id: 'security',
      label: 'Security',
      count: unifiedFindings.filter((f) => f.category === 'security').length,
      colorCls: 'text-[#B91C1C] dark:text-rose-300',
    },
    {
      id: 'runtime',
      label: 'Crash Risk',
      count: unifiedFindings.filter((f) => f.category === 'runtime').length,
      colorCls: 'text-[#B45309] dark:text-amber-300',
    },
    {
      id: 'logic',
      label: 'Logic',
      count: unifiedFindings.filter((f) => f.category === 'logic').length,
      colorCls: 'text-[#1D4ED8] dark:text-blue-300',
    },
    {
      id: 'modern',
      label: 'Latest AI',
      count: unifiedFindings.filter((f) => f.category === 'modern').length,
      colorCls: 'text-[#6D28D9] dark:text-violet-300',
    },
  ];

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Workspace Header & Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Inspector</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {filename}
            </span>
            <span aria-hidden="true">·</span>
            <span>{langMeta.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 dark:text-slate-400">
              {langMeta.runtimeLabel}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Interactive Bug Inspector &amp; Guided Repair
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            {caseDescription}
          </p>
        </div>

        {/* Workspace Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Plain English vs Technical Mode Switch */}
          <div
            role="group"
            aria-label="Explanation detail level"
            className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md"
          >
            <button
              type="button"
              onClick={() => onChangeExplanationMode('plain')}
              aria-pressed={explanationMode === 'plain'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                explanationMode === 'plain'
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Plain English</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeExplanationMode('technical')}
              aria-pressed={explanationMode === 'technical'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                explanationMode === 'technical'
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Technical</span>
            </button>
          </div>

          {/* Language Selector */}
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) =>
              onChangeLanguage(e.target.value as 'auto' | SupportedLanguage)
            }
            aria-label="Target programming language"
            className="h-9 px-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-[#2563EB] dark:focus:border-blue-400 cursor-pointer"
          >
            <option value="auto">Auto-Detect ({langMeta.label})</option>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>Dark</span>
              </>
            )}
          </button>

          {canUndoFix && (
            <button
              type="button"
              onClick={onUndoFix}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Undo Fix</span>
            </button>
          )}

          {canResetDemo && (
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Guided 3-Step Strip for Easy One-Time Accessibility */}
      {showGuide && (
        <section
          aria-label="Quick start guide"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {[
              {
                num: 1,
                text: 'Pick a sample or paste your code',
              },
              {
                num: 2,
                text: 'Click "Scan & Find Bugs" then click any colored line',
              },
              {
                num: 3,
                text: 'Apply a one-click fix and verify tests pass',
              },
            ].map((step) => {
              const isDone = currentStep > step.num;
              const isActive = currentStep === step.num;
              return (
                <li key={step.num} className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono text-[11px] font-semibold tabular-nums ${
                      isDone
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-[#15803D] dark:text-emerald-300'
                        : isActive
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {step.num}
                  </span>
                  <span
                    className={
                      isActive
                        ? 'font-medium text-slate-950 dark:text-slate-50'
                        : 'text-slate-600 dark:text-slate-400'
                    }
                  >
                    {step.text}
                  </span>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 self-end md:self-auto whitespace-nowrap shrink-0 cursor-pointer"
          >
            Hide guide
          </button>
        </section>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg text-sm text-[#991B1B] dark:text-rose-200"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Scan could not complete</p>
            <p className="text-xs text-[#991B1B]/90 dark:text-rose-300 mt-0.5">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isRunning && (
        <section
          aria-live="polite"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
        >
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-3 w-full max-w-xl bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
        </section>
      )}

      {/* Bug Summary, Category Filters & Quick-Fix Action Bar */}
      {analysis && !isRunning && (
        <section
          aria-label="Detected bugs summary and filters"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Segmented Category Filter Controls */}
            <div
              role="group"
              aria-label="Filter bugs by category"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-md"
            >
              {filterButtons.map((btn) => {
                if (btn.id !== 'all' && btn.count === 0) return null;
                const active = categoryFilter === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setCategoryFilter(btn.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                        : `text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 ${btn.colorCls}`
                    }`}
                  >
                    {btn.label} ({btn.count})
                  </button>
                );
              })}
            </div>

            {/* Batch Fix & Verification Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {safeFixableRemaining.length > 0 && (
                <button
                  type="button"
                  onClick={onApplyAllSafeFixes}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Apply All Safe Fixes ({safeFixableRemaining.length})</span>
                </button>
              )}

              {hasLocalEdits && (
                <button
                  type="button"
                  onClick={onVerifyCurrentCode}
                  disabled={isValidating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>
                    {isValidating ? 'Verifying...' : 'Verify Fixes in Sandbox'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenReview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Diff &amp; Sandbox Proof</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Transparent Verdict + Latest AI Scan Status Line */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
              {analysis.trustVerdict === 'verified' ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D] dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Verified fix ready ({analysis.sandbox.passed}/{analysis.sandbox.total} tests pass)
                  </span>
                </span>
              ) : analysis.trustVerdict === 'already_passing' ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D] dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    All tests pass ({analysis.sandbox.passed}/{analysis.sandbox.total})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#B91C1C] dark:text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Needs your review before applying automatically</span>
                </span>
              )}

              {resolvedCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-[#15803D] dark:text-emerald-400">
                    {resolvedCount}/{unifiedFindings.length} fixed in editor
                  </span>
                </>
              )}
            </div>

            {analysis.aiScanStatus && (
              <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Radar
                  className={`w-3.5 h-3.5 ${
                    analysis.aiScanStatus.status === 'ok'
                      ? 'text-[#6D28D9] dark:text-violet-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span>{analysis.aiScanStatus.message}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Main Interactive Bug Code Stage */}
      <BugCodeStage
        filename={filename}
        onChangeFilename={onChangeFilename}
        sourceCode={sourceCode}
        onChangeSourceCode={onChangeSourceCode}
        onDropSourceFile={onUploadSource}
        findings={filteredFindings}
        activeFindingId={activeFindingId}
        onSelectFinding={onSelectFinding}
        resolvedFindingIds={resolvedFindingIds}
        onApplyFix={onApplyFix}
        explanationMode={explanationMode}
        stageMode={stageMode}
        onChangeStageMode={onChangeStageMode}
        hasScanned={analysis !== null}
        voiceNotes={voiceNotes}
        onAddVoiceNote={onAddVoiceNote}
        onUpdateVoiceNote={onUpdateVoiceNote}
        onDeleteVoiceNote={onDeleteVoiceNote}
      />

      {/* Quick-Jump Bug Directory (easy clickable list of every colored bug) */}
      {analysis && !isRunning && filteredFindings.length > 0 && (
        <section
          aria-label="All detected bugs list"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <h2 className="font-display text-xs font-semibold text-slate-700 dark:text-slate-200">
              All Highlighted Bugs ({filteredFindings.length}) — click any row to open its line popup
            </h2>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {explanationMode === 'plain' ? 'Plain English View' : 'Technical View'}
            </span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredFindings.map((finding) => {
              const isSelected = activeFindingId === finding.id;
              const isFixed = resolvedFindingIds.has(finding.id);
              const Icon = isFixed
                ? CheckCircle2
                : finding.category === 'security'
                ? ShieldAlert
                : finding.category === 'runtime'
                ? AlertTriangle
                : finding.category === 'modern'
                ? Radar
                : Bug;

              const colorText = isFixed
                ? 'text-[#15803D] dark:text-emerald-400'
                : finding.category === 'security'
                ? 'text-[#B91C1C] dark:text-rose-400'
                : finding.category === 'runtime'
                ? 'text-[#B45309] dark:text-amber-400'
                : finding.category === 'modern'
                ? 'text-[#6D28D9] dark:text-violet-400'
                : 'text-[#1D4ED8] dark:text-blue-400';

              const findingNotesCount = voiceNotes.filter(
                (n) => n.findingId === finding.id
              ).length;

              return (
                <li key={finding.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeStageMode('inspect');
                      onSelectFinding(finding.id);
                    }}
                    className={`w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/35'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 mt-0.5 shrink-0 ${colorText}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            Line {finding.line}
                          </span>
                          <span className={`font-medium ${colorText}`}>
                            {isFixed
                              ? 'Fixed'
                              : finding.category === 'security'
                              ? 'Security'
                              : finding.category === 'runtime'
                              ? 'Crash Risk'
                              : finding.category === 'modern'
                              ? 'Latest AI'
                              : 'Logic'}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {finding.title}
                          </span>
                          {findingNotesCount > 0 && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              <span aria-hidden="true">·</span>
                              <Mic
                                className="w-3 h-3 text-[#DC2626] dark:text-rose-400"
                                aria-hidden="true"
                              />
                              <span>
                                {findingNotesCount} note{findingNotesCount === 1 ? '' : 's'}
                              </span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {explanationMode === 'plain'
                            ? finding.plainEnglishExplanation
                            : finding.technicalExplanation}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-medium text-[#2563EB] dark:text-blue-400 whitespace-nowrap shrink-0 self-end sm:self-center">
                      {isSelected ? 'Popup Open' : 'Open Line Popup'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Collapsible Unit Tests & Error Log Drawer */}
      <section
        aria-label="Unit tests and error log"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setShowTestsPanel((prev) => !prev)}
          aria-expanded={showTestsPanel}
          className="w-full px-4 py-3 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-display font-semibold text-slate-900 dark:text-slate-100">
              Unit Test Suite &amp; Error Log
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {testCode.trim()
                ? `${testFilename} (${testCode.split('\n').length} lines)`
                : 'Auto-synthesized if blank'}
            </span>
            {bugContext.trim() && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  ·
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Error log attached
                </span>
              </>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
            <span>{showTestsPanel ? 'Collapse' : 'Edit Tests / Log'}</span>
            {showTestsPanel ? (
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
        </button>

        {showTestsPanel && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TestEditorBox
              id="test-editor"
              label="Unit Test Suite"
              filename={testFilename}
              onChangeFilename={onChangeTestFilename}
              value={testCode}
              onChange={onChangeTestCode}
            />

            <section
              aria-label="Error log or bug description"
              className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
            >
              <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <label
                  htmlFor="bug-context-input"
                  className="text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Paste Error Traceback or Bug Note (Optional)
                </label>
              </div>
              <textarea
                id="bug-context-input"
                value={bugContext}
                onChange={(e) => onChangeBugContext(e.target.value)}
                spellCheck={false}
                rows={8}
                placeholder="Paste any error traceback, compiler message, or describe what went wrong..."
                className="code-editor code-scroll flex-1 w-full resize-none bg-white dark:bg-[#0F172A] px-3.5 py-2.5 font-mono text-xs leading-5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#2563EB]/25"
              />
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
