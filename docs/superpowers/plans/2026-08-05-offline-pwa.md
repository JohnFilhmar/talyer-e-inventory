# Offline-Capable PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app installs as a PWA, stays fully browsable with no connection, lets staff create and edit sales and service orders offline, and replays them to the server on reconnect — with a human review queue for anything the server rejects.

**Architecture:** Four layers. (1) A Serwist service worker precaches the app shell and runtime-caches API reads. (2) An IndexedDB mirror holds the working set so pages render from local data when the network is gone. (3) An outbox queues offline mutations, each stamped with a client-generated idempotency key, and replays them in order on reconnect. (4) The server accepts that key, deduplicates replays, and returns a structured rejection when stock has moved underneath — which the client surfaces in a review queue rather than silently dropping or silently applying.

**Tech Stack:** `@serwist/next` 9.5.x (Next ≥14 peer, satisfied by 16.2.12), `idb` 8.x, existing TanStack Query v5, Express 5 + Mongoose 8.

## Scope decisions (confirmed with the owner)

- **Offline writes are limited to sales and service orders.** Everything else is browsable offline and read-only. Stock adjustments, transfers, product/category/supplier edits and user admin require a connection and must fail with a clear message, not queue.
- **Conflict policy is server-authoritative.** The first sync to arrive commits. A later one that no longer fits available stock is rejected with a reason and lands in a review queue for a human to void, backorder, or re-price. Stock is never corrupted and a sale is never silently lost.
- **The target offline window is hours** — a shift or a wifi drop. The working set is the active catalog, this branch's stock, and recent orders. The existing 7-day access token covers the window, so no auth-lifetime rework.

## Global Constraints

- Branch is `feat/offline-pwa`. Merges to `master` at the end. Never commit directly to `master`.
- Conventional Commits. **No AI attribution of any kind** — no `Co-Authored-By`, no "Generated with", no tool footer.
- Never create, modify, move, or delete `.env`, `.env.*`, `*.pem`, `*.key`, or any credential file.
- Backend is ESM (`"type": "module"`). Roles come from `USER_ROLES`. Controllers return through `ApiResponse`.
- Backend tests: build a bare Express app per suite and mount only the router under test. Never import `src/server.js`.
- Frontend design constraints hold: strict yellow-400/black/white/gray palette, **no transitions or animations** (spinners excepted), mobile-first.
- Frontend has no test suite. `npx tsc --noEmit`, `npm run lint` (0 errors; 7 pre-existing warnings), and `npm run build` are the automated signal.
- Every task ends green: run the named commands and paste real output before committing.

---

## Task 1: Stop the app logging itself out when the network drops

**Files:**
- Modify: `frontend/src/lib/apiClient.ts` (the 401 refresh handler's `catch`)
- Modify: `frontend/src/stores/authStore.ts` (`initialize`'s `catch`)

**Background:** This is a prerequisite for everything else. `apiClient`'s refresh path currently treats *any* failure of `POST /auth/refresh-token` as an authentication failure — it calls `clearTokens()` and hard-redirects to `/login`. Offline, that request fails with a network error, not a 401. So a wifi drop currently destroys the session and the stored token. No offline feature can work on top of that.

`authStore.initialize()` has the same shape: a bare `catch` that calls `clearTokens(); setUser(null)`.

- [ ] **Step 1: Add a network-error predicate**

In `frontend/src/lib/apiClient.ts`:

```ts
/**
 * True when a request failed because the network was unreachable rather than
 * because the server rejected it. Axios reports these with no `response` and
 * a code of ERR_NETWORK (or ECONNABORTED on timeout). Treating them as auth
 * failures is what previously logged users out on a wifi drop.
 */
export const isNetworkError = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  if (!axiosError || typeof axiosError !== 'object') return false;
  if (axiosError.response) return false;
  return (
    axiosError.code === 'ERR_NETWORK' ||
    axiosError.code === 'ECONNABORTED' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
};
```

- [ ] **Step 2: Guard the refresh catch**

Replace the `catch (refreshError)` body so a network failure preserves the session:

```ts
      } catch (refreshError) {
        // A network failure is not an authentication failure. Keep the tokens
        // and the session so the app can keep serving cached data offline;
        // the request itself still rejects and the caller falls back.
        if (!isNetworkError(refreshError)) {
          clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(refreshError);
      } finally {
```

- [ ] **Step 3: Guard authStore.initialize**

In `frontend/src/stores/authStore.ts`, change the outer `catch` so an offline start keeps whatever user state is known rather than clearing it:

```ts
    } catch (error) {
      // Offline at startup: keep the stored token and any cached user so the
      // protected layout does not bounce to /login. Only a real rejection
      // from the server should end the session.
      if (!isNetworkError(error)) {
        clearTokens();
        setUser(null);
      }
    } finally {
```

Import `isNetworkError` from `@/lib/apiClient`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass, 0 lint errors.

Manually: load the app, open DevTools → Network → Offline, reload. Before this change you land on `/login`; after it you stay on the page. Record what you observed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/apiClient.ts frontend/src/stores/authStore.ts
git commit -m "fix(frontend): keep the session when the network drops"
```

---

## Task 2: Service worker and installable shell

**Files:**
- Modify: `frontend/package.json` (add `@serwist/next`, `serwist`)
- Modify: `frontend/next.config.ts` (wrap with `withSerwist`)
- Create: `frontend/src/app/sw.ts`
- Modify: `frontend/src/app/manifest.json`
- Create: `frontend/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- Modify: `frontend/.gitignore` (ignore generated `public/sw.js`)

**Background:** `manifest.json` exists but there is no service worker, no PWA dependency, and `public/` has no icons — so the app is not installable and nothing is cached.

- [ ] **Step 1: Install**

```bash
cd frontend && npm install @serwist/next serwist
```

- [ ] **Step 2: Write the service worker**

Create `frontend/src/app/sw.ts`:

```ts
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Any navigation the network cannot serve falls back to this route, which
  // is precached. Without it, a hard reload while offline shows the browser's
  // dinosaur instead of the app.
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();
```

- [ ] **Step 3: Wire it into the build**

In `frontend/next.config.ts`, wrap the existing export. Keep every current option — `output: 'standalone'`, `reactCompiler`, and the `images` block with its `NEXT_PUBLIC_IMAGE_HOST` guard — intact:

```ts
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // The service worker aggressively caches; running it in `next dev` makes
  // every code change look like it did not apply.
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
```

- [ ] **Step 4: Create the offline fallback route**

Create `frontend/src/app/offline/page.tsx` — a plain page, palette-compliant, no animation, explaining that the view needs a connection and that queued work is safe. It must not import anything that fetches.

- [ ] **Step 5: Icons and manifest**

Generate `icon-192.png`, `icon-512.png`, and a maskable 512 into `frontend/public/icons/`. Use the existing brand mark: a yellow-400 (`#FBBF24`) rounded square with a black `T`, matching the logo in `Navbar.tsx`. Any deterministic generator is fine (`sharp` is already a dependency).

Update `frontend/src/app/manifest.json` with `name`, `short_name`, `start_url: "/dashboard"`, `display: "standalone"`, `background_color: "#FFFFFF"`, `theme_color: "#FBBF24"`, and the three icons with correct `sizes`/`purpose`.

- [ ] **Step 6: Ignore the generated worker**

Add to `frontend/.gitignore`:

```
# Generated by @serwist/next
public/sw.js
public/sw.js.map
public/swe-worker-*.js
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npm run build`
Expected: build succeeds and `public/sw.js` is produced. Confirm with `ls -la public/sw.js`.

Run: `cd frontend && npm start`, then in DevTools → Application → Service Workers confirm it is activated, and → Manifest confirm the icons load and no installability errors are listed. Record what you observed.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/next.config.ts \
  frontend/src/app/sw.ts frontend/src/app/offline/page.tsx \
  frontend/src/app/manifest.json frontend/public/icons frontend/.gitignore
git commit -m "feat(pwa): add service worker, manifest icons and offline fallback"
```

---

## Task 3: Server-side idempotency for order creation

**Files:**
- Modify: `backend/src/models/SalesOrder.js`, `backend/src/models/ServiceOrder.js`
- Modify: `backend/src/controllers/salesController.js`, `backend/src/controllers/serviceController.js`
- Modify: `backend/src/routes/salesRoutes.js`, `backend/src/routes/serviceRoutes.js`
- Test: `backend/tests/sales.test.js`, `backend/tests/service.test.js`

**Background:** Replaying a queued order must not create a duplicate. A device can send an order, lose the connection before reading the response, and retry — the server must recognise the retry and return the original order rather than creating a second one. This is what makes the outbox safe to retry blindly.

**Interfaces:**
- Produces: both create endpoints accept an optional `clientRequestId` (a UUID the client generates). A second create with the same id returns `200` and the existing order instead of `201` and a new one.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/sales.test.js`:

```js
  describe('POST /api/sales idempotency', () => {
    it('returns the existing order when the same clientRequestId is replayed', async () => {
      const { token } = await createTestAdmin();
      const { branch, product } = await seedSellableStock();
      const clientRequestId = new mongoose.Types.ObjectId().toString();

      const payload = {
        clientRequestId,
        branch: branch._id,
        customer: { name: 'Offline Customer', phone: '09171234567' },
        items: [{ product: product._id, quantity: 1 }],
        paymentMethod: 'cash',
      };

      const first = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);
      expect(first.status).toBe(201);

      const replay = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(replay.status).toBe(200);
      expect(replay.body.data._id).toBe(first.body.data._id);
      expect(await SalesOrder.countDocuments({ clientRequestId })).toBe(1);
    });

    it('still creates separate orders for different clientRequestIds', async () => {
      const { token } = await createTestAdmin();
      const { branch, product } = await seedSellableStock();

      const make = () => request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientRequestId: new mongoose.Types.ObjectId().toString(),
          branch: branch._id,
          customer: { name: 'Customer', phone: '09171234567' },
          items: [{ product: product._id, quantity: 1 }],
          paymentMethod: 'cash',
        });

      const a = await make();
      const b = await make();

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.data._id).not.toBe(b.body.data._id);
    });
  });
```

Use whatever fixture helpers the suite already defines rather than `seedSellableStock` if a suitable one exists — read the file first and match it. Add the mirror tests to `service.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && npm test -- sales.test.js -t "idempotency"`
Expected: FAIL — the replay returns 201 and a second document exists.

- [ ] **Step 3: Add the field**

In both `SalesOrder.js` and `ServiceOrder.js`, add to the schema:

```js
    // Client-generated idempotency key. Lets a queued offline order be
    // replayed safely: a retry after a dropped connection resolves to the
    // order already created rather than a duplicate. Sparse because online
    // creates do not send one.
    clientRequestId: {
      type: String,
      index: { unique: true, sparse: true },
    },
```

- [ ] **Step 4: Short-circuit the controllers**

At the top of `createSalesOrder`, after destructuring `req.body` and before any validation work:

```js
  if (clientRequestId) {
    const existing = await SalesOrder.findOne({ clientRequestId });
    if (existing) {
      return ApiResponse.success(res, 200, 'Order already recorded', existing);
    }
  }
```

Mirror it in `createServiceOrder`. Persist `clientRequestId` on the created document.

- [ ] **Step 5: Validate the field**

In both route files, add to the create validation chain:

```js
  body('clientRequestId').optional().isString().isLength({ min: 8, max: 100 })
    .withMessage('clientRequestId must be an opaque string of 8-100 characters'),
```

- [ ] **Step 6: Verify**

Run: `cd backend && npm test`
Expected: all suites green, above the current 14 suites / 407 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models backend/src/controllers backend/src/routes backend/tests
git commit -m "feat(api): accept a client idempotency key on order creation"
```

---

## Task 4: IndexedDB mirror of the working set

**Files:**
- Create: `frontend/src/lib/offline/db.ts`
- Create: `frontend/src/lib/offline/cache.ts`
- Modify: `frontend/package.json` (add `idb`)

**Interfaces:**
- Produces: `openOfflineDb()`, and typed `putMany(store, rows)` / `getAll(store)` / `getById(store, id)` helpers over stores `products`, `categories`, `stock`, `suppliers`, `salesOrders`, `serviceOrders`, `branches`, `meta`.

- [ ] **Step 1: Install**

```bash
cd frontend && npm install idb
```

- [ ] **Step 2: Define the database**

Create `frontend/src/lib/offline/db.ts` with an `idb` schema, version 1, the stores above keyed on `_id`, and a `meta` store for per-store `lastSyncedAt`. Export a memoised `openOfflineDb()`.

Keep this file free of React and of anything importing `apiClient`, so the service worker and plain modules can use it.

- [ ] **Step 3: Read-through helpers**

Create `frontend/src/lib/offline/cache.ts` exporting `cacheList(store, rows)` and `readCachedList(store)`, plus `isOffline()` built on `navigator.onLine`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/offline
git commit -m "feat(offline): add an IndexedDB mirror for the offline working set"
```

---

## Task 5: Populate the mirror from successful reads

**Files:**
- Modify: the domain hooks under `frontend/src/hooks/` for products, categories, stock, suppliers, branches, sales, services

**Background:** Each `hooks/useX.ts` exports a query-key factory and wraps TanStack Query. The cheapest correct integration is to write to IndexedDB on success and read from it when a query fails while offline — no change to any page.

- [ ] **Step 1: Add the shared wrapper**

Create `frontend/src/lib/offline/offlineQuery.ts` exporting a helper that takes a store name and a `queryFn`, writes the result to IndexedDB on success, and on a network error returns the cached rows instead of throwing.

- [ ] **Step 2: Apply it**

Wire it into the list queries of each domain hook. Do not change any query key, any mutation, or any page.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`

Manually: load each list page online, go offline in DevTools, reload, and confirm the rows still render. Record what you observed per page.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/offline frontend/src/hooks
git commit -m "feat(offline): serve cached lists when a read fails offline"
```

---

## Task 6: The outbox

**Files:**
- Create: `frontend/src/lib/offline/outbox.ts`
- Create: `frontend/src/lib/offline/sync.ts`
- Modify: `frontend/src/hooks/useSales.ts`, `frontend/src/hooks/useServices.ts`

**Interfaces:**
- Produces: `enqueue(op)`, `listOutbox()`, `replayOutbox()`, and an `outbox` IndexedDB store holding `{ id, kind, payload, clientRequestId, createdAt, status, attempts, lastError }` where `status` is `pending | syncing | rejected`.

- [ ] **Step 1: Implement the queue**

Each entry carries a `clientRequestId` generated with `crypto.randomUUID()` at enqueue time — the same value across every retry, which is what makes Task 3's dedupe work.

- [ ] **Step 2: Implement replay**

`replayOutbox()` processes entries oldest-first, sequentially — never in parallel, because two orders drawing on the same stock must be adjudicated in a deterministic order. On `2xx` mark done and delete. On a **network** error stop and leave the rest pending. On a **4xx** mark `rejected`, store the server's message, and continue with the next entry.

- [ ] **Step 3: Trigger replay**

Call `replayOutbox()` on `window.online`, and once on app mount if the browser is online. Invalidate the relevant TanStack Query keys afterwards so lists refresh.

- [ ] **Step 4: Route offline creates into it**

In the sales and service create mutations, if `isOffline()`, enqueue and return an optimistic local record instead of calling the API. The UI must show the order as pending rather than confirmed.

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`

Manually: go offline, create a sales order, confirm it appears as pending; go online and confirm it syncs and the pending marker clears. Record the transcript.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/offline frontend/src/hooks
git commit -m "feat(offline): queue offline order creation and replay it on reconnect"
```

---

## Task 7: Review queue and offline affordances

**Files:**
- Create: `frontend/src/app/(protected)/sync/page.tsx`
- Create: `frontend/src/components/offline/OfflineBanner.tsx`
- Create: `frontend/src/components/offline/PendingBadge.tsx`
- Modify: `frontend/src/components/layouts/Navbar.tsx`
- Modify: `frontend/src/app/(protected)/layout.tsx`

**Background:** The conflict policy is only honest if a rejected order is visible and actionable. Without this page, a rejected sale is a silent data-loss bug.

- [ ] **Step 1: Offline banner**

A persistent, non-animated bar shown while `navigator.onLine` is false, stating that changes are being saved locally. Palette-compliant.

- [ ] **Step 2: Pending badge**

A count of `pending` outbox entries, rendered in the navbar, linking to `/sync`.

- [ ] **Step 3: Review page**

`/sync` lists outbox entries grouped by status. For each `rejected` entry show what was attempted, the server's reason, and two actions: **Discard** (delete the entry) and **Retry** (set back to `pending` and replay). Do not offer a "force" action — the server is authoritative by design.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`

Manually: with two browser profiles, take both offline, sell the same last unit from each, bring both online, and confirm one commits and the other lands in `/sync` with a stock reason. Record the transcript — this is the acceptance test for the whole feature.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app frontend/src/components
git commit -m "feat(offline): add the sync review queue and offline affordances"
```

---

## Task 8: Documentation and merge

- [ ] **Step 1:** Document the offline model in `CLAUDE.md`: what works offline, the outbox, the idempotency key, the server-authoritative conflict policy, and the review queue.
- [ ] **Step 2:** Run the full gate: `cd backend && npm test` and `cd frontend && npx tsc --noEmit && npm run lint && npm run build`.
- [ ] **Step 3:** Merge to `master` with `--no-ff` and push.

---

## Self-Review Notes

**Deliberately out of scope**, and stated to the owner: offline stock adjustments, transfers, and product/user administration. Those are the operations where two devices can diverge in ways no automatic merge can repair, and the owner chose to keep them online-only. They must fail with a clear message offline, not queue.

**The known weak point** is that a queued order reserves nothing. Stock can be sold out from under a device that is offline, which is exactly why Task 7's review queue is load-bearing rather than decorative — it is where that inevitable case surfaces. Pre-allocating per-device quotas was considered and rejected by the owner because stock held in an offline device's allocation is invisible to every other device.

**Not addressed:** the sequential human-readable identifiers (`SO-YYYY-000001`) are still assigned by the server at insert time, so an offline order has no order number until it syncs. The UI must show a local placeholder and swap it after replay. This is called out in Task 6 Step 4 and is the main user-visible seam.
