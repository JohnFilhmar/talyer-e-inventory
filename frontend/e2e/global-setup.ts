import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedCatalog } from './seed';
import { SEED_FILE } from './seedFile';

/**
 * Seeds once per run. In a `beforeAll` the seed re-ran every time a failing
 * test restarted the worker, and each re-run spends an admin login against the
 * 10-per-15-minutes auth limiter.
 */
export default async function globalSetup(): Promise<void> {
  const seed = await seedCatalog();
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
}
