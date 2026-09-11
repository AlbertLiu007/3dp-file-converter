import { createServer } from 'node:http';
import next from 'next';
import { createJsonLogger } from './src/server/json-logger.mjs';
import { handleHttpRequest } from './src/server/http-request-logging.mjs';

const development = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const distDir = process.env.NEXT_DIST_DIR ?? (development ? '.next-dev' : '.next-build');
const logger = createJsonLogger();
const application = next({ dev: development, hostname, port, conf: { distDir } });

process.on('uncaughtExceptionMonitor', () => {
  logger.log({
    level: 'FATAL',
    event: 'process.uncaught_exception',
    result: 'failure',
    errorCode: 'UNCAUGHT_EXCEPTION',
  });
});

try {
  const startedAt = performance.now();
  await application.prepare();
  const requestHandler = application.getRequestHandler();
  const server = createServer((request, response) => {
    void handleHttpRequest({ request, response, requestHandler, logger });
  });

  server.on('clientError', (_error, socket) => {
    logger.log({
      level: 'WARN',
      event: 'http.connection.rejected',
      result: 'rejected',
      errorCode: 'INVALID_HTTP_REQUEST',
    });
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  server.once('error', () => {
    logger.log({
      level: 'FATAL',
      event: 'service.start.failed',
      result: 'failure',
      errorCode: 'LISTEN_FAILED',
    });
    logger.close();
    process.exitCode = 1;
  });

  server.listen(port, hostname, () => {
    logger.log({
      event: 'service.started',
      result: 'success',
      durationMs: performance.now() - startedAt,
      fields: { port },
    });
  });
} catch {
  logger.log({
    level: 'FATAL',
    event: 'service.start.failed',
    result: 'failure',
    errorCode: 'STARTUP_FAILED',
  });
  logger.close();
  process.exitCode = 1;
}
