import { useEffect, useState } from 'react';
import { DEMO_CASES } from './data/demoCases';
import type {
  AnalysisResponse,
  AppView,
  AuditDecision,
  AuditEntry,
  DemoCase,
} from './types/autopatch';
import { buildAuditEntry } from './utils/diffAndAudit';
import {
  detectLanguageFromFilename,
  type SupportedLanguage,
} from './utils/languageDetect';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { WorkbenchView } from './components/WorkbenchView';
import { DiffReviewView } from './components/DiffReviewView';
import { AuditLedgerView } from './components/AuditLedgerView';

const AUDIT_STORAGE_KEY = 'autopatch.auditLedger.v1';
const THEME_STORAGE_KEY = 'autopatch.theme.v1';

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

function loadStoredTheme(): 'light' | 'dark' {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage read errors
  }
  return 'light';
}

export default function App() {
  const initialDemo = DEMO_CASES[0];

  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadStoredTheme());
  const [activeView, setActiveView] = useState<AppView>('workbench');
  const [activeDemoId, setActiveDemoId] = useState<string | null>(initialDemo.id);
  const [selectedLanguage, setSelectedLanguage] = useState<'auto' | SupportedLanguage>('auto');
  const [filename, setFilename] = useState(initialDemo.filename);
  const [testFilename, setTestFilename] = useState(initialDemo.testFilename);
  const [sourceCode, setSourceCode] = useState(initialDemo.sourceCode);
  const [testCode, setTestCode] = useState(initialDemo.testCode);
  const [caseDescription, setCaseDescription] = useState(initialDemo.description);

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [activeDecision, setActiveDecision] = useState<AuditDecision | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isValidatingManual, setIsValidatingManual] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() =>
    loadStoredAuditEntries()
  );

  const resolvedLanguage: SupportedLanguage =
    selectedLanguage === 'auto'
      ? detectLanguageFromFilename(filename)
      : selectedLanguage;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditEntries));
    } catch {
      // Ignore storage quota errors
    }
  }, [auditEntries]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleSelectDemo = (demo: DemoCase) => {
    setActiveDemoId(demo.id);
    setSelectedLanguage('auto');
    setFilename(demo.filename);
    setTestFilename(demo.testFilename);
    setSourceCode(demo.sourceCode);
    setTestCode(demo.testCode);
    setCaseDescription(demo.description);
    setAnalysis(null);
    setActiveDecision(null);
    setErrorMessage(null);
    setActiveView('workbench');
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
    setSourceCode(content);
    setCaseDescription(`Custom uploaded source file (${uploadedName}).`);
    setAnalysis(null);
    setActiveDecision(null);
    setErrorMessage(null);
    setActiveView('workbench');
  };

  const handleUploadTest = (uploadedName: string, content: string) => {
    setTestFilename(uploadedName);
    setTestCode(content);
    setAnalysis(null);
    setActiveDecision(null);
    setErrorMessage(null);
  };

  const handleRunAnalysis = async () => {
    setErrorMessage(null);
    if (!sourceCode.trim()) {
      setErrorMessage('Source file cannot be empty.');
      setActiveView('workbench');
      return;
    }
    if (resolvedLanguage === 'python' && !testCode.trim()) {
      setErrorMessage('Unit test suite cannot be empty for Python sandbox execution.');
      setActiveView('workbench');
      return;
    }

    setIsRunning(true);
    setActiveDecision(null);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed.');
      }

      const typed = data as AnalysisResponse;
      setAnalysis(typed);

      // Automatically record blocked trust-gate events in the Audit Ledger for full traceability
      if (typed.trustVerdict === 'blocked') {
        const blockedRecord = buildAuditEntry({
          analysis: typed,
          decision: 'blocked',
        });
        setAuditEntries((prev) => [blockedRecord, ...prev]);
      }

      setActiveView('review');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to reach AutoPatch analysis engine.'
      );
      setActiveView('workbench');
    } finally {
      setIsRunning(false);
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

      setAnalysis(data as AnalysisResponse);
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
    const entry = buildAuditEntry({
      analysis,
      decision,
      overrideReason,
    });
    setAuditEntries((prev) => [entry, ...prev]);
    setActiveDecision(decision);
    // Apply approved patch into active source code buffer (never before explicit approval)
    setSourceCode(analysis.patchedCode);
  };

  const handleRejectPatch = () => {
    if (!analysis) return;
    const entry = buildAuditEntry({
      analysis,
      decision: 'rejected',
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
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-slate-100">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onRunAnalysis={handleRunAnalysis}
        isRunning={isRunning}
        hasAnalysis={analysis !== null}
        auditCount={auditEntries.length}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          demoCases={DEMO_CASES}
          activeDemoId={activeDemoId}
          onSelectDemo={handleSelectDemo}
          onUploadSource={handleUploadSource}
          onUploadTest={handleUploadTest}
          analysis={analysis}
          isRunning={isRunning}
          decisionRecorded={activeDecision !== null}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Mobile non-sticky view switcher (keeps sticky header under 15% viewport cap) */}
          <nav
            aria-label="Mobile workspace views"
            className="md:hidden bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto"
          >
            {(
              [
                { id: 'workbench', label: 'Workbench' },
                { id: 'review', label: 'Diff & Review' },
                {
                  id: 'audit',
                  label: `Audit Ledger${auditEntries.length > 0 ? ` (${auditEntries.length})` : ''}`,
                },
              ] as Array<{ id: AppView; label: string }>
            ).map((item) => {
              const isActive = activeView === item.id;
              const isDisabled = item.id === 'review' && analysis === null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  disabled={isDisabled}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : isDisabled
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {activeView === 'workbench' && (
            <WorkbenchView
              filename={filename}
              testFilename={testFilename}
              sourceCode={sourceCode}
              testCode={testCode}
              caseDescription={caseDescription}
              selectedLanguage={selectedLanguage}
              resolvedLanguage={resolvedLanguage}
              onChangeLanguage={setSelectedLanguage}
              onChangeFilename={setFilename}
              onChangeTestFilename={setTestFilename}
              onChangeSourceCode={setSourceCode}
              onChangeTestCode={setTestCode}
              onResetDemo={handleResetDemo}
              canResetDemo={activeDemoId !== null}
              analysis={analysis}
              isRunning={isRunning}
              errorMessage={errorMessage}
              onOpenReview={() => setActiveView('review')}
            />
          )}

          {activeView === 'review' && (
            <DiffReviewView
              analysis={analysis}
              testCode={testCode}
              activeDecision={activeDecision}
              onAcceptPatch={handleAcceptPatch}
              onRejectPatch={handleRejectPatch}
              onDownloadPatched={handleDownloadPatched}
              onValidateManualPatch={handleValidateManualPatch}
              isValidatingManual={isValidatingManual}
              onBackToWorkbench={() => setActiveView('workbench')}
            />
          )}

          {activeView === 'audit' && (
            <AuditLedgerView
              entries={auditEntries}
              onClearEntries={() => setAuditEntries([])}
              onGoToWorkbench={() => setActiveView('workbench')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
