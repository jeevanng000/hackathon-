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
    { input: 'items=[]', expected_output: '0.0', status: 'fail' },
    {
      input: 'items=[{"price": 20, "qty": 2}]',
      expected_output: '20.0',
      status: 'pass',
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

test('normalizeGeminiReport clamps scores and populates defaults', () => {
  const report = normalizeGeminiReport({
    bugs: [
      {
        id: 'b1',
        title: 'Null subscript',
        severity: 'high',
        confidence: 145,
        errored_statement: 'if user["password"] == password:',
        root_cause: 'user can be None',
        before_code: 'if user["password"] == password:',
        after_code: 'if user and user["password"] == password:',
        test_cases: [{ input: 'unknown user', expected_output: 'INVALID', status: 'fail' }],
      },
    ],
    summary: {
      health_score: -10,
      overview: 'One high-severity issue found.',
      prioritized_actions: ['Guard None return before indexing user dictionary'],
    },
  });

  assert.equal(report.bugs.length, 1);
  assert.equal(report.bugs[0].severity, 'High');
  assert.equal(report.bugs[0].confidence, 100);
  assert.equal(report.summary.health_score, 0);
  assert.equal(report.execution_source, 'gemini');
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
