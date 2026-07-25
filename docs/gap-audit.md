# talyer-e-inventory — gap audit

Six independent review lenses (data integrity, security/authz, test coverage, frontend contract, feature completeness, ops/config). Every finding was adversarially re-verified against source by a second agent before being kept. 118 gaps confirmed; 11 claims refuted and dropped.

| Severity | Count |
|---|---|
| critical | 2 |
| high | 18 |
| medium | 51 |
| low | 47 |

| Lens | Confirmed |
|---|---|
| data-integrity | 19 |
| feature-completeness | 19 |
| frontend | 27 |
| ops-config | 22 |
| security-authz | 16 |
| test-gaps | 15 |

---

## CRITICAL (2)

### C1. Public POST /api/auth/register accepts attacker-supplied `role`, allowing self-registration as admin

- **Location:** `backend/src/routes/authRoutes.js:95`
- **Lens:** security-authz
- **Verified because:** Verified end to end. authRoutes.js:95 mounts `router.post('/register', registerValidation, register)` with no `protect`/`authorize`. registerValidation (authRoutes.js:31-33) whitelists `role` as one of ['admin','salesperson','mechanic','customer'] and terminates with the `validate` middleware (line 37), so validation runs and 'admin' passes. authController.js:39 destructures `role` from req.body and line 54-59 does `User.create({ name, email, password, role: role || 'customer' })` with no downgrade. models/User.js:30-34 enum includes 'admin'; models/User.js:38-42 makes `branch` required only for salesperson/mechanic, so an admin document saves with no branch. Lines 63-81 then mint an accessToken and set the refresh cookie. middleware/auth.js:49-59 `authorize` gates purely on `req.user.role`, so the forged admin passes every admin-only route.
- **Failure scenario:** `curl -X POST https://<host>/api/auth/register -d '{"name":"x","email":"x@x.io","password":"123456","role":"admin"}'` returns HTTP 201 with `data.accessToken`. That bearer token immediately passes `authorize(USER_ROLES.ADMIN)` on POST/PUT/DELETE /api/users (userRoutes.js:112-113 applies admin to the whole router), POST/PUT/DELETE /api/branches (branchRoutes.js:111-133), POST/PUT/DELETE /api/products (productRoutes.js:247-276), POST /api/stock/adjust (stockRoutes.js:213-220) and DELETE /api/sales/:id (salesRoutes.js:142-148). Full unauthenticated-to-admin compromise in one request.

### C2. POST /api/auth/forgot-password returns the plaintext reset token in the response body

- **Location:** `backend/src/controllers/authController.js:227`
- **Lens:** security-authz
- **Verified because:** authController.js:222-229 calls `user.getResetPasswordToken()` and returns `ApiResponse.success(res, 200, 'Password reset token generated', { resetToken })`. models/User.js:113-127 confirms the returned value is the raw 32-byte hex and only its sha256 is persisted, and authController.js:247-256 hashes the submitted `resetToken` with the same sha256 to look the user up — so the value handed to the caller is exactly the value /auth/reset-password accepts. authRoutes.js:99-100 mounts both routes publicly with no auth. The in-code comment at line 225-226 acknowledges this ('NOT RECOMMENDED FOR PRODUCTION') but the code ships as-is on this branch.
- **Failure scenario:** Attacker with no credentials: (1) POST /api/auth/forgot-password {"email":"admin@company.com"} -> 200 with `data.resetToken`; (2) POST /api/auth/reset-password {"resetToken":"<that value>","newPassword":"attacker1"}; (3) POST /api/auth/login as that admin. The 10-minute expiry and sha256-at-rest give zero protection because the attacker holds the pre-image. Any account whose email is known is takeable in three requests.

## HIGH (18)

### H1. All stock arithmetic is read-modify-write with $set, so concurrent stock operations lose updates

- **Location:** `backend/src/models/Stock.js:107`
- **Lens:** data-integrity
- **Verified because:** Read Stock.js:103-125: reserveStock (`this.reservedQuantity += quantity; save()`), releaseReservedStock:113 and deductStock:122-123 are all load-mutate-save. stockController.js:251/377/429 and salesController.js:217 follow the same pattern. Grep over backend/src for $inc|findOneAndUpdate|startSession|optimisticConcurrency returns zero matches, and Stock has no version guard. I confirmed the emitted delta with the repo's own mongoose (8.21.0): modifying a Number path yields getChanges() = {"$set":{"reservedQuantity":8}} — an absolute write, never $inc. Downgraded from critical to high: it needs a genuine overlap of two requests inside the findOne→save window, not a single-request bug.
- **Failure scenario:** Two POST /api/sales for the same (product, branch) arriving within the same few ms both read reservedQuantity=0 at salesController.js:188 and both persist $set:{reservedQuantity:5}; 10 units are sold but only 5 are reserved, so the second order fails at completion with 'Cannot deduct more than available quantity'. Same shape on POST /api/stock/restock: two concurrent +50 deliveries against quantity 100 both write $set:{quantity:150}, 50 units disappear, and two StockMovement rows (stockController.js:280) each assert +50 landed, so replaying the ledger no longer reproduces the stock record.

### H2. Multi-document inventory/money mutations run without a MongoDB session, leaving stock deducted and the order un-advanced

- **Location:** `backend/src/controllers/salesController.js:305`
- **Lens:** data-integrity
- **Verified because:** Grep for startSession|withTransaction over backend/src returns zero matches (confirmed). updateSalesOrderStatus deducts stock and writes a movement per item at 307-325, creates a Transaction at 334, and only saves the order at 373. serviceController.js:357-403 and stockController.js:563-635 have the identical shape. The precondition (deductStock throwing mid-loop) is reachable because reservations are routinely under-recorded by the service-parts and adjustment paths (findings 3, 4, 9).
- **Failure scenario:** A 3-item order in 'processing' where item 2's stock was drawn down by a completed service order: item 1 is deducted and its 'sale' movement written, item 2 throws 'Cannot deduct more than available quantity' (Stock.js:120), asyncHandler forwards it, and order.save() at line 373 never runs. The order stays 'processing' with item 1 already out of inventory. The operator restocks and retries PUT /api/sales/:id/status — validTransitions['processing'] still allows 'completed', so item 1 is deducted a SECOND time and a second 'sale' StockMovement is written. Stock is permanently short by item 1's quantity and the ledger claims it was sold twice.

### H3. Service orders never reserve stock — parts are only availability-checked, so the same units can be committed to unlimited jobs

- **Location:** `backend/src/controllers/serviceController.js:474`
- **Lens:** data-integrity
- **Verified because:** updatePartsUsed calls stock.hasSufficientStock(part.quantity) at 474 and then assigns order.partsUsed = preparedParts at 492 without touching the Stock document. Grep for reserveStock across backend/src returns exactly two call sites — salesController.js:217 and stockController.js:495 — never serviceController. Stock is first touched at completion (serviceController.js:367).
- **Failure scenario:** With 10 units on hand and reservedQuantity 0, five mechanics each PUT /api/services/:id/parts with 10 units of the same part across five in-progress jobs; all five pass line 474 because reservedQuantity never moves, and the same 10 units also remain sellable via POST /api/sales the entire time. The first job to complete deducts 10 (quantity → 0); the second completion throws at Stock.js:120 mid-loop, so per finding #2 order.save() at line 403 never runs and that job is stuck 'in-progress' with any earlier parts already deducted; the remaining three jobs cannot be completed at all until someone edits their partsUsed down.

### H4. deductStock unconditionally decrements reservedQuantity, destroying reservations that belong to other orders

- **Location:** `backend/src/models/Stock.js:123`
- **Lens:** data-integrity
- **Verified because:** Stock.js:118-125: deductStock does `this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity)` with no notion of which order owns the reservation. serviceController.js:367 calls it for a service order that (finding #3) reserved nothing at all, so the decrement can only come out of somebody else's reservation. This is the normal happy path, not a race.
- **Failure scenario:** Stock has quantity 20, reservedQuantity 15 (a pending sales order for 10 plus a pending transfer for 5). Completing a service order that used 8 of the same part drops quantity to 12 and silently cuts reservedQuantity to 7, so 8 units of other orders' claims become 'available' again and can be sold by a new POST /api/sales. Cancelling that transfer afterwards calls releaseReservedStock(5) (stockController.js:631) and drops reservedQuantity to 2, releasing units that were never re-reserved — the sales order for 10 now has effectively no reservation and will fail at completion.

### H5. createSalesOrder reserves stock inside the item loop and never releases it when a later item fails

- **Location:** `backend/src/controllers/salesController.js:217`
- **Lens:** data-integrity
- **Verified because:** await stock.reserveStock(item.quantity) is the last statement of the per-item loop (217). Every guard inside the same loop returns immediately — product missing (180), inactive (184), no stock at branch (191), insufficient stock (198) — and SalesOrder.create at 226 is outside any rollback. There is no try/catch in the function and no compensating release. Confirmed that no other endpoint can decrement reservedQuantity without an order document: releaseReservedStock is only reachable from salesController 360/471 (needs an order) and stockController 631 (needs a transfer); adjustStock/adjustById touch quantity only.
- **Failure scenario:** A 3-item checkout where item 3 is out of stock returns 400 with no order created, but items 1 and 2 stay reserved forever with no document referencing them. A cashier retrying the same cart three times permanently adds 3× the quantity of items 1 and 2 to reservedQuantity; availableQuantity (Stock.js:77) walks down to 0 and the branch can no longer sell inventory that is physically on the shelf. There is no API call that can undo it — only a direct DB edit.

### H6. Numeric body fields are validated with isInt but never coerced, so a JSON string quantity corrupts stock via string concatenation

- **Location:** `backend/src/routes/stockRoutes.js:14`
- **Lens:** data-integrity
- **Verified because:** Confirmed: stockRoutes.js:14, 60, 68 and salesRoutes.js:30 use isInt()/isInt({min:1}) with no .toInt() sanitizer, and express-validator accepts the string "5". The raw value flows into stockController.js:251/377/429 and Stock.js:107. I verified the exact behaviour against the repo's mongoose 8.21.0: assigning `100 + "5"` to a Number path stores 1005 as a number with no error, and getChanges() emits $set:{quantity:1005}. One sub-claim is WRONG: the NaN case (10 + "-3") does not 500 — mongoose rejects with 'Cast to Number failed', which errorHandler.js:25-30 maps to 400.
- **Failure scenario:** POST /api/stock/restock with {"quantity":"5"} against a stock of 100 stores 1005: a 5-unit delivery silently becomes 905 phantom units, and the StockMovement written at stockController.js:280 records +905 as fact, so the ledger corroborates the corruption. On the sales path, {"items":[{"quantity":"3"}]} with reservedQuantity 5 makes reservedQuantity 53 (Stock.js:107) while the SalesOrder stores the cast value 3 — completing or cancelling the order releases only 3, stranding 50 units of reservation that no endpoint can clear. Any client that posts form values without Number() — a future mobile app, a script, an integration — trips this accidentally.

### H7. Transaction model is write-only — no route, controller, or UI can read it

- **Location:** `backend/src/models/Transaction.js:73`
- **Lens:** feature-completeness
- **Verified because:** Verified. Grep across backend/src shows Transaction is referenced only in models/Transaction.js and two controllers: salesController.js:4/330/334 and serviceController.js:4/381/385/546/550 — all countDocuments() or create(). backend/src/routes/ contains exactly 9 files (auth, branch, category, product, sales, service, stock, supplier, user) and server.js:79-87 mounts only those 9; no transaction router exists. Grep for 'transaction' in frontend/src returns only 4 UI copy strings (DeactivateModal.tsx:66, UpdateServicePaymentModal.tsx:273, UpdateStatusModal.tsx:178, UpdatePaymentModal.tsx:251) — no service, hook, type, or page. Downgraded from critical: no data is lost or corrupted and there is no security exposure; the rows persist and are recoverable by direct DB query. It is an unreachable feature, not a break.
- **Failure scenario:** An admin completes sales order SO-2026-000123 (total ₱15,000, payment.status 'paid'). salesController.js:334 writes a Transaction row. There is no HTTP path to read it back: GET /api/transactions hits the 404 handler at server.js:119. After a month of trading, the branch owner asking 'what did Branch A take in cash this week?' has no endpoint to call — README.md:610 promises 'View transactions: Admin ✅, Salesperson ✅ own branch', and the only recovery is mongosh against the transactions collection.

### H8. Sales order completed while unpaid never creates a Transaction and can never be settled afterward

- **Location:** `backend/src/controllers/salesController.js:328`
- **Lens:** feature-completeness
- **Verified because:** Verified end to end, and it is worse than claimed because the UI actively invites the broken action. salesController.js:328 wraps Transaction.create in `if (order.payment.status === 'paid')`, reachable only inside the `status === 'completed'` branch (line 305). salesController.js:420-422 then rejects any later payment update with 400 for completed orders. serviceController.js:545 has the catch-up path sales lacks (`if (order.status === 'completed' && order.payment.status === 'paid' && wasUnpaid)`). Frontend confirms the flow is reachable: sales/[id]/page.tsx:134-137 sets canUpdatePayment = `order.status !== 'cancelled' && order.payment.status !== 'refunded'` (completed orders pass), UpdatePaymentModal.tsx:100 locks only on cancelled/refunded, and UpdatePaymentModal.tsx:248-252 renders 'Since this order is completed, marking it as paid will create a transaction record' — copy describing behaviour the backend forbids. Downgraded from critical: recoverable via direct DB write, and it requires an authenticated admin/salesperson, not an attacker.
- **Failure scenario:** Salesperson creates SO-2026-000045 for ₱8,000, customer pays ₱3,000 deposit. Salesperson moves status pending→processing→completed to release the goods: stock is deducted (salesController.js:307-325), payment.status is 'partial', so no Transaction is written. Customer returns and pays the ₱5,000 balance. The salesperson opens /sales/<id>, the 'Update' button next to Payment Status renders (canUpdatePayment true), the modal shows the blue note promising a transaction record, they submit — PUT /api/sales/:id/payment returns 400 'Cannot update payment for completed/cancelled order'. The full ₱8,000 is now permanently missing from the transactions ledger and payment.amountPaid is stuck at 3000, with no API path to correct either.

### H9. Salesperson cannot load the mechanic list the backend lets them use — assign-mechanic flow is broken for non-admins

- **Location:** `frontend/src/lib/services/serviceService.ts:282`
- **Lens:** feature-completeness
- **Verified because:** Verified. serviceService.ts:282 getMechanics() calls apiClient.get('/users'). userRoutes.js:112-113 applies `router.use(protect); router.use(authorize('admin'))` to the whole router, so any non-admin gets 403 from middleware/auth.js:52-55. serviceRoutes.js:88 grants POST /services to salesperson and serviceRoutes.js:101 grants PUT /:id/assign to admin+salesperson. useMechanics() is called from services/new/page.tsx:101, services/page.tsx:61, and components/services/AssignMechanicModal.tsx:32 — all salesperson-reachable. Checked the refutation path: apiClient.ts:86-97 only force-logs-out on 403 when the message contains 'deactivated'; auth.js:54 emits 'User role salesperson is not authorized to access this route', so the request fails silently into an empty array rather than logging the user out.
- **Failure scenario:** A salesperson opens /services/new to book a job. GET /api/users returns 403; useMechanics resolves to an error and services/new/page.tsx:102 falls back to `mechanics = []`, so the 'Assign mechanic' dropdown is empty. Same on /services, where the mechanic filter dropdown at page.tsx:61 renders with no options, and in AssignMechanicModal. The salesperson can create the service order but cannot assign anyone to it, even though PUT /api/services/:id/assign would accept their token.

### H10. SalesStats type does not match GET /sales/stats — all four sales stat cards render 0

- **Location:** `frontend/src/types/sales.ts:257`
- **Lens:** frontend
- **Verified because:** Confirmed. salesController.js:585-601 builds `{ orders:{total,completed,cancelled,pending,processing}, revenue:{total,averageOrderValue}, payment:{paidOrders,pendingPayment} }` and returns it via ApiResponse.success. types/sales.ts:257-264 declares flat `totalOrders/pendingOrders/todayRevenue/monthRevenue`. salesService.getStats (salesService.ts:70-78) passes data.data through untransformed, and sales/page.tsx:184-187 renders `<SalesStatsCards stats={statsData} />`, whose reads at SalesStatsCards.tsx:76/84/92/100 are `stats?.totalOrders` etc. There is no remapping anywhere. The backend also computes no today/month revenue at all — only lifetime revenue of completed orders.
- **Failure scenario:** An admin opens /sales on a database with 500 orders and ₱2M in completed revenue. GET /api/sales/stats returns the nested object; every flat property SalesStatsCards reads is undefined, the `?? 0` fallbacks fire, and the four cards permanently read 'Total Orders 0', 'Pending Orders 0', "Today's Revenue ₱0.00", 'Month Revenue ₱0.00' — with no error state, because the query itself succeeded.

### H11. Mechanic and manager dropdowns call the admin-only, page-capped GET /users

- **Location:** `frontend/src/lib/services/serviceService.ts:282`
- **Lens:** frontend
- **Verified because:** Confirmed on both legs. serviceService.getMechanics (:281-292) calls apiClient.get('/users') with no params and filters role==='mechanic' client-side; userService.getManagers (:62) and getAll (:48) do the same. userRoutes.js:112-113 applies `router.use(protect); router.use(authorize('admin'))` to the entire router, and userController.js:15 defaults limit=20 with ApiResponse.paginate. The call is unconditional for every visitor of /services: services/page.tsx:61 calls useMechanics() at the top level with no role gate anywhere on that page, and AssignMechanicModal.tsx:32 calls it again.
- **Failure scenario:** A salesperson — explicitly authorized to assign by serviceRoutes.js:100-102 authorize('admin','salesperson') — opens /services. useMechanics fires GET /api/users, gets 403 from userRoutes.js:113, so `mechanics` is undefined; AssignMechanicModal.tsx:36 filters an empty array and the picker is empty, making mechanic assignment impossible for that role. Even for an admin, a shop with 25 staff accounts only ever receives the newest 20 by createdAt, so mechanics created earliest silently vanish from both the assign picker and the branch-manager dropdown (userService.getManagers).

### H12. Production refresh cookie uses sameSite:'strict', which cross-origin deployments never send

- **Location:** `backend/src/controllers/authController.js:12`
- **Lens:** ops-config
- **Verified because:** Verified, and the gap is broader than claimed. authController.js:12 sets `sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'`. The refresh flow depends entirely on that cookie: frontend/src/lib/apiClient.ts:128-132 POSTs an empty body `{}` with withCredentials, and authController.js:145 reads `req.cookies?.refreshToken || req.body?.refreshToken` with nothing on the frontend populating the body fallback. Correction to the claim: 'lax' is also wrong for this call — Lax only attaches on top-level navigations, not XHR, so a genuinely cross-site refresh fails under both branches; only `sameSite:'none'` with `secure:true` works. Development survives because localhost:3000 -> localhost:5000 is same-site (SameSite ignores port). Keeping high: it breaks authentication for all users, appears only in production, and the CORS block at server.js:47-65 plus constants.js:101-117 exists specifically to support the cross-origin shape this setting defeats.
- **Failure scenario:** Deploy the frontend to Vercel and the API to Render with NODE_ENV=production. Login works (the Set-Cookie is accepted on the response). When the access token expires per JWT_EXPIRE, apiClient.ts:109 catches the 401 and POSTs to `${NEXT_PUBLIC_API_URL}/auth/refresh-token`. The browser omits the refreshToken cookie because the request is cross-site, authController.js:147-148 returns `401 'No refresh token provided'`, apiClient.ts:145-152 clears tokens and does `window.location.href = '/login'`. Every user is silently ejected to the login screen on token expiry, losing unsaved work, and the pattern is invisible in staging if staging shares a domain.

### H13. next.config.ts has no production remotePatterns, so next/image breaks outside localhost

- **Location:** `frontend/next.config.ts:26`
- **Lens:** ops-config
- **Verified because:** Verified. next.config.ts:11-25 allowlists only http://localhost:5000/uploads/** and http://127.0.0.1:5000/uploads/**; lines 26-31 are a commented-out placeholder for the production host. Line 10 is `unoptimized: isDev` where isDev is `process.env.NODE_ENV === 'development'` (line 3), so a production `next build` leaves optimization ON and remotePatterns enforced. ProductCard.tsx:70-76 renders `<Image src={resolveImageUrl(product.primaryImage ?? product.images[0].url)} fill />`, and resolveImageUrl (lines 22-33) returns absolute http/https URLs untouched — which is exactly what imageUpload.js:90 persists from BACKEND_URL. ProductImageGallery.tsx:20 and ProductImageEditor.tsx:32 use the same pattern. Keeping high: total, production-only breakage of a core UI surface.
- **Failure scenario:** With BACKEND_URL=https://api.example.com in production, Product.primaryImage is stored as `https://api.example.com/uploads/products/<uuid>.jpeg`. ProductCard passes it straight to next/image, which requests `/_next/image?url=https%3A%2F%2Fapi.example.com%2F...&w=…`. The hostname is not in remotePatterns, so Next returns `400 "url" parameter is not allowed` for every single image. The entire product catalogue, the product detail gallery, and the image editor render with broken images in production only — the exact same build works perfectly in `next dev` because unoptimized:true bypasses the check there.

### H14. POST /api/stock/restock lets a salesperson write stock, costPrice and sellingPrice for any branch

- **Location:** `backend/src/controllers/stockController.js:217`
- **Lens:** security-authz
- **Verified because:** stockRoutes.js:193-200 mounts the route with `protect, authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON), restockValidation, handleValidationErrors` — no `checkBranchAccess`, and checkBranchAccess could not help anyway since it reads `req.params.branchId` (branchAccess.js:10) while the branch here is in the body. stockController.js:218-228 destructures `branch` from req.body; the only check is existence (`Branch.findById(branch)`, line 231-242). Lines 251-259 then overwrite `stock.costPrice`, `stock.sellingPrice`, `reorderPoint`, `supplier`, `location` and add to `quantity`. I grepped the whole function: `req.user` appears only as `req.user._id` for `lastRestockedBy`/`performedBy` (lines 259, 275, 284) — `req.user.branch` is never consulted. restockValidation (stockRoutes.js:15-16) accepts any `isFloat({min:0})` price, so 0 and 1 are valid.
- **Failure scenario:** A salesperson at branch A sends POST /api/stock/restock {"product":"<pid>","branch":"<branch B id>","quantity":1,"costPrice":0,"sellingPrice":1} -> 201, and branch B's sellingPrice for that product is now 1. salesController.js:211 prices sales-order line items from `stock.sellingPrice` of the order's branch, so the next sale at branch B rings up at 1 peso. Note the same actor can do this to their own branch too (createSalesOrder clamps branch to req.user.branch at salesController.js:170-172, but nothing clamps the price write), giving a self-contained fraud path: set sellingPrice to 1, sell, restore the price. POST /api/stock/adjust is correctly admin-only (stockRoutes.js:216) — restock, which is strictly more powerful because it also rewrites prices, is not.

### H15. PUT /api/stock/:id/restock loads Stock by id alone — cross-branch write IDOR for salespersons

- **Location:** `backend/src/controllers/stockController.js:368`
- **Lens:** security-authz
- **Verified because:** stockRoutes.js:203-210 grants ADMIN and SALESPERSON with `restockByIdValidation, handleValidationErrors` and no branch middleware. stockController.js:364-386: `const stock = await Stock.findById(id)` — 404 only if missing — then `stock.quantity += quantity`, `stock.lastRestockedBy = req.user._id`, `if (supplierId) stock.supplier = supplierId`, `await stock.save()`. The loaded document's own `branch` field is never compared to `req.user.branch`, and `req.user.branch` does not appear anywhere in the function. Sibling PUT /:id/adjust is admin-only (stockRoutes.js:226), showing the branch-blind-by-id pattern was gated elsewhere but not here.
- **Failure scenario:** A salesperson at branch A calls GET /api/stock (also unscoped, see the getAllStock finding) to harvest every branch's Stock `_id`, then PUT /api/stock/<branch B stock id>/restock {"quantity":9999,"supplierId":"<attacker-chosen supplier>"} -> 200. Branch B's on-hand quantity is inflated by 9999 and its supplier is silently reassigned, and stockController.js:389-394 writes an append-only StockMovement attributing it to the branch-A user — the ledger records the corruption but nothing prevented it. Branch B's reorder logic and stock valuation are now wrong with no way to roll back except manual adjustment.

### H16. GET /api/stock/product/:productId exposes per-branch cost prices to every authenticated user, including self-registered customers

- **Location:** `backend/src/routes/stockRoutes.js:184`
- **Lens:** security-authz
- **Verified because:** stockRoutes.js:184-190: `protect, productIdValidation, handleValidationErrors, stockController.getProductStock` — no `authorize`, no branch middleware. stockController.js:147-172 runs `Stock.find({ product: productId })` across all branches and maps each row into `branches[]` containing `costPrice`, `sellingPrice`, `quantity`, `reservedQuantity`, `availableQuantity`, `reorderPoint` and `location`, plus the populated branch name/code/address. The sibling listing routes GET /api/stock and GET /api/stock/low-stock DO carry `authorize(ADMIN, SALESPERSON)` (stockRoutes.js:82-95), so the omission here is inconsistent, not intentional. Reachability by an outsider is real: POST /api/auth/register-customer is public (authRoutes.js:96) and authController.js:299-322 returns a working accessToken for a role='customer' account with no approval step.
- **Failure scenario:** An outsider self-registers via POST /api/auth/register-customer, gets an accessToken, calls GET /api/products (protect-only, productRoutes.js:241-246) to enumerate product _ids, then loops GET /api/stock/product/<id> for each. Response bodies yield the company's wholesale cost price, retail price (hence gross margin) and exact on-hand quantity at every branch — the entire pricing book and inventory position, exfiltrated by an anonymous internet user with no rate limiting to slow the loop.

### H17. branch.test.js issues zero real HTTP requests; GET /api/branches/:id/stats param mismatch is invisible

- **Location:** `backend/tests/branch.test.js:69`
- **Lens:** test-gaps
- **Verified because:** Read the whole file. Line 12 mounts only `app.use('/api/branches', branchRoutes)`. The single `request(app)` call is at 59-61 against `/api/auth/login`, which is not mounted; it also passes `admin.email` where `createTestAdmin()` (testHelpers.js:42-48) returns `{user, token, refreshToken}` — so `admin.email` is `undefined`. Its response is never asserted and the test ends `expect(true).toBe(true)` at line 69. Every other block calls Branch.create / findByIdAndUpdate / User.countDocuments directly (167-320, 323-369, 374-409, 415-458, 531-550). None of the six controller functions in branchController.js (getBranches:13, getBranch:86, createBranch:105, updateBranch:154, deleteBranch:199, getBranchStats:240) is invoked through Express. The masked bug is real: branchRoutes.js:102-108 registers `/:id/stats` with `checkBranchAccess`, while branchAccess.js:10 destructures `const { branchId } = req.params` — `branchId` is undefined on that route. Severity lowered from critical: the resulting fault is a hard 403 (denial of own data), not privilege escalation or data loss, and the admin path still works.
- **Failure scenario:** A salesperson assigned to branch X calls `GET /api/branches/<X>/stats` with a valid token. `protect` sets req.user, `branchIdValidation` passes, then branchAccess.js:23 evaluates `user.branch.toString() !== undefined` → always true → 403 'Access denied to this branch'. Every non-admin role is locked out of every branch's stats page, forever, and `npm test` stays green because no request ever reaches the route.

### H18. getServiceInvoice compares a populated Mongoose document to an ObjectId string; the non-admin branch is untested

- **Location:** `backend/src/controllers/serviceController.js:636`
- **Lens:** test-gaps
- **Verified because:** Confirmed by reading the controller and the route. serviceController.js:621-625 populates branch: `.populate('branch', 'name code address phone email')`, so `order.branch` is a Mongoose document. Line 636 then does `order.branch.toString() !== req.user.branch.toString()`. Mongoose overrides Document.prototype.toString to the inspect representation (`{ _id: new ObjectId("..."), name: 'Test Branch', ... }`), not the 24-char hex, so the comparison can never be equal. salesController.js:509 does the same check correctly with `order.branch._id.toString()`. serviceRoutes.js:75-79 exposes the route to `authorize('admin','salesperson','mechanic')`, and auth.js:16 (`User.findById(...).select('-password')`) leaves req.user.branch as a raw ObjectId. The only test, service.test.js:872-891, uses `Bearer ${admin.token}` and short-circuits at `req.user.role !== 'admin'`. Held at high: a live, always-on functional break on a customer-facing invoice route.
- **Failure scenario:** A salesperson assigned to branch X opens the invoice for a service order created in branch X: `GET /api/services/<jobId>/invoice`. Line 636 compares `"{ _id: new ObjectId('68f...'), name: 'Main Branch', code: 'BR-001', ... }"` against `"68f..."`, which is never equal, so the request returns 403 'Access denied to this branch'. Salespeople and mechanics can never print or view any service invoice. The mechanic check at line 632 is likewise never executed by any test.

## MEDIUM (51)

### M1. Order/transfer numbers generated from countDocuments in the controller collide under concurrency and take the reservation with them

- **Location:** `backend/src/controllers/salesController.js:221`
- **Lens:** data-integrity
- **Verified because:** Confirmed: salesController.js:221-223 builds SO-<year>-<count+1> from an unfiltered countDocuments with orderNumber unique:true (SalesOrder.js:5-10); same pattern at serviceController.js:213-214 and StockTransfer.js:71-78. Severity lowered from high, and one claimed detail is WRONG: the client does not get a 500 — errorHandler.js:17-22 maps err.code 11000 to a 400 'OrderNumber already exists'. The reservation-leak half of the claim is real and is the actual damage. The year-boundary remark is a non-issue (the prefix changes with the year, so no collision).
- **Failure scenario:** Two cashiers submitting POST /api/sales within the same few ms both read count=250 and both build SO-2026-000251. The loser's SalesOrder.create throws E11000 and the request ends as 400 'OrderNumber already exists' — but reserveStock (line 217) has already run for every item in that cart, so those units are reserved against an order that does not exist and, per finding #5, can never be released.

### M2. Stock transfer completion moves quantity between branches before the transfer status is persisted

- **Location:** `backend/src/controllers/stockController.js:635`
- **Lens:** data-integrity
- **Verified because:** Confirmed: transfer.status is set in memory at 558, the whole deduct/credit/two-movement sequence runs at 563-621, and transfer.save() is only reached at 635, while the transition gate at 549 reads the persisted status. The claimed trigger (transfer.save() failing) is weak — the document has no validation that would plausibly fail here — but a stronger, more reachable trigger exists that the original agent missed, so the finding stands at medium (route is authorize(ADMIN), stockRoutes.js:164-171).
- **Failure scenario:** An admin double-submits PUT /api/stock/transfers/:id {status:'completed'} (double-click, or a client retry on a slow response). Both requests load the transfer while it is still 'in-transit' in the database, both pass validTransitions at 549, and both run 563-621: the source branch is deducted twice, the destination credited twice, and four StockMovement rows are written for one physical transfer of, say, 20 units — the source ends 20 units short and the destination 20 units over, with the ledger internally consistent and therefore useless for detecting it.

### M3. Stock adjustments clamp quantity to 0 but never touch reservedQuantity

- **Location:** `backend/src/controllers/stockController.js:323`
- **Lens:** data-integrity
- **Verified because:** Confirmed: adjustStock:323 and adjustById:429 both do Math.max(0, stock.quantity ± n) and never read reservedQuantity; Stock.js:15-25 has independent min:0 on the two fields and no cross-field validator; the virtual at Stock.js:77 clamps the result to 0 so the deficit is invisible. Severity lowered from high: both routes are authorize(ADMIN) (stockRoutes.js:213-230), and one claimed consequence is WRONG — the order CAN be cancelled cleanly, because releaseReservedStock (Stock.js:113) clamps at 0 and resets reservedQuantity correctly.
- **Failure scenario:** Stock is quantity 12, reservedQuantity 10 for a pending sales order. An admin writes off 10 damaged units via PUT /api/stock/:id/adjust {quantity:-10}: quantity becomes 2 while reservedQuantity stays 10. Every stock screen shows availableQuantity 0 instead of the true -8, so the 8-unit shortfall is invisible, and the pending order can no longer be completed — deductStock(10) throws at Stock.js:119 and the order is stuck in 'processing' until someone cancels it or restocks.

### M4. A sales order completed while unpaid never produces a Transaction and its payment can never be corrected

- **Location:** `backend/src/controllers/salesController.js:328`
- **Lens:** data-integrity
- **Verified because:** Confirmed: the Transaction is created only inside `if (order.payment.status === 'paid')` at 328, nothing forces payment before the 'processing'→'completed' transition, and updateSalesOrderPayment hard-blocks completed/cancelled orders at 420-422. serviceController.js:545 has exactly the catch-up path that sales lacks. Severity lowered from high because grep shows Transaction is written at only 3 sites and read by no controller or route at all — there is no cash-flow report consuming it yet, so today the damage is a permanently incomplete ledger rather than a wrong number on a screen.
- **Failure scenario:** A customer takes delivery on a partial payment (amountPaid 3000 of total 5000 → payment.status 'partial'), the salesperson completes the order to release the goods, and the balance is paid the next day. The completion writes no Transaction (328 is skipped), and PUT /api/sales/:id/payment returns 400 'Cannot update payment for completed/cancelled order'. The order is stuck at 'completed'/'partial' with amountPaid 3000 forever and zero rows in Transaction — the goods left the building and nothing in the ledger records that any money was taken.

### M5. Toggling amountPaid on a completed service order creates a duplicate Transaction for the same job

- **Location:** `backend/src/controllers/serviceController.js:541`
- **Lens:** data-integrity
- **Verified because:** Confirmed: wasUnpaid is read from the persisted payment.status at 541, before order.save() at 542 lets the ServiceOrder pre-save hook (ServiceOrder.js:212-222) recompute it from amountPaid; the Transaction is then created whenever status==='completed' && payment.status==='paid' && wasUnpaid (545-563). updatePayment blocks only cancelled orders (529), so a completed order's amountPaid can be set to any value including 0, and Transaction has no unique constraint on reference.id (Transaction.js:32-40, 56-60). Severity lowered from high: it needs a specific down-then-up operator sequence, and (per finding #10) nothing reads Transaction yet.
- **Failure scenario:** Job JOB-2026-000042 is completed and paid → Transaction #1 for totalAmount 4500. The operator mistypes and PUTs /api/services/:id/payment {amountPaid:0}: the hook recomputes payment.status to 'pending' and Transaction #1 is left standing with no reversal. The operator re-enters 4500: wasUnpaid is now true, so Transaction #2 for 4500 is written with a different transactionNumber. The job's revenue is booked twice, and nothing in either row marks one as a correction.

### M6. StockMovement id generation races, so the ledger row is lost after the stock change has committed

- **Location:** `backend/src/models/StockMovement.js:131`
- **Lens:** data-integrity
- **Verified because:** Confirmed: the pre-save hook does findOne({movementId:/^SM-YYYY-/}).sort({movementId:-1}) then lastNumber+1 (131-142) against a unique index (12-15), and every caller writes the movement strictly after the stock document is already persisted (stockController.js:261→280, salesController.js:315→318, serviceController.js:367→370). One claimed detail is WRONG: the failure is not an unhandled 500 — errorHandler.js:17-22 turns E11000 into a 400 'MovementId already exists'. Severity lowered to medium because it requires two stock mutations overlapping inside the hook's single-round-trip window.
- **Failure scenario:** A restock and a sale completion that overlap inside the hook both read SM-2026-000410 as the last id and both attempt SM-2026-000411; the loser's insert fails with E11000 and the request ends 400 — but its stock.save() (e.g. stockController.js:261) already committed. Inventory has changed with no ledger row, so summing StockMovement.quantity for that stock no longer equals its quantity, and the operator sees a generic 400 that gives no hint the stock was in fact updated.

### M7. Every sale_cancel StockMovement records quantity 0 with identical before/after values

- **Location:** `backend/src/controllers/salesController.js:363`
- **Lens:** data-integrity
- **Verified because:** Confirmed by tracing the data: the cancel branch captures oldQuantity = stock.quantity at 359, calls releaseReservedStock which mutates only reservedQuantity (Stock.js:112-115), then calls createMovementWithOldQuantity at 363, which computes quantity = stockDoc.quantity - oldQuantity = 0 and writes quantityBefore = quantityAfter (stockMovement.js:87, 95-96). I verified against the repo's mongoose that quantity: 0 satisfies the `required` validator on StockMovement.quantity, so the meaningless row is in fact persisted rather than rejected.
- **Failure scenario:** Cancelling a 5-unit pending order against a stock of 100 writes a sale_cancel row reading quantity 0, quantityBefore 100, quantityAfter 100 — an audit entry asserting that nothing changed, when what actually changed was reservedQuantity 5 → 0. StockMovement has no field for reservedQuantity at all, so when availableQuantity mysteriously drops (findings #5, #6, #14), GET /api/stock/movements offers no way to tell which reservation caused it or whether it was ever released.

### M8. Four service mutation routes have no request validation, including the parts and payment endpoints

- **Location:** `backend/src/routes/serviceRoutes.js:121`
- **Lens:** data-integrity
- **Verified because:** Confirmed: PUT /:id/assign (99-103), /:id/status (110-114), /:id/parts (121-125) and /:id/payment (132-136) register only authorize() plus the controller, with no validator array and no validationHandler — unlike POST / at 86-92. updatePartsUsed then iterates the raw body at serviceController.js:459 and updatePayment assigns req.body.amountPaid unchecked at 538. One sub-claim is WRONG: a non-numeric amountPaid does not 500 — I verified mongoose raises 'Cast to Number failed' inside a ValidationError, which errorHandler.js:25-30 maps to 400.
- **Failure scenario:** PUT /api/services/:id/parts with the partsUsed key omitted throws TypeError 'partsUsed is not iterable' at serviceController.js:459 and returns a 500 with a stack trace in development, instead of a 400. Worse, PUT /api/services/:id/payment {amountPaid: 999999} on a completed job passes straight to line 538: the pre-save hook flips payment.status to 'paid' and 545-563 writes a Transaction for the full totalAmount, with no check that the amount recorded bears any relation to what was actually collected.

### M9. 'customer' role is registerable in production but reaches zero functionality

- **Location:** `backend/src/config/constants.js:5`
- **Lens:** feature-completeness
- **Verified because:** The role dead-end is real: grep of every authorize() call in backend/src/routes/ (47 call sites) shows only 'admin', 'salesperson', 'mechanic' — USER_ROLES.CUSTOMER is never passed. Public signup is live and functional: authRoutes.js:96 POST /register-customer, authController.js:295 hard-codes role 'customer', frontend page exists at app/(public)/(auth)/register/, and useAuth.ts:57-59 pushes to /dashboard on success. Navbar.tsx:22-31 leaves only Dashboard ungated; every other nav item carries roles admin/salesperson/mechanic (lines 40,50,60,70,80,90,100,111,121). Downgraded from high and consequence corrected: the claim's 'every API call except GET /auth/me returns 403' is FALSE — GET /api/branches (branchRoutes.js:87-92), GET /api/categories (categoryRoutes.js:144), GET /api/products (productRoutes.js:243), GET /api/sales/:id (salesRoutes.js:99) are protect-only and a customer token passes them.
- **Failure scenario:** A visitor registers at /register with name/email/password. They are redirected to /dashboard and see: four StatCards reading '—' (dashboard/page.tsx:88,97,106,115), an empty Quick Actions grid (every tile is gated on isAdmin/salesperson/mechanic at lines 129,141,153,166), and a Navbar with one link (Dashboard). No order-history or service-tracking surface exists anywhere in app/(protected)/. The account is a permanent dead end, and because customers have no branch, any endpoint behind checkBranchAccess (e.g. GET /api/stock/branch/:id) will also fail for them.

### M10. Dashboard page fetches no data and no backend aggregate endpoint exists to feed it

- **Location:** `frontend/src/app/(protected)/dashboard/page.tsx:88`
- **Lens:** feature-completeness
- **Verified because:** Verified. dashboard/page.tsx imports only React and useAuth (lines 3-4); no React Query hook, no service call. All four StatCards pass literal value="—" at lines 88, 97, 106, 115. Backend has no dashboard or report router (9 route files, none matching); the only aggregates are GET /branches/:id/stats (branchRoutes.js:102) and GET /sales/stats (salesRoutes.js:73), neither referenced by the dashboard. Downgraded from high: this is unbuilt scope rendering a visible placeholder, not a regression — README.md:623-628 lists dashboard KPIs under 'Phase 8 (POST-MVP)'.
- **Failure scenario:** Every user of every role lands on /dashboard after login and sees 'Total Products —', 'Active Customers —', 'Pending Jobs —', "Today's Sales —". 'Active Customers' can never be populated even by wiring an existing endpoint: no controller anywhere counts users with role 'customer' or distinct sales customers, so that card requires new backend work, not just a frontend hook.

### M11. Dashboard QuickAction discards its href prop — all six quick actions are inert buttons

- **Location:** `frontend/src/app/(protected)/dashboard/page.tsx:48`
- **Lens:** feature-completeness
- **Verified because:** Verified. The QuickActionProps interface declares `href: string` at line 45, but the component signature at line 48 destructures only `({ title, description, icon })` and the body (lines 49-57) renders `<button className=...>` with no onClick handler, no useRouter call, and no next/link wrapper. href is passed at all six call sites (lines 133, 145, 157, 171, 181, 191) and silently dropped. Downgraded from high: users retain full navigation via the Navbar, so nothing is unreachable — the tiles are cosmetic dead weight.
- **Failure scenario:** An admin lands on /dashboard and clicks the 'New Sale' tile. The button receives focus and shows its hover border, but nothing navigates — no route change, no console error. Same for Check Inventory, Service Jobs, Add Product, View Reports, Manage Users. Users must fall back to the Navbar, and the failure is silent so it reads as an app hang rather than a missing link.

### M12. Navbar links to /profile in both desktop and mobile menus, but no profile route exists

- **Location:** `frontend/src/components/layouts/Navbar.tsx:251`
- **Lens:** feature-completeness
- **Verified because:** Verified. `href="/profile"` appears at Navbar.tsx:251 (desktop user dropdown) and Navbar.tsx:336 (mobile menu) — a repo-wide grep for '/profile' in frontend/src returns exactly these two lines. The app/(protected)/ listing contains no profile directory (branches, categories, dashboard, products, sales, services, stock, suppliers, users). Neither link is role-gated, so it renders for admin, salesperson, mechanic and customer alike.
- **Failure scenario:** Any logged-in user — including the customer accounts from claim 4 whose only other nav link is Dashboard — opens the avatar dropdown, clicks 'Profile', and gets the Next.js 404 page inside the protected layout. There is no other self-account surface in the app: no page shows your own email, branch, or role, and no page lets you edit them.

### M13. README documents GET /users/all and GET /users/managers; the frontend works around it by paging

- **Location:** `frontend/src/lib/services/userService.ts:62`
- **Lens:** feature-completeness
- **Verified because:** Confirmed, but the load-bearing gap is the client-side workaround, not the README line — I am confirming it on that basis (the doc half alone would be excluded as established-fact staleness). userService.ts:62 getManagers() and serviceService.ts:282 getMechanics() both call apiClient.get('/users') with NO query params and filter the returned array in JS. userController.js:15-16 defaults page=1, limit=20 and clamps at line 49 (`Math.min(100, Math.max(1, parseInt(limit,10) || 20))`), then returns ApiResponse.paginate (userController.js:69) whose data field (apiResponse.js:59) is the 20-item slice. Neither caller inspects the pagination block. Re-anchored the line from README.md:484 to the actual defect site.
- **Failure scenario:** Once the shop has 21+ user records, GET /api/users returns only the 20 newest (sorted createdAt desc, userController.js:17). If mechanic 'Ramon' was created 25th-most-recently, serviceService.getMechanics filters a page that does not contain him and returns a list without Ramon — the dropdown in services/new and AssignMechanicModal renders successfully with no error, just silently missing him, so nobody can be assigned to Ramon through the UI. Identical failure for getManagers feeding the branch-manager dropdown in BranchFormModal.

### M14. Branch.settings.allowNegativeStock, lowStockThreshold and taxRate are stored but never read by any logic

- **Location:** `backend/src/models/Branch.js:60`
- **Lens:** feature-completeness
- **Verified because:** Verified by grep across all of backend/ excluding node_modules. allowNegativeStock: matches only Branch.js:84, branch.test.js:261/273, and docs — zero consumers; Stock.deductStock (Stock.js:118-121) throws unconditionally on quantity > this.quantity with no branch lookup. lowStockThreshold: only Branch.js:88, tests, docs — stockController.js:190-192 uses `$expr: { $lte: ['$quantity','$reorderPoint'] }`, a per-stock field. taxRate: only Branch.js:60, seedBranches.js (3 seeds), branchRoutes.js:57 (input validation), tests, docs — salesController.js:162 reads `taxRate = 0` from req.body and salesController.js:232 stores `rate: taxRate`, validated as a body field at salesRoutes.js:32.
- **Failure scenario:** An admin sets Branch A's settings.taxRate to 0 (tax-exempt outlet) via PUT /api/branches/:id. The next sales order created at Branch A still gets 12% VAT, because sales/new/page.tsx defaults taxRate to 12 in the request body and salesController.js:232 writes whatever the client sent. Likewise setting allowNegativeStock=true changes nothing — deductStock still throws 'Cannot deduct more than available quantity' — and lowStockThreshold, which is rendered to the admin at branches/[id]/page.tsx, never affects which items GET /api/stock/low-stock returns.

### M15. Navbar hides Stock and Products from salespeople although the backend grants them access

- **Location:** `frontend/src/components/layouts/Navbar.tsx:60`
- **Lens:** feature-completeness
- **Verified because:** Verified. Navbar.tsx:60 gives Products `roles: ['admin']` and line 70 gives Stock `roles: ['admin']`; Navbar.tsx:155-158 filters items by hasRole. Backend contradicts both: productRoutes.js:243-246 mounts GET '/' behind `protect` only (every authenticated role passes) and stockRoutes.js:82-87 mounts GET '/' behind `authorize(ADMIN, SALESPERSON)`. Navbar.tsx:111 gives Services `roles: ['admin','salesperson']` while serviceRoutes.js:44 authorizes mechanic too. Partial mitigation noted: mechanics do get a 'My Jobs' item (Navbar.tsx:113-122) pointing at /services/my-jobs, which exists.
- **Failure scenario:** A salesperson logs in and their Navbar shows Dashboard, Sales, Services only. /stock and /products render fine if typed manually and GET /api/stock returns 200 for them, but there is no link anywhere in the chrome to reach either — their only view of inventory is the product picker inside the sales-order form at /sales/new. A mechanic likewise cannot open the full /services list the backend serves them; they see only their own assigned jobs.

### M16. withAuthGuard/withRoleGuard are dead code; several protected pages have no client role gate

- **Location:** `frontend/src/middlewares/roleGuard.tsx:33`
- **Lens:** frontend
- **Verified because:** Partly confirmed, partly overstated. The HOCs really are dead: grep over frontend/src returns only the two definition files plus their own JSDoc, and there is no frontend/middleware.ts or src/middleware.ts. But the claim that 'no page under (protected) is role-gated' is FALSE — users/page.tsx:124, branches/page.tsx:96, branches/[id]/page.tsx:88, products/new/page.tsx:186 and products/[id]/edit/page.tsx:170 all render a 'You do not have permission' Alert inline. The pages with no role gate at all are stock/page.tsx (only `if (!user)` at :247), categories/page.tsx, suppliers/page.tsx and products/page.tsx. Backend side: branchRoutes.js:87 (GET /branches) and stockRoutes.js:184-190 (GET /stock/product/:productId) carry `protect` with no `authorize`, so any role reaches them; but stockRoutes.js:174-181 (GET /stock/branch/:branchId) IS guarded by checkBranchAccess (branchAccess.js:9-28), contradicting that part of the evidence.
- **Failure scenario:** A user with role 'mechanic' types /stock: ProtectedLayout renders the navbar and StockPage mounts, useStock fires GET /api/stock which is authorize(ADMIN, SALESPERSON) → 403, so the page shows an 'Error loading stock' Alert instead of redirecting, and useLowStock 403s alongside it. Separately, a logged-in role 'customer' can call GET /api/stock/product/<productId> and read costPrice/sellingPrice/quantity for every branch (stockController.js:150-177), and GET /api/branches to enumerate every branch — neither endpoint restricts role.

### M17. user.branch is a string after login but a populated object after /auth/me; BranchProvider requests /branches/[object Object]

- **Location:** `frontend/src/providers/BranchProvider.tsx:58`
- **Lens:** frontend
- **Verified because:** Confirmed on every leg. authController.js:133 (login) and :176 (refreshToken) return `branch: user.branch` (raw ObjectId); getMe at authController.js:332 does `User.findById(...).populate('branch','name code')` and returns the whole document, so /auth/me yields `branch: {_id,name,code}`. types/auth.ts:14 declares `branch?: string`. authStore.initialize() (:162 and :173) sets the user from getProfile(), i.e. the populated shape. BranchProvider.tsx:58 takes `user?.branch ?? null` and passes it to useBranch → branchService.getById → `/branches/${id}`. Downgraded from high because useBranchContext has ZERO consumers (grep: only providers/index.ts re-exports it) and useAuth.hasBranchAccess is referenced only inside the dead roleGuard.tsx:65 — so no rendered UI currently depends on the result.
- **Failure scenario:** A salesperson with a branch reloads /sales. initialize() populates user from /auth/me, so user.branch is an object; BranchProvider's useBranch sees a truthy id and issues GET /api/branches/[object Object], which fails branchRoutes.js:97 param('id').isMongoId() with 400 — twice, because QueryProvider.tsx:22 sets retry:1 — on every protected page load and again on window focus in production. sales/page.tsx:67 and sales/new/page.tsx:100 already carry a `typeof user.branch === 'string' ? ... : user.branch._id` workaround, proving the type is lying to every other call site.

### M18. PUT /sales/:id/status returns {order,statusChange} typed as SalesOrder, so the detail query is never invalidated

- **Location:** `frontend/src/lib/services/salesService.ts:109`
- **Lens:** frontend
- **Verified because:** Confirmed. salesController.js:383-395 returns `{ order: populatedOrder, statusChange: {...} }`; salesService.updateStatus declares `apiClient.put<ApiResponse<SalesOrder>>` and returns data.data (the wrapper — the `!data.data` guard passes because the wrapper is truthy). useSales.ts:126 then invalidates salesKeys.detail(updatedOrder._id) = ['sales','detail',undefined], which does not partial-match ['sales','detail','<realId>']. The other invalidations at :128-131 are lists()/stats()/['stock'], none of which is a prefix of the detail key, and sales/[id]/page.tsx:125 uses useSalesOrder (key ['sales','detail',id]) with staleTime 30s and refetches only via the manual button at :205. Downgraded from high: the server-side write is correct and salesController.js:294 rejects invalid repeat transitions, so no data corruption.
- **Failure scenario:** On /sales/<id>, a salesperson opens UpdateStatusModal, picks 'processing', submits. The PUT succeeds and the modal closes, but the detail query is untouched, so the page keeps showing the 'Pending' badge and the pending-only action buttons. If they click Update again picking 'completed', the request hits salesController.js:294 and returns 400 'Cannot change status from processing to completed'… only after they re-pick from a stale list — the page corrects itself only on remount or window refocus.

### M19. Global React Query config retries failed mutations once, so non-idempotent POSTs can execute twice

- **Location:** `frontend/src/providers/QueryProvider.tsx:30`
- **Lens:** frontend
- **Verified because:** Confirmed. QueryProvider.tsx:28-31 sets `mutations: { retry: 1 }` globally; no useMutation in hooks/*.ts passes its own retry (checked useSales.ts:96-172, useStock.ts:102-234, useServices.ts). apiClient.ts:16 sets timeout: 15000, and an axios timeout/network error rejects client-side while the server request may already have committed. Backend has no idempotency key: salesController.createSalesOrder reserves stock and the SO- number is minted in a pre('save') hook. Downgraded from high because it requires a lost/timed-out response, not ordinary operation.
- **Failure scenario:** A salesperson submits a 30-line order at /sales/new over a flaky connection. The server writes SO-00042 and reserves stock, but the response is lost at 15s; axios rejects, React Query silently re-POSTs the identical body, and the server creates SO-00043 with the same items — the customer's order is duplicated and the same units are reserved twice, with only one order visible to the salesperson. The same applies to useRestock (useStock.ts:105) and useCreateTransfer (useStock.ts:198).

### M20. Logout never clears the React Query cache, so the next user in the same tab sees the previous user's data

- **Location:** `frontend/src/stores/authStore.ts:140`
- **Lens:** frontend
- **Verified because:** Confirmed. authStore.logout (:132-144) calls authService.logout() then clearTokens()/setUser(null) and nothing else; grep for queryClient.clear/removeQueries/resetQueries across frontend/src returns zero hits. QueryProvider.tsx:26 sets gcTime 5 minutes and the client is created once via useState in a root-layout provider (app/layout.tsx:33-35), so it survives the soft navigations in useAuth.ts:71 (logout → router.push('/login')) and :40 (login → router.push). Downgraded from high: it is a same-tab, 5-minute-window disclosure of already-rendered data, and the background refetch immediately 403s.
- **Failure scenario:** An admin browses /users (key ['users','list',{search:undefined,isActive:undefined,role:undefined,page:1,limit:10}]) and logs out. A mechanic logs in on the same tab two minutes later and navigates to /users; the query key is byte-identical, so React Query paints the admin's cached user list — names, emails, roles — before the gate at users/page.tsx:124 or the 403 refetch replaces it. Same for ['sales','list',{...}] and ['stock','list',{}].

### M21. Open redirect: the ?redirect= query param is pushed unvalidated after login

- **Location:** `frontend/src/app/(public)/(auth)/login/login.tsx:27`
- **Lens:** frontend
- **Verified because:** Confirmed. login.tsx:22 reads `searchParams.get('redirect') || '/dashboard'`; :27 pushes it for an already-authenticated visitor and :49 passes it into login(), reaching useAuth.ts:40 `router.push(redirectTo || '/dashboard')`. There is no allowlist, no leading-slash check and no origin comparison anywhere in the file, and Next's App Router router.push falls back to a full document navigation for absolute external URLs. Downgraded from high to medium: this is a phishing aid requiring user interaction, not an auth bypass — no token or session data is carried to the attacker origin (the access token stays in this origin's localStorage and the refresh cookie is httpOnly).
- **Failure scenario:** An attacker mails a link to https://app.example/login?redirect=https://evil.example/login. The victim sees the genuine origin, the genuine TLS cert and the genuine login form, authenticates successfully, and is then hard-navigated to the attacker's pixel-identical clone showing 'Session expired, please sign in again' — collecting the credentials the victim just proved are valid. `//evil.example` works the same way.

### M22. ProductStockSummary declares available/isLowStock but GET /stock/product/:id sends availableQuantity/stockStatus

- **Location:** `frontend/src/types/stock.ts:192`
- **Lens:** frontend
- **Verified because:** Confirmed. stockController.js:160-171 emits each branch entry as {branch, quantity, reservedQuantity, availableQuantity, costPrice, sellingPrice, reorderPoint, stockStatus, location}; types/stock.ts:186-197 declares `available: number` and `isLowStock: boolean` instead. stockService.getByProduct returns data.data untransformed, and ProductBranchStock.tsx:65 consumes it via useStockByProduct. The component renders `{item.available}` at :194 (table) and :278 (mobile card) and calls getStockStatus(item.quantity, item.available, item.reorderPoint) at :174 and :256; getStockStatus at :41-49 tests `available <= reorderPoint`. ProductBranchStock is really mounted — products/[id]/page.tsx:416.
- **Failure scenario:** A branch holds quantity 3 with reorderPoint 10. On /products/<id>, the 'Available' cell renders empty (undefined) in both the table and the mobile card, and getStockStatus receives undefined for `available`, so `undefined <= 10` is false and the row is badged green 'In Stock' — the product detail page tells staff a below-reorder-point branch is healthy. Only a literal quantity of 0 still shows 'Out of Stock'.

### M23. AdjustStockModal's default reason is not a valid option, and 'lost' is rejected by the backend's min-length rule

- **Location:** `frontend/src/components/stock/AdjustStockModal.tsx:57`
- **Lens:** frontend
- **Verified because:** Both halves confirmed. The form defaults to reason:'correction' (AdjustStockModal.tsx:57 and again in the reset effect at :67), while ADJUSTMENT_REASONS (types/stock.ts:205-213) contains only damaged/lost/found/inventory_count/returned/expired/other — those are the exact <option> values rendered at :238-242 — and utils/validators/stock.ts:82 is `z.enum(adjustmentReasons, { message: 'Please select a valid reason' })`. Separately, the modal calls handleAdjust → useAdjustStockById → PUT /stock/:id/adjust, whose validator at stockRoutes.js:69-70 requires body('reason').isLength({min:5,max:500}); the value 'lost' is 4 characters.
- **Failure scenario:** (1) An admin opens Adjust Stock on a stock row, enters -3, and clicks Adjust without touching the Reason select (whose DOM value has no matching option, so it renders blank/first-item). Zod rejects reason='correction' and the modal shows 'Please select a valid reason' under a control the user believes is already set. (2) The same admin then picks 'Lost' — zod passes, the PUT goes out, and express-validator returns 400 'Reason is required and must be between 5-500 characters'. The Lost option can never be submitted.

### M24. Stock page fetches only the first 20 records but searches, filters, sorts and counts over them client-side

- **Location:** `frontend/src/app/(protected)/stock/page.tsx:67`
- **Lens:** frontend
- **Verified because:** Confirmed. stock/page.tsx:67-70 calls useStock({}, { enabled: !selectedBranch }) with no page/limit, so stockController.js:23-24 applies limit = PAGINATION.DEFAULT_LIMIT = 20 (config/constants.js:91) and skip 0. The page then filters by search (:102-112), by low/out-of-stock (:115-122), sorts (:125-164) and computes stats.totalValue and outOfStockCount (:173-177) purely over that 20-row array, and renders 'Showing {filteredStock.length} of {stockData.length} stock records' at :339 next to the comment '{/* Pagination placeholder - can be added later */}' at :336. No pagination control exists.
- **Failure scenario:** A shop with 300 (product,branch) stock rows opens /stock. Only the 20 rows of page 1 are ever loaded: typing an SKU that lives on row 45 returns an empty table ('no results') even though the product exists, the 'Total Inventory Value' card sums 20 rows out of 300 and is wrong by an order of magnitude, and 'Out of Stock' counts only the zeros among those 20. The footer reads 'Showing 20 of 20' with no hint that 280 rows were never fetched.

### M25. Sales page sends sortBy/sortOrder that the backend ignores, and searches only within the current page

- **Location:** `frontend/src/app/(protected)/sales/page.tsx:52`
- **Lens:** frontend
- **Verified because:** Confirmed. The filters memo at sales/page.tsx:48-53 always includes sortBy: sortField and sortOrder, and :56 adds `search`. salesController.js:17-24 destructures only branch, status, paymentStatus, startDate, endDate, page and limit from req.query and hard-codes .sort({ createdAt: -1 }) at :61 — search, sortBy and sortOrder are silently dropped. The page compensates for search alone at :96-106 by filtering the already-fetched `orders` array; there is no client-side re-sort.
- **Failure scenario:** An admin clicks the 'Total' column header on the sales table: handleSortChange updates state, the query key changes, a new request goes out, the spinner flashes — and the same createdAt-desc page comes back, so the table never reorders (the header arrow flips while the rows do not move). Searching 'Dela Cruz' matches only within the 20 orders on the current page, so an order from last month is unfindable through a search box that implies a global search.

### M26. No SIGTERM handler and no graceful shutdown of the HTTP server

- **Location:** `backend/src/server.js:141`
- **Lens:** ops-config
- **Verified because:** Verified. server.js:141 discards the app.listen() return value; nothing holds a reference to close. A grep for SIGTERM|unhandledRejection|uncaughtException across backend/src, backend/tests and frontend/src returned zero hits. The only shutdown hooks are process.on('SIGINT') at config/database.js:22 (awaits mongoose.connection.close() then process.exit(0) at line 25) and config/redis.js:47 (async, awaits redisClient.quit(), never exits). Both are registered, redis.js's at module-load time and database.js's inside connectDB after a successful connect, so on Ctrl-C they do race and the Mongo handler's exit(0) can kill the pending Redis quit. Downgraded from high to medium: this is a deploy-hygiene gap, not a correctness or security defect, and the ledger-gap scenario is a narrow window rather than a routine outcome.
- **Failure scenario:** On `docker stop`, a Kubernetes rolling restart, or a Render/Railway redeploy the platform sends SIGTERM. Node has no listener for it, so the process terminates immediately: every in-flight request is severed with a TCP reset mid-response and the Mongo pool is never drained. Concretely, a PUT /api/stock/:id that has completed `stock.save()` but not yet reached `createMovementWithOldQuantity()` commits the quantity change and never writes the StockMovement row — the append-only ledger permanently disagrees with Stock.quantity for that product/branch pair, and there is nothing to detect it.

### M27. Redis client left non-null after failed connect, so the optional-Redis guard is dead code

- **Location:** `backend/src/config/redis.js:33`
- **Lens:** ops-config
- **Verified because:** Verified. redis.js:7 assigns the module-level `redisClient` before `await redisClient.connect()` at line 29. The catch at 33-38 logs and `return null`s to the caller but never resets `redisClient`, and `getRedisClient()` (42-44) returns the module variable, not the connectRedis() return value. Every CacheUtil guard is `const client = getRedisClient(); if (!client) return ...` (cache.js:12-13, 32-33, 50-51, 68-69, 89-90), so with node-redis ^5.9.0 (package.json:26) those guards can never fire once createClient has run. Downgraded from high to medium: the failure is log noise plus dead fallback code, not broken responses — every CacheUtil method wraps its command in try/catch and returns null/false, so requests still answer from Mongo.
- **Failure scenario:** Start the backend with no Redis reachable (REDIS_URL pointing at a stopped instance). connect() rejects, the catch logs 'Continuing without Redis...', but redisClient stays set. Every subsequent `GET /api/branches` runs cacheMiddleware -> CacheUtil.get -> client.get() on a closed client, throwing ClientClosedError, caught at cache.js:17-20, printing `Cache get error for key cache:branches:/api/branches: ClientClosedError...` with a stack. Every product or stock mutation adds one or two `Cache delete pattern error for cache:products:*` stacks (productController.js:200-201, stockController.js:294). The operator sees a working API emitting several error-level stack traces per request forever, and the documented no-op path never runs.

### M28. errorHandler returns raw internal error messages to clients in production

- **Location:** `backend/src/middleware/errorHandler.js:45`
- **Lens:** ops-config
- **Verified because:** Verified. Line 46 gates only `stack` behind NODE_ENV === 'development'; line 45 is an ungated `message: error.message || 'Server Error'`, and line 3 (`error.message = err.message`) guarantees the original message survives the `{...err}` spread even for non-enumerable Error properties. Anything not matching CastError / 11000 / MongoServerError / ValidationError / JsonWebTokenError / TokenExpiredError (lines 10-41) falls through with statusCode undefined -> 500 and its raw message. Reachable from any controller via asyncHandler (utils/asyncHandler.js:4 -> .catch(next)). A second identical leak exists at middleware/imageUpload.js:100-104, which returns `error: error.message` on a 500 with no environment gate at all. Downgraded from high to medium: this is information disclosure requiring the caller to first trigger a 500, not a direct exploit.
- **Failure scenario:** Deploy with NODE_ENV=production, then trigger any unhandled runtime error — e.g. a controller dereferencing an unpopulated ref, which produces `TypeError: Cannot read properties of undefined (reading 'branch')`. The unauthenticated caller receives `500 {"success":false,"message":"Cannot read properties of undefined (reading 'branch')"}`, naming an internal field. Separately, POST /api/products/:id/image on a full or read-only volume returns `500 {"success":false,"message":"Failed to process image","error":"...ENOSPC ... /app/uploads/products/<uuid>.jpeg"}` (imageUpload.js:103), disclosing the absolute container path.

### M29. errorHandler classifies every MongoServerError as a duplicate-key error

- **Location:** `backend/src/middleware/errorHandler.js:17`
- **Lens:** ops-config
- **Verified because:** Verified. Line 17 reads `if (err.code === 11000 || err.name === 'MongoServerError')`. Since E11000 duplicate-key errors already carry name 'MongoServerError', the second arm is strictly wider and swallows the entire MongoServerError class. Lines 18-19 then evaluate `(err.keyPattern || err.keyValue || {})` -> `{}` for a non-duplicate error, so `Object.keys({})[0]` is undefined and `field` falls back to the literal 'field'. Line 21 forces statusCode 400. This branch also runs after the CastError branch and is not else-if'd, so it overwrites. Downgraded from high to medium: it corrupts observability and produces a nonsense client message, but causes no data loss or security exposure.
- **Failure scenario:** On an Atlas free tier that has hit its 512MB limit, a `POST /api/products` write fails with `MongoServerError: you are over your space quota, using 512 MB of 512 MB`. errorHandler line 17 matches on the name, keyPattern/keyValue are undefined, and the client receives `400 {"success":false,"message":"Field already exists"}`. The same happens for `not authorized on db to execute command`, WriteConflict on a retried write, and `Sort exceeded memory limit`. Any dashboard alerting on 5xx stays green through a full storage outage while the frontend shows users a bogus duplicate-value validation error.

### M30. No CI workflow anywhere in the repository

- **Location:** `.github/appmod/appcat:1`
- **Lens:** ops-config
- **Verified because:** Verified. `ls -laR .github` shows only .github/appmod/appcat, and appcat is empty — there is no .github/workflows directory. `git ls-files | grep -iE 'env|\.yml|\.yaml|Dockerfile|Procfile|nvmrc|vercel|render'` returns only backend/tests/setup/testEnv.js and frontend/public/vercel.svg, so no workflow file is tracked. backend/package.json:9-11 defines test/test:watch/test:coverage and frontend/package.json:9 defines lint, and nothing invokes them automatically. Downgraded from high to medium: this is a process gap with no runtime failure mode of its own.
- **Failure scenario:** Push a commit that breaks `next build` type-checking or adds a failing backend test and nothing objects — no check runs on push or PR. This is already demonstrated: backend/tests/user.test.js has imported ../src/server.js (which calls startServer -> connectDB -> process.exit(1) without a local mongod) across the five most recent commits on master, and `npm test` has been red that entire time with no signal anywhere in the repo.

### M31. No tracked .env template for either package, and no startup validation of required env vars

- **Location:** `frontend/.gitignore:34`
- **Lens:** ops-config
- **Verified because:** Partially confirmed, and the stated consequence is overstated. Confirmed: `git check-ignore --no-index -v frontend/.env.example` returns `frontend/.gitignore:34:.env*`, so the only example file in the repo is ignored; `git ls-files | grep -i env` returns nothing; `ls -a backend` shows no .env.example/.env.sample. REFUTED: 'a fresh clone contains zero documentation of required configuration' — README.md:363-402 documents a full backend .env block. That block is however wrong in both directions: it omits REDIS_URL (the only Redis var the code reads, redis.js:8), BACKEND_URL (imageUpload.js:84) and CORS_ALLOWED_ORIGINS (constants.js:102), while listing COOKIE_SECURE and COOKIE_DOMAIN, for which a grep across backend/src returns no matches. Confirmed and unaffected by the README: a grep for JWT_SECRET|MONGODB_URI across backend/src returns only jwt.js:5, auth.js:13, database.js:5 and seedBranches.js:99 — there is no env-validation step anywhere.
- **Failure scenario:** Deploy the backend with MONGODB_URI set but JWT_SECRET omitted (easy, since no template lists it as required and nothing checks it). connectDB succeeds, the server logs 'Server running in production mode on port 5000', and `GET /health` returns 200 — the platform marks the deploy healthy. The first `POST /api/auth/login` reaches utils/jwt.js:5, `jwt.sign({id}, undefined, ...)` throws 'secretOrPrivateKey must have a value', asyncHandler forwards it to errorHandler, and every user gets a 500. Login is 100% broken on a deploy that reports itself healthy.

### M32. Root .gitignore does not cover backend/uploads/, backend/dist/, or non-.local .env variants

- **Location:** `.gitignore:28`
- **Lens:** ops-config
- **Verified because:** Verified by running the check. `git check-ignore --no-index -v backend/.env backend/.env.production backend/.env.staging backend/uploads/products/x.jpeg backend/dist/app.js` matches only backend/.env (via .gitignore:28) — the other four produce no match. The env rules are the exact name `.env` (line 28), `.env*.local` (29) and three explicit `.env.<x>.local` names (30-32). `/build` and `/dist` (14-15) are leading-slash anchored to the repo root and cannot match backend/dist. `git status --untracked-files=all --short` right now lists backend/uploads/products/7988b727-….jpeg and backend/uploads/products/91a47108-….jpeg as untracked and not ignored. Downgraded from high to medium: the currently-existing secret file (backend/.env) is covered, so the exposure is conditional on someone creating an environment-suffixed variant.
- **Failure scenario:** Run `git add . && git commit` today and the two user-uploaded product JPEGs enter git history permanently (binary blobs that cannot be removed without a history rewrite). The same command would commit `backend/.env.production` verbatim if anyone ever creates one — JWT_SECRET, JWT_REFRESH_SECRET and the MONGODB_URI with its Atlas credentials, pushed to the remote. The near-misses make this worse: because backend/.env and backend/dump.rdb (via .gitignore:74 `**/**.rdb`) do happen to be covered, the file reads as complete.

### M33. Uploads are written to instance-local disk and served from it, with no shared or object storage

- **Location:** `backend/src/middleware/imageUpload.js:78`
- **Lens:** ops-config
- **Verified because:** Verified. imageUpload.js:18 computes uploadsDir as `path.join(process.cwd(), 'uploads', 'products')`; line 78 writes with `sharp(...).toFile(outputPath)` with no guard, while only the mkdir at 19-26 is try/catch'd with the 'Ignore on serverless/read-only filesystems' comment. server.js:21 serves that same directory via express.static. Line 84-90 bakes an absolute `${BACKEND_URL}/uploads/products/${filename}` into req.processedImage.url, which is what gets persisted on the Product. No S3/GCS/Cloudinary client appears in backend/package.json dependencies (lines 17-30). Downgraded from high to medium: it works correctly on a single long-lived instance with a persistent volume, which is a legitimate deployment shape.
- **Failure scenario:** Deploy the backend to any container platform with an ephemeral filesystem (Render free tier, Fly without a volume, a plain `docker run` with no mount). Upload three product images — they are written to /app/uploads/products and Product documents store `https://api.example.com/uploads/products/<uuid>.jpeg`. The next redeploy or container restart replaces the filesystem: express.static now 404s all three URLs while the Product documents still point at them, and no code reconciles the two, so the catalogue shows permanently broken images with no error anywhere. On a two-instance deploy the same URLs 404 roughly half the time depending on which instance the request lands on.

### M34. CORS runs after body parsing and static file serving, so those responses carry no CORS headers

- **Location:** `backend/src/server.js:47`
- **Lens:** ops-config
- **Verified because:** Confirmed for the body-parser half; the static half is weak. Middleware order in server.js is express.json() (14), express.urlencoded() (15), cookieParser() (18), express.static('/uploads') (21), the request logger (24), then the CORS middleware (47). When express.json rejects a body it calls next(err), and Express skips all 3-argument middleware — including the CORS handler at 47, which is 3-arg — straight to the 4-arg errorHandler mounted at 127. Nothing before line 47 sets Access-Control-Allow-Origin, so those responses carry none. The static claim is technically true but has little consequence: /uploads assets are consumed by <img>/next-image (a server-side fetch), not by browser fetch/XHR, so CORS never applies to them in this app. Keeping medium on the body-parser path.
- **Failure scenario:** express.json() uses its 100kb default limit (server.js:14 passes no options). Submit a sale or bulk stock payload above that from the browser: express.json calls next(PayloadTooLargeError), which bypasses the CORS middleware at line 47 and lands on errorHandler at 127, which emits 413 with no Access-Control-Allow-Origin. The browser blocks the response, so axios rejects with a network-style error carrying no `error.response` — apiClient.ts:86 and :109 both test `error.response?.status` and match neither, the request falls through to the generic reject at line 160, and the user sees a spinner stop with no message. The same happens for any malformed JSON body.

### M35. Neither helmet nor rate limiting is installed, despite both being planned

- **Location:** `backend/package.json:19`
- **Lens:** ops-config
- **Verified because:** Verified. backend/package.json dependencies (17-30) are bcrypt, cookie-parser, dotenv, express, express-validator, jsonwebtoken, mongoose, multer, redis, sharp, socket.io, uuid — no helmet, express-rate-limit or express-slow-down. A case-insensitive grep for rateLimit|rate-limit|helmet|slowDown across backend/ hits only documentation (Planning.md:130 'TO CREATE', :496, :1735; Phase-10-POST-MVP.md:338, :378), never source. authRoutes.js:95-100 mounts /register, /login, /refresh-token, /forgot-password and /reset-password with only express-validator chains in front. server.js sets no security headers and never calls app.disable('x-powered-by'). One correction: /auth/forgot-password is not an email amplifier — authController.js:225-229 sends no email at all, it returns the resetToken in the response body, so unmetered access to it is a user-enumeration oracle (404 'User not found' at line 218 vs 200) rather than an amplification vector.
- **Failure scenario:** POST /api/auth/login accepts unlimited attempts from a single IP. Against the 6-character minimum enforced at models/User.js:27 and authRoutes.js:30, a credential-stuffing list runs at whatever rate the box sustains, with the 401 'Invalid credentials' (line 114) vs 401 'Account is deactivated' (line 107) split leaking which emails exist. POST /api/auth/forgot-password is likewise unmetered and its 404-vs-200 split enumerates the full user table. Every response also ships X-Powered-By: Express with no X-Content-Type-Options or HSTS.

### M36. NEXT_PUBLIC_API_URL falls back to localhost:5000 and is inlined at build time

- **Location:** `frontend/src/lib/apiClient.ts:15`
- **Lens:** ops-config
- **Verified because:** Verified by grep across frontend/src: apiClient.ts:15 (`baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'`), apiClient.ts:129 (the same expression repeated inline for the refresh POST), plus NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000' at ProductCard.tsx:29, ProductImageEditor.tsx:32 and ProductImageGallery.tsx:20. NEXT_PUBLIC_* is substituted by the bundler at build time, so the fallback is frozen into the shipped chunks. Worth noting the fallback is doubly wrong: it also omits the /api segment the backend requires (server.js:79-87), so it cannot work even against a local backend.
- **Failure scenario:** Build on a host where the env var was not configured (e.g. Vercel with the variable set on Preview but not Production). `next build` emits no warning and bakes `http://localhost:5000` into the client bundle. Every visitor's browser then issues XHRs to their own machine's port 5000, which are refused, so the app shows connection errors on every page — and because the requests never leave the client, backend logs stay completely clean, hiding the cause. Setting the variable in the dashboard afterwards changes nothing until a full rebuild and redeploy.

### M37. GET /api/stock/transfers and /transfers/:id are protect-only — any authenticated user reads all inter-branch transfer history

- **Location:** `backend/src/routes/stockRoutes.js:138`
- **Lens:** security-authz
- **Verified because:** stockRoutes.js:138-142 (`/transfers`) and 145-151 (`/transfers/:id`) apply only `protect`; no `authorize`, no branch middleware. stockController.js:669-679 builds `const query = {}` and adds a `$or` on fromBranch/toBranch only when the caller passes `?branch=`, so the default is every transfer. stockController.js:717-737 does a bare `StockTransfer.findById(id)` and populates `fromBranch`/`toBranch` with 'name code address contact' and `initiatedBy`/`approvedBy`/`receivedBy` with 'name email'. The write siblings POST and PUT /transfers are `authorize(USER_ROLES.ADMIN)` (stockRoutes.js:157, 167), confirming the reads were simply missed. Severity lowered from high: this is read-only disclosure of operational metadata and staff contact details, not privilege escalation or data tampering.
- **Failure scenario:** A self-registered customer (public POST /api/auth/register-customer) calls GET /api/stock/transfers?limit=100 and pages through the complete inter-branch movement history — which SKU moved from which branch to which, in what quantity, when, and its status — then GET /api/stock/transfers/<id> for each, which additionally returns both branches' street addresses and phone/email contacts plus the full name and work email of the staff who initiated, approved and received each transfer. That is a ready-made phishing target list plus a picture of which branches carry which inventory.

### M38. GET /api/stock and GET /api/stock/low-stock apply no branch scoping for salespersons

- **Location:** `backend/src/controllers/stockController.js:27`
- **Lens:** security-authz
- **Verified because:** stockController.js:27-43: `const query = {}`, and `query.branch` is set only from the caller-supplied `?branch=` query param; `req.user.branch` is never referenced in getAllStock. Same in getLowStock, stockController.js:190-196. Both routes authorize SALESPERSON (stockRoutes.js:82-95). The returned rows carry `costPrice` and `sellingPrice` (Stock is the per-branch pricing join). The contrast the claim cites is real: salesController.js:30-34 does force `if (req.user.role !== 'admin') query.branch = req.user.branch`, and serviceController.js:33-37 does the same — so per-branch clamping is the project's established pattern and stock is the outlier. Severity lowered from high to medium: exploitation requires an already-provisioned internal salesperson account, and the exposure is read-only.
- **Failure scenario:** A salesperson assigned to branch A calls GET /api/stock?limit=100 with no branch filter and receives paginated Stock rows for every branch, each including that branch's costPrice and sellingPrice; GET /api/stock/low-stock returns every branch's low-stock list with populated supplier name/code/contact. A branch-A employee therefore sees branch B's margins, supplier relationships and shortage positions — and, since Stock `_id`s are in the same response, gains the ids needed for the PUT /api/stock/:id/restock cross-branch write above.

### M39. Stock movement ledger by stock/product is readable across branches by any salesperson

- **Location:** `backend/src/routes/stockRoutes.js:108`
- **Lens:** security-authz
- **Verified because:** stockRoutes.js:108-115 and 118-125 mount `/movements/stock/:stockId` and `/movements/product/:productId` with `protect, authorize(ADMIN, SALESPERSON)` and validation only — no branch middleware. stockController.js:830 queries `StockMovement.find({ stock: stockId })` with no branch predicate; stockController.js:870-873 queries `{ product: productId }` and adds `query.branch` only from the optional `?branch=` param. Both populate `performedBy` with 'name email' (lines 834, 884) and getMovementsByStock also populates supplier and the reference document. The sibling `/movements/branch/:branchId` is the only movement route with `checkBranchAccess` (stockRoutes.js:128-135), and `/movements` (all) is correctly admin-only (stockRoutes.js:103) — so the two id-scoped routes are the hole.
- **Failure scenario:** A salesperson at branch A takes a Stock `_id` belonging to branch B (trivially obtained from the unscoped GET /api/stock) and calls GET /api/stock/movements/stock/<that id>?limit=100. The response is branch B's complete audit trail for that item: every restock, adjustment, sale deduction, service consumption and transfer, with old/new quantities, supplier name and code, and the full name and work email of the staff member who performed each one. GET /api/stock/movements/product/<productId> gives the same across all branches at once for any product.

### M40. Password reset does not invalidate the stored refresh token

- **Location:** `backend/src/controllers/authController.js:262`
- **Lens:** security-authz
- **Verified because:** authController.js:262-266 sets `user.password = newPassword; user.resetPasswordToken = undefined; user.resetPasswordExpire = undefined; await user.save()` and never touches `user.refreshToken`. authController.js:156-161 shows the refresh endpoint's only condition is `user.refreshToken !== token` (plus isActive at 163) — no password-change epoch, no issued-at check. I confirmed the three sibling flows that DO clear it: logout (authController.js:195), deactivateUser (userController.js:254 'Clear refresh token to force logout') and admin changeUserPassword (userController.js:310 'Clear refresh token to force re-login') — so this is an inconsistency within the same codebase, not a design decision.
- **Failure scenario:** An attacker who has stolen a victim's refreshToken cookie keeps it after the victim performs the standard remediation. Concretely: victim resets their password via /auth/reset-password; the attacker's cookie still equals `user.refreshToken` in Mongo, so POST /api/auth/refresh-token returns 200 with a fresh accessToken, and does so for the remaining life of the 30-day cookie (getRefreshTokenCookieOptions, authController.js:13). Chained with the reset-token leak above, an attacker can reset a victim's password, and even after the victim resets it back, the attacker's session survives.

### M41. getServiceInvoice compares a populated Branch document with .toString(), so the branch check can never match

- **Location:** `backend/src/controllers/serviceController.js:636`
- **Lens:** security-authz
- **Verified because:** serviceController.js:621-625 populates branch (`.populate('branch', 'name code address phone email')`), then line 636 checks `if (req.user.role !== 'admin' && order.branch.toString() !== req.user.branch.toString())`. I verified the mongoose behaviour by executing it against this project's installed mongoose: a hydrated Document's toString() returns `{ name: 'Main', _id: new ObjectId('6a6403...') }` and `doc.toString() === doc._id.toString()` is false. So the comparison is structurally always true for non-admins. The correctly-written siblings confirm the bug is local: getServiceOrder uses `order.branch._id.toString()` (serviceController.js:155) and salesController uses `order.branch._id.toString()` (salesController.js:94, 509); assignMechanic/updateServiceOrderStatus/updatePartsUsed use plain `order.branch.toString()` (serviceController.js:265, 329, 449) but those load the order WITHOUT populate, so their ObjectId .toString() is correct.
- **Failure scenario:** A salesperson at branch A opens the invoice for a service order created at branch A: GET /api/services/<id>/invoice returns 403 'Access denied to this branch' because `"{ name: 'Branch A', _id: new ObjectId('...') }" !== "<24-hex>"`. The invoice endpoint is therefore dead for both salespersons and mechanics — only admins can print a service invoice. The latent risk is that the authorization decision rests on a value guaranteed to mismatch, so a future 'fix' that loosens the comparison (rather than adding `._id`) flips it from deny-all to allow-all.

### M42. GET /api/sales/:id and /:id/invoice lack `authorize`, so customers reach the handler and crash the branch check with a 500

- **Location:** `backend/src/routes/salesRoutes.js:99`
- **Lens:** security-authz
- **Verified because:** salesRoutes.js:99-104 and 107-112 are `protect, mongoIdValidation, <handler>` — the only two sales routes with no `authorize`; every sibling (stats:76, list:84, by-branch:92, create:118, status:127, payment:136, delete:145) carries one. The handlers then evaluate `req.user.role !== 'admin' && order.branch._id.toString() !== req.user.branch.toString()` (salesController.js:94 and 509). A customer created by the public register-customer flow has no branch: authController.js:290-297 omits it and models/User.js:38-42 makes branch required only for salesperson/mechanic — so `req.user.branch` is `undefined` and `.toString()` throws a TypeError. asyncHandler.js:4 forwards it to errorHandler.js, which has no TypeError branch, so line 43 falls through to `res.status(error.statusCode || 500)`. Mechanics, who do have a branch, pass the check for any order in their branch.
- **Failure scenario:** Two distinct failures. (1) A self-registered customer probing GET /api/sales/<24-hex id> gets 404 'Resource not found' for ids that do not exist but HTTP 500 with the raw message "Cannot read properties of undefined (reading 'toString')" for ids that do — a working oracle for valid sales-order ids, and in NODE_ENV=development errorHandler.js:46 also returns the stack trace. (2) A mechanic, who is excluded from every other /api/sales route, passes the branch check and can read any sales order in their branch via GET /api/sales/<id> and its /invoice — customer name, phone, email, line items, prices and full payment status.

### M43. No rate limiting and no security headers anywhere in the app

- **Location:** `backend/src/server.js:14`
- **Lens:** security-authz
- **Verified because:** I read server.js in full. The entire global middleware stack is express.json() (14), express.urlencoded() (15), cookieParser() (18), express.static for /uploads (21), a console request logger (24-44) and a hand-rolled CORS block (47-65) — then routes. No helmet, no rate limiter, no mongo-sanitize, no hpp. backend/package.json dependencies (lines 17-30) list only bcrypt, cookie-parser, dotenv, express, express-validator, jsonwebtoken, mongoose, multer, redis, sharp, socket.io, uuid — none of the above is present, so the omission is not merely unwired, it is uninstalled. models/User.js:99 confirms bcrypt cost 10.
- **Failure scenario:** POST /api/auth/login is an unthrottled bcrypt(cost 10) oracle: an attacker can run credential stuffing at whatever rate the box sustains, and because each guess burns ~100ms of server CPU, a few hundred concurrent guesses is also a cheap application-layer DoS. POST /api/auth/forgot-password is equally unthrottled, so the plaintext-reset-token leak above can be sprayed across a harvested employee email list in a single loop with no lockout. Separately, with no helmet the /uploads static mount (server.js:21) serves user-uploaded bytes from the API origin with no X-Content-Type-Options: nosniff, so a file that sniffs as HTML renders in the browser on the API's own origin.

### M44. All four stock-movement ledger endpoints have no HTTP test

- **Location:** `backend/src/routes/stockRoutes.js:100`
- **Lens:** test-gaps
- **Verified because:** `grep -rn "movements" backend/tests/` returns zero hits. The four routes exist at stockRoutes.js:100 (GET /movements, `authorize(USER_ROLES.ADMIN)` at :103), :108 (/movements/stock/:stockId), :118 (/movements/product/:productId), :128 (/movements/branch/:branchId with checkBranchAccess at :131), backed by exported controllers at stockController.js:747, 814, 860, 906. Downgraded from high: these are read-only endpoints with no demonstrated live defect. I also refute the claim's route-ordering sub-point — stockRoutes.js has no `GET /:id` route, and `/movements/branch/:branchId` (129) and `/branch/:branchId` (175) are distinct literal prefixes, so no shadowing is possible regardless of order.
- **Failure scenario:** If `authorize(USER_ROLES.ADMIN)` were dropped from stockRoutes.js:103 during a refactor, a salesperson calling `GET /api/stock/movements` would receive the full cross-branch movement ledger (every branch's cost prices, restock volumes, and adjustment reasons) and all 305 tests would still pass, because no test issues a request to any /movements path.

### M45. No test anywhere asserts that a StockMovement ledger row was written

- **Location:** `backend/src/controllers/stockController.js:327`
- **Lens:** test-gaps
- **Verified because:** `grep -rn "StockMovement" backend/tests/` returns zero hits. `grep -rn "createMovementWithOldQuantity" backend/src` shows 8 call sites across 3 controllers: stockController.js:280 (restockProduct), :327 (adjustStock), :389 (restockById), :433 (adjustById), :579/:616 (transfer out/in), salesController.js:318 (SALE) and :363 (SALE_CANCEL), serviceController.js:370 (SERVICE_USE). I read stock.test.js:508-565: the adjust tests assert only `res.body.data.stock.quantity` (521) and `res.body.data.adjustment.oldQuantity/newQuantity` (522-523) — values computed in-memory by the controller, not read back from the ledger. Severity held at medium: this is pure missing coverage, no live defect.
- **Failure scenario:** Delete the `await createMovementWithOldQuantity(...)` call at stockController.js:327 (or let StockMovement.create silently reject on a schema change) and re-run `npm test`: all 8 suites stay green. `POST /api/stock/adjust` with `{adjustment:-10, reason:'Damaged'}` still returns quantity 90 and oldQuantity 100, so every assertion passes while the append-only audit ledger — the only record of who removed the 10 units and why — writes nothing. Because the ledger is append-only and derived from nothing, the lost rows cannot be reconstructed after the fact.

### M46. errorHandler.js has zero coverage; six of eight suites mount no error middleware

- **Location:** `backend/src/middleware/errorHandler.js:1`
- **Lens:** test-gaps
- **Verified because:** `grep -rn "errorHandler|use((err|(err, req, res" backend/tests/` returns exactly three hits: sales.test.js:19 and service.test.js:109 (both inline stubs that only echo `err.statusCode`/`err.message`) and service.test.js:12 (an import of the real errorHandler that is never used — line 109 installs the stub instead). I read the app-construction blocks of auth/category/product/stock/supplier test files: each is `express()` + `express.json()` + one router, no error middleware. errorHandler.js's five mappings (CastError→404 at 10-13, code 11000→400 at 17-22, ValidationError→400 at 25-30, JsonWebTokenError→401 at 33-36, TokenExpiredError→401 at 38-41) are therefore never executed by any test. Downgraded from high, and I partially refute the stated mechanism: route-level `validate` (middleware/validate.js) and `handleValidationErrors` intercept malformed ObjectIds before Mongoose can throw CastError — product.test.js:290-296 asserts 400, not 404, for `/api/products/invalid-id` — so the fall-through window is narrower than claimed. I also refute 'zero throw/catch blocks': authController.js:151-184 has a try/catch. The gap is real as coverage, not as a live production fault (server.js:127 does mount errorHandler).
- **Failure scenario:** Change errorHandler.js:20 to emit a different duplicate-key message, or flip the 11000 branch to 409 — a change to the exact `{success:false,message}` shape the frontend's apiClient parses — and nothing fails: no test in the repo ever routes an error through errorHandler.js. Conversely, a controller path that raises a raw MongoServerError in one of the six suites returns Express's default HTML 500, so a test written to assert JSON error shape there would be measuring the stub, not production behavior.

### M47. cookie-parser is never mounted in any test app, so the production refresh-token path is unexercised

- **Location:** `backend/tests/auth.test.js:11`
- **Lens:** test-gaps
- **Verified because:** Confirmed line by line. auth.test.js:9-11 builds the app with only `express.json()` and the auth router; `grep -rn "cookie" backend/tests/` returns only set-cookie *header reads* (58, 236, 402-405, 448-451, 484-487), never a `cookieParser()` mount. authController.js:145 reads `req.cookies?.refreshToken || req.body?.refreshToken`; with no cookie-parser, `req.cookies` is always undefined in tests, so only the body fallback runs. All four refresh tests send the token in the body: lines 409, 420, 430, 462 — and 402-405 literally scrape the value out of the Set-Cookie header only to re-send it as JSON. Downgraded from high: this is test-fidelity only; server.js:18 does mount cookieParser in production and the fallback branch is genuinely exercised.
- **Failure scenario:** Remove `app.use(cookieParser())` from server.js:18, or rename the cookie at authController.js:21 from 'refreshToken' to anything else. Every browser client's silent refresh breaks — the frontend posts `{}` with `withCredentials:true` (apiClient.ts:128-132) and relies entirely on the cookie — yet all four refresh-token tests still pass, because they never present a cookie in the first place.

### M48. Both denial branches of checkBranchAccess are never executed

- **Location:** `backend/src/middleware/branchAccess.js:20`
- **Lens:** test-gaps
- **Verified because:** branchAccess.js:14-16 returns next() for admins before either check. The middleware guards exactly four routes: stockRoutes.js:131, stockRoutes.js:177, salesRoutes.js:90-94, branchRoutes.js:106. I grepped every test request to those paths: stock.test.js:377 and :389 use `Bearer ${adminToken}`, sales.test.js:801 uses `Bearer ${admin.token}`, and `/movements/branch/:branchId` and `/:id/stats` receive no request at all. So neither the 'User not assigned to any branch' error (line 20) nor 'Access denied to this branch' (line 24) is ever reached. Downgraded from high: the middleware is correct as written on the three `:branchId` routes; this is untested authorization, not a live leak (the `:id` mismatch is scored separately under claim 1).
- **Failure scenario:** Delete `checkBranchAccess` from stockRoutes.js:177 and re-run `npm test` — all suites pass, because the only test of that route authenticates as admin, for whom the middleware is a no-op. A salesperson assigned to branch A would then be able to call `GET /api/stock/branch/<B>` and read branch B's per-branch costPrice and sellingPrice for every product, with nothing in CI signalling the regression.

### M49. restockById and adjustById (PUT /api/stock/:id/restock and /:id/adjust) receive no test request

- **Location:** `backend/src/controllers/stockController.js:364`
- **Lens:** test-gaps
- **Verified because:** stockRoutes.js:203-210 wires PUT /:id/restock → stockController.js:364 restockById; stockRoutes.js:223-230 wires PUT /:id/adjust → stockController.js:418 adjustById. `grep -n "\.put(" backend/tests/stock.test.js` returns only lines 666, 682, 703, 719, all targeting `/api/stock/transfers/${transfer._id}`. Every restock/adjust test in the suite hits the POST product+branch variants (136-271, 508-565). So neither ID-based write path is ever exercised. Confirmed at medium.
- **Failure scenario:** restockByIdValidation (stockRoutes.js:58-63) uses `body('quantity').notEmpty().isInt({min:1})` with no `.toInt()`, and express-validator stringifies before validating, so the JSON body `{"quantity": "5"}` passes validation as a string. stockController.js:377 then executes `stock.quantity += quantity` → `100 + "5"` → `"1005"`, which Mongoose casts to the Number 1005. A single restock of 5 units silently inflates on-hand stock from 100 to 1005, and the ledger row written at :389 records quantity 905. The identical hazard exists at adjustById:429 (`Math.max(0, 100 + "5")` → 1005). No test issues a request to either route, so nothing catches it.

### M50. POST /api/auth/register-customer is entirely untested

- **Location:** `backend/src/routes/authRoutes.js:96`
- **Lens:** test-gaps
- **Verified because:** authRoutes.js:96 registers `router.post('/register-customer', customerRegisterValidation, registerCustomer)`; the controller is at authController.js:274 and exported at :340. `grep -rn "register-customer" backend/tests/` returns zero hits, and auth.test.js's registration describe block (line 37) covers only POST /api/auth/register. I confirmed the endpoint is live and load-bearing on the frontend: apiClient.ts:63 lists it as an auth endpoint, authService.ts:57-59 posts to it, and the public register page calls it via authStore.ts:97-104. I read the controller: it currently DOES hardcode `role: 'customer'` at authController.js:295 and ignores req.body.role, so there is no present escalation — the gap is coverage of that pin, not a live hole.
- **Failure scenario:** Change authController.js:290-297 to `role: role || 'customer'` (a one-word edit that would look innocuous next to register() at line 58, which does exactly that) and `npm test` stays fully green. An anonymous caller could then POST `{name, email, password, role:'admin'}` to the public /api/auth/register-customer endpoint and receive an admin access token in the 201 response, with no branch requirement.

### M51. Frontend has no test tooling of any kind; the axios refresh queue can leave promises permanently unsettled

- **Location:** `frontend/package.json:5`
- **Lens:** test-gaps
- **Verified because:** Confirmed. frontend/package.json scripts (5-10) are dev/build/start/lint with no `test`; devDependencies (23-33) contain no jest, vitest, @testing-library/*, or playwright; `find frontend/src -name '*.test.*' -o -name '*.spec.*'` returns nothing. Nine service modules sit under frontend/src/lib/services/ with zero coverage. I verified the deadlock in apiClient.ts: lines 113-122 register a subscriber and return a promise that settles ONLY via onTokenRefreshed (37-40). Both exit paths from the refresh block can skip it — the catch at 145-154 rejects without ever calling onTokenRefreshed, and if the `if` at 134 is false, control falls out of the try, the finally at 155 clears isRefreshing, and execution reaches line 160's `Promise.reject(error)` for the initiating request only. In both cases refreshSubscribers still holds the queued callbacks. I do refine the claim's trigger: with this backend, a 2xx-with-success:false is not reachable (ApiResponse.success always sets success:true), so the realistic triggers are a non-JSON/proxy 200 at the refresh URL, or the catch path.
- **Failure scenario:** Two components mount and fire requests concurrently with an expired access token. Both 401. Request A sets isRefreshing=true and calls POST /auth/refresh-token; request B hits line 113, subscribes, and returns a pending promise. The refresh cookie is also expired, so the POST returns 401 → the catch at 145 clears tokens, sets window.location.href='/login', and rejects A. onTokenRefreshed is never called, so B's promise never resolves or rejects — the axios 15s timeout at line 16 governs the HTTP call, not this promise. B's component stays in its loading state with no error path, and refreshSubscribers is never emptied. No test in the repo can catch this because no test infrastructure exists.

## LOW (47)

### L1. DELETE /api/sales/:id releases reserved stock without writing any StockMovement

- **Location:** `backend/src/controllers/salesController.js:471`
- **Lens:** data-integrity
- **Verified because:** Confirmed: deleteSalesOrder (449-489) releases each item's reservation at 471 and sets status 'cancelled' at 476-477 with no createMovementWithOldQuantity call anywhere in the function, while the PUT-status cancel path logs a sale_cancel movement at 363-368. Severity lowered from medium because, per finding #16, the row the DELETE path omits would itself carry no information (quantity 0, before == after) — the defect is inconsistency between two paths that cancel the same order, not lost data.
- **Failure scenario:** An admin cancels SO-2026-000251 via DELETE /api/sales/:id; a salesperson cancels SO-2026-000252 via PUT /api/sales/:id/status {status:'cancelled'}. GET /api/stock/movements shows a sale_cancel row for the second order and nothing at all for the first, so anyone reconciling cancellations against the movement log sees an apparent gap that is indistinguishable from the genuinely lost movement rows of finding #13.

### L2. Two incompatible transaction-number formats; the model's generator is dead code

- **Location:** `backend/src/models/Transaction.js:68`
- **Lens:** data-integrity
- **Verified because:** Confirmed: the pre-save hook builds TXN-<YYYYMM>-<6-digit seq> but is gated on `this.isNew && !this.transactionNumber` (64), and transactionNumber is required:true and supplied by all three call sites (salesController.js:332, serviceController.js:383 and 548) as TXN-<seq>-<last-6-ms>, so the hook never executes. Severity lowered from medium: nothing in the codebase reads or parses transactionNumber (grep shows Transaction is written at three sites and read nowhere), so the consequence today is confusion rather than a wrong result.
- **Failure scenario:** The database will only ever contain values like TXN-000251-483920 while the model documents TXN-202607-000251, so any future report or export that derives a period from the transaction number returns nothing. The controller-side generator also still reads countDocuments non-atomically: two Transactions created in the same millisecond produce the identical number and the second insert fails with a 400 from errorHandler after the order/stock work has already committed.

### L3. Product create/update never invalidates the cached category list that embeds productCount

- **Location:** `backend/src/controllers/productController.js:245`
- **Lens:** data-integrity
- **Verified because:** Confirmed: getCategories caches under CacheUtil.generateKey('categories','list',...) → 'cache:categories:list:...' (categoryController.js:28, 45) for CACHE_TTL.LONG = 3600s (constants.js:85) with the live productCount virtual populated (Category.js:64-69, no isActive filter). createProduct clears 'cache:products:*' and 'cache:category:*' (productController.js:200-201) — neither Redis pattern matches 'cache:categories:list:*' — and updateProduct (245-246) clears neither. categoryController's own mutations do clear 'cache:categories:*' (135, 185, 230), which confirms the intended pattern that product mutations skip. Severity lowered to low (self-healing stale read, only when Redis is connected), and one claimed case is WRONG: deleteProduct is a soft delete (266-268), so the Product document survives and productCount does not change.
- **Failure scenario:** With Redis connected, POST /api/products for a new brake-pad SKU, or PUT /api/products/:id moving a product from Brakes to Suspension, leaves GET /api/categories returning the pre-change productCount for up to an hour, and the re-categorisation additionally leaves both the old and the new 'cache:category:<id>' entries stale because updateProduct clears only 'cache:product:<id>'. The category screen and the product list disagree until the TTL expires.

### L4. restockProduct does find-then-create against the (product, branch) unique index with no duplicate handling

- **Location:** `backend/src/controllers/stockController.js:245`
- **Lens:** data-integrity
- **Verified because:** Confirmed: `let stock = await Stock.findOne({product, branch})` at 245 with Stock.create in the else branch at 264-276, against stockSchema.index({product:1,branch:1},{unique:true}) (Stock.js:71), and no try/catch or upsert — unlike createProduct which handles 11000 (productController.js:205-209). Severity dropped from medium to low and the consequence corrected: errorHandler.js:17-22 maps E11000 to a 400, and because Stock.create is the failing statement nothing is half-written and no movement row is orphaned — the loser's request is fully atomic and a retry succeeds down the update branch.
- **Failure scenario:** Two staff restocking the same product at the same branch for the very first time both find no record; the loser's Stock.create fails with E11000 and the API returns 400 'Product already exists' — a message that describes neither the operation nor the fix. The delivery is simply not recorded until someone notices and resubmits; the real cost is a misleading error on a race that an upsert would have merged.

### L5. Every cache:stock / cache:sales / cache:services invalidation is a no-op because nothing writes those prefixes

- **Location:** `backend/src/controllers/stockController.js:294`
- **Lens:** data-integrity
- **Verified because:** Confirmed by enumerating both sides: delPattern('cache:stock:*') at stockController.js:294, 338, 403, 445, 516, 646 and salesController.js:382, 481; 'cache:sales:*' at salesController.js:256, 381, 439, 480; 'cache:services:*' at serviceController.js:241, 294, 412, 501, 571, 605. Grep for every CacheUtil.set and cacheMiddleware call site shows the only keys ever written are cache:product(s):*, cache:category(ies):* and cache:branch(es):* — cacheMiddleware is mounted on exactly two routes, both in branchRoutes.js (90, 98), and no stock/sales/service GET is cached. Low is the right severity: dead code with a trap, no incorrect behaviour today.
- **Failure scenario:** Every stock, sales and service mutation issues a Redis KEYS scan that can never match anything. The trap is that the code reads as if stock/sales caching is already coherent, so whoever later adds cacheMiddleware('stock', ...) to a stock GET will inherit invalidation that is silently incomplete — deleteSalesOrder clears sales+stock, cancelServiceOrder clears only services, and createSalesOrder clears only sales even though it mutates reservedQuantity.

### L6. Four of six dashboard quick-action targets are routes that do not exist

- **Location:** `frontend/src/app/(protected)/dashboard/page.tsx:145`
- **Lens:** feature-completeness
- **Verified because:** Verified. hrefs are /inventory (line 145), /service-jobs (line 157), /inventory/new (line 171), /reports (line 181). Directory listing of frontend/src/app/(protected)/ is exactly: branches, categories, dashboard, products, sales, services, stock, suppliers, users, layout.tsx. No inventory/, service-jobs/, or reports/ exists anywhere under app/. Only /sales/new and /users resolve. Kept but downgraded from medium: with claim 6 in force these hrefs are inert strings, so there is no live failure today — this is latent breakage plus evidence that /reports is advertised vanity scope.
- **Failure scenario:** Whoever fixes the href bug in claim 6 by wrapping QuickAction in next/link will ship four tiles that render Next.js not-found: Check Inventory (→/inventory, the real page is /stock), Service Jobs (→/service-jobs, real page is /services/my-jobs), Add Product (→/inventory/new, real page is /products/new), View Reports (→/reports, which has neither a page nor any backend reporting endpoint). Three of the four are simple path typos; 'View Reports' points at a module that does not exist on either tier.

### L7. Self-service password change is wired on the frontend to an endpoint that does not exist

- **Location:** `frontend/src/lib/services/authService.ts:134`
- **Lens:** feature-completeness
- **Verified because:** Verified but over-rated. authService.changePassword POSTs '/auth/change-password' (authService.ts:134); authRoutes.js:95-104 registers only /register, /register-customer, /login, /refresh-token, /forgot-password, /reset-password, /logout, /me — no change-password. Grep for changePassword across frontend/src confirms every live call site resolves to userService.changePassword (useUsers.ts:126 → userService.ts:155 → PATCH /users/:id/password), and ChangePasswordModal.tsx:10 imports the schema from validators/user, leaving validators/auth.ts:87 unused. Downgraded from medium: the broken method is dead — nothing invokes it, so no user can trigger the 404 today — and authRoutes.js:99-100 provides a working forgot-password/reset-password path for staff who need a new password.
- **Failure scenario:** Concrete failure requires new code: the first developer who wires a /profile page to authService.changePassword ships a POST to /api/auth/change-password that falls through to the server.js:119 404 handler and surfaces as 'Route not found'. Today the observable gap is narrower — a salesperson or mechanic who wants to rotate their password has no in-app control and must go through the emailed reset-token flow, since PATCH /api/users/:id/password sits behind authorize('admin') at userRoutes.js:113.

### L8. withRoleGuard and withAuthGuard HOCs exist but are applied to zero pages

- **Location:** `frontend/src/middlewares/roleGuard.tsx:33`
- **Lens:** feature-completeness
- **Verified because:** The dead-code half is verified: grep for roleGuard/RoleGuard/authGuard/AuthGuard across frontend/src matches only the two definition files (roleGuard.tsx and authGuard.tsx), including their own JSDoc examples. app/(protected)/layout.tsx checks only isAuthenticated (lines 36-57) and never reads user.role. But the claim's headline consequence is REFUTED: users/page.tsx:124 has an inline `if (!currentUser || !isAdmin())` returning an access-denied Alert, and products/new/page.tsx:186 and products/[id]/edit/page.tsx:170 do the same — so /users specifically does NOT render the admin shell for a mechanic. Downgraded from medium to low: pages that matter most already self-gate; the residual issue is unused abstraction plus a handful of ungated pages.
- **Failure scenario:** A mechanic types /branches. The layout admits them, branches/page.tsx:26-27 only uses isAdmin() to hide create/edit buttons, and GET /api/branches is protect-only (branchRoutes.js:87-92), so they see the full branch directory with addresses, contacts and managers. On /stock the same mechanic gets the full page chrome — headers, filter controls, empty table — because stock/page.tsx has no role check, while GET /api/stock 403s at stockRoutes.js:85; the restriction surfaces only as an error toast.

### L9. Eleven constant groups in config/constants.js are exported and never imported anywhere

- **Location:** `backend/src/config/constants.js:52`
- **Lens:** feature-completeness
- **Verified because:** Verified. Every `from '../config/constants.js'` import in backend/src (17 sites) pulls only CACHE_TTL, USER_ROLES, PAGINATION, or CORS. ORDER_STATUS (8), SERVICE_STATUS (15), PAYMENT_METHODS (23), PAYMENT_STATUS (31), STOCK_TRANSFER_STATUS (38), SERVICE_PRIORITY (45), NOTIFICATION_TYPES (52), NOTIFICATION_CATEGORIES (59), EXPENSE_CATEGORIES (66), TRANSACTION_TYPES (75) and UPLOAD (95) have no importer. The drift is real and confirmed: TRANSACTION_TYPES (lines 75-80) lists SALE/REFUND/EXPENSE/TRANSFER and omits 'service', which Transaction.js:13 accepts and serviceController.js:387/552 actually writes. Downgraded from medium: because nothing imports them there is no reachable failure path — this is dead code and a maintenance trap.
- **Failure scenario:** No runtime failure today. The trap: a developer who wires the missing transactions endpoint (claim 1) and builds its type filter from TRANSACTION_TYPES will produce a filter with four options that silently excludes every service-revenue row, since 'service' is absent from the constant but present in the schema enum and in every service transaction written. NOTIFICATION_TYPES/CATEGORIES and EXPENSE_CATEGORIES have no model, controller, route or frontend module at all.

### L10. socket.io is a production dependency with zero imports

- **Location:** `backend/package.json:28`
- **Lens:** feature-completeness
- **Verified because:** Verified. backend/package.json:28 declares "socket.io": "^4.8.1" under dependencies. `grep -rn socket backend/src/` returns nothing (exit 1). server.js:141 calls plain `app.listen(PORT)` — no http.createServer, no io instance, no src/config/socket.js.
- **Failure scenario:** Every production install and container image pulls socket.io plus its engine.io/ws/socket.io-adapter/socket.io-parser tree for code that is never loaded — added image size, install time, and CVE-advisory noise for an unused package. README.md:161 'Real-time: Socket.io (ready for Phase 9)' overstates readiness: there is no HTTP server handle to attach io to, so Phase 9 starts by rewriting server.js's listen path anyway.

### L11. Transaction number pre-save hook is unreachable; both call sites generate a different, undocumented format

- **Location:** `backend/src/models/Transaction.js:63`
- **Lens:** feature-completeness
- **Verified because:** Verified. The hook at Transaction.js:63-71 fires only when `this.isNew && !this.transactionNumber` and emits TXN-YYYYMM-NNNNNN. All three creators pre-compute the field with a different scheme — salesController.js:330-332, serviceController.js:381-383 and serviceController.js:546-548 all build `TXN-${String(txnCount+1).padStart(6,'0')}-${Date.now().toString().slice(-6)}` and pass transactionNumber into create(). Since transactionNumber is `required: true` (line 8), no code path can reach the hook's body.
- **Failure scenario:** Every row in the transactions collection carries a number like TXN-000042-847391, never the TXN-202607-000042 form README.md:131 documents, so any future report grouping or sorting by transactionNumber prefix (year-month) silently fails. If someone later adds a creation path that omits the field, the hook produces a number from a different keyspace than the existing 3 call sites, and countDocuments-based sequences from both schemes will collide on the unique index at Transaction.js:7.

### L12. Refund, expense and transfer transaction types are declared but no code path ever creates them

- **Location:** `backend/src/models/Transaction.js:13`
- **Lens:** feature-completeness
- **Verified because:** Verified. Transaction.js:13 enum is ['sale','service','refund','expense','transfer']; the only Transaction.create() calls pass type:'sale' (salesController.js:336) or type:'service' (serviceController.js:387, 552). Transaction.js:35 lists reference.model 'Expense' but backend/src/models/ has no Expense.js. The 'refunded' unreachability is confirmed stronger than claimed: SalesOrder.js:118 declares the enum value, and the pre('save') hook at SalesOrder.js:189-199 unconditionally reassigns payment.status to pending/partial/paid on every save based on amountPaid, so no save can persist 'refunded'.
- **Failure scenario:** SalesOrder.payment.status can never hold 'refunded', which makes two live guards permanently dead: UpdatePaymentModal.tsx:100 (`isPaymentLocked = order.status === 'cancelled' || order.payment.status === 'refunded'`) and sales/[id]/page.tsx:136 both test a value the model cannot produce. Operationally there is no way to record a customer refund at all — no route, no controller branch, no status — so a refunded sale stays in the ledger as revenue.

### L13. Three of four stock-movement query hooks have no UI, and the admin movements ledger has no page

- **Location:** `frontend/src/hooks/useStock.ts:241`
- **Lens:** feature-completeness
- **Verified because:** Verified. useStock.ts defines useStockMovements (241), useStockMovementsByStock (256), useStockMovementsByProduct (273), useStockMovementsByBranch (290); a repo-wide grep for those four names in frontend/src returns the four definitions plus exactly one consumer — components/stock/StockHistoryModal.tsx:8/31 importing useStockMovementsByStock. Backend counterparts are live: stockRoutes.js:100-105 GET /movements (admin only), :118-125 /movements/product/:productId, :128-135 /movements/branch/:branchId.
- **Failure scenario:** An admin investigating 'where did 40 units of PROD-000012 go across all branches last month?' has no screen: the per-product ledger (GET /api/stock/movements/product/:id) and the global audit ledger (GET /api/stock/movements) both work over HTTP and both have finished React Query hooks, but no page or component renders either. The only movement history any user can see in the app is the per-stock-record modal reached from a single row on /stock.

### L14. Root discovery endpoint advertises every route without the /api prefix it is mounted under

- **Location:** `backend/src/server.js:104`
- **Lens:** feature-completeness
- **Verified because:** Confirmed with one correction to the evidence. server.js:104-114 returns endpoints { auth:'/auth', users:'/users', branches:'/branches', categories:'/categories', products:'/products', stock:'/stock', suppliers:'/suppliers', sales:'/sales', health:'/health' }, while server.js:79-87 mounts them at '/api/auth' … '/api/services'. The claim says the list 'omits /categories and /services' — /categories IS listed at line 108; only /services is missing. So: 8 wrong paths, 1 correct (health), 1 omitted module (services).
- **Failure scenario:** A client hitting GET / to discover the API is handed '/auth', '/users', '/branches', '/categories', '/products', '/stock', '/suppliers', '/sales'. Every one of those falls through the 9 mounted routers to the catch-all at server.js:119 and returns 404 {success:false,message:'Route not found'} — the correct paths all need the /api prefix. The same probe never learns that /api/services exists at all.

### L15. POST /stock/adjust and PUT /stock/:id/adjust return {stock,adjustment} but stockService types both as Stock

- **Location:** `frontend/src/lib/services/stockService.ts:135`
- **Lens:** frontend
- **Verified because:** The type mismatch is real: stockController.js:340-355 (adjustStock) and :447-464 (adjustById) both return `{ stock: populatedStock, adjustment: {...} }`, while stockService.adjust (:125-136) and adjustById (:143-154) declare ApiResponse<Stock> and return data.data. Downgraded from high to low because it is purely latent: useAdjustStock has zero call sites outside hooks/useStock.ts, and the only reachable path — stock/page.tsx:81 useAdjustStockById → handleAdjust at :215-224 — awaits mutateAsync and discards the return value. Nothing renders mutation.data today, and the `!data.data` guard does not throw since the wrapper object is truthy.
- **Failure scenario:** No user-visible failure today. The first component that reads the adjust mutation's result as a Stock — e.g. showing `Adjusted to {data.quantity} units` in a toast — will render 'undefined', because the actual payload is `{stock:{...}, adjustment:{...}}` and `quantity` lives one level down.

### L16. authService.changePassword targets POST /auth/change-password, which does not exist

- **Location:** `frontend/src/lib/services/authService.ts:134`
- **Lens:** frontend
- **Verified because:** The endpoint really is absent: authRoutes.js:95-104 defines only /register, /register-customer, /login, /refresh-token, /forgot-password, /reset-password, /logout and /me, and the only password-change route in the backend is the admin-only `router.patch('/:id/password', ...)` at userRoutes.js:129. Downgraded from medium to low because authService.changePassword has ZERO call sites — grep shows the admin flow (users/page.tsx:304 → ChangePasswordModal.tsx:33 → useUsers.ts:126) goes through userService.changePassword, which correctly targets PATCH /users/:id/password. utils/validators/auth.ts:87 changePasswordSchema is likewise unused (ChangePasswordModal imports the one from validators/user.ts).
- **Failure scenario:** Nothing 404s today because nothing calls it. The real gap is the missing feature: a signed-in salesperson or mechanic has no way to change their own password — the only path is asking an admin to reset it via PATCH /users/:id/password — and the first developer who wires the existing authService.changePassword + validators/auth.ts:87 schema into a form will ship a form that returns 404 from the Express fallback handler.

### L17. ServiceUser requires firstName/lastName, which exist nowhere in the backend

- **Location:** `frontend/src/types/service.ts:160`
- **Lens:** frontend
- **Verified because:** Confirmed. types/service.ts:158-165 declares firstName and lastName required and `name?` optional; grep for firstName/lastName across backend/src returns zero hits, models/User.js has a single `name` field, and every service populate is .populate('assignedTo','name email') (serviceController.js:115, 141, and the getMyJobs populate at :115). AssignMechanicModal.tsx:121 renders `{currentMechanic.firstName} {currentMechanic.lastName}` where currentMechanic is the populated assignedTo (:73-75). Downgraded from medium: purely a cosmetic string; getMechanicName (types/service.ts:492) reads `assignedTo.name` first, so every other display path is correct.
- **Failure scenario:** An admin opens the reassign modal on a job already assigned to 'Juan Dela Cruz'. The header correctly reads 'Reassign Mechanic', but the 'Current Mechanic' row reads literally 'undefined undefined', so the user cannot see who the job is currently assigned to before reassigning it.

### L18. productService.uploadImage/addImageByUrl declare ProductImage but the endpoints return the whole Product

- **Location:** `frontend/src/lib/services/productService.ts:124`
- **Lens:** frontend
- **Verified because:** Confirmed as a type-contract mismatch. productController.js:329 ends addProductImage with `ApiResponse.success(res, 201, 'Image uploaded successfully', product)` and :367 ends addProductImageUrl with the full populated product, while productService.ts:124 and :151 declare ApiResponse<ProductImage> and return data.data. Correctly rated as latent by the original agent: ProductImageEditor.tsx:95 does `await uploadMutation.mutateAsync(...)` then `onImagesChange?.()` and never touches the result, so nothing breaks today.
- **Failure scenario:** No user-visible failure now. Any code that trusts the declared type — e.g. `setPrimary(result._id)` after an upload to make the new image primary — would send the PRODUCT id where an image id is expected, and productController's deleteProductImage/setPrimary lookups by images.id() would silently find nothing.

### L19. GET /stock/low-stock is not paginated but the frontend types and calls it as if it were

- **Location:** `frontend/src/lib/services/stockService.ts:75`
- **Lens:** frontend
- **Verified because:** Confirmed but narrower than claimed. stockController.js:187-209 reads only `const { branch } = req.query`, runs Stock.find(query).sort({quantity:1}) with no skip/limit and returns ApiResponse.success, so no pagination key is ever emitted; stockService.getLowStock (:75-84) nevertheless declares PaginatedResponse<Stock> and forwards page/limit. Downgraded from medium because LowStockAlert.tsx — the component that passes `{ limit: maxItems }` — is never mounted anywhere (grep for LowStockAlert outside its own file returns only the barrel export at components/stock/index.ts:9). The only live caller is stock/page.tsx:77 useLowStock() with no params.
- **Failure scenario:** On /stock, useLowStock pulls EVERY low-stock row in the system — each with product, branch and supplier populated — purely to compute `lowStockArray?.length` for one stat card (stock/page.tsx:182); with 800 low rows that is a multi-hundred-KB payload per page visit. LowStockAlert.tsx:39 also reads `data.pagination?.total` for its 'View all N items' link, which is permanently undefined, so that link would never render if the component were ever mounted.

### L20. When token refresh fails, queued 401 requests are never settled or cleared

- **Location:** `frontend/src/lib/apiClient.ts:145`
- **Lens:** frontend
- **Verified because:** Confirmed by reading the interceptor. Lines 113-122 park concurrent 401s in `new Promise((resolve) => subscribeTokenRefresh(cb))` — resolve only, no reject and no timeout. onTokenRefreshed (:37-40) is the sole drain of refreshSubscribers and is called only on the success branch (:137). The catch at :145-154 does clearTokens(), sets window.location.href and rejects just the originating request; refreshSubscribers keeps its callbacks, and the `finally` at :155 only resets isRefreshing. Downgraded from medium to low: the full-page navigation on the same line almost always tears the page down before the hang is observable.
- **Failure scenario:** A protected page mounts three queries at once with an expired token and a missing refresh cookie. All three 401; the first drives the refresh and rejects, the other two are parked forever — their React Query entries stay isPending, spinners never stop and onError never fires. If the navigation to /login is slow or suppressed, the user stares at two permanent spinners. The stale callbacks also remain in refreshSubscribers for the module's lifetime.

### L21. A stale localStorage token on a public page hard-redirects the visitor to /login

- **Location:** `frontend/src/lib/apiClient.ts:151`
- **Lens:** frontend
- **Verified because:** Confirmed. AuthProvider is mounted in the root layout (app/layout.tsx:33-35), above BOTH route groups, so initialize() runs on the landing page, /login, /register, /forgot-password and /reset-password. authStore.initialize:160 branches on hasAccessToken(); an expired token takes it into authService.getProfile() → GET /auth/me, which is absent from AUTH_ENDPOINTS (apiClient.ts:60-67), so its 401 enters the refresh path, and with no valid refresh cookie the catch at :147-151 runs clearTokens() and window.location.href = '/login'. Downgraded to low: it needs the specific combination of a stale access_token and a dead refresh cookie.
- **Failure scenario:** A user clicks the emailed reset link and lands on /reset-password?token=abc123 with a months-old access_token still in localStorage. AuthProvider's initialize() runs, /auth/me 401s, the refresh fails, and the interceptor hard-navigates the document to /login — discarding the reset token in the URL and any password already typed. The user must request a fresh reset email.

### L22. initialize() has no in-flight guard and is invoked from two mounted components at once

- **Location:** `frontend/src/stores/authStore.ts:154`
- **Lens:** frontend
- **Verified because:** Confirmed. authStore.initialize begins with `if (get().isInitialized) return;` (:154) but only sets isInitialized in its finally (:192), after every await. AuthProvider.tsx:15-19 calls it in a mount effect, app/(protected)/layout.tsx:29-33 calls it in its own mount effect, and useAuth.ts:27-31 adds a third on any page using useAuth (e.g. stock/page.tsx:37). Child effects flush before parent effects in the same commit, so ProtectedLayout's call runs first and AuthProvider's still observes isInitialized === false. Downgraded from medium: the duplicate calls are idempotent server-side (authController.js:167 issues only a new access token and does not rotate the refresh token), so no session breakage.
- **Failure scenario:** Every cold load of a protected route sends GET /api/auth/me two or three times (and POST /auth/refresh-token the same number of times when it 401s). The first finally at :191-192 flips isLoading false and isInitialized true while the later calls are still awaiting, so ProtectedLayout's `if (!isInitialized || isLoading)` spinner guard (layout.tsx:43) can fall through mid-initialisation and briefly evaluate isAuthenticated before the in-flight profile fetch resolves.

### L23. Navbar links to /profile, which has no route

- **Location:** `frontend/src/components/layouts/Navbar.tsx:251`
- **Lens:** frontend
- **Verified because:** Confirmed. Navbar.tsx has `href="/profile"` at line 251 (desktop account dropdown) and again at line 336 (mobile menu). `find frontend/src/app -ipath "*profile*"` returns nothing — the (protected) group contains only branches, categories, dashboard, products, sales, services, stock and users.
- **Failure scenario:** Any authenticated user opens the avatar dropdown and clicks 'Profile Settings' and gets the Next.js 404 page, losing the navbar shell (the not-found renders from the root layout, outside the (protected) layout) — they have to use the browser Back button to return to the app.

### L24. apiClient redirects with ?error=account_deactivated but the login page never reads it

- **Location:** `frontend/src/lib/apiClient.ts:96`
- **Lens:** frontend
- **Verified because:** Confirmed. apiClient.ts:90-97 sets window.location.href = '/login?error=account_deactivated' on a 403 whose message contains 'deactivated' or 'account has been disabled'. login.tsx reads only searchParams.get('redirect') at :22; the sole Alert (:92-96) is bound to `error` from the auth store, which is null on a fresh document load since the store is recreated by the full navigation.
- **Failure scenario:** An admin deactivates a salesperson mid-session. The salesperson's next request 403s, the tab hard-navigates to /login?error=account_deactivated, and the page renders a clean login form with no message. They retype their password, get the generic 'Invalid credentials'-style store error, and file a 'my password stopped working' ticket for an intentional deactivation.

### L25. ProtectedLayout redirects to /login without the redirect param, so post-login always lands on /dashboard

- **Location:** `frontend/src/app/(protected)/layout.tsx:38`
- **Lens:** frontend
- **Verified because:** Confirmed. layout.tsx:36-40 does `router.push('/login')` with no query string. The only code that preserves the destination is middlewares/authGuard.tsx:37-39 (searchParams.set('redirect', pathname)), which has zero call sites. login.tsx:22 falls back to '/dashboard' whenever `redirect` is absent.
- **Failure scenario:** A salesperson opens a shared link to /sales/68f.../invoice after their session expired. ProtectedLayout bounces them to /login with no redirect param; after signing in they land on /dashboard and must locate the order again by hand — the invoice URL is gone from the address bar.

### L26. PaginationInfo declares hasNextPage/hasPrevPage as required but ApiResponse.paginate never emits them

- **Location:** `frontend/src/types/api.ts:18`
- **Lens:** frontend
- **Verified because:** Confirmed. types/api.ts:13-20 makes hasNextPage and hasPrevPage required on PaginationInfo, while backend/src/utils/apiResponse.js:55-65 builds pagination with exactly four keys: page, limit, total, pages. grep shows the only occurrences of those two names in the frontend are the type declaration and userService.ts:38-39, which hard-codes them to false in a fallback object that is only used when data.pagination is entirely missing.
- **Failure scenario:** No component reads them today, so nothing breaks yet. The type actively invites the bug: a developer writing `disabled={!pagination.hasNextPage}` on a paginated table gets undefined → falsy → a Next button that is permanently disabled on every page including page 1 of 10. users/page.tsx:259-278 sidesteps it only because it compares `page === pagination.pages` instead.

### L27. MyJobsParams.priority is sent but GET /services/my-jobs ignores it

- **Location:** `frontend/src/types/service.ts:317`
- **Lens:** frontend
- **Verified because:** Confirmed. serviceController.js:96-105 (getMyJobs) destructures only `{ status, page = 1, limit = 20 }` and builds the query from assignedTo + status; priority is never read (the priority handling at serviceController.js:50 belongs to getServiceOrders, a different handler). services/my-jobs/page.tsx:88 does `if (selectedPriority) p.priority = selectedPriority` and passes the params straight into useMyJobs (useServices.ts:47-53), which forwards them as query params. The page does no client-side priority filtering — jobs come straight from jobsData.data (:105).
- **Failure scenario:** A mechanic on /services/my-jobs clicks the 'Urgent' priority filter. The query key changes, the list refetches, the filter chip highlights — and the identical set of jobs comes back, including 'low' and 'normal' ones. The mechanic believes they are looking at only urgent work.

### L28. UpdateStatusModal collects a Notes field that is never sent

- **Location:** `frontend/src/components/sales/UpdateStatusModal.tsx:50`
- **Lens:** frontend
- **Verified because:** Confirmed. The modal renders a labelled textarea bound to the `notes` state at :153-160 with placeholder 'Add notes about this status change...', but handleSubmit at :48-52 posts `payload: { status: selectedStatus }` only, and both handleSubmit (:57) and handleClose (:67) call setNotes(''). types/sales.ts UpdateOrderStatusPayload has no notes field, and salesController.js:273 reads only `const { status } = req.body`.
- **Failure scenario:** A salesperson cancelling SO-00042 types 'Customer changed mind, called 3pm' into the Notes box and clicks Update. The status changes, the modal closes with no warning, and the explanation is discarded client-side — the order's history retains only the status transition with no reason attached anywhere.

### L29. UsersPage fires the admin-only users query before its own admin check

- **Location:** `frontend/src/app/(protected)/users/page.tsx:58`
- **Lens:** frontend
- **Verified because:** Confirmed. users/page.tsx:58 calls useUsers(queryParams) unconditionally at the top of the component, while the role gate is a render-time early return at :124-132. useUsers (hooks/useUsers.ts:27-33) passes no `enabled` option, so the query runs on mount for every role. Correctly rated low by the original agent — userRoutes.js:113 authorize('admin') means no data is exposed.
- **Failure scenario:** A mechanic navigates to /users. GET /api/users is issued on mount and 403s, then retries once (QueryProvider.tsx:22 retry:1) for two rejected authenticated requests per visit, before the render-time gate paints the 'You do not have permission' Alert. The gate is cosmetic; only moving the check into `enabled` would stop the call.

### L30. seedBranches.js self-executes on import and unconditionally deletes every Branch document

- **Location:** `backend/src/utils/seedBranches.js:121`
- **Lens:** ops-config
- **Verified because:** Verified. Line 121 is a bare top-level `seedBranches();` with no `import.meta.url` main-module guard, no NODE_ENV check and no prompt. The function opens its own connection at line 99 with whatever MONGODB_URI is in the environment, runs `await Branch.deleteMany({})` at 103, and process.exit()s at 114/118. A grep for 'seed' across backend/src returns matches only inside seedBranches.js itself, and backend/package.json:6-12 has no script referencing it. Downgraded from high to low: there is no reachable code path — nothing imports it and no barrel/index exists in src/utils — so it fires only on a deliberate manual `node src/utils/seedBranches.js`, which is also its intended purpose. The gap is the absence of guards on a destructive hand-run script, not an accident waiting in the request path.
- **Failure scenario:** A developer with backend/.env temporarily pointed at the production Atlas cluster (a common state while debugging prod data) runs `node src/utils/seedBranches.js` to reset their local branches. It connects to production, deletes every Branch document, inserts the three hardcoded demo branches with new ObjectIds, and exits 0 with a green checkmark. Every User with role salesperson or mechanic now holds a `branch` ObjectId that no longer resolves, and models/User.js:35-42 makes branch required for those roles, so their next profile save fails validation. Stock rows keyed on the deleted branch ids are orphaned with no cascade.

### L31. app.listen errors are unhandled and escape startServer's try/catch

- **Location:** `backend/src/server.js:141`
- **Lens:** ops-config
- **Verified because:** Verified on the mechanism, but the stated consequence is wrong. server.js:141 calls app.listen(PORT, cb) with no `.on('error')`; listen failures are emitted asynchronously on the returned net.Server, so the `catch (error)` at 144-147 cannot observe them and Node's default for an unhandled 'error' event is to throw. REFUTED: 'no actionable log line naming the port' — Node's own message is `Error: listen EADDRINUSE: address already in use :::5000`, which names both the cause and the port. Downgraded from medium to low: the real delta is the crash shape, not diagnosability.
- **Failure scenario:** Start a second instance while port 5000 is already bound. connectDB and connectRedis both succeed first (server.js:135-138), then app.listen emits EADDRINUSE. Because there is no listener, it surfaces as an uncaught exception with a raw stack instead of the intended `console.error('Failed to start server:', error)` + `process.exit(1)` path at 145-146, and the Mongo pool and Redis client opened moments earlier are torn down abruptly rather than closed.

### L32. CORS responses omit Vary: Origin

- **Location:** `backend/src/server.js:51`
- **Lens:** ops-config
- **Verified because:** Verified. Lines 51-53 echo the request Origin into Access-Control-Allow-Origin when it is in the allowlist, making the response body's headers origin-dependent, and no line in server.js sets a Vary header (I read the whole file). Downgraded from medium to low: this is a latent correctness bug, not an active one — there is no CDN, reverse proxy or cache configuration anywhere in the repo (no Dockerfile, nginx config, vercel.json or render.yaml), so no shared cache currently sits in front of the API to exhibit it.
- **Failure scenario:** Put a CDN or nginx proxy_cache in front of the API with two entries in CORS_ALLOWED_ORIGINS (e.g. https://app.example.com and https://staging.example.com). A GET /api/branches from staging is cached along with its `Access-Control-Allow-Origin: https://staging.example.com` header. The next request from the production frontend receives that cached response, the browser sees an ACAO that does not match its origin, and the fetch fails. Which origin wins depends on which one warmed the cache entry, so the failure is intermittent and flips on every cache eviction.

### L33. CORS_ALLOWED_ORIGINS is split on comma with no trim, silently breaking on spaced lists

- **Location:** `backend/src/config/constants.js:103`
- **Lens:** ops-config
- **Verified because:** Verified. constants.js:102-104 is `process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [process.env.CLIENT_URL || 'http://localhost:3000']` — no .map(s => s.trim()) and no .filter(Boolean). server.js:51 matches with `CORS.ALLOWED_ORIGINS.includes(origin)`, an exact string comparison against req.headers.origin, which browsers always send with no surrounding whitespace. Downgraded from medium to low: it only bites when the operator writes the list with spaces, and the first entry always works, so a single-origin deployment is unaffected.
- **Failure scenario:** Set CORS_ALLOWED_ORIGINS="https://app.example.com, https://admin.example.com" (the natural spacing, and what most hosting dashboards will not strip). ALLOWED_ORIGINS becomes ['https://app.example.com', ' https://admin.example.com'] with a leading space on the second. Requests from https://app.example.com work; every request from https://admin.example.com fails the includes() check at server.js:51, gets no Access-Control-Allow-Origin, and is blocked by the browser. There is no warning, no log line, and the dashboard value looks exactly right — only the admin frontend is dead.

### L34. Redis connection log prints hardcoded localhost regardless of the actual target

- **Location:** `backend/src/config/redis.js:30`
- **Lens:** ops-config
- **Verified because:** Verified. redis.js:30 logs `Redis Connected: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` while the client at line 8 is built solely from `process.env.REDIS_URL || 'redis://localhost:6379'`. A grep for REDIS_HOST|REDIS_PORT across backend/src returns exactly this one line, so neither variable influences anything. Downgraded from medium to low: it is a purely cosmetic log defect with no behavioural effect.
- **Failure scenario:** Deploy with REDIS_URL=rediss://default:…@fly-redis-eu.upstash.io:6379 and no REDIS_HOST/REDIS_PORT set. The boot log reads 'Redis Connected: localhost:6379'. During a cache incident the operator greps the logs, sees a localhost connection, and spends time checking for a local redis-server that does not exist rather than the managed instance the app is actually talking to.

### L35. process.cwd()-relative upload paths make behaviour depend on the launch directory

- **Location:** `backend/src/server.js:21`
- **Lens:** ops-config
- **Verified because:** Verified. server.js:21 is `express.static(path.join(process.cwd(), 'uploads'))` and imageUpload.js:18 is `path.join(process.cwd(), 'uploads', 'products')`; neither derives from import.meta.url or fileURLToPath. backend/package.json:7 defines start as `node src/server.js`, which resolves correctly only when cwd is backend/. Downgraded from medium to low: the documented start script is correct and the mistake requires deviating from it.
- **Failure scenario:** Run `node backend/src/server.js` from the repo root (a PM2 cwd default, a systemd unit without WorkingDirectory, or a Dockerfile whose WORKDIR is the repo root). process.cwd() is the repo root, so the mkdir at imageUpload.js:19-26 silently creates <repo-root>/uploads/products and express.static serves <repo-root>/uploads. Newly uploaded images land there and work; every existing image under backend/uploads/products 404s. Nothing errors, nothing logs — the mkdir succeeds against the wrong path — so the only symptom is that older products lose their images.

### L36. errorHandler logs full error objects for expected 4xx, with no redaction

- **Location:** `backend/src/middleware/errorHandler.js:7`
- **Lens:** ops-config
- **Verified because:** Verified. `console.error('Error:', err)` is at line 7, unconditional and ahead of all classification (10-41), so it fires for every error the handler subsequently converts to a 401, 404 or 400 as well as for genuine 500s. Node's console.error on an Error prints the stack, and on a Mongoose ValidationError it prints the nested `errors[field]` objects including their `value` property; a MongoServerError E11000 prints `keyValue` with the submitted value. Low is correct.
- **Failure scenario:** A user with an expired access token hits any protected route; middleware/auth.js:13 throws TokenExpiredError, which errorHandler line 7 dumps as a full stack at error level before line 38-41 converts it into a routine 401. Because access tokens expire on a fixed schedule for every logged-in user, normal traffic produces a steady stream of error-level stack traces, so error-rate alerting and log-volume budgets are dominated by non-events. Separately, a unique-index collision on User.email writes `keyValue: { email: 'someone@example.com' }` into stdout, putting a customer address in plaintext in the log aggregator.

### L37. CORS_CREDENTIALS and REDIS_PASSWORD are configured but never read

- **Location:** `backend/src/config/constants.js:115`
- **Lens:** ops-config
- **Verified because:** Confirmed on the code side; one premise I could not check. constants.js:115 hardcodes `CREDENTIALS: true`, consumed at server.js:58, and a grep for CORS_CREDENTIALS across backend/src returns no matches. redis.js:7-9 builds the client from `url` alone and a grep for REDIS_PASSWORD across backend/src likewise returns nothing. I was denied read access to backend/.env, so I cannot verify those two keys are actually present there — but README.md:386-388 documents REDIS_HOST, REDIS_PORT and REDIS_PASSWORD as backend configuration, which establishes the gap independently: documented knobs that no code path reads. Low is correct.
- **Failure scenario:** An operator following README.md:386-388 sets REDIS_PASSWORD=<secret> and leaves REDIS_URL at its default. redis.js:8 ignores the password entirely and connects to redis://localhost:6379, so an auth-required server rejects with NOAUTH, connect() throws, and the catch at 33-38 leaves redisClient non-null (see the redis.js:33 finding) — producing a per-request stream of ClientClosedError logs instead of the clean no-Redis fallback. Likewise, setting CORS_CREDENTIALS=false to stop credentialed cross-origin requests has no effect: server.js:58 keeps emitting Access-Control-Allow-Credentials: true.

### L38. No Node version pinning and no deployment configuration of any kind

- **Location:** `backend/package.json:1`
- **Lens:** ops-config
- **Verified because:** Verified. Neither backend/package.json (read in full, 42 lines) nor frontend/package.json (34 lines) declares an engines field. `ls -a` on the repo root, backend/ and frontend/ shows no Dockerfile, Procfile, .nvmrc, vercel.json, render.yaml or any .toml, and `git ls-files | grep -iE 'Dockerfile|Procfile|nvmrc|vercel|render|\.ya?ml'` returns only frontend/public/vercel.svg. The backend is "type": "module" on Express ^5.1.0 and Mongoose ^8.19.3; the frontend is next 16.1.2 / react 19.2.3 with reactCompiler: true (next.config.ts:7). Low is correct — this bites on first deploy to a new host, not in steady state.
- **Failure scenario:** Deploy to a host whose default runtime is Node 18. Next 16 requires Node 20.9+; the build fails partway through with a syntax or API error that never mentions the Node version, and the operator has nothing in the repo to compare against. Recovering the working configuration means reconstructing it from the hosting dashboard, and git history shows a vercel.json was added (commit 6a8c8e9) and then removed (dbd2590/b3533f2) with no replacement committed, so even the last known-good deploy shape is not recorded anywhere.

### L39. checkBranchAccess is mounted on a route whose param is `:id`, so the guard always evaluates undefined

- **Location:** `backend/src/middleware/branchAccess.js:10`
- **Lens:** security-authz
- **Verified because:** branchAccess.js:10 reads `const { branchId } = req.params` and line 23 compares `user.branch.toString() !== branchId`. branchRoutes.js:102-108 mounts it as `router.get('/:id/stats', protect, branchIdValidation, checkBranchAccess, getBranchStats)` where branchRoutes.js:20-25 defines branchIdValidation on `param('id')` — the route has no `:branchId` segment, so `req.params.branchId` is `undefined` on every request. For a non-admin with a branch the comparison is `'<24-hex>' !== undefined` -> true -> hard 403; for a customer, line 19-21 returns 403 first. I enumerated all four call sites (Grep for checkBranchAccess): salesRoutes.js:94, stockRoutes.js:131 and stockRoutes.js:177 all sit on `:branchId` routes and work correctly; branchRoutes.js:106 is the only broken one. Severity lowered from medium to low: the failure is fail-closed (403, no data leaks), and frontend/src/app/(protected)/branches/[id]/page.tsx:42-45 only calls useBranchStats when `showAdminActions` is true, so no real user currently hits the broken path.
- **Failure scenario:** Any non-admin calling GET /api/branches/<their own branch id>/stats directly gets 403 'Access denied to this branch' instead of their own branch's stats — the endpoint is unreachable for salespersons and mechanics. The residual risk is latent: the guard is a no-op comparison, so anyone who 'fixes' the 403 by deleting the middleware line rather than renaming the route param to `:branchId` silently turns the endpoint into an unscoped, any-branch stats read.

### L40. Mechanics bypass the 'own jobs only' clamp on GET /api/services via the assignedTo query param

- **Location:** `backend/src/controllers/serviceController.js:40`
- **Lens:** security-authz
- **Verified because:** serviceController.js:40-44 reads exactly as claimed: `if (req.user.role === 'mechanic' && !assignedTo) { query.assignedTo = req.user._id; } else if (assignedTo) { query.assignedTo = assignedTo; }` — supplying any truthy `assignedTo` suppresses the clamp. serviceRoutes.js:42-46 attaches no validator. HOWEVER I refute two parts of the claim: (a) `?assignedTo[$ne]=...` does NOT inject a Mongo operator — I ran `require('express')().get('query parser')` against the installed express 5.2.1 and it returns 'simple' (querystring.parse), so that produces the literal key `assignedTo[$ne]` and leaves `req.query.assignedTo` undefined, which re-arms the clamp; (b) the mechanic does not see 'every service order' unbounded — serviceController.js:33-34 still forces `query.branch = req.user.branch` for non-admins. Severity lowered from medium to low because exploitation needs another mechanic's user `_id`, and no endpoint a mechanic can call exposes one (userRoutes.js:112-113 makes the whole /api/users router admin-only, and getServiceOrder 403s before returning foreign orders).
- **Failure scenario:** A mechanic who obtains a co-worker's user _id — from a shared screen, a previously-assigned-then-reassigned order, or by walking the ObjectId counter near their own id, which is cheap because there is no rate limiting — sends GET /api/services?assignedTo=<that id> and receives that mechanic's full job list for their branch: customer name, phone, address, vehicle details, diagnosis and payment status. The per-order handler getServiceOrder explicitly forbids exactly this (serviceController.js:151-153 returns 403 for a mechanic not assigned to the order), so the list endpoint contradicts the detail endpoint's own access rule.

### L41. User enumeration through differing status codes on the public auth endpoints

- **Location:** `backend/src/controllers/authController.js:217`
- **Lens:** security-authz
- **Verified because:** All four behaviours verified. forgotPassword returns 404 'User not found' for an unknown email (authController.js:217-219) versus 200 'Password reset token generated' for a known one (227-229). registerCustomer returns 400 'An account with this email already exists' (286) and register returns 400 'User already exists' (50). login checks `if (!user.isActive) return 401 'Account is deactivated'` at authController.js:106-108, which is before `await user.comparePassword(password)` at line 111 — so a deactivated account is identified without any valid password. login is otherwise correct: identical 401 'Invalid credentials' at lines 102 and 114 for unknown-user and wrong-password.
- **Failure scenario:** An attacker submits one POST /api/auth/forgot-password per address from a harvested employee list; a 200 confirms the address is a real account and a 404 rules it out, at whatever rate they choose since nothing throttles it. A second pass of POST /api/auth/login with a junk password separates active accounts (401 'Invalid credentials') from deactivated ones (401 'Account is deactivated') with no password knowledge. Because that same forgot-password 200 also carries the usable resetToken, the enumeration pass and the takeover pass are literally the same request.

### L42. Three service-order mutation routes have no request validation

- **Location:** `backend/src/routes/serviceRoutes.js:99`
- **Lens:** security-authz
- **Verified because:** serviceRoutes.js:99-103 (PUT /:id/assign), 110-114 (PUT /:id/status) and 121-125 (PUT /:id/parts) are declared as `authorize(...)` plus the controller only — no validation chain, no validationHandler — unlike POST / at lines 86-92 which runs createServiceValidation + validationHandler. The handlers use the raw values: serviceController.js:257 `const { mechanicId } = req.body` then 270 `await User.findById(mechanicId)`; serviceController.js:432 `const { partsUsed } = req.body` then 459 `for (const part of partsUsed)` with no Array.isArray guard. I correct two details in the claim: (a) a CastError does NOT produce a 500 — errorHandler.js:10-13 maps `err.name === 'CastError'` to 404 'Resource not found', so `{mechanicId:'notanid'}` yields a misleading 404, not a crash; (b) `{mechanicId:{$ne:null}}` does not reach the query builder as an operator — findById casts to ObjectId and throws CastError, so it is also a 404, not NoSQL injection. Severity kept at low.
- **Failure scenario:** PUT /api/services/<valid order id>/parts with body `{}` (or `{"partsUsed":"x"}`) reaches serviceController.js:459 and throws TypeError 'partsUsed is not iterable'; asyncHandler forwards it to errorHandler.js, which has no matching branch, so line 43 returns HTTP 500 with the raw JS message in the body — and the stack trace too when NODE_ENV=development (errorHandler.js:46). PUT /api/services/<id>/assign with `{"mechanicId":"notanid"}` returns 404 'Resource not found', which is indistinguishable from 'order does not exist' and gives the operator no usable error.

### L43. POST /api/products/:id/images and all of imageUpload.js are never exercised by a request

- **Location:** `backend/src/routes/productRoutes.js:280`
- **Lens:** test-gaps
- **Verified because:** productRoutes.js:279-288 defines POST /:id/images with the chain `uploadSingleImage, handleUploadError, processImage, addProductImage`. `grep -n "images" backend/tests/product.test.js` returns only `/images/url` POSTs (554, 575, 594, 603, 614) and `/images/:imageId` DELETEs (635, 650, 666) — i.e. only addProductImageUrl and deleteProductImage. So the multer fileFilter allowlist (imageUpload.js:32-38), the 5MB limit (imageUpload.js:44-46), the sharp re-encode (69-78), uuid naming (65), and handleUploadError (141-163) never run under test. Downgraded from medium to low, and I correct one detail: imageUpload.js IS loaded at import time (product.test.js imports productRoutes.js, which imports it, so the mkdirSync at line 19-22 runs) — it is only the request path that is untested. The route is also `authorize(USER_ROLES.ADMIN)`, so any regression requires an authenticated admin to trigger.
- **Failure scenario:** Widen IMAGE_CONFIG.ALLOWED_TYPES at imageUpload.js:10 to include 'application/octet-stream', or raise MAX_FILE_SIZE at :9, and `npm test` reports no change. An admin (or a compromised admin session) could then upload arbitrary non-image payloads or exhaust disk on the live `backend/uploads/products` directory that git status shows already exists in this working copy.

### L44. cacheMiddleware has zero coverage and is structurally untestable in the current suites

- **Location:** `backend/src/middleware/cache.js:27`
- **Lens:** test-gaps
- **Verified because:** Coverage claim confirmed: cacheMiddleware is applied on exactly two routes, branchRoutes.js:90 and :98 — both in branch.test.js, the one suite that issues no HTTP requests at all — and `grep -rni "cacheutil|cachemiddleware|redis" backend/tests/` returns zero hits. But I refute the stated consequence. (a) On both routes the middleware sits AFTER `protect` (and after branchIdValidation on :98), so a cache HIT does not bypass authentication; and getBranches (branchController.js:13-79) / getBranch (:86-98) perform no per-user filtering, so there is no authorization to bypass and the cache key needs no user component. (b) `res.json(cachedData)` at line 29 emits 200 by default and the only entries cached are 200 responses (guarded at 40), so the 'whatever status is current' concern is not constructible. (c) Note also that getBranches does its own independent CacheUtil get/set at branchController.js:35-69, so the middleware layer is partly redundant. Downgraded to low: real coverage gap, no demonstrable defect.
- **Failure scenario:** Break the res.json monkey-patch at cache.js:38-46 — e.g. forget `originalJson(data)` at line 45 so every GET /api/branches hangs until the 15s client timeout — and `npm test` still reports 8 suites green, because branch.test.js never issues a request and the other seven suites never mount the middleware. Adding a branch HTTP test alone would still not cover the HIT path, since CacheUtil no-ops with Redis absent under test.

### L45. PUT /api/sales/:id/payment tests assert only the response body, never Transaction or a re-read order

- **Location:** `backend/tests/sales.test.js:566`
- **Lens:** test-gaps
- **Verified because:** Read sales.test.js:547-610. The two success tests assert only `res.body.data.payment.amountPaid/status/change/paidAt` (566-570) and `.payment.method` (590). Neither re-queries SalesOrder nor Transaction, even though Transaction is imported at line 7 and asserted in the create-then-complete flow. updateSalesOrderPayment (salesController.js:405-442) creates no Transaction, unlike updateSalesOrderStatus (salesController.js:328-347). Downgraded from medium to low, and I refute the 'double-books' half of the consequence: Transaction.create at :334 fires only on the transition into 'completed', and validTransitions at :287-292 makes 'completed' terminal with no outgoing edges, so a second booking is not reachable. Only the 'skips' half is constructible.
- **Failure scenario:** Create an order with total 336 and amountPaid 100 (status 'partial'), settle it via `PUT /api/sales/:id/payment` with `{amountPaid:500}`, then complete it via `PUT /api/sales/:id/status` with `{status:'completed'}`. Whether the SalesOrder pre-save hook actually flipped `payment.status` to 'paid' decides, at salesController.js:328, whether a Transaction row is written at all. If that hook regresses, the order completes, stock is deducted, movements are logged — and the revenue Transaction is silently skipped. No test walks this two-step path; the only Transaction assertions (sales.test.js:397, 918-980) use orders already fully paid at creation.

### L46. Filter/scoping assertions in service.test.js pass vacuously on an empty result set

- **Location:** `backend/tests/service.test.js:750`
- **Lens:** test-gaps
- **Verified because:** Confirmed for three of the four cited spots, not four. Reading 719-790: line 750 (`data.every(order => order.status === 'pending')`), 766 (`priority === 'urgent'`), and 786-788 (mechanic1 assignedTo scoping) are each the sole content assertion in their test, with no length guard — and `[].every(fn)` is `true`. The claim's fourth item is WRONG: the /my-jobs test at 792-811 IS guarded by `expect(res.body.data.length).toBeGreaterThan(0)` at line 807, immediately before the `.every()` at 808-810, so that one cannot pass vacuously. The comparison to sibling suites checks out (sales.test.js:674 toHaveLength(2), category.test.js:115, supplier.test.js:276). Severity low as claimed.
- **Failure scenario:** Rename the status filter field in getServiceOrders (or break the query so `GET /api/services?status=pending` returns `{data: []}` with a 200). service.test.js:749 still passes (status 200) and 750 still passes (`[].every(...)` === true). The same holds for the priority filter at 766 and, most importantly, the mechanic-scoping test at 786-788 — which would report that mechanic scoping works while actually proving that mechanic1 sees nothing at all.

### L47. ownBranchOnly is exported but referenced nowhere in src or tests

- **Location:** `backend/src/middleware/branchAccess.js:34`
- **Lens:** test-gaps
- **Verified because:** `grep -rn "ownBranchOnly" backend/src backend/tests` returns exactly two lines: the definition at branchAccess.js:34 and the export at :46. No route file imports it; every route that needs branch scoping imports only checkBranchAccess (branchRoutes.js:12, stockRoutes.js:7, salesRoutes.js). Confirmed as dead code. Severity low — this is unused code, not a defect, and it is arguably outside the test-gaps lens.
- **Failure scenario:** Nothing fails today. The concrete risk is on first use: a developer wiring `ownBranchOnly` onto a new branch-scoped route gets a middleware that has never run in production or in any test, and whose semantics differ from checkBranchAccess — it never compares against a requested branch id at all, it only sets `req.userBranch` (line 42) and 403s branchless non-admins (37-39). A route guarded with it would let any non-admin with a branch reach data for any other branch unless the controller independently filters on req.userBranch.

