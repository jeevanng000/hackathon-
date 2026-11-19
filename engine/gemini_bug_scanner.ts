import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiScanStatus,
  BugCategory,
  BugSeverity,
  UnifiedBugFinding,
} from '../src/types/autopatch.ts';

const MODEL_NAME = 'gemini-4-hydrogen';

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

  try {
    const response = await client.models.generateContent({
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
    });

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
    const msg = err instanceof Error ? err.message : String(err);
    return {
      findings: [],
      aiScanStatus: {
        status: 'error',
        model: MODEL_NAME,
        findingsCount: 0,
        durationMs: Number((performance.now() - t0).toFixed(1)),
        message: `Live AI scan could not complete (${msg}). Deterministic AST & sandbox checks still ran.`,
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

