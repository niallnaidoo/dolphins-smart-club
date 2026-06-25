/**
 * Sentry initialisation for the API Lambda.
 *
 * Imported FIRST (before Hono / AWS SDK) by index.ts so init runs at module load,
 * before any client is constructed. Errors-only: no performance tracing, no OTEL
 * auto-instrumentation, so the `--import` preload AWS-Lambda needs for tracing is
 * not required here.
 *
 * Guarded on SENTRY_DSN presence, so local dev / tests (no DSN) are a complete
 * no-op — nothing is sent. `STAGE !== 'local'` is a second belt: the local dev
 * server sets STAGE=local.
 */
import * as Sentry from '@sentry/aws-serverless';

if (process.env.SENTRY_DSN && process.env.STAGE !== 'local') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.STAGE ?? 'unknown',
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: true,
    tracesSampleRate: 0, // errors only — no transactions
    // Minimal POPIA hardening even with sendDefaultPii on: Sentry redacts the
    // Authorization header but NOT custom ones. Drop the dev identity header so
    // base64-encoded identity never lands in the EU store. Request bodies are not
    // captured by default — keep it that way (don't add body capture).
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        delete headers['x-dev-auth'];
        delete headers['X-Dev-Auth'];
      }
      return event;
    },
  });
}

export { Sentry };
