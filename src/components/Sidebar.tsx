import { useRef } from 'react';
import {
  Check,
  AlertTriangle,
  X,
  Upload,
  Circle,
  Loader2,
} from 'lucide-react';
import type { AnalysisResponse, DemoCase } from '../types/autopatch';

interface SidebarProps {
  demoCases: DemoCase[];
  activeDemoId: string | null;
  onSelectDemo: (demo: DemoCase) => void;
  onUploadSource: (filename: string, content: string) => void;
  onUploadTest: (filename: string, content: string) => void;
  analysis: AnalysisResponse | null;
  isRunning: boolean;
  decisionRecorded: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

type StageStatus = 'idle' | 'running' | 'passed' | 'warning' | 'blocked';

interface PipelineStage {
  step: string;
  label: string;
  status: StageStatus;
  detail: string;
}

const UNIVERSAL_CODE_ACCEPT =
  '.py,.js,.mjs,.cjs,.jsx,.ts,.tsx,.mts,.c,.h,.cpp,.cc,.cxx,.hpp,.java,.go,.rs,.cs,.php,.rb,.sh,.bash,.sql,.kt,.swift,.scala,.dart,.lua,.r,.pl,.txt';

function derivePipelineStages(
  analysis: AnalysisResponse | null,
  isRunning: boolean,
  decisionRecorded: boolean
): PipelineStage[] {
  if (isRunning) {
    return [
      { step: '01', label: 'Detect & Parse', status: 'running', detail: 'Analyzing AST / CFG' },
      { step: '02', label: 'Diagnose & Root-Cause', status: 'running', detail: 'Running baseline suite' },
      { step: '03', label: 'Safe Patch Generator', status: 'idle', detail: 'Waiting' },
      { step: '04', label: 'Sandbox Validation', status: 'idle', detail: 'Waiting' },
      { step: '05', label: 'Audit & Diff Review', status: 'idle', detail: 'Waiting' },
    ];
  }

  if (!analysis) {
    return [
      { step: '01', label: 'Detect & Parse', status: 'idle', detail: 'AST, CFG & Taint scan' },
      { step: '02', label: 'Diagnose & Root-Cause', status: 'idle', detail: 'Isolated sandbox / static' },
      { step: '03', label: 'Safe Patch Generator', status: 'idle', detail: 'Template & Mutation APR' },
      { step: '04', label: 'Sandbox Validation', status: 'idle', detail: '2.0s timeout verifier' },
      { step: '05', label: 'Audit & Diff Review', status: 'idle', detail: 'Human approval gate' },
    ];
  }

  const astFindings = analysis.astReport.findings.length;
  const stage1: PipelineStage = {
    step: '01',
    label: 'Detect & Parse',
    status: astFindings > 0 ? 'warning' : 'passed',
    detail: `${astFindings} finding${astFindings === 1 ? '' : 's'} · ${analysis.astReport.durationMs.toFixed(1)}ms`,
  };

  const stage2: PipelineStage = {
    step: '02',
    label: 'Diagnose & Root-Cause',
    status: analysis.baseline.failed > 0 || analysis.baseline.timedOut ? 'warning' : 'passed',
    detail: analysis.baseline.timedOut
      ? `Timeout · ${analysis.baseline.durationMs.toFixed(0)}ms`
      : `${analysis.baseline.passed}/${analysis.baseline.total} pass · ${analysis.baseline.durationMs.toFixed(0)}ms`,
  };

  const stage3: PipelineStage = {
    step: '03',
    label: 'Safe Patch Generator',
    status: analysis.patchInfo.patchApplied
      ? 'passed'
      : analysis.trustVerdict === 'already_passing'
      ? 'passed'
      : 'blocked',
    detail: analysis.patchInfo.patchApplied
      ? `+${analysis.diff.linesAdded} -${analysis.diff.linesRemoved} lines`
      : analysis.trustVerdict === 'already_passing'
      ? 'No fix needed'
      : 'Manual review needed',
  };

  const stage4: PipelineStage = {
    step: '04',
    label: 'Sandbox Validation',
    status:
      analysis.trustVerdict === 'verified' || analysis.trustVerdict === 'already_passing'
        ? 'passed'
        : 'blocked',
    detail: analysis.sandbox.timedOut
      ? 'Blocked (timeout)'
      : `${analysis.sandbox.passed}/${analysis.sandbox.total} pass · ${analysis.sandbox.durationMs.toFixed(0)}ms`,
  };

  const stage5: PipelineStage = {
    step: '05',
    label: 'Audit & Diff Review',
    status: decisionRecorded ? 'passed' : analysis.trustVerdict === 'blocked' ? 'blocked' : 'warning',
    detail: decisionRecorded
      ? 'Logged in audit ledger'
      : analysis.trustVerdict === 'blocked'
      ? 'Human override or edit'
      : 'Awaiting decision',
  };

  return [stage1, stage2, stage3, stage4, stage5];
}

export function Sidebar({
  demoCases,
  activeDemoId,
  onSelectDemo,
  onUploadSource,
  onUploadTest,
  analysis,
  isRunning,
  decisionRecorded,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const testInputRef = useRef<HTMLInputElement>(null);

  const stages = derivePipelineStages(analysis, isRunning, decisionRecorded);

  const handleFileRead = (
    file: File | undefined,
    cb: (filename: string, content: string) => void
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        cb(file.name, reader.result);
      }
    };
    reader.readAsText(file);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 w-[268px] shrink-0 overflow-y-auto">
      {/* Section 1: Golden Demo Cases */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Golden Demo Cases
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {demoCases.length}
          </span>
        </div>

        <div className="space-y-1">
          {demoCases.map((demo) => {
            const isSelected = activeDemoId === demo.id;
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => {
                  onSelectDemo(demo);
                  onCloseMobile();
                }}
                aria-pressed={isSelected}
                className={`w-full text-left px-3 py-2.5 rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{demo.title}</span>
                  {demo.expectedOutcome === 'blocked-review' && (
                    <span className="text-[11px] font-medium text-[#B45309] dark:text-amber-400 shrink-0">
                      Gate
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                  <span className="font-mono truncate">{demo.filename}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{demo.category}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Upload Custom Source / Test Files (Any Language) */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-display text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400 mb-3">
          Load Local Files (Any Language)
        </h2>

        <input
          ref={sourceInputRef}
          type="file"
          accept={UNIVERSAL_CODE_ACCEPT}
          className="sr-only"
          aria-label="Upload source code file"
          onChange={(e) => {
            handleFileRead(e.target.files?.[0], onUploadSource);
            e.target.value = '';
          }}
        />
        <input
          ref={testInputRef}
          type="file"
          accept={UNIVERSAL_CODE_ACCEPT}
          className="sr-only"
          aria-label="Upload unit test suite file"
          onChange={(e) => {
            handleFileRead(e.target.files?.[0], onUploadTest);
            e.target.value = '';
          }}
        />

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => sourceInputRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 rounded-md transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Upload Source File</span>
          </button>
          <button
            type="button"
            onClick={() => testInputRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 rounded-md transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Upload Test Suite</span>
          </button>
        </div>
      </div>

      {/* Section 3: 5-Stage Pipeline Execution Rail */}
      <div className="p-4 flex-1">
        <h2 className="font-display text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400 mb-3">
          Trust Pipeline Stages
        </h2>
        <ol className="space-y-3">
          {stages.map((stage) => (
            <li key={stage.step} className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {stage.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-[#2563EB] dark:text-blue-400 animate-spin" aria-hidden="true" />
                )}
                {stage.status === 'passed' && (
                  <Check className="w-4 h-4 text-[#15803D] dark:text-emerald-400" aria-hidden="true" />
                )}
                {stage.status === 'warning' && (
                  <AlertTriangle className="w-4 h-4 text-[#B45309] dark:text-amber-400" aria-hidden="true" />
                )}
                {stage.status === 'blocked' && (
                  <X className="w-4 h-4 text-[#B91C1C] dark:text-rose-400" aria-hidden="true" />
                )}
                {stage.status === 'idle' && (
                  <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mt-0.5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                    {stage.step}.
                  </span>
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {stage.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate mt-0.5">
                  {stage.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside aria-label="Demo cases and pipeline stages" className="hidden lg:block shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Mobile workspace navigation"
            className="relative z-50 flex flex-col h-full bg-white dark:bg-[#111827] shadow-xl"
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Workspace
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation drawer"
                className="inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
