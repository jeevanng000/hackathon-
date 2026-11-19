import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  XCircle,
  Download,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react';
import type { AnalysisResponse, AuditDecision } from '../types/autopatch';
import {
  evaluateTrustGate,
  formatStructuredMarkdownReport,
} from '../utils/diffAndAudit';
import {
  detectLanguageFromFilename,
  getLanguageMeta,
  type SupportedLanguage,
} from '../utils/languageDetect';
import { AnalysisDiagnosticsPanel } from './AnalysisDiagnosticsPanel';

interface DiffReviewViewProps {
  analysis: AnalysisResponse | null;
  testCode: string;
  activeDecision: AuditDecision | null;
  onAcceptPatch: (overrideReason?: string) => void;
  onRejectPatch: () => void;
  onDownloadPatched: () => void;
  onValidateManualPatch: (candidateCode: string) => Promise<void>;
  isValidatingManual: boolean;
  onBackToWorkbench: () => void;
}

type DiffTab = 'split' | 'unified' | 'report' | 'edit';

export function DiffReviewView({
  analysis,
  testCode,
  activeDecision,
  onAcceptPatch,
  onRejectPatch,
  onDownloadPatched,
  onValidateManualPatch,
  isValidatingManual,
  onBackToWorkbench,
}: DiffReviewViewProps) {
  const [diffTab, setDiffTab] = useState<DiffTab>('split');
  const [manualCode, setManualCode] = useState(analysis?.patchedCode ?? '');
  const [showConfidenceDetails, setShowConfidenceDetails] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [expandedTraceback, setExpandedTraceback] = useState<string | null>(null);

  useEffect(() => {
    setManualCode(analysis?.patchedCode ?? '');
    setOverrideEnabled(false);
    setOverrideReason('');
    setExpandedTraceback(null);
    setDiffTab('split');
  }, [analysis]);

  if (!analysis) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
          No Patch Analysis Yet
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Run the AutoPatch pipeline from the Workbench to inspect static findings, side-by-side Git diffs, and isolated sandbox verification results.
        </p>
        <button
          type="button"
          onClick={onBackToWorkbench}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Return to Workbench</span>
        </button>
      </div>
    );
  }

  const resolvedLang: SupportedLanguage =
    (analysis.language as SupportedLanguage | undefined) ??
    detectLanguageFromFilename(analysis.filename);
  const langMeta = getLanguageMeta(resolvedLang);

  const gate = evaluateTrustGate({
    verdict: analysis.trustVerdict,
    overrideEnabled,
    overrideReason,
  });

  const structuredReport = formatStructuredMarkdownReport(
    analysis,
    testCode,
    activeDecision
  );

  const handleCopyUnified = () => {
    const text =
      diffTab === 'report'
        ? structuredReport
        : analysis.diff.unified || 'No changes';
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedDiff(true);
    window.setTimeout(() => setCopiedDiff(false), 1800);
  };

  const baselineMap = new Map(analysis.baseline.tests.map((t) => [t.name, t]));
  const allTestNames = Array.from(
    new Set([
      ...analysis.baseline.tests.map((t) => t.name),
      ...analysis.sandbox.tests.map((t) => t.name),
    ])
  );
  const sandboxMap = new Map(analysis.sandbox.tests.map((t) => [t.name, t]));

  const isApproved = activeDecision === 'accepted' || activeDecision === 'override';

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={onBackToWorkbench}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              Workbench
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {analysis.filename}
            </span>
            <span aria-hidden="true">·</span>
            <span>{langMeta.label}</span>
            <span aria-hidden="true">·</span>
            <span>Diff &amp; Trust Review</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Inspectable Patch &amp; Sandbox Proof
          </h1>
        </div>

        {/* Status summary text (no pill badge) */}
        <div className="flex items-center gap-2 text-sm font-medium shrink-0">
          {analysis.trustVerdict === 'verified' && (
            <>
              <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400" aria-hidden="true" />
              <span className="text-[#15803D] dark:text-emerald-400">Sandbox Verified</span>
            </>
          )}
          {analysis.trustVerdict === 'blocked' && (
            <>
              <ShieldAlert className="w-4 h-4 text-[#B91C1C] dark:text-rose-400" aria-hidden="true" />
              <span className="text-[#B91C1C] dark:text-rose-400">
                Blocked — Human Review Required
              </span>
            </>
          )}
          {analysis.trustVerdict === 'already_passing' && (
            <>
              <CheckCircle2 className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              <span className="text-slate-700 dark:text-slate-300">Baseline Already Passing</span>
            </>
          )}
        </div>
      </div>

      {/* 4-Column Flat Metric Strip */}
      <section
        aria-label="Patch verification metrics"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Detected Defect</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-950 dark:text-slate-50 truncate">
            {analysis.patchInfo.bugType}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {analysis.patchInfo.targetLine
              ? `Line ${analysis.patchInfo.targetLine}`
              : 'Module scope'}{' '}
            · +{analysis.diff.linesAdded} -{analysis.diff.linesRemoved}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">Confidence Score</span>
            <button
              type="button"
              onClick={() => setShowConfidenceDetails((prev) => !prev)}
              aria-expanded={showConfidenceDetails}
              className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1D4ED8] dark:hover:text-blue-300 inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>Breakdown</span>
              {showConfidenceDetails ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {analysis.confidence.score}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            {analysis.patchInfo.ruleId}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Baseline Run</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {analysis.baseline.timedOut
              ? 'Timeout'
              : `${analysis.baseline.passed} / ${analysis.baseline.total}`}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {analysis.baseline.durationMs.toFixed(0)} ms isolated
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Sandbox Validation</div>
          <div
            className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
              analysis.trustVerdict === 'verified' || analysis.trustVerdict === 'already_passing'
                ? 'text-[#15803D] dark:text-emerald-400'
                : 'text-[#B91C1C] dark:text-rose-400'
            }`}
          >
            {analysis.sandbox.timedOut
              ? 'Timeout'
              : `${analysis.sandbox.passed} / ${analysis.sandbox.total}`}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {analysis.sandbox.durationMs.toFixed(0)} ms isolated
          </div>
        </div>
      </section>

      {/* Expandable Transparent Confidence Breakdown */}
      {showConfidenceDetails && (
        <section
          aria-label="Confidence score deterministic breakdown"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5"
        >
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Deterministic Confidence Breakdown ({analysis.confidence.score} / 100)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {analysis.confidence.factors.map((factor) => (
              <div key={factor.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {factor.label}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {factor.points}/{factor.maxPoints}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] dark:bg-blue-500 rounded-full"
                    style={{
                      width: `${Math.round((factor.points / factor.maxPoints) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{factor.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Root-Cause Diagnosis & Patch Strategy */}
      <section
        aria-label="Root cause diagnosis and patch strategy"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <div className="space-y-1.5">
          <h2 className="font-display text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Root-Cause Diagnosis
          </h2>
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {analysis.patchInfo.rootCause}
          </p>
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Proposed Patch Strategy
          </h2>
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {analysis.patchInfo.strategy}
          </p>
        </div>
      </section>

      {/* Diff Viewer / Manual Patch Re-Verification */}
      <section
        aria-label="Inspectable git diff viewer"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Diff view mode"
            className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md"
          >
            {(
              [
                { id: 'split', label: 'Side-by-Side Diff' },
                { id: 'unified', label: 'Unified Diff' },
                { id: 'report', label: '5-Section Triage Report' },
                { id: 'edit', label: 'Edit Patch & Re-Verify' },
              ] as Array<{ id: DiffTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={diffTab === tab.id}
                onClick={() => setDiffTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  diffTab === tab.id
                    ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-[#15803D] dark:text-emerald-400">
              +{analysis.diff.linesAdded} added
            </span>
            <span className="text-[#B91C1C] dark:text-rose-400">
              -{analysis.diff.linesRemoved} removed
            </span>
            {(diffTab === 'unified' || diffTab === 'report') && (
              <button
                type="button"
                onClick={handleCopyUnified}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                {copiedDiff ? (
                  <>
                    <Check
                      className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy
                      className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <span>{diffTab === 'report' ? 'Copy Markdown Report' : 'Copy Diff'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Side-by-Side Colorized Git Diff */}
        {diffTab === 'split' && (
          <div className="code-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse font-mono text-[12px] leading-6">
              <colgroup>
                <col className="w-10" />
                <col className="w-[calc(50%-2.5rem)]" />
                <col className="w-10" />
                <col className="w-[calc(50%-2.5rem)]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 text-left text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-1.5 text-right font-normal border-r border-slate-100 dark:border-slate-800">
                    Old
                  </th>
                  <th className="px-3 py-1.5 font-medium border-r border-slate-200 dark:border-slate-800 truncate">
                    a/{analysis.filename} (Original)
                  </th>
                  <th className="px-2 py-1.5 text-right font-normal border-r border-slate-100 dark:border-slate-800">
                    New
                  </th>
                  <th className="px-3 py-1.5 font-medium truncate">
                    b/{analysis.filename} (Candidate Patch)
                  </th>
                </tr>
              </thead>
              <tbody>
                {analysis.diff.sideBySide.map((row, idx) => {
                  const leftRemoved =
                    row.leftText !== null &&
                    (row.type === 'delete' || row.type === 'replace');
                  const rightAdded =
                    row.rightText !== null &&
                    (row.type === 'insert' || row.type === 'replace');

                  return (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800/70 last:border-b-0"
                    >
                      <td
                        className={`px-2 py-0.5 text-right align-top select-none tabular-nums border-r border-slate-100 dark:border-slate-800 ${
                          leftRemoved
                            ? 'bg-rose-100/70 dark:bg-rose-950/70 text-[#991B1B] dark:text-rose-300'
                            : 'bg-slate-50/40 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {row.leftLine ?? ''}
                      </td>
                      <td
                        className={`px-3 py-0.5 align-top whitespace-pre-wrap break-words border-r border-slate-200 dark:border-slate-800 ${
                          leftRemoved
                            ? 'bg-rose-50 dark:bg-rose-950/45 text-[#7F1D1D] dark:text-rose-200'
                            : row.leftText === null
                            ? 'bg-slate-50/60 dark:bg-slate-900/50'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {leftRemoved
                          ? `- ${row.leftText}`
                          : row.leftText !== null
                          ? `  ${row.leftText}`
                          : ''}
                      </td>
                      <td
                        className={`px-2 py-0.5 text-right align-top select-none tabular-nums border-r border-slate-100 dark:border-slate-800 ${
                          rightAdded
                            ? 'bg-emerald-100/70 dark:bg-emerald-950/70 text-[#166534] dark:text-emerald-300'
                            : 'bg-slate-50/40 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {row.rightLine ?? ''}
                      </td>
                      <td
                        className={`px-3 py-0.5 align-top whitespace-pre-wrap break-words ${
                          rightAdded
                            ? 'bg-emerald-50 dark:bg-emerald-950/45 text-[#14532D] dark:text-emerald-200'
                            : row.rightText === null
                            ? 'bg-slate-50/60 dark:bg-slate-900/50'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {rightAdded
                          ? `+ ${row.rightText}`
                          : row.rightText !== null
                          ? `  ${row.rightText}`
                          : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Unified Diff */}
        {diffTab === 'unified' && (
          <div className="p-4 bg-slate-50/50 dark:bg-[#0F172A] code-scroll overflow-x-auto">
            {analysis.diff.unified ? (
              <pre className="font-mono text-[12.5px] leading-6">
                {analysis.diff.unified.split('\n').map((line, i) => {
                  let cls = 'text-slate-800 dark:text-slate-200';
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    cls =
                      'bg-emerald-50 dark:bg-emerald-950/45 text-[#14532D] dark:text-emerald-200';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    cls = 'bg-rose-50 dark:bg-rose-950/45 text-[#7F1D1D] dark:text-rose-200';
                  } else if (line.startsWith('@@')) {
                    cls = 'text-[#2563EB] dark:text-blue-400 font-medium';
                  }
                  return (
                    <div key={i} className={`px-2 ${cls}`}>
                      {line || ' '}
                    </div>
                  );
                })}
              </pre>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No textual differences between original source and candidate code.
              </p>
            )}
          </div>
        )}

        {/* Tab 3: 5-Section Structured Triage & Repair Report */}
        {diffTab === 'report' && (
          <div className="p-4 bg-slate-50/50 dark:bg-[#0F172A] code-scroll overflow-x-auto">
            <pre className="font-mono text-[12.5px] leading-6 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {structuredReport}
            </pre>
          </div>
        )}

        {/* Tab 4: Edit Patch & Re-Verify in Sandbox */}
        {diffTab === 'edit' && (
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Edit the candidate {langMeta.label} file below and re-run isolated verification. Original source remains untouched until you accept.
              </p>
              <button
                type="button"
                onClick={() => onValidateManualPatch(manualCode)}
                disabled={isValidatingManual}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-400 dark:disabled:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isValidatingManual ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {isValidatingManual ? 'Validating...' : 'Re-Run Sandbox Verification'}
                </span>
              </button>
            </div>
            <textarea
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              spellCheck={false}
              aria-label="Editable candidate patch code"
              rows={13}
              className="code-editor code-scroll w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] px-4 py-3 font-mono text-[13px] leading-6 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#2563EB] dark:focus:border-blue-400 focus:ring-2 focus:ring-[#2563EB]/20 whitespace-pre"
            />
          </div>
        )}
      </section>

      {/* Spectrum-Based Fault Localization, Static Taint/CFG & APR Repair Trace */}
      <AnalysisDiagnosticsPanel
        key={`${analysis.filename}-${resolvedLang}-${analysis.patchInfo.ruleId}-${analysis.diff.linesAdded}-${analysis.diff.linesRemoved}`}
        analysis={analysis}
      />

      {/* Sandbox Verification Test Matrix */}
      <section
        aria-label="Sandbox test execution comparison"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sandbox Verification Results ({analysis.testFilename})
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Timeout budget: 2.0s · {langMeta.runtimeLabel}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-5 font-medium">Test / Verification Check</th>
                <th className="py-2.5 px-4 font-medium">Baseline</th>
                <th className="py-2.5 px-4 font-medium">Sandbox Candidate</th>
                <th className="py-2.5 px-5 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {allTestNames.map((name) => {
                const base = baselineMap.get(name);
                const sand = sandboxMap.get(name);
                const tb = sand?.traceback || base?.traceback;
                const isExpanded = expandedTraceback === name;

                return (
                  <tr
                    key={name}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-5 align-top">
                      <div className="font-mono text-xs text-slate-900 dark:text-slate-100">
                        {name}
                      </div>
                      {tb && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTraceback(isExpanded ? null : name)
                          }
                          className="mt-1 text-[11px] font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1D4ED8] dark:hover:text-blue-300 cursor-pointer"
                        >
                          {isExpanded ? 'Hide traceback' : 'View traceback'}
                        </button>
                      )}
                      {isExpanded && tb && (
                        <pre className="mt-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] leading-5 text-slate-700 dark:text-slate-300 overflow-x-auto max-w-xl whitespace-pre-wrap">
                          {tb}
                        </pre>
                      )}
                    </td>
                    <td className="py-2.5 px-4 align-top text-xs">
                      {!base ? (
                        <span className="text-slate-400 dark:text-slate-500">Not reached</span>
                      ) : base.status === 'passed' ? (
                        <span className="inline-flex items-center gap-1 text-[#15803D] dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Pass</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#B91C1C] dark:text-rose-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{base.errorType || 'Fail'}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 align-top text-xs">
                      {!sand ? (
                        <span className="text-slate-400 dark:text-slate-500">Not executed</span>
                      ) : sand.status === 'passed' ? (
                        <span className="inline-flex items-center gap-1 text-[#15803D] dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Pass</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#B91C1C] dark:text-rose-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{sand.errorType || 'Fail'}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-5 align-top text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {(sand?.durationMs ?? base?.durationMs ?? 0).toFixed(2)} ms
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust Decision & Human Override Gate */}
      <section
        aria-label="Patch approval and trust gate"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Developer Trust Decision
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {activeDecision === 'accepted'
                ? 'Patch accepted and logged to Audit Ledger. Original source updated in Workbench and ready for download.'
                : activeDecision === 'override'
                ? 'Patch accepted via Human Override and logged with your justification in the Audit Ledger.'
                : activeDecision === 'rejected'
                ? 'Patch rejected and recorded in Audit Ledger. Original source remains unmodified.'
                : gate.reason}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onAcceptPatch(gate.requiresOverride ? overrideReason : undefined)
              }
              disabled={!gate.canAcceptNow || activeDecision === 'accepted' || activeDecision === 'override'}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {gate.requiresOverride ? 'Accept with Override' : 'Accept Patch'}
              </span>
            </button>

            <button
              type="button"
              onClick={onRejectPatch}
              disabled={activeDecision === 'rejected'}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <XCircle
                className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
                aria-hidden="true"
              />
              <span>Reject Patch</span>
            </button>

            <button
              type="button"
              onClick={onDownloadPatched}
              disabled={!isApproved}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Download
                className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400"
                aria-hidden="true"
              />
              <span>Download {analysis.filename}</span>
            </button>
          </div>
        </div>

        {/* Explicit Human Override Panel when Sandbox Blocks the Patch */}
        {gate.requiresOverride && activeDecision !== 'override' && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-900 dark:text-slate-100 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(e) => setOverrideEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span>
                Enable Human Override (unlock blocked patch approval with mandatory audit justification)
              </span>
            </label>

            {overrideEnabled && (
              <div className="space-y-1.5 max-w-xl">
                <label
                  htmlFor="override-reason"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Override Justification (minimum 8 characters)
                </label>
                <input
                  id="override-reason"
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Exporting annotated file to implement dead-letter queue manually"
                  className="w-full px-3 py-2 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-[#2563EB] dark:focus:border-blue-400 focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
