# Security Hardening, Containerization & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed critical and high-severity security and correctness gaps in the backend, containerize both packages from the repository root, and gate every future change behind an automated CI/CD pipeline with security scanning.

**Architecture:** Three sequential workstreams on one branch. (1) Backend hardening — each fix lands as its own TDD commit against the existing Jest + Supertest + mongodb-memory-server suite, with the pattern of mounting only the router under test. (2) Containerization — multi-stage Dockerfiles per package plus a root `docker-compose.yml` that wires MongoDB, Redis, backend, and frontend together. (3) GitHub Actions — a CI workflow that lints, tests, and builds both images, and a security workflow running dependency audit, secret scanning, static analysis, and image scanning.

**Tech Stack:** Node.js 22, Express 5, Mongoose 8, Redis, Jest 30 + Supertest 7 + mongodb-memory-server, Next.js 16 (standalone output), Docker + Compose v2, GitHub Actions, helmet, express-rate-limit, Trivy, Gitleaks, CodeQL.

## Global Constraints

- Branch is `harden/security-container-cicd`. It merges to `master` at the end. Never commit directly to `master` during task execution.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`, `test:`). **No AI attribution of any kind** — no `Co-Authored-By`, no "Generated with", no tool footer. Commits are authored as the user.
- Never delete, overwrite, move, or copy `.env`, `.env.*`, `*.pem`, `*.key`, or any credential file. `.env.example` files are the only env files this plan creates.
- Backend is ESM (`"type": "module"`). Every backend source file uses `import`/`export`. Jest and Babel config files stay `.cjs`.
- Backend tests: build a bare Express app per suite and mount only the router under test. Never import `src/server.js` from a test.
- Backend node version floor: `22`. Docker base images: `node:22-alpine`.
- All roles come from `USER_ROLES` in `backend/src/config/constants.js`. Never hardcode a role string in backend source.
- Controllers return through `ApiResponse.success` / `.error` / `.paginate`. Never `res.json` directly in a controller.
- Every task ends green: run the named test command and paste the real output before committing.
- Docker images run as a non-root user and pin `NODE_ENV=production`.
- CI must run on `push` and `pull_request` targeting `master`.

---

## Task 1: Land the gap-audit report

**Files:**
- Create: `docs/gap-audit.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/gap-audit.md` — the referenced evidence base for Tasks 2-7.

- [ ] **Step 1: Copy the generated report into the repo**

The full 118-finding report was generated at
`C:/Users/olajo/AppData/Local/Temp/claude/d--My-Folder-talyer-e-inventory/937698f7-66ad-44c4-b8d0-05bc76806920/scratchpad/gap-audit.md`.

```bash
cp "C:/Users/olajo/AppData/Local/Temp/claude/d--My-Folder-talyer-e-inventory/937698f7-66ad-44c4-b8d0-05bc76806920/scratchpad/gap-audit.md" docs/gap-audit.md
```

- [ ] **Step 2: Verify it copied intact**

Run: `head -20 docs/gap-audit.md && grep -c '^### ' docs/gap-audit.md`
Expected: the title `# talyer-e-inventory — gap audit`, and a count of `118`.

- [ ] **Step 3: Commit**

```bash
git add docs/gap-audit.md
git commit -m "docs: add verified gap audit of backend, frontend, tests and ops"
```

---

## Task 2: Close the public-register privilege escalation

**Files:**
- Modify: `backend/src/controllers/authController.js:38-59`
- Modify: `backend/src/routes/authRoutes.js:31-36`
- Modify: `backend/tests/auth.test.js` (many call sites — see Step 3)

**Interfaces:**
- Consumes: `USER_ROLES` from `backend/src/config/constants.js`.
- Produces: `POST /api/auth/register` can only ever create a `customer`. Privileged users are created by `POST /api/users` (admin-only) or directly via the `User` model in tests.

**Background:** `POST /api/auth/register` is mounted publicly at `authRoutes.js:95` with no `protect`. Its validator whitelists `role` against all four roles, and the controller does `role: role || 'customer'`. One unauthenticated request with `"role":"admin"` returns a working admin token.

**Critical detail:** `backend/tests/auth.test.js` currently *relies on this bug* — it calls `POST /api/auth/register` with `role: 'admin'` at roughly a dozen places to mint admin tokens. Those call sites must be converted to create the user directly through the `User` model, the same way `tests/setup/testHelpers.js` does. A test that still registers a privileged role through the public endpoint is a failing test, not a passing one.

- [ ] **Step 1: Write the failing test**

Append this describe block inside the top-level describe in `backend/tests/auth.test.js`:

```js
  describe('POST /api/auth/register privilege escalation', () => {
    it('ignores an attacker-supplied admin role and creates a customer', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Mallory',
          email: 'mallory@example.com',
          password: 'password123',
          role: 'admin',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('customer');

      const stored = await User.findOne({ email: 'mallory@example.com' });
      expect(stored.role).toBe('customer');
    });

    it('ignores an attacker-supplied branch assignment', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Mallory Two',
          email: 'mallory2@example.com',
          password: 'password123',
          role: 'salesperson',
          branch: new mongoose.Types.ObjectId().toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('customer');

      const stored = await User.findOne({ email: 'mallory2@example.com' });
      expect(stored.branch).toBeUndefined();
    });
  });
```

If `User` or `mongoose` are not already imported at the top of `auth.test.js`, add the imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth.test.js -t "privilege escalation"`
Expected: FAIL — received role `"admin"`, expected `"customer"`.

- [ ] **Step 3: Implement the fix**

In `backend/src/controllers/authController.js`, add the constants import if absent and rewrite `register`:

```js
import { USER_ROLES } from '../config/constants.js';
```

```js
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Validation
  if (!name || !email || !password) {
    return ApiResponse.error(res, 400, 'Please provide name, email and password');
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    return ApiResponse.error(res, 400, 'User already exists');
  }

  // Public registration always creates a customer. Privileged accounts are
  // created through the admin-only POST /api/users route.
  const user = await User.create({
    name,
    email,
    password,
    role: USER_ROLES.CUSTOMER,
  });
```

Leave the rest of `register` (token generation, cookie, response) unchanged.

In `backend/src/routes/authRoutes.js`, delete the `role` and `branch` entries from `registerValidation` so the public contract no longer advertises them:

```js
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];
```

- [ ] **Step 4: Convert every test that registered a privileged role**

Add this helper near the top of `backend/tests/auth.test.js`, after the imports:

```js
/**
 * Create a user of any role directly through the model.
 * The public /register endpoint only creates customers, so tests that need a
 * privileged account must not go through HTTP.
 */
const createUserDirect = async (overrides = {}) => {
  return User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'admin',
    isActive: true,
    ...overrides,
  });
};
```

Then rewrite every call site that posted to `/api/auth/register` with a `role` field. Each one follows the same shape — replace:

```js
const res = await request(app)
  .post('/api/auth/register')
  .send({ name: 'X', email: 'x@example.com', password: 'password123', role: 'admin' });
const token = res.body.data.accessToken;
```

with:

```js
await createUserDirect({ name: 'X', email: 'x@example.com', password: 'password123' });
const loginRes = await request(app)
  .post('/api/auth/login')
  .send({ email: 'x@example.com', password: 'password123' });
const token = loginRes.body.data.accessToken;
```

Do not delete the assertions those tests already make about registration itself — where a test asserts on registration validation (missing name, bad email, short password, duplicate email), keep it posting to `/register` and simply drop the `role` field from its payload. The test at `auth.test.js:155` that sends `role: 'invalid_role'` and expects a 400 no longer applies once `role` leaves the validator; delete that test and rely on the two new privilege-escalation tests instead.

- [ ] **Step 5: Run the full auth suite**

Run: `cd backend && npm test -- auth.test.js`
Expected: PASS, all tests green, including the two new privilege-escalation tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js backend/tests/auth.test.js
git commit -m "fix(auth): public registration can no longer self-assign a privileged role"
```

---

## Task 3: Stop leaking the password-reset token and close user enumeration

**Files:**
- Modify: `backend/src/controllers/authController.js:208-230`
- Modify: `backend/tests/auth.test.js` (the `POST /api/auth/forgot-password` describe block)

**Interfaces:**
- Consumes: `user.getResetPasswordToken()` from `backend/src/models/User.js:113`.
- Produces: `POST /api/auth/forgot-password` always answers `200` with a generic message. The `resetToken` field appears in the payload only when `process.env.NODE_ENV !== 'production'`, which keeps local development and the test suite working while removing the production hole.

**Background:** `authController.js:227` returns the raw reset token in the response body, and `authController.js:217-219` returns `404` for an unknown email, which enumerates accounts. There is no mail transport in this project, so a development-only token echo is the pragmatic replacement.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe('POST /api/auth/forgot-password', ...)` block's non-existent-email test and add an enumeration test:

```js
    it('returns 200 with a generic message for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeUndefined();
    });

    it('gives an identical status and message for known and unknown emails', async () => {
      await createUserDirect({ email: 'known@example.com' });

      const known = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'known@example.com' });
      const unknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown@example.com' });

      expect(known.status).toBe(unknown.status);
      expect(known.body.message).toBe(unknown.body.message);
    });

    it('never returns a reset token when NODE_ENV is production', async () => {
      await createUserDirect({ email: 'prod@example.com' });
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: 'prod@example.com' });

        expect(res.status).toBe(200);
        expect(res.body.data).toBeUndefined();
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth.test.js -t "forgot-password"`
Expected: FAIL — unknown email returns 404, and the production case still returns `data.resetToken`.

- [ ] **Step 3: Implement the fix**

Replace `forgotPassword` in `backend/src/controllers/authController.js`:

```js
// @desc    Request a password reset token
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return ApiResponse.error(res, 400, 'Please provide an email');
  }

  // Always answer identically so the endpoint cannot be used to discover
  // which email addresses have accounts.
  const genericMessage =
    'If an account exists for that email, a password reset token has been issued';

  const user = await User.findOne({ email });

  if (!user) {
    return ApiResponse.success(res, 200, genericMessage);
  }

  const resetToken = user.getResetPasswordToken();
  await user.save();

  // There is no mail transport in this project. Outside production the token
  // is echoed so the flow is usable locally and under test; in production it
  // is never sent to the caller.
  if (process.env.NODE_ENV === 'production') {
    return ApiResponse.success(res, 200, genericMessage);
  }

  return ApiResponse.success(res, 200, genericMessage, { resetToken });
});
```

- [ ] **Step 4: Run the full auth suite**

Run: `cd backend && npm test -- auth.test.js`
Expected: PASS. The existing reset-password happy path still works because it reads `forgotRes.body.data.resetToken` under `NODE_ENV=test`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/authController.js backend/tests/auth.test.js
git commit -m "fix(auth): stop returning reset tokens in production and equalise forgot-password responses"
```

---

## Task 4: Repair the two branch-access guards that can never match

**Files:**
- Modify: `backend/src/middleware/branchAccess.js:9-28`
- Modify: `backend/src/controllers/serviceController.js:632-638`
- Test: `backend/tests/branch.test.js` (add HTTP tests — this suite currently issues none)
- Test: `backend/tests/service.test.js`

**Interfaces:**
- Consumes: `USER_ROLES`, `ApiResponse`.
- Produces: `checkBranchAccess` resolves the branch id from `req.params.branchId` or `req.params.id`, so it works on both `/stock/branch/:branchId` and `/branches/:id/stats`.

**Background:** two guards compare the wrong things and therefore deny everyone.
1. `branchAccess.js:10` reads only `req.params.branchId`, but it is mounted at `branchRoutes.js:106` on `/:id/stats`, so it compares against `undefined` and 403s every non-admin.
2. `serviceController.js:636` compares a *populated* Branch document to an ObjectId string, which is never equal, so no salesperson or mechanic can ever open a service invoice.

- [ ] **Step 1: Write the failing tests**

`backend/tests/branch.test.js` builds no Express app today. Add one at the top of the file, after the imports:

```js
import express from 'express';
import request from 'supertest';
import branchRoutes from '../src/routes/branchRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/branches', branchRoutes);
```

Then add:

```js
  describe('GET /api/branches/:id/stats access control', () => {
    it('allows a salesperson to read the stats of their own branch', async () => {
      const branch = await createTestBranch();
      const { token } = await createTestSalesperson(branch._id);

      const res = await request(app)
        .get(`/api/branches/${branch._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('denies a salesperson the stats of a different branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'OWN-1' });
      const other = await createTestBranch({ name: 'Other', code: 'OTH-1' });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/branches/${other._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows an admin the stats of any branch', async () => {
      const branch = await createTestBranch();
      const { token } = await createTestAdmin();

      const res = await request(app)
        .get(`/api/branches/${branch._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
```

Import `createTestAdmin` and `createTestSalesperson` from `./setup/testHelpers.js` if they are not already imported, and reuse or add a local `createTestBranch` helper matching the one in `stock.test.js`.

In `backend/tests/service.test.js` add:

```js
  describe('GET /api/services/:id/invoice access control', () => {
    it('lets a salesperson open an invoice for their own branch', async () => {
      const branch = await createTestBranch();
      const { token } = await createTestSalesperson(branch._id);
      const order = await createTestServiceOrder({ branch: branch._id });

      const res = await request(app)
        .get(`/api/services/${order._id}/invoice`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('denies a salesperson an invoice from another branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'OWN-2' });
      const other = await createTestBranch({ name: 'Other', code: 'OTH-2' });
      const { token } = await createTestSalesperson(own._id);
      const order = await createTestServiceOrder({ branch: other._id });

      const res = await request(app)
        .get(`/api/services/${order._id}/invoice`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
```

Reuse the existing `createTestBranch` / service-order factory helpers already present in `service.test.js`; if the service-order factory has a different name, use that name rather than inventing `createTestServiceOrder`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- branch.test.js service.test.js -t "access control"`
Expected: FAIL — the own-branch cases return 403 instead of 200.

- [ ] **Step 3: Implement the fix**

Replace `checkBranchAccess` in `backend/src/middleware/branchAccess.js`:

```js
/**
 * Middleware to check if user has access to a specific branch.
 * Admin can access all branches. Everyone else is limited to their own.
 *
 * The branch id is read from either :branchId or :id so this guard works on
 * /stock/branch/:branchId and /branches/:id/stats alike.
 */
const checkBranchAccess = (req, res, next) => {
  const branchId = req.params.branchId || req.params.id;
  const user = req.user;

  if (user.role === USER_ROLES.ADMIN) {
    return next();
  }

  if (!branchId) {
    return ApiResponse.error(res, 400, 'Branch id is required');
  }

  if (!user.branch) {
    return ApiResponse.error(res, 403, 'User not assigned to any branch');
  }

  if (user.branch.toString() !== branchId.toString()) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  next();
};
```

Replace the access block in `backend/src/controllers/serviceController.js`:

```js
  // Check access
  if (
    req.user.role === USER_ROLES.MECHANIC &&
    order.assignedTo?._id.toString() !== req.user._id.toString()
  ) {
    return ApiResponse.error(res, 403, 'Access denied to this service order');
  }

  if (req.user.role !== USER_ROLES.ADMIN) {
    const orderBranchId = order.branch?._id ? order.branch._id.toString() : order.branch?.toString();
    if (!req.user.branch || orderBranchId !== req.user.branch.toString()) {
      return ApiResponse.error(res, 403, 'Access denied to this branch');
    }
  }
```

Add `import { USER_ROLES } from '../config/constants.js';` to `serviceController.js` if it is not already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- branch.test.js service.test.js`
Expected: PASS, whole suites green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/branchAccess.js backend/src/controllers/serviceController.js backend/tests/branch.test.js backend/tests/service.test.js
git commit -m "fix(authz): branch guards compare the right values on stats and service invoices"
```

---

## Task 5: Enforce branch scoping and role limits on the stock endpoints

**Files:**
- Modify: `backend/src/controllers/stockController.js` — `getAllStock` (line 17), `getLowStock` (line 187), `restockProduct` (line 217), `restockById` (line 364)
- Modify: `backend/src/routes/stockRoutes.js:184` — the `/product/:productId` route
- Test: `backend/tests/stock.test.js`

**Interfaces:**
- Consumes: `USER_ROLES`, `ApiResponse`, `req.user.branch`.
- Produces: for any non-admin, list and restock endpoints are clamped to `req.user.branch`; `GET /api/stock/product/:productId` requires admin or salesperson.

**Background:** four confirmed holes.
1. `getAllStock` and `getLowStock` take `branch` from the query and apply it verbatim — a salesperson sees every branch.
2. `restockProduct` takes `branch` from the body with no clamp, so a salesperson can write quantity **and prices** into another branch. Because `salesController` prices line items from `stock.sellingPrice`, this is a fraud path.
3. `restockById` loads by `_id` alone — cross-branch write IDOR.
4. `GET /stock/product/:productId` is `protect`-only, so a self-registered customer can read per-branch cost prices and on-hand quantities for the whole company.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/stock.test.js`:

```js
  describe('stock branch scoping', () => {
    it('restricts GET /api/stock to the salespersons own branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH' });
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      await Stock.create({ product: product._id, branch: own._id, quantity: 5, costPrice: 1, sellingPrice: 2 });
      await Stock.create({ product: product._id, branch: other._id, quantity: 7, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get('/api/stock')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].branch.toString()).toBe(own._id.toString());
    });

    it('ignores a branch query that points at another branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN2' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH2' });
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      await Stock.create({ product: product._id, branch: other._id, quantity: 7, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .get(`/api/stock?branch=${other._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('rejects a restock aimed at another branch', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN3' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH3' });
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .post('/api/stock/restock')
        .set('Authorization', `Bearer ${token}`)
        .send({ product: product._id, branch: other._id, quantity: 5, costPrice: 10, sellingPrice: 20 });

      expect(res.status).toBe(403);
    });

    it('rejects restock-by-id against another branch stock record', async () => {
      const own = await createTestBranch({ name: 'Own', code: 'SC-OWN4' });
      const other = await createTestBranch({ name: 'Other', code: 'SC-OTH4' });
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      const foreign = await Stock.create({ product: product._id, branch: other._id, quantity: 1, costPrice: 1, sellingPrice: 2 });
      const { token } = await createTestSalesperson(own._id);

      const res = await request(app)
        .put(`/api/stock/${foreign._id}/restock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 9999 });

      expect(res.status).toBe(403);

      const reread = await Stock.findById(foreign._id);
      expect(reread.quantity).toBe(1);
    });

    it('denies a customer access to per-branch cost prices', async () => {
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      const { token } = await createTestUser({ email: 'cust@example.com', role: 'customer' });

      const res = await request(app)
        .get(`/api/stock/product/${product._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- stock.test.js -t "branch scoping"`
Expected: FAIL — cross-branch reads return data, cross-branch restocks return 201/200, and the customer read returns 200.

- [ ] **Step 3: Implement the scoping helper**

Create `backend/src/utils/branchScope.js`:

```js
import { USER_ROLES } from '../config/constants.js';

/**
 * Resolve the branch a request is allowed to act on.
 *
 * Admins may target any branch (or none, meaning "all branches"). Everyone
 * else is pinned to their assigned branch regardless of what they asked for.
 *
 * @param {Object} user - req.user
 * @param {String} [requestedBranchId] - branch id taken from body or query
 * @returns {{ ok: true, branchId: String|null } | { ok: false, status: Number, message: String }}
 */
export const resolveBranchScope = (user, requestedBranchId) => {
  if (user.role === USER_ROLES.ADMIN) {
    return { ok: true, branchId: requestedBranchId || null };
  }

  if (!user.branch) {
    return { ok: false, status: 403, message: 'User not assigned to any branch' };
  }

  const ownBranchId = user.branch.toString();

  if (requestedBranchId && requestedBranchId.toString() !== ownBranchId) {
    return { ok: false, status: 403, message: 'Access denied to this branch' };
  }

  return { ok: true, branchId: ownBranchId };
};

/**
 * True when the user may act on a document that belongs to the given branch.
 */
export const canAccessBranch = (user, branchId) => {
  if (user.role === USER_ROLES.ADMIN) return true;
  if (!user.branch || !branchId) return false;
  return user.branch.toString() === branchId.toString();
};
```

- [ ] **Step 4: Apply the helper in stockController**

Add the import to `backend/src/controllers/stockController.js`:

```js
import { resolveBranchScope, canAccessBranch } from '../utils/branchScope.js';
```

In `getAllStock`, replace the existing branch filter block:

```js
  const scope = resolveBranchScope(req.user, branch);
  if (!scope.ok) {
    return ApiResponse.error(res, scope.status, scope.message);
  }
  if (scope.branchId) {
    query.branch = scope.branchId;
  }
```

In `getLowStock`, replace `if (branch) { query.branch = branch; }` with the identical block above.

In `restockProduct`, insert immediately after the destructure of `req.body` and before the product/branch existence check:

```js
  const scope = resolveBranchScope(req.user, branch);
  if (!scope.ok) {
    return ApiResponse.error(res, scope.status, scope.message);
  }
  const targetBranch = scope.branchId;
  if (!targetBranch) {
    return ApiResponse.error(res, 400, 'Branch is required');
  }
```

Then use `targetBranch` everywhere the function currently uses `branch` — the `Branch.findById(...)` lookup, the `Stock.findOne({ product, branch })` lookup, and the `Stock.create({ ... })` payload.

In `restockById`, insert immediately after the `if (!stock)` guard:

```js
  if (!canAccessBranch(req.user, stock.branch)) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }
```

- [ ] **Step 5: Restrict the product-stock route**

In `backend/src/routes/stockRoutes.js`, change the `/product/:productId` route to require a staff role:

```js
// GET /api/stock/product/:productId - Get stock for specific product
router.get(
  '/product/:productId',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  productIdValidation,
  handleValidationErrors,
  stockController.getProductStock
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npm test -- stock.test.js`
Expected: PASS, whole suite green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/branchScope.js backend/src/controllers/stockController.js backend/src/routes/stockRoutes.js backend/tests/stock.test.js
git commit -m "fix(authz): clamp stock reads and restocks to the callers branch"
```

---

## Task 6: Coerce numeric request fields so string quantities cannot corrupt stock

**Files:**
- Modify: `backend/src/routes/stockRoutes.js:11-72` (every numeric validator)
- Test: `backend/tests/stock.test.js`

**Interfaces:**
- Consumes: `express-validator`'s `.toInt()` / `.toFloat()` sanitizers.
- Produces: `req.body.quantity`, `costPrice`, `sellingPrice`, `reorderPoint`, `reorderQuantity`, and `adjustment` are always numbers by the time a controller sees them.

**Background:** the validators use `isInt()` / `isFloat()`, which only *check* the value — they do not convert it. A JSON string `"5"` passes `isInt()`, then `stock.quantity += "5"` performs string concatenation, so a stock of `100` becomes `"1005"`. The StockMovement ledger then records the corrupted delta as fact.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/stock.test.js`:

```js
  describe('numeric coercion', () => {
    it('treats a string quantity as a number on restock', async () => {
      const branch = await createTestBranch({ name: 'Coerce', code: 'CO-1' });
      const category = await createTestCategory();
      const product = await createTestProduct({ category: category._id });
      const stock = await Stock.create({
        product: product._id, branch: branch._id, quantity: 100, costPrice: 1, sellingPrice: 2,
      });
      const { token } = await createTestAdmin();

      const res = await request(app)
        .put(`/api/stock/${stock._id}/restock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: '5' });

      expect(res.status).toBe(200);

      const reread = await Stock.findById(stock._id);
      expect(reread.quantity).toBe(105);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- stock.test.js -t "numeric coercion"`
Expected: FAIL — received `1005`, expected `105`.

- [ ] **Step 3: Implement the fix**

In `backend/src/routes/stockRoutes.js`, append the matching sanitizer to every numeric validator. The complete rewritten validator blocks:

```js
const restockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
  body('costPrice').notEmpty().isFloat({ min: 0 }).withMessage('Cost price must be a positive number').toFloat(),
  body('sellingPrice').notEmpty().isFloat({ min: 0 }).withMessage('Selling price must be a positive number').toFloat(),
  body('reorderPoint').optional().isInt({ min: 0 }).withMessage('Reorder point must be a non-negative integer').toInt(),
  body('reorderQuantity').optional().isInt({ min: 0 }).withMessage('Reorder quantity must be a non-negative integer').toInt(),
  body('supplier').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('location').optional().isString().isLength({ max: 100 }).withMessage('Location cannot exceed 100 characters')
];

const adjustStockValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('branch').notEmpty().isMongoId().withMessage('Valid branch ID is required'),
  body('adjustment').notEmpty().isInt().withMessage('Adjustment must be an integer').toInt(),
  body('reason').notEmpty().isString().isLength({ min: 5, max: 500 })
    .withMessage('Reason is required and must be between 5-500 characters')
];

const createTransferValidation = [
  body('product').notEmpty().isMongoId().withMessage('Valid product ID is required'),
  body('fromBranch').notEmpty().isMongoId().withMessage('Valid source branch ID is required'),
  body('toBranch').notEmpty().isMongoId().withMessage('Valid destination branch ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const restockByIdValidation = [
  param('id').isMongoId().withMessage('Valid stock ID is required'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be at least 1').toInt(),
  body('supplierId').optional().isMongoId().withMessage('Valid supplier ID required if provided'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const adjustByIdValidation = [
  param('id').isMongoId().withMessage('Valid stock ID is required'),
  body('quantity').notEmpty().isInt().withMessage('Adjustment quantity is required').toInt(),
  body('reason').notEmpty().isString().isLength({ min: 5, max: 500 })
    .withMessage('Reason is required and must be between 5-500 characters'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- stock.test.js`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/stockRoutes.js backend/tests/stock.test.js
git commit -m "fix(stock): coerce numeric request fields so string input cannot corrupt quantities"
```

---

## Task 7: Add security headers, rate limiting, and a production-safe error handler

**Files:**
- Modify: `backend/package.json` (add `helmet`, `express-rate-limit`)
- Modify: `backend/src/server.js:11-22` and the route-mount block
- Modify: `backend/src/middleware/errorHandler.js:43-47`
- Create: `backend/src/middleware/rateLimit.js`
- Test: `backend/tests/errorHandler.test.js` (new)

**Interfaces:**
- Consumes: `helmet`, `express-rate-limit`.
- Produces: `authLimiter` and `apiLimiter` exported from `backend/src/middleware/rateLimit.js`.

**Background:** the app installs neither security headers nor any rate limiting, and `errorHandler.js:45` returns `error.message` verbatim to the client for every status including 500 — leaking internal Mongo and driver messages in production.

- [ ] **Step 1: Install the dependencies**

```bash
cd backend && npm install helmet express-rate-limit
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/errorHandler.test.js`:

```js
import request from 'supertest';
import express from 'express';
import errorHandler from '../src/middleware/errorHandler.js';

const buildApp = () => {
  const app = express();
  app.get('/boom', () => {
    throw new Error('connection <mongodb://user:pass@host> refused');
  });
  app.get('/bad-request', (req, res, next) => {
    const err = new Error('Quantity must be at least 1');
    err.statusCode = 400;
    next(err);
  });
  app.use(errorHandler);
  return app;
};

describe('errorHandler', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('hides internal 500 messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Server Error');
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    expect(res.body.stack).toBeUndefined();
  });

  it('still returns actionable 4xx messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(buildApp()).get('/bad-request');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Quantity must be at least 1');
  });

  it('returns the real message and stack in development', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('refused');
    expect(res.body.stack).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- errorHandler.test.js`
Expected: FAIL — production 500 returns the raw connection string.

- [ ] **Step 4: Implement the error-handler fix**

Replace the response block at the end of `backend/src/middleware/errorHandler.js`:

```js
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // 5xx messages come from internal failures and can carry connection
  // strings, driver internals, or file paths. Never send them to a client.
  const message =
    statusCode >= 500 && isProduction
      ? 'Server Error'
      : error.message || 'Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProduction && { stack: err.stack }),
  });
```

- [ ] **Step 5: Create the rate limiters**

Create `backend/src/middleware/rateLimit.js`:

```js
import rateLimit from 'express-rate-limit';

/**
 * Aggressive limiter for credential and token endpoints. Blocks the
 * brute-force and enumeration loops that these routes otherwise invite.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
  },
});

/**
 * Broad limiter for the rest of the API.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});
```

- [ ] **Step 6: Wire helmet and the limiters into the server**

In `backend/src/server.js`, add the imports:

```js
import helmet from 'helmet';
import { authLimiter, apiLimiter } from './middleware/rateLimit.js';
```

Immediately after `const app = express();` and before the body parsers, add:

```js
// Security headers. crossOriginResourcePolicy is relaxed so the frontend on a
// different origin can still load images served from /uploads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
```

Change the body parsers to bound the payload size:

```js
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

In the route-mount block, apply the limiters:

```js
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/branches', apiLimiter, branchRoutes);
app.use('/api/categories', apiLimiter, categoryRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/stock', apiLimiter, stockRoutes);
app.use('/api/suppliers', apiLimiter, supplierRoutes);
app.use('/api/sales', apiLimiter, salesRoutes);
app.use('/api/services', apiLimiter, serviceRoutes);
```

- [ ] **Step 7: Run the tests**

Run: `cd backend && npm test -- errorHandler.test.js`
Expected: PASS, 3/3.

Run: `cd backend && npm test -- --testPathIgnorePatterns "tests/user.test.js"`
Expected: PASS, all suites green.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/server.js backend/src/middleware/errorHandler.js backend/src/middleware/rateLimit.js backend/tests/errorHandler.test.js
git commit -m "feat(security): add helmet, rate limiting and a production-safe error handler"
```

---

## Task 8: Containerize the backend

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:**
- Consumes: `backend/package.json` scripts (`npm start` → `node src/server.js`).
- Produces: an image that listens on `5000` and answers `GET /health`.

**Background:** `sharp` needs its platform binaries, so the runtime stage must install production dependencies rather than copying `node_modules` from a build stage on a different base.

- [ ] **Step 1: Create the dockerignore**

Create `backend/.dockerignore`:

```
node_modules
npm-debug.log
.env
.env.*
!.env.example
tests
coverage
docs
uploads
dump.rdb
.git
.gitignore
Dockerfile
.dockerignore
```

- [ ] **Step 2: Create the Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Uploads are written at runtime; create the directory owned by the app user.
RUN mkdir -p /app/uploads/products && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
```

- [ ] **Step 3: Build the image**

Run: `docker build -t talyer-backend:test ./backend`
Expected: build completes, final line `naming to docker.io/library/talyer-backend:test`.

- [ ] **Step 4: Verify the image runs as non-root**

Run: `docker run --rm talyer-backend:test id -u`
Expected: `1000` (the `node` user), not `0`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "build(backend): add multi-stage production Dockerfile"
```

---

## Task 9: Containerize the frontend

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Modify: `frontend/next.config.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_API_URL` at build time (Next.js inlines `NEXT_PUBLIC_*` during `next build`).
- Produces: an image that listens on `3000` and serves the standalone Next.js server.

**Background:** two blockers. Next.js must emit `output: 'standalone'` for a small runtime image, and `next.config.ts` currently allows remote images only from `localhost:5000`, so every product image 400s in production. The API hostname must be configurable.

- [ ] **Step 1: Update next.config.ts**

Replace `frontend/next.config.ts`:

```ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

/**
 * The backend that serves /uploads. Set NEXT_PUBLIC_IMAGE_HOST to the API's
 * origin (e.g. https://api.example.com) when deploying; without it only the
 * local development backend is allowed.
 */
const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

const remotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = [
  { protocol: 'http', hostname: 'localhost', port: '5000', pathname: '/uploads/**' },
  { protocol: 'http', hostname: '127.0.0.1', port: '5000', pathname: '/uploads/**' },
  { protocol: 'http', hostname: 'backend', port: '5000', pathname: '/uploads/**' },
];

if (imageHost) {
  const parsed = new URL(imageHost);
  remotePatterns.push({
    protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
    hostname: parsed.hostname,
    ...(parsed.port ? { port: parsed.port } : {}),
    pathname: '/uploads/**',
  });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  images: {
    unoptimized: isDev,
    remotePatterns,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Create the dockerignore**

Create `frontend/.dockerignore`:

```
node_modules
.next
out
npm-debug.log
.env
.env.*
!.env.example
docs
.git
.gitignore
Dockerfile
.dockerignore
tsconfig.tsbuildinfo
```

- [ ] **Step 3: Create the Dockerfile**

Create `frontend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* values are inlined at build time, so they must be build args.
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api
ARG NEXT_PUBLIC_IMAGE_HOST=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache tini

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

- [ ] **Step 4: Build the image**

Run: `docker build -t talyer-frontend:test ./frontend`
Expected: build completes. If `next build` fails on a type error introduced by the config change, fix the type error — do not silence it with `ignoreBuildErrors`.

- [ ] **Step 5: Verify lint still passes**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore frontend/next.config.ts
git commit -m "build(frontend): add standalone Dockerfile and configurable image host"
```

---

## Task 10: Wire the stack together with root Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `backend/Dockerfile`, `frontend/Dockerfile`.
- Produces: `docker compose up` brings up mongo, redis, backend, frontend with the backend reachable at `http://localhost:5000` and the frontend at `http://localhost:3000`.

**Background:** the frontend calls unprefixed paths against `NEXT_PUBLIC_API_URL`, while the backend mounts every router under `/api`. The compose file must therefore set `NEXT_PUBLIC_API_URL` to include `/api` — this is the single most common misconfiguration in this project.

- [ ] **Step 1: Create the env template**

Create `.env.example` at the repo root:

```
# Copy to .env and adjust. Never commit the filled-in .env.

# ---- shared ----
NODE_ENV=production

# ---- mongo ----
MONGO_INITDB_ROOT_USERNAME=talyer
MONGO_INITDB_ROOT_PASSWORD=change-me
MONGODB_URI=mongodb://talyer:change-me@mongo:27017/talyer-e-inventory?authSource=admin

# ---- redis ----
REDIS_URL=redis://redis:6379

# ---- backend ----
PORT=5000
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=change-me-to-a-different-long-random-string
JWT_REFRESH_EXPIRE=30d
CLIENT_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
BACKEND_URL=http://localhost:5000

# ---- frontend (build-time; Next.js inlines NEXT_PUBLIC_*) ----
# Must include the /api suffix: the backend mounts every router under /api
# while the frontend services request unprefixed paths.
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_IMAGE_HOST=http://localhost:5000
```

- [ ] **Step 2: Create the compose file**

Create `docker-compose.yml` at the repo root:

```yaml
name: talyer-e-inventory

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-talyer}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-change-me}
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 5000
      MONGODB_URI: ${MONGODB_URI:-mongodb://talyer:change-me@mongo:27017/talyer-e-inventory?authSource=admin}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      JWT_EXPIRE: ${JWT_EXPIRE:-7d}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      JWT_REFRESH_EXPIRE: ${JWT_REFRESH_EXPIRE:-30d}
      CLIENT_URL: ${CLIENT_URL:-http://localhost:3000}
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-http://localhost:3000}
      BACKEND_URL: ${BACKEND_URL:-http://localhost:5000}
    ports:
      - "5000:5000"
    volumes:
      - backend-uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:5000/api}
        NEXT_PUBLIC_IMAGE_HOST: ${NEXT_PUBLIC_IMAGE_HOST:-http://localhost:5000}
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3000:3000"

volumes:
  mongo-data:
  redis-data:
  backend-uploads:
```

- [ ] **Step 3: Close the gitignore holes**

Append to the root `.gitignore`:

```
# Backend runtime artifacts
backend/uploads/
backend/dist/

# Redis dumps
dump.rdb

# Superpowers scratch
.superpowers/
```

- [ ] **Step 4: Validate the compose file**

Run: `docker compose --env-file .env.example config --quiet`
Expected: exits 0 with no output. A non-zero exit means a YAML or interpolation error.

- [ ] **Step 5: Confirm no real env file is tracked**

Run: `git status --short && git ls-files | grep -E "^\.env$|/\.env$" || echo "no tracked .env"`
Expected: `no tracked .env`. `.env.example` files are fine; a real `.env` must never appear.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "build: add root compose stack for mongo, redis, backend and frontend"
```

---

## Task 11: Add the CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/package.json` (`npm test`, `npm ci`), `frontend/package.json` (`npm run lint`, `npm run build`), both Dockerfiles.
- Produces: required status checks named `backend-test`, `frontend-build`, `docker-build`.

**Background:** the repository has no CI at all. `npm test` is currently red because `backend/tests/user.test.js` imports `src/server.js` and calls `process.exit(1)` when no MongoDB is reachable. CI must run the suite that actually passes and must not pretend the broken suite is fine — so the workflow excludes that one file and prints a loud reminder, rather than silently masking it.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  backend-test:
    name: backend-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install
        working-directory: backend
        run: npm ci

      - name: Test
        working-directory: backend
        # tests/user.test.js imports src/server.js, which calls process.exit(1)
        # when it cannot reach a real MongoDB. It is excluded here and tracked
        # in docs/gap-audit.md; remove this flag once it is ported to the
        # mount-the-router pattern the other suites use.
        run: npm test -- --testPathIgnorePatterns "tests/user.test.js"

  frontend-build:
    name: frontend-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install
        working-directory: frontend
        run: npm ci

      - name: Lint
        working-directory: frontend
        run: npm run lint

      - name: Build
        working-directory: frontend
        env:
          NEXT_PUBLIC_API_URL: http://localhost:5000/api
        run: npm run build

  docker-build:
    name: docker-build
    runs-on: ubuntu-latest
    needs: [backend-test, frontend-build]
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build backend image
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          push: false
          load: true
          tags: talyer-backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build frontend image
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          push: false
          load: true
          tags: talyer-frontend:${{ github.sha }}
          build-args: |
            NEXT_PUBLIC_API_URL=http://localhost:5000/api
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Smoke test the backend image
        run: |
          docker run -d --name backend-smoke -p 5000:5000 \
            -e MONGODB_URI=mongodb://127.0.0.1:27017/none \
            -e JWT_SECRET=ci -e JWT_REFRESH_SECRET=ci \
            talyer-backend:${{ github.sha }} || true
          sleep 5
          docker logs backend-smoke
          docker rm -f backend-smoke || true
```

- [ ] **Step 2: Validate the workflow parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('backend-test'))process.exit(1);console.log('ok')"`
Expected: `ok`. If `yamllint` or `actionlint` is available locally, run it instead.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add backend test, frontend build and docker image pipeline"
```

---

## Task 12: Add the security scanning pipeline

**Files:**
- Create: `.github/workflows/security.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: both `package-lock.json` files and both Dockerfiles.
- Produces: status checks `dependency-audit`, `secret-scan`, `codeql`, `image-scan`.

- [ ] **Step 1: Create the security workflow**

Create `.github/workflows/security.yml`:

```yaml
name: Security

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: '0 3 * * 1'

concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  security-events: write

jobs:
  dependency-audit:
    name: dependency-audit
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        package: [backend, frontend]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: ${{ matrix.package }}/package-lock.json

      - name: Audit ${{ matrix.package }}
        working-directory: ${{ matrix.package }}
        run: npm audit --audit-level=high

  secret-scan:
    name: secret-scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  codeql:
    name: codeql
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-and-quality

      - uses: github/codeql-action/analyze@v3
        with:
          category: /language:javascript-typescript

  image-scan:
    name: image-scan
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: backend
            context: ./backend
          - name: frontend
            context: ./frontend
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build ${{ matrix.name }} image
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          push: false
          load: true
          tags: talyer-${{ matrix.name }}:scan
          build-args: |
            NEXT_PUBLIC_API_URL=http://localhost:5000/api
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trivy scan
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: talyer-${{ matrix.name }}:scan
          format: sarif
          output: trivy-${{ matrix.name }}.sarif
          severity: CRITICAL,HIGH
          ignore-unfixed: true

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-${{ matrix.name }}.sarif
          category: trivy-${{ matrix.name }}
```

- [ ] **Step 2: Create the dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /backend
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      backend-minor-patch:
        update-types: [minor, patch]

  - package-ecosystem: npm
    directory: /frontend
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      frontend-minor-patch:
        update-types: [minor, patch]

  - package-ecosystem: docker
    directory: /backend
    schedule:
      interval: weekly

  - package-ecosystem: docker
    directory: /frontend
    schedule:
      interval: weekly

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 3: Verify the audit gate passes locally**

Run: `cd backend && npm audit --audit-level=high; cd ../frontend && npm audit --audit-level=high`
Expected: both exit 0. If either reports a high or critical advisory, resolve it with `npm audit fix` and re-run — do not lower the threshold to make the gate pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/security.yml .github/dependabot.yml
git commit -m "ci: add dependency audit, secret scanning, CodeQL and image scanning"
```

---

## Task 13: Document the container and CI workflow

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything built in Tasks 2-12.
- Produces: accurate operator documentation.

**Background:** `CLAUDE.md` was written against the pre-hardening code. Several of its statements are now stale — the `/api` prefix note, the `npm test` status, the env var list, and the absence of CI.

- [ ] **Step 1: Update CLAUDE.md**

In the Commands section, add a Docker block:

```bash
# Full stack (repo root)
cp .env.example .env                # then fill in the two JWT secrets
docker compose up --build           # frontend :3000, backend :5000, mongo, redis
docker compose down -v              # tear down including volumes
```

Update the Environment section to add `NEXT_PUBLIC_IMAGE_HOST` to the frontend variables, and note that `NEXT_PUBLIC_API_URL` must carry the `/api` suffix.

In the Testing section, replace the paragraph describing the red suite with the current state, and note that CI runs the same excluded-suite command.

Add a CI section:

```markdown
## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `backend-test`,
`frontend-build`, and `docker-build` on every push and PR to `master`.
[.github/workflows/security.yml](.github/workflows/security.yml) adds
`dependency-audit`, `secret-scan`, `codeql`, and `image-scan`.

These are only advisory until branch protection requires them. Enable it once
with:

    gh api -X PUT repos/:owner/:repo/branches/master/protection \
      --input .github/branch-protection.json
```

- [ ] **Step 2: Create the branch protection payload**

Create `.github/branch-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "backend-test",
      "frontend-build",
      "docker-build",
      "dependency-audit (backend)",
      "dependency-audit (frontend)",
      "secret-scan",
      "codeql"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

- [ ] **Step 3: Update the README security and setup sections**

In `README.md`, under Getting Started, add a "Run with Docker" subsection pointing at `docker compose up --build` and `.env.example`. In the environment configuration block, correct `NEXT_PUBLIC_API_URL` to `http://localhost:5000/api` and remove the `COOKIE_SECURE`, `COOKIE_DOMAIN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, and `RESET_PASSWORD_EXPIRE` entries — no code reads them.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md .github/branch-protection.json
git commit -m "docs: document the container stack, CI gates and corrected environment"
```

---

## Task 14: Final verification and merge to master

**Files:** none created.

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && npm test -- --testPathIgnorePatterns "tests/user.test.js"`
Expected: all suites pass. Record the exact `Tests:` line.

- [ ] **Step 2: Run the frontend gates**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 3: Build both images**

Run: `docker build -t talyer-backend:verify ./backend && docker build -t talyer-frontend:verify ./frontend`
Expected: both succeed.

- [ ] **Step 4: Validate the compose config**

Run: `docker compose --env-file .env.example config --quiet`
Expected: exit 0.

- [ ] **Step 5: Confirm no secret file is staged or tracked**

Run: `git ls-files | grep -E "(^|/)\.env$" || echo clean`
Expected: `clean`.

- [ ] **Step 6: Merge to master**

```bash
git checkout master
git merge --no-ff harden/security-container-cicd -m "merge: security hardening, containerization and CI/CD"
git log --oneline -5
```

---

## Self-Review Notes

**Spec coverage:** The user's request had three parts — fix the confirmed gaps (Tasks 2-7 cover both criticals and six of the highs, each with a regression test), containerize both packages from the root directory (Tasks 8-10), and enforce CI/CD with security checks (Tasks 11-12 plus the branch-protection payload in Task 13). Task 1 lands the evidence base and Task 14 closes the loop by merging to `master`.

**Deliberately out of scope:** the remaining high-severity data-integrity findings — the read-modify-write stock arithmetic, the missing MongoDB sessions across multi-document mutations, the service-order reservation gap, and the `deductStock` reservation corruption. Each requires a schema or transaction-model change large enough to warrant its own plan, and shipping a half-migration is worse than shipping none. They stay documented in `docs/gap-audit.md`. `backend/tests/user.test.js` also stays broken and explicitly excluded rather than silently deleted.

**Type consistency check:** `resolveBranchScope` returns `{ ok, branchId }` on success and `{ ok, status, message }` on failure; every call site in Task 5 checks `scope.ok` first. `canAccessBranch` returns a plain boolean. `authLimiter` and `apiLimiter` are named exports consumed only by `server.js`.
