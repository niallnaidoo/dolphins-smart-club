/**
 * Unit tests for buildPatch's hero-preservation rule: seed colours win on a
 * backfill re-run EXCEPT --hero-image, where an existing (operator-uploaded)
 * backdrop must survive. Pure — no dynalite; buildPatch never touches the table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// repo (imported by the script for types/patch shape) reads env at module load.
process.env.TABLE_NAME ??= 'test-table';

const { buildPatch } = await import('../src/backfill-branding.js');
const { BRANDING } = await import('../src/seed-core.js');

const seed = BRANDING.dolphins;
const UPLOADED = "url('https://assets.test/branding/dolphins/hero-abc12345.webp')";

/** A row already current for everything the backfill owns (colors/copy/favicon). */
const currentRow = () => ({
  colors: { ...seed.colors },
  copy: { ...seed.copy } as Record<string, string>,
});

describe('buildPatch — hero backdrop preservation', () => {
  test('an existing --hero-image survives while other seed colours still win', () => {
    const existing = currentRow();
    existing.colors['--hero-image'] = UPLOADED;
    existing.colors['--brand-primary'] = '#123456'; // drifted → must be re-seeded
    const out = buildPatch(existing, seed, undefined, seed.logoUrl ?? '', seed.faviconUrl);
    assert.ok(out, 'drifted primary must produce a patch');
    assert.equal(out.patch.colors?.['--hero-image'], UPLOADED, 'uploaded hero preserved');
    assert.equal(out.patch.colors?.['--brand-primary'], seed.colors['--brand-primary']);
    assert.ok(!out.diff.some((line) => line.includes('--hero-image')), 'no hero line in the diff');
  });

  test('uploaded hero + otherwise-current row is a no-op (null patch)', () => {
    const existing = currentRow();
    existing.colors['--hero-image'] = UPLOADED;
    const out = buildPatch(existing, seed, undefined, seed.logoUrl ?? '', seed.faviconUrl);
    assert.equal(out, null);
  });

  test('a row with no hero still receives the seed value', () => {
    const existing = currentRow();
    delete existing.colors['--hero-image'];
    const out = buildPatch(existing, seed, undefined, seed.logoUrl ?? '', seed.faviconUrl);
    assert.ok(out);
    assert.equal(out.patch.colors?.['--hero-image'], seed.colors['--hero-image']);
  });
});
