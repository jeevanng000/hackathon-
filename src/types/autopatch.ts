export type AstSeverity = 'error' | 'warning';

export interface AstFinding {
  id: string;
  kind: string;
  category?: 'syntax' | 'runtime' | 'dataflow' | 'cfg' | 'security' | 'quality';
  severity: AstSeverity;
  line: number;
  col?: number;
  function: string;
  message: string;
  snippet: string;
  denominator?: string;
  sequence?: string;
  variable?: string;
  sink?: string;
  taintSources?: string[];
}

export interface FunctionMetric {
  name: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number;
  calls: string[];
}

export interface CallGraphEdge {
  caller: string;
  callee: string;
}

export interface AstReport {
  syntaxValid: boolean;
  durationMs: number;
  findings: AstFinding[];
  functions?: FunctionMetric[];
  callGraph?: CallGraphEdge[];
}

export interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed';
  durationMs: number;
  errorType?: string;
  errorMessage?: string;
  errorLine?: number | null;
  traceback?: string;
  executedLines?: number[];
}

export interface TestRunResult {
  timedOut: boolean;
  importError: boolean;
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  errorType: string | null;
  errorMessage: string | null;
  errorLine: number | null;
  traceback: string | null;
  tests: TestCaseResult[];
}

export interface SbflLineRanking {
  line: number;
  code: string;
  failedCovering: number;
  passedCovering: number;
  ochiai: number;
  tarantula: number;
  testHits: boolean[];
}

export interface SbflSpectrum {
  totalPassed: number;
  totalFailed: number;
  tests: Array<{ name: string; status: 'passed' | 'failed' }>;
  rankings: SbflLineRanking[];
}

export interface AprMutantEvaluation {
  line: number;
  ochiai: number;
  operator: string;
  originalLine: string;
  mutatedLine: string;
  passed: number;
  total: number;
  fitness: number;
  selected: boolean;
}

export interface PatchInfo {
  patchedCode: string;
  patchApplied: boolean;
  aprStrategy?: string;
  ruleId: string;
  strategy: string;
  targetLine: number | null;
  bugType: string;
  rootCause: string;
  requiresHumanReview: boolean;
  evaluatedMutants?: AprMutantEvaluation[];
  durationMs: number;
}

export interface SideBySideDiffRow {
  type: 'equal' | 'replace' | 'delete' | 'insert';
  leftLine: number | null;
  leftText: string | null;
  rightLine: number | null;
  rightText: string | null;
}

export interface DiffData {
  unified: string;
  sideBySide: SideBySideDiffRow[];
  linesAdded: number;
  linesRemoved: number;
}

export interface ConfidenceFactor {
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface ConfidenceBreakdown {
  score: number;
  factors: ConfidenceFactor[];
}

export type TrustVerdict = 'verified' | 'blocked' | 'already_passing';

export interface AnalysisResponse {
  filename: string;
  testFilename: string;
  language?: string;
  originalCode: string;
  patchedCode: string;
  generatedTestCode?: string;
  astReport: AstReport;
  baseline: TestRunResult;
  sbfl?: SbflSpectrum;
  patchInfo: PatchInfo;
  sandbox: TestRunResult;
  diff: DiffData;
  confidence: ConfidenceBreakdown;
  trustVerdict: TrustVerdict;
}

export type AuditDecision = 'accepted' | 'rejected' | 'override' | 'blocked';

export interface AuditEntry {
  id: string;
  timestamp: string;
  filename: string;
  line: number | null;
  bugType: string;
  ruleId: string;
  confidence: number;
  baselinePassed: number;
  baselineTotal: number;
  sandboxPassed: number;
  sandboxTotal: number;
  sandboxVerdict: TrustVerdict;
  decision: AuditDecision;
  summary: string;
  overrideReason?: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface DemoCase {
  id: string;
  title: string;
  language: string;
  category: string;
  expectedOutcome: 'auto-verified' | 'blocked-review';
  description: string;
  filename: string;
  testFilename: string;
  sourceCode: string;
  testCode: string;
  bugContext?: string;
}

export type AppView = 'workbench' | 'review' | 'audit';
