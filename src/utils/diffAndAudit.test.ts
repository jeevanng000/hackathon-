import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  buildAuditEntry,
  evaluateTrustGate,
  filterAuditEntries,
  formatAuditTimestamp,
  formatStructuredMarkdownReport,
  serializeAuditToCsv,
} from './diffAndAudit';
import { classifySuspiciousness, computeOchiai, computeTarantula } from './sbfl';
import { detectLanguageFromFilename, getLanguageMeta, type SupportedLanguage } from './languageDetect';
import {
  applyAllSafeFixesToSource,
  applyFindingFixToSource,
  buildUnifiedFindings,
  getAdjacentFindingId,
  isEditableTargetElement,
  sortFindingsBySeverity,
} from './unifiedFindings';
import { deriveWorkflowLifecycleSteps } from './workflowStepper';
import {
  computeBugHeatmapBands,
  computeScrollViewportMetrics,
} from './bugHeatmap';
import { DEMO_CASES } from '../data/demoCases';
import type { AnalysisResponse, VoiceNote } from '../types/autopatch';
import { runMultiLangAnalysis } from '../../engine/multi_lang_engine';

const ENGINE_PATH = path.resolve(process.cwd(), 'engine', 'autopatch_engine.py');

function runPythonEngineSync(payload: Record<string, unknown>): AnalysisResponse {
  const stdout = execFileSync('python3', [ENGINE_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 12000,
  });
  return JSON.parse(stdout.trim()) as AnalysisResponse;
}

test('detectLanguageFromFilename accurately classifies all major languages and generic fallback', () => {
  assert.equal(detectLanguageFromFilename('pricing_engine.py'), 'python');
  assert.equal(detectLanguageFromFilename('cart_totals.ts'), 'typescript');
  assert.equal(detectLanguageFromFilename('widget.jsx'), 'javascript');
  assert.equal(detectLanguageFromFilename('telemetry_math.c'), 'c');
  assert.equal(detectLanguageFromFilename('solver.cpp'), 'cpp');
  assert.equal(detectLanguageFromFilename('OrderQuery.java'), 'java');
  assert.equal(detectLanguageFromFilename('server.go'), 'go');
  assert.equal(detectLanguageFromFilename('lib.rs'), 'rust');
  assert.equal(detectLanguageFromFilename('Billing.cs'), 'csharp');
  assert.equal(detectLanguageFromFilename('index.php'), 'php');
  assert.equal(detectLanguageFromFilename('worker.rb'), 'ruby');
  assert.equal(detectLanguageFromFilename('deploy.sh'), 'bash');
  assert.equal(detectLanguageFromFilename('schema.sql'), 'sql');
  assert.equal(detectLanguageFromFilename('main.kt'), 'generic');
  assert.equal(getLanguageMeta('c').executionMode, 'sandbox-runtime');
  assert.equal(getLanguageMeta('java').executionMode, 'static-verifier');
});

test('SBFL Ochiai and Tarantula formulas compute exact textbook values', () => {
  assert.equal(computeOchiai(1, 1, 1), 0.707);
  assert.equal(computeTarantula(1, 1, 1, 3), 0.75);
  assert.equal(computeOchiai(1, 0, 1), 1.0);
  assert.equal(computeTarantula(1, 0, 1, 3), 1.0);
  assert.equal(computeOchiai(0, 3, 1), 0);
  assert.equal(classifySuspiciousness(0.816), 'high');
  assert.equal(classifySuspiciousness(0.5), 'medium');
  assert.equal(classifySuspiciousness(0.2), 'low');
});

test('evaluateTrustGate permits direct accept only when sandbox is verified', () => {
  const verified = evaluateTrustGate({
    verdict: 'verified',
    overrideEnabled: false,
    overrideReason: '',
  });
  assert.equal(verified.canAcceptDirectly, true);
  assert.equal(verified.canAcceptNow, true);
  assert.equal(verified.requiresOverride, false);

  const blockedNoOverride = evaluateTrustGate({
    verdict: 'blocked',
    overrideEnabled: false,
    overrideReason: '',
  });
  assert.equal(blockedNoOverride.canAcceptDirectly, false);
  assert.equal(blockedNoOverride.canAcceptNow, false);
  assert.equal(blockedNoOverride.requiresOverride, true);

  const blockedShortReason = evaluateTrustGate({
    verdict: 'blocked',
    overrideEnabled: true,
    overrideReason: 'short',
  });
  assert.equal(blockedShortReason.canAcceptNow, false);

  const blockedValidOverride = evaluateTrustGate({
    verdict: 'blocked',
    overrideEnabled: true,
    overrideReason: 'Accepted for manual dead-letter refactor in follow-up commit.',
  });
  assert.equal(blockedValidOverride.canAcceptNow, true);
});

test('All 6 multi-language golden demos (Python, TypeScript, C, Java) pass end-to-end verification', async () => {
  for (const demo of DEMO_CASES) {
    const res =
      demo.language === 'python'
        ? runPythonEngineSync({
            action: 'analyze',
            filename: demo.filename,
            testFilename: demo.testFilename,
            sourceCode: demo.sourceCode,
            testCode: demo.testCode,
            timeoutSeconds: 1.5,
          })
        : await runMultiLangAnalysis({
            action: 'analyze',
            language: demo.language as SupportedLanguage,
            filename: demo.filename,
            testFilename: demo.testFilename,
            sourceCode: demo.sourceCode,
            testCode: demo.testCode,
            timeoutSeconds: 2.0,
          });

    if (demo.expectedOutcome === 'auto-verified') {
      assert.equal(
        res.trustVerdict,
        'verified',
        `${demo.filename} (${demo.language}) should produce verified verdict, got ${res.trustVerdict} (${res.sandbox.errorMessage})`
      );
      assert.equal(res.sandbox.failed, 0, `${demo.filename} sandbox should have 0 failed checks`);
      assert.ok(res.sandbox.passed >= 3, `${demo.filename} should pass all checks`);
      assert.ok(res.confidence.score >= 85, `${demo.filename} confidence should be high`);
      assert.ok(res.diff.unified.includes('@@'), `${demo.filename} should include unified diff`);

      if (demo.id === 'auth-service-none-sub') {
        assert.ok(res.patchedCode.includes('if user is not None and user["password"] == password:'));
        assert.ok(res.patchedCode.includes('if username not in users_db:'));
      }

      if (demo.id === 'discount-sbfl-mutation') {
        assert.ok(res.sbfl && res.sbfl.rankings.length > 0, 'discount_rules.py should produce SBFL rankings');
        assert.ok(
          (res.patchInfo.evaluatedMutants?.length ?? 0) >= 1,
          'discount_rules.py should record Search-Based APR mutant evaluations'
        );
        assert.ok(res.patchedCode.includes('order_total >= 100'));
      }

      if (demo.id === 'ts-cart-index') {
        assert.ok(res.patchedCode.includes('i < items.length'));
      }

      if (demo.id === 'c-telemetry-div') {
        assert.ok(res.patchedCode.includes('if (count == 0)'));
      }

      if (demo.id === 'java-order-taint') {
        assert.ok(res.patchedCode.includes('WHERE customer_id = ?'));
        assert.ok(res.patchedCode.includes('i < ids.length'));
        assert.ok(!res.patchedCode.includes('unreachableLog'));
      }
    } else {
      assert.equal(
        res.trustVerdict,
        'blocked',
        `${demo.filename} should be blocked by Trust Layer`
      );
      assert.equal(res.baseline.timedOut, true, `${demo.filename} should hit sandbox timeout`);
      assert.equal(res.patchInfo.requiresHumanReview, true);
    }
  }
});

test('Universal multi-language engine also patches Rust, Go, and Bash modules cleanly', async () => {
  const rustRes = await runMultiLangAnalysis({
    action: 'analyze',
    language: 'rust',
    filename: 'metrics.rs',
    testFilename: 'metrics_test.rs',
    sourceCode: `pub fn sum_slice(vals: &[i32]) -> i32 {
    let mut acc = 0;
    for i in 0..=vals.len() {
        acc += vals[i];
    }
    acc
}
`,
    testCode: '',
  });
  assert.equal(rustRes.trustVerdict, 'verified');
  assert.ok(rustRes.patchedCode.includes('0..vals.len()'));

  const bashRes = await runMultiLangAnalysis({
    action: 'analyze',
    language: 'bash',
    filename: 'avg.sh',
    testFilename: 'test_avg.sh',
    sourceCode: `#!/usr/bin/env bash
safe_ratio() {
  local total=$1
  local count=$2
  echo $(( total / count ))
}
`,
    testCode: `#!/usr/bin/env bash
set -euo pipefail
source ./avg.sh
out=$(safe_ratio 10 2)
test "$out" = "5"
zero_out=$(safe_ratio 10 0)
test "$zero_out" = "0"
`,
  });
  assert.equal(bashRes.trustVerdict, 'verified');
  assert.equal(bashRes.sandbox.passed, 1);
});

test('Manual patch validation verifies developer fix for retry_worker.py', () => {
  const retryDemo = DEMO_CASES.find((d) => d.id === 'retry-loop-blocked')!;
  const fixedCode = `def drain_job_queue(jobs):
    """Process jobs until the queue empties. Drop malformed jobs without 'payload'."""
    queue = list(jobs)
    processed = []
    while queue:
        current = queue.pop(0)
        if "payload" not in current:
            continue
        processed.append(current["payload"])
    return processed
`;

  const res = runPythonEngineSync({
    action: 'validate',
    filename: retryDemo.filename,
    testFilename: retryDemo.testFilename,
    originalCode: retryDemo.sourceCode,
    candidateCode: fixedCode,
    testCode: retryDemo.testCode,
    timeoutSeconds: 1.5,
  });

  assert.equal(res.trustVerdict, 'verified');
  assert.equal(res.sandbox.passed, 2);
  assert.equal(res.sandbox.failed, 0);
  assert.equal(res.sandbox.timedOut, false);
});

test('Audit entry creation, filtering, CSV serialization, and 5-section Markdown report preserve fidelity', () => {
  const pricingDemo = DEMO_CASES.find((d) => d.id === 'pricing-zero-div')!;
  const analysis = runPythonEngineSync({
    action: 'analyze',
    filename: pricingDemo.filename,
    testFilename: pricingDemo.testFilename,
    sourceCode: pricingDemo.sourceCode,
    testCode: pricingDemo.testCode,
    timeoutSeconds: 1.5,
  });

  const acceptedEntry = buildAuditEntry({
    analysis,
    decision: 'accepted',
    now: new Date('2026-11-18T20:00:00.000Z'),
  });
  const rejectedEntry = buildAuditEntry({
    analysis: { ...analysis, filename: 'telemetry_math.c' },
    decision: 'rejected',
    now: new Date('2026-11-18T20:05:00.000Z'),
  });

  const all = [acceptedEntry, rejectedEntry];
  assert.equal(filterAuditEntries(all, 'all', '').length, 2);
  assert.equal(filterAuditEntries(all, 'accepted', '').length, 1);
  assert.equal(filterAuditEntries(all, 'all', 'telemetry').length, 1);
  assert.equal(filterAuditEntries(all, 'accepted', 'telemetry').length, 0);

  const csv = serializeAuditToCsv(all);
  assert.ok(csv.startsWith('ID,Timestamp,File,Line,Bug Type'));
  assert.ok(csv.includes('pricing_engine.py'));
  assert.ok(csv.includes('ZeroDivisionError'));
  assert.equal(formatAuditTimestamp('2026-11-18T20:00:00.000Z').length, 19);

  // Also verify traceback-only analysis (empty testCode + bugContext) auto-synthesizes tests and generates all 5 markdown headers
  const authDemo = DEMO_CASES.find((d) => d.id === 'auth-service-none-sub')!;
  const tracebackOnlyRes = runPythonEngineSync({
    action: 'analyze',
    filename: authDemo.filename,
    testFilename: authDemo.testFilename,
    sourceCode: authDemo.sourceCode,
    testCode: '',
    bugContext: authDemo.bugContext,
    timeoutSeconds: 1.5,
  });
  assert.equal(tracebackOnlyRes.trustVerdict, 'verified');
  assert.ok(tracebackOnlyRes.generatedTestCode?.includes('def test_authenticate_existing_and_missing_user'));

  const md = formatStructuredMarkdownReport(tracebackOnlyRes, '', 'accepted');
  assert.ok(md.includes('### 1. BUG SUMMARY & TRIAGE'));
  assert.ok(md.includes('### 2. ROOT-CAUSE ANALYSIS'));
  assert.ok(md.includes('### 3. MINIMAL SURGICAL PATCH (UNIFIED DIFF)'));
  assert.ok(md.includes('### 4. REGRESSION & EDGE-CASE TEST SUITE'));
  assert.ok(md.includes('### 5. AUDIT LOG ENTRY'));
});

test('Unified per-line bug findings map categories, plain-English text, and clean line fixes', () => {
  const authDemo = DEMO_CASES.find((d) => d.id === 'auth-service-none-sub')!;
  const analysis = runPythonEngineSync({
    action: 'analyze',
    filename: authDemo.filename,
    testFilename: authDemo.testFilename,
    sourceCode: authDemo.sourceCode,
    testCode: authDemo.testCode,
    timeoutSeconds: 1.5,
  });

  const unified = buildUnifiedFindings(analysis, [
    {
      id: 'ai-modern-1',
      line: 1,
      endLine: 1,
      source: 'ai-latest',
      category: 'modern',
      severity: 'warning',
      title: 'Plaintext password comparison risk',
      kind: 'CWE-256',
      plainEnglishExplanation: 'Comparing raw passwords directly without hashing exposes stored credentials.',
      technicalExplanation: 'Direct string equality against plaintext password field.',
      impactSummary: 'Stored passwords should use constant-time hash verification.',
      originalSnippet: authDemo.sourceCode.split('\n')[0],
      suggestedReplacement: null,
      canAutoFix: false,
      cweOrRule: 'CWE-256',
      isModernPattern: true,
    },
  ]);

  assert.ok(unified.length >= 2);
  assert.ok(unified.some((f) => f.category === 'modern' && f.source === 'ai-latest'));
  assert.ok(unified.some((f) => f.canAutoFix && f.plainEnglishExplanation.length > 10));

  const fixable = unified.find((f) => f.canAutoFix)!;
  const singleFixed = applyFindingFixToSource(authDemo.sourceCode, fixable);
  assert.notEqual(singleFixed, authDemo.sourceCode);

  const { updatedCode, appliedIds } = applyAllSafeFixesToSource(authDemo.sourceCode, unified);
  assert.ok(appliedIds.length >= 1);
  assert.ok(updatedCode.includes('is not None'));
});

test('Voice notes attach reasoning into audit entries, CSV export, and Markdown reports', () => {
  const retryDemo = DEMO_CASES.find((d) => d.id === 'retry-loop-blocked')!;
  const analysis = runPythonEngineSync({
    action: 'analyze',
    filename: retryDemo.filename,
    testFilename: retryDemo.testFilename,
    sourceCode: retryDemo.sourceCode,
    testCode: retryDemo.testCode,
    timeoutSeconds: 1.5,
  });

  const sampleNotes: VoiceNote[] = [
    {
      id: 'vn-test-1',
      findingId: 'unified-sbfl-1',
      filename: retryDemo.filename,
      line: 10,
      bugTitle: 'Infinite retry loop on malformed job',
      createdAt: '2026-11-19T06:00:00.000Z',
      durationSec: 12,
      mimeType: 'audio/webm',
      audioDataUrl: 'data:audio/webm;base64,AAAA',
      transcript: 'Skipped malformed jobs manually before moving to dead-letter queue.',
      transcriptionStatus: 'completed',
    },
  ];

  const entry = buildAuditEntry({
    analysis,
    decision: 'override',
    overrideReason: sampleNotes[0].transcript,
    voiceNotes: sampleNotes,
    now: new Date('2026-11-19T06:01:00.000Z'),
  });

  assert.equal(entry.voiceNoteCount, 1);
  assert.ok(entry.voiceNotesSummary?.includes('Skipped malformed jobs manually'));
  assert.equal(filterAuditEntries([entry], 'all', 'dead-letter').length, 1);

  const csv = serializeAuditToCsv([entry]);
  assert.ok(csv.includes('Voice Notes'));
  assert.ok(csv.includes('Skipped malformed jobs manually'));

  const md = formatStructuredMarkdownReport(analysis, retryDemo.testCode, 'override', sampleNotes);
  assert.ok(md.includes('Developer Voice Notes'));
  assert.ok(md.includes('1 attached'));
});

test('Keyboard bug navigation wraps cleanly and ignores editable targets', () => {
  const findings = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
  assert.equal(getAdjacentFindingId([], null, 'next'), null);
  assert.equal(getAdjacentFindingId(findings, null, 'next'), 'f1');
  assert.equal(getAdjacentFindingId(findings, null, 'prev'), 'f3');
  assert.equal(getAdjacentFindingId(findings, 'f1', 'next'), 'f2');
  assert.equal(getAdjacentFindingId(findings, 'f3', 'next'), 'f1');
  assert.equal(getAdjacentFindingId(findings, 'f1', 'prev'), 'f3');
  assert.equal(getAdjacentFindingId(findings, 'f2', 'prev'), 'f1');

  assert.equal(isEditableTargetElement({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTargetElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableTargetElement({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTargetElement({ tagName: 'AUDIO' }), true);
  assert.equal(isEditableTargetElement({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableTargetElement({ tagName: 'BUTTON', isContentEditable: false }), false);
  assert.equal(isEditableTargetElement(null), false);
});

test('sortFindingsBySeverity prioritizes Critical -> Warning -> Info and ties by line', () => {
  const sample = [
    { id: 'info-10', line: 10, severity: 'info' as const },
    { id: 'warn-5', line: 5, severity: 'warning' as const },
    { id: 'crit-12', line: 12, severity: 'critical' as const },
    { id: 'crit-3', line: 3, severity: 'critical' as const },
    { id: 'warn-2', line: 2, severity: 'warning' as const },
  ];

  const sorted = sortFindingsBySeverity(sample);
  assert.deepEqual(
    sorted.map((f) => f.id),
    ['crit-3', 'crit-12', 'warn-2', 'warn-5', 'info-10']
  );
});

test('deriveWorkflowLifecycleSteps tracks Analysis -> Inspection -> Verification -> Audit', () => {
  const initial = deriveWorkflowLifecycleSteps({
    analysis: null,
    isRunning: false,
    isValidating: false,
    findingsCount: 0,
    resolvedCount: 0,
    hasLocalEdits: false,
    activeDecision: null,
    auditCount: 0,
  });
  assert.deepEqual(
    initial.map((s) => [s.id, s.state]),
    [
      ['analysis', 'active'],
      ['inspection', 'upcoming'],
      ['verification', 'upcoming'],
      ['audit', 'upcoming'],
    ]
  );

  const pricingDemo = DEMO_CASES.find((d) => d.id === 'pricing-zero-div')!;
  const analysis = runPythonEngineSync({
    action: 'analyze',
    filename: pricingDemo.filename,
    testFilename: pricingDemo.testFilename,
    sourceCode: pricingDemo.sourceCode,
    testCode: pricingDemo.testCode,
    timeoutSeconds: 1.5,
  });

  const postScan = deriveWorkflowLifecycleSteps({
    analysis,
    isRunning: false,
    isValidating: false,
    findingsCount: 2,
    resolvedCount: 0,
    hasLocalEdits: false,
    activeDecision: null,
    auditCount: 0,
  });
  assert.equal(postScan[0].state, 'completed');
  assert.equal(postScan[1].state, 'active');
  assert.equal(postScan[2].state, 'upcoming');

  const afterFix = deriveWorkflowLifecycleSteps({
    analysis,
    isRunning: false,
    isValidating: false,
    findingsCount: 2,
    resolvedCount: 2,
    hasLocalEdits: true,
    activeDecision: null,
    auditCount: 1,
  });
  assert.equal(afterFix[1].state, 'completed');
  assert.equal(afterFix[2].state, 'active');

  const afterAudit = deriveWorkflowLifecycleSteps({
    analysis,
    isRunning: false,
    isValidating: false,
    findingsCount: 2,
    resolvedCount: 2,
    hasLocalEdits: false,
    activeDecision: 'accepted',
    auditCount: 2,
  });
  assert.deepEqual(
    afterAudit.map((s) => s.state),
    ['completed', 'completed', 'completed', 'completed']
  );
});

test('Bug Heatmap computes severity density bands, resolved states, and scroll viewport metrics', () => {
  const sampleFindings = [
    {
      id: 'f-crit',
      line: 5,
      endLine: 5,
      source: 'static-ast' as const,
      category: 'security' as const,
      severity: 'critical' as const,
      title: 'SQL injection',
      kind: 'SqlInjectionRisk',
      plainEnglishExplanation: 'Unsafe query',
      technicalExplanation: 'Unsafe query',
      impactSummary: 'Injection',
      originalSnippet: 'q = ...',
      suggestedReplacement: null,
      canAutoFix: false,
    },
    {
      id: 'f-warn',
      line: 5,
      endLine: 6,
      source: 'static-ast' as const,
      category: 'runtime' as const,
      severity: 'warning' as const,
      title: 'Null check',
      kind: 'NullDereferenceRisk',
      plainEnglishExplanation: 'Possible null',
      technicalExplanation: 'Possible null',
      impactSummary: 'Crash',
      originalSnippet: 'x.y',
      suggestedReplacement: null,
      canAutoFix: false,
    },
    {
      id: 'f-info',
      line: 40,
      endLine: 40,
      source: 'ai-latest' as const,
      category: 'modern' as const,
      severity: 'info' as const,
      title: 'Style hint',
      kind: 'ModernPattern',
      plainEnglishExplanation: 'Consider helper',
      technicalExplanation: 'Consider helper',
      impactSummary: 'Readability',
      originalSnippet: 'pass',
      suggestedReplacement: null,
      canAutoFix: false,
    },
  ];

  const bands = computeBugHeatmapBands({
    lineCount: 48,
    findings: sampleFindings,
    resolvedFindingIds: new Set(['f-info']),
    activeFindingId: 'f-crit',
  });

  assert.equal(bands.length, 3);
  const line5Band = bands.find((b) => b.startLine === 5)!;
  assert.equal(line5Band.status, 'critical');
  assert.equal(line5Band.totalCount, 2);
  assert.equal(line5Band.normalizedDensity, 1);
  assert.equal(line5Band.hasActiveFinding, true);
  assert.equal(line5Band.primaryFindingId, 'f-crit');

  const line40Band = bands.find((b) => b.startLine === 40)!;
  assert.equal(line40Band.status, 'resolved');

  assert.deepEqual(computeScrollViewportMetrics(0, 500, 500), {
    topPct: 0,
    heightPct: 100,
  });
  const scrolled = computeScrollViewportMetrics(500, 500, 2000);
  assert.equal(scrolled.topPct, 25);
  assert.equal(scrolled.heightPct, 25);
});

