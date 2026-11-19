import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { DEMO_CASES } from './data/demoCases';
import type {
  AnalysisResponse,
  AutoPatchBug,
  AutoPatchReport,
  DemoCase,
  SafeChangeHistoryEntry,
  SafePatchDecision,
  WorkflowStageId,
} from './types/autopatch';
import {
  adaptDeterministicAnalysisToReport,
  applyPatchToCode,
  createHistoryEntry,
  getAdjacentBugId,
  validateSubmissionInput,
} from './utils/autopatchWorkflow';
import { detectLanguageFromFilename } from './utils/languageDetect';
import { isEditableTargetElement } from './utils/unifiedFindings';
import { AuroraBackdrop } from './components/AuroraBackdrop';
import { TopBar, type MainScreen } from './components/TopBar';
import { WelcomeHeroInput } from './components/WelcomeHeroInput';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { BugGlassModal } from './components/BugGlassModal';
import { DebuggingDock } from './components/DebuggingDock';
import { SafeChangeHistoryView } from './components/SafeChangeHistoryView';

const HISTORY_STORAGE_KEY = 'autopatch.safeHistory.v1';
const THEME_STORAGE_KEY = 'autopatch.theme.v1';

function loadStoredHistory(): SafeChangeHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SafeChangeHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function loadInitialTheme(): boolean {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => loadInitialTheme());
  const [activeScreen, setActiveScreen] = useState<MainScreen>('workspace');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [filename, setFilename] = useState('snippet.py');
  const [sourceCode, setSourceCode] = useState('');
  const [testCode, setTestCode] = useState('');
  const [errorStatement, setErrorStatement] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentStage, setCurrentStage] = useState<WorkflowStageId>(1);
  const [report, setReport] = useState<AutoPatchReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [activeBugId, setActiveBugId] = useState<string | null>(null);
  const [modalBugId, setModalBugId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SafePatchDecision>>({});
  const [dockExpanded, setDockExpanded] = useState(false);

  const [historyEntries, setHistoryEntries] = useState<SafeChangeHistoryEntry[]>(() =>
    loadStoredHistory()
  );

  const stageTimersRef = useRef<number[]>([]);
  const autostartTriggeredRef = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
    } catch {
      // Ignore storage errors
    }
  }, [historyEntries]);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (active && typeof data?.geminiConfigured === 'boolean') {
          setGeminiConfigured(data.geminiConfigured);
        }
      })
      .catch(() => {
        if (active) setGeminiConfigured(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearStageTimers = useCallback(() => {
    for (const t of stageTimersRef.current) {
      window.clearTimeout(t);
    }
    stageTimersRef.current = [];
  }, []);

  useEffect(() => () => clearStageTimers(), [clearStageTimers]);

  const executeScan = useCallback(
    async (params: {
      mode: 'gemini' | 'local-sandbox';
      codeOverride?: string;
      errOverride?: string;
      filenameOverride?: string;
      testCodeOverride?: string;
    }) => {
      const codeVal = params.codeOverride ?? sourceCode;
      const errVal = params.errOverride ?? errorStatement;
      const fileVal = params.filenameOverride ?? filename;
      const testVal = params.testCodeOverride ?? testCode;

      const check = validateSubmissionInput(codeVal.trim() || errVal.trim());
      if (!check.valid) {
        setValidationError(check.error ?? 'Input required.');
        return;
      }

      setValidationError(null);
      setActiveScreen('workspace');
      setHasSubmitted(true);
      setIsScanning(true);
      setErrorMessage(null);
      setErrorCode(null);
      setReport(null);
      setModalBugId(null);
      setActiveBugId(null);
      setDecisions({});

      clearStageTimers();
      setCurrentStage(2);
      stageTimersRef.current.push(
        window.setTimeout(() => setCurrentStage(3), 260),
        window.setTimeout(() => setCurrentStage(4), 560),
        window.setTimeout(() => setCurrentStage(5), 880)
      );

      const safeName = fileVal.trim() || 'snippet.py';
      const lang = detectLanguageFromFilename(safeName);

      try {
        let nextReport: AutoPatchReport;

        if (params.mode === 'gemini') {
          const res = await fetch('/api/autopatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceCode: codeVal,
              errorStatement: errVal,
              filename: safeName,
              language: lang,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            const err = new Error(data.error || 'Gemini scan failed.') as Error & {
              code?: string;
            };
            err.code = data.code;
            throw err;
          }
          nextReport = data as AutoPatchReport;
        } else {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: safeName,
              testFilename: `test_${safeName}`,
              language: lang,
              sourceCode: codeVal,
              testCode: testVal,
              bugContext: errVal,
              includeAiScan: false,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Local sandbox analysis failed.');
          }
          nextReport = adaptDeterministicAnalysisToReport(data as AnalysisResponse);
        }

        clearStageTimers();
        setCurrentStage(5);
        setReport(nextReport);
        const firstBugId = nextReport.bugs[0]?.id ?? null;
        setActiveBugId(firstBugId);
        if (firstBugId) {
          setModalBugId(firstBugId);
        }
      } catch (err) {
        clearStageTimers();
        const typedErr = err as Error & { code?: string };
        setErrorMessage(typedErr.message || 'Unable to run AutoPatch workflow.');
        setErrorCode(typedErr.code ?? null);
      } finally {
        setIsScanning(false);
      }
    },
    [clearStageTimers, errorStatement, filename, sourceCode, testCode]
  );

  // Support ?autostart=1 for automated workspace checks
  useEffect(() => {
    if (autostartTriggeredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      autostartTriggeredRef.current = true;
      const demo = DEMO_CASES[0];
      setFilename(demo.filename);
      setSourceCode(demo.sourceCode);
      setTestCode(demo.testCode);
      setErrorStatement(demo.bugContext ?? '');
      void executeScan({
        mode: geminiConfigured ? 'gemini' : 'local-sandbox',
        codeOverride: demo.sourceCode,
        errOverride: demo.bugContext ?? '',
        filenameOverride: demo.filename,
        testCodeOverride: demo.testCode,
      });
    }
  }, [executeScan, geminiConfigured]);

  const handleSelectPreset = (preset: DemoCase) => {
    setValidationError(null);
    setFilename(preset.filename);
    setSourceCode(preset.sourceCode);
    setTestCode(preset.testCode);
    setErrorStatement(preset.bugContext ?? '');
  };

  const handleResetToWelcome = () => {
    clearStageTimers();
    setActiveScreen('workspace');
    setHasSubmitted(false);
    setIsScanning(false);
    setCurrentStage(1);
    setReport(null);
    setErrorMessage(null);
    setErrorCode(null);
    setActiveBugId(null);
    setModalBugId(null);
    setDecisions({});
    setValidationError(null);
    setDockExpanded(false);
  };

  const handleAcceptPatch = (bug: AutoPatchBug) => {
    if (decisions[bug.id] === 'Accepted') {
      setModalBugId(null);
      return;
    }
    const { updatedCode } = applyPatchToCode(sourceCode, bug);
    setSourceCode(updatedCode);
    setDecisions((prev) => ({ ...prev, [bug.id]: 'Accepted' }));

    const entry = createHistoryEntry({
      bug,
      decision: 'Accepted',
      filename: filename || 'snippet.py',
      executionSource: report?.execution_source ?? 'gemini',
    });
    setHistoryEntries((prev) => [entry, ...prev]);
    setModalBugId(null);
  };

  const handleRejectPatch = (bug: AutoPatchBug) => {
    setDecisions((prev) => ({ ...prev, [bug.id]: 'Rejected' }));
    const entry = createHistoryEntry({
      bug,
      decision: 'Rejected',
      filename: filename || 'snippet.py',
      executionSource: report?.execution_source ?? 'gemini',
    });
    setHistoryEntries((prev) => [entry, ...prev]);
    setModalBugId(null);
  };

  const bugs = useMemo(() => report?.bugs ?? [], [report]);
  const modalBug = useMemo(
    () => bugs.find((b) => b.id === modalBugId) ?? null,
    [bugs, modalBugId]
  );
  const modalBugIndex = useMemo(
    () => (modalBug ? bugs.findIndex((b) => b.id === modalBug.id) : -1),
    [bugs, modalBug]
  );

  // Power-user keyboard navigation for detected bugs
  useEffect(() => {
    if (!hasSubmitted || activeScreen !== 'workspace' || bugs.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTargetElement(e.target as HTMLElement | null)) return;

      if (e.key === 'n' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextId = getAdjacentBugId(bugs, modalBugId ?? activeBugId, 'next');
        if (nextId) {
          setActiveBugId(nextId);
          if (modalBugId) setModalBugId(nextId);
        }
      } else if (e.key === 'p' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevId = getAdjacentBugId(bugs, modalBugId ?? activeBugId, 'prev');
        if (prevId) {
          setActiveBugId(prevId);
          if (modalBugId) setModalBugId(prevId);
        }
      } else if (e.key === 'Enter' && !modalBugId && activeBugId) {
        e.preventDefault();
        setModalBugId(activeBugId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBugId, activeScreen, bugs, hasSubmitted, modalBugId]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen flex flex-col overflow-x-hidden text-slate-900 dark:text-slate-100">
        <AuroraBackdrop />

        <TopBar
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
          hasStartedWorkspace={hasSubmitted}
          onResetToWelcome={handleResetToWelcome}
          historyCount={historyEntries.length}
          isDark={isDark}
          onToggleTheme={() => setIsDark((prev) => !prev)}
        />

        <main className="flex-1 w-full">
          <AnimatePresence mode="wait" initial={false}>
            {activeScreen === 'history' ? (
              <motion.div
                key="history-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <SafeChangeHistoryView
                  entries={historyEntries}
                  onClearHistory={() => setHistoryEntries([])}
                  onBackToWorkspace={() => setActiveScreen('workspace')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="workspace-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-7 pb-28 space-y-6"
              >
                <WelcomeHeroInput
                  filename={filename}
                  sourceCode={sourceCode}
                  errorStatement={errorStatement}
                  presets={DEMO_CASES}
                  isCompact={hasSubmitted}
                  isScanning={isScanning}
                  geminiConfigured={geminiConfigured}
                  validationError={validationError}
                  onChangeFilename={setFilename}
                  onChangeSourceCode={(next) => {
                    setSourceCode(next);
                    if (validationError) setValidationError(null);
                  }}
                  onChangeErrorStatement={setErrorStatement}
                  onSelectPreset={handleSelectPreset}
                  onSubmitScan={(mode) => void executeScan({ mode })}
                />

                {hasSubmitted && (
                  <WorkspaceDashboard
                    filename={filename}
                    sourceCode={sourceCode}
                    report={report}
                    activeBugId={activeBugId}
                    decisions={decisions}
                    isScanning={isScanning}
                    currentStage={currentStage}
                    errorMessage={errorMessage}
                    errorCode={errorCode}
                    onSelectBug={(id) => {
                      setActiveBugId(id);
                      setModalBugId(id);
                    }}
                    onRunLocalSandboxFallback={() =>
                      void executeScan({ mode: 'local-sandbox' })
                    }
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Glassmorphism Error Pop-Up */}
        <BugGlassModal
          bug={modalBug}
          bugsCount={bugs.length}
          currentIndex={modalBugIndex}
          decision={modalBug ? decisions[modalBug.id] : undefined}
          onClose={() => setModalBugId(null)}
          onNavigate={(dir) => {
            const nextId = getAdjacentBugId(bugs, modalBugId, dir);
            if (nextId) {
              setActiveBugId(nextId);
              setModalBugId(nextId);
            }
          }}
          onAcceptPatch={handleAcceptPatch}
          onRejectPatch={handleRejectPatch}
        />

        {/* Lower-Mid Debugging Dock */}
        <DebuggingDock
          visible={hasSubmitted && activeScreen === 'workspace'}
          expanded={dockExpanded}
          onToggleExpand={() => setDockExpanded((prev) => !prev)}
          isScanning={isScanning}
          currentStage={currentStage}
          report={report}
          decisions={decisions}
          errorMessage={errorMessage}
          onSelectBug={(id) => {
            setActiveBugId(id);
            setModalBugId(id);
          }}
        />
      </div>
    </MotionConfig>
  );
}
