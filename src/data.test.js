import { describe, it, expect } from 'vitest';
import { generateRoundRobin, resolveSpread } from './data.jsx';

// 6 teams → 5 single round-robin rounds (each round = one match-day).
const SIX = ['a', 'b', 'c', 'd', 'e', 'f'];
const roundDates = (fixtures) => [...new Set(fixtures.map((f) => f.date))].sort();

describe('generateRoundRobin', () => {
  it('falls back to weekly rounds when no end date is given (backward-compatible)', () => {
    const dates = roundDates(generateRoundRobin(SIX, '2026-08-01'));
    expect(dates).toEqual(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29']);
  });

  it('ignores the end date in reference mode (spread:false stays weekly)', () => {
    const dates = roundDates(
      generateRoundRobin(SIX, '2026-08-01', { endDateISO: '2026-08-05', spread: false }),
    );
    expect(dates[0]).toBe('2026-08-01');
    expect(dates[1]).toBe('2026-08-08'); // still +7 days, end date untouched
  });

  it('spreads rounds across the window, last round landing on the end date', () => {
    const dates = roundDates(
      generateRoundRobin(SIX, '2026-08-01', { endDateISO: '2026-08-05', spread: true }),
    );
    // 5 rounds over a 4-day window → one round per day, no collisions.
    expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('spreads odd teams correctly — bye padding makes n rounds, not n-1', () => {
    // 5 teams pad to 6 → 5 rounds (the bye-padding invariant). A 4-day window
    // gives one round per day, last on the end date.
    const dates = roundDates(
      generateRoundRobin(['a', 'b', 'c', 'd', 'e'], '2026-08-01', {
        endDateISO: '2026-08-05',
        spread: true,
      }),
    );
    expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('never stacks two rounds on the same date even when the window is too short', () => {
    // 5 rounds over a 2-day window would imply a sub-day step; the one-day floor
    // keeps every round on a distinct date (last round overruns the window).
    const dates = roundDates(
      generateRoundRobin(['a', 'b', 'c', 'd', 'e'], '2026-08-01', {
        endDateISO: '2026-08-03',
        spread: true,
      }),
    );
    expect(dates).toHaveLength(5);
    expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('places a 2-team competition as a single fixture on the start date', () => {
    const fixtures = generateRoundRobin(['a', 'b'], '2026-08-01', {
      endDateISO: '2026-08-10',
      spread: true,
    });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].date).toBe('2026-08-01');
  });

  it('returns no fixtures for fewer than two teams', () => {
    expect(generateRoundRobin(['a'], '2026-08-01')).toEqual([]);
  });
});

describe('resolveSpread (smart default — guards the create/regenerate parity)', () => {
  it('defaults a tournament to spread when no explicit mode is stored', () => {
    expect(resolveSpread({ kind: 'tournament', dateMode: '' })).toBe(true);
    expect(resolveSpread({ kind: 'tournament' })).toBe(true);
  });

  it('defaults a series to reference when no explicit mode is stored', () => {
    expect(resolveSpread({ kind: 'series', dateMode: '' })).toBe(false);
    expect(resolveSpread({ kind: 'series' })).toBe(false);
  });

  it('honours an explicit mode over the format default', () => {
    expect(resolveSpread({ kind: 'tournament', dateMode: 'reference' })).toBe(false);
    expect(resolveSpread({ kind: 'series', dateMode: 'spread' })).toBe(true);
  });

  it('produces identical fixtures on create then regenerate (the parity bug it guards)', () => {
    // Tournament with an end date, admin never touches the toggle. This is the
    // exact case where the create path's smart default once diverged from
    // regenerate's literal read of a blank dateMode.
    const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
    const startDate = '2026-08-01';
    const endDate = '2026-08-05';

    // Create: smart default resolves spread; the form persists the resolved mode.
    const draft = { kind: 'tournament', dateMode: '', startDate, endDate, teams };
    const createFixtures = generateRoundRobin(teams, startDate, {
      endDateISO: endDate,
      spread: resolveSpread(draft),
    });
    const stored = { ...draft, dateMode: resolveSpread(draft) ? 'spread' : 'reference' };

    // Regenerate: reads the stored series back through the same helper.
    const regenFixtures = generateRoundRobin(stored.teams, stored.startDate, {
      endDateISO: stored.endDate,
      spread: resolveSpread(stored),
    });

    expect(regenFixtures).toEqual(createFixtures);
  });
});
