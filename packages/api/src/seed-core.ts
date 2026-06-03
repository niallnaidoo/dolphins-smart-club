/**
 * Reusable tenant-seeding logic (no top-level execution), shared by the seed CLI
 * (seed.ts) and the local dev server (local/server.ts). Tenants are provisioned
 * BLANK (config only); sample clubs/series are opt-in demo data. Branding lives here.
 */
import { readFileSync } from 'node:fs';
import * as repo from './repo.js';
import type { Club, Series, TenantConfig, League } from './types.js';

interface Snapshot {
  submissionDeadline: string;
  knownClubs: unknown[];
  clubs: Club[];
  series: Series[];
  leagues?: League[];
}

// Shared color palette (Dolphins and Lions use the same green theme today).
const COLORS = {
  '--navy': '#1B2A4A',
  '--navy-light': '#2E4070',
  '--teal': '#1D9E75',
  '--green': '#1D9E75',
  '--gold': '#C8A84B',
  '--coral': '#D85A30',
};

export const BRANDING: Record<string, TenantConfig['branding']> = {
  dolphins: {
    name: 'Hollywoodbets Dolphins',
    title: 'Dolphins Pipeline',
    logoUrl: '/dolphins-pipeline-logo.png',
    colors: COLORS,
    copy: {
      welcome: 'Welcome to Dolphins Pipeline',
      eyebrow: 'Dolphins Cricket Services · 2026 / 27 Season',
      office: 'Dolphins office',
      admin: 'Administrator · Dolphins',
      support: 'Cricket Services · support@dolphinscricket.co.za',
      footer: 'Powered by Medicoach',
    },
  },
  lions: {
    name: 'DP World Lions',
    title: 'Lions Smart Club',
    logoUrl: '/lions-logo.svg',
    colors: COLORS,
    copy: {
      welcome: 'Welcome — choose your profile',
      eyebrow: 'KZNCU & EMCU · 2026 / 27 Season',
      office: 'Lions office',
      admin: 'Administrator · Lions',
      support: 'Cricket Services · support@lionscricket.co.za',
      footer: 'Powered by Medicoach',
    },
  },
};

export const SEED_TENANTS = Object.keys(BRANDING);

function loadSnapshot(tenant: string): Snapshot {
  const path = new URL(`../seed-data/${tenant}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
}

/**
 * Provision a tenant: write its config (branding + deadline + league catalogue).
 * The COHORT (clubs/series) starts BLANK — real unions onboard their own. But the
 * league catalogue is real, union-specific REFERENCE data, so it's provisioned here
 * (from the tenant's snapshot) and ships in production; tenants without a defined
 * catalogue (snapshot `leagues: []`) start empty for the admin to build. `knownClubs`
 * is empty (no hardcoded onboarding suggestions). Returns the # of leagues seeded.
 */
export async function seedTenantConfig(tenant: string): Promise<number> {
  const branding = BRANDING[tenant];
  if (!branding) throw new Error(`no branding for tenant "${tenant}"`);
  const snap = loadSnapshot(tenant);
  const leagues = snap.leagues ?? [];
  const config: TenantConfig = {
    tenant,
    branding,
    submissionDeadline: snap.submissionDeadline,
    knownClubs: [],
    leagues,
  };
  await repo.putTenantConfig(config);
  return leagues.length;
}

/**
 * Opt-in demo COHORT data: load the snapshot's sample clubs + series into a tenant
 * (for local dev / set demo accounts). Provisioning (config, incl. leagues) must run
 * first. Leagues are NOT demo data — they're provisioned in seedTenantConfig.
 */
export async function seedDemoData(tenant: string): Promise<{ clubs: number; series: number }> {
  const snap = loadSnapshot(tenant);
  for (const club of snap.clubs) {
    // Flag snapshot clubs as demo so illustrative-only UI (e.g. the seeded
    // communication-log events) shows for them but not for real onboarded clubs.
    await repo.putClub(tenant, { ...club, demo: true, version: 1 });
  }
  for (const series of snap.series) {
    await repo.putSeries(tenant, { ...series, version: 1 });
  }
  return { clubs: snap.clubs.length, series: snap.series.length };
}
