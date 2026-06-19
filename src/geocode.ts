/* ─── Nominatim address helpers ─── */
// Pure functions for turning a Nominatim result into form-ready values.
// Kept separate from club.jsx (which pulls in Leaflet + CSS) so they stay
// trivially unit-testable in a plain node environment.

// Compose a short, human "street, suburb, city" address from Nominatim's
// addressdetails. display_name alone is a 9-segment string that looks broken in
// the form field (and re-geocodes poorly). Falls back to the first few
// display_name segments, then '' when nothing usable resolves — callers must
// treat '' as "no address" rather than writing a placeholder into the field.
export function shortAddress(r) {
  const a = r?.address || {};
  // Only emit a street when there's a road — a bare house number ("12") is noise.
  const street = a.road ? [a.house_number, a.road].filter(Boolean).join(' ') : '';
  const suburb = a.suburb || a.neighbourhood || a.city_district || a.village;
  const city = a.city || a.town || a.municipality;
  const parts = [street, suburb, city].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (!r?.display_name) return '';
  return r.display_name
    .split(',')
    .slice(0, 3)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

// The suburb-equivalent locality, used for travel-cost grouping. undefined when
// none of the candidate fields are present.
export function suburbOf(r) {
  const a = r?.address || {};
  return a.suburb || a.neighbourhood || a.city_district || a.village || undefined;
}

// South Africa mainland bounding box. Northernmost land is ~-22.13 (Limpopo/
// Beitbridge), easternmost ~32.9 (Kosi Bay) — the box hugs those with a small
// margin. Note Lesotho and Eswatini fall INSIDE this box; the bbox is a cheap
// pre-filter and the reverse-geocode country_code check is the precise gate.
export const SA_BOUNDS = { south: -35.0, west: 16.3, north: -22.1, east: 33.0 };

// Whether a point is plausibly in South Africa (within the mainland bbox).
// Non-finite inputs are out by definition — callers gate saved pins with this.
export function isInSouthAfrica(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= SA_BOUNDS.south &&
    lat <= SA_BOUNDS.north &&
    lon >= SA_BOUNDS.west &&
    lon <= SA_BOUNDS.east
  );
}
