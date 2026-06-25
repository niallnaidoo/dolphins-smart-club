/**
 * Cognito PreTokenGeneration trigger.
 *
 * Stamps the user's `memberships` onto the ID token from their USER# record, so
 * authorization (tenant + role + clubIds) travels in the token instead of being a
 * fixed Cognito attribute. Because it reads the DB on every token mint/refresh,
 * role changes and rep handovers take effect by editing the USER# item — no
 * attribute migration. See docs/architecture/0003.
 *
 * Claims must be strings, so `memberships` is JSON-encoded; the API and SPA decode it.
 */
import './instrument.js'; // MUST be first — inits Sentry (no-op without a DSN)
import { Sentry } from './instrument.js';
import type { PreTokenGenerationTriggerHandler } from 'aws-lambda';
import { getUser, stampFirstLogin } from './repo.js';

// ⚠️ Sign-in hot path. Deliberately NOT wrapped with Sentry.wrapHandler — that would
// add flush latency to every token mint and could surface init errors on the auth
// path. We only instrument the one call that can currently reject the handler
// (getUser), capturing + flushing the error before re-throwing so the FAIL behaviour
// is byte-for-byte unchanged. The happy path makes zero Sentry calls.
export const handler: PreTokenGenerationTriggerHandler = async (event) => {
  const sub = event.request.userAttributes.sub;
  let user;
  try {
    user = sub ? await getUser(sub) : null;
  } catch (err) {
    Sentry.captureException(err); // never throws
    await Sentry.flush(2000).catch(() => {}); // best-effort, error path only
    throw err; // preserve existing behaviour: a read failure rejects token issuance
  }
  const memberships = user?.memberships ?? [];

  // Best-effort: stamp first-ever sign-in so Team & Access can show pending→active.
  // This writes the USER# Dynamo item (NOT a Cognito attribute), so it can't re-fire
  // the trigger, and `stampFirstLogin` is conditional (once per lifetime). Wrapped in
  // its OWN try/catch that can never reject the handler — a failed status stamp must
  // not block token issuance (that would be a sign-in outage). stampFirstLogin already
  // swallows internally; this is belt-and-braces.
  if (sub) {
    try {
      await stampFirstLogin(sub);
    } catch {
      // never let a status-stamp failure break sign-in
    }
  }

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        memberships: JSON.stringify(memberships),
      },
    },
  };

  return event;
};
