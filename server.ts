import express from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMultiLangAnalysis } from './engine/multi_lang_engine';
import {
  detectLanguageFromFilename,
  type SupportedLanguage,
} from './src/utils/languageDetect';

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
  timeoutSeconds?: number;
  baseline?: unknown;
  targetLine?: number | null;
  bugType?: string;
  rootCause?: string;
}

function runPythonEngine(payload: EnginePayload): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'python3',
      [ENGINE_PATH],
      {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 12000,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message || 'Python engine failed'));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
          resolve({ ...parsed, language: 'python' });
        } catch (parseErr) {
          reject(
            new Error(
              `Invalid engine output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
            )
          );
        }
      }
    );

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

function resolveLanguage(explicitLang: unknown, filename: string): SupportedLanguage {
  if (typeof explicitLang === 'string' && explicitLang && explicitLang !== 'auto') {
    return explicitLang as SupportedLanguage;
  }
  return detectLanguageFromFilename(filename);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, engine: 'autopatch-multi-language-sandbox' });
  });

  app.post('/api/analyze', async (req, res) => {
    const { filename, testFilename, sourceCode, testCode, language } = req.body ?? {};
    if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
      res.status(400).json({ error: 'Source file cannot be empty.' });
      return;
    }

    const safeFilename =
      typeof filename === 'string' && filename.trim() ? filename.trim() : 'module.py';
    const resolvedLang = resolveLanguage(language, safeFilename);

    // Runtime-sandbox languages require a unit test suite; static-verifier languages allow optional tests
    const needsTests = ['python', 'javascript', 'typescript', 'c', 'cpp', 'bash'].includes(
      resolvedLang
    );
    if (needsTests && (typeof testCode !== 'string' || !testCode.trim())) {
      res.status(400).json({ error: 'Unit test suite cannot be empty for runtime sandbox languages.' });
      return;
    }

    const safeTestFilename =
      typeof testFilename === 'string' && testFilename.trim()
        ? testFilename.trim()
        : `test_${safeFilename}`;

    try {
      if (resolvedLang === 'python') {
        const result = await runPythonEngine({
          action: 'analyze',
          filename: safeFilename,
          testFilename: safeTestFilename,
          sourceCode,
          testCode: typeof testCode === 'string' ? testCode : '',
          timeoutSeconds: 2.0,
        });
        res.json(result);
        return;
      }

      const result = await runMultiLangAnalysis({
        action: 'analyze',
        language: resolvedLang,
        filename: safeFilename,
        testFilename: safeTestFilename,
        sourceCode,
        testCode: typeof testCode === 'string' ? testCode : '',
        timeoutSeconds: 2.0,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to run AutoPatch analysis engine.',
      });
    }
  });

  app.post('/api/validate', async (req, res) => {
    const {
      filename,
      testFilename,
      language,
      originalCode,
      candidateCode,
      testCode,
      baseline,
      targetLine,
      bugType,
      rootCause,
    } = req.body ?? {};

    if (typeof candidateCode !== 'string' || !candidateCode.trim()) {
      res.status(400).json({ error: 'Candidate patch code cannot be empty.' });
      return;
    }

    const safeFilename =
      typeof filename === 'string' && filename.trim() ? filename.trim() : 'module.py';
    const safeTestFilename =
      typeof testFilename === 'string' && testFilename.trim()
        ? testFilename.trim()
        : `test_${safeFilename}`;
    const resolvedLang = resolveLanguage(language, safeFilename);

    try {
      if (resolvedLang === 'python') {
        const result = await runPythonEngine({
          action: 'validate',
          filename: safeFilename,
          testFilename: safeTestFilename,
          originalCode: typeof originalCode === 'string' ? originalCode : candidateCode,
          candidateCode,
          testCode: typeof testCode === 'string' ? testCode : '',
          baseline,
          targetLine,
          bugType,
          rootCause,
          timeoutSeconds: 2.0,
        });
        res.json(result);
        return;
      }

      const result = await runMultiLangAnalysis({
        action: 'validate',
        language: resolvedLang,
        filename: safeFilename,
        testFilename: safeTestFilename,
        originalCode: typeof originalCode === 'string' ? originalCode : candidateCode,
        candidateCode,
        testCode: typeof testCode === 'string' ? testCode : '',
        baseline,
        targetLine,
        bugType,
        rootCause,
        timeoutSeconds: 2.0,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to validate candidate patch.',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoPatch server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
