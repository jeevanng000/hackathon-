import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Bug,
  Radar,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Pencil,
  Eye,
  Upload,
  Mic,
} from 'lucide-react';
import type {
  BugCategory,
  ExplanationMode,
  UnifiedBugFinding,
  VoiceNote,
} from '../types/autopatch';
import {
  getAdjacentFindingId,
  isEditableTargetElement,
} from '../utils/unifiedFindings';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';

export type CodeStageMode = 'inspect' | 'edit';

interface BugCodeStageProps {
  filename: string;
  onChangeFilename: (name: string) => void;
  sourceCode: string;
  onChangeSourceCode: (code: string) => void;
  onDropSourceFile: (filename: string, content: string) => void;
  findings: UnifiedBugFinding[];
  activeFindingId: string | null;
  onSelectFinding: (id: string | null) => void;
  resolvedFindingIds: Set<string>;
  onApplyFix: (finding: UnifiedBugFinding) => void;
  explanationMode: ExplanationMode;
  stageMode: CodeStageMode;
  onChangeStageMode: (mode: CodeStageMode) => void;
  hasScanned: boolean;
  voiceNotes: VoiceNote[];
  onAddVoiceNote: (note: VoiceNote) => void;
  onUpdateVoiceNote: (noteId: string, patch: Partial<VoiceNote>) => void;
  onDeleteVoiceNote: (noteId: string) => void;
}

interface CategoryStyle {
  label: string;
  rowBg: string;
  rowHover: string;
  gutterBg: string;
  gutterText: string;
  markerBtn: string;
  popoverHeaderBg: string;
  accentText: string;
  Icon: typeof ShieldAlert;
}

const CATEGORY_STYLES: Record<BugCategory, CategoryStyle> = {
  security: {
    label: 'Security',
    rowBg: 'bg-rose-50/90 dark:bg-rose-950/40',
    rowHover: 'hover:bg-rose-100/70 dark:hover:bg-rose-950/60',
    gutterBg: 'bg-rose-100/80 dark:bg-rose-950/70',
    gutterText: 'text-[#B91C1C] dark:text-rose-300 font-semibold',
    markerBtn:
      'bg-rose-100 dark:bg-rose-900/70 text-[#991B1B] dark:text-rose-200 border-rose-300 dark:border-rose-700 hover:bg-rose-200/80 dark:hover:bg-rose-900',
    popoverHeaderBg: 'bg-rose-50/70 dark:bg-rose-950/50',
    accentText: 'text-[#B91C1C] dark:text-rose-300',
    Icon: ShieldAlert,
  },
  runtime: {
    label: 'Crash Risk',
    rowBg: 'bg-amber-50/90 dark:bg-amber-950/35',
    rowHover: 'hover:bg-amber-100/70 dark:hover:bg-amber-950/55',
    gutterBg: 'bg-amber-100/80 dark:bg-amber-950/65',
    gutterText: 'text-[#B45309] dark:text-amber-300 font-semibold',
    markerBtn:
      'bg-amber-100 dark:bg-amber-900/70 text-[#92400E] dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-200/80 dark:hover:bg-amber-900',
    popoverHeaderBg: 'bg-amber-50/70 dark:bg-amber-950/45',
    accentText: 'text-[#B45309] dark:text-amber-300',
    Icon: AlertTriangle,
  },
  logic: {
    label: 'Logic',
    rowBg: 'bg-blue-50/85 dark:bg-blue-950/35',
    rowHover: 'hover:bg-blue-100/70 dark:hover:bg-blue-950/55',
    gutterBg: 'bg-blue-100/75 dark:bg-blue-950/65',
    gutterText: 'text-[#1D4ED8] dark:text-blue-300 font-semibold',
    markerBtn:
      'bg-blue-100 dark:bg-blue-900/70 text-[#1E40AF] dark:text-blue-200 border-blue-300 dark:border-blue-700 hover:bg-blue-200/80 dark:hover:bg-blue-900',
    popoverHeaderBg: 'bg-blue-50/70 dark:bg-blue-950/45',
    accentText: 'text-[#1D4ED8] dark:text-blue-300',
    Icon: Bug,
  },
  modern: {
    label: 'Latest AI',
    rowBg: 'bg-violet-50/90 dark:bg-violet-950/35',
    rowHover: 'hover:bg-violet-100/70 dark:hover:bg-violet-950/55',
    gutterBg: 'bg-violet-100/80 dark:bg-violet-950/65',
    gutterText: 'text-[#6D28D9] dark:text-violet-300 font-semibold',
    markerBtn:
      'bg-violet-100 dark:bg-violet-900/70 text-[#5B21B6] dark:text-violet-200 border-violet-300 dark:border-violet-700 hover:bg-violet-200/80 dark:hover:bg-violet-900',
    popoverHeaderBg: 'bg-violet-50/70 dark:bg-violet-950/45',
    accentText: 'text-[#6D28D9] dark:text-violet-300',
    Icon: Radar,
  },
};

function sourceLabel(source: UnifiedBugFinding['source']): string {
  if (source === 'ai-latest') return 'Latest AI Scan';
  if (source === 'sandbox-runtime') return 'Sandbox Test Trace';
  return 'Static AST / CFG';
}

export function BugCodeStage({
  filename,
  onChangeFilename,
  sourceCode,
  onChangeSourceCode,
  onDropSourceFile,
  findings,
  activeFindingId,
  onSelectFinding,
  resolvedFindingIds,
  onApplyFix,
  explanationMode,
  stageMode,
  onChangeStageMode,
  hasScanned,
  voiceNotes,
  onAddVoiceNote,
  onUpdateVoiceNote,
  onDeleteVoiceNote,
}: BugCodeStageProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const lines = sourceCode.split('\n');
  const lineCount = lines.length;

  // Map each line to findings covering it
  const findingsByLine = new Map<number, UnifiedBugFinding[]>();
  for (const f of findings) {
    for (let ln = f.line; ln <= Math.min(lineCount, f.endLine); ln++) {
      const arr = findingsByLine.get(ln) ?? [];
      arr.push(f);
      findingsByLine.set(ln, arr);
    }
  }

  const activeFinding =
    findings.find((f) => f.id === activeFindingId) ?? null;
  const activeIndex = activeFinding
    ? findings.findIndex((f) => f.id === activeFinding.id)
    : -1;

  // Scroll smoothly to active finding line in Inspect mode
  useEffect(() => {
    if (stageMode === 'inspect' && activeFinding) {
      const el = lineRefs.current[activeFinding.line];
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeFinding?.id, stageMode]);

  const handleJumpToEditLine = (lineNum: number) => {
    onChangeStageMode('edit');
    window.requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const before = lines.slice(0, Math.max(0, lineNum - 1)).join('\n');
      const startPos = lineNum > 1 ? before.length + 1 : 0;
      const endPos = startPos + (lines[lineNum - 1]?.length ?? 0);
      ta.focus();
      ta.setSelectionRange(startPos, endPos);
    });
  };

  // Power-user keyboard navigation between findings in Inspect mode
  useEffect(() => {
    if (stageMode !== 'inspect' || findings.length === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (isEditableTargetElement(target)) {
        if (e.key === 'Escape' && activeFindingId) {
          target?.blur();
          onSelectFinding(null);
        }
        return;
      }

      const key = e.key;
      const lower = key.toLowerCase();

      if (key === 'Escape' && activeFindingId) {
        e.preventDefault();
        onSelectFinding(null);
        return;
      }

      if (
        lower === 'n' ||
        lower === 'j' ||
        key === 'ArrowDown' ||
        key === 'ArrowRight'
      ) {
        e.preventDefault();
        const nextId = getAdjacentFindingId(findings, activeFindingId, 'next');
        if (nextId) onSelectFinding(nextId);
        return;
      }

      if (
        lower === 'p' ||
        lower === 'k' ||
        key === 'ArrowUp' ||
        key === 'ArrowLeft'
      ) {
        e.preventDefault();
        const prevId = getAdjacentFindingId(findings, activeFindingId, 'prev');
        if (prevId) onSelectFinding(prevId);
        return;
      }

      if (
        lower === 'f' &&
        activeFinding &&
        activeFinding.canAutoFix &&
        activeFinding.suggestedReplacement !== null &&
        !resolvedFindingIds.has(activeFinding.id)
      ) {
        e.preventDefault();
        onApplyFix(activeFinding);
        return;
      }

      if (lower === 'e') {
        e.preventDefault();
        handleJumpToEditLine(activeFinding?.line ?? 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    stageMode,
    findings,
    activeFindingId,
    activeFinding,
    resolvedFindingIds,
    onSelectFinding,
    onApplyFix,
  ]);

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onDropSourceFile(file.name, reader.result);
      }
    };
    reader.readAsText(file);
  };

  const unresolvedCount = findings.filter((f) => !resolvedFindingIds.has(f.id)).length;

  return (
    <section
      aria-label="Interactive source code and bug inspector"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col bg-white dark:bg-[#111827] border rounded-lg overflow-hidden transition-colors ${
        isDraggingOver
          ? 'border-[#2563EB] dark:border-blue-400 ring-2 ring-[#2563EB]/25'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Drag-and-drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-20 bg-blue-50/90 dark:bg-slate-900/90 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Upload className="w-7 h-7 text-[#2563EB] dark:text-blue-400" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Drop your code file to inspect it
          </p>
        </div>
      )}

      {/* Stage Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <label
            htmlFor="stage-filename"
            className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0"
          >
            File
          </label>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            /
          </span>
          <input
            id="stage-filename"
            type="text"
            value={filename}
            onChange={(e) => onChangeFilename(e.target.value)}
            aria-label="Source filename"
            className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#2563EB] dark:focus:border-blue-400 focus:outline-none px-1 py-0.5 min-w-0 w-full max-w-[240px]"
          />
          <span className="hidden sm:inline font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
            · {lineCount} lines
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasScanned && (
            <span className="hidden md:inline text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              {unresolvedCount === 0 && findings.length > 0 ? (
                <span className="text-[#15803D] dark:text-emerald-400 font-medium">
                  All {findings.length} highlighted fixes applied
                </span>
              ) : findings.length > 0 ? (
                <span>
                  {unresolvedCount} bug{unresolvedCount === 1 ? '' : 's'} highlighted
                </span>
              ) : (
                <span className="text-[#15803D] dark:text-emerald-400 font-medium">
                  Zero bugs flagged
                </span>
              )}
            </span>
          )}

          {/* Mode Segmented Control: Inspect Bugs | Edit Code */}
          <div
            role="group"
            aria-label="Code view mode"
            className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-md"
          >
            <button
              type="button"
              onClick={() => onChangeStageMode('inspect')}
              aria-pressed={stageMode === 'inspect'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                stageMode === 'inspect'
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Inspect Bugs</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeStageMode('edit')}
              aria-pressed={stageMode === 'edit'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                stageMode === 'edit'
                  ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Color Legend Strip (visible when findings exist) */}
      {hasScanned && findings.length > 0 && stageMode === 'inspect' && (
        <div className="px-4 py-2 bg-slate-50/40 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Click any highlighted line to open its fix popup:
            </span>
            {(Object.keys(CATEGORY_STYLES) as BugCategory[]).map((cat) => {
              const cfg = CATEGORY_STYLES[cat];
              const Icon = cfg.Icon;
              const count = findings.filter((f) => f.category === cat).length;
              if (count === 0) return null;
              return (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1 font-medium ${cfg.accentText}`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {cfg.label} ({count})
                  </span>
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>
              Keys: <strong className="font-semibold text-slate-700 dark:text-slate-200">n</strong> / <strong className="font-semibold text-slate-700 dark:text-slate-200">&darr;</strong> next
              {' · '}
              <strong className="font-semibold text-slate-700 dark:text-slate-200">p</strong> / <strong className="font-semibold text-slate-700 dark:text-slate-200">&uarr;</strong> prev
              {' · '}
              <strong className="font-semibold text-slate-700 dark:text-slate-200">f</strong> apply fix
              {' · '}
              <strong className="font-semibold text-slate-700 dark:text-slate-200">esc</strong> close
            </span>
            {activeFinding && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  Viewing bug {activeIndex + 1} of {findings.length}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mode 1: Interactive Color-Coded Bug Inspector with Anchored Line Popover */}
      {stageMode === 'inspect' ? (
        <div className="code-scroll max-h-[540px] overflow-auto bg-white dark:bg-[#0F172A] divide-y divide-slate-100/60 dark:divide-slate-800/40">
          {lines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const lineFindings = findingsByLine.get(lineNum) ?? [];
            const primaryFinding = lineFindings[0] ?? null;
            // Anchor popover to the starting line of the active finding
            const anchoredFinding =
              activeFinding && activeFinding.line === lineNum ? activeFinding : null;

            const isResolved =
              primaryFinding !== null &&
              lineFindings.every((f) => resolvedFindingIds.has(f.id));
            const style = primaryFinding ? CATEGORY_STYLES[primaryFinding.category] : null;
            const Icon = style?.Icon ?? Bug;

            const rowClasses = primaryFinding
              ? isResolved
                ? 'bg-emerald-50/75 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/45 cursor-pointer'
                : `${style!.rowBg} ${style!.rowHover} cursor-pointer`
              : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/50';

            const gutterClasses = primaryFinding
              ? isResolved
                ? 'bg-emerald-100/80 dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300 font-semibold'
                : `${style!.gutterBg} ${style!.gutterText}`
              : 'bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500';

            return (
              <div
                key={lineNum}
                ref={(el) => {
                  lineRefs.current[lineNum] = el;
                }}
              >
                <div
                  onClick={() => {
                    if (primaryFinding) {
                      onSelectFinding(
                        activeFindingId === primaryFinding.id ? null : primaryFinding.id
                      );
                    }
                  }}
                  className={`flex items-stretch font-mono text-[13px] leading-6 transition-colors ${rowClasses}`}
                >
                  {/* Line Number + Marker Indicator Gutter */}
                  <div
                    className={`w-14 px-2.5 py-0.5 text-right select-none tabular-nums border-r border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-end gap-1.5 ${gutterClasses}`}
                  >
                    {primaryFinding && (
                      isResolved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )
                    )}
                    <span>{lineNum}</span>
                  </div>

                  {/* Code Text + Inline Clickable Bug Marking */}
                  <div className="flex-1 min-w-0 px-3.5 py-0.5 flex items-center justify-between gap-3">
                    <pre className="whitespace-pre overflow-x-auto text-slate-900 dark:text-slate-100 flex-1 min-w-0">
                      {lineText || ' '}
                    </pre>

                    {/* Show inline clickable marker on the starting line of each bug */}
                    {primaryFinding && primaryFinding.line === lineNum && (
                      <div className="inline-flex items-center gap-1.5 shrink-0">
                        {(() => {
                          const lineNoteCount = voiceNotes.filter((n) =>
                            lineFindings.some((f) => f.id === n.findingId)
                          ).length;
                          if (lineNoteCount === 0) return null;
                          return (
                            <span
                              title={`${lineNoteCount} voice note${lineNoteCount === 1 ? '' : 's'} attached`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-sans font-mono tabular-nums text-slate-600 dark:text-slate-300"
                            >
                              <Mic className="w-3 h-3 text-[#DC2626] dark:text-rose-400" aria-hidden="true" />
                              <span>{lineNoteCount}</span>
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectFinding(
                              activeFindingId === primaryFinding.id ? null : primaryFinding.id
                            );
                          }}
                          aria-expanded={activeFindingId === primaryFinding.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-sans font-medium border rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isResolved
                              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-[#15803D] dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                              : style!.markerBtn
                          }`}
                        >
                          {isResolved ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              <span>Fixed</span>
                            </>
                          ) : (
                            <>
                              <Icon className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {style!.label}
                                {lineFindings.length > 1 ? ` +${lineFindings.length - 1}` : ''}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Anchored Per-Line Bug Popover */}
                {anchoredFinding && (
                  <div
                    role="dialog"
                    aria-label={`Bug details for line ${anchoredFinding.line}`}
                    className="mx-3 sm:mx-14 my-2 bg-white dark:bg-[#1E293B] border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden transition-opacity duration-150"
                  >
                    {(() => {
                      const popStyle = CATEGORY_STYLES[anchoredFinding.category];
                      const PopIcon = popStyle.Icon;
                      const popResolved = resolvedFindingIds.has(anchoredFinding.id);
                      const lineFindingsOnAnchor = findingsByLine.get(lineNum) ?? [anchoredFinding];

                      return (
                        <>
                          {/* Popover Header */}
                          <div
                            className={`px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 ${
                              popResolved
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/40'
                                : popStyle.popoverHeaderBg
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`inline-flex items-center gap-1.5 font-semibold ${
                                  popResolved
                                    ? 'text-[#15803D] dark:text-emerald-300'
                                    : popStyle.accentText
                                }`}
                              >
                                {popResolved ? (
                                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                ) : (
                                  <PopIcon className="w-4 h-4" aria-hidden="true" />
                                )}
                                <span>
                                  {popResolved ? 'Fix Applied' : popStyle.label}
                                </span>
                              </span>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                                ·
                              </span>
                              <span className="font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                                {anchoredFinding.line === anchoredFinding.endLine
                                  ? `Line ${anchoredFinding.line}`
                                  : `Lines ${anchoredFinding.line}–${anchoredFinding.endLine}`}
                              </span>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                                ·
                              </span>
                              <span className="text-slate-600 dark:text-slate-300 capitalize">
                                {anchoredFinding.severity}
                              </span>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                                ·
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {sourceLabel(anchoredFinding.source)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {lineFindingsOnAnchor.length > 1 && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                                  ({lineFindingsOnAnchor.length} issues on line)
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onSelectFinding(null)}
                                aria-label="Close bug popup"
                                aria-keyshortcuts="Escape"
                                title="Close popup (Esc)"
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <X className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Multiple bugs switcher if more than 1 bug hits the same line */}
                          {lineFindingsOnAnchor.length > 1 && (
                            <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 overflow-x-auto">
                              {lineFindingsOnAnchor.map((lf) => (
                                <button
                                  key={lf.id}
                                  type="button"
                                  onClick={() => onSelectFinding(lf.id)}
                                  className={`px-2 py-1 text-xs rounded whitespace-nowrap cursor-pointer ${
                                    lf.id === anchoredFinding.id
                                      ? 'bg-slate-900 dark:bg-blue-600 text-white font-medium'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {lf.title}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Popover Body */}
                          <div className="p-4 space-y-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-slate-50">
                                  {anchoredFinding.title}
                                </h3>
                                {explanationMode === 'technical' && anchoredFinding.cweOrRule && (
                                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                    {anchoredFinding.cweOrRule}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                                {explanationMode === 'plain'
                                  ? anchoredFinding.plainEnglishExplanation
                                  : anchoredFinding.technicalExplanation}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                <strong className="font-medium text-slate-700 dark:text-slate-300">
                                  Impact:{' '}
                                </strong>
                                {anchoredFinding.impactSummary}
                              </p>
                            </div>

                            {/* Before -> After Suggested Fix Preview */}
                            {anchoredFinding.suggestedReplacement !== null && (
                              <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden font-mono text-xs">
                                <div className="px-3 py-1 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-700 text-[11px] font-sans font-medium text-slate-500 dark:text-slate-400">
                                  Suggested Fix Preview
                                </div>
                                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                  <pre className="px-3 py-2 bg-rose-50/80 dark:bg-rose-950/40 text-[#7F1D1D] dark:text-rose-200 overflow-x-auto whitespace-pre">
                                    {anchoredFinding.originalSnippet
                                      .split('\n')
                                      .map((l) => `- ${l}`)
                                      .join('\n')}
                                  </pre>
                                  <pre className="px-3 py-2 bg-emerald-50/80 dark:bg-emerald-950/40 text-[#14532D] dark:text-emerald-200 overflow-x-auto whitespace-pre">
                                    {anchoredFinding.suggestedReplacement === ''
                                      ? '+ (remove unreachable statement)'
                                      : anchoredFinding.suggestedReplacement
                                          .split('\n')
                                          .map((l) => `+ ${l}`)
                                          .join('\n')}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* Action Footer */}
                            <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {anchoredFinding.canAutoFix &&
                                  anchoredFinding.suggestedReplacement !== null && (
                                    <button
                                      type="button"
                                      disabled={popResolved}
                                      onClick={() => onApplyFix(anchoredFinding)}
                                      aria-keyshortcuts="f"
                                      title="Apply fix to line (f)"
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-600 dark:disabled:text-slate-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>
                                        {popResolved ? 'Fix Applied' : 'Apply Fix to Line'}
                                      </span>
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  onClick={() => handleJumpToEditLine(anchoredFinding.line)}
                                  aria-keyshortcuts="e"
                                  title="Edit this line manually (e)"
                                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Edit Line Manually</span>
                                </button>
                              </div>

                              {/* Prev / Next Bug Navigation */}
                              {findings.length > 1 && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const prevId = getAdjacentFindingId(
                                        findings,
                                        activeFindingId,
                                        'prev'
                                      );
                                      if (prevId) onSelectFinding(prevId);
                                    }}
                                    aria-keyshortcuts="p k ArrowUp ArrowLeft"
                                    title="Previous bug (p or ↑)"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Prev</span>
                                  </button>
                                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 px-1">
                                    {activeIndex + 1}/{findings.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextId = getAdjacentFindingId(
                                        findings,
                                        activeFindingId,
                                        'next'
                                      );
                                      if (nextId) onSelectFinding(nextId);
                                    }}
                                    aria-keyshortcuts="n j ArrowDown ArrowRight"
                                    title="Next bug (n or ↓)"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                                  >
                                    <span>Next</span>
                                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Attached Voice Notes Recorder & Playback */}
                            <VoiceNoteRecorder
                              findingId={anchoredFinding.id}
                              filename={filename}
                              line={anchoredFinding.line}
                              bugTitle={anchoredFinding.title}
                              notes={voiceNotes.filter(
                                (n) => n.findingId === anchoredFinding.id
                              )}
                              onAddNote={onAddVoiceNote}
                              onUpdateNote={onUpdateVoiceNote}
                              onDeleteNote={onDeleteVoiceNote}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Mode 2: Clean Line-Numbered Editor for Pasting & Direct Edits */
        <div className="relative flex min-h-[340px] max-h-[540px] overflow-hidden">
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="select-none bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-100 dark:border-slate-800 py-3 px-2.5 text-right font-mono text-xs leading-6 text-slate-400 dark:text-slate-500 tabular-nums overflow-hidden shrink-0 w-12"
          >
            {Array.from({ length: Math.max(lineCount, 14) }, (_, idx) => {
              const num = idx + 1;
              const flagged = findingsByLine.get(num)?.[0];
              const style = flagged ? CATEGORY_STYLES[flagged.category] : null;
              return (
                <div key={num} className={style ? style.gutterText : undefined}>
                  {num}
                </div>
              );
            })}
          </div>
          <textarea
            ref={textareaRef}
            id="source-code-editor"
            value={sourceCode}
            onChange={(e) => onChangeSourceCode(e.target.value)}
            onScroll={(e) => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            spellCheck={false}
            placeholder="Paste or type your program here, or drop a file from your computer..."
            aria-label="Source code editor"
            className="code-editor code-scroll flex-1 w-full resize-none bg-white dark:bg-[#0F172A] px-3.5 py-3 font-mono text-[13px] leading-6 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[#2563EB]/25 dark:focus:ring-blue-400/30 overflow-auto whitespace-pre"
          />
        </div>
      )}
    </section>
  );
}
