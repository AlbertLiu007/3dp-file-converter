import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createJsonLogger, sanitizeLogValue } from './json-logger.mjs';
import { handleHttpRequest } from './http-request-logging.mjs';

function memoryStream() {
  let output = '';
  return {
    write(chunk) { output += chunk; },
    read() { return output; },
  };
}

class TestResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  writableFinished = false;
  headers = new Map();

  setHeader(name, value) {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name) {
    return this.headers.get(name.toLowerCase());
  }

  end() {
    this.headersSent = true;
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit('finish');
  }
}

test('logger emits one-line JSON with required fields', () => {
  const stdout = memoryStream();
  const logger = createJsonLogger({ stdout, stderr: null, filePath: null, environment: 'test' });
  logger.log({ event: 'service.started', result: 'success', durationMs: 12.6 });

  const lines = stdout.read().trimEnd().split('\n');
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(record).slice(0, 9), [
    'time', 'level', 'service', 'environment', 'event', 'result', 'request_id', 'duration_ms', 'error_code',
  ]);
  assert.equal(record.service, 'unionam-converter');
  assert.equal(record.environment, 'test');
  assert.equal(record.duration_ms, 13);
  assert.equal(record.error_code, null);
});

test('additional fields cannot overwrite the compliance fields', () => {
  const stdout = memoryStream();
  const logger = createJsonLogger({ stdout, stderr: null, filePath: null, environment: 'test' });
  logger.log({
    event: 'service.started',
    requestId: 'trusted',
    fields: { service: 'spoofed', request_id: 'spoofed', event: 'spoofed', error_code: 'spoofed' },
  });

  const record = JSON.parse(stdout.read());
  assert.equal(record.service, 'unionam-converter');
  assert.equal(record.request_id, 'trusted');
  assert.equal(record.event, 'service.started');
  assert.equal(record.error_code, null);
});

test('recursive sanitizer redacts sensitive and prohibited content fields', () => {
  const sanitized = sanitizeLogValue({
    password: 'p',
    nested: {
      authToken: 't',
      Authorization: 'a',
      cookie_value: 'c',
      clientSecret: 's',
      phone: '1',
      emailAddress: 'e',
      access_key: 'k',
      signature: 'sig',
      verification_code: '123456',
      captcha: 'answer',
      envVar: 'PRIVATE_VALUE',
      requestBody: 'contents',
      fileName: 'private.stl',
      dimensions: '1x2x3',
      triangleCount: 42,
    },
  });

  assert.equal(sanitized.password, '[REDACTED]');
  for (const value of Object.values(sanitized.nested)) assert.equal(value, '[REDACTED]');
});

test('external strings cannot inject additional log lines and are length limited', () => {
  const stdout = memoryStream();
  const logger = createJsonLogger({ stdout, stderr: null, filePath: null, environment: 'test' });
  logger.log({ event: 'test.event', fields: { external: `first\r\nsecond\u0000${'x'.repeat(700)}` } });

  assert.equal(stdout.read().trimEnd().split('\n').length, 1);
  const record = JSON.parse(stdout.read());
  assert.match(record.external, /first\\r\\nsecond\\u0000/);
  assert.ok(record.external.length <= 513);
});

test('server creates a trusted request id and ignores the public header', async () => {
  const stdout = memoryStream();
  const logger = createJsonLogger({ stdout, stderr: null, filePath: null, environment: 'test' });
  const response = new TestResponse();
  const request = { method: 'GET', headers: { 'x-request-id': 'attacker-controlled' } };
  const times = [10, 25];

  await handleHttpRequest({
    request,
    response,
    logger,
    idFactory: () => 'trusted-request-id',
    now: () => times.shift() ?? 25,
    requestHandler: async (_request, res) => res.end(),
  });

  assert.equal(response.getHeader('X-Request-ID'), 'trusted-request-id');
  const record = JSON.parse(stdout.read());
  assert.equal(record.event, 'http.request.completed');
  assert.equal(record.request_id, 'trusted-request-id');
  assert.equal(record.duration_ms, 15);
  assert.doesNotMatch(stdout.read(), /attacker-controlled/);
});

test('HTTP rejection and exception produce the expected key events', async () => {
  const stdout = memoryStream();
  const logger = createJsonLogger({ stdout, stderr: null, filePath: null, environment: 'test' });
  const rejectedResponse = new TestResponse();
  rejectedResponse.statusCode = 404;
  await handleHttpRequest({
    request: { method: 'GET', headers: {} },
    response: rejectedResponse,
    logger,
    idFactory: () => 'request-404',
    now: () => 1,
    requestHandler: async (_request, res) => res.end(),
  });

  const failedResponse = new TestResponse();
  await handleHttpRequest({
    request: { method: 'POST', headers: {} },
    response: failedResponse,
    logger,
    idFactory: () => 'request-500',
    now: () => 1,
    requestHandler: async () => { throw new Error('must not appear in logs'); },
  });

  const records = stdout.read().trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(({ event }) => event), [
    'http.request.rejected',
    'http.request.exception',
    'http.request.failed',
  ]);
  assert.doesNotMatch(stdout.read(), /must not appear/);
});

test('logging transport failures never escape into business code', () => {
  const brokenStream = { write() { throw new Error('disk unavailable'); } };
  const logger = createJsonLogger({ stdout: brokenStream, stderr: brokenStream, filePath: null, environment: 'test' });
  assert.doesNotThrow(() => logger.log({ event: 'service.started' }));
});
