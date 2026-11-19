import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  GitBranch,
  Cpu,
} from 'lucide-react';
import type { AnalysisResponse } from '../types/autopatch';
import { classifySuspiciousness } from '../utils/sbfl';

interface AnalysisDiagnosticsPanelProps {
  analysis: AnalysisResponse;
}

type DiagnosticsTab = 'sbfl' | 'static' | 'apr';

export function AnalysisDiagnosticsPanel({ analysis }: AnalysisDiagnosticsPanelProps) {
  const hasMutants = (analysis.patchInfo.evaluatedMutants?.length ?? 0) > 0;
  const hasSbfl = (analysis.sbfl?.rankings.length ?? 0) > 0;
  const [activeTab, setActiveTab] = useState<DiagnosticsTab>(
    hasSbfl ? 'sbfl' : 'static'
  );

  const findings = analysis.astReport.findings ?? [];
  const functions = analysis.astReport.functions ?? [];
  const callGraph = analysis.astReport.callGraph ?? [];
  const sbfl = analysis.sbfl;
  const mutants = analysis.patchInfo.evaluatedMutants ?? [];
  const isPython = !analysis.language || analysis.language === 'python';

  const tabs: Array<{ id: DiagnosticsTab; label: string }> = [
    { id: 'sbfl', label: 'SBFL Spectrum (Ochiai / Tarantula)' },
    { id: 'static', label: 'Static Analysis, Taint & CFG' },
    {
      id: 'apr',
      label: hasMutants ? `APR Repair Trace (${mutants.length})` : 'APR Repair Trace',
    },
  ];

  return (
    <section
      aria-label="Fault localization, static CFG, taint, and APR analysis"
      className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
    >
      {/* Panel Header + Segmented Tabs */}
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Analysis deep-dive tabs"
          className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md overflow-x-auto max-w-full"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {analysis.patchInfo.aprStrategy || 'Template-Based APR'}
        </div>
      </div>

      {/* Tab 1: SBFL Spectrum & Activity Matrix */}
      {activeTab === 'sbfl' && (
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Spectrum-Based Fault Localization (Activity Matrix)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isPython ? (
                  <>
                    Recorded via Python{' '}
                    <code className="font-mono text-slate-700 dark:text-slate-300">
                      sys.settrace
                    </code>{' '}
                    across baseline test execution. Lines executed more often by failing tests rank highest.
                  </>
                ) : (
                  'Computed across baseline test execution traces and failure lines. Statements correlated with failing tests rank highest.'
                )}
              </p>
            </div>
            {sbfl && (
              <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {sbfl.rankings.length} traced lines · {sbfl.totalFailed} failed ·{' '}
                {sbfl.totalPassed} passed
              </div>
            )}
          </div>

          {!sbfl || sbfl.rankings.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              No line-level execution spectrum available for this case (see Static Analysis, Taint &amp; CFG tab for structural localization).
            </p>
          ) : (
            <div className="code-scroll overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-medium w-12 text-right">Line</th>
                    <th className="py-2 px-3 font-medium">Statement</th>
                    {sbfl.tests.map((t, idx) => (
                      <th
                        key={t.name}
                        title={`${t.name} (${t.status})`}
                        className="py-2 px-2 font-medium text-center whitespace-nowrap"
                      >
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          T{idx + 1}
                        </div>
                        <div
                          className={
                            t.status === 'failed'
                              ? 'text-[#B91C1C] dark:text-rose-400 font-semibold'
                              : 'text-[#15803D] dark:text-emerald-400'
                          }
                        >
                          {t.status === 'failed' ? 'FAIL' : 'PASS'}
                        </div>
                      </th>
                    ))}
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Ochiai
                    </th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Tarantula
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sbfl.rankings.slice(0, 10).map((row) => {
                    const level = classifySuspiciousness(row.ochiai);
                    return (
                      <tr
                        key={row.line}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {row.line}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 max-w-[320px] truncate">
                          {row.code.trim() || ' '}
                        </td>
                        {row.testHits.map((hit, idx) => (
                          <td
                            key={idx}
                            className="py-2 px-2 text-center tabular-nums"
                          >
                            {hit ? (
                              <span
                                className={
                                  sbfl.tests[idx]?.status === 'failed'
                                    ? 'text-[#B91C1C] dark:text-rose-400 font-semibold'
                                    : 'text-slate-700 dark:text-slate-300'
                                }
                              >
                                ●
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  level === 'high'
                                    ? 'bg-[#B91C1C] dark:bg-rose-500'
                                    : level === 'medium'
                                    ? 'bg-[#D97706] dark:bg-amber-500'
                                    : 'bg-slate-400 dark:bg-slate-500'
                                }`}
                                style={{ width: `${Math.round(row.ochiai * 100)}%` }}
                              />
                            </div>
                            <span
                              className={
                                level === 'high'
                                  ? 'text-[#B91C1C] dark:text-rose-400 font-semibold'
                                  : 'text-slate-800 dark:text-slate-200'
                              }
                            >
                              {row.ochiai.toFixed(3)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {row.tarantula.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sbfl && sbfl.tests.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {sbfl.tests.map((t, idx) => (
                <span key={t.name}>
                  <strong className="text-slate-700 dark:text-slate-200">T{idx + 1}</strong>:{' '}
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Static Analysis, Taint & CFG Metrics */}
      {activeTab === 'static' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Static AST / Taint / CFG Findings */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              AST, Taint &amp; Control-Flow Findings ({findings.length})
            </h2>

            {findings.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-[#15803D] dark:text-emerald-400 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>No static security, data-flow, or CFG warnings detected.</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md px-3.5">
                {findings.map((finding) => (
                  <li key={finding.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                        {finding.category === 'security' ? (
                          <ShieldAlert
                            className="w-3.5 h-3.5 text-[#B91C1C] dark:text-rose-400 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              finding.severity === 'error'
                                ? 'text-[#B91C1C] dark:text-rose-400'
                                : 'text-[#B45309] dark:text-amber-400'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span>{finding.kind}</span>
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        Line {finding.line} · {finding.category || 'ast'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {finding.message}
                    </p>
                    {finding.snippet && (
                      <code className="block font-mono text-[11.5px] text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded px-2.5 py-1 overflow-x-auto">
                        {finding.snippet}
                      </code>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cyclomatic Complexity & Interprocedural Call Graph */}
          <div className="space-y-4">
            <div className="space-y-2.5">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                <GitBranch
                  className="w-4 h-4 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <span>Control-Flow Complexity &amp; Call Graph</span>
              </h2>

              {functions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No function AST nodes parsed (repair syntax errors first to build CFG metrics).
                </p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-3 font-medium">Function</th>
                        <th className="py-2 px-3 font-medium text-right">Lines</th>
                        <th className="py-2 px-3 font-medium text-right">McCabe CC</th>
                        <th className="py-2 px-3 font-medium">Callees</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {functions.map((fn) => (
                        <tr
                          key={fn.name}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2 px-3 text-slate-900 dark:text-slate-100 font-medium">
                            {fn.name}()
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {fn.startLine}–{fn.endLine}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-900 dark:text-slate-100">
                            {fn.cyclomaticComplexity}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                            {fn.calls.length > 0 ? fn.calls.join(', ') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {callGraph.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Interprocedural Call Edges ({callGraph.length})
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {callGraph.slice(0, 10).map((edge, i) => (
                    <span key={`${edge.caller}-${edge.callee}-${i}`}>
                      {edge.caller} → {edge.callee}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: APR Repair Trace & Mutant Fitness Evaluations */}
      {activeTab === 'apr' && (
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Automated Program Repair Execution Trace
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {analysis.patchInfo.aprStrategy || 'Template-Based APR'} ·{' '}
              {analysis.patchInfo.durationMs.toFixed(1)} ms
            </span>
          </div>

          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Active Rule / Strategy: </span>
              <code className="font-mono text-slate-900 dark:text-slate-100">
                {analysis.patchInfo.ruleId}
              </code>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              {analysis.patchInfo.strategy}
            </p>
          </div>

          {mutants.length > 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-medium text-right w-14">Line</th>
                    <th className="py-2 px-3 font-medium">Mutation Operator</th>
                    <th className="py-2 px-3 font-medium">Candidate Code</th>
                    <th className="py-2 px-3 font-medium text-right">Fitness</th>
                    <th className="py-2 px-3 font-medium text-right">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {mutants.map((m, idx) => (
                    <tr
                      key={`${m.line}-${m.operator}-${idx}`}
                      className={
                        m.selected
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/40'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        L{m.line}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-800 dark:text-slate-200">
                        {m.operator}
                      </td>
                      <td className="py-2 px-3 text-slate-900 dark:text-slate-100 max-w-[260px] truncate">
                        {m.mutatedLine}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-900 dark:text-slate-100">
                        {m.passed}/{m.total} ({Math.round(m.fitness * 100)}%)
                      </td>
                      <td className="py-2 px-3 text-right font-sans font-medium">
                        {m.selected ? (
                          <span className="text-[#15803D] dark:text-emerald-400">Selected</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">Discarded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Resolved deterministically via direct AST / static fix template without requiring evolutionary search mutations.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
