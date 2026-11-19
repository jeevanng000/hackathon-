import {
  Radar,
  Bug,
  ShieldCheck,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { AnalysisResponse, AuditDecision } from '../types/autopatch';
import {
  deriveWorkflowLifecycleSteps,
  type LifecycleStageId,
  type LifecycleStep,
} from '../utils/workflowStepper';

interface WorkflowStepperProps {
  analysis: AnalysisResponse | null;
  isRunning: boolean;
  isValidating: boolean;
  findingsCount: number;
  resolvedCount: number;
  hasLocalEdits: boolean;
  activeDecision: AuditDecision | null;
  auditCount: number;
  onTriggerAnalysis: () => void;
  onFocusInspection: () => void;
  onOpenVerification: () => void;
  onOpenAudit: () => void;
}

const STAGE_ICONS: Record<LifecycleStageId, typeof Radar> = {
  analysis: Radar,
  inspection: Bug,
  verification: ShieldCheck,
  audit: ClipboardCheck,
};

function getStepClasses(step: LifecycleStep): {
  card: string;
  badge: string;
  title: string;
  detail: string;
} {
  switch (step.state) {
    case 'completed':
      return {
        card: 'bg-emerald-50/55 dark:bg-emerald-950/20 border-emerald-200/90 dark:border-emerald-900/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/35',
        badge:
          'bg-emerald-100 dark:bg-emerald-950/80 text-[#15803D] dark:text-emerald-300',
        title: 'text-slate-950 dark:text-slate-50',
        detail: 'text-[#15803D] dark:text-emerald-400',
      };
    case 'active':
      return {
        card: 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/45',
        badge: 'bg-[#2563EB] dark:bg-blue-600 text-white',
        title: 'text-slate-950 dark:text-slate-50',
        detail: 'text-[#1D4ED8] dark:text-blue-300',
      };
    case 'attention':
      return {
        card: 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40',
        badge:
          'bg-amber-100 dark:bg-amber-950/80 text-[#B45309] dark:text-amber-300',
        title: 'text-slate-950 dark:text-slate-50',
        detail: 'text-[#B45309] dark:text-amber-300',
      };
    default:
      return {
        card: 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-800/50',
        badge:
          'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
        title: 'text-slate-700 dark:text-slate-300',
        detail: 'text-slate-500 dark:text-slate-400',
      };
  }
}

export function WorkflowStepper({
  analysis,
  isRunning,
  isValidating,
  findingsCount,
  resolvedCount,
  hasLocalEdits,
  activeDecision,
  auditCount,
  onTriggerAnalysis,
  onFocusInspection,
  onOpenVerification,
  onOpenAudit,
}: WorkflowStepperProps) {
  const steps = deriveWorkflowLifecycleSteps({
    analysis,
    isRunning,
    isValidating,
    findingsCount,
    resolvedCount,
    hasLocalEdits,
    activeDecision,
    auditCount,
  });

  const handleStageClick = (id: LifecycleStageId) => {
    if (id === 'analysis') {
      if (!analysis) {
        onTriggerAnalysis();
      } else {
        onFocusInspection();
      }
      return;
    }
    if (id === 'inspection') {
      onFocusInspection();
      return;
    }
    if (id === 'verification') {
      onOpenVerification();
      return;
    }
    onOpenAudit();
  };

  const completedCount = steps.filter((s) => s.state === 'completed').length;

  return (
    <section
      aria-label="Bug lifecycle progress"
      className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <h2 className="font-display font-semibold text-slate-900 dark:text-slate-100">
            Bug Lifecycle Workflow
          </h2>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            Analysis &rarr; Inspection &rarr; Verification &rarr; Audit
          </span>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {completedCount}/4 stages complete
        </span>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {steps.map((step, idx) => {
          const cls = getStepClasses(step);
          const StageIcon = STAGE_ICONS[step.id];

          return (
            <li key={step.id} className="relative flex items-stretch">
              <button
                type="button"
                disabled={!step.enabled}
                onClick={() => handleStageClick(step.id)}
                aria-current={step.state === 'active' ? 'step' : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors flex flex-col justify-between gap-1.5 ${
                  cls.card
                } ${
                  step.enabled
                    ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB]'
                    : 'opacity-65 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded font-mono text-[11px] font-semibold tabular-nums shrink-0 ${cls.badge}`}
                    >
                      {step.state === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : step.state === 'attention' ? (
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        step.stepNumber
                      )}
                    </span>
                    <span
                      className={`font-display text-xs font-semibold truncate ${cls.title}`}
                    >
                      {step.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <StageIcon
                      className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                      aria-hidden="true"
                    />
                    {idx < steps.length - 1 && (
                      <ChevronRight
                        className="hidden lg:block w-3.5 h-3.5 text-slate-300 dark:text-slate-600"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-0.5 pl-8">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {step.description}
                  </p>
                  <p className={`text-[11px] font-medium truncate ${cls.detail}`}>
                    {step.statusDetail}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
