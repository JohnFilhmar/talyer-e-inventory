# Public product catalog: design

Date: 2026-09-29. Status: approved in conversation, awaiting spec review.

## Goal

Replace the mock products on the public site with the real catalog. A visitor,
without logging in, can browse, search and filter active products, open a
product page, see its price and which branches have it, and then buy in store.
There is no cart, reservation, checkout or payment in this release.

## Decisions (made by the owner, 2026-09-29)

| Question | Decision |
|---|---|
| What can a visitor do | Browse only. Buying happens at a branch. |
| Which price is shown | `Product.sellingPrice` everywhere, with the line "Price may vary by branch; confirm at the counter." on the product page. Branch `Stock.sellingPrice` is not shown. |
| How much stock is shown | A text label per branch: In stock, Low stock, Out of stock. No quantities anywhere. |
| Which products appear | Every product with `isActive: true` and `isDiscontinued` not true, including ones out of stock everywhere. No new field. |
| Architecture | Dedicated public API plus server-rendered pages. |

Rejected: opening the existing staff product endpoints to the public (they are
the staff contract and carry cost data); client-fetched catalog pages (not
indexable by search engines, spinner on first paint); an opt-in "show on
website" flag (every existing product would start hidden).

## Existing state this changes

- `frontend/src/app/(public)/(landing-page)/landing-page.tsx` renders
  `SAMPLE_PRODUCTS` (a hardcoded array). "Add to Cart" has no handler. "View
  all" links to `/products`, the staff page.
- No backend route serves products without `protect`.
- **Leak, fixed here.** `GET /api/products`, `/api/products/search` and
  `/api/products/:id` (`backend/src/routes/productRoutes.js:316`, `:325`,
  `:341`) require only `protect`, so a self-registered customer can read them.
  `getProducts` returns whole documents, including `costPrice`, and
  `Product` serializes virtuals (`toJSON: { virtuals: true }`,
  `backend/src/models/Product.js:109`), so the `profitMargin` virtual goes out
  too. It also includes inactive products unless `?active=` is passed.

## Backend

### Routes

New router `backend/src/routes/publicRoutes.js`, mounted in `server.js` as
`app.use('/api/public', apiLimiter, publicRoutes)`. No `protect`. `apiLimiter`
keys unauthenticated traffic by IP.

Controller `backend/src/controllers/publicCatalogController.js`:

| Route | Query | Response data |
|---|---|---|
| `GET /api/public/products` | `page`, `limit` (default 24, max 48), `search`, `category`, `motorcycleModel` (comma-joined ids), `sort` (`newest`, `name`, `price_asc`, `price_desc`; default `newest`) | Paginated `PublicProduct` cards via `ApiResponse.paginate`, each with `availableAt` |
| `GET /api/public/products/:id` | none | One `PublicProduct` plus `branches` |
| `GET /api/public/categories` | none | Active categories: `_id`, `name` |
| `GET /api/public/motorcycle-models` | none | `_id`, `make`, `model`, `yearFrom`, `yearTo` |

Query names on these routes follow the existing product routes
(`motorcycleModel`), since the frontend service maps its own snake_case URL
parameters to them.

Every query is filtered to `isActive: true` and `isDiscontinued: { $ne: true }`.
A detail request for an inactive, discontinued or missing product answers 404.
`search` matches name, brand, `productModel`, barcode and motorcycle make or
model, the same mixed search `GET /products/search` runs; the resolving logic
is extracted to a shared helper rather than copied. Values reaching a filter go
through `asObjectId`, `asEnum` and `asCount` from `utils/narrowing.js` in the
controller, as the repo requires.

### The allow-list serializer

All four reads use `.lean()` and pass through one function,
`toPublicProduct(doc)` in `backend/src/utils/publicProduct.js`, which builds a
new object from an explicit list:

`_id`, `name`, `description`, `brand`, `productModel`, `category { _id, name }`,
`motorcycleModels [{ _id, make, model, yearFrom, yearTo }]`, `images [{ url, isPrimary }]`,
`primaryImage` (computed the same way as the model virtual), `sellingPrice`.

`.lean()` skips virtuals, so `profitMargin` cannot appear, and a field added to
`Product` later stays private until someone adds it here. No `costPrice`,
`quantity`, `reservedQuantity`, supplier, `specifications` or timestamps other
than what is listed.

### Availability

- `availableAt` on a card: the number of branches whose `Stock` for the product
  has `quantity - reservedQuantity > 0`. One aggregate over the page's product
  ids, not one query per card.
- `branches` on the detail: every active branch that has a `Stock` row for the
  product, as `{ _id, name, city, phone, status }`. `status` is
  `out-of-stock` when available is 0, `low-stock` when available is at or below
  `reorderPoint`, otherwise `in-stock`.
- Available means `quantity - reservedQuantity`. The model's `stockStatus`
  virtual compares raw `quantity` and ignores reservations, so it is not used.

### Caching

Manual read-through with `CacheUtil`, keys `cache:public:<route>:<normalized query>`,
TTL 60 seconds. No invalidation hooks: public data may be up to a minute stale,
and no existing mutation path has to change. With Next's own 60 second
revalidate in front, a change reaches the public site within about two minutes.

### Staff routes lock-down

`GET /api/products`, `/api/products/search` and `/api/products/:id` gain
`authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON, USER_ROLES.MECHANIC)`.
Customers get 403 there and use `/api/public` instead. No customer-facing page
calls these routes today.

### Backend tests

New `backend/tests/publicCatalog.test.js`, mount-the-router pattern:

- No response from any public route contains `costPrice`, `profitMargin`,
  `quantity` or `reservedQuantity` at any depth.
- Inactive and discontinued products are absent from the list and 404 on detail.
- Status labels follow available quantity: a row with quantity 5, reserved 5
  reads `out-of-stock`; at or below `reorderPoint` reads `low-stock`.
- `availableAt` counts only branches with available stock.
- Filters, sort and pagination bounds (`limit` above 48 is clamped).
- No token is needed.

Added to `backend/tests/product.test.js`: a customer token gets 403 on the three
staff reads.

## Frontend

### Pages

Server components under `frontend/src/app/(public)/catalog/`:

- `page.tsx`: listing. Reads `search`, `category`, `motorcycle_model`, `sort`,
  `page` from `searchParams`. Renders filters, a grid of cards, pagination, and
  an empty state ("No parts match these filters").
- `[product_id]/page.tsx`: detail. Images, name, brand, `productModel`, fitment
  list, description, price, the branch-price line, and branch availability.
  `generateMetadata` sets title, description and Open Graph image. An unknown
  product calls `notFound()`.
- `error.tsx`: "The catalog is unavailable right now. Please try again shortly."
  when the backend fails, instead of an unhandled error.

### Data layer

- `frontend/src/lib/public/catalogApi.ts`, server-only (`import 'server-only'`).
  Base URL is `process.env.API_INTERNAL_URL`, falling back to
  `NEXT_PUBLIC_API_URL` for `npm run dev` outside Docker. Uses
  `fetch(url, { next: { revalidate: 60 } })`. Exports `getPublicProducts`,
  `getPublicProduct`, `getPublicCategories`, `getPublicMotorcycleModels`, each
  with JSDoc.
- `frontend/src/utils/validators/publicCatalog.ts`: one Zod schema per shape,
  types derived with `z.infer`. Every response is parsed; a parse failure is
  thrown as an error that `error.tsx` renders.
- A 404 from the detail route returns `null` so the page can call `notFound()`.

### Components

In `frontend/src/components/catalog/`, each with JSDoc on its props:

- `ProductCard`: image, name, brand, fitment summary, "₱X", and
  "Available at N branches" or "Out of stock". Links to the detail page.
- `CatalogFilters` (client component): category and motorcycle fitment use the
  existing `components/ui/Combobox`; sort is a native `<select>`. Changes push
  new URL parameters with `useRouter`.
- `BranchAvailability`: branch name, city, phone, and the status as a text
  label.
- `CatalogPagination`: previous and next links plus "Page X of Y".

Design rules from `CLAUDE.md` apply: the strict palette, status carried by text
not colour, no transitions, mobile first from 320px, `max-w-7xl` container,
Tailwind scale values only.

### Landing page

- `(landing-page)/page.tsx` becomes an async server component that fetches the
  8 newest public products and passes them to `LandingPage` as a prop.
- `SAMPLE_PRODUCTS` and its `useState` are removed. The product section renders
  `ProductCard`s. "Add to Cart" is replaced by the card's link to the detail
  page; "View all" links to `/catalog`.
- If the fetch fails, the section renders nothing rather than failing the
  landing page.
- `SAMPLE_SERVICES`, `SAMPLE_SALES` and `SAMPLE_EVENTS` are out of scope and
  stay as they are.

### Configuration

- `docker-compose.yml`, frontend service: `environment: API_INTERNAL_URL: http://backend:5000/api`.
  The compose service name is the same in every environment, so no GitHub
  variable or deploy change is needed.
- `CLAUDE.md` Environment section documents `API_INTERNAL_URL` and why it is
  not a `NEXT_PUBLIC_*` value.

### Frontend tests

Vitest, `environment: 'node'`: `lib/public/catalogApi.test.ts` covers URL and
query building, successful parsing, a malformed response rejected by Zod, and a
404 detail returning `null`. `frontend-build` in CI covers the pages compiling.

## Known ceiling: one rate-limit bucket for the whole public site

Server rendering means every catalog request reaches the backend from the
frontend container's address, so the entire public site shares one
`apiLimiter` bucket (3000 requests per 15 minutes). The 60 second revalidate
keeps normal traffic far below that, since backend requests scale with distinct
URLs per minute rather than with visitors. A crawler requesting thousands of
distinct search URLs could exhaust the bucket and put the catalog on its error
page for everyone until the window resets.

Accepted for v1. The code marks it with a `ponytail:` comment, and a Prometheus
rule in `monitoring/rules/talyer.yml` alerts on sustained 429 responses from
`/api/public` routes. The fix, forwarding the visitor's address from the
frontend and keying on it, depends on the production `TRUST_PROXY` value and is
its own change.

## Out of scope

Cart, reservations, checkout, payments, customer order history, per-branch
prices on the public site, the landing page's services, sales and events
sections, and the mobile app.

## Acceptance

- `/catalog` and `/catalog/<id>` render real products, server-side, with no
  login.
- The landing page shows the 8 newest real products and links into the catalog.
- No public response contains cost, margin or quantity data (asserted by test).
- A customer token is refused on the staff product routes.
- `npm test` in `backend` and `frontend`, `npm run lint` and `npm run build` in
  `frontend` pass; `python scripts/gen_endpoints.py --check` passes after the
  README endpoint list is regenerated.
