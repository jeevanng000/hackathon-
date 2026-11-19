import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMultiLangAnalysis } from './engine/multi_lang_engine.ts';
import {
  runGeminiLatestBugScan,
  transcribeVoiceNote,
} from './engine/gemini_bug_scanner.ts';
import {
  executionSemaphore,
  getSandboxIsolationInfo,
  loadSandboxConfig,
} from './engine/sandbox_runner.ts';
import {
  getClientIp,
  loadSecurityLimits,
  logStructured,
  requestIdMiddleware,
  ServerAnalysisStore,
  SlidingWindowRateLimiter,
  validateAndResolveLanguage,
  validateSafeFilename,
  validateTargetLine,
  validateTimeoutSeconds,
} from './engine/server_security.ts';
import type { AnalysisResponse, TestRunResult } from './src/types/autopatch.ts';
import {
  EXECUTABLE_SANDBOX_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from './src/utils/languageDetect.ts';
import { buildUnifiedFindings } from './src/utils/unifiedFindings.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_PATH = path.resolve(__dirname, 'engine', 'autopatch_engine.py');
const PORT = Number(process.env.PORT || 3000);

interface EnginePayload {
  action: 'analyze' | 'validate';
  filename: string;
  testFilename: string;
  sourceCode?: string;
  originalCode?: string;
  candidateCode?: string;
  testCode: string;
  bugContext?: string;
  timeoutSeconds?: number;
  _trustedServerBaseline?: TestRunResult | null;
  targetLine?: number | null;
  bugType?: string;
  rootCause?: string;
}

/**
 * Invokes the local Python AST/SBFL/APR orchestrator with a minimal environment
 * (NEVER forwarding GEMINI_API_KEY or unrelated host secrets), bounded output cap,
 * concurrency throttling, and process-group SIGKILL on timeout.
 */
async function runPythonEngine(payload: EnginePayload): Promise<AnalysisResponse> {
  const cfg = loadSandboxConfig();
  const acquired = await executionSemaphore.acquire(cfg.maxConcurrentExecutions, 5000);
  if (!acquired) {
    const err = new Error('Analysis execution capacity temporarily saturated. Please retry shortly.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 503;
    throw err;
  }

  try {
    return await new Promise<AnalysisResponse>((resolve, reject) => {
      // Forward only non-secret sandbox tuning knobs and minimal PATH
      const cleanEnv: Record<string, string> = {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        PYTHONDONTWRITEBYTECODE: '1',
      };
      for (const k of [
        'SANDBOX_ALLOW_UNTRUSTED_EXEC',
        'SANDBOX_MEMORY_MB',
        'SANDBOX_CPU_SECONDS',
        'SANDBOX_MAX_OUTPUT_BYTES',
        'SANDBOX_MAX_FILE_BYTES',
        'SANDBOX_MAX_OPEN_FILES',
        'SANDBOX_MAX_PROCESSES',
      ]) {
        if (process.env[k] !== undefined) cleanEnv[k] = String(process.env[k]);
      }

      const child = spawn('python3', [ENGINE_PATH], {
        env: cleanEnv,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const maxEngineOut = 4 * 1024 * 1024;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const killTree = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killTree();
        reject(new Error('Python analysis engine exceeded wall-clock budget.'));
      }, 14000);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBytes < maxEngineOut) {
          stdoutChunks.push(chunk);
          stdoutBytes += chunk.length;
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes < 65536) {
          stderrChunks.push(chunk);
          stderrBytes += chunk.length;
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Python engine spawn error: ${err.message}`));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim();
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        if (code !== 0) {
          reject(new Error(stderr ? 'Python analysis engine returned an error.' : 'Python engine failed.'));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as AnalysisResponse;
          resolve({ ...parsed, language: 'python' });
        } catch {
          reject(new Error('Invalid JSON output returned by Python analysis engine.'));
        }
      });

      child.stdin?.write(JSON.stringify(payload));
      child.stdin?.end();
    });
  } finally {
    executionSemaphore.release();
  }
}

export function createAutoPatchApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);

  const limits = loadSecurityLimits();
  const rateLimiter = new SlidingWindowRateLimiter(60_000);
  const analysisStore = new ServerAnalysisStore(200, 30 * 60 * 1000);
  let activeAnalyses = 0;

  // Bounded JSON parsers: tight 300KB limit for code endpoints, dedicated 3MB limit only for audio transcription
  const standardJsonParser = express.json({ limit: '300kb' });
  const audioJsonParser = express.json({ limit: '3mb' });

  const checkRateLimit = (
    req: Request,
    res: Response,
    bucket: 'api' | 'ai' | 'transcribe',
    maxPerMin: number
  ): boolean => {
    const ip = getClientIp(req);
    const check = rateLimiter.check(`${bucket}:${ip}`, maxPerMin);
    res.setHeader('X-RateLimit-Limit', String(maxPerMin));
    res.setHeader('X-RateLimit-Remaining', String(check.remaining));
    if (!check.allowed) {
      res.setHeader('Retry-After', String(check.retryAfterSec));
      res.status(429).json({
        error: 'Too many requests. Please wait before retrying.',
        retryAfterSeconds: check.retryAfterSec,
      });
      return false;
    }
    return true;
  };

  app.get('/api/health', (_req, res) => {
    const isolation = getSandboxIsolationInfo();
    const cfg = loadSandboxConfig();
    res.json({
      ok: true,
      engine: 'autopatch-hardened-backend',
      sandbox: {
        level: isolation.level,
        isolatedUser: isolation.isolatedUser,
        networkIsolated: isolation.networkIsolated,
        pidIsolated: isolation.pidIsolated,
        activeExecutions: executionSemaphore.getActiveCount(),
        maxConcurrentExecutions: cfg.maxConcurrentExecutions,
        activeAnalyses,
        maxConcurrentAnalyses: limits.maxConcurrentAnalyses,
        limitations: isolation.limitations,
      },
      languages: {
        executableSandbox: Array.from(EXECUTABLE_SANDBOX_LANGUAGES),
        staticHeuristicOnly: SUPPORTED_LANGUAGES.filter((l) => l.executionMode !== 'sandbox-runtime').map(
          (l) => l.id
        ),
      },
      aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      auditStorageMode: 'client-local-only',
    });
  });

  app.post('/api/transcribe-note', audioJsonParser, async (req, res) => {
    const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';
    const t0 = performance.now();

    if (!checkRateLimit(req, res, 'transcribe', limits.maxAiRequestsPerMinute)) return;

    const { audioDataUrl, mimeType, bugContext } = req.body ?? {};
    if (typeof audioDataUrl !== 'string' || !audioDataUrl.includes(',')) {
      res.status(400).json({ error: 'Valid base64 audio data URL is required.' });
      return;
    }

    const headerPart = audioDataUrl.slice(0, audioDataUrl.indexOf(','));
    const dataUrlMime = headerPart.match(/^data:([^;,]+)/i)?.[1];
    const resolvedMime =
      typeof mimeType === 'string' && mimeType.trim()
        ? mimeType.trim()
        : dataUrlMime || 'audio/webm';

    const base64Data = audioDataUrl.slice(audioDataUrl.indexOf(',') + 1).trim();
    if (!base64Data) {
      res.status(400).json({ error: 'Audio recording payload is empty.' });
      return;
    }

    try {
      const result = await transcribeVoiceNote({
        audioBase64: base64Data,
        mimeType: resolvedMime,
        bugContext: typeof bugContext === 'string' ? bugContext.slice(0, 400) : undefined,
        maxAudioSizeBytes: limits.maxAudioSizeBytes,
      });
      logStructured('info', 'api.transcribe_note', {
        requestId,
        status: 200,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });
      res.json(result);
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode || 500;
      const safeMessage =
        status >= 500
          ? 'Unable to transcribe voice note right now.'
          : err instanceof Error
          ? err.message
          : 'Invalid audio payload.';
      logStructured(status >= 500 ? 'error' : 'warn', 'api.transcribe_note.failed', {
        requestId,
        status,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });
      res.status(status).json({ error: safeMessage });
    }
  });

  app.post('/api/analyze', standardJsonParser, async (req, res) => {
    const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';
    const t0 = performance.now();

    if (!checkRateLimit(req, res, 'api', limits.maxRequestsPerMinute)) return;

    const {
      filename,
      testFilename,
      sourceCode,
      testCode,
      bugContext,
      language,
      includeAiScan,
      timeoutSeconds,
    } = req.body ?? {};

    if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
      res.status(400).json({ error: 'Source file cannot be empty.' });
      return;
    }
    if (Buffer.byteLength(sourceCode, 'utf-8') > limits.maxSourceSizeBytes) {
      res.status(413).json({
        error: `Source file exceeds maximum size limit (${limits.maxSourceSizeBytes} bytes).`,
      });
      return;
    }
    if (testCode !== undefined && typeof testCode !== 'string') {
      res.status(400).json({ error: 'testCode must be a string when provided.' });
      return;
    }
    const safeTestCode = typeof testCode === 'string' ? testCode : '';
    if (Buffer.byteLength(safeTestCode, 'utf-8') > limits.maxTestSizeBytes) {
      res.status(413).json({
        error: `Test file exceeds maximum size limit (${limits.maxTestSizeBytes} bytes).`,
      });
      return;
    }
    const safeBugContext = typeof bugContext === 'string' ? bugContext : '';
    if (Buffer.byteLength(safeBugContext, 'utf-8') > limits.maxContextSizeBytes) {
      res.status(413).json({
        error: `Bug context exceeds maximum size limit (${limits.maxContextSizeBytes} bytes).`,
      });
      return;
    }

    const srcNameCheck = validateSafeFilename(filename, 'module.py', 'filename');
    if (!srcNameCheck.ok) {
      res.status(400).json({ error: srcNameCheck.error });
      return;
    }
    const testNameCheck = validateSafeFilename(
      testFilename,
      `test_${srcNameCheck.filename}`,
      'testFilename'
    );
    if (!testNameCheck.ok) {
      res.status(400).json({ error: testNameCheck.error });
      return;
    }

    const langCheck = validateAndResolveLanguage(language, srcNameCheck.filename);
    if (!langCheck.ok) {
      res.status(400).json({ error: langCheck.error });
      return;
    }

    const resolvedLang = langCheck.language;
    const clampedTimeout = validateTimeoutSeconds(timeoutSeconds, 2.0);
    const enableAi = includeAiScan !== false;

    if (activeAnalyses >= limits.maxConcurrentAnalyses) {
      res.setHeader('Retry-After', '2');
      res.status(503).json({
        error: 'Server is at maximum concurrent analysis capacity. Please retry shortly.',
      });
      return;
    }

    activeAnalyses++;
    try {
      const deterministicPromise: Promise<AnalysisResponse> =
        resolvedLang === 'python'
          ? runPythonEngine({
              action: 'analyze',
              filename: srcNameCheck.filename,
              testFilename: testNameCheck.filename,
              sourceCode,
              testCode: safeTestCode,
              bugContext: safeBugContext,
              timeoutSeconds: clampedTimeout,
            })
          : runMultiLangAnalysis({
              action: 'analyze',
              language: resolvedLang,
              filename: srcNameCheck.filename,
              testFilename: testNameCheck.filename,
              sourceCode,
              testCode: safeTestCode,
              bugContext: safeBugContext,
              timeoutSeconds: clampedTimeout,
            });

      // Separate rate limit for Gemini quota protection so deterministic engine still works if AI bucket is full
      let aiPromise: Promise<{
        findings: ReturnType<typeof buildUnifiedFindings>;
        aiScanStatus: NonNullable<AnalysisResponse['aiScanStatus']>;
      }>;
      if (!enableAi) {
        aiPromise = Promise.resolve({
          findings: [],
          aiScanStatus: {
            status: 'skipped',
            findingsCount: 0,
            message: 'AI scan bypassed for deterministic-only run.',
          },
        });
      } else {
        const aiRateCheck = rateLimiter.check(`ai:${getClientIp(req)}`, limits.maxAiRequestsPerMinute);
        if (!aiRateCheck.allowed) {
          aiPromise = Promise.resolve({
            findings: [],
            aiScanStatus: {
              status: 'skipped',
              findingsCount: 0,
              message: 'AI scan rate-limited for this client; showing deterministic analysis only.',
            },
          });
        } else {
          aiPromise = runGeminiLatestBugScan({
            filename: srcNameCheck.filename,
            language: resolvedLang,
            sourceCode,
            bugContext: safeBugContext,
          });
        }
      }

      const [detResult, aiResult] = await Promise.all([deterministicPromise, aiPromise]);

      // Store server-computed baseline under an opaque analysisId bound to SHA-256 of inputs
      const analysisId = analysisStore.save({
        originalCode: sourceCode,
        testCode: safeTestCode,
        filename: srcNameCheck.filename,
        testFilename: testNameCheck.filename,
        language: resolvedLang,
        baseline: detResult.baseline,
      });

      const unifiedFindings = buildUnifiedFindings(detResult, aiResult.findings);

      logStructured('info', 'api.analyze', {
        requestId,
        language: resolvedLang,
        verificationMode: detResult.verificationMode,
        trustVerdict: detResult.trustVerdict,
        aiStatus: aiResult.aiScanStatus.status,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });

      res.json({
        ...detResult,
        analysisId,
        unifiedFindings,
        aiScanStatus: aiResult.aiScanStatus,
      });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode || 500;
      logStructured('error', 'api.analyze.failed', {
        requestId,
        language: resolvedLang,
        status,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });
      res.status(status).json({
        error:
          status === 503
            ? 'Analysis engine is temporarily at capacity. Please retry shortly.'
            : 'Failed to run AutoPatch analysis engine.',
      });
    } finally {
      activeAnalyses = Math.max(0, activeAnalyses - 1);
    }
  });

  app.post('/api/validate', standardJsonParser, async (req, res) => {
    const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';
    const t0 = performance.now();

    if (!checkRateLimit(req, res, 'api', limits.maxRequestsPerMinute)) return;

    const {
      analysisId,
      filename,
      testFilename,
      language,
      originalCode,
      candidateCode,
      testCode,
      targetLine,
      bugType,
      rootCause,
      timeoutSeconds,
    } = req.body ?? {};
    // NOTE: Any client-supplied `baseline`, `confidence`, `sbfl`, or `trustVerdict` in req.body
    // is intentionally IGNORED to prevent baseline forgery.

    if (typeof candidateCode !== 'string' || !candidateCode.trim()) {
      res.status(400).json({ error: 'Candidate patch code cannot be empty.' });
      return;
    }
    const safeOriginal = typeof originalCode === 'string' ? originalCode : candidateCode;
    const safeTestCode = typeof testCode === 'string' ? testCode : '';

    if (
      Buffer.byteLength(candidateCode, 'utf-8') > limits.maxSourceSizeBytes ||
      Buffer.byteLength(safeOriginal, 'utf-8') > limits.maxSourceSizeBytes
    ) {
      res.status(413).json({
        error: `Source/candidate code exceeds maximum size limit (${limits.maxSourceSizeBytes} bytes).`,
      });
      return;
    }
    if (Buffer.byteLength(safeTestCode, 'utf-8') > limits.maxTestSizeBytes) {
      res.status(413).json({
        error: `Test file exceeds maximum size limit (${limits.maxTestSizeBytes} bytes).`,
      });
      return;
    }

    const srcNameCheck = validateSafeFilename(filename, 'module.py', 'filename');
    if (!srcNameCheck.ok) {
      res.status(400).json({ error: srcNameCheck.error });
      return;
    }
    const testNameCheck = validateSafeFilename(
      testFilename,
      `test_${srcNameCheck.filename}`,
      'testFilename'
    );
    if (!testNameCheck.ok) {
      res.status(400).json({ error: testNameCheck.error });
      return;
    }

    const langCheck = validateAndResolveLanguage(language, srcNameCheck.filename);
    if (!langCheck.ok) {
      res.status(400).json({ error: langCheck.error });
      return;
    }
    const lineCheck = validateTargetLine(targetLine);
    if (!lineCheck.ok) {
      res.status(400).json({ error: lineCheck.error });
      return;
    }

    const resolvedLang = langCheck.language;
    const clampedTimeout = validateTimeoutSeconds(timeoutSeconds, 2.0);

    if (activeAnalyses >= limits.maxConcurrentAnalyses) {
      res.setHeader('Retry-After', '2');
      res.status(503).json({
        error: 'Server is at maximum concurrent validation capacity. Please retry shortly.',
      });
      return;
    }

    // Look up server-verified baseline ONLY if analysisId matches SHA-256 of current inputs
    const trustedBaseline = analysisStore.getVerifiedBaseline({
      analysisId,
      originalCode: safeOriginal,
      testCode: safeTestCode,
      filename: srcNameCheck.filename,
      language: resolvedLang,
    });

    activeAnalyses++;
    try {
      const result =
        resolvedLang === 'python'
          ? await runPythonEngine({
              action: 'validate',
              filename: srcNameCheck.filename,
              testFilename: testNameCheck.filename,
              originalCode: safeOriginal,
              candidateCode,
              testCode: safeTestCode,
              _trustedServerBaseline: trustedBaseline,
              targetLine: lineCheck.value,
              bugType: typeof bugType === 'string' ? bugType.slice(0, 80) : undefined,
              rootCause: typeof rootCause === 'string' ? rootCause.slice(0, 500) : undefined,
              timeoutSeconds: clampedTimeout,
            })
          : await runMultiLangAnalysis({
              action: 'validate',
              language: resolvedLang,
              filename: srcNameCheck.filename,
              testFilename: testNameCheck.filename,
              originalCode: safeOriginal,
              candidateCode,
              testCode: safeTestCode,
              _trustedServerBaseline: trustedBaseline,
              targetLine: lineCheck.value,
              bugType: typeof bugType === 'string' ? bugType.slice(0, 80) : undefined,
              rootCause: typeof rootCause === 'string' ? rootCause.slice(0, 500) : undefined,
              timeoutSeconds: clampedTimeout,
            });

      const unifiedFindings = buildUnifiedFindings(result, []);

      logStructured('info', 'api.validate', {
        requestId,
        language: resolvedLang,
        usedCachedBaseline: Boolean(trustedBaseline),
        verificationMode: result.verificationMode,
        trustVerdict: result.trustVerdict,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });

      res.json({
        ...result,
        unifiedFindings,
      });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode || 500;
      logStructured('error', 'api.validate.failed', {
        requestId,
        language: resolvedLang,
        status,
        durationMs: Number((performance.now() - t0).toFixed(1)),
      });
      res.status(status).json({
        error:
          status === 503
            ? 'Validation engine is temporarily at capacity. Please retry shortly.'
            : 'Failed to validate candidate patch.',
      });
    } finally {
      activeAnalyses = Math.max(0, activeAnalyses - 1);
    }
  });

  // Centralized Express error middleware (handles malformed JSON 400, oversized body 413, unexpected 500 cleanly without leaking stack traces)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';
    const errObj = err as { type?: string; status?: number; statusCode?: number };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      logStructured('warn', 'api.payload_too_large', { requestId, path: req.path });
      res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
      return;
    }
    if (errObj?.type === 'entity.parse.failed' || errObj?.status === 400) {
      logStructured('warn', 'api.invalid_json', { requestId, path: req.path });
      res.status(400).json({ error: 'Malformed JSON request body.' });
      return;
    }
    logStructured('error', 'api.unhandled_error', { requestId, path: req.path });
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

async function startServer() {
  const app = createAutoPatchApp();
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    // Keep HMR disabled by default in AI Studio proxy mode (avoids WebSocket rejection),
    // while allowing local developers to opt in with ENABLE_LOCAL_HMR=true.
    const enableLocalHmr =
      process.env.ENABLE_LOCAL_HMR === 'true' && process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: enableLocalHmr },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    logStructured('info', 'server.started', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      sandboxLevel: getSandboxIsolationInfo().level,
    });
  });
}

// Only start HTTP listener when executed directly (allows importing createAutoPatchApp in tests!)
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer().catch((err) => {
    logStructured('error', 'server.start_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
    process.exit(1);
  });
}
