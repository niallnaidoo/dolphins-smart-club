/**
 * Union support contact — parsing helper.
 *
 * The contact is stored as a single "Name · email" string in
 * branding.copy.support (set via the admin "Support contact" editor). This is
 * the single source of truth for splitting it back into name + email, reused by
 * the HelpModal (main.jsx) and the edit modal (admin.jsx).
 *
 * The email regex here is intentionally LOOSE — it forgivingly extracts an
 * existing value. Writes are validated against the strict, anchored EMAIL_RE in
 * api.js / the API, so a malformed value never reaches storage in the first place.
 */
export function parseSupport(support = '') {
  const email = (support.match(/[\w.+-]+@[\w.-]+/) || [''])[0];
  const name = support.split('·')[0]?.trim() || 'Union office';
  return { name, email };
}
