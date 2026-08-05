# Talyer E-Inventory — Feature Inventory

Everything the system does today, compiled from the shipped backend and web
frontend. This is the source material for the mobile app: the mobile client
talks to the same API and must respect the same rules.

Written against `master` as of the Expo scaffold. Where behaviour is subtle or
counter-intuitive it is called out — those are the parts most likely to be
reimplemented wrongly.

---

## 1. What the product is

A multi-branch inventory and operations system for a motorparts and automotive
service business. Three things happen in it: stock is tracked per branch,
parts are sold, and vehicles are serviced. Money and inventory move together.

The single most important design decision: **stock is per-branch**. `Product`
holds catalog data only. `Stock` is the `(product, branch)` join and owns
`quantity`, `reservedQuantity`, `costPrice`, `sellingPrice`, and
`reorderPoint`. The same product legitimately costs different amounts at
different branches, and an order is always priced from the branch's `Stock`,
never from `Product`.

---

## 2. Roles

Four roles, from `backend/src/config/constants.js`. Authorization is enforced
server-side per route; the UI mirrors it but is not the control.

| Role | Scope |
|---|---|
| `admin` | Everything, across all branches. The only role that can manage users, branches, categories, products, suppliers, and stock adjustments/transfers. |
| `salesperson` | Their own branch only. Sells, creates service jobs, views stock. |
| `mechanic` | Their own branch, and within it only jobs assigned to them. |
| `customer` | Created by public registration. Has almost no reachable functionality today — see §11. |

**Branch scoping is not cosmetic.** Non-admins are clamped to `req.user.branch`
on reads and rejected with 403 on cross-branch writes. This is enforced by
`checkBranchAccess` (route-param based) and `resolveBranchScope` /
`canAccessBranch` (body/query based).

---

## 3. Authentication

- Access token (JWT, 7 days) returned in the login response; the web client
  stores it in `localStorage` and sends `Authorization: Bearer`.
- Refresh token (30 days) set as an **httpOnly cookie** by the server, which is
  why the web client sends `withCredentials: true`.
- `POST /auth/refresh-token` reads that cookie and mints a new access token.
- **Public registration only ever creates a `customer`.** It used to accept a
  `role` field, which let anyone self-register as admin. That is closed;
  privileged accounts are created by an admin via `POST /users`.
- `POST /auth/forgot-password` always answers `200` with a generic message
  whether or not the email exists, so it cannot be used to enumerate accounts.
  There is no mail transport, so the reset token is echoed in the response
  **only** when `NODE_ENV !== 'production'`.
- Rate limiting: 10 requests / 15 min on the five credential endpoints only.
  `/me`, `/refresh-token`, and `/logout` are on the general 300/15min limiter —
  a strict limit there locks out a whole office sharing one IP.

**For mobile:** the refresh token is an httpOnly cookie. A native client has no
cookie jar by default; this needs a deliberate decision (cookie-capable HTTP
client, or a server change to return the refresh token in the body for native
clients). Do not assume the web flow transfers unchanged.

### Endpoints

```
POST   /auth/register            public — always creates a customer
POST   /auth/register-customer   public
POST   /auth/login
POST   /auth/refresh-token
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/logout
GET    /auth/me
```

---

## 4. Branches

Branch CRUD, admin-only for writes. Each branch carries an address, contact
details, and settings (currency, timezone, business hours, tax rate).

```
GET    /branches            any authenticated user
GET    /branches/:id
GET    /branches/:id/stats   branch-scoped: non-admins only their own
POST   /branches             admin
PUT    /branches/:id         admin
DELETE /branches/:id         admin — deactivates, does not hard-delete
```

---

## 5. Catalog: categories and products

**Categories** are hierarchical (unlimited parent/child nesting). Admin-only
for writes. Deleting checks for child categories and attached products first.

```
GET/POST     /categories
GET/PUT/DELETE /categories/:id
GET          /categories/:id/children
```

**Products** are catalog records: name, SKU, description, brand, barcode,
images, specifications. SKUs are auto-generated as `PROD-000001`.

```
GET    /products              paginated, searchable, filterable
GET    /products/search       full-text across name, SKU, brand, barcode
GET    /products/:id
POST   /products              admin
PUT    /products/:id          admin
DELETE /products/:id          admin
POST   /products/:id/images         multipart upload
POST   /products/:id/images/url     attach by URL
DELETE /products/:id/images/:imageId
```

Uploads go through multer (memory) + sharp: resized to fit 800×800, converted
to progressive JPEG at q80, written to `backend/uploads/products/` with a UUID
filename. Max 5 MB. The stored URL is absolute, built from `BACKEND_URL`.

---

## 6. Stock

The core domain. Stock is always `(product, branch)`.

`Stock.availableQuantity` is a **virtual**: `quantity - reservedQuantity`.
Availability checks must use it, never raw `quantity`.

```
GET  /stock                          admin + salesperson, branch-clamped
GET  /stock/low-stock                quantity <= reorderPoint
GET  /stock/branch/:branchId         admin + salesperson, branch-checked
GET  /stock/product/:productId       admin + salesperson — cross-branch view
POST /stock/restock                  admin + salesperson, branch-clamped
PUT  /stock/:id/restock              adds quantity only, no price change
POST /stock/adjust                   admin only — manual correction with reason
PUT  /stock/:id/adjust               admin only
GET  /stock/movements                admin only
GET  /stock/movements/stock/:stockId
GET  /stock/movements/product/:productId
GET  /stock/movements/branch/:branchId
GET  /stock/transfers                admin + salesperson, own branch either side
GET  /stock/transfers/:id
POST /stock/transfers                admin
PUT  /stock/transfers/:id            admin — status transition
```

### StockMovement — the audit ledger

Append-only. Every quantity change writes one, in a fixed order: capture the
old quantity, mutate and save the stock, *then* create the movement (it derives
before/after from the saved document). Movement types: `restock`,
`adjustment_add`, `adjustment_remove`, `sale`, `sale_cancel`, `service_use`,
`transfer_out`, `transfer_in`, `initial`.

Adding a stock-mutating path without writing a movement silently breaks the
audit trail.

### Transfers

Branch-to-branch, with a status workflow (`pending` → `in-transit` →
`completed` / `cancelled`). Quantity leaves the source and arrives at the
destination as the status advances, each step logged as a movement.

---

## 7. Sales orders

```
GET    /sales                  paginated, filterable, branch-clamped
GET    /sales/stats
GET    /sales/branch/:branchId
GET    /sales/:id              admin + salesperson
GET    /sales/:id/invoice      admin + salesperson
POST   /sales                  admin + salesperson
PUT    /sales/:id/status
PUT    /sales/:id/payment
DELETE /sales/:id              admin — cancels and releases stock
```

Order numbers are `SO-YYYY-000001`, generated server-side at insert.

Creating an order prices each line from that branch's `Stock.sellingPrice`,
checks `availableQuantity`, and **reserves** stock. Completing it deducts
stock, writes `sale` movements, and creates a `Transaction`.

Payment tracks method (`cash`, `card`, `gcash`, `paymaya`, `bank-transfer`),
amount paid, change, and status (`pending`, `partial`, `paid`, `refunded`).

`GET /sales/stats` returns nested `{ orders: {...}, revenue: {...}, payment:
{...} }` — including `revenue.today` and `revenue.month`, whose day and month
boundaries are computed in `REPORT_TIMEZONE` (default `Asia/Manila`), not UTC.

### Barcode scanning (web)

The new-sale screen has a camera scanner using the native `BarcodeDetector`.
A scan resolves the code against the branch stock already loaded and adds the
line item, bumping quantity on a repeat scan. The same code is ignored for
1.2s after a read — a barcode held in frame decodes ~10×/second, which would
otherwise create ten line items for one product.

Product search matches **name, SKU, and barcode**.

---

## 8. Service orders

```
GET    /services               paginated, filterable, branch-clamped
GET    /services/my-jobs       mechanic — only jobs assigned to them
GET    /services/:id
GET    /services/:id/invoice
POST   /services               admin + salesperson
PUT    /services/:id/assign    admin + salesperson — assign a mechanic
PUT    /services/:id/status    admin + mechanic
PUT    /services/:id/parts     admin + mechanic — parts consumed
PUT    /services/:id/payment   admin + salesperson
DELETE /services/:id           admin
```

Job numbers are `JOB-YYYY-000001`. Workflow: `pending` → `scheduled` →
`in-progress` → `completed` / `cancelled`. Priority: `low`, `normal`, `high`,
`urgent`.

Each job records vehicle details (make, model, year, plate, VIN, mileage),
customer details, a description and diagnosis, parts used, labor cost, and
other charges. Completing it deducts the parts from stock, writes
`service_use` movements, and creates a `Transaction`.

---

## 9. Suppliers

```
GET    /suppliers        admin + salesperson
GET    /suppliers/:id
POST   /suppliers        admin
PUT    /suppliers/:id    admin
DELETE /suppliers/:id    admin
```

Auto-generated codes. Linked to stock records for restock provenance.

---

## 10. Users

Admin-only, entirely.

```
GET    /users              paginated, filterable by role and branch
POST   /users              create staff
GET    /users/:id
PUT    /users/:id
PATCH  /users/:id/deactivate
PATCH  /users/:id/activate
PATCH  /users/:id/password  admin sets another user's password
```

Deactivating does not delete: `protect` rejects a token whose user has
`isActive === false`, so access stops immediately while history is preserved.

`branch` is required for `salesperson` and `mechanic`, and must be absent for
`admin` and `customer`. Sending `branch: null` is the explicit way to clear it.

### First-run seeding

`backend/src/utils/seedAdmin.js` bootstraps the first admin from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` on startup, because public
registration only creates customers and creating staff needs an existing admin.
It skips if either variable is unset, and skips if any admin already exists, so
restarts and extra replicas never create a second admin.

---

## 11. Known gaps

Documented so the mobile app does not try to surface things that do not exist.

- **`Transaction` is write-only.** Records are created on order completion but
  no route, controller, or UI can read them back. There is no financial report.
- **The `customer` role reaches almost nothing.** It is registerable and
  authenticates, but there is no customer-facing order history or tracking.
- **The dashboard fetches no data.** No backend aggregate endpoint feeds it.
- **No notifications, no realtime.** `socket.io` is a dependency with zero
  imports.
- **`refund`, `expense`, and `transfer` transaction types** are declared in the
  model but no code path creates them.
- **Reporting and analytics** do not exist beyond `/sales/stats`.

A fuller audit of 118 verified findings lives in [`docs/gap-audit.md`](../../docs/gap-audit.md).

---

## 12. Offline behaviour (web PWA)

The web client is an installable PWA that keeps working through a wifi drop.
The mobile app should match this model rather than inventing another.

**What works offline:** browsing every mirrored list, opening order and job
details, printing invoices, and **creating sales and service orders**.

**What does not:** stock adjustments, transfers, product/category/supplier
edits, and user admin. These require a connection and fail with a message
rather than queueing — they are the operations where two devices diverge in
ways no automatic merge can repair.

**Conflict policy is server-authoritative.** The first replay to arrive
commits. A later one that no longer fits available stock is rejected with a
reason and surfaces in a review queue for a human to void, backorder, or
re-price. There is deliberately **no client-side force or override** — one
would let a user oversell stock.

**Target window: hours.** A shift or a dropped connection, not days.

### How it is built

1. **Service worker** precaches the app shell and falls back to an offline
   route. It deliberately does *not* cache API responses — a shared HTTP cache
   on a shared tablet can serve one user's data to the next.
2. **IndexedDB mirror** holds the working set: `products`, `categories`,
   `stock`, `suppliers`, `salesOrders`, `serviceOrders`, `branches`,
   `stockTransfers`. Cleared on logout, unconditionally, so it never survives
   into the next person's session.
3. **Outbox** queues offline order creation and replays it oldest-first,
   **sequentially** — two orders drawing on the same stock must be adjudicated
   in a deterministic order.
4. **Server idempotency.** `POST /sales` and `POST /services` accept an
   optional `clientRequestId`; a replay of a key already seen returns **200
   with the existing order** instead of 201 and a duplicate. The dedupe runs
   after the branch-access check but before any stock is touched.

### Rules that are load-bearing

- **`clientRequestId` is generated once at enqueue and reused on every retry.**
  Regenerate it and the server sees a brand-new order.
- **Failure classification:** a network error leaves the entry pending and
  stops the run; a **4xx** marks it rejected and continues; a **5xx** leaves it
  pending and stops, counting toward a cap of 5 attempts. Treating a 5xx as
  permanent would discard real sales during a deploy.
- **`navigator.onLine` is only trustworthy in the negative.** `true` means an
  interface is up, not that the server is reachable.
- **A queued order has no server `_id` and no `SO-YYYY-NNNNNN` number** — those
  are assigned at insert. It shows `Pending sync`, never a fabricated number.
- Optimistic records are rebuilt from the request payload, so any field the
  response would have populated has to be resolved from the mirror: line
  pricing from `Stock.sellingPrice`, product name and SKU, and the branch
  object. Miss one and it renders as blank or zero.

---

## 13. Deployment shape

- `master` is production, `staging` is staging. Deploys are manual, from the
  Actions tab, choosing environment and whether to run security checks.
- Both stacks run in Docker Compose behind nginx on a self-hosted VPS runner,
  isolated by Compose project name and host port.
- **`NEXT_PUBLIC_API_URL` must carry the `/api` suffix.** The backend mounts
  every router under `/api` while the web client requests unprefixed paths.
  The mobile app's base URL has the same requirement.
- The API also serves `/uploads/*` from the backend root, *outside* the `/api`
  prefix. Product image URLs are absolute.

See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) for the full runbook.

---

## 14. Design system

The web app enforces a deliberately narrow visual language, mirrored in
`mobile-app/constants/colors.ts`:

- **Palette:** yellow-400 `#FBBF24` (brand), black, white, plus
  gray-100/200/400/500 for chrome. Danger red is the only accent beyond that.
- Primary action = yellow background, black text. Secondary = black background,
  white text. Danger = black background, red text.
- **No transitions or animations** on web; loading spinners are the only
  exception. The mobile app may reasonably relax this for native gesture
  feedback, but the restraint is intentional and should be a decision, not
  drift.
- Container width `max-w-7xl`; mobile-first throughout.
