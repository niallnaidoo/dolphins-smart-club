import { describe, it, expect } from 'vitest';
import { OVERARCHING_DISTRICT } from './leagues';
import {
  leagueBreakdown,
  districtRows,
  clearanceCounts,
  affiliationRows,
  cqiBandRows,
  docComplianceRows,
} from './insights';
import type { InsightsClub, League, ClearanceStatus } from './types';

const LEAGUES: League[] = [
  { key: 'premier', label: 'Premier League', group: 'Seniors', district: OVERARCHING_DISTRICT },
  { key: 'womens', label: "Women's League", group: 'Seniors', district: OVERARCHING_DISTRICT },
  { key: 'u13', label: 'Under 13', group: 'Juniors', district: 'North' },
];

const DISTRICTS = ['North', 'South'];

const club = (over: Partial<InsightsClub>): InsightsClub => ({
  id: 'c1',
  name: 'Club',
  district: 'North',
  affiliation: 'not_started',
  cqi: 0,
  docs: {},
  players: 0,
  leagues: [],
  ...over,
});

describe('leagueBreakdown', () => {
  it('counts clubs and multi-team entries per league', () => {
    const clubs = [
      club({ id: 'a', leagues: ['premier', 'u13'], leagueTeams: { premier: 3 } }),
      club({ id: 'b', leagues: ['premier'] }),
    ];
    const { rows, orphans } = leagueBreakdown(clubs, LEAGUES);
    const premier = rows.find((r) => r.key === 'premier')!;
    expect(premier.clubCount).toBe(2);
    expect(premier.teamCount).toBe(4); // 3 sides + 1 legacy default
    expect(rows.find((r) => r.key === 'u13')!.teamCount).toBe(1);
    expect(rows.find((r) => r.key === 'womens')!.clubCount).toBe(0);
    expect(orphans.keys).toEqual([]);
  });

  it('surfaces orphan keys with club and team counts so KPI totals reconcile', () => {
    const clubs = [
      club({ id: 'a', leagues: ['premier', 'gone'], leagueTeams: { gone: 2 } }),
      club({ id: 'b', leagues: ['gone', 'also-gone'] }),
    ];
    const { orphans } = leagueBreakdown(clubs, LEAGUES);
    expect(orphans.keys.sort()).toEqual(['also-gone', 'gone']);
    expect(orphans.clubCount).toBe(2); // distinct clubs, not references
    expect(orphans.teamCount).toBe(4); // 2 + 1 + 1
  });
});

describe('districtRows', () => {
  it('tallies clubs/teams per district and leagues available (incl. overarching)', () => {
    const clubs = [
      club({ id: 'a', district: 'North', leagues: ['premier', 'u13'], leagueTeams: { u13: 2 } }),
      club({ id: 'b', district: 'South', leagues: ['premier'] }),
    ];
    const rows = districtRows(clubs, LEAGUES, DISTRICTS);
    const north = rows.find((r) => r.name === 'North')!;
    expect(north.clubCount).toBe(1);
    expect(north.teamCount).toBe(3); // premier 1 + u13 2
    expect(north.leagueCount).toBe(3); // 2 overarching + 1 district-specific
    expect(rows.find((r) => r.name === 'South')!.leagueCount).toBe(2);
  });

  it('keeps empty districts and collects unknown districts under Other', () => {
    const clubs = [club({ id: 'a', district: 'Ghost Town', leagues: ['premier'] })];
    const rows = districtRows(clubs, LEAGUES, DISTRICTS);
    expect(rows.find((r) => r.name === 'South')!.clubCount).toBe(0);
    const other = rows.find((r) => r.other)!;
    expect(other.clubCount).toBe(1);
    expect(other.teamCount).toBe(1);
  });

  it('renders no Other row when every club has a known district', () => {
    const rows = districtRows([club({ district: 'North' })], LEAGUES, DISTRICTS);
    expect(rows.some((r) => r.other)).toBe(false);
  });
});

describe('clearanceCounts', () => {
  it('buckets on the hyphenated admin-override wire value', () => {
    const mk = (status: ClearanceStatus) => ({ status });
    const counts = clearanceCounts([
      mk('pending'),
      mk('pending'),
      mk('approved'),
      mk('admin-override'),
      mk('rejected'),
    ]);
    expect(counts).toEqual({ pending: 2, approved: 1, adminOverride: 1, rejected: 1 });
  });
});

describe('affiliationRows', () => {
  it('back-computes not-started so legacy/absent statuses still count', () => {
    const clubs = [
      club({ affiliation: 'complete' }),
      club({ affiliation: 'in_progress' }),
      club({ affiliation: undefined as unknown as InsightsClub['affiliation'] }),
    ];
    const rows = affiliationRows(clubs);
    expect(rows.map((r) => r.count)).toEqual([1, 1, 1]);
  });
});

describe('cqiBandRows / docComplianceRows', () => {
  it('bands scores with pending at zero and averages only submitters', () => {
    const clubs = [club({ cqi: 85 }), club({ cqi: 55 }), club({ cqi: 0 })];
    const { bands, submitted, avgCqi } = cqiBandRows(clubs);
    expect(bands.find((b) => b.key === 'A')!.count).toBe(1);
    expect(bands.find((b) => b.key === 'C')!.count).toBe(1);
    expect(bands.find((b) => b.key === 'P')!.count).toBe(1);
    expect(submitted.length).toBe(2);
    expect(avgCqi).toBe(70);
  });

  it('doc compliance tolerates clubs with no docs object', () => {
    const clubs = [
      club({ docs: { constitution: true } }),
      club({ docs: undefined as unknown as InsightsClub['docs'] }),
    ];
    const { docStats } = docComplianceRows(clubs);
    expect(docStats.find((d) => d.key === 'constitution')!.count).toBe(1);
    expect(docStats.every((d) => d.total === 2)).toBe(true);
  });
});
