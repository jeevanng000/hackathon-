/**
 * Centralized AutoPatch Environment & Configuration Module
 *
 * Strictly separates:
 *  - Secrets / credentials (GEMINI_API_KEY, NEO4J_PASSWORD, AUTOPATCH_API_KEY)
 *  - Non-secret runtime configuration (models, limits, timeouts, feature flags)
 *
 * Guarantees:
 *  - Safe defaults for every non-secret variable so the backend always boots cleanly
 *  - Graceful degradation when optional integrations (Gemini / Neo4j) are unconfigured
 *  - Never logs or serializes raw secret values
 */

export interface GeminiConfig {
  apiKey: string | null;
  configured: boolean;
  model: string;
  transcribeModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  timeoutMs: number;
  transcribeTimeoutMs: number;
  dailyQuota: number;
}

export interface Neo4jConfig {
  enabled: boolean;
  configured: boolean;
  uri: string | null;
  username: string | null;
  password: string | null;
  database: string;
  instanceId: string | null;
  instanceName: string | null;
  maxTraversalDepth: number;
  maxNodes: number;
  embeddingBatchSize: number;
}

export interface AppEnvConfig {
  port: number;
  nodeEnv: string;
  disableHmr: boolean;
  enableLocalHmr: boolean;
  apiKeyAuthToken: string | null;
  auditLogPath: string;
  gemini: GeminiConfig;
  neo4j: Neo4jConfig;
}

export interface StartupValidationReport {
  ok: boolean;
  warnings: string[];
  errors: string[];
  secretsStatus: {
    geminiApiKey: 'configured' | 'missing';
    neo4jPassword: 'configured' | 'missing';
    autopatchApiKey: 'configured' | 'optional-unset';
  };
  features: {
    deterministicEngine: boolean;
    geminiAi: boolean;
    graphRagEnabled: boolean;
    graphRagConfigured: boolean;
    apiKeyAuthEnabled: boolean;
  };
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  return raw.trim();
}

function readOptionalSecret(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const norm = raw.trim().toLowerCase();
  if (norm === 'true' || norm === '1' || norm === 'yes') return true;
  if (norm === 'false' || norm === '0' || norm === 'no') return false;
  return fallback;
}

export function loadAppEnvConfig(): AppEnvConfig {
  const geminiApiKey = readOptionalSecret('GEMINI_API_KEY');
  const neo4jUri = readOptionalSecret('NEO4J_URI');
  const neo4jUsername = readOptionalSecret('NEO4J_USERNAME');
  const neo4jPassword = readOptionalSecret('NEO4J_PASSWORD');
  const neo4jDatabase = readString('NEO4J_DATABASE', 'neo4j');
  const neo4jConfigured = Boolean(neo4jUri && neo4jUsername && neo4jPassword);
  const graphRagEnabled = readBool('GRAPHRAG_ENABLED', neo4jConfigured);

  return {
    port: readInt('PORT', 3000, 1, 65535),
    nodeEnv: readString('NODE_ENV', 'development'),
    disableHmr: readBool('DISABLE_HMR', true),
    enableLocalHmr: readBool('ENABLE_LOCAL_HMR', false),
    apiKeyAuthToken: readOptionalSecret('AUTOPATCH_API_KEY'),
    auditLogPath: readString('AUDIT_LOG_PATH', '.autopatch-data/audit-ledger.ndjson'),
    gemini: {
      apiKey: geminiApiKey,
      configured: Boolean(geminiApiKey),
      model: readString('GEMINI_MODEL', 'gemini-4-hydrogen'),
      transcribeModel: readString('GEMINI_TRANSCRIBE_MODEL', 'gemini-3.5-transcribe'),
      embeddingModel: readString('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001'),
      embeddingDimensions: readInt('GEMINI_EMBEDDING_DIMENSIONS', 768, 128, 3072),
      timeoutMs: readInt('GEMINI_TIMEOUT_MS', 8000, 1500, 30000),
      transcribeTimeoutMs: readInt('GEMINI_TRANSCRIBE_TIMEOUT_MS', 10000, 2000, 30000),
      dailyQuota: readInt('GEMINI_DAILY_QUOTA', 500, 10, 100000),
    },
    neo4j: {
      enabled: graphRagEnabled,
      configured: neo4jConfigured,
      uri: neo4jUri,
      username: neo4jUsername,
      password: neo4jPassword,
      database: neo4jDatabase,
      instanceId: readOptionalSecret('AURA_INSTANCEID'),
      instanceName: readOptionalSecret('AURA_INSTANCENAME'),
      maxTraversalDepth: readInt('GRAPHRAG_MAX_TRAVERSAL_DEPTH', 2, 1, 3),
      maxNodes: readInt('GRAPHRAG_MAX_NODES', 50, 5, 200),
      embeddingBatchSize: readInt('GRAPHRAG_EMBEDDING_BATCH_SIZE', 16, 1, 64),
    },
  };
}

export function validateStartupConfig(): StartupValidationReport {
  const cfg = loadAppEnvConfig();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!cfg.gemini.configured) {
    warnings.push(
      'GEMINI_API_KEY is not set. Deterministic static/sandbox analysis remains fully operational; AI bug scanning, voice transcription, embeddings, and GraphRAG synthesis will degrade gracefully.'
    );
  }

  if (cfg.neo4j.enabled && !cfg.neo4j.configured) {
    warnings.push(
      'GRAPHRAG_ENABLED is true, but one or more Neo4j credentials (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD) are missing. Core AutoPatch will start normally with GraphRAG degraded.'
    );
  }

  if (cfg.neo4j.uri && !/^(neo4j|neo4j\+s|neo4j\+ssc|bolt|bolt\+s|bolt\+ssc):\/\//i.test(cfg.neo4j.uri)) {
    errors.push('NEO4J_URI must use a valid Neo4j scheme (neo4j+s://, neo4j://, bolt+s://, or bolt://).');
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    secretsStatus: {
      geminiApiKey: cfg.gemini.configured ? 'configured' : 'missing',
      neo4jPassword: cfg.neo4j.password ? 'configured' : 'missing',
      autopatchApiKey: cfg.apiKeyAuthToken ? 'configured' : 'optional-unset',
    },
    features: {
      deterministicEngine: true,
      geminiAi: cfg.gemini.configured,
      graphRagEnabled: cfg.neo4j.enabled,
      graphRagConfigured: cfg.neo4j.configured,
      apiKeyAuthEnabled: Boolean(cfg.apiKeyAuthToken),
    },
  };
}

/**
 * Redacts any configured secret values or common secret patterns from error messages / logs.
 */
export function redactSecrets(input: string): string {
  if (!input) return '';
  let out = input;
  for (const envName of ['GEMINI_API_KEY', 'NEO4J_PASSWORD', 'AUTOPATCH_API_KEY']) {
    const val = process.env[envName]?.trim();
    if (val && val.length >= 6) {
      out = out.split(val).join('[REDACTED]');
    }
  }
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
  out = out.replace(/(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"]?[^\s'",;]+/gi, '$1=[REDACTED]');
  return out;
}
