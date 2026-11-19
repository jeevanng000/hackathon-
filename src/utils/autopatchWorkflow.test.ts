import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPatchToCode,
  computeTestSummary,
  createHistoryEntry,
  findErroredLineIndices,
  getAdjacentBugId,
  normalizeAutoPatchSeverity,
  normalizeGeminiReport,
  sortAutoPatchBugs,
  validateSubmissionInput,
} from './autopatchWorkflow.ts';
import type { AutoPatchBug } from '../types/autopatch.ts';

const SAMPLE_BUG: AutoPatchBug = {
  id: 'bug-zero-div',
  title: 'Unchecked division by zero on empty cart',
  severity: 'Critical',
  confidence: 96,
  errored_statement: 'return round(total_revenue / total_units, 2)',
  root_cause:
    'When items is empty ([]), total_units evaluates to 0, raising ZeroDivisionError.',
  before_code: '    return round(total_revenue / total_units, 2)',
  after_code:
    '    if total_units <= 0:\n        return 0.0\n    return round(total_revenue / total_units, 2)',
  test_cases: [
    { input: 'items=[]', expected_output: '0.0', status: 'fail', case_type: 'boundary' },
    {
      input: 'items=[{"price": 20, "qty": 2}]',
      expected_output: '20.0',
      status: 'pass',
      case_type: 'normal',
    },
  ],
};

test('validateSubmissionInput rejects blank and overly short input', () => {
  assert.equal(validateSubmissionInput('').valid, false);
  assert.equal(validateSubmissionInput('   ').valid, false);
  assert.equal(validateSubmissionInput('x = 1').valid, false);
  assert.equal(validateSubmissionInput('def f(x): return 1 / x').valid, true);
});

test('normalizeAutoPatchSeverity handles casing and unknown values', () => {
  assert.equal(normalizeAutoPatchSeverity('critical'), 'Critical');
  assert.equal(normalizeAutoPatchSeverity('HIGH'), 'High');
  assert.equal(normalizeAutoPatchSeverity('low'), 'Low');
  assert.equal(normalizeAutoPatchSeverity('unknown'), 'Medium');
});

test('normalizeGeminiReport ranks bugs by severity then confidence and preserves case_type', () => {
  const report = normalizeGeminiReport({
    bugs: [
      {
        id: 'b-low',
        title: 'Minor style',
        severity: 'low',
        confidence: 99,
        errored_statement: 'x = 1',
        root_cause: 'unused var',
        before_code: 'x = 1',
        after_code: '',
        test_cases: [{ case_type: 'normal', input: 'a=1', expected_output: '1', status: 'pass' }],
      },
      {
        id: 'b-high-70',
        title: 'Lower conf high',
        severity: 'high',
        confidence: 70,
        errored_statement: 'y = 2',
        root_cause: 'fails on None',
        before_code: 'y = 2',
        after_code: 'y = 2',
        test_cases: [{ case_type: 'invalid', input: 'None', expected_output: 'error', status: 'fail' }],
      },
      {
        id: 'b-crit',
        title: 'SQL Injection',
        severity: 'critical',
        confidence: 95,
        errored_statement: 'cursor.execute(q)',
        root_cause: 'unsanitized input',
        before_code: 'cursor.execute(q)',
        after_code: 'cursor.execute(q, (u,))',
        test_cases: [{ case_type: 'boundary', input: "' OR 1=1 --", expected_output: '[]', status: 'fail' }],
      },
      {
        id: 'b-high-92',
        title: 'Null subscript',
        severity: 'high',
        confidence: 145,
        errored_statement: 'if user["password"] == password:',
        root_cause: 'user can be None',
        before_code: 'if user["password"] == password:',
        after_code: 'if user and user["password"] == password:',
        test_cases: [{ case_type: 'invalid', input: 'unknown user', expected_output: 'INVALID', status: 'fail' }],
      },
    ],
    summary: {
      health_score: -10,
      overview: 'Four issues found.',
      prioritized_actions: ['Fix SQL injection first'],
    },
  });

  assert.deepEqual(
    report.bugs.map((b) => b.id),
    ['b-crit', 'b-high-92', 'b-high-70', 'b-low']
  );
  assert.equal(report.bugs[1].severity, 'High');
  assert.equal(report.bugs[1].confidence, 100);
  assert.equal(report.bugs[0].test_cases[0].case_type, 'boundary');
  assert.equal(report.bugs[1].test_cases[0].case_type, 'invalid');
  assert.equal(report.summary.health_score, 0);
  assert.equal(report.execution_source, 'gemini');
});

test('sortAutoPatchBugs keeps order deterministic across equal severities', () => {
  const sorted = sortAutoPatchBugs([
    { ...SAMPLE_BUG, id: 'med', severity: 'Medium', confidence: 95 },
    { ...SAMPLE_BUG, id: 'crit-80', severity: 'Critical', confidence: 80 },
    { ...SAMPLE_BUG, id: 'crit-98', severity: 'Critical', confidence: 98 },
  ]);
  assert.deepEqual(
    sorted.map((b) => b.id),
    ['crit-98', 'crit-80', 'med']
  );
});

test('applyPatchToCode applies exact before_code replacement cleanly', () => {
  const original = [
    'def calc(items):',
    '    total_revenue = sum(i["p"] for i in items)',
    '    total_units = sum(i["q"] for i in items)',
    '    return round(total_revenue / total_units, 2)',
  ].join('\n');

  const { updatedCode, applied } = applyPatchToCode(original, SAMPLE_BUG);
  assert.equal(applied, true);
  assert.ok(updatedCode.includes('if total_units <= 0:'));
  assert.ok(updatedCode.includes('return 0.0'));
});

test('findErroredLineIndices locates errored statement line numbers', () => {
  const code = [
    'def calc(items):',
    '    total_units = 0',
    '    return round(total_revenue / total_units, 2)',
  ].join('\n');
  const lines = findErroredLineIndices(code, SAMPLE_BUG.errored_statement);
  assert.equal(lines.has(3), true);
  assert.equal(lines.has(1), false);
});

test('computeTestSummary reflects accepted patch recovery', () => {
  const before = computeTestSummary([SAMPLE_BUG], {});
  assert.equal(before.passed, 1);
  assert.equal(before.failed, 1);
  assert.equal(before.total, 2);

  const afterAccept = computeTestSummary([SAMPLE_BUG], { [SAMPLE_BUG.id]: 'Accepted' });
  assert.equal(afterAccept.passed, 2);
  assert.equal(afterAccept.failed, 0);
});

test('createHistoryEntry and getAdjacentBugId work deterministically', () => {
  const entry = createHistoryEntry({
    bug: SAMPLE_BUG,
    decision: 'Accepted',
    filename: 'pricing.py',
    executionSource: 'gemini',
    timestamp: '2026-11-19T00:00:00.000Z',
  });
  assert.equal(entry.decision, 'Accepted');
  assert.equal(entry.severity, 'Critical');

  const bugs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(getAdjacentBugId(bugs, 'a', 'next'), 'b');
  assert.equal(getAdjacentBugId(bugs, 'c', 'next'), 'a');
  assert.equal(getAdjacentBugId(bugs, 'a', 'prev'), 'c');
});
