import { useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileCode2,
  Paperclip,
  RotateCw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { DemoCase } from '../types/autopatch';

interface WelcomeHeroInputProps {
  filename: string;
  sourceCode: string;
  errorStatement: string;
  presets: DemoCase[];
  isCompact: boolean;
  isScanning: boolean;
  geminiConfigured: boolean | null;
  validationError: string | null;
  onChangeFilename: (name: string) => void;
  onChangeSourceCode: (code: string) => void;
  onChangeErrorStatement: (err: string) => void;
  onSelectPreset: (preset: DemoCase) => void;
  onSubmitScan: (mode: 'gemini' | 'local-sandbox') => void;
}

export function WelcomeHeroInput({
  filename,
  sourceCode,
  errorStatement,
  presets,
  isCompact,
  isScanning,
  geminiConfigured,
  validationError,
  onChangeFilename,
  onChangeSourceCode,
  onChangeErrorStatement,
  onSelectPreset,
  onSubmitScan,
}: WelcomeHeroInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showErrorField, setShowErrorField] = useState(Boolean(errorStatement.trim()));
  const [compactExpanded, setCompactExpanded] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeFilename(file.name);
        onChangeSourceCode(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const lineCount = sourceCode ? sourceCode.split('\n').length : 0;

  // Compact docked top bar after user submits so workspace stays front-and-center
  if (isCompact && !compactExpanded) {
    return (
      <section
        aria-label="Submitted code summary bar"
        className="workspace-spring mx-auto w-full max-w-6xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/85 dark:border-white/15 bg-white/80 dark:bg-slate-900/75 backdrop-blur-xl px-4 py-2.5 shadow-lg shadow-indigo-500/5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-300">
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {filename || 'snippet.py'}
                </span>
                <span className="tabular-nums rounded-md bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {lineCount} lines
                </span>
              </div>
              {errorStatement.trim() && (
                <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-md">
                  {errorStatement.trim().split('\n')[0]}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setCompactExpanded(true)}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:shadow-md cursor-pointer"
            >
              <span>Edit Input</span>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={isScanning}
              onClick={() => onSubmitScan('gemini')}
              className="tactile-btn gemini-accent-gradient inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 disabled:opacity-60 cursor-pointer"
            >
              <RotateCw
                className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isScanning ? 'Scanning...' : 'Re-scan'}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Code and problem input"
      className={`workspace-spring mx-auto w-full ${
        isCompact
          ? 'max-w-6xl py-0'
          : 'max-w-3xl min-h-[calc(100vh-8rem)] flex flex-col justify-center py-8 sm:py-12'
      }`}
    >
      {/* Centered Gemini-like Welcome Greeting */}
      {!isCompact && (
        <div className="mb-7 text-center space-y-3 px-2">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Autonomous 5-Stage Bug Detection &amp; Repair</span>
          </div>
          <h1 className="font-display text-3xl sm:text-[40px] font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">
            Find the root cause.{' '}
            <span className="gemini-text-gradient">Patch with proof.</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Paste your code snippet, drop a traceback or problem statement, or upload a source file.
            AutoPatch scans, explains why it fails, generates minimal fixes, and validates tests.
          </p>
        </div>
      )}

      {/* Floating Input Card */}
      <div className="workspace-spring relative rounded-3xl border border-slate-200/90 dark:border-white/15 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-indigo-500/10 p-4 sm:p-5">
        {/* Top Meta Strip inside Input Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2
              className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400"
              aria-hidden="true"
            />
            <label htmlFor="autopatch-filename" className="sr-only">
              Filename
            </label>
            <input
              id="autopatch-filename"
              type="text"
              value={filename}
              onChange={(e) => onChangeFilename(e.target.value)}
              placeholder="snippet.py"
              className="w-36 sm:w-44 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-white/15 focus:border-indigo-500/60 bg-slate-100/70 dark:bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-800 dark:text-slate-100 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".py,.ts,.tsx,.js,.jsx,.c,.cpp,.java,.go,.rs,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:shadow-md hover:shadow-indigo-500/10 cursor-pointer"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Upload File</span>
            </button>

            <button
              type="button"
              onClick={() => setShowErrorField((prev) => !prev)}
              className={`tactile-btn inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                showErrorField || errorStatement.trim()
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200/80 dark:border-white/15 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showErrorField ? 'Hide Traceback' : 'Add Error Log'}</span>
            </button>

            {isCompact && (
              <button
                type="button"
                onClick={() => setCompactExpanded(false)}
                aria-label="Collapse input editor"
                className="tactile-btn inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Collapse</span>
              </button>
            )}
          </div>
        </div>

        {/* Code / Problem Textarea */}
        <label htmlFor="autopatch-code-input" className="sr-only">
          Code snippet or problem statement
        </label>
        <textarea
          id="autopatch-code-input"
          value={sourceCode}
          onChange={(e) => onChangeSourceCode(e.target.value)}
          rows={isCompact ? 5 : 7}
          placeholder="Paste your code snippet or describe the failing behavior..."
          className="code-editor code-scroll w-full resize-y rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/75 dark:bg-black/25 p-3.5 text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none transition-colors"
        />

        {/* Optional Error / Problem Statement Field */}
        {(showErrorField || errorStatement.trim().length > 0) && (
          <div className="mt-3">
            <label
              htmlFor="autopatch-error-input"
              className="block mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Error / Traceback / Problem Context (Optional)
            </label>
            <textarea
              id="autopatch-error-input"
              value={errorStatement}
              onChange={(e) => onChangeErrorStatement(e.target.value)}
              rows={2}
              placeholder="e.g. TypeError: 'NoneType' object is not subscriptable on line 6..."
              className="code-editor code-scroll w-full resize-y rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/75 dark:bg-black/25 p-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
        )}

        {validationError && (
          <p
            role="alert"
            className="mt-2.5 text-xs font-medium text-red-600 dark:text-red-400"
          >
            {validationError}
          </p>
        )}

        {/* Action Footer inside Floating Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className="tactile-btn rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-700 dark:hover:text-indigo-200 hover:shadow-md hover:shadow-indigo-500/10 cursor-pointer"
              >
                {preset.title}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {geminiConfigured === false && (
              <button
                type="button"
                disabled={isScanning}
                onClick={() => {
                  setCompactExpanded(false);
                  onSubmitScan('local-sandbox');
                }}
                className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:shadow-md hover:shadow-indigo-500/10 disabled:opacity-50 cursor-pointer"
              >
                <Cpu className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                <span>Run Local Sandbox</span>
              </button>
            )}

            <button
              type="button"
              disabled={isScanning}
              onClick={() => {
                setCompactExpanded(false);
                onSubmitScan('gemini');
              }}
              className="tactile-btn gemini-accent-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 disabled:opacity-60 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{isScanning ? 'Running AutoPatch...' : 'Analyze & Patch'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
