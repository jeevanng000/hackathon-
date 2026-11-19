import type {
  AnalysisResponse,
  AuditDecision,
  AuditEntry,
  TrustVerdict,
} from '../types/autopatch';

export interface TrustGateState {
  canAcceptDirectly: boolean;
  requiresOverride: boolean;
  canAcceptNow: boolean;
  reason: string;
}

/**
 * Pure trust-gate evaluation for the "Build for Trust" decision bar.
 * Never allows direct acceptance when sandbox validation is blocked.
 */
export function evaluateTrustGate(params: {
  verdict: TrustVerdict;
  overrideEnabled: boolean;
  overrideReason: string;
}): TrustGateState {
  const { verdict, overrideEnabled, overrideReason } = params;

  if (verdict === 'verified') {
    return {
      canAcceptDirectly: true,
      requiresOverride: false,
      canAcceptNow: true,
      reason: 'All sandbox unit tests passed with zero regressions.',
    };
  }

  if (verdict === 'already_passing') {
    return {
      canAcceptDirectly: false,
      requiresOverride: false,
      canAcceptNow: false,
      reason: 'Baseline suite already passes; no patch required.',
    };
  }

  const trimmedReason = overrideReason.trim();
  const canOverride = overrideEnabled && trimmedReason.length >= 8;

  return {
    canAcceptDirectly: false,
    requiresOverride: true,
    canAcceptNow: canOverride,
    reason: canOverride
      ? 'Human override armed with logged justification.'
      : 'Blocked by sandbox validation. Enable Human Override and provide a justification (min 8 chars) or edit the patch and re-verify.',
  };
}

/**
 * Builds a structured audit ledger entry from an analysis run and developer decision.
 */
export function buildAuditEntry(params: {
  analysis: AnalysisResponse;
  decision: AuditDecision;
  overrideReason?: string;
  now?: Date;
}): AuditEntry {
  const { analysis, decision, overrideReason, now = new Date() } = params;
  return {
    id: `aud-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    filename: analysis.filename,
    line: analysis.patchInfo.targetLine ?? analysis.baseline.errorLine ?? null,
    bugType: analysis.patchInfo.bugType,
    ruleId: analysis.patchInfo.ruleId,
    confidence: analysis.confidence.score,
    baselinePassed: analysis.baseline.passed,
    baselineTotal: analysis.baseline.total,
    sandboxPassed: analysis.sandbox.passed,
    sandboxTotal: analysis.sandbox.total,
    sandboxVerdict: analysis.trustVerdict,
    decision,
    summary: analysis.patchInfo.strategy,
    overrideReason: overrideReason?.trim() || undefined,
    linesAdded: analysis.diff.linesAdded,
    linesRemoved: analysis.diff.linesRemoved,
  };
}

export type AuditFilter = 'all' | AuditDecision;

/**
 * Filters audit ledger records by status and free-text query across file, bug type, rule, and summary.
 */
export function filterAuditEntries(
  entries: AuditEntry[],
  filter: AuditFilter,
  query: string
): AuditEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter !== 'all' && entry.decision !== filter) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      entry.filename,
      entry.bugType,
      entry.ruleId,
      entry.summary,
      entry.overrideReason ?? '',
      entry.line != null ? `line ${entry.line}` : '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes audit entries into RFC-4180 compliant CSV for compliance export.
 */
export function serializeAuditToCsv(entries: AuditEntry[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'File',
    'Line',
    'Bug Type',
    'Rule',
    'Confidence (%)',
    'Baseline Tests',
    'Sandbox Tests',
    'Sandbox Verdict',
    'Decision',
    'Lines Added',
    'Lines Removed',
    'Summary',
    'Override Justification',
  ];

  const rows = entries.map((e) =>
    [
      e.id,
      e.timestamp,
      e.filename,
      e.line ?? '',
      e.bugType,
      e.ruleId,
      e.confidence,
      `${e.baselinePassed}/${e.baselineTotal}`,
      `${e.sandboxPassed}/${e.sandboxTotal}`,
      e.sandboxVerdict,
      e.decision,
      e.linesAdded,
      e.linesRemoved,
      e.summary,
      e.overrideReason ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Formats an ISO timestamp into a concise tabular-friendly display string.
 */
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Generates the 5-section structured AutoPatch Engine Markdown Report:
 * ### 1. BUG SUMMARY & TRIAGE
 * ### 2. ROOT-CAUSE ANALYSIS
 * ### 3. MINIMAL SURGICAL PATCH (UNIFIED DIFF)
 * ### 4. REGRESSION & EDGE-CASE TEST SUITE
 * ### 5. AUDIT LOG ENTRY
 */
export function formatStructuredMarkdownReport(
  analysis: AnalysisResponse,
  testCode: string,
  decision: AuditDecision | null = null
): string {
  const lineTarget =
    analysis.patchInfo.targetLine ??
    analysis.baseline.errorLine ??
    analysis.astReport.findings[0]?.line ??
    1;

  const hasErrorFinding = analysis.astReport.findings.some((f) => f.severity === 'error');
  const severity =
    analysis.trustVerdict === 'already_passing'
      ? 'Low'
      : analysis.patchInfo.bugType.includes('Injection') ||
        analysis.patchInfo.bugType.includes('Timeout') ||
        analysis.patchInfo.bugType.includes('TypeError') ||
        analysis.patchInfo.bugType.includes('ZeroDivision')
      ? 'High'
      : hasErrorFinding
      ? 'High'
      : 'Medium';

  const unifiedDiff =
    analysis.diff.unified.trim() ||
    `--- a/${analysis.filename}\n+++ b/${analysis.filename}\n@@ -1,1 +1,1 @@\n (no textual diff required)`;

  const verdictLabel =
    decision === 'accepted'
      ? 'ACCEPTED (SANDBOX VERIFIED)'
      : decision === 'override'
      ? 'ACCEPTED (HUMAN OVERRIDE)'
      : decision === 'rejected'
      ? 'REJECTED'
      : analysis.trustVerdict === 'verified'
      ? 'SANDBOX VERIFIED (READY FOR APPROVAL)'
      : analysis.trustVerdict === 'already_passing'
      ? 'BASELINE ALREADY PASSING'
      : 'BLOCKED (HUMAN REVIEW REQUIRED)';

  return [
    '### 1. BUG SUMMARY & TRIAGE',
    `- **Target Component**: \`${analysis.filename}\` (Line ${lineTarget})`,
    `- **Bug Category**: \`${analysis.patchInfo.bugType}\` (\`${analysis.patchInfo.ruleId}\`)`,
    `- **Severity**: **${severity}**`,
    `- **Confidence Score**: **${analysis.confidence.score}%** (${analysis.patchInfo.aprStrategy || 'Template-Based APR'})`,
    `- **Sandbox Validation**: **${analysis.sandbox.passed}/${analysis.sandbox.total} tests passed** (Baseline: ${analysis.baseline.passed}/${analysis.baseline.total} passed)`,
    '',
    '### 2. ROOT-CAUSE ANALYSIS',
    `- **Diagnosis**: ${analysis.patchInfo.rootCause}`,
    `- **Repair Strategy**: ${analysis.patchInfo.strategy}`,
    ...(analysis.baseline.errorMessage
      ? [`- **Failing Runtime Exception**: \`${analysis.baseline.errorType || 'Error'}: ${analysis.baseline.errorMessage}\``]
      : []),
    '',
    '### 3. MINIMAL SURGICAL PATCH (UNIFIED DIFF)',
    '```diff',
    unifiedDiff,
    '```',
    '',
    '### 4. REGRESSION & EDGE-CASE TEST SUITE',
    `\`\`\`${analysis.language || 'python'}`,
    testCode.trim(),
    '```',
    '',
    '### 5. AUDIT LOG ENTRY',
    '| Field | Value |',
    '| :--- | :--- |',
    `| **File** | \`${analysis.filename}\` |`,
    `| **Line(s)** | \`L${lineTarget}\` (\`+${analysis.diff.linesAdded} / -${analysis.diff.linesRemoved}\`) |`,
    `| **Defect / Rule** | \`${analysis.patchInfo.bugType}\` / \`${analysis.patchInfo.ruleId}\` |`,
    `| **Confidence** | \`${analysis.confidence.score}%\` |`,
    `| **Verification** | \`${analysis.sandbox.passed}/${analysis.sandbox.total} passed\` (\`${analysis.sandbox.durationMs.toFixed(1)} ms\`) |`,
    `| **Trust Gate Status** | \`${verdictLabel}\` |`,
  ].join('\n');
}

