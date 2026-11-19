import { useState } from 'react';
import {
  Search,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import type { AuditEntry } from '../types/autopatch';
import {
  type AuditFilter,
  filterAuditEntries,
  formatAuditTimestamp,
  serializeAuditToCsv,
} from '../utils/diffAndAudit';

interface AuditLedgerViewProps {
  entries: AuditEntry[];
  onClearEntries: () => void;
  onGoToWorkbench: () => void;
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function AuditLedgerView({
  entries,
  onClearEntries,
  onGoToWorkbench,
}: AuditLedgerViewProps) {
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = filterAuditEntries(entries, filter, query);

  const acceptedCount = entries.filter((e) => e.decision === 'accepted').length;
  const rejectedCount = entries.filter((e) => e.decision === 'rejected').length;
  const overrideCount = entries.filter((e) => e.decision === 'override').length;
  const blockedCount = entries.filter((e) => e.decision === 'blocked').length;

  const filterOptions: Array<{ id: AuditFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'override', label: 'Override' },
    { id: 'blocked', label: 'Blocked' },
  ];

  const handleExportCsv = () => {
    const csv = serializeAuditToCsv(filtered);
    triggerFileDownload('autopatch-audit-ledger.csv', csv, 'text/csv;charset=utf-8');
  };

  const handleExportJson = () => {
    const json = JSON.stringify(filtered, null, 2);
    triggerFileDownload('autopatch-audit-ledger.json', json, 'application/json');
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-700 dark:text-slate-300">Trust &amp; Audit Ledger</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Patch Audit Trail
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Every analyzed file, line target, sandbox verification result, confidence score, and human approval or override decision.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Export JSON</span>
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClearEntries}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B91C1C] dark:text-rose-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Ledger</span>
            </button>
          )}
        </div>
      </div>

      {/* Flat Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Total </span>
          <strong className="text-slate-950 dark:text-slate-50">{entries.length}</strong>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Accepted </span>
          <strong className="text-[#15803D] dark:text-emerald-400">{acceptedCount}</strong>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Rejected </span>
          <strong className="text-slate-900 dark:text-slate-200">{rejectedCount}</strong>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Overrides </span>
          <strong className="text-[#B45309] dark:text-amber-400">{overrideCount}</strong>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Blocked </span>
          <strong className="text-[#B91C1C] dark:text-rose-400">{blockedCount}</strong>
        </div>
      </div>

      {/* Search & Segmented Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file, bug type, rule, or note..."
            aria-label="Search audit ledger"
            className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-[#2563EB] dark:focus:border-blue-400 focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <div
          role="group"
          aria-label="Filter audit entries by decision"
          className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md overflow-x-auto"
        >
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              aria-pressed={filter === opt.id}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === opt.id
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Populated Table or Empty State */}
      {entries.length === 0 ? (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-6 py-14 text-center space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            No Audit Decisions Recorded Yet
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run an analysis on any source file and accept, reject, or override a patch to build an exportable trust ledger.
          </p>
          <button
            type="button"
            onClick={onGoToWorkbench}
            className="inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer"
          >
            Open Workbench
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-6 py-12 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No audit records match your current filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setQuery('');
            }}
            className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1D4ED8] dark:hover:text-blue-300 cursor-pointer"
          >
            Reset search &amp; filters
          </button>
        </section>
      ) : (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium whitespace-nowrap">File &amp; Line</th>
                  <th className="py-2.5 px-4 font-medium whitespace-nowrap">Bug Type</th>
                  <th className="py-2.5 px-4 font-medium text-right whitespace-nowrap">
                    Confidence
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right whitespace-nowrap">
                    Sandbox
                  </th>
                  <th className="py-2.5 px-4 font-medium whitespace-nowrap">Decision</th>
                  <th className="py-2.5 px-4 font-medium">Patch Summary &amp; Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap align-top">
                      {formatAuditTimestamp(entry.timestamp)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap align-top">
                      <span>{entry.filename}</span>
                      {entry.line != null && (
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          :{entry.line}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap align-top">
                      {entry.bugType}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 whitespace-nowrap align-top">
                      {entry.confidence}%
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-700 dark:text-slate-300 whitespace-nowrap align-top">
                      {entry.sandboxPassed}/{entry.sandboxTotal}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap align-top">
                      {entry.decision === 'accepted' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#15803D] dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Accepted</span>
                        </span>
                      )}
                      {entry.decision === 'rejected' && (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Rejected</span>
                        </span>
                      )}
                      {entry.decision === 'override' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#B45309] dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Human Override</span>
                        </span>
                      )}
                      {entry.decision === 'blocked' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#B91C1C] dark:text-rose-400">
                          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Blocked</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 align-top max-w-sm">
                      <p className="leading-relaxed">{entry.summary}</p>
                      {entry.overrideReason && (
                        <p className="mt-1 text-[11px] text-[#92400E] dark:text-amber-300">
                          Override note: {entry.overrideReason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
