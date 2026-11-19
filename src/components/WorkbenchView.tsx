import { useRef } from 'react';
import { RotateCcw, ArrowRight, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AnalysisResponse } from '../types/autopatch';
import {
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  type SupportedLanguage,
} from '../utils/languageDetect';

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
  onResetDemo: () => void;
  canResetDemo: boolean;
  analysis: AnalysisResponse | null;
  isRunning: boolean;
  errorMessage: string | null;
  onOpenReview: () => void;
}

function LineNumberedEditor({
  id,
  label,
  filename,
  onChangeFilename,
  value,
  onChange,
  highlightLine,
}: {
  id: string;
  label: string;
  filename: string;
  onChangeFilename: (val: string) => void;
  value: string;
  onChange: (val: string) => void;
  highlightLine?: number | null;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = value.split('\n');
  const lineCount = lines.length;

  return (
    <section
      aria-label={label}
      className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
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
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
          <span>{lineCount} lines</span>
          {highlightLine != null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#B91C1C] dark:text-rose-400 font-medium">
                L{highlightLine}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-[300px] max-h-[420px] overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="select-none bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-100 dark:border-slate-800 py-3 px-2.5 text-right font-mono text-xs leading-6 text-slate-400 dark:text-slate-500 tabular-nums overflow-hidden shrink-0 w-10"
        >
          {Array.from({ length: Math.max(lineCount, 12) }, (_, idx) => {
            const num = idx + 1;
            const isFlagged = highlightLine === num;
            return (
              <div
                key={num}
                className={
                  isFlagged ? 'text-[#B91C1C] dark:text-rose-400 font-semibold' : undefined
                }
              >
                {num}
              </div>
            );
          })}
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
          className="code-editor code-scroll flex-1 w-full resize-none bg-white dark:bg-[#0F172A] px-3.5 py-3 font-mono text-[12.5px] leading-6 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#2563EB]/25 dark:focus:ring-blue-400/30 overflow-auto whitespace-pre"
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
  onResetDemo,
  canResetDemo,
  analysis,
  isRunning,
  errorMessage,
  onOpenReview,
}: WorkbenchViewProps) {
  const highlightedLine =
    analysis?.baseline.errorLine ??
    analysis?.astReport.findings[0]?.line ??
    null;

  const langMeta = getLanguageMeta(resolvedLanguage);
  const analysisLangMeta = getLanguageMeta(
    (analysis?.language as SupportedLanguage | undefined) ?? resolvedLanguage
  );

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">{filename}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 dark:text-slate-400">
              {langMeta.runtimeLabel}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Multi-Language Bug Detection &amp; Sandbox Workbench
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            {caseDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="language-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Language
            </label>
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
          </div>

          {canResetDemo && (
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Reset Case</span>
            </button>
          )}
          {analysis && !isRunning && (
            <button
              type="button"
              onClick={onOpenReview}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Inspect Diff &amp; Review</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Validation / Runtime Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg text-sm text-[#991B1B] dark:text-rose-200"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Analysis could not run</p>
            <p className="text-xs text-[#991B1B]/90 dark:text-rose-300 mt-0.5">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* Split Source & Test Editors */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        <LineNumberedEditor
          id="source-editor"
          label="Source Module"
          filename={filename}
          onChangeFilename={onChangeFilename}
          value={sourceCode}
          onChange={onChangeSourceCode}
          highlightLine={highlightedLine}
        />
        <LineNumberedEditor
          id="test-editor"
          label="Unit Test Suite (Optional — Auto-Synthesized if Blank)"
          filename={testFilename}
          onChangeFilename={onChangeTestFilename}
          value={testCode}
          onChange={onChangeTestCode}
        />
      </div>

      {/* Failing Test Traceback / Bug Description Input */}
      <section
        aria-label="Failing test traceback or bug description"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
          <label
            htmlFor="bug-context-input"
            className="text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Failing Test Traceback / Error Log (Optional — Parsed for Line &amp; Exception Triage)
          </label>
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
            4-Step AutoPatch Workflow Input
          </span>
        </div>
        <textarea
          id="bug-context-input"
          value={bugContext}
          onChange={(e) => onChangeBugContext(e.target.value)}
          spellCheck={false}
          rows={3}
          placeholder="Paste failing test traceback, compiler error log, or bug description here (e.g. TypeError: 'NoneType' object is not subscriptable at line 6)..."
          className="code-editor code-scroll w-full resize-y bg-white dark:bg-[#0F172A] px-3.5 py-2.5 font-mono text-xs leading-5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#2563EB]/25"
        />
      </section>

      {/* Loading Skeleton during execution */}
      {isRunning && (
        <section
          aria-live="polite"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
        >
          <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-3 w-full max-w-xl bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="h-24 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded animate-pulse" />
            <div className="h-24 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded animate-pulse" />
          </div>
        </section>
      )}

      {/* Stage 1 & 2 Live Diagnostic Panel (after analysis runs) */}
      {analysis && !isRunning && (
        <section
          aria-label="Static analysis and baseline diagnosis"
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Static Findings &amp; Baseline Execution Trace
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {analysisLangMeta.runtimeLabel} · Static pass ({analysis.astReport.durationMs.toFixed(1)} ms) &amp; baseline ({analysis.baseline.durationMs.toFixed(0)} ms)
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenReview}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1D4ED8] dark:hover:text-blue-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Review Proposed Patch</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Static Findings */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Static AST / CFG / Taint Inspection
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Syntax: {analysis.astReport.syntaxValid ? 'Valid' : 'Invalid'} ·{' '}
                  {analysis.astReport.findings.length} issue
                  {analysis.astReport.findings.length === 1 ? '' : 's'}
                </span>
              </div>

              {analysis.astReport.findings.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[#15803D] dark:text-emerald-400 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>No static anti-patterns detected.</span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analysis.astReport.findings.map((finding) => (
                    <li key={finding.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              finding.severity === 'error'
                                ? 'text-[#B91C1C] dark:text-rose-400'
                                : 'text-[#B45309] dark:text-amber-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{finding.kind}</span>
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          Line {finding.line} · {finding.function}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {finding.message}
                      </p>
                      {finding.snippet && (
                        <code className="block font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded px-2.5 py-1.5 overflow-x-auto">
                          {finding.snippet}
                        </code>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Baseline Traceback */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Baseline Verification Result
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {analysis.baseline.timedOut
                    ? 'Timed out (2.0s)'
                    : `${analysis.baseline.passed}/${analysis.baseline.total} passed`}
                </span>
              </div>

              {analysis.baseline.traceback ? (
                <pre className="code-scroll font-mono text-xs leading-5 text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 overflow-x-auto max-h-44 whitespace-pre-wrap">
                  {analysis.baseline.traceback}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#15803D] dark:text-emerald-400 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>All baseline checks passed with zero tracebacks.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
