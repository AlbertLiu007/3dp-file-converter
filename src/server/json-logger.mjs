import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname } from 'node:path';

export const SERVICE_NAME = 'unionam-converter';
export const DEFAULT_APPLICATION_LOG_PATH = '/var/log/unionam/unionam-converter/application.jsonl';

const MAX_STRING_LENGTH = 512;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  'phone',
  'email',
  'accesskey',
  'signature',
  'verificationcode',
  'verifycode',
  'captcha',
  'otp',
  'environmentvariable',
  'envvar',
];
const PROHIBITED_CONTENT_KEYS = [
  'body',
  'payload',
  'filename',
  'filepath',
  'fileformat',
  'filesize',
  'dimension',
  'volume',
  'triangle',
  'modelcontent',
  'imagecontent',
  'signedurl',
];

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mustRedactKey(key) {
  const normalized = normalizedKey(key);
  return [...SENSITIVE_KEY_FRAGMENTS, ...PROHIBITED_CONTENT_KEYS].some((fragment) => normalized.includes(fragment));
}

export function sanitizeLogString(value, maxLength = MAX_STRING_LENGTH) {
  const escaped = String(value).replace(/[\u0000-\u001f\u007f]/g, (character) => {
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (character === '\t') return '\\t';
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });

  return escaped.length > maxLength ? `${escaped.slice(0, maxLength)}…` : escaped;
}

export function sanitizeLogValue(value, key = '', seen = new WeakSet()) {
  if (mustRedactKey(key)) return REDACTED;
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return sanitizeLogString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return sanitizeLogString(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Error) return REDACTED;

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Array.isArray(value)) {
      const result = value.slice(0, 50).map((item) => sanitizeLogValue(item, '', seen));
      seen.delete(value);
      return result;
    }

    const result = Object.create(null);
    for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) {
      const sanitized = sanitizeLogValue(childValue, childKey, seen);
      if (sanitized !== undefined) result[sanitizeLogString(childKey, 128)] = sanitized;
    }
    seen.delete(value);
    return result;
  }

  return sanitizeLogString(value);
}

function normalizeEnvironment(value) {
  if (value === 'production' || value === 'development' || value === 'test') return value;
  return 'unknown';
}

function normalizeDuration(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function safeWrite(stream, line) {
  try {
    stream?.write(`${line}\n`);
  } catch {
    // Logging must never interrupt the application.
  }
}

export function createJsonLogger(options = {}) {
  const service = sanitizeLogString(options.service ?? SERVICE_NAME, 128);
  const environment = normalizeEnvironment(options.environment ?? process.env.NODE_ENV);
  const stdout = options.stdout === undefined ? process.stdout : options.stdout;
  const stderr = options.stderr === undefined ? process.stderr : options.stderr;
  const filePath = options.filePath === undefined
    ? process.env.UNIONAM_APPLICATION_LOG_PATH ?? DEFAULT_APPLICATION_LOG_PATH
    : options.filePath;
  let fileStream;
  let fileUnavailable = false;
  let transportFailureReported = false;

  function baseRecord(level, event, result, requestId, durationMs, errorCode) {
    return {
      time: new Date().toISOString(),
      level: sanitizeLogString(level, 16),
      service,
      environment,
      event: sanitizeLogString(event, 128),
      result: sanitizeLogString(result, 32),
      request_id: sanitizeLogString(requestId || 'none', 128),
      duration_ms: normalizeDuration(durationMs),
      error_code: errorCode ? sanitizeLogString(errorCode, 128) : null,
    };
  }

  function reportTransportFailure() {
    if (transportFailureReported) return;
    transportFailureReported = true;
    const record = baseRecord('WARN', 'logging.transport.failed', 'degraded', 'none', 0, 'LOG_FILE_UNAVAILABLE');
    safeWrite(stderr, JSON.stringify(record));
  }

  function getFileStream() {
    if (!filePath || fileUnavailable) return null;
    if (fileStream) return fileStream;

    try {
      mkdirSync(dirname(filePath), { recursive: true, mode: 0o750 });
      fileStream = createWriteStream(filePath, { flags: 'a', mode: 0o640 });
      fileStream.on('error', () => {
        fileUnavailable = true;
        fileStream = undefined;
        reportTransportFailure();
      });
      return fileStream;
    } catch {
      fileUnavailable = true;
      reportTransportFailure();
      return null;
    }
  }

  return {
    log({ level = 'INFO', event, result = 'success', requestId = 'none', durationMs = 0, errorCode = null, fields = {} }) {
      try {
        const record = {
          ...sanitizeLogValue(fields),
          ...baseRecord(level, event, result, requestId, durationMs, errorCode),
        };
        const line = JSON.stringify(record);
        safeWrite(stdout, line);
        safeWrite(getFileStream(), line);
        return record;
      } catch {
        reportTransportFailure();
        return null;
      }
    },
    close() {
      try {
        fileStream?.end();
      } catch {
        // Logging must never interrupt shutdown.
      }
    },
  };
}
