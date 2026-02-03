# Frontend Implementation Planning — Bridge to Backend MVP

This document maps the fully working backend MVP features to a clear, implementation-focused frontend plan. It defines data flow, authentication and authorization handling, endpoint contracts, and a scalable folder architecture. UI/UX styling is out of scope; focus is on features, communication, and maintainability.

## Goals
- Implement authenticated, role-aware frontend that uses the backend’s standardized `ApiResponse` format.
- Provide accurate endpoint contracts (requests/responses) for current MVP features and near-term phases.
- Establish a scalable Next.js architecture with clear module boundaries, types, services, and middleware.

---

## Architecture & Folder Structure (Next.js App Router)

Recommended structure under `frontend/src/`:
- `app/` — Route segments, layouts, and page-level containers.
  - `app/(auth)/login/` — Login route
  - `app/(protected)/dashboard/` — Protected app area wrapper
  - `app/(protected)/branches/` — Branch management views
  - `app/(protected)/products/` — Product catalog views
  - `app/(protected)/stock/` — Stock & transfers views
  - `app/(protected)/suppliers/` — Supplier views
  - `app/(protected)/sales/` — Sales order views
  - `app/(protected)/services/` — Service order views
- `features/` — Domain modules, each with cohesive units:
  - `features/auth/` — authService.ts, authSlice/store.ts, hooks.ts, types.ts
  - `features/branches/` — branchService.ts, hooks.ts, types.ts
  - `features/categories/` — categoryService.ts, hooks.ts, types.ts
  - `features/products/` — productService.ts, hooks.ts, types.ts
  - `features/stock/` — stockService.ts, hooks.ts, types.ts
  - `features/suppliers/` — supplierService.ts, hooks.ts, types.ts
  - `features/sales/` — salesService.ts, hooks.ts, types.ts
  - `features/services/` — serviceService.ts, hooks.ts, types.ts
- `components/` — Reusable UI components (tables, forms, modals, inputs)
- `lib/` — Shared utilities and client setup:
  - `lib/apiClient.ts` — Axios instance with interceptors
  - `lib/config.ts` — Env and constants
  - `lib/response.ts` — ApiResponse parsing helpers
- `middleware/` — Client-side route guards and role checks
  - `middleware/authGuard.ts` — Redirect unauthenticated users
  - `middleware/roleGuard.ts` — Enforce role-based access for pages
- `types/` — Global shared TypeScript interfaces aligned with backend models
  - `types/api.ts` — `ApiResponse<T>`, `PaginatedResponse<T>`
  - `types/models/` — `User`, `Branch`, `Category`, `Product`, `Stock`, `Supplier`, `SalesOrder`, `ServiceOrder`, `Transaction`
- `state/` — Optional global state (Zustand/Recoil) or use React Query/SWR per feature
- `hooks/` — Shared hooks (`useAuth`, `useApi`, `useBranchContext`)
- `utils/` — Formatters, validators, date helpers

Principles:
- Domain-first modularization (features/). Avoid cross-feature coupling.
- Strict type safety with shared `types/models/*` mapped to backend schemas.
- Centralized API client with JWT attach + automatic refresh.
- Prefer React Query or SWR for fetching, caching, and revalidation.
- Keep page components thin; push data logic into services/hooks.

---

## Communication, Auth, and Authorization

- Token handling:
  - Access token: stored in memory (and optionally LocalStorage as fallback).
  - Refresh token: retrieved via `/api/auth/refresh-token` on 401; store only if backend mandates client-side storage.
- Axios interceptors:
  - Request: attach `Authorization: Bearer <accessToken>`.
  - Response: if 401 and refresh token exists, attempt refresh then retry.
- Role enforcement:
  - Admin: full access.
  - Salesperson: restricted to own branch for sales/stock.
  - Mechanic: restricted to assigned service jobs.
- Branch scoping:
  - Respect backend rules: non-admins limited to their branch.
  - Use `useBranchContext` to provide current branch when filtering queries.
- Standard ApiResponse:
  - Success: `{ success, message, data, pagination?, meta }`
  - Error: `{ success: false, message, errors?, meta }`

---

## Endpoint Contracts (Requests & Responses)

All responses follow `ApiResponse`. Samples are abbreviated for clarity but accurate per backend tests/docs.

### Auth
- POST `/api/auth/register`
  - Request: `{ name, email, password, role?, branch? }`
  - Response: `data: { user: { _id, name, email, role, branch? } }`
- POST `/api/auth/login`
  - Request: `{ email, password }`
  - Response: `data: { accessToken, refreshToken, user: { _id, name, email, role, branch? } }`
- GET `/api/auth/me`
  - Response: `data: { _id, name, email, role, branch? }`
- POST `/api/auth/refresh-token`
  - Request: `{ refreshToken }`
  - Response: `data: { accessToken }`
- POST `/api/auth/logout`
  - Headers: `Authorization`
  - Response: `message: 'Logged out'`
- POST `/api/auth/forgot-password`
  - Request: `{ email }`
- POST `/api/auth/reset-password`
  - Request: `{ token, newPassword }`

### Branches
- GET `/api/branches`
  - Query: `active?, city?, search?, page?, limit?`
  - Response: `data: Branch[], pagination`
- GET `/api/branches/:id`
  - Response: `data: Branch`
- POST `/api/branches` (admin)
  - Request: `{ name, code, address:{street,city,province,postalCode?}, contact:{phone,email?}, manager?, settings? }`
- PUT `/api/branches/:id` (admin)
  - Request: partial updates
- DELETE `/api/branches/:id` (admin)
  - Response: `data: { isActive: false }`
- GET `/api/branches/:id/stats`
  - Response: `data: { staff:{ total, active, inactive }, inventory:{...}, sales:{...} }`

### Categories
- GET `/api/categories`
  - Query: `includeChildren?, active?`
- GET `/api/categories/:id`
  - Response includes `fullPath`, `children`, `productCount`
- GET `/api/categories/:id/children`
- POST `/api/categories` (admin)
  - Request: `{ name, description?, parent?, color?, sortOrder? }`
- PUT `/api/categories/:id` (admin)
- DELETE `/api/categories/:id` (admin)
  - Business rules: cannot delete with products or children

### Products
- GET `/api/products`
  - Query: `category?, brand?, active?, discontinued?, minPrice?, maxPrice?, page?, limit?, sortBy?, sortOrder?`
- GET `/api/products/search`
  - Query: `q, limit?`
- GET `/api/products/:id`
- POST `/api/products` (admin)
  - Request: `{ name, category, brand?, model?, costPrice, sellingPrice, barcode?, images?, specifications?, tags? }`
  - Response includes `sku`, `primaryImage`, `profitMargin`
- PUT `/api/products/:id` (admin)
- DELETE `/api/products/:id` (admin) — soft delete
- POST `/api/products/:id/images` (admin)
  - Request: `{ url, isPrimary? }`
- DELETE `/api/products/:id/images/:imageId` (admin)

### Stock & Transfers
- GET `/api/stock`
  - Query: `branch?, product?, lowStock?, outOfStock?, page?, limit?`
- GET `/api/stock/branch/:branchId`
- GET `/api/stock/product/:productId`
  - Response: cross-branch summary `{ totalQuantity, totalReserved, totalAvailable, branches:[{branch, quantity, sellingPrice}] }`
- GET `/api/stock/low-stock` — items with `quantity <= reorderPoint`
- POST `/api/stock/restock` (admin/sales)
  - Request: `{ product, branch, quantity, costPrice, sellingPrice, reorderPoint?, reorderQuantity?, supplier?, location? }`
- POST `/api/stock/adjust` (admin)
  - Request: `{ product, branch, adjustment, reason }`
- POST `/api/stock/transfers` (admin/branch manager)
  - Request: `{ product, fromBranch, toBranch, quantity, notes? }`
- PUT `/api/stock/transfers/:id` (admin/branch manager)
  - Request: `{ status }` — `pending → in-transit → completed`; `cancelled` allowed
- GET `/api/stock/transfers`
  - Query: `branch?, status?, page?, limit?`
- GET `/api/stock/transfers/:id`

### Suppliers
- GET `/api/suppliers`
  - Query: `active?, search?, page?, limit?`
- GET `/api/suppliers/:id`
- POST `/api/suppliers` (admin)
  - Request: `{ name, code?, contact?, address?, paymentTerms?, creditLimit?, notes? }`
- PUT `/api/suppliers/:id` (admin)
- DELETE `/api/suppliers/:id` (admin) — deactivate

### Sales Orders (MVP Critical)
- GET `/api/sales`
  - Query: `branch?, status?, paymentStatus?, startDate?, endDate?, page?, limit?`
- GET `/api/sales/:id`
- GET `/api/sales/branch/:branchId`
- POST `/api/sales` (admin/sales)
  - Request: `{ branch, customer:{name,phone,email?,address?}, items:[{product, quantity, discount?}], taxRate?, discount?, paymentMethod, amountPaid?, notes? }`
  - Behavior: reserves stock, uses branch-specific `Stock.sellingPrice`, auto-calculates totals & payment status
- PUT `/api/sales/:id/status` (admin/sales own branch)
  - Request: `{ status }` — transitions: `pending→processing→completed`; `pending/processing→cancelled`
  - On `completed`: deduct stock; create `Transaction` if `payment.status='paid'`
- PUT `/api/sales/:id/payment` (admin/sales)
  - Request: `{ amountPaid?, paymentMethod? }` — recalculates status & change
- DELETE `/api/sales/:id` (admin) — cancel, release reserved stock
- GET `/api/sales/:id/invoice`
- GET `/api/sales/stats`

### Service Orders (Secondary Revenue)
- GET `/api/services`
  - Query: `branch?, status?, priority?, assignedTo?, paymentStatus?, startDate?, endDate?, page?, limit?`
- GET `/api/services/my-jobs` (mechanic)
- GET `/api/services/:id`
- GET `/api/services/:id/invoice`
- POST `/api/services` (admin/sales)
  - Request: `{ branch, customer:{name,phone,email?,address?}, vehicle?, description, diagnosis?, assignedTo?, priority?, laborCost?, otherCharges?, scheduledAt?, notes? }`
  - Behavior: sets `status='scheduled'` if `assignedTo` provided; totals auto-calculated
- PUT `/api/services/:id/assign` (admin/manager)
  - Request: `{ mechanicId }`
- PUT `/api/services/:id/status` (admin/mechanic assigned)
  - Request: `{ status }` — validated transitions; `completed` deducts `partsUsed` from stock and creates `Transaction` if paid
- PUT `/api/services/:id/parts` (admin/mechanic assigned)
  - Request: `{ partsUsed:[{ product, quantity, unitPrice, sku?, name? }] }`
- PUT `/api/services/:id/payment` (admin/sales)
  - Request: `{ amountPaid?, method? }`
- DELETE `/api/services/:id` (admin) — cancel

---

## Data Flow & Page Responsibilities

- Auth pages: login; handle token acquisition; set user context.
- Protected layout: checks `useAuth`; redirects if unauthenticated.
- Branch pages: list/detail/create/update; enforce admin-only mutations.
- Category/Product pages: browsing, searching; admin-only mutations; product image management.
- Stock pages: restock, adjust; branch stock views; transfer workflows with status updates.
- Supplier pages: list/detail/create/update/deactivate (admin-only).
- Sales pages: order creation, status updates, payment updates, invoice view; branch-restricted for salespersons.
- Service pages: order creation, assignment, parts updates, status updates, payment updates, invoice view; mechanics limited to `my-jobs` and assigned orders.

---

## Best Practices & Scalability

- Types-first: Mirror backend model fields precisely to avoid drift.
- Services are thin: One function per endpoint; no component side-effects.
- Error normalization: Convert backend validation errors to field-level messages.
- Retry & refresh: Implement robust token refresh and exponential backoff for transient errors.
- Caching: Use SWR/React Query for GETs with sensible stale times; invalidate on POST/PUT/DELETE.
- Role/branch guards: Centralized middleware for page routes; avoid duplicating checks.
- Logging: Minimal client logs; no sensitive data.
- Configuration: `.env` for `NEXT_PUBLIC_API_URL`, etc.; never hardcode URLs.

---

## Near-Term Features (POST-MVP Alignment)

- Financial Management (Phase 7): Transaction listing endpoints (when available), filters by type (`sale`, `service`, `expense`, `transfer`), date ranges, branch.
- Reporting (Phase 8): Sales, inventory, and branch performance dashboards consuming stats endpoints.
- Notifications (Phase 9): Socket.io client setup; global toasts/feeds for stock alerts and order updates.
- Dashboard (Phase 10): Aggregated widgets pulling from branches, sales, services, and stock summaries.

---

## Implementation Checklist

- [ ] Configure `lib/apiClient.ts` with interceptors and refresh handling
- [ ] Implement `features/auth` flow (login, me, refresh, logout)
- [ ] Build `types/models/*` for all MVP entities
- [ ] Implement services per feature mapping every endpoint
- [ ] Add route guards in `middleware/*` and wrap protected segments
- [ ] Create pages for Branches, Categories, Products, Stock, Suppliers, Sales, Services
- [ ] Integrate SWR/React Query for data fetching and cache invalidation
- [ ] Validate forms based on documented payload contracts
- [ ] Add invoice views for Sales and Services
- [ ] Prepare stubs for Phase 7–10 features to minimize refactors

---

## Reference
- Backend docs: Phase-1–6 done files in `backend/docs/`
- Tests for payloads/responses: `backend/tests/*.test.js`
- Standard response utility: `backend/src/utils/apiResponse.js`
