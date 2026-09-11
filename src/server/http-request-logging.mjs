import { randomUUID } from 'node:crypto';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export function establishRequestContext(_request, response, idFactory = randomUUID) {
  const requestId = idFactory();
  response.setHeader('X-Request-ID', requestId);
  return { requestId };
}

function safeMethod(method) {
  return ALLOWED_METHODS.has(method) ? method : 'OTHER';
}

function outcomeForStatus(statusCode) {
  if (statusCode >= 500) return { event: 'http.request.failed', result: 'failure', level: 'ERROR' };
  if (statusCode >= 400) return { event: 'http.request.rejected', result: 'rejected', level: 'WARN' };
  return { event: 'http.request.completed', result: 'success', level: 'INFO' };
}

export async function handleHttpRequest({ request, response, requestHandler, logger, now = performance.now.bind(performance), idFactory }) {
  const startedAt = now();
  const { requestId } = establishRequestContext(request, response, idFactory);
  let logged = false;

  const logOutcome = (connectionClosedEarly = false) => {
    if (logged) return;
    logged = true;
    const statusCode = Number.isInteger(response.statusCode) ? response.statusCode : 500;
    const outcome = connectionClosedEarly
      ? { event: 'http.request.failed', result: 'failure', level: 'WARN' }
      : outcomeForStatus(statusCode);
    logger.log({
      ...outcome,
      requestId,
      durationMs: now() - startedAt,
      errorCode: connectionClosedEarly ? 'CONNECTION_CLOSED' : statusCode >= 400 ? `HTTP_${statusCode}` : null,
      fields: {
        http_method: safeMethod(request.method),
        status_code: statusCode,
      },
    });
  };

  response.once('finish', () => logOutcome(false));
  response.once('close', () => logOutcome(response.writableFinished === false));

  try {
    await requestHandler(request, response);
  } catch {
    logger.log({
      level: 'ERROR',
      event: 'http.request.exception',
      result: 'failure',
      requestId,
      durationMs: now() - startedAt,
      errorCode: 'UNHANDLED_REQUEST_ERROR',
      fields: { http_method: safeMethod(request.method) },
    });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    if (!response.writableEnded) response.end('Internal Server Error');
  }
}
