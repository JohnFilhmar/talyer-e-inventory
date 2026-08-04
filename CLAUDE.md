# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent npm packages, no workspace root. Every command must be run from inside
[backend/](backend/) or [frontend/](frontend/) — there is no package.json at the repo root.

- `backend/` — Express 5 + Mongoose + Redis REST API (ESM, `"type": "module"`)
- `frontend/` — Next.js 16 App Router + React 19 + TypeScript + Tailwind 4
- `backend/docs/`, `frontend/docs/` — per-phase implementation plans (`Phase-N.md` = plan,
  `Phase-N-done.md` = what shipped). Useful history, but stale in places. Read the route file, not
  the docs, before calling an endpoint: [README.md](README.md) still lists `POST /stock/add`,
  `POST /stock/transfer`, and `PATCH /stock/transfers/:id/approve`, while
  [stockRoutes.js](backend/src/routes/stockRoutes.js) actually serves `POST /stock/restock`,
  `POST /stock/transfers`, and `PUT /stock/transfers/:id`.

## Commands

```bash
# Backend (cd backend)
npm run dev                       # nodemon on src/server.js, port 5000
npm start                         # node src/server.js
npm test                          # jest --runInBand (NODE_ENV=test) — green: 12 suites, 391 tests
npm test -- stock.test.js         # single suite
npm test -- -t "should reject"    # single test by name
npm run test:coverage
node src/utils/seedBranches.js    # DESTRUCTIVE: deletes ALL existing branches, then seeds 3 Philippine branches into MONGODB_URI

# Frontend (cd frontend)
npm run dev                       # next dev, port 3000
npm run build && npm start
npm run lint                      # eslint (flat config, eslint.config.mjs)
```

Keep `--runInBand` (already baked into the npm scripts): every suite boots its own
`mongodb-memory-server`, so parallel workers spawn one `mongod` per suite.

```bash
# Full stack, containerized (repo root)
cp .env.example .env                # then fill in JWT_SECRET and JWT_REFRESH_SECRET
docker compose up --build           # frontend :3000, backend :5000, mongo, redis
docker compose down -v              # tear down including volumes
```

`.env.example` lives at the repo root (not inside `backend/` or `frontend/`) — `docker compose`
reads `.env` from the same directory as [docker-compose.yml](docker-compose.yml). Every other
variable there has a default; `JWT_SECRET` and `JWT_REFRESH_SECRET` are the two that abort the
build (`:?...is required`) if left unset.

**Known limitation — product images in the compose stack.** Next 16 defaults
`images.dangerouslyAllowLocalIP` to `false`, an SSRF guard on the server-side image optimizer.
Product image URLs are absolute and built from the backend's `BACKEND_URL`, so in the compose
stack they point at `http://localhost:5000`. Two things then go wrong at once: `localhost` inside
the frontend container is the frontend itself, not the backend, and the loopback address is
blocked by that guard regardless. `/_next/image` answers `400` and product images do not render —
the rest of the app is unaffected. This was confirmed empirically by toggling the flag against a
real built container. The optimizer itself is healthy: with the guard relaxed it serves both WebP
and AVIF correctly on the pinned `sharp` version.

Workarounds, in order of preference: point `BACKEND_URL` at a real hostname the frontend
container can resolve and the browser can reach (a reverse proxy in front of both services is the
production-shaped answer); or set `images.unoptimized: true` to bypass the optimizer entirely.
Do not enable `dangerouslyAllowLocalIP` to work around this in a deployment reachable from
untrusted networks — the flag exists because it turns the optimizer into an SSRF primitive.

## Backend architecture

### Request pipeline

Routes wire the chain explicitly; there is no global auth or validation middleware:

```
protect → authorize(...USER_ROLES) → express-validator chain → handleValidationErrors → controller
```

- `protect` ([middleware/auth.js](backend/src/middleware/auth.js)) verifies the Bearer JWT, loads
  the user, and 401s if missing or `isActive === false`.
- `authorize(...roles)` 403s on role mismatch. Roles come from
  [config/constants.js](backend/src/config/constants.js) — always import `USER_ROLES`, never
  hardcode role strings.
- Branch scoping uses `checkBranchAccess` (compares `req.params.branchId` to `user.branch`,
  admin bypasses) or `ownBranchOnly` (attaches `req.userBranch`) from
  [middleware/branchAccess.js](backend/src/middleware/branchAccess.js). For controllers that
  take the branch from the body/query instead of a route param,
  [utils/branchScope.js](backend/src/utils/branchScope.js) provides the same guarantee via
  `resolveBranchScope(user, requestedBranchId)` and `canAccessBranch(user, branchId)`
  (used in [stockController.js](backend/src/controllers/stockController.js)): non-admins are
  clamped to their own branch on reads and rejected with 403 on cross-branch writes.
- Controllers are wrapped in `asyncHandler` and return through `ApiResponse.success` /
  `.error` / `.paginate` ([utils/apiResponse.js](backend/src/utils/apiResponse.js)). Never call
  `res.json` directly in a controller — the envelope shape is what the frontend types expect.

Two validation-error middlewares exist and produce different payloads:
[validationHandler.js](backend/src/middleware/validationHandler.js) (joins messages into
`message`, used by all current routes) and [validate.js](backend/src/middleware/validate.js)
(structured `errors[]` via `ApiResponse.error`). Match whichever the neighbouring routes in the
same file already use.

### Security middleware

[server.js](backend/src/server.js) applies `helmet({ crossOriginResourcePolicy: { policy:
'cross-origin' } })` globally — the relaxed CORP is required so the frontend, on a different
origin, can still load product images from `/uploads`.

`authLimiter` (10 requests/15 min) and `apiLimiter` (300 requests/15 min) live in
[middleware/rateLimit.js](backend/src/middleware/rateLimit.js). `apiLimiter` is mounted on every
router including `/api/auth`; `authLimiter` is applied per-route in
[authRoutes.js](backend/src/routes/authRoutes.js) to the five credential endpoints only —
`/register`, `/register-customer`, `/login`, `/forgot-password`, `/reset-password`. Do not move it
back onto the whole router: `/me` and `/refresh-token` are called on every protected page mount
and on every token expiry, so a strict limiter there locks out a whole office sharing one IP.
Both `skip` whenever `NODE_ENV === 'test'`, so the Jest suites never see rate limiting. Both key
clients by `req.ip`, which is why `TRUST_PROXY` (see Environment) matters behind any reverse proxy.

[middleware/errorHandler.js](backend/src/middleware/errorHandler.js) collapses every 5xx message
to `'Server Error'` when `NODE_ENV === 'production'` — internal failures can otherwise leak
connection strings or file paths — while 4xx messages always pass through unchanged so clients
still get actionable text.

### Caching

Redis is optional. Every `CacheUtil` method returns `null`/`false` when the client is absent, so
code paths must work without it. Keys are `cache:<prefix>:<parts joined by :>`.

Two styles coexist: `cacheMiddleware(prefix, ttl)` mounted on a route (only
[branchRoutes.js](backend/src/routes/branchRoutes.js) does this today) and manual read-through
inside a controller (`CacheUtil.get` → miss → query → `CacheUtil.set`, the majority). Note the two
produce different keys for the same resource — the middleware keys on `req.originalUrl`, the
controller on the document id. **Any mutation must invalidate**
with `CacheUtil.delPattern('cache:<domain>:*')` — and cross-domain too where relevant
(sales/service completion invalidates both `cache:sales:*` and `cache:stock:*`).

### Domain model — branch-scoped inventory

This is the core design decision. `Product` holds catalog data only. `Stock` is the
`(product, branch)` join and owns the per-branch `quantity`, `reservedQuantity`, `costPrice`,
`sellingPrice`, and `reorderPoint` — the same product legitimately has different prices at
different branches. Orders always price from the branch's `Stock`, not from `Product`.

`Stock.availableQuantity` is a virtual (`quantity - reservedQuantity`). Check
`availableQuantity`, never raw `quantity`, before committing stock to an order.

### StockMovement ledger

`StockMovement` is an append-only audit trail. Every quantity change follows the same three
steps:

```js
const oldQuantity = stock.quantity;
stock.quantity -= item.quantity;  await stock.save();
await createMovementWithOldQuantity(stock, oldQuantity, {
  type: MOVEMENT_TYPES.SALE,
  reference: { type: 'SalesOrder', id: order._id },  // or ServiceOrder / StockTransfer
  performedBy: req.user._id,
});
```

`createMovementWithOldQuantity` derives `quantityBefore`/`quantityAfter` from the saved document,
so it must be called *after* the save. Movement types and the helper live in
[utils/stockMovement.js](backend/src/utils/stockMovement.js); `reference.type` is restricted to
`SalesOrder | ServiceOrder | StockTransfer`. Adding a stock-mutating path without a movement
record silently breaks the audit trail.

### Financial side effects

Completing a sales order or service order creates a `Transaction` record inside the same
controller action (see [salesController.js](backend/src/controllers/salesController.js) and
[serviceController.js](backend/src/controllers/serviceController.js)). Stock deduction, movement
logging, transaction creation, and cache invalidation all happen together — none of them are
hooks, so they must be replicated by hand in any new completion path.

### Identifiers

Human-readable IDs are generated in Mongoose `pre('save')` hooks via `countDocuments`:
`PROD-000001`, `SO-YYYY-000001`, `JOB-YYYY-000001`, `TR-YYYY-000001`, `TXN-YYYYMM-000001`.

### Uploads

[middleware/imageUpload.js](backend/src/middleware/imageUpload.js) uses multer memory storage +
sharp (resize to 800×800 inside, JPEG q80) and writes to `backend/uploads/products/` with a uuid
filename. `req.processedImage.url` is absolute, built from `BACKEND_URL`. The directory creation
is wrapped in try/catch to survive read-only serverless filesystems.

## Frontend architecture

### Layering

`page.tsx` → domain hook (`hooks/useX.ts`) → service (`lib/services/xService.ts`) →
`lib/apiClient.ts`. Pages never call axios directly.

Each `hooks/useX.ts` exports a query-key factory named `xKeys` (`all` / `lists()` / `list(params)`
/ detail keys). Mutations invalidate through that factory — add new keys there rather than
inlining string arrays.

Zod schemas live in `utils/validators/`, TypeScript models mirroring the Mongoose schemas live in
`types/`. Note the layout does **not** match the `features/` structure described in
[frontend/docs/Frontend-Guidelines.md](frontend/docs/Frontend-Guidelines.md) — the code uses flat
`components/<domain>/`, `hooks/`, `lib/services/`.

### Auth

Access token (7d) lives in `localStorage` via [lib/tokenStorage.ts](frontend/src/lib/tokenStorage.ts)
and is attached as `Authorization: Bearer`. Refresh token (30d) is an httpOnly cookie the backend
sets, which is why `apiClient` runs `withCredentials: true`.

The response interceptor in [lib/apiClient.ts](frontend/src/lib/apiClient.ts) handles a 401 by
refreshing once and queueing concurrent requests behind a single refresh (`isRefreshing` +
`refreshSubscribers`). Requests to paths in `AUTH_ENDPOINTS` are exempt — a 401 there means bad
credentials, not an expired token. A 403 whose message mentions "deactivated"/"account has been
disabled" force-logs-out to `/login?error=account_deactivated`.

`stores/authStore.ts` (Zustand) owns session state; `initialize()` restores a session on load and
is idempotent via `isInitialized`.

### Route protection

[app/layout.tsx](frontend/src/app/layout.tsx) wraps everything in `QueryProvider` →
`AuthProvider`. `app/(public)/` and `app/(protected)/` are Next.js route groups.
[app/(protected)/layout.tsx](frontend/src/app/(protected)/layout.tsx) is the real gate: it calls
`initialize()`, redirects to `/login`, renders `Navbar`, and wraps children in `BranchProvider`
(which exposes the non-admin user's assigned branch via `useBranchContext()`).

The `withAuthGuard` / `withRoleGuard` HOCs in `middlewares/` are per-page opt-ins layered on top
of that layout, for admin-only pages. There is no Next.js `middleware.ts` — all guarding is
client-side.

### Design constraints (from Frontend-Guidelines.md, enforced across existing UI)

- Strict palette: yellow-400 `#FBBF24`, black, white, plus gray-100/200/400/500 for chrome. No
  other colors. Primary button = yellow bg / black text; secondary = black bg / white text;
  danger = black bg / red text.
- No transitions or animations. Loading spinners are the only exception.
- Mobile-first responsive is required on every page; container is `max-w-7xl`.
- Reusable primitives already exist in [components/ui/](frontend/src/components/ui/) (Button,
  Input, PhoneInput, Modal, Alert, Badge, Spinner) — extend those rather than adding new base
  components.

## API base URL: the `/api` prefix trap

The backend mounts every router under `/api/*` ([server.js](backend/src/server.js)), but the
frontend services request paths *without* the prefix (`/auth/login`, `/stock/restock`), and
`server.js`'s own root-index response advertises the unprefixed paths. **`NEXT_PUBLIC_API_URL`
must therefore include the prefix** (e.g. `http://localhost:5000/api`). `.env.example` and
[docker-compose.yml](docker-compose.yml) both set it correctly with the suffix now; `README.md`
was corrected too, but `frontend/docs/Frontend-Guidelines.md` still shows it without. Check this
first when every request 404s.

## Testing

Backend only — the frontend has no test suite.

Each suite builds its own bare Express app and mounts just the router under test, so global
middleware and CORS are absent from tests:

```js
const app = express();
app.use(express.json());
app.use('/api/stock', stockRoutes);
```

`npm test` is green — verified 12 suites / 391 tests passing:

```bash
npm test
```

[tests/user.test.js](backend/tests/user.test.js) used to be the one file that broke this: it
imported `../src/server.js`, which executes `startServer()` and calls `connectDB()` against the
real `MONGODB_URI`, reaching `process.exit(1)` with no local mongod running. It has since been
ported to the mount-the-router + `dbHandler` pattern above, minting tokens directly via
`testHelpers` instead of logging in over HTTP, so it needs no carve-out and CI runs a plain
`npm test` — see the `backend-test` job in [ci.yml](.github/workflows/ci.yml).

`tests/setup/dbHandler.js` runs `mongodb-memory-server` (`connect` in `beforeAll`,
`clearDatabase` in `afterEach`, `closeDatabase` in `afterAll`).
`tests/setup/testEnv.js` is a `setupFiles` entry that injects the JWT secrets — no `.env` is read
under `NODE_ENV=test`. `tests/setup/testHelpers.js` provides
`createTestUser/Admin/Salesperson/Mechanic`, each returning `{ user, token, refreshToken }`.

Config is `jest.config.cjs` and `babel.config.cjs` — the `.cjs` extension is required because the
package is `"type": "module"`.

## Environment

Variables the backend actually reads: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`,
`JWT_EXPIRE`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRE`, `REDIS_URL`, `CLIENT_URL`,
`CORS_ALLOWED_ORIGINS`, `BACKEND_URL`, `TRUST_PROXY`. `README.md` used to also document
`COOKIE_SECURE`, `COOKIE_DOMAIN`, `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, and
`RESET_PASSWORD_EXPIRE` — verified via grep that `COOKIE_SECURE`, `COOKIE_DOMAIN`,
`REDIS_PASSWORD`, and `RESET_PASSWORD_EXPIRE` are read nowhere in `backend/src`, and that
`REDIS_HOST`/`REDIS_PORT` only feed a cosmetic boot-log line in
[config/redis.js](backend/src/config/redis.js) — the actual connection is built from
`REDIS_URL` alone. Refresh-cookie `secure`/`sameSite` are derived from
`NODE_ENV === 'production'` in
[authController.js](backend/src/controllers/authController.js), and the password-reset token
expiry is hardcoded to 10 minutes in `getResetPasswordToken()` in
[models/User.js](backend/src/models/User.js), not read from an env var.

`TRUST_PROXY` ([utils/trustProxy.js](backend/src/utils/trustProxy.js)) is the number of
reverse-proxy hops in front of the app, defaulting to `0`. At `0`, Express's `trust proxy`
setting is off, so `X-Forwarded-For` is ignored and `express-rate-limit` keys every client by
the direct TCP peer — correct when the app is exposed directly, and it stops a client from
spoofing the header to dodge rate limiting. Behind a reverse proxy or load balancer it must be
raised to the real hop count, or every client collapses into one shared bucket and `authLimiter`
locks out everyone at once.

Frontend `.env.local`: `NEXT_PUBLIC_API_URL` (must carry the `/api` suffix — see below) and
`NEXT_PUBLIC_IMAGE_HOST` (the origin serving `/uploads` images; consumed by
[next.config.ts](frontend/next.config.ts) to allow-list it for `next/image`, empty/unset means
only the built-in local/`backend`-hostname patterns are allowed). Both are `NEXT_PUBLIC_*`
values, which Next.js inlines at build time — in Docker they are build args to
[frontend/Dockerfile](frontend/Dockerfile), not runtime environment variables, and
[docker-compose.yml](docker-compose.yml) passes them under `frontend.build.args`.

CORS is hand-rolled in `server.js` against `CORS.ALLOWED_ORIGINS` with `credentials: true`.
`CORS_ALLOWED_ORIGINS` is comma-separated and falls back to `CLIENT_URL`; a new frontend origin
must be added there or cookie-based refresh breaks.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `backend-test`, `frontend-build`, and
`docker-build` on every push and PR to `master`.
[.github/workflows/security.yml](.github/workflows/security.yml) adds `dependency-audit`
(matrixed per package: `dependency-audit (backend)`, `dependency-audit (frontend)`),
`secret-scan`, `codeql`, and `image-scan` (also matrixed: `image-scan (backend)`,
`image-scan (frontend)`) — all four run on push/PR to `master` and again weekly on a cron.
`dependency-audit` runs `npm audit --audit-level=high` in each package; both currently exit 0.
Both `package.json` files carry npm `overrides` (`backend/package.json`: `test-exclude`,
`glob`→`minimatch`; `frontend/package.json`: `postcss`, `sharp`, `minimatch`) to force patched
transitive versions — don't strip those without re-running `npm audit` first.

`image-scan` is reporting-only: its Trivy step has no `exit-code`, so it uploads CRITICAL/HIGH
findings to GitHub code scanning (SARIF) but never fails the job regardless of what it finds.
That's deliberate — base-image CVEs are frequently unfixable upstream, and failing the build on
them would block every merge. The checks that actually fail on a real problem are `backend-test`,
`frontend-build`, `docker-build`, `dependency-audit`, and `secret-scan`.

These checks are only advisory until branch protection requires them. Enable it once with:

    gh api -X PUT repos/:owner/:repo/branches/master/protection \
      --input .github/branch-protection.json

## Deployment

`master` is production, `staging` is staging; both CI workflows run on both branches. Deploys are
manual only — Actions → Deploy → *Run workflow*, choosing the environment and whether to run
security checks first. Both stacks live on one self-hosted VPS runner, isolated by Compose project
name (`-p talyer-<env>`) and host port (staging 3001/5001, production 3000/5000, from
[docker-compose.staging.yml](docker-compose.staging.yml) and
[docker-compose.production.yml](docker-compose.production.yml)). Secrets come from GitHub
Environments and are passed to Compose as process env — no `.env` is ever written on the runner.

[backend/src/utils/seedAdmin.js](backend/src/utils/seedAdmin.js) bootstraps the first admin from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` on startup, because public registration only ever creates
a `customer` and creating staff needs an existing admin. It skips entirely if either variable is
unset, and skips if any admin already exists — so restarts and extra replicas never create a second
admin or reset a password. Every failure path is non-fatal and the password is never logged.

Full runbook, the per-environment secrets and variables table, and the traps
(`NEXT_PUBLIC_API_URL` needs `/api`, `NEXT_PUBLIC_BACKEND_URL` must not have it, `MONGODB_URI` is
not derived from the Mongo password) are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Dependabot

[.github/dependabot.yml](.github/dependabot.yml) groups updates per ecosystem. Minor/patch and
major are separate groups on purpose: the minor/patch PR is meant to be reviewed and merged
quickly, while the major PR collects breaking changes that can wait. Docker `node` majors are
ignored — Dependabot offers whatever tag is newest, including odd-numbered non-LTS releases, and
both images are pinned to `node:22-alpine` deliberately.

[.github/workflows/dependabot-auto-merge.yml](.github/workflows/dependabot-auto-merge.yml) squash-
merges the non-breaking groups once CI has actually passed. Two design points that are easy to get
wrong if you edit it:

- It triggers on `workflow_run` after CI completes, **not** on the pull request. A workflow
  triggered by the PR appears as a check on that PR, so waiting there for the PR's checks means
  waiting for itself — a deadlock until the job times out.
- It calls `gh pr merge --squash`, not `--auto`. `--auto` only defers a merge until *required*
  status checks pass, and required checks exist only under branch protection. With none configured,
  `--auto` merges immediately and the "wait for CI" intent silently disappears.

Eligibility is matched on the group name embedded in Dependabot's branch
(`dependabot/<ecosystem>/<dir>/<group>-<hash>`), allow-listing `backend-minor-patch`,
`frontend-minor-patch`, `backend-docker`, `frontend-docker`, and `github-actions`. Everything else
— both `*-major` groups and every ungrouped single-package update — is left for a human. A green
CI run is not sufficient evidence for a major bump: the suite never connects to a real Redis or a
real browser, so it passed cleanly while node-redis 6 went entirely unexercised.

The check names in that file must match the workflow job names (including matrix suffixes)
exactly, or the required check never reports and every PR blocks permanently.
