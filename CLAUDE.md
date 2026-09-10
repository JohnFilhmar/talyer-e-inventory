# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent npm packages, no workspace root. Every command must be run from inside
[backend/](backend/) or [frontend/](frontend/) — there is no package.json at the repo root.

- `backend/` — Express 5 + Mongoose + Redis REST API (ESM, `"type": "module"`)
- `frontend/` — Next.js 16 App Router + React 19 + TypeScript + Tailwind 4
- `backend/docs/`, `frontend/docs/` — per-phase implementation plans (`Phase-N.md` = plan,
  `Phase-N-done.md` = what shipped). Useful history, but stale in places, and they are a record of
  what was planned rather than a description of the code. `frontend/docs/Frontend-Guidelines.md` is
  a retired stub (GAP-052); its design system lives here now.
- `scripts/gen_endpoints.py` — regenerates README's endpoint list from the route files.
  `python scripts/gen_endpoints.py --check` exits non-zero when README has drifted. README used to
  document eight endpoints that did not exist and omit about twenty that did, which is why the list
  is generated rather than written. **The route file is still the authority** for the roles a route
  demands, since only the `authorize(...)` call carries those.

## Commands

```bash
# Backend (cd backend)
npm run dev                       # nodemon on src/server.js, port 5000
npm start                         # node src/server.js
npm test                          # jest --runInBand (NODE_ENV=test) — green: 29 suites, 825 tests, 1 pending
npm test -- stock.test.js         # single suite
npm test -- -t "should reject"    # single test by name
npm run test:coverage
node src/utils/seedBranches.js --confirm   # DESTRUCTIVE: deletes ALL existing branches, then seeds 3 Philippine branches into MONGODB_URI. Without --confirm it prints the target database and exits 1; under NODE_ENV=production it also needs --force-production. Importing the module does nothing.
npm run migrate:product-model     # one-off: renames Product.model → Product.productModel; idempotent

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

**Product images and the loopback guard.** Next 16 defaults
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

`authLimiter` (10 requests/15 min) and `apiLimiter` (3000 requests/15 min) live in
[middleware/rateLimit.js](backend/src/middleware/rateLimit.js). `apiLimiter` is mounted on every
router including `/api/auth`; `authLimiter` is applied per-route in
[authRoutes.js](backend/src/routes/authRoutes.js) to the five credential endpoints only —
`/register`, `/register-customer`, `/login`, `/forgot-password`, `/reset-password`. Do not move it
back onto the whole router: `/me` and `/refresh-token` are called on every protected page mount
and on every token expiry, so a strict limiter there locks out a whole office sharing one IP.
Both `skip` whenever `NODE_ENV === 'test'`, so the Jest suites never see rate limiting.

**The two key differently.** `authLimiter` keys by IP alone: its routes are the ones reached
without a token, so there is no user to key by, and bounding guessing from one source is the whole
point. `apiLimiter` keys through `userOrIpKey`, which prefers the authenticated user (`user:<id>`)
and falls back to the client IP (`ip:<address>`) only for unauthenticated traffic. Two details are
load-bearing. The token is **verified**, not merely decoded: an unverified token used as a key
lets anyone mint arbitrary strings and take a fresh bucket per request, which removes rate
limiting rather than scoping it, and a token that fails verification falls through to the IP
bucket without that being an auth decision, since `protect` still runs and still rejects it. And
the fallback goes through `ipKeyGenerator` rather than raw `req.ip`, which is what truncates IPv6:
an untruncated v6 address gives one client a fresh bucket per request, because it can vary the low
bits at will.

`TRUST_PROXY` (see Environment) therefore governs the IP path only. It matters for `authLimiter`
and for unauthenticated traffic on `apiLimiter`; authenticated requests key by user id and are
unaffected by it. The 3000 ceiling is sized for staff doing sustained bulk work rather than for an
anonymous public API: saving one product also invalidates and refetches the detail and the list,
so real work costs roughly ten requests per edit, and the old shared 300 ran out after about
thirty edits and then locked the user out for the rest of a fixed fifteen-minute window.

**Narrow request values where they are used.** Every value that reaches a Mongo filter goes
through [utils/narrowing.js](backend/src/utils/narrowing.js) in the controller that uses it:
`asObjectId`, `asEnum`, `asDate`, `asCount`. The route's express-validator chain is not a
substitute. It lives in a different module, so the controller is safe only for as long as every
route in front of it keeps its chain, an assumption that has failed three times here
(`resolveBranchScope`, GAP-017's service routes, GAP-015d's read routes). It is also what CodeQL
reports, since the analysis does not model validator chains.

Two details are load-bearing:

- **Each helper returns a value the caller constructed**, not the caller's own: `asEnum` returns
  the entry from the allowed list rather than the input that matched it. That is what makes it a
  barrier rather than an assertion.
- **They require a string; they do not coerce one.** `String(x)` is not a type check: a
  one-element array stringifies to its element, so `String(['507f1f77bcf86cd799439011'])` is that
  id exactly and passes a regex test. The guard in `branchScope.js` had that shape and a comment
  claiming otherwise.

**CSRF.** `cookieParser()` is mounted on `/api/auth` only, not globally — `authController` is the
sole reader of `req.cookies` in the backend, and parsing cookies for routers that never consult
them only widens the set of handlers a browser-attached cookie can reach.

Every route except one authenticates from `Authorization: Bearer`, which a cross-site page cannot
set, so those routes are not forgeable. `POST /auth/refresh-token` is the exception — it reads the
`refreshToken` cookie — and is guarded by `requireCsrfToken`
([middleware/csrf.js](backend/src/middleware/csrf.js)): a double-submit check requiring the
`X-XSRF-TOKEN` header to echo a readable `XSRF-TOKEN` cookie. That cookie is deliberately **not**
`httpOnly` (the SPA has to read it to echo it) and is not a credential — it proves only that the
sender can read cookies for this origin. `setRefreshTokenCookie` issues it and
`clearRefreshTokenCookie` clears it, so the pair never drifts apart, and a successful refresh
rotates it. `ensureCsrfToken` is mounted router-wide so every auth response carries a token even
when no refresh cookie is being set — it only fills in a missing cookie and never rotates one,
because rotating on every request would reject a request the SPA already had in flight.

Two things are load-bearing:
- `X-XSRF-TOKEN` must stay in `CORS.ALLOWED_HEADERS`. Drop it and the preflight for the refresh
  call fails, so the SPA can never renew a token — a total logout at the first expiry.
- A request carrying **no** `XSRF-TOKEN` cookie is allowed through. That is a migration allowance
  for sessions established before this shipped; rejecting them would sign out every logged-in user
  on deploy. It is not a hole — an attacker cannot delete a victim's cookie cross-site, so they
  cannot push a protected session back into the unprotected state. The refresh handler issues a
  token, so each such session becomes protected after one refresh. Once every live session
  predates the deploy by more than the 30-day refresh lifetime, this branch can become a rejection.

**A password change ends every session.** Access tokens carry a `pwd` claim holding the moment the
user's password last changed ([utils/jwt.js](backend/src/utils/jwt.js)), `models/User.js` stamps
`passwordChangedAt` in the same `pre('save')` hook that hashes the password, and `protect` rejects a
token whose claim does not match. Three details are load-bearing:

- **`generateToken` takes the user document, not an id, and throws otherwise.** A caller passing a
  bare id would mint a token claiming "never changed", which stays valid across a password change
  for exactly the users this protects.
- **The claim is not the token's `iat`.** `iat` has one-second resolution and a reset lands in the
  same second as the login that follows it, so no `iat` comparison can both reject the old token
  and accept the new one. That was tried first and did the opposite of what it should.
- **A token with no `pwd` claim decodes to 0, which matches a user who has never changed their
  password.** That is the migration allowance, the same shape the CSRF cookie uses: sessions
  predating the deploy keep working until their owner changes their password.

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

### Logging

[utils/logger.js](backend/src/utils/logger.js) exports a `pino` instance and it is the only
logger. `backend/src` has no `console.*` calls left except in the four operator scripts
(`seedBranches.js`, `migrateCounters.js`, `migrateProductModel.js`,
`reconcileReservations.js`), which a human runs by hand and reads on a terminal; JSON would
make those worse, not better.

**One JSON object per line on stdout, and nothing else.** Docker's `json-file` driver already
captures it and [docker-compose.yml](docker-compose.yml) bounds it at 10 MB across three files,
so this needs no new infrastructure. A shipper pointed at the same stream can forward it later
with no change here. Do not add a file destination or a network transport to the logger: that
would have to be undone before anything can collect it.

`LOG_LEVEL` sets the level and defaults to `info`. **Under `NODE_ENV=test` the logger is
`silent`**, because 29 suites making thousands of requests otherwise bury the failure you are
looking for in JSON.

Four things are load-bearing:

- **`redact` covers `req.headers.authorization` and `req.headers.cookie`.** `pino-http` logs the
  request, so without it every authenticated request writes a usable bearer token to the log,
  which is worse than the console line it replaced. `set-cookie`, `password` and `refreshToken`
  are redacted for the same reason.
- **Every request carries an id**, echoed as the `X-Request-Id` response header. An id supplied
  by a proxy is honoured so one request keeps a single id across hops. That id is what ties an
  error line to the request that produced it, which is why `errorHandler` logs `req.id`.
- **`errorHandler` logs after the status is resolved, not before.** It used to run
  `console.error('Error:', err)` at the top, so every ordinary 400 and 404 was written at error
  level with the whole error object attached: an alert on error-level lines would have fired on
  a customer mistyping an email. The level now follows the status the client receives, `warn`
  for 4xx and `error` for 5xx.
- **Only `name` and `message` reach the log, never the error object.** A Mongoose
  `ValidationError` echoes the offending document, which is how a password hash or a customer's
  details end up in a log line. The stack is attached for 5xx only.

`forLog()` from [utils/logSafe.js](backend/src/utils/logSafe.js) is still applied to
user-controlled values that reach a log field, even though pino's JSON encoding escapes
newlines on its own. It is cheap, and it is the shape CodeQL recognises as a log-injection
barrier (GAP-059); removing it reopens those alerts.

### Metrics

[utils/metrics.js](backend/src/utils/metrics.js) exposes a Prometheus registry with
`prom-client`'s default process metrics plus an `http_request_duration_seconds` histogram,
whose `_count` series doubles as the request counter.

**`/metrics` is served on its own port, not the application port.** `METRICS_PORT` defaults
to 9464 and is published to nothing. The production overlay binds 5000 to `127.0.0.1` and
nginx proxies it, so anything on that port is one `location` block away from being public,
and metrics enumerate every route along with request rates and error counts. A second
listener reachable only from the Docker network Prometheus is attached to has no
configuration mistake that exposes it. That listener serves `GET /metrics` and nothing
else: no router, no body parser, no application middleware.

Two things are load-bearing:

- **The `route` label is the matched pattern, never the URL.** `routeLabel()` reads
  `req.route`, which the router sets to the pattern (`/:id`), and buckets anything that
  matched no route as `unmatched`. Labelling by URL would create a series per product id,
  and a scanner probing random paths would be unbounded cardinality that Prometheus has no
  defence against. The middleware is mounted **before** the routers so `req.route` is
  populated by the time `finish` fires.
- **The registry sets no default labels.** The monitoring hub attaches `project` and
  `service` from the container's `metrics.project` and `metrics.name` labels. A `service`
  label set here would collide, and the collision is silent: Prometheus renames it to
  `exported_service`, so alert rules written against `service` would match nothing and never
  fire.

**Onboarding needs no change to the monitoring stack.** The hub at `/opt/vps-monitoring` on
the deployment host discovers targets through the Docker socket and scrapes only containers
that opt in, so the compose overlays attach the backend to the external `metrics` network
and set `metrics.scrape`, `metrics.project`, `metrics.port` and `metrics.name`. Alert rules
live in [monitoring/rules/talyer.yml](monitoring/rules/talyer.yml) and the deploy workflow
installs them to `/opt/monitoring/rules/` and reloads Prometheus. That copy goes through a
container with a bind mount because the runner user has no sudo and that directory is
root-owned; the runner is in the `docker` group, which is what makes it work.

### Domain model — branch-scoped inventory

This is the core design decision. `Product` holds catalog data only. `Stock` is the
`(product, branch)` join and owns the per-branch `quantity`, `reservedQuantity`, `costPrice`,
`sellingPrice`, and `reorderPoint` — the same product legitimately has different prices at
different branches. Orders always price from the branch's `Stock`, not from `Product`.

`Stock.availableQuantity` is a virtual (`quantity - reservedQuantity`). Check
`availableQuantity`, never raw `quantity`, before committing stock to an order.

### Domain model — motorcycle fitment

`MotorcycleModel` (`make` + `model` + optional `yearFrom`/`yearTo`) is a flat collection of the
motorcycles the shop stocks parts for. `Product.motorcycleModels` references it many-to-many and
is appendable like `tags` — one part fits several bikes, one bike takes many parts.

Two fields on `Product` sound alike and must not be confused: **`productModel`** is the
manufacturer's designation for the part itself (`45120-KVB-901`), while **`motorcycleModels`** is
what the part *fits*. `productModel` was renamed from `model` for exactly that reason;
[utils/migrateProductModel.js](backend/src/utils/migrateProductModel.js) (`npm run
migrate:product-model`) does the one-off `$rename` and must be run against any database that
predates the change, or every product silently loses its manufacturer designation.

Identity is a derived, unique `code` (`HONDA-CLICK-125I-2018-2023`) rebuilt in a `pre('save')`
hook whenever make/model/years change — which is why `updateMotorcycleModel` uses `set` + `save`
rather than `findByIdAndUpdate`, since query middleware would never run the hook and a renamed
model would keep its old identity. That code is what makes "Honda"/"HONDA" a duplicate rather
than two makes.

`GET /products?motorcycleModel=a,b` matches products fitting **any** of the listed ids
(comma-joined, not an array — axios serialises arrays as `key[]=…`, which Express parses under
the literal key `key[]`). `GET /products/search` is *mixed*: one `q` matches the part (name, SKU,
brand, `productModel`, barcode) and the motorcycle, by resolving motorcycle models to ids first
and folding them into the same `$or`. It also accepts `motorcycleModel` with no `q` at all.

Deleting a motorcycle model is refused while any product references it, and every mutation
invalidates `cache:product:*` as well as its own keys — product reads embed populated fitment, so
a rename would otherwise leave cached products showing the old label. The stock reads that back
the New Sale picker nest-populate fitment for the same reason: offline, an unpopulated id is an
opaque string with nothing to match against.

### Money

Every monetary field is a double, and doubles cannot represent most centavo amounts. Three units
at PHP 8.10 multiply out to 24.299999999999997. That is not a display problem: the stored `total`
is what `payment.amountPaid >= total` compares against, so an unrounded total leaves a customer
who paid the amount on the screen sitting in `partial`, and a full-value line discount produces a
total of about -3.55e-15 that trips the schema's `min: 0` and rejects the sale.

[utils/currency.js](backend/src/utils/currency.js) exports `roundCurrency` (half away from zero,
two decimals) and `sumCurrency` (adds raw, rounds once). **Every computed monetary assignment
rounds at the point of assignment**, in both totals hooks and at the three `Transaction.amount`
writes. `amountPaid` is not rounded: it is entered, not computed.

Do not replace the helper with `Math.round(value * 100) / 100`. That is the bug, not the fix:
`1.005 * 100` is `100.49999999999999` and rounds down. The helper shifts the decimal exponent
through `toExponential`, which is exact and also survives values already in exponential notation.

### Stock lists are server-filtered and paginated

`GET /stock` and `GET /stock/branch/:branchId` take `page`, `limit` and `search`. The search matches
the product's name, SKU, barcode, brand and `productModel`, and because `Stock` references
`Product` rather than copying its fields, it resolves product ids first and filters by them. Do not
move that filtering back into the browser: the list paginates, so a client-side filter searches
only the rows already on screen, and a shop with 300 SKUs cannot reach page four's product from
page one.

Two frontend reads deliberately walk every page instead of paginating
([lib/services/stockService.ts](frontend/src/lib/services/stockService.ts)): `getByBranch`, which
backs the New Sale picker and the offline mirror behind it, and `getAllPages`, which backs the
transfer modal. Both need the whole set, the picker because it filters by motorcycle fitment and no
endpoint can express that, and both are bounded at 50 pages of `MAX_LIMIT`.

**Ordering is still not server-side** (GAP-057). `.sort({ 'product.name': 1 })` in
`stockController` sorts on a path `Stock` does not have, because `populate` is a second query run
after the sort; the stock page then reorders the page it fetched. Fixing it needs an aggregation
with `$lookup`.

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

Human-readable IDs are allocated from a `Counter` collection, one document per sequence, by
[utils/sequence.js](backend/src/utils/sequence.js): `PROD-000001`, `SO-YYYY-000001`,
`JOB-YYYY-000001`, `TR-YYYY-000001`, `SM-YYYY-000001`, `TXN-YYYYMM-000001`. A single
`findOneAndUpdate` with `$inc` and `upsert` is atomic on one document, which is why this works on
the standalone production server with no transaction.

Three things here are load-bearing:

- **The hooks are `pre('validate')`, not `pre('save')`.** Mongoose runs validate hooks first, and
  every one of these fields except `sku` and `movementId` is `required`, so a value assigned in a
  save hook arrives after the check that demands it. The old save hooks could never fire, which is
  why both order controllers, and three separate transaction writes, used to generate their own.
- **Callers must not supply the number.** `Transaction.create` used to be handed a hand-built
  `TXN-<count>-<timestamp>` from `serviceController.js` and `utils/salesCompletion.js`, a different
  format from the one this model documents, and supplying it suppressed the hook. Pass no
  identifier and let the model allocate.
- **A counter seeds itself from existing data on first use.** `nextSequence(key, seed)` consults
  the seed only when the counter document is absent, so a database that predates this cannot
  collide even if nobody runs the migration. `npm run migrate:counters` does the same work up
  front; it reports by default, writes under `--apply`, and only ever raises a counter.

Each sequence resets on the period its prefix advertises: yearly for `SO-`/`JOB-`/`TR-`/`SM-`,
monthly for `TXN-`, never for `PROD-`.

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
`types/`. The layout is flat: `components/<domain>/`, `hooks/`, `lib/services/`. A `features/`
structure was once specified and never built; the guide that specified it is retired (GAP-052),
so this is the only description of the layout now.

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

### Design constraints

These moved here from `frontend/docs/Frontend-Guidelines.md` when that file was retired
(GAP-052). They are the part of it that was still true and still enforced across the existing
UI; the rest described a system that was never built.

- **Strict palette.** yellow-400 `#FBBF24`, black `#000000`, white `#FFFFFF`, plus gray-100
  `#F3F4F6`, gray-200 `#E5E7EB`, gray-400 `#9CA3AF` and gray-500 `#6B7280` for chrome. No other
  colours. Primary button = yellow bg / black text; secondary = black bg / white text; danger =
  black bg / red text. Active and focus states are yellow. **Status is carried by a text label**,
  not by a colour, because the palette has no red/amber/green to spend on it.
- **No transitions or animations.** Loading spinners are the only exception.
- **Typography.** Inter, system-ui, sans-serif. Headings bold and black at `text-2xl`/`text-xl`/
  `text-lg`; body `text-base`; labels `text-sm` medium; helper text `text-xs` gray-500.
- **Spacing.** Container `max-w-7xl`. Padding from Tailwind's scale (`p-4`, `p-6`, `p-8`), gaps
  `gap-4`/`gap-6`, `mb-6`/`mb-8` between major sections.
- **Mobile-first responsive is required on every page.** Design at 320px, then `md:` 768px, then
  `lg:` 1024px. Hamburger navigation on mobile; tables scroll horizontally or become cards;
  forms stack; modals go full-screen on mobile and centre on desktop.
- **Extend the primitives.** [components/ui/](frontend/src/components/ui/) holds Button, Input,
  PhoneInput, Modal, Alert, Badge, Spinner and Combobox. Add variants there rather than new base
  components.

### Uploads and the camera

[middleware/imageUpload.js](backend/src/middleware/imageUpload.js) calls `sharp(...).rotate()`
**before** `.resize()`. `.rotate()` with no argument applies the EXIF orientation tag; sharp strips
metadata on output, so without it the tag is discarded while the pixels stay in sensor order and
every portrait phone photo is stored on its side. It must come first, or the 800x800 bound is
applied to the pre-rotation dimensions. `tests/imageUpload.test.js` guards this — it needs no
database and does run in a sandbox. Note the fix only affects new uploads: images already written
sideways have no EXIF left to recover from and must be re-uploaded.

**Photos are downscaled in the browser before upload**
([lib/imageDownscale.ts](frontend/src/lib/imageDownscale.ts), called from `productService.uploadImage`
so all three image UIs get it). The server resizes to 800x800 anyway, so a 12MP phone photo
uploaded ~9 MB to be stored as ~90 KB — 99% of the bytes discarded after crossing the wire. That is
what made uploads fail with `timeout of 15000ms exceeded`: `apiClient`'s blanket 15s default is
sized for JSON, and 2.9 MB needs ≥1.59 Mbit/s sustained *upstream* to fit inside it. Uploads now
also carry their own 60s timeout as a backstop.

**The downscaler must apply EXIF orientation itself.** Canvas output carries no EXIF, so resizing
without applying the tag first would hand the server sideways pixels *and* no tag to correct by —
re-breaking the rotation fix above, this time unrecoverably. `createImageBitmap(file, {
imageOrientation: 'from-image' })` is what makes it safe; where that is unavailable the original
file is uploaded untouched rather than guessed at. Verified end to end in Chromium: a 3000x2000
landscape JPEG tagged orientation 6 comes out 1067x1600 portrait with the pixels moved correctly,
and stays correct through the server pipeline.

"Take photo" is a second `<input type="file" capture="environment">` alongside the gallery input,
in all three image UIs ([ProductImagePicker](frontend/src/components/products/ProductImagePicker.tsx)
on create, [ProductImageEditor](frontend/src/components/products/ProductImageEditor.tsx) on edit,
[ImageUploadModal](frontend/src/components/products/ImageUploadModal.tsx) on the detail page). It is
a separate input because `capture` is read when the picker opens and cannot be toggled per click.
Desktop browsers ignore the attribute and fall back to a normal file picker.

### Barcode scanner

[BarcodeScanner](frontend/src/components/scanner/BarcodeScanner.tsx) drives zoom, torch and focus
through `MediaStreamTrack` capabilities, all capability-gated — a desktop webcam reports none of
them and the controls are simply absent.

Auto-zoom works in two phases, and the distinction is load-bearing: a barcode too small to decode
produces **no** detection and therefore no bounding box, so there is nothing to "zoom to" yet.
While nothing decodes it *hunts*, ramping zoom up a step at a time and sweeping back to the wide
end after a spell at maximum; once a code decodes it *settles*, holding the bounding box inside a
coverage band and pushing the focus point-of-interest to its centre. The "at maximum" test uses the
device's zoom step as its tolerance, not the ramp step — using the ramp step stopped the hunt a
full step short of true maximum, losing exactly the range a small barcode needs.

### Combobox

[components/ui/Combobox.tsx](frontend/src/components/ui/Combobox.tsx) is the type-ahead select used
wherever a list can grow unbounded — categories and motorcycle models on the product form, the
product filters, and the sales picker. A native `<select>` has nowhere to type, which stops scaling
at a few dozen rows. Short fixed enumerations (branch, status, sort field, sort direction)
deliberately stay native `<select>`s; typeahead to choose between "Asc" and "Desc" is worse.

Two details: the highlighted index is clamped **on read** rather than corrected in an effect (the
project's React Compiler lint rejects setState in an effect body, and an effect would cost a second
render pass), and options must arrive pre-sorted by `group`, because group headings are emitted by
comparing each row to the previous one.

## Offline / PWA

The app installs as a PWA and keeps working through a wifi drop. The scope is deliberate and
narrow — widening it is a design decision, not a small change.

**What works offline:** browsing every cached list, and **creating sales and service orders**.
Everything else — stock adjustments, transfers, product/category/supplier edits, user admin —
requires a connection and fails with a message rather than queueing. Those are the operations where
two devices can diverge in ways no automatic merge can repair.

**Conflict policy is server-authoritative.** The first replay to arrive commits. A later one that
no longer fits available stock is rejected with a reason and surfaces at
[/sync](frontend/src/app/(protected)/sync/page.tsx) for a human to void, backorder, or re-price.
There is no client-side force or override, and adding one would let a user oversell stock.

**The target window is hours** — a shift or a dropped connection, not days.

### The four layers

1. **Service worker** ([app/sw.ts](frontend/src/app/sw.ts), Serwist) precaches the app shell and
   falls back to `/offline` for uncached navigations. It deliberately does **not** cache API
   responses: a shared HTTP cache on a shared tablet can serve one user's data to the next.
2. **IndexedDB mirror** ([lib/offline/db.ts](frontend/src/lib/offline/db.ts)) holds the working
   set. `DB_VERSION` must be bumped whenever a store is added — it is at 4 (v2 outbox,
   v3 stockTransfers, v4 motorcycleModels); leave it and an existing browser keeps its old schema
   and every read of the new store throws `NotFoundError`. `authStore.logout()` calls `clearOfflineCache()` in its `finally`, so the mirror never
   survives into the next person's session — including when the logout request itself fails
   offline.
3. **Outbox** ([lib/offline/outbox.ts](frontend/src/lib/offline/outbox.ts),
   [sync.ts](frontend/src/lib/offline/sync.ts)) queues offline order creation and replays it
   oldest-first, **sequentially**. Never parallelise that: two orders drawing on the same stock
   must be adjudicated in a deterministic order.
4. **Server idempotency.** `POST /api/sales` and `POST /api/services` accept an optional
   `clientRequestId`; a replay of a key already seen returns **200 with the existing order**
   instead of 201 and a duplicate. The dedupe check runs *after* the branch-access check but
   *before* any stock is touched — placed later, a replay would double-deduct while appearing to
   succeed. The unique index is sparse so the online path, which sends no key, is unaffected.

### Rules that are load-bearing

- **`clientRequestId` is generated once at enqueue and reused on every retry.** Regenerate it and
  the server sees a brand-new order — the exact duplicate the design exists to prevent.
- **Failure classification** in `sync.ts`: a network error leaves the entry `pending` and stops the
  run; a **4xx** marks it `rejected` and continues to the next; a **5xx** leaves it `pending` and
  stops, counting toward a cap of 5 attempts. Treating a 5xx as permanent would discard real sales
  during a deploy.
- **`navigator.onLine` is only trustworthy in the negative.** `true` means an interface is up, not
  that the server is reachable. `isNetworkError()` in
  [apiClient.ts](frontend/src/lib/apiClient.ts) leans on the absence of `error.response` first.
- **A network failure is not an auth failure.** The refresh handler used to clear tokens and
  redirect on any refresh error, which logged users out on a wifi blip. Do not reintroduce that.
- An offline order has **no server `_id` and no `SO-YYYY-NNNNNN` number** — those are assigned at
  insert. The optimistic record shows `Pending sync`, never a fabricated order number.

### Build constraint

`@serwist/next` hooks the **webpack** build and has no Turbopack support, so `frontend`'s `build`
script is `next build --webpack`. That flows into CI and the Docker image. Removing the flag makes
the build succeed while silently shipping no service worker. The generated `public/sw.js` is
gitignored and excluded from eslint — it is a 47 KB artifact that `git checkout` never removes.

## API base URL: the `/api` prefix trap

The backend mounts every router under `/api/*` ([server.js](backend/src/server.js)), but the
frontend services request paths *without* the prefix (`/auth/login`, `/stock/restock`), and
`server.js`'s own root-index response advertises the unprefixed paths. **`NEXT_PUBLIC_API_URL`
must therefore include the prefix** (e.g. `http://localhost:5000/api`). `.env.example` and
[docker-compose.yml](docker-compose.yml) both set it correctly with the suffix now; `README.md`
was corrected too. The two fallbacks inside
[apiClient.ts](frontend/src/lib/apiClient.ts) carried the bare origin and now carry the suffix,
so a missing `NEXT_PUBLIC_API_URL` no longer 404s every request while looking like a dead
backend. Check this first when every request 404s.

## Testing

```bash
cd backend  && npm test        # jest --runInBand, 29 suites / 825 tests + 1 pending
cd frontend && npm test        # vitest run
```

**The frontend suite is Vitest** ([vitest.config.ts](frontend/vitest.config.ts)), added with
GAP-044 and pinned to 3.x: 4 and 5 require `@types/node` 22 or newer while the package pins 20.
It covers the offline outbox's classification table, which `sync.ts` itself describes as a
data-loss bug if it is wrong in either direction. `environment: 'node'`, since these are module
tests; a component suite would opt into jsdom per file. CI runs it as `frontend-test`.

**One backend test is deliberately pending.** `concurrency.test.js` holds the oversell case as a
specification for GAP-046, marked `.skip` with a comment naming it. It is written to fail against
today's code: remove the skip before starting that gap.

Each suite builds its own bare Express app and mounts just the router under test, so global
middleware and CORS are absent from tests:

```js
const app = express();
app.use(express.json());
app.use('/api/stock', stockRoutes);
```

`npm test` is green — 29 suites / 825 tests, verified by CI's `backend-test` job:

```bash
npm test
```

**The suite may be unrunnable locally.** `mongodb-memory-server` downloads a `mongod` binary from
`fastdl.mongodb.org` on first run; in a sandbox whose network policy blocks that host, every
DB-backed suite fails in `beforeAll` with a 403 `DownloadError` — including suites that were
passing before your change. That is an environment failure, not a regression. When it happens,
push and read `backend-test`; do not infer anything from the local red.

**Assert on `errors[]`, not `message`, for validation failures.** Routes wired with
[validate.js](backend/src/middleware/validate.js) answer every rejection with a generic
`message: 'Validation failed'` and put the per-field text in `errors[]`. A test that reads
`res.body.message` therefore asserts only that *some* rule tripped, never which one — and
`res.body.message ?? res.body.errors` silently short-circuits on the always-present message. Routes
wired with [validationHandler.js](backend/src/middleware/validationHandler.js) do the opposite and
join the messages into `message`, so check which one the route under test uses.

### Two traps in the mount-the-router pattern

Both of these produced a **500 where the test expected a 2xx/4xx**, and both were invisible until
CI ran, so check for them before pushing:

- **The app under test has no `errorHandler`.** A Mongoose `ValidationError` from a schema
  validator only becomes a 400 through
  [middleware/errorHandler.js](backend/src/middleware/errorHandler.js), which `server.js` mounts
  and the suites deliberately do not. Any rule that must produce a 4xx has to live in the route's
  express-validator chain; keep the schema validator as the backstop for writes that bypass the
  route (seeds, migrations, other controllers), not as the only enforcement. The
  `yearFrom`/`yearTo` ordering rule on `MotorcycleModel` is the worked example — it exists in both
  places for exactly this reason.

- **A `ref` is resolved by name against a global registry, at populate time.** Declaring
  `ref: 'MotorcycleModel'` on a schema does not load that model. A suite that mounts only
  `stockRoutes` never imports it, so `.populate('motorcycleModels')` throws `MissingSchemaError`
  and the read 500s — while the motorcycle and product suites pass, because their test files
  import the model directly and mask it. **A model that declares a `ref` must import the target
  module for its registration side effect**; `models/Product.js` imports `./MotorcycleModel.js`
  for no other purpose. Check with:

  ```bash
  node -e "import('./src/routes/stockRoutes.js').then(async()=>{const m=(await import('mongoose')).default;console.log(Object.keys(m.models).sort())})"
  ```

[tests/user.test.js](backend/tests/user.test.js) used to be the one file that broke this: it
imported `../src/server.js`, which executes `startServer()` and calls `connectDB()` against the
real `MONGODB_URI`, reaching `process.exit(1)` with no local mongod running. It has since been
ported to the mount-the-router + `dbHandler` pattern above, minting tokens directly via
`testHelpers` instead of logging in over HTTP, so it needs no carve-out and CI runs a plain
`npm test` — see the `backend-test` job in [ci.yml](.github/workflows/ci.yml).

**Nothing in the Jest suite imports `server.js`, so nothing in it is covered.** That is the
deliberate consequence of the pattern above, and it has a cost worth knowing: a green `npm test`
says nothing about the global middleware chain, the CORS block, the request logger, or the route
mounting. The only thing in the pipeline that runs `server.js` is the **backend smoke test inside
`docker-build`**, which boots the image and polls `/health`. GAP-059 shipped a `server.js` that
threw `ReferenceError` on every request, and 825 green tests plus `node --check` plus a clean
typecheck all missed it; the smoke test caught it. When you touch `server.js`, that job is the
check that matters.

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
`CORS_ALLOWED_ORIGINS`, `BACKEND_URL`, `TRUST_PROXY`, `REPORT_TIMEZONE`, `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `LOG_LEVEL`, `METRICS_PORT` and `SHUTDOWN_GRACE_MS`. **`REPORT_TIMEZONE` was missing from this list while the list itself
claimed to be exhaustive and grep-verified** (GAP-052); it is read in
[salesController.js](backend/src/controllers/salesController.js) and
[utils/reportingPeriod.js](backend/src/utils/reportingPeriod.js) and defaults to `Asia/Manila`.
`README.md` used to also document `COOKIE_SECURE`, `COOKIE_DOMAIN`,
`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, and `RESET_PASSWORD_EXPIRE`: none of those is read
anywhere in `backend/src`. `REDIS_HOST`/`REDIS_PORT` once fed a boot-log line and no longer do,
since [config/redis.js](backend/src/config/redis.js) logs `REDIS_URL`, which is also the only
thing the connection is built from. Refresh-cookie `secure`/`sameSite` are derived from
`NODE_ENV === 'production'` in
[authController.js](backend/src/controllers/authController.js), and the password-reset token
expiry is hardcoded to 10 minutes in `getResetPasswordToken()` in
[models/User.js](backend/src/models/User.js), not read from an env var.

`TRUST_PROXY` ([utils/trustProxy.js](backend/src/utils/trustProxy.js)) is the number of
reverse-proxy hops in front of the app, defaulting to `0`. At `0`, Express's `trust proxy`
setting is off, so `X-Forwarded-For` is ignored and `express-rate-limit` resolves the IP of a
client it is keying by IP to the direct TCP peer — correct when the app is exposed directly, and
it stops a client from spoofing the header to dodge rate limiting. Behind a reverse proxy or load
balancer it must be raised to the real hop count, or every client on the IP path collapses into
one shared bucket and `authLimiter` locks out everyone at once. It has no effect on `apiLimiter`
for authenticated requests, which key by the verified user id rather than an address.

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

### CodeQL

The `codeql` job runs the `security-and-quality` suite. Two separate things appear in a PR: the
**`codeql` job** (green as long as the analysis runs) and a **`CodeQL` check run** that lists
*new* alerts in the code this PR changed and fails the PR. A green job with a red check is the
normal shape of a CodeQL failure — read the check, not the job.

There is no MCP tool for code-scanning alerts. The alert list is readable from the check run's
page (`https://github.com/<owner>/<repo>/runs/<checkRunId>`); dismissing one is a human action in
the Security tab.

**"New" means new flow, not new file.** An alert is attributed to the PR that opens the path to it,
so it will point at files the PR never touched. Routing user-supplied text into an existing helper
is enough to light up that helper.

- **Log injection + externally-controlled format string.** `forLog()` lives in
  [utils/logSafe.js](backend/src/utils/logSafe.js) and sanitises at the sink. It started private
  inside `utils/cache.js`, written for cache keys: those embed caller text (a product search term,
  a motorcycle filter value) and every `CacheUtil` method logs its key when Redis errors. That was
  never the whole set. `server.js`'s request logger writes `req.url`, and `middleware/cache.js`
  writes a key built from `req.originalUrl`, so a private copy in one module left the other two
  reported and unfixed (GAP-059). Keep it shared: the next caller that logs request text should
  import it rather than grow a third copy. Two details are load-bearing and easy to undo:
  - The value is passed to `console.error`/`console.log` as a **`%s` argument against a literal
    format string**, never interpolated into the template. Interpolating it makes the message
    itself externally controlled, so a value containing `%s` or `%d` reshuffles everything after
    it.
  - CR and LF are removed **one constant pattern at a time, replaced with `''`**. A combined
    `[\r\n]` class, or replacing with `' '`, is equally safe at runtime but is not the shape
    CodeQL recognises as a log-injection barrier, and the alerts stay open.

- **A request value used as a property *name* is its own alert.** `js/remote-property-injection`
  fired on `sort[sortBy] = ...` in `productController.js`, where `sortBy` came from `req.query`.
  The route already carried an allow-list, which is exactly the arrangement that does not count:
  narrow with `asEnum` at the sink, against a list the controller owns and the route imports, the
  way `STOCK_SORT_FIELDS` and now `PRODUCT_SORT_FIELDS` are arranged.

- **`js/user-controlled-bypass` on `middleware/auth.js` is a standing false positive.** It flags
  `req.headers.authorization.startsWith('Bearer')` as a user-controlled guard. That branch only
  decides whether to attempt verification; what guards the sensitive action is `jwt.verify` one
  line later, and skipping the branch yields a 401. There is no rewrite that satisfies the query
  without pretending the Authorization header is not user-supplied. See GAP-059.

- **Missing CSRF middleware — fixed, not dismissed.** The alert fires on handlers that are
  preceded by cookie middleware, touch `req.user`/`req.cookies`/`req.session`, and answer an
  unsafe method. It flagged ~50 handlers because `cookieParser()` was global and every
  `protect`-ed route sets `req.user` — not because those routes read cookies. Two changes:
  - `cookieParser()` is mounted on `/api/auth` only. `authController` is the sole reader of
    `req.cookies` in the backend, so parsing them app-wide bought nothing and put every handler
    behind cookie middleware. **Do not move it back to `app.use(cookieParser())`.**
  - `POST /auth/refresh-token` — the one route that authenticates from a cookie rather than an
    Authorization header, and therefore the only one a cross-site page could ride — is guarded by
    `requireCsrfToken` ([middleware/csrf.js](backend/src/middleware/csrf.js)), a double-submit
    check against a readable `XSRF-TOKEN` cookie issued alongside the refresh cookie. See the
    CSRF paragraph under *Security middleware* for the details that are load-bearing.

  Test harnesses are excluded from analysis via
  [.github/codeql/codeql-config.yml](.github/codeql/codeql-config.yml): every suite mounts its own
  Express app, so each one tripped the same web-security queries on code that is never deployed.
  The exclusion is scoped to the test directories — everything under `src/` is still analysed.

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

`mobile-app-minor-patch` is **not** allow-listed, deliberately. `mobile-check` runs lint,
typecheck and `jest --passWithNoTests`, so a green run there says the app compiles and nothing
more. Add it once mobile-app has tests worth gating on.

The `/mobile-app` npm entry holds the Expo SDK's own packages back — `expo` and `react-native`
below a minor, `expo-*`, `react-native-*`, `react` and `react-dom` below a major. `expo install
--fix` sets that whole set to what the installed SDK expects, so an individual bump past the `~`
range leaves the app off-SDK and nothing in CI notices. An Expo SDK upgrade is a migration someone
runs on purpose, not a pull request to review.

The auto-merge job waits on the checks it finds at runtime rather than a hardcoded list of names,
excluding only its own check run, so adding or renaming a CI job does not need an edit here. What
it does require is that every check reach a *terminal success*: a check that stays queued past the
30 minute deadline leaves the PR unmerged for a human, which is the intended failure direction.
