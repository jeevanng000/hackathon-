import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  RotateCcw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Bug,
  Radar,
  Undo2,
  Wand2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Code2,
  Mic,
  FolderOpen,
  GitCompare,
  Eye,
} from 'lucide-react';
import type {
  AnalysisResponse,
  AuditDecision,
  BugCategory,
  DashboardTab,
  ExplanationMode,
  UnifiedBugFinding,
  VoiceNote,
} from '../types/autopatch';
import {
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  type SupportedLanguage,
} from '../utils/languageDetect';
import { PANEL_TRANSITION, VIEW_TRANSITION } from '../utils/motionPresets';
import { BugCodeStage, type CodeStageMode } from './BugCodeStage';
import { WorkflowStepper } from './WorkflowStepper';
import { SummaryCards } from './SummaryCards';
import { DiffReviewView } from './DiffReviewView';

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
  dashboardTab: DashboardTab;
  onChangeDashboardTab: (tab: DashboardTab) => void;
  onOpenProjects: () => void;
  explanationMode: ExplanationMode;
  onChangeExplanationMode: (mode: ExplanationMode) => void;
  stageMode: CodeStageMode;
  onChangeStageMode: (mode: CodeStageMode) => void;
  voiceNotes: VoiceNote[];
  onAddVoiceNote: (note: VoiceNote) => void;
  onUpdateVoiceNote: (noteId: string, patch: Partial<VoiceNote>) => void;
  onDeleteVoiceNote: (noteId: string) => void;
  activeDecision: AuditDecision | null;
  auditCount: number;
  onRunAnalysis: () => void;
  onOpenAudit: () => void;
  onAcceptPatch: (overrideReason?: string) => void;
  onRejectPatch: () => void;
  onDownloadPatched: () => void;
  onValidateManualPatch: (candidateCode: string) => Promise<void>;
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
      className="flex flex-col bg-[#0B1020]/70 border border-white/10 rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#0D1426]/85 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <label
            htmlFor={`${id}-filename`}
            className="text-xs font-medium text-[#A6B0C8] shrink-0"
          >
            {label}
          </label>
          <span aria-hidden="true" className="text-white/25">
            /
          </span>
          <input
            id={`${id}-filename`}
            type="text"
            value={filename}
            onChange={(e) => onChangeFilename(e.target.value)}
            aria-label={`${label} filename`}
            className="font-mono text-xs font-medium text-[#F4F7FF] bg-transparent border-b border-transparent hover:border-white/25 focus:border-[#8B7CFF] focus:outline-none px-1 py-0.5 min-w-0 w-full max-w-[220px]"
          />
        </div>
        <span className="font-mono text-xs text-[#A6B0C8] tabular-nums shrink-0">
          {lineCount} lines
        </span>
      </div>
      <div className="relative flex min-h-[180px] max-h-[260px] overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="select-none bg-[#090E1C]/60 border-r border-white/10 py-2.5 px-2 text-right font-mono text-xs leading-6 text-[#A6B0C8]/70 tabular-nums overflow-hidden shrink-0 w-10"
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
          className="code-editor code-scroll flex-1 w-full resize-none bg-transparent px-3.5 py-2.5 font-mono text-[12px] leading-6 text-[#F4F7FF] focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#8B7CFF]/35 overflow-auto whitespace-pre"
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
  dashboardTab,
  onChangeDashboardTab,
  onOpenProjects,
  explanationMode,
  onChangeExplanationMode,
  stageMode,
  onChangeStageMode,
  voiceNotes,
  onAddVoiceNote,
  onUpdateVoiceNote,
  onDeleteVoiceNote,
  activeDecision,
  auditCount,
  onRunAnalysis,
  onOpenAudit,
  onAcceptPatch,
  onRejectPatch,
  onDownloadPatched,
  onValidateManualPatch,
}: WorkbenchViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showTestsPanel, setShowTestsPanel] = useState(false);

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
      colorCls: 'text-[#FF718B]',
    },
    {
      id: 'runtime',
      label: 'Crash Risk',
      count: unifiedFindings.filter((f) => f.category === 'runtime').length,
      colorCls: 'text-[#FFCA70]',
    },
    {
      id: 'logic',
      label: 'Logic',
      count: unifiedFindings.filter((f) => f.category === 'logic').length,
      colorCls: 'text-[#50D7E6]',
    },
    {
      id: 'modern',
      label: 'Latest AI',
      count: unifiedFindings.filter((f) => f.category === 'modern').length,
      colorCls: 'text-[#C4BCFF]',
    },
  ];

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Workspace Header & Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-5 border-b border-white/10">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#A6B0C8]">
            <span>Dashboard</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-[#F4F7FF]">{filename}</span>
            <span aria-hidden="true">·</span>
            <span>{langMeta.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#50D7E6]">
              {langMeta.runtimeLabel}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7FF] text-balance">
            AutoPatch Inspection &amp; Verification Dashboard
          </h1>
          <p className="text-sm text-[#A6B0C8] max-w-2xl">
            {caseDescription}
          </p>
        </div>

        {/* Workspace Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Switch Project Button */}
          <button
            type="button"
            onClick={onOpenProjects}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-[#F4F7FF] bg-[#111930]/75 backdrop-blur-md border border-white/12 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#50D7E6]" aria-hidden="true" />
            <span>Switch Project</span>
          </button>

          {/* Plain English vs Technical Mode Switch */}
          <div
            role="group"
            aria-label="Explanation detail level"
            className="inline-flex items-center gap-1 p-1 bg-[#111930]/75 border border-white/10 rounded-lg"
          >
            <button
              type="button"
              onClick={() => onChangeExplanationMode('plain')}
              aria-pressed={explanationMode === 'plain'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                explanationMode === 'plain'
                  ? 'bg-[#8B7CFF] text-white shadow-sm'
                  : 'text-[#A6B0C8] hover:text-[#F4F7FF]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Plain English</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeExplanationMode('technical')}
              aria-pressed={explanationMode === 'technical'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                explanationMode === 'technical'
                  ? 'bg-[#8B7CFF] text-white shadow-sm'
                  : 'text-[#A6B0C8] hover:text-[#F4F7FF]'
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
            className="h-9 px-2.5 text-xs font-medium text-[#F4F7FF] bg-[#111930]/85 border border-white/12 rounded-lg focus:outline-none focus:border-[#8B7CFF] cursor-pointer"
          >
            <option value="auto" className="bg-[#0B1020] text-[#F4F7FF]">
              Auto-Detect ({langMeta.label})
            </option>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id} className="bg-[#0B1020] text-[#F4F7FF]">
                {lang.label}
              </option>
            ))}
          </select>

          {canUndoFix && (
            <button
              type="button"
              onClick={onUndoFix}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-[#F4F7FF] bg-[#111930]/75 border border-white/12 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5 text-[#50D7E6]" aria-hidden="true" />
              <span>Undo Fix</span>
            </button>
          )}

          {canResetDemo && (
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-[#A6B0C8] hover:text-[#F4F7FF] bg-[#111930]/75 border border-white/12 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Dashboard Summary Cards: Total Findings, Severity Breakdown, Test Status */}
      <SummaryCards
        analysis={analysis}
        findings={unifiedFindings}
        resolvedCount={resolvedCount}
        hasLocalEdits={hasLocalEdits}
        isRunning={isRunning}
        isValidating={isValidating}
        onOpenDiffProof={() => onChangeDashboardTab('diff')}
      />

      {/* Visual Bug Lifecycle Progress Stepper */}
      <WorkflowStepper
        analysis={analysis}
        isRunning={isRunning}
        isValidating={isValidating}
        findingsCount={unifiedFindings.length}
        resolvedCount={resolvedCount}
        hasLocalEdits={hasLocalEdits}
        activeDecision={activeDecision}
        auditCount={auditCount}
        onTriggerAnalysis={onRunAnalysis}
        onFocusInspection={() => {
          onChangeDashboardTab('inspector');
          onChangeStageMode('inspect');
          if (!activeFindingId && unifiedFindings.length > 0) {
            onSelectFinding(unifiedFindings[0].id);
          }
        }}
        onOpenVerification={() => onChangeDashboardTab('diff')}
        onOpenAudit={onOpenAudit}
      />

      {/* Dashboard Mode Switcher (Bug Inspector vs Diff & Verification Proof) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Dashboard workbench subviews"
          className="inline-flex items-center gap-1 p-1 bg-[#111930]/75 backdrop-blur-md border border-white/10 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={dashboardTab === 'inspector'}
            onClick={() => onChangeDashboardTab('inspector')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              dashboardTab === 'inspector'
                ? 'bg-[#8B7CFF] text-white shadow-sm'
                : 'text-[#A6B0C8] hover:text-[#F4F7FF]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Bug Inspector</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dashboardTab === 'diff'}
            onClick={() => onChangeDashboardTab('diff')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              dashboardTab === 'diff'
                ? 'bg-[#8B7CFF] text-white shadow-sm'
                : 'text-[#A6B0C8] hover:text-[#F4F7FF]'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Proposed Diff &amp; Test Results</span>
          </button>
        </div>

        {hasLocalEdits && (
          <button
            type="button"
            onClick={onVerifyCurrentCode}
            disabled={isValidating}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-[#0B1020] bg-[#50D7E6] hover:bg-[#3cc9d9] disabled:bg-white/15 disabled:text-[#A6B0C8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isValidating ? 'Verifying...' : 'Verify Edits in Sandbox'}</span>
          </button>
        )}
      </div>

      {/* Error Alert */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={VIEW_TRANSITION}
            role="alert"
            className="flex items-start gap-3 px-4 py-3 bg-[#FF718B]/12 border border-[#FF718B]/35 rounded-xl text-sm text-[#FFB3C1]"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#FF718B]" aria-hidden="true" />
            <div>
              <p className="font-medium text-[#F4F7FF]">Scan could not complete</p>
              <p className="text-xs text-[#FFB3C1] mt-0.5">{errorMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Status Bar during scan */}
      <AnimatePresence>
        {isRunning && (
          <motion.section
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={VIEW_TRANSITION}
            aria-live="polite"
            className="bg-[#111930]/75 backdrop-blur-md border border-[#8B7CFF]/35 rounded-xl p-4 space-y-2.5 shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#F4F7FF]">
                Scanning {filename} with static AST analysis, fault localization, and sandbox tests...
              </span>
              <span className="font-mono text-[#50D7E6]">In progress</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-45%' }}
                animate={{ x: '110%' }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#8B7CFF] to-[#50D7E6]"
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Dashboard Body: Inspector vs Diff & Verification */}
      <AnimatePresence mode="wait" initial={false}>
        {dashboardTab === 'inspector' ? (
          <motion.div
            key="inspector"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={VIEW_TRANSITION}
            className="space-y-5"
          >
            {/* Bug Summary, Category Filters & Quick-Fix Action Bar */}
            {analysis && !isRunning && (
              <section
                aria-label="Detected bugs summary and filters"
                className="bg-[#111930]/70 backdrop-blur-md border border-white/10 rounded-xl p-4 space-y-3 shadow-lg shadow-black/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Segmented Category Filter Controls */}
                  <div
                    role="group"
                    aria-label="Filter bugs by category"
                    className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#0B1020]/80 border border-white/10 rounded-lg"
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
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-[#8B7CFF] text-white shadow-sm'
                              : `text-[#A6B0C8] hover:text-[#F4F7FF] ${btn.colorCls}`
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1020] bg-[#51D6A2] hover:bg-[#42c390] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Apply All Safe Fixes ({safeFixableRemaining.length})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onChangeDashboardTab('diff')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F4F7FF] bg-white/8 border border-white/15 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Diff &amp; Review</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#50D7E6]" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Transparent Verdict + Latest AI Scan Status Line */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/10 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-[#A6B0C8]">
                    {hasLocalEdits ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#FFCA70]">
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          Editor modified locally — click Verify Edits in Sandbox to confirm tests pass
                        </span>
                      </span>
                    ) : analysis.trustVerdict === 'verified' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#51D6A2]">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          Verified fix ready ({analysis.sandbox.passed}/{analysis.sandbox.total} tests pass)
                        </span>
                      </span>
                    ) : analysis.trustVerdict === 'already_passing' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#51D6A2]">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          All tests pass ({analysis.sandbox.passed}/{analysis.sandbox.total})
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#FF718B]">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Needs your review before applying automatically</span>
                      </span>
                    )}

                    {resolvedCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#51D6A2]">
                          {resolvedCount}/{unifiedFindings.length} fixed in editor
                        </span>
                      </>
                    )}
                  </div>

                  {analysis.aiScanStatus && (
                    <div className="inline-flex items-center gap-1.5 text-[#A6B0C8]">
                      <Radar
                        className={`w-3.5 h-3.5 ${
                          analysis.aiScanStatus.status === 'ok'
                            ? 'text-[#8B7CFF]'
                            : 'text-[#A6B0C8]'
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

            {/* Quick-Jump Bug Directory */}
            {analysis && !isRunning && filteredFindings.length > 0 && (
              <section
                aria-label="All detected bugs list"
                className="bg-[#111930]/70 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg shadow-black/20"
              >
                <div className="px-4 py-2.5 bg-[#0D1426]/80 border-b border-white/10 flex items-center justify-between gap-2">
                  <h2 className="font-display text-xs font-semibold text-[#F4F7FF]">
                    All Highlighted Bugs ({filteredFindings.length}) — click any row or press n / p to navigate
                  </h2>
                  <span className="font-mono text-[11px] text-[#A6B0C8]">
                    {explanationMode === 'plain' ? 'Plain English View' : 'Technical View'}
                  </span>
                </div>
                <ul className="divide-y divide-white/[0.06]">
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
                      ? 'text-[#51D6A2]'
                      : finding.category === 'security'
                      ? 'text-[#FF718B]'
                      : finding.category === 'runtime'
                      ? 'text-[#FFCA70]'
                      : finding.category === 'modern'
                      ? 'text-[#C4BCFF]'
                      : 'text-[#50D7E6]';

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
                            isSelected ? 'bg-[#8B7CFF]/15' : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 mt-0.5 shrink-0 ${colorText}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono font-semibold text-[#F4F7FF] tabular-nums">
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
                                <span className="font-medium text-[#F4F7FF]">
                                  {finding.title}
                                </span>
                                {findingNotesCount > 0 && (
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#A6B0C8]">
                                    <span aria-hidden="true">·</span>
                                    <Mic className="w-3 h-3 text-[#FF718B]" aria-hidden="true" />
                                    <span>
                                      {findingNotesCount} note{findingNotesCount === 1 ? '' : 's'}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#A6B0C8] mt-0.5 line-clamp-2">
                                {explanationMode === 'plain'
                                  ? finding.plainEnglishExplanation
                                  : finding.technicalExplanation}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs font-medium text-[#50D7E6] whitespace-nowrap shrink-0 self-end sm:self-center">
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
              className="bg-[#111930]/70 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg shadow-black/20"
            >
              <button
                type="button"
                onClick={() => setShowTestsPanel((prev) => !prev)}
                aria-expanded={showTestsPanel}
                className="w-full px-4 py-3 bg-[#0D1426]/80 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-display font-semibold text-[#F4F7FF]">
                    Unit Test Suite &amp; Error Log
                  </span>
                  <span aria-hidden="true" className="text-white/25">
                    ·
                  </span>
                  <span className="font-mono text-[#A6B0C8]">
                    {testCode.trim()
                      ? `${testFilename} (${testCode.split('\n').length} lines)`
                      : 'Auto-synthesized if blank'}
                  </span>
                  {bugContext.trim() && (
                    <>
                      <span aria-hidden="true" className="text-white/25">
                        ·
                      </span>
                      <span className="text-[#50D7E6]">Error log attached</span>
                    </>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#A6B0C8] shrink-0">
                  <span>{showTestsPanel ? 'Collapse' : 'Edit Tests / Log'}</span>
                  {showTestsPanel ? (
                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  )}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {showTestsPanel && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={PANEL_TRANSITION}
                    className="overflow-hidden"
                  >
                    <div className="p-4 border-t border-white/10 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        className="flex flex-col bg-[#0B1020]/70 border border-white/10 rounded-lg overflow-hidden"
                      >
                        <div className="px-4 py-2 bg-[#0D1426]/85 border-b border-white/10 flex items-center justify-between">
                          <label
                            htmlFor="bug-context-input"
                            className="text-xs font-medium text-[#A6B0C8]"
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
                          className="code-editor code-scroll flex-1 w-full resize-none bg-transparent px-3.5 py-2.5 font-mono text-xs leading-5 text-[#F4F7FF] placeholder:text-[#A6B0C8]/60 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#8B7CFF]/35"
                        />
                      </section>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </motion.div>
        ) : (
          <motion.div
            key="diff"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={VIEW_TRANSITION}
          >
            <DiffReviewView
              embedded
              analysis={analysis}
              testCode={testCode}
              activeDecision={activeDecision}
              onAcceptPatch={onAcceptPatch}
              onRejectPatch={onRejectPatch}
              onDownloadPatched={onDownloadPatched}
              onValidateManualPatch={onValidateManualPatch}
              isValidatingManual={isValidating}
              onBackToWorkbench={() => onChangeDashboardTab('inspector')}
              voiceNotes={voiceNotes}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
