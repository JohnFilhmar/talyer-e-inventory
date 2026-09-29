import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeededCatalog } from './seed';

/** Where global setup leaves the seed for the specs. */
export const SEED_FILE = join(__dirname, '..', 'test-results', 'e2e-seed.json');

/** The seed global setup wrote for this run. */
export const readSeed = (): SeededCatalog => {
  const parsed: SeededCatalog = JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
  return parsed;
};
