/**
 * One-off / on-demand reconcile: correct drifted `playerCount` counters from the
 * source-of-truth PLAYER# rows.
 *
 * `playerCount` is a display-only denormalization bumped atomically on each registration
 * (repo.createPlayer) and decremented on delete. It can drift LOW when a club edit's
 * whole-item PUT in `updateClub` overwrites the counter with the value it read at the start
 * of the request, silently dropping a registration's `ADD playerCount` that landed in that
 * read-to-PUT window. `PATCH /clubs/:id` now strips any client-sent `playerCount` (closing
 * the stale-round-trip vector), but pre-existing drift — and the residue of that narrow
 * server race — is only healed by recomputing from the real rows. This does that, per club,
 * with a race-safe atomic delta bump (see repo.reconcilePlayerCount).
 *
 *   sst shell --stage <stage> -- npx tsx packages/api/src/backfill-player-counts.ts <tenant>            (dry-run)
 *   sst shell --stage <stage> -- npx tsx packages/api/src/backfill-player-counts.ts <tenant> --confirm
 *
 * Idempotent: a club whose counter already matches its rows is skipped. Safe to re-run — a
 * registration landing during the pass just leaves a ±1 the next run reconciles.
 */
import * as repo from './repo.js';

async function main(): Promise<void> {
  const [tenant, flag] = process.argv.slice(2);
  if (!tenant) {
    console.error('usage: backfill-player-counts <tenant> [--confirm]');
    process.exit(1);
  }
  const confirm = flag === '--confirm';

  const config = await repo.getTenantConfig(tenant);
  if (!config) {
    console.error(`tenant "${tenant}" not found`);
    process.exit(1);
  }

  const clubs = await repo.listClubs(tenant);
  let drifted = 0;
  let corrected = 0;

  for (const club of clubs) {
    const stored = (club as { playerCount?: number }).playerCount ?? 0;
    const actual = (await repo.listPlayers(tenant, club.id)).length;
    if (stored === actual) continue;
    drifted++;

    if (!confirm) {
      console.log(`[dry-run] ${club.id} (${club.name}): playerCount ${stored} → ${actual}`);
      continue;
    }

    // reconcilePlayerCount re-reads inside so the atomic delta stays fresh against any
    // registration that landed since the count above — never clobbers a concurrent bump.
    const { previous, actual: fixed, delta } = await repo.reconcilePlayerCount(tenant, club.id);
    console.log(`${club.id}: playerCount ${previous} → ${fixed} (${delta > 0 ? '+' : ''}${delta})`);
    corrected++;
  }

  if (!confirm) {
    console.log(`dry-run complete: ${drifted} club(s) would change. Re-run with --confirm.`);
  } else {
    console.log(`reconcile complete: ${corrected} of ${clubs.length} club(s) corrected.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
