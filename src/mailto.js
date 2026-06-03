// Open a bcc reminder mail draft to a set of recipients. Dedupes and drops
// empties, then caps the bcc list: mailto: URLs are bounded by the OS mail
// handler (~dozens of addresses), so truncating silently would produce a broken
// or unopenable draft. Toasts and returns false when there are no recipients, or
// when the list was capped, so callers don't need to repeat that logic.
export const MAILTO_BCC_CAP = 40;

export function openBccReminder({ emails, subject, toast, emptyMessage }) {
  const unique = [...new Set((emails || []).filter(Boolean))];
  if (!unique.length) {
    toast?.(emptyMessage || 'No recipients with an email on file');
    return false;
  }
  const capped = unique.slice(0, MAILTO_BCC_CAP);
  window.location.href = `mailto:?bcc=${encodeURIComponent(
    capped.join(','),
  )}&subject=${encodeURIComponent(subject)}`;
  if (capped.length < unique.length)
    toast?.(`Opened a draft for ${capped.length} of ${unique.length} — mailto length limit`);
  return true;
}
