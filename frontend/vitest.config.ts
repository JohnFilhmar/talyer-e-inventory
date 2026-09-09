import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The frontend had no test runner at all, which left the offline layer
 * unverified: the outbox classification table, the `clientRequestId` reuse rule
 * and the logout cache clear are each a documented, already-once-shipped class
 * of bug (GAP-044).
 *
 * Vitest rather than Jest because the app is already a Vite-adjacent
 * TypeScript project and Jest would need its own transform chain. Pinned to 3.x
 * because 4 and 5 require `@types/node` 22 or newer and this package pins 20;
 * bumping that is a change to every type in the app, not a test-setup detail.
 *
 * `environment: 'node'` on purpose. These suites cover module logic, not
 * components, so nothing here needs a DOM; a component suite would opt into
 * jsdom per file.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The Next build output and the generated service worker are not tests.
    exclude: ['node_modules/**', '.next/**', 'public/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
