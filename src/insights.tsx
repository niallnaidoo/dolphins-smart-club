/**
 * Cohort insights — the clubs/teams breakdown across leagues, districts and statuses.
 *
 * One presentational component serves two consoles: the tenant-admin "Insights" page
 * (fed by the Shell's existing clubs/leagues/districts/clearances data) and the
 * operator per-client overview (fed by GET /platform/tenants/:slug/overview). Both
 * satisfy the minimal InsightsClub shape, so the panels are guaranteed identical.
 *
 * The derivation helpers are pure and exported for tests, mirroring src/leagues.ts.
 */

import { useCopy } from './branding';
import { KPI, CountUp, EmptyState, Icon } from './atoms';
import { REQUIRED_DOCS } from './data';
import { teamCounts, optionsGroupedByGroup, leagueOptionsForDistrict } from './leagues';
import type { InsightsClub, League, ClearanceStatus } from './types';

/** Sides a club fields in one league — absent map/key counts as 1 (legacy clubs). */
const teamsIn = (club: InsightsClub, key: string) =>
  Math.max(1, Number(club.leagueTeams?.[key]) || 1);

/** Every side a club fields across all its leagues. */
const totalTeams = (club: InsightsClub) =>
  (club.leagues || []).reduce((s, k) => s + teamsIn(club, k), 0);

export interface LeagueRow {
  key: string;
  label: string;
  group: string;
  clubCount: number;
  teamCount: number;
}

/**
 * Per-league club/team counts ({rows, orphans} — not a bare array), plus the orphans:
 * league keys clubs still reference after the league was deleted from the catalogue.
 * teamCounts() counts orphan keys as senior teams, so the KPI teams total only
 * reconciles with the visible league rows when the orphan club/team counts are
 * surfaced alongside them.
 */
export function leagueBreakdown(clubs: InsightsClub[], leagues: League[]) {
  const rows: LeagueRow[] = (leagues || []).map((l) => {
    const entered = (clubs || []).filter((c) => (c.leagues || []).includes(l.key));
    return {
      key: l.key,
      label: l.label,
      group: l.group,
      clubCount: entered.length,
      teamCount: entered.reduce((s, c) => s + teamsIn(c, l.key), 0),
    };
  });
  const known = new Set((leagues || []).map((l) => l.key));
  const orphanKeys = new Set<string>();
  const orphanClubs = new Set<string>();
  let orphanTeams = 0;
  for (const c of clubs || []) {
    for (const k of c.leagues || []) {
      if (known.has(k)) continue;
      orphanKeys.add(k);
      orphanClubs.add(c.id);
      orphanTeams += teamsIn(c, k);
    }
  }
  return {
    rows,
    orphans: { keys: [...orphanKeys], clubCount: orphanClubs.size, teamCount: orphanTeams },
  };
}

export interface DistrictRow {
  name: string;
  clubCount: number;
  teamCount: number;
  leagueCount: number;
  /** True for the synthetic row collecting clubs whose district isn't in the list. */
  other?: boolean;
}

/**
 * Per-district club/team counts + how many leagues a club there could enter. An empty
 * district renders with zeros (a real signal, not noise); clubs whose district isn't
 * in the tenant list collect under a synthetic "Other / unassigned" row.
 */
export function districtRows(
  clubs: InsightsClub[],
  leagues: League[],
  districts: string[],
): DistrictRow[] {
  const list = Array.isArray(districts) ? districts : [];
  const rows: DistrictRow[] = list.map((d) => {
    const inD = (clubs || []).filter((c) => c.district === d);
    return {
      name: d,
      clubCount: inD.length,
      teamCount: inD.reduce((s, c) => s + totalTeams(c), 0),
      leagueCount: leagueOptionsForDistrict(leagues, d).length,
    };
  });
  const known = new Set(list);
  const stray = (clubs || []).filter((c) => !known.has(c.district));
  if (stray.length)
    rows.push({
      name: 'Other / unassigned',
      clubCount: stray.length,
      teamCount: stray.reduce((s, c) => s + totalTeams(c), 0),
      leagueCount: 0,
      other: true,
    });
  return rows;
}

/**
 * Clearance pipeline tallies. NOTE the wire value is the hyphenated
 * 'admin-override' (packages/api/src/types.ts) — camelCase is only the JS bucket.
 */
export function clearanceCounts(clearances: Array<{ status: ClearanceStatus }>) {
  const counts = { pending: 0, approved: 0, adminOverride: 0, rejected: 0 };
  for (const cl of clearances || []) {
    if (cl.status === 'pending') counts.pending++;
    else if (cl.status === 'approved') counts.approved++;
    else if (cl.status === 'admin-override') counts.adminOverride++;
    else if (cl.status === 'rejected') counts.rejected++;
  }
  return counts;
}

/** Affiliation status rows — the third bucket back-computes so legacy/absent values count. */
export function affiliationRows(clubs: InsightsClub[]) {
  const complete = (clubs || []).filter((c) => c.affiliation === 'complete').length;
  const inProgress = (clubs || []).filter((c) => c.affiliation === 'in_progress').length;
  return [
    { key: 'complete', label: 'Affiliated', count: complete, tone: '' },
    { key: 'in_progress', label: 'In progress', count: inProgress, tone: 'warn' },
    {
      key: 'not_started',
      label: 'Not started',
      count: (clubs || []).length - complete - inProgress,
      tone: 'pending',
    },
  ];
}

/* ── CQI-band + doc-compliance derivations, shared with ClubInsights (admin.tsx) so
      the band/threshold definitions can't drift between the two panels. ── */

export const cqiBandTone = (key: string) =>
  key === 'C' ? 'warn' : key === 'D' ? 'danger' : key === 'P' ? 'pending' : '';

export function cqiBandRows(clubs: InsightsClub[]) {
  const bands = [
    { key: 'A', label: 'A · 80+', count: clubs.filter((c) => c.cqi >= 80).length },
    { key: 'B', label: 'B · 65–80', count: clubs.filter((c) => c.cqi >= 65 && c.cqi < 80).length },
    { key: 'C', label: 'C · 50–65', count: clubs.filter((c) => c.cqi >= 50 && c.cqi < 65).length },
    { key: 'D', label: 'D · <50', count: clubs.filter((c) => c.cqi > 0 && c.cqi < 50).length },
    { key: 'P', label: 'Pending', count: clubs.filter((c) => c.cqi === 0).length },
  ];
  const submitted = clubs.filter((c) => c.cqi > 0);
  const avgCqi = submitted.length ? submitted.reduce((s, c) => s + c.cqi, 0) / submitted.length : 0;
  return { bands, maxBand: Math.max(...bands.map((b) => b.count), 1), submitted, avgCqi };
}

export const docTone = (pct: number) => (pct >= 70 ? '' : pct >= 40 ? 'warn' : 'danger');

export function docComplianceRows(clubs: InsightsClub[]) {
  const docStats = REQUIRED_DOCS.map((d) => {
    const uploaded = clubs.filter((c) => c.docs?.[d.key]).length;
    const pct = clubs.length ? Math.round((uploaded / clubs.length) * 100) : 0;
    return { key: d.key, name: d.name, count: uploaded, total: clubs.length, pct };
  });
  const mostMissing = [...docStats].sort((a, b) => a.count - b.count)[0];
  return { docStats, mostMissing };
}

/* ─── The shared breakdown ─── */

/** Legend for dual-value rows — colour-pairs with DuoRow's bars and numbers. */
const DuoLegend = () => (
  <div className="insights-legend">
    <span>
      <i />
      clubs
    </span>
    <span>
      <i className="ghost" />
      teams
    </span>
  </div>
);

/**
 * One dual-value bar row: solid fill = clubs, tinted = teams, both on the card's
 * shared scale so rows compare against each other. Teams normally extend past clubs
 * (each entered club fields ≥1 side); when teams are FEWER — clubs with no league
 * entries yet — the teams bar renders as a pale inset over the solid bar instead,
 * so it never hides behind it. The number columns mirror the fill colours
 * (ink = clubs, muted = teams).
 */
function DuoRow({
  label,
  title,
  clubCount,
  teamCount,
  max,
}: {
  label: string;
  title?: string;
  clubCount: number;
  teamCount: number;
  max: number;
}) {
  // The ghost is absolutely positioned so it always paints over the solid bar:
  // green at low opacity is invisible where they overlap (the solid reads clean) and
  // tints only the extension beyond it. In the inset case it switches to a white
  // overlay, lightening the covered clubs segment — "tinted = teams" either way.
  const teamsInset = teamCount < clubCount;
  return (
    <div className="insights-bar-row duo">
      <div className="insights-bar-label" title={title ?? label}>
        {label}
      </div>
      <div className="insights-bar-track">
        <div className="insights-bar-fill" style={{ width: (clubCount / max) * 100 + '%' }} />
        <div
          className={`insights-bar-fill ghost${teamsInset ? ' inset' : ''}`}
          style={{ width: (teamCount / max) * 100 + '%' }}
        />
      </div>
      <div className="insights-bar-num">{clubCount}</div>
      <div className="insights-bar-num sub">{teamCount}</div>
    </div>
  );
}

interface InsightsBreakdownProps {
  clubs: InsightsClub[];
  leagues: League[];
  districts: string[];
  clearances: Array<{ status: ClearanceStatus }>;
  /** 'operator' notes the standard doc set on the compliance card. */
  context?: 'admin' | 'operator';
}

export function InsightsBreakdown({
  clubs,
  leagues,
  districts,
  clearances,
  context = 'admin',
}: InsightsBreakdownProps) {
  if (!clubs.length)
    return (
      <EmptyState
        icon={Icon.Clubs}
        title="No clubs yet"
        sub="Breakdowns appear here once the first club is onboarded."
      />
    );

  // KPI totals — teamCounts includes orphan league keys (as senior), so the strip
  // reconciles with the league rows via the orphan callout below.
  const split = clubs.reduce(
    (acc, c) => {
      const t = teamCounts(c.leagues || [], leagues, c.leagueTeams);
      return {
        senior: acc.senior + t.senior,
        women: acc.women + t.women,
        junior: acc.junior + t.junior,
      };
    },
    { senior: 0, women: 0, junior: 0 },
  );
  const teamsTotal = split.senior + split.women + split.junior;
  const playersTotal = clubs.reduce((s, c) => s + (c.players || 0), 0);

  // Dual-bar scale: teams normally dominate, but a cohort with clubs and no league
  // entries (teams 0) must still scale to its club counts or the solid bar overflows.
  const duoMax = (rows: Array<{ clubCount: number; teamCount: number }>) =>
    Math.max(...rows.map((r) => Math.max(r.teamCount, r.clubCount)), 1);

  const { rows: lgRows, orphans } = leagueBreakdown(clubs, leagues);
  const lgMax = duoMax(lgRows);
  const grouped = optionsGroupedByGroup(leagues);
  const enteredLeagues = lgRows.filter((r) => r.clubCount > 0).length;

  const dRows = districtRows(clubs, leagues, districts);
  const dMax = duoMax(dRows);
  const noLeagueDistricts = dRows.filter((r) => !r.other && r.leagueCount === 0);
  const busiest = [...dRows].sort((a, b) => b.clubCount - a.clubCount)[0];

  const affRows = affiliationRows(clubs);
  const { bands, maxBand, submitted, avgCqi } = cqiBandRows(clubs);
  const { docStats, mostMissing } = docComplianceRows(clubs);
  const cc = clearanceCounts(clearances);

  return (
    <div>
      <div className="kpi-strip">
        <KPI label="Clubs" num={<CountUp to={clubs.length} />} sub="in the cohort" />
        <KPI
          label="Teams entered"
          num={<CountUp to={teamsTotal} />}
          sub={`${split.senior} senior · ${split.women} women · ${split.junior} junior`}
        />
        <KPI label="Players" num={<CountUp to={playersTotal} />} sub="registered" />
        <KPI
          label="Leagues"
          num={<CountUp to={leagues.length} />}
          sub={`${enteredLeagues} with entries`}
        />
        <KPI
          label="Pending clearances"
          num={<CountUp to={cc.pending} />}
          sub="awaiting action"
          tone={cc.pending > 0 ? 'warn' : 'good'}
        />
      </div>

      <div className="insights-panel">
        {/* ─── Clubs & teams per league ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">Clubs &amp; Teams per League</div>
            <DuoLegend />
          </div>
          <div className={lgRows.length > 8 ? 'insights-scroll' : undefined}>
            {Object.entries(grouped).map(([group, ls]) => (
              <div key={group}>
                <div className="insights-group-label">{group}</div>
                {(ls as League[]).map((l) => {
                  const r = lgRows.find((row) => row.key === l.key)!;
                  return (
                    <DuoRow
                      key={r.key}
                      label={r.label}
                      title={`${r.label} — ${r.clubCount} clubs, ${r.teamCount} teams`}
                      clubCount={r.clubCount}
                      teamCount={r.teamCount}
                      max={lgMax}
                    />
                  );
                })}
              </div>
            ))}
            {leagues.length === 0 && (
              <div className="insights-callout warn">
                No leagues in the catalogue yet — clubs can't enter competitions until leagues are
                created.
              </div>
            )}
          </div>
          {leagues.length > 0 && (
            <div className="insights-callout good">
              <strong>{split.senior}</strong> senior · <strong>{split.women}</strong> women's ·{' '}
              <strong>{split.junior}</strong> junior teams across {enteredLeagues} league
              {enteredLeagues === 1 ? '' : 's'} with entries
            </div>
          )}
          {orphans.keys.length > 0 && (
            <div className="insights-callout warn">
              <strong>{orphans.clubCount}</strong> club{orphans.clubCount === 1 ? '' : 's'} still
              reference{orphans.clubCount === 1 ? 's' : ''} <strong>{orphans.keys.length}</strong>{' '}
              removed league{orphans.keys.length === 1 ? '' : 's'} — those{' '}
              <strong>{orphans.teamCount}</strong> team{orphans.teamCount === 1 ? '' : 's'} count as
              senior in the totals above.
            </div>
          )}
        </div>

        {/* ─── Clubs per district ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">Clubs per District</div>
            <DuoLegend />
          </div>
          <div className={dRows.length > 8 ? 'insights-scroll' : undefined}>
            {dRows.map((r) => (
              <DuoRow
                key={r.name}
                label={r.name}
                title={
                  r.other
                    ? `${r.name} — ${r.clubCount} clubs, ${r.teamCount} teams`
                    : `${r.name} — ${r.clubCount} clubs, ${r.teamCount} teams, ${r.leagueCount} leagues available`
                }
                clubCount={r.clubCount}
                teamCount={r.teamCount}
                max={dMax}
              />
            ))}
          </div>
          {busiest && busiest.clubCount > 0 && (
            <div className="insights-callout good">
              Strongest district: <strong>{busiest.name}</strong> with{' '}
              <strong>{busiest.clubCount}</strong> club{busiest.clubCount === 1 ? '' : 's'} fielding{' '}
              <strong>{busiest.teamCount}</strong> team{busiest.teamCount === 1 ? '' : 's'}
            </div>
          )}
          {noLeagueDistricts.length > 0 && (
            <div className="insights-callout warn">
              <strong>{noLeagueDistricts.length}</strong> district
              {noLeagueDistricts.length === 1 ? ' has' : 's have'} no leagues available yet:{' '}
              {noLeagueDistricts.map((d) => d.name).join(', ')}
            </div>
          )}
        </div>

        {/* ─── Affiliation status ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">Affiliation Status</div>
            <div className="insights-card-meta">of {clubs.length} clubs</div>
          </div>
          {affRows.map((r) => (
            <div key={r.key} className="insights-bar-row">
              <div className="insights-bar-label">{r.label}</div>
              <div className="insights-bar-track">
                <div
                  className={`insights-bar-fill ${r.tone}`}
                  style={{ width: (r.count / Math.max(1, clubs.length)) * 100 + '%' }}
                />
              </div>
              <div className="insights-bar-num">{r.count}</div>
            </div>
          ))}
          <div
            className={`insights-callout ${affRows[0].count === clubs.length ? 'good' : 'warn'}`}
          >
            <strong>{affRows[0].count}</strong> of {clubs.length} clubs affiliated —{' '}
            <strong>{clubs.length - affRows[0].count}</strong> still to submit
          </div>
        </div>

        {/* ─── CQI score distribution ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">CQI Score Distribution</div>
            <div className="insights-card-meta">
              Avg <CountUp to={avgCqi} decimals={1} />
            </div>
          </div>
          {bands.map((b) => (
            <div key={b.key} className="insights-bar-row">
              <div className="insights-bar-label">{b.label}</div>
              <div className="insights-bar-track">
                <div
                  className={`insights-bar-fill ${cqiBandTone(b.key)}`}
                  style={{ width: (b.count / maxBand) * 100 + '%' }}
                />
              </div>
              <div className="insights-bar-num">{b.count}</div>
            </div>
          ))}
          <div className="insights-callout good">
            <strong>{submitted.length}</strong> of {clubs.length} clubs submitted CQI
          </div>
        </div>

        {/* ─── Document compliance ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">Document Compliance</div>
            <div className="insights-card-meta">
              of {clubs.length} clubs{context === 'operator' ? ' · standard doc set' : ''}
            </div>
          </div>
          {docStats.map((d) => (
            <div key={d.key} className="insights-bar-row wide-label">
              <div className="insights-bar-label" title={d.name}>
                {d.name}
              </div>
              <div className="insights-bar-track">
                <div
                  className={`insights-bar-fill ${docTone(d.pct)}`}
                  style={{ width: d.pct + '%' }}
                />
              </div>
              <div className="insights-bar-num">
                {d.count}/{d.total}
              </div>
            </div>
          ))}
          <div className={`insights-callout ${mostMissing.pct < 40 ? 'alert' : 'warn'}`}>
            Most missing: <strong>{mostMissing.name}</strong> — only{' '}
            <strong>{mostMissing.count}</strong> of {mostMissing.total} clubs uploaded
          </div>
        </div>

        {/* ─── Players & clearances ─── */}
        <div className="insights-card">
          <div className="insights-card-head">
            <div className="insights-card-title">Players &amp; Clearances</div>
            <div className="insights-card-meta">transfer pipeline</div>
          </div>
          <div className="resource-list">
            <div className="resource-row">
              <span className="resource-num good">
                <CountUp to={playersTotal} />
              </span>
              <span className="resource-text">
                <strong>players</strong> registered across the cohort
              </span>
            </div>
            <div className="resource-row">
              <span className={`resource-num ${cc.pending > 0 ? 'warn' : 'good'}`}>
                <CountUp to={cc.pending} />
              </span>
              <span className="resource-text">
                <strong>{cc.pending === 1 ? 'clearance' : 'clearances'}</strong> pending — awaiting
                a club or admin decision
              </span>
            </div>
            <div className="resource-row">
              <span className="resource-num good">
                <CountUp to={cc.approved + cc.adminOverride} />
              </span>
              <span className="resource-text">
                <strong>approved</strong>
                {cc.adminOverride > 0 ? ` (incl. ${cc.adminOverride} by admin override)` : ''}
              </span>
            </div>
            <div className="resource-row">
              <span className={`resource-num ${cc.rejected > 0 ? 'danger' : 'good'}`}>
                <CountUp to={cc.rejected} />
              </span>
              <span className="resource-text">
                <strong>rejected</strong> transfer {cc.rejected === 1 ? 'request' : 'requests'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tenant-admin page (rendered inside the admin Shell) ─── */

interface AdminInsightsPageProps {
  clubs: InsightsClub[];
  leagues: League[];
  districts: string[];
  clearances: Array<{ status: ClearanceStatus }>;
}

export function AdminInsightsPage({
  clubs,
  leagues,
  districts,
  clearances,
}: AdminInsightsPageProps) {
  const copy = useCopy();
  return (
    <div>
      <div className="page-head">
        <div className="ph-left">
          <div className="ph-crumb">{copy.crumbRoot} · Admin Console / Insights</div>
          <h1 className="ph-title">
            Season <em>insights</em>
          </h1>
          <p className="ph-desc">
            How the cohort is organised — clubs and teams across every league, district and status,
            plus the player and clearance pipeline.
          </p>
        </div>
      </div>
      <InsightsBreakdown
        clubs={clubs}
        leagues={leagues}
        districts={districts}
        clearances={clearances}
      />
    </div>
  );
}
