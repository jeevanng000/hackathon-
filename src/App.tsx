import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { DEMO_CASES } from './data/demoCases';
import type {
  AnalysisResponse,
  AppView,
  AuditDecision,
  AuditEntry,
  DashboardTab,
  DemoCase,
  ExplanationMode,
  UnifiedBugFinding,
  VoiceNote,
} from './types/autopatch';
import { buildAuditEntry } from './utils/diffAndAudit';
import {
  detectLanguageFromFilename,
  type SupportedLanguage,
} from './utils/languageDetect';
import {
  applyAllSafeFixesToSource,
  applyFindingFixToSource,
  buildUnifiedFindings,
} from './utils/unifiedFindings';
import { VIEW_TRANSITION } from './utils/motionPresets';
import { AuroraBackdrop } from './components/AuroraBackdrop';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { WorkbenchView } from './components/WorkbenchView';
import type { CodeStageMode } from './components/BugCodeStage';
import { ProjectsView } from './components/ProjectsView';
import { AuditLedgerView } from './components/AuditLedgerView';

const AUDIT_STORAGE_KEY = 'autopatch.auditLedger.v1';
const VOICE_NOTES_STORAGE_KEY = 'autopatch.voiceNotes.v1';

function loadStoredAuditEntries(): AuditEntry[] {
  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function loadStoredVoiceNotes(): VoiceNote[] {
  try {
    const raw = window.localStorage.getItem(VOICE_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VoiceNote[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialDemo = DEMO_CASES[0];

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('inspector');
  const [activeDemoId, setActiveDemoId] = useState<string | null>(initialDemo.id);
  const [selectedLanguage, setSelectedLanguage] = useState<'auto' | SupportedLanguage>('auto');
  const [filename, setFilename] = useState(initialDemo.filename);
  const [testFilename, setTestFilename] = useState(initialDemo.testFilename);
  const [sourceCode, setSourceCode] = useState(initialDemo.sourceCode);
  const [testCode, setTestCode] = useState(initialDemo.testCode);
  const [bugContext, setBugContext] = useState(initialDemo.bugContext ?? '');
  const [caseDescription, setCaseDescription] = useState(initialDemo.description);

  const [explanationMode, setExplanationMode] = useState<ExplanationMode>('plain');
  const [stageMode, setStageMode] = useState<CodeStageMode>('inspect');

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [unifiedFindings, setUnifiedFindings] = useState<UnifiedBugFinding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [resolvedFindingIds, setResolvedFindingIds] = useState<Set<string>>(() => new Set());
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  const [activeDecision, setActiveDecision] = useState<AuditDecision | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isValidatingManual, setIsValidatingManual] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() =>
    loadStoredAuditEntries()
  );
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>(() =>
    loadStoredVoiceNotes()
  );

  const resolvedLanguage: SupportedLanguage =
    selectedLanguage === 'auto'
      ? detectLanguageFromFilename(filename)
      : selectedLanguage;

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditEntries));
    } catch {
      // Ignore storage quota errors
    }
  }, [auditEntries]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_NOTES_STORAGE_KEY, JSON.stringify(voiceNotes));
    } catch {
      // Ignore storage quota errors
    }
  }, [voiceNotes]);

  const handleAddVoiceNote = (note: VoiceNote) => {
    setVoiceNotes((prev) => [note, ...prev]);
  };

  const handleUpdateVoiceNote = (noteId: string, patch: Partial<VoiceNote>) => {
    setVoiceNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n))
    );
  };

  const handleDeleteVoiceNote = (noteId: string) => {
    setVoiceNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const resetInspectionState = (nextStageMode: CodeStageMode = 'inspect') => {
    setAnalysis(null);
    setUnifiedFindings([]);
    setActiveFindingId(null);
    setResolvedFindingIds(new Set());
    setUndoStack([]);
    setHasLocalEdits(false);
    setActiveDecision(null);
    setErrorMessage(null);
    setStageMode(nextStageMode);
    setDashboardTab('inspector');
  };

  const handleSelectDemo = (demo: DemoCase = DEMO_CASES[0]) => {
    setActiveDemoId(demo.id);
    setSelectedLanguage('auto');
    setFilename(demo.filename);
    setTestFilename(demo.testFilename);
    setSourceCode(demo.sourceCode);
    setTestCode(demo.testCode);
    setBugContext(demo.bugContext ?? '');
    setCaseDescription(demo.description);
    resetInspectionState('inspect');
    setActiveView('dashboard');
  };

  const handleStartBlank = () => {
    setActiveDemoId(null);
    setSelectedLanguage('auto');
    setFilename('snippet.py');
    setTestFilename('test_snippet.py');
    setSourceCode('');
    setTestCode('');
    setBugContext('');
    setCaseDescription('Paste or drop any program file, then click Scan & Find Bugs.');
    resetInspectionState('edit');
    setActiveView('dashboard');
  };

  const handleResetDemo = () => {
    const currentDemo = DEMO_CASES.find((d) => d.id === activeDemoId);
    if (currentDemo) {
      handleSelectDemo(currentDemo);
    }
  };

  const handleUploadSource = (uploadedName: string, content: string) => {
    setActiveDemoId(null);
    setSelectedLanguage('auto');
    setFilename(uploadedName);
    setTestFilename(`test_${uploadedName}`);
    setSourceCode(content);
    setTestCode('');
    setBugContext('');
    setCaseDescription(`Custom uploaded source file (${uploadedName}).`);
    resetInspectionState('inspect');
    setActiveView('dashboard');
  };

  const handleUploadTest = (uploadedName: string, content: string) => {
    setTestFilename(uploadedName);
    setTestCode(content);
    setAnalysis(null);
    setActiveDecision(null);
    setErrorMessage(null);
  };

  const handleEditSourceDirectly = (nextCode: string) => {
    setSourceCode(nextCode);
    if (analysis) {
      setHasLocalEdits(true);
    }
  };

  const handleRunAnalysis = async () => {
    setErrorMessage(null);
    if (!sourceCode.trim()) {
      setErrorMessage('Paste or upload a program before running a bug scan.');
      setActiveView('dashboard');
      setDashboardTab('inspector');
      setStageMode('edit');
      return;
    }

    setIsRunning(true);
    setActiveDecision(null);
    setActiveView('dashboard');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          testFilename,
          language: resolvedLanguage,
          sourceCode,
          testCode,
          bugContext,
          includeAiScan: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed.');
      }

      const typed = data as AnalysisResponse;
      const findings = typed.unifiedFindings ?? buildUnifiedFindings(typed, []);

      setAnalysis(typed);
      setUnifiedFindings(findings);
      setResolvedFindingIds(new Set());
      setUndoStack([]);
      setHasLocalEdits(false);
      setStageMode('inspect');
      setDashboardTab('inspector');
      setActiveFindingId(findings[0]?.id ?? null);

      if (!testCode.trim() && typed.generatedTestCode) {
        setTestCode(typed.generatedTestCode);
      }

      if (typed.trustVerdict === 'blocked') {
        const fileNotes = voiceNotes.filter((n) => n.filename === typed.filename);
        const blockedRecord = buildAuditEntry({
          analysis: typed,
          decision: 'blocked',
          voiceNotes: fileNotes,
        });
        setAuditEntries((prev) => [blockedRecord, ...prev]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to reach AutoPatch analysis engine.'
      );
      setActiveView('dashboard');
    } finally {
      setIsRunning(false);
    }
  };

  const handleApplyFix = (finding: UnifiedBugFinding) => {
    if (!finding.canAutoFix || finding.suggestedReplacement === null) return;
    const prevLinesCount = finding.endLine - finding.line + 1;
    const nextLinesCount =
      finding.suggestedReplacement === ''
        ? 0
        : finding.suggestedReplacement.split('\n').length;
    const lineDelta = nextLinesCount - prevLinesCount;

    const updated = applyFindingFixToSource(sourceCode, finding);
    setUndoStack((prev) => [...prev, sourceCode]);
    setSourceCode(updated);
    setHasLocalEdits(true);

    setResolvedFindingIds((prev) => {
      const next = new Set(prev);
      next.add(finding.id);
      return next;
    });

    setUnifiedFindings((prev) =>
      prev.map((item) => {
        if (item.id === finding.id) {
          return {
            ...item,
            endLine: Math.max(item.line, item.line + nextLinesCount - 1),
          };
        }
        if (item.line > finding.endLine && lineDelta !== 0) {
          return {
            ...item,
            line: Math.max(1, item.line + lineDelta),
            endLine: Math.max(1, item.endLine + lineDelta),
          };
        }
        return item;
      })
    );
  };

  const handleApplyAllSafeFixes = () => {
    const remaining = unifiedFindings.filter((f) => !resolvedFindingIds.has(f.id));
    const { updatedCode, appliedIds } = applyAllSafeFixesToSource(sourceCode, remaining);
    if (appliedIds.length === 0) return;

    setUndoStack((prev) => [...prev, sourceCode]);
    setSourceCode(updatedCode);
    setHasLocalEdits(true);
    setResolvedFindingIds((prev) => {
      const next = new Set(prev);
      for (const id of appliedIds) next.add(id);
      return next;
    });
  };

  const handleUndoFix = () => {
    if (undoStack.length === 0) return;
    const previousCode = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setSourceCode(previousCode);
    if (undoStack.length === 1) {
      setResolvedFindingIds(new Set());
      setHasLocalEdits(false);
    }
  };

  const handleVerifyCurrentCode = async () => {
    if (!sourceCode.trim()) return;
    setIsValidatingManual(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          testFilename,
          language: resolvedLanguage,
          sourceCode,
          testCode,
          bugContext,
          includeAiScan: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed.');
      }

      const typed = data as AnalysisResponse;
      const findings = typed.unifiedFindings ?? buildUnifiedFindings(typed, []);
      setAnalysis(typed);
      setUnifiedFindings(findings);
      setResolvedFindingIds(new Set());
      setUndoStack([]);
      setHasLocalEdits(false);
      setActiveFindingId(findings[0]?.id ?? null);
      setActiveDecision(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Sandbox verification failed.'
      );
    } finally {
      setIsValidatingManual(false);
    }
  };

  const handleValidateManualPatch = async (candidateCode: string) => {
    if (!analysis) return;
    setIsValidatingManual(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: analysis.filename,
          testFilename: analysis.testFilename,
          language: analysis.language || resolvedLanguage,
          originalCode: analysis.originalCode,
          candidateCode,
          testCode,
          baseline: analysis.baseline,
          targetLine: analysis.patchInfo.targetLine,
          bugType: analysis.patchInfo.bugType,
          rootCause: analysis.patchInfo.rootCause,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Manual validation failed.');
      }

      const typed = data as AnalysisResponse;
      setAnalysis(typed);
      setUnifiedFindings(typed.unifiedFindings ?? buildUnifiedFindings(typed, []));
      setActiveDecision(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Manual sandbox verification failed.'
      );
    } finally {
      setIsValidatingManual(false);
    }
  };

  const handleAcceptPatch = (overrideReason?: string) => {
    if (!analysis) return;
    const decision: AuditDecision = overrideReason ? 'override' : 'accepted';
    const fileNotes = voiceNotes.filter((n) => n.filename === analysis.filename);
    const entry = buildAuditEntry({
      analysis,
      decision,
      overrideReason,
      voiceNotes: fileNotes,
    });
    setAuditEntries((prev) => [entry, ...prev]);
    setActiveDecision(decision);
    setSourceCode(analysis.patchedCode);
    setHasLocalEdits(false);
  };

  const handleRejectPatch = () => {
    if (!analysis) return;
    const fileNotes = voiceNotes.filter((n) => n.filename === analysis.filename);
    const entry = buildAuditEntry({
      analysis,
      decision: 'rejected',
      voiceNotes: fileNotes,
    });
    setAuditEntries((prev) => [entry, ...prev]);
    setActiveDecision('rejected');
  };

  const handleDownloadPatched = () => {
    if (!analysis) return;
    const blob = new Blob([analysis.patchedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = analysis.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen flex flex-col text-[#F4F7FF]">
        <AuroraBackdrop />

        <TopBar
          activeView={activeView}
          onSelectView={setActiveView}
          onRunAnalysis={handleRunAnalysis}
          isRunning={isRunning}
          auditCount={auditEntries.length}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        />

        <div className="flex flex-1 min-h-0">
          <Sidebar
            demoCases={DEMO_CASES}
            activeDemoId={activeDemoId}
            onSelectDemo={handleSelectDemo}
            onStartBlank={handleStartBlank}
            onUploadSource={handleUploadSource}
            onUploadTest={handleUploadTest}
            analysis={analysis}
            isRunning={isRunning}
            decisionRecorded={activeDecision !== null}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            findings={unifiedFindings}
            activeFindingId={activeFindingId}
            resolvedFindingIds={resolvedFindingIds}
            onSelectFinding={(id) => {
              setActiveFindingId(id);
              setStageMode('inspect');
              setDashboardTab('inspector');
              setActiveView('dashboard');
            }}
          />

          <main className="flex-1 min-w-0 overflow-y-auto">
            {/* Mobile view switcher */}
            <nav
              aria-label="Mobile workspace views"
              className="md:hidden bg-[#0E1529]/80 backdrop-blur-md border-b border-white/10 px-4 py-2 flex items-center gap-2 overflow-x-auto"
            >
              {(
                [
                  { id: 'dashboard', label: 'Dashboard' },
                  { id: 'projects', label: 'Projects' },
                  {
                    id: 'history',
                    label: `History${auditEntries.length > 0 ? ` (${auditEntries.length})` : ''}`,
                  },
                ] as Array<{ id: AppView; label: string }>
              ).map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#8B7CFF] text-white'
                        : 'text-[#A6B0C8] bg-white/5 hover:text-[#F4F7FF]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <AnimatePresence mode="wait" initial={false}>
              {activeView === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={VIEW_TRANSITION}
                >
                  <WorkbenchView
                    filename={filename}
                    testFilename={testFilename}
                    sourceCode={sourceCode}
                    testCode={testCode}
                    bugContext={bugContext}
                    caseDescription={caseDescription}
                    selectedLanguage={selectedLanguage}
                    resolvedLanguage={resolvedLanguage}
                    onChangeLanguage={setSelectedLanguage}
                    onChangeFilename={setFilename}
                    onChangeTestFilename={setTestFilename}
                    onChangeSourceCode={handleEditSourceDirectly}
                    onChangeTestCode={setTestCode}
                    onChangeBugContext={setBugContext}
                    onUploadSource={handleUploadSource}
                    onResetDemo={handleResetDemo}
                    canResetDemo={activeDemoId !== null}
                    analysis={analysis}
                    unifiedFindings={unifiedFindings}
                    activeFindingId={activeFindingId}
                    onSelectFinding={setActiveFindingId}
                    resolvedFindingIds={resolvedFindingIds}
                    onApplyFix={handleApplyFix}
                    onApplyAllSafeFixes={handleApplyAllSafeFixes}
                    onUndoFix={handleUndoFix}
                    canUndoFix={undoStack.length > 0}
                    hasLocalEdits={hasLocalEdits}
                    onVerifyCurrentCode={handleVerifyCurrentCode}
                    isValidating={isValidatingManual}
                    isRunning={isRunning}
                    errorMessage={errorMessage}
                    dashboardTab={dashboardTab}
                    onChangeDashboardTab={setDashboardTab}
                    onOpenProjects={() => setActiveView('projects')}
                    explanationMode={explanationMode}
                    onChangeExplanationMode={setExplanationMode}
                    stageMode={stageMode}
                    onChangeStageMode={setStageMode}
                    voiceNotes={voiceNotes.filter((n) => n.filename === filename)}
                    onAddVoiceNote={handleAddVoiceNote}
                    onUpdateVoiceNote={handleUpdateVoiceNote}
                    onDeleteVoiceNote={handleDeleteVoiceNote}
                    activeDecision={activeDecision}
                    auditCount={auditEntries.length}
                    onRunAnalysis={handleRunAnalysis}
                    onOpenAudit={() => setActiveView('history')}
                    onAcceptPatch={handleAcceptPatch}
                    onRejectPatch={handleRejectPatch}
                    onDownloadPatched={handleDownloadPatched}
                    onValidateManualPatch={handleValidateManualPatch}
                  />
                </motion.div>
              )}

              {activeView === 'projects' && (
                <motion.div
                  key="projects"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={VIEW_TRANSITION}
                >
                  <ProjectsView
                    demoCases={DEMO_CASES}
                    activeDemoId={activeDemoId}
                    currentFilename={filename}
                    onOpenDemoProject={handleSelectDemo}
                    onStartBlank={handleStartBlank}
                    onUploadSource={handleUploadSource}
                    onUploadTest={handleUploadTest}
                    onBackToDashboard={() => setActiveView('dashboard')}
                  />
                </motion.div>
              )}

              {activeView === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={VIEW_TRANSITION}
                >
                  <AuditLedgerView
                    entries={auditEntries}
                    onClearEntries={() => setAuditEntries([])}
                    onGoToWorkbench={() => setActiveView('dashboard')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
