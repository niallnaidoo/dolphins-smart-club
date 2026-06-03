import { describe, it, expect } from 'vitest';
import { parseSupport } from './support.js';

describe('parseSupport', () => {
  it('splits the seeded "Name · email" string', () => {
    expect(parseSupport('Cricket Services · support@dolphinscricket.co.za')).toEqual({
      name: 'Cricket Services',
      email: 'support@dolphinscricket.co.za',
    });
  });

  it('handles a .co.za address (multi-label TLD)', () => {
    expect(parseSupport('Lions Office · admin@lionscricket.co.za').email).toBe(
      'admin@lionscricket.co.za',
    );
  });

  it('falls back to "Union office" when there is no name', () => {
    expect(parseSupport('').name).toBe('Union office');
    expect(parseSupport(undefined).name).toBe('Union office');
  });

  it('returns an empty email when none is present', () => {
    expect(parseSupport('Some Office').email).toBe('');
  });

  it('extracts the email even when the name itself contains a separator', () => {
    // Defensive: a stray "·" in the name only affects the display name, never the
    // extracted email (which the mailto links depend on).
    expect(parseSupport('A · B Office · help@union.org').email).toBe('help@union.org');
  });
});
