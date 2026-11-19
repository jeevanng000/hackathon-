import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiScanStatus,
  AutoPatchReport,
  BugCategory,
  BugSeverity,
  UnifiedBugFinding,
} from '../src/types/autopatch.ts';
import { normalizeGeminiReport } from '../src/utils/autopatchWorkflow.ts';

const MODEL_NAME = 'gemini-4-hydrogen';

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

interface RawAiFinding {
  line: number;
  endLine: number;
  category: string;
  severity: string;
  title: string;
  cweOrRule: string;
  plainEnglishExplanation: string;
  technicalExplanation: string;
  impactSummary: string;
  suggestedReplacement: string;
  canAutoFix: boolean;
}

function normalizeCategory(raw: string): BugCategory {
  const lower = (raw || '').toLowerCase();
  if (lower === 'security') return 'security';
  if (lower === 'runtime') return 'runtime';
  if (lower === 'modern') return 'modern';
  return 'logic';
}

function normalizeSeverity(raw: string): BugSeverity {
  const lower = (raw || '').toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'info') return 'info';
  return 'warning';
}

export async function runGeminiAutonomousAutopatch(params: {
  sourceCode: string;
  errorStatement?: string;
  filename?: string;
  language?: string;
}): Promise<AutoPatchReport> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY to run Gemini AI analysis, or run Local Deterministic Sandbox below.'
    );
  }

  const prompt = [
    `Analyze the following ${params.language || 'auto-detected'} code or problem statement${params.filename ? ` (${params.filename})` : ''}.`,
    params.errorStatement?.trim()
      ? `Reported error / traceback / problem statement:\n${params.errorStatement.trim().slice(0, 3000)}`
      : '',
    `Source code or snippet:\n${params.sourceCode.slice(0, 16000)}`,
    `Execute the 5-stage autonomous AutoPatch workflow:
1. Identify logical bugs, crashes, edge-case failures, and security weaknesses.
2. Rank issues by severity (Critical > High > Medium > Low) and confidence (0-100).
3. Explain the true root cause and exact triggering input—never just point to a line number.
4. Generate the smallest, safest patch (exact before_code matching lines from the input and clean after_code replacement preserving indentation) without breaking unrelated functionality.
5. Provide concrete validation test cases covering normal, boundary, and invalid inputs (set case_type to 'normal', 'boundary', or 'invalid') showing how the patch resolves each bug.
Always respond in valid JSON matching the requested schema.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const AUTOPATCH_TIMEOUT_MS = 45000;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let rawText = '{}';
  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are AutoPatch, an autonomous software debugging and program repair engine. When given source code or a problem description: 1. Identify logical bugs, crashes, edge-case failures, and security weaknesses. 2. Rank issues by severity and confidence. 3. Explain the true root cause and triggering input—never just point to a line number. 4. Generate the smallest, safest patch that fixes the root cause without breaking unrelated functionality. 5. Provide concrete validation test cases (normal, boundary, and invalid inputs) showing that the patch resolves the bug. Always respond in valid JSON matching the requested schema. Never invent fictional line content for before_code; copy the exact buggy snippet from the input.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detected_language: {
                type: Type.STRING,
                description: 'Detected programming language such as python, typescript, javascript, java, or c',
              },
              trace_logs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Concise 4 to 6 stage execution trace log lines covering scan, root cause, fix, and test validation',
              },
              bugs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    severity: {
                      type: Type.STRING,
                      description: 'Strictly one of: Critical, High, Medium, Low',
                    },
                    confidence: {
                      type: Type.INTEGER,
                      description: 'Confidence percentage from 0 to 100',
                    },
                    errored_statement: {
                      type: Type.STRING,
                      description: 'Exact buggy line or statement from the provided input',
                    },
                    root_cause: {
                      type: Type.STRING,
                      description: 'Clear explanation of the true root cause and exact triggering input (never just a line number)',
                    },
                    before_code: {
                      type: Type.STRING,
                      description: 'Exact snippet from the source code before repair',
                    },
                    after_code: {
                      type: Type.STRING,
                      description: 'Smallest, safest replacement snippet preserving indentation without breaking unrelated code',
                    },
                    test_cases: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          case_type: {
                            type: Type.STRING,
                            description: 'Strictly one of: normal, boundary, invalid',
                          },
                          input: { type: Type.STRING },
                          expected_output: { type: Type.STRING },
                          actual_output: { type: Type.STRING },
                          status: {
                            type: Type.STRING,
                            description: 'Strictly one of: pass, fail',
                          },
                        },
                        required: ['input', 'expected_output', 'status'],
                      },
                    },
                  },
                  required: [
                    'id',
                    'title',
                    'severity',
                    'confidence',
                    'errored_statement',
                    'root_cause',
                    'before_code',
                    'after_code',
                    'test_cases',
                  ],
                },
              },
              summary: {
                type: Type.OBJECT,
                properties: {
                  health_score: {
                    type: Type.INTEGER,
                    description: 'Overall code health score from 0 to 100',
                  },
                  overview: { type: Type.STRING },
                  prioritized_actions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['health_score', 'overview', 'prioritized_actions'],
              },
            },
            required: ['detected_language', 'trace_logs', 'bugs', 'summary'],
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Gemini scan timed out after 45s. You can retry or run Local Deterministic Sandbox.')),
          AUTOPATCH_TIMEOUT_MS
        );
      }),
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    rawText = (response.text ?? '{}').trim();
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const rawMsg = err instanceof Error ? err.message : String(err);
    try {
      const parsedErr = JSON.parse(rawMsg);
      const friendly = parsedErr?.error?.message;
      if (typeof friendly === 'string' && friendly.trim()) {
        throw new Error(`${friendly.trim()} You can retry or run Local Deterministic Sandbox.`);
      }
    } catch (inner) {
      if (inner instanceof Error && inner.message !== rawMsg && inner.message.includes('Local Deterministic Sandbox')) {
        throw inner;
      }
    }
    throw err;
  }

  const parsed = JSON.parse(rawText);
  return normalizeGeminiReport(parsed, {
    fallbackLanguage: params.language,
    model: MODEL_NAME,
  });
}

export async function runGeminiLatestBugScan(params: {
  filename: string;
  language: string;
  sourceCode: string;
  bugContext?: string;
}): Promise<{ findings: UnifiedBugFinding[]; aiScanStatus: AiScanStatus }> {
  const t0 = performance.now();
  const client = getGeminiClient();
  if (!client) {
    return {
      findings: [],
      aiScanStatus: {
        status: 'skipped',
        findingsCount: 0,
        message: 'Live AI latest-bug scan unavailable (GEMINI_API_KEY not configured). Showing deterministic AST & sandbox results.',
      },
    };
  }

  const lines = params.sourceCode.split('\n');
  const numberedSource = lines
    .map((text, idx) => `${idx + 1}: ${text}`)
    .join('\n')
    .slice(0, 14000);

  const prompt = [
    `Analyze the following ${params.language} file (${params.filename}) for bugs, modern/latest security vulnerabilities (CVEs, prototype pollution, ReDoS, SSRF, path traversal, unsafe deserialization, SQL/command/code injection), async/concurrency races, resource leaks, boundary errors, and deprecated unsafe APIs.`,
    params.bugContext?.trim()
      ? `Optional user error log / context:\n${params.bugContext.trim().slice(0, 1500)}`
      : '',
    `Numbered source code:\n${numberedSource}`,
    `Return up to 6 real, concrete, high-signal findings anchored to exact 1-indexed line numbers from the source above. Keep plainEnglishExplanation clear enough for a beginner to understand in 1-2 short sentences, and provide exact indented replacement code in suggestedReplacement whenever canAutoFix is true (preserve surrounding indentation). Do not invent bugs that are not present in the code.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const AI_SCAN_TIMEOUT_MS = 4500;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert multi-language security and bug analyzer. Return strictly valid JSON matching the schema. Be concise, accurate, and beginner-friendly in plainEnglishExplanation.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                line: { type: Type.INTEGER, description: '1-indexed start line number' },
                endLine: { type: Type.INTEGER, description: '1-indexed end line number' },
                category: {
                  type: Type.STRING,
                  description: 'One of: security, runtime, logic, modern',
                },
                severity: {
                  type: Type.STRING,
                  description: 'One of: critical, warning, info',
                },
                title: { type: Type.STRING, description: 'Short 4-8 word bug title' },
                cweOrRule: {
                  type: Type.STRING,
                  description: 'Short rule or CWE identifier, e.g. CWE-89 or AsyncRace',
                },
                plainEnglishExplanation: {
                  type: Type.STRING,
                  description: 'Beginner-friendly 1-2 sentence explanation without heavy jargon',
                },
                technicalExplanation: {
                  type: Type.STRING,
                  description: 'Precise engineering explanation of the bug or vulnerability',
                },
                impactSummary: {
                  type: Type.STRING,
                  description: 'Short 1-sentence impact summary',
                },
                suggestedReplacement: {
                  type: Type.STRING,
                  description: 'Exact replacement lines (preserving indentation) or empty string if manual',
                },
                canAutoFix: {
                  type: Type.BOOLEAN,
                  description: 'True only if suggestedReplacement cleanly replaces lines line..endLine',
                },
              },
              required: [
                'line',
                'endLine',
                'category',
                'severity',
                'title',
                'cweOrRule',
                'plainEnglishExplanation',
                'technicalExplanation',
                'impactSummary',
                'suggestedReplacement',
                'canAutoFix',
              ],
            },
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('503 UNAVAILABLE timeout')),
          AI_SCAN_TIMEOUT_MS
        );
      }),
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const rawText = (response.text ?? '[]').trim();
    const parsed = JSON.parse(rawText) as RawAiFinding[];
    const valid = Array.isArray(parsed) ? parsed : [];

    const findings: UnifiedBugFinding[] = valid
      .filter((item) => Number.isFinite(item.line) && item.line >= 1 && item.line <= lines.length)
      .slice(0, 6)
      .map((item, idx) => {
        const start = Math.max(1, Math.min(lines.length, Math.round(item.line)));
        const end = Math.max(start, Math.min(lines.length, Math.round(item.endLine || start)));
        const replacement =
          item.canAutoFix && typeof item.suggestedReplacement === 'string' && item.suggestedReplacement.trim().length > 0
            ? item.suggestedReplacement
            : null;
        return {
          id: `ai-${start}-${idx}`,
          line: start,
          endLine: end,
          source: 'ai-latest',
          category: normalizeCategory(item.category),
          severity: normalizeSeverity(item.severity),
          title: item.title || 'Modern Bug Pattern Detected',
          kind: item.cweOrRule || 'ModernPattern',
          plainEnglishExplanation: item.plainEnglishExplanation || item.technicalExplanation,
          technicalExplanation: item.technicalExplanation || item.plainEnglishExplanation,
          impactSummary: item.impactSummary || 'Potential reliability or security issue.',
          originalSnippet: lines.slice(start - 1, end).join('\n'),
          suggestedReplacement: replacement,
          canAutoFix: Boolean(replacement),
          cweOrRule: item.cweOrRule || 'AI-Latest',
          isModernPattern: true,
        };
      });

    return {
      findings,
      aiScanStatus: {
        status: 'ok',
        model: MODEL_NAME,
        findingsCount: findings.length,
        durationMs: Number((performance.now() - t0).toFixed(1)),
        message: `Latest AI scan (${MODEL_NAME}) checked modern bug & CVE patterns.`,
      },
    };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const rawMsg = err instanceof Error ? err.message : String(err);
    const isOverloaded =
      /503|UNAVAILABLE|overloaded|high demand/i.test(rawMsg);
    const isRateLimited = /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMsg);
    const friendlyMessage = isOverloaded
      ? 'AI scan temporarily busy — deterministic AST & sandbox checks completed.'
      : isRateLimited
      ? 'AI scan rate-limited — deterministic AST & sandbox checks completed.'
      : 'Deterministic AST & sandbox checks completed (AI deep scan unavailable).';

    return {
      findings: [],
      aiScanStatus: {
        status: 'error',
        model: MODEL_NAME,
        findingsCount: 0,
        durationMs: Number((performance.now() - t0).toFixed(1)),
        message: friendlyMessage,
      },
    };
  }
}

export async function transcribeVoiceNote(params: {
  audioBase64: string;
  mimeType: string;
  bugContext?: string;
}): Promise<{ transcript: string }> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY is not configured for automatic voice transcription.');
  }

  const cleanMime = (params.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  const promptText = params.bugContext
    ? `Transcribe this developer voice note explaining the reasoning behind code changes for: ${params.bugContext}. Output plain transcript text only.`
    : 'Transcribe this developer voice note accurately. Preserve code terms, identifiers, and reasoning. Output plain transcript text only.';

  const response = await client.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: params.audioBase64,
          },
        },
        { text: promptText },
      ],
    },
  });

  const transcript = (response.text ?? '').trim();
  return { transcript };
}

