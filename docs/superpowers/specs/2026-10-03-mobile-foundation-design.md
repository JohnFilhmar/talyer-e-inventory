# Mobile app, sub-project 1: Foundation

Date: 2026-10-03. Status: approved in conversation, awaiting spec review.

## Why a native app

The web staff app already runs on tablets as an installable PWA with offline sales. The owner
chose a native Android app for four things the PWA cannot do well:

- **Barcode scanning that works on every device.** iOS Safari has no `BarcodeDetector`, and
  native camera scanning is more reliable on Android too.
- **Receipt printing** on Bluetooth ESC/POS thermal printers at the counter.
- **Store or MDM distribution** instead of "Add to home screen".
- **Stronger offline:** surviving a day or more without a connection.

## The whole mobile project, and where this spec sits

1:1 parity means the same features and role rules as the authenticated web app (23 pages; admin,
salesperson, mechanic), designed for touch, tablet layout first, phone layout in the same slice.
It is built as five sub-projects, each with its own spec, plan and build:

1. **Foundation (this spec):** native auth, API client, encrypted local database and sync engine,
   role-aware navigation shell, design tokens, read-only catalog and stock, Android release.
2. Sales and POS: new sale with native scanning, durable outbox, sync review, sale detail,
   refunds, Bluetooth receipt printing.
3. Services: jobs, assignment, the mechanic's my-jobs, parts, job invoices.
4. Admin catalog: products with camera photos, categories, motorcycle models.
5. Admin operations: stock, restock, adjust, transfers, suppliers, branches, users, dashboard.

## Decisions (owner, 2026-10-02 and 2026-10-03)

| Question | Decision |
|---|---|
| Platform | Android tablets and phones only. |
| Offline | Longer window (a day or more) with a real on-device database and background sync, but the same writes as the web: only new sales and service jobs queue, and the server stays authoritative. |
| Order | Foundation first, then Sales, Services, Admin catalog, Admin operations. |
| Sessions | Per-device sessions with rotating refresh tokens and reuse detection (Section 1). |
| Shared code | Mobile owns its own Zod schemas for every response it reads; no shared package. |
| Theme | Light only, matching the web. |

Rejected: a shared types/validators workspace package (restructures the repo; its own project),
offline queueing beyond new orders (two devices can diverge in ways no merge repairs), iOS.

## 1. Backend: per-device sessions

### The problem

`User.refreshToken` (`backend/src/models/User.js:73`) holds one token per user, so a user has one
session. Logging in on a tablet overwrites the web session's token and the web is signed out at
its next refresh; two tablets sharing a counter account sign each other out. And a native client
never receives a refresh token: login sets it only as an httpOnly cookie, and React Native has no
cookie jar. `/auth/refresh-token` already reads `req.body.refreshToken`
(`backend/src/controllers/authController.js:165-166`), so only the issuing half is missing.

The refresh token is also never rotated, which the security baseline requires.

### The design

New model `backend/src/models/Session.js`, one document per signed-in device:

| Field | Meaning |
|---|---|
| `user` | ref User, indexed |
| `client` | `'web'` or `'native'` |
| `deviceLabel` | free text from the client, max 100 chars, for a future "your devices" list |
| `tokenHash` | SHA-256 hex of the current refresh token; plaintext is never stored |
| `previousTokenHash`, `rotatedAt` | the token just rotated out, for the grace window |
| `lastUsedAt` | updated on each refresh |
| `expiresAt` | 30 days after the last rotation (sliding); TTL index removes expired documents |
| `revokedAt` | set on logout, reuse, or password change |

The refresh token is a JWT signed with `JWT_REFRESH_SECRET` carrying `{ id, sid }`, where `sid`
is the session id.

**On `POST /auth/refresh-token`**, after verifying the JWT:

- Session missing, revoked, or expired, or the user inactive: 401.
- Token hash equals `tokenHash`: rotate. Mint a new refresh token, store its hash, move the old
  hash to `previousTokenHash`, set `rotatedAt`, extend `expiresAt`, return a new access token.
- Token hash equals `previousTokenHash` and `rotatedAt` is under 30 seconds ago: return a new
  access token without rotating. This is two browser tabs refreshing at once; the winner's new
  cookie is already in the shared cookie jar.
- Any other hash: reuse of a consumed token. Revoke the session, answer 401, log a `warn` with the
  user id and session id (never the token).

**Clients.** `POST /auth/login` accepts optional `client: 'native'` and `deviceLabel`.

- **Native:** the response body carries `refreshToken`; no cookie is set. Refresh with a body
  token returns the rotated `refreshToken` in the body. The CSRF double-submit check does not
  apply, since there is no cookie (`requireCsrfToken` passes a request without one).
- **Web:** unchanged in shape. The cookie is re-issued on every rotation, and the CSRF cookie still
  rotates with it.

**Revocation.** Logout revokes the presenting session only. A password change (self or admin)
revokes every session of that user, in addition to the existing `pwd` claim on access tokens.

**Migration.** A pre-change cookie (no `sid` claim) whose value equals the legacy
`User.refreshToken` is converted on its first refresh: a `web` session is created and the token
rotated, so nobody is signed out on deploy. After 30 days the legacy field and this branch are
removed (a follow-up, noted in `CLAUDE.md`).

**Known ceiling.** Any caller can request body tokens with `client: 'native'`, including script
running in a compromised web page. That does not widen what such script can do while it runs,
but a stolen 30-day refresh token outlives the page. Proving the caller is the genuine app (Play
Integrity attestation) is out of scope.

### Backend tests

New `backend/tests/session.test.js`: rotation issues a new token and the old one is refused after
the grace window; reuse revokes the session; a second token within 30 seconds gets an access
token without rotation; a legacy cookie migrates; web and native sessions of one user coexist;
logout revokes only its own session; a password change revokes all; the native login returns a
body token and sets no cookie; the web login sets the cookie and returns none. Existing
`auth.test.js` and `csrf.test.js` keep passing.

## 2. Mobile app architecture

### Structure

Follows `expo-offline-first` and `project-structure-conventions`:

- `app/(auth)/login.tsx`; `app/(app)/_layout.tsx` is the role-aware shell; screens in
  `app/(app)/...` stay thin.
- `providers/`: `AuthProvider`, `ConnectivityProvider`, `SyncProvider`, composed in
  `app/_layout.tsx` inside the existing `QueryClientProvider`. The existing
  `contexts/theme-context.tsx` moves to `providers/` (convention: one providers directory).
- `lib/api/client.ts`, `lib/auth/tokenStore.ts`, `lib/db/`, `lib/sync/`; `types/` and
  `utils/validators/` for the Zod schemas; `_functions/` beside a screen for single-use helpers.
- camelCase modules and hooks, PascalCase components (React carve-out).

### API client

`lib/api/client.ts`: axios with `Authorization: Bearer`, base URL from the build profile. A 401 on
a non-auth endpoint triggers one shared refresh with the body refresh token; concurrent 401s wait
on it. Rules carried from the web: a network error is never treated as an auth failure (no
logout); a 403 "account deactivated" forces logout. Tokens live in `expo-secure-store` (Android
Keystore) via `lib/auth/tokenStore.ts`.

### Local database

`expo-sqlite` with SQLCipher (`useSQLCipher` in the config plugin). The key is 32 random bytes
generated on first launch and kept in secure-store. Foundation tables: `products`, `categories`,
`motorcycle_models`, `branches`, `stock`, and `sync_state (entity, cursor_page, started_at,
finished_at, last_error)`. Rows store the validated API object as JSON plus the indexed columns
screens filter on (name, category id, branch id, sku, barcode).

The UI reads SQLite through TanStack Query hooks; SQLite is the source of truth for screens.
Logout deletes the database file and the key, because tablets are shared.

### Sync engine (pull-only in Foundation)

`lib/sync/`: for each entity, walk the existing paginated list endpoint page by page, validate
each page with Zod, upsert rows, and record the page in `sync_state` so an interrupted run resumes
from the next page. When the last page lands, rows not seen in this run are deleted
(mark-and-sweep). Re-running a page is harmless because writes are upserts.

- What each role mirrors follows what the API lets it read, and what later slices need offline:

  | Entity | Admin | Salesperson | Mechanic |
  |---|---|---|---|
  | products, categories, motorcycle models, branches | yes | yes (POS picker, Sales slice) | yes (parts picker, Services slice) |
  | stock | all branches | own branch (the server clamps it) | no (`/api/stock` refuses mechanics) |
- Triggers: app start, return to foreground, reconnection (NetInfo), a 5-minute timer while the
  app is open, and a best-effort Android background task (`expo-background-task`, WorkManager).
- One run at a time; a trigger during a run is dropped, not queued.
- Full refreshes are cheap at this shop's scale. "Changed since" endpoints wait until data volume
  shows the need.

### Mobile tests

Jest (`jest-expo`): sync engine (interrupted page resumes, a replayed page changes nothing, rows
removed on the server are swept, Zod rejects a malformed page without writing), API client
(concurrent 401s share one refresh, a network error does not log out, a revoked session logs
out), logout wipes the database and tokens. SQLite and secure-store run against in-memory
stand-ins.

## 3. Shell, screens, design, release

### Orientation and navigation

Tablets run landscape or portrait; phones lock to portrait at runtime with
`expo-screen-orientation`. `app.json` `orientation` changes from `portrait` to `default`.

Expo Router tabs render as a left side rail on screens 720dp wide or more
(`tabBarPosition: 'left'`, `@react-navigation/bottom-tabs` 7.19) and as bottom tabs on phones,
four destinations plus "More". Destinations follow the web navbar's role rules (admin: the ten
sections; salesperson: Dashboard, Sales, Services; mechanic: Dashboard, My Jobs) and appear only
once their slice is built. The web's Profile link points at a page that does not exist and is not
copied.

### Foundation screens

- **Login.** Email, password, error states (wrong credentials, rate limited, offline).
- **Products.** List with search, category filter and fitment filter; detail with images,
  fitment, and stock per branch the user can see. Read-only.
- **Stock.** The branch's stock with text labels (In stock, Low stock, Out of stock from
  available quantity); admins pick the branch. Read-only.
- **Sync and account.** Last synced per entity, Sync now, connection status, signed-in user and
  branch, Sign out.

All of them work offline from SQLite and say when the data was last refreshed.

Which screens each role sees follows the web navbar, where Products and Stock are admin-only. So
in Foundation an admin sees Products, Stock, and Sync and account; a salesperson and a mechanic
see Sync and account only, with their mirrored data already on the device for the Sales and
Services slices that give them their screens.

### Design

The web's strict palette (yellow-400, black, white, gray-100/200/400/500) as tokens in
`tailwind.config.ts`; Inter; status as text labels; no animation beyond spinners; touch targets
at least 48dp; safe areas respected; light theme only. On device NativeWind's rem is 14, so one
spacing unit is 3.5dp; layouts use scale units, never brackets.

### Release

EAS Build profiles in `eas.json`: `development` (dev client), `preview` (internal APK, staging
API), `production` (AAB for Play internal testing, production API). `expo-updates` with manually
published channels, gated like production deploys. Needs from the owner: the Expo account and
Android signing credentials.

### UI tests

React Native Testing Library for role-filtered navigation and offline states of each screen. A
manual pass on an Android emulator or tablet closes the slice. Native on-device automation
(Maestro) waits for the POS flow.

## Out of scope for Foundation

Any write from the app (sales, jobs, stock, catalog), the outbox, barcode scanning, printing,
camera, push notifications, a "your devices" screen, dark mode, iOS, Play Integrity.

## Acceptance

- Two devices of one user stay signed in together; a reused refresh token revokes its session.
- Existing web login, refresh and logout keep working, including sessions created before deploy.
- A fresh Android install logs in, mirrors products, categories, motorcycle models, branches and
  stock, and browses all of it with the network off.
- An interrupted sync resumes; logout leaves no data or tokens on the device.
- Navigation shows only the user's role destinations, as a side rail on a tablet and bottom tabs
  on a phone.
- `npm test` in `backend` and `mobile-app`, `npm run lint` and `npm run typecheck` in
  `mobile-app`, and an EAS `preview` APK build all pass.
