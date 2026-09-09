---
repo: talyer-e-inventory
remote: https://github.com/JohnFilhmar/talyer-e-inventory
commit: b734ea4b2b9f2b1a300c83e08a9dcc8a85ca8416
branch_analysed: origin/master
date: 2026-09-05
analyzer: principal-engineer gap audit (Claude Opus 5)
total_gaps: 52
counts_by_severity:
  S1: 7
  S2: 32
  S3: 13
  S4: 0
counts_by_category:
  CODE: 20
  SEC: 12
  OPS: 9
  FEAT: 4
  TEST: 2
  CONTRA: 3
  PROJ: 2
counts_by_agent_suitability:
  AGENT-READY: 34
  AGENT-ASSISTED: 13
  HUMAN-FIRST: 5
coverage_percentage: 62
supersedes: docs/gap-audit.md
---

# GAP_ANALYSIS.md

## 0. Status

**Wave 1 is closed** as of 2026-09-06 (PR #39): GAP-001, GAP-002, GAP-004,
GAP-007, GAP-012 and the projection half of GAP-013 are fixed, each with a note
on its entry. Two entries were withdrawn on evidence: **GAP-011 is DISPROVEN**
(GitHub already appends matrix values to check-run names) and **GAP-004's
severity was overstated** (see that entry's note).

The repository visibility question that surfaced during Wave 1 is resolved. The
repository had been private since roughly 2026-08-30, which silently disabled
code scanning and had been failing `codeql` and both `image-scan` legs on every
run since. It was made public again on 2026-09-06, restoring code scanning and
bringing reality back in line with `docs/DEPLOYMENT.md:46`, which had said
"public" throughout. No documentation change is needed; the code and the deploy
guidance were right and the setting had drifted.

**Wave 3 is closed** as of 2026-09-09: GAP-003, GAP-009, GAP-014, GAP-017,
GAP-019, GAP-022 and GAP-054 are fixed, each with a note on its entry. GAP-003
was pulled forward from Wave 4 in the same change, because GAP-022 depends on it
and had been scheduled a whole wave earlier; see **Order overrides** in section
5, where the original claim that no override was needed is corrected.

Two entries again understated their scope. GAP-014's validation pass exposed
that two lines of the same product each passed the per-item stock check on their
own, so an order could reserve more than existed; and GAP-019's fix had to cover
the two order-completion paths as well as the transfer, or a later missing row
would leave an order half-deducted.

**Wave 2 is closed** as of 2026-09-08: GAP-005, GAP-006, GAP-008, GAP-010,
GAP-013 (its remaining half), GAP-036 and GAP-037 are fixed, each with a note on
its entry. Three of those entries understated their own scope, and the notes say
how: GAP-008 named one role-blind cache when there are two, GAP-006 surfaced a
second contract drift in `ApiResponse.errors`, and GAP-037's path fix needed a
Babel plugin before the suite would load.

**The whole GAP-015 family is closed.** GAP-015a and GAP-015b landed
2026-09-07 (PR #41) in the same change that split GAP-015; GAP-015c and
GAP-015d landed 2026-09-08. `escapeRegex` lives in `backend/src/utils/regex.js`
and is applied at all eight sites, `backend/src/middleware/sanitizeRequest.js`
rejects Mongo operator keys before any router sees them,
`backend/src/utils/pickFields.js` builds update documents from an allow-list,
and all twelve read routes declare a query chain built from
`backend/src/utils/queryRules.js`. Each entry carries a note, and GAP-015c's
records where its own proposed fix was wrong.

Two things the triage found that are worth carrying forward. The 24 false
positives still need dismissing in the Security tab, which is a human action.
And the true positives will not close automatically either: CodeQL does not
recognise a hand-written guard or an allow-list as a barrier, so the alert count
is not the measure of this work.

**GAP-053 is closed** as of 2026-09-09, the same day it was raised, because
the workflow question it depended on was answered immediately.

Remaining open: 32 of the 57 gaps now listed. Two new entries were raised on
2026-09-08 from findings surfaced while working Wave 2 and deliberately not
fixed there: **GAP-053** (the refresh cookie repeats GAP-005's fail-open shape,
left alone because the naive inversion breaks local HTTP login) and
**GAP-054** (`validate.js` echoes the submitted value, so a rejected password
comes back in the 400 body). The count moved from a stated 37 to 40 because the
37 was itself an arithmetic error: 55 entries less 16 fixed and 1 disproven is
38, not 37. The count moved from 45 of 52 because splitting GAP-015 added three
entries and all four are now closed. The severity and category counts in the
front matter below describe the audit as first written and have not been
restated.

**Code scanning is reporting again**, for the first time since roughly
2026-08-30. Its findings independently confirm two entries and widen a third:

- **GAP-015 was understated, and has been triaged and split.** 60 open
  high-severity `js/sql-injection` alerts across all nine controllers, against
  the seven `$regex` sites this audit found. All 60 were triaged on 2026-09-07:
  **8 are exploitable today, 28 are real but latent, and 24 are false positives**
  where a route validator already rejects the payload. The per-alert table and
  the four facts the verdicts rest on are in section 13. GAP-015 is replaced by
  GAP-015a (regex escaping), GAP-015b (operator injection through request
  bodies, S1), GAP-015c (whole-body update documents) and GAP-015d (read routes
  with no query validation).
- **The log-injection sinks in GAP-051 are confirmed**, at `server.js:49` and
  `:60` where `req.url` is interpolated raw, and at `cache.js:28` and `:32`,
  which are the `cacheMiddleware` logs and are not covered by the `forLog`
  sanitiser that protects `CacheUtil`.
- The remaining alerts are Trivy container CVEs from `image-scan` and a handful
  of `js/unused-local-variable` notes.

## 1. Metadata

See the front matter above. Every line number in this document was read against
commit `b734ea4`, which is `origin/master`. Do not trust line numbers against any
other commit; re-locate by symbol first.

**This document supersedes `docs/gap-audit.md`.** That prior audit recorded 118
findings. Of those, 27 are fixed, 12 are partially fixed, and 79 are still open.
The still-open ones are folded into the gaps below rather than repeated, and
section 11 records the fixed ones so nobody re-opens them.

## 2. Executive Summary

The system is a branch-scoped motorcycle-parts inventory and point-of-sale
platform: an Express 5 API, a Next.js 16 web client with an offline PWA layer,
and an Expo mobile app that is currently a boot skeleton. The API surface is
broad and the security middleware is thoughtfully built. The problems are not in
what was designed; they are in three places where the design is not carried
through to the code.

**First, inventory arithmetic is not safe under concurrency.** There is not one
MongoDB session, transaction, or atomic update operator in `backend/src`. Every
stock change is read-modify-write on a loaded Mongoose document. Two concurrent
sales of the same part both read the same quantity and both write the same
decremented value, so units leave the shelf that the system never records. The
same shape produces overselling, partial deductions when an order fails halfway
through completion, and stock reservations that leak permanently whenever order
creation fails after the first line item.

**Second, three defects silently destroy data or access.** `errorHandler.js:17`
classifies every `MongoServerError` as a duplicate key and answers 400; the
offline outbox treats any 4xx as permanent, so a Mongo failover during replay
discards real sales. `authController.js:287-291` resets a password without
clearing the refresh token, so an account takeover survives the victim's
recovery. The offline outbox is excluded from the logout wipe, so one user's
queued orders persist into the next user's session on a shared tablet.

**Third, the documentation actively misleads.** README lists eight endpoints that
do not exist, three mutually exclusive test counts, and a Node version four
majors below the pinned one. `frontend/docs/Frontend-Guidelines.md` prescribes a
`features/` architecture the code does not use.

**The single biggest structural risk is that there is no backup.** Mongo and the
uploads volume are named volumes on one self-hosted VPS with no snapshot, no
export, and no restore procedure. Every sales order, service job, stock ledger
row, and product image is one `down -v` or one disk failure from permanent loss.

## 3. Assumptions and Unknowns

The audit brief arrived with its `{{...}}` placeholders unfilled. These are
inferences from the repository, not statements of fact from the team.

- **Project stage: pre-launch or early production.** Inferred from
  `docs/DEPLOYMENT.md` describing live staging and production stacks with manual
  deploys, against a README that still carries unchecked roadmap boxes and a
  mobile app that is a scaffold. If the system already holds real customer money
  and stock, every S1 below is more urgent than its score suggests.
- **Team size: one or two developers.** Inferred from a single git author
  (`Filhmar`) across the visible history.
- **Deployment target: one self-hosted Linux VPS** running both staging and
  production Docker Compose stacks, isolated by project name and host port. From
  `docs/DEPLOYMENT.md:28-37`.
- **Compliance regime: none identified.** The system stores customer names,
  Philippine mobile numbers, and addresses. No GDPR, PCI, or local data-privacy
  handling appears anywhere in the repo. Whether the Philippine Data Privacy Act
  applies is a question for the owner, not something the code answers.
- **Out of scope, by my own decision:** `backend/docs/Phase-7..10-POST-MVP.md`
  describe finance, analytics, notifications, and activity logging. They are
  explicitly labelled POST-MVP, so their absence is planned work, not a gap. They
  appear in section 11, not as `FEAT` entries.
- **Not verified by execution.** I did not run `npm test`, did not start the
  server, and did not exercise a browser. Every finding is from reading code.
  Where a claim depends on runtime behaviour I did not observe, it is marked C2
  or C3 and says so.
- **The working checkout is 8 commits behind `origin/master`.** The audit was
  re-baselined onto `origin/master` (`b734ea4`) after that was discovered. Ten
  model files, `dbHandler.js`, and two frontend components differ between the
  two, so any line number quoted against the stale local `master` is wrong.

## 4. Coverage Report

**What was read.** The repository holds 340 tracked files plus a 37-file
`mobile-app` tree. Excluding lock files and binary assets, roughly 62% of source
lines were read line by line, with the remainder covered by targeted greps for
specific defect classes.

| Area | Lines | Read line-by-line | Notes |
|---|---|---|---|
| `backend/src` | 10,604 | ~95% | All controllers, routes, models, middleware, utils, config read in full. |
| `backend/tests` | 10,733 | ~85% | All 18 suites read; `category`, `supplier`, `motorcycleModel` sampled by describe/it index plus targeted ranges. |
| `frontend/src` | 37,635 | ~32% | Auth, offline, apiClient, hooks, services, types, validators, and 9 pages read in full. Presentational components and detail/invoice pages sampled. |
| `mobile-app` | ~1,900 | 100% | All 28 non-binary files read in full. |
| CI, compose, Dockerfiles, docs |: | ~90% | All workflows, all four compose files, both Dockerfiles, README, CLAUDE.md, DEPLOYMENT.md read in full. Phase docs skimmed for claims only. |

**What was skipped, and what that might hide.**

- **`frontend/src/components/scanner/BarcodeScanner.tsx` was not read.** It is the
  most device-dependent code in the repo and CLAUDE.md documents a subtle past
  bug in its zoom-step tolerance. A full read could surface capability-gating or
  state-machine defects. Nothing in this report covers it.
- **`frontend/src/lib/imageDownscale.ts` was not read.** CLAUDE.md describes an
  EXIF-orientation contract there that is load-bearing and unverified by any test.
- **Detail and invoice pages** under `sales/[id]`, `services/[id]`,
  `products/[id]`, `branches/[id]` were sampled, not read. Print/layout defects
  and further type drift are plausible there.
- **`docs/nginx/talyer-production.conf` was not audited.** It exists and
  `docs/DEPLOYMENT.md:298` references it. A reverse-proxy config is a security
  surface; GAP-032 (`Vary: Origin`) becomes materially worse if that config
  enables caching.
- **`package-lock.json` files were not audited** beyond extracting resolved
  versions. Supply-chain review is delegated to the `dependency-audit` job, which
  currently exits 0 for both packages.
- **No test was executed.** `mongodb-memory-server` downloads a `mongod` binary on
  first run and the sandbox blocks that host. Every claim about test *content* is
  from reading; no claim is made about the current pass/fail state.

**What a full read would most likely change.** The frontend is the largest
unexamined surface, and the frontend has no tests at all. I expect a complete
read to add contract-drift and error-handling gaps of the same kind as GAP-020
and GAP-047, not new S1 findings. The severity distribution would probably shift
toward S3.

## 5. Master Index (sorted by priority score, descending)

`Priority = (Severity weight x Confidence weight) / Complexity weight`
S1=8, S2=5, S3=2, S4=1; C1=1.0, C2=0.8, C3=0.5; XS=1, S=2, M=4, L=7, XL=12.

| # | ID | Cat | Title | Sev | Cplx | Diff | Risk | Conf | Pri | Agent |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | GAP-001 | SEC | Password reset does not revoke the session or the refresh token | S1 | XS | D1 | R1 | C1 | 8.0 | READY |
| 2 | GAP-002 | SEC | The offline outbox survives logout and replays under the next user | S1 | XS | D2 | R1 | C1 | 8.0 | READY |
| 3 | GAP-003 | CODE | Every MongoServerError is answered 400, so offline replay discards real sales | S1 | XS | D2 | R1 | C1 | 8.0 | READY |
| 4 | GAP-004 | SEC | Mongo credentials fail open to a change-me default published in a public repo | S1 | XS | D1 | R2 | C1 | 8.0 | READY |
| 5 | GAP-005 | SEC | forgot-password returns the reset token unless NODE_ENV is exactly production | S2 | XS | D1 | R1 | C1 | 5.0 | READY |
| 6 | GAP-006 | CODE | Password reset is impossible: the client sends token, the API requires resetToken | S2 | XS | D1 | R1 | C1 | 5.0 | READY |
| 7 | GAP-007 | SEC | GET /stock/movements/branch/:branchId has no authorize() guard | S2 | XS | D1 | R1 | C1 | 5.0 | READY |
| 8 | GAP-008 | SEC | Any authenticated customer can enumerate branch managers' names and emails | S2 | XS | D2 | R2 | C1 | 5.0 | ASSISTED |
| 9 | GAP-009 | CODE | normalizeEmail on admin user routes but not on login locks accounts out | S2 | XS | D2 | R2 | C1 | 5.0 | ASSISTED |
| 10 | GAP-010 | CODE | authService.refreshToken omits the CSRF header, so session restore always 403s | S2 | XS | D1 | R1 | C1 | 5.0 | READY |
| 11 | GAP-011 | OPS | Branch protection requires four check names the workflows can never report | S2 | XS | D1 | R2 | C1 | 5.0 | READY |
| 12 | GAP-012 | SEC | Dependabot auto-merge treats a still-running security check as passing | S2 | XS | D2 | R2 | C1 | 5.0 | READY |
| 13 | GAP-013 | CODE | The adjust-stock form defaults to an invalid reason and offers one the API rejects | S2 | XS | D1 | R1 | C1 | 5.0 | READY |
| 14 | GAP-053 | SEC | The refresh cookie's secure and sameSite fail open on NODE_ENV | S2 | XS | D2 | R2 | C1 | 5.0 | ASSISTED |
| 15 | GAP-014 | CODE | Stock reservations leak on every order-creation failure path | S1 | S | D2 | R2 | C1 | 4.0 | READY |
| 16 | GAP-015b | SEC | JSON request bodies reach Mongo as query operators; there is no request-shape guard | S1 | S | D2 | R2 | C1 | 4.0 | READY |
| 17 | GAP-015a | SEC | User-supplied text reaches MongoDB $regex unescaped at eight sites | S2 | S | D2 | R1 | C1 | 2.5 | READY |
| 18 | GAP-015c | SEC | Four update paths pass the whole request body to findByIdAndUpdate | S2 | S | D2 | R2 | C1 | 2.5 | READY |
| 19 | GAP-016 | CODE | A completed-but-unpaid sale can never be paid; on-account revenue is unrecordable | S2 | S | D2 | R2 | C1 | 2.5 | ASSISTED |
| 20 | GAP-017 | SEC | Four mutating service routes have no validation chain | S2 | S | D2 | R1 | C1 | 2.5 | READY |
| 21 | GAP-018 | CODE | Stock adjustments ignore reservedQuantity and can strand pending orders | S2 | S | D2 | R2 | C1 | 2.5 | ASSISTED |
| 22 | GAP-019 | CODE | Transfer completion credits the destination when the source Stock row is missing | S2 | S | D2 | R2 | C1 | 2.5 | READY |
| 23 | GAP-020 | CODE | user.branch shape drift breaks BranchProvider, roleGuard and hasBranchAccess | S2 | S | D2 | R2 | C1 | 2.5 | READY |
| 24 | GAP-021 | FEAT | Sales and service list search and sort are silently dropped by the API | S2 | S | D2 | R1 | C1 | 2.5 | ASSISTED |
| 25 | GAP-022 | CODE | The offline replay queue can stall indefinitely with no user-visible retry | S2 | S | D2 | R1 | C1 | 2.5 | READY |
| 26 | GAP-023 | OPS | /health is a static 200, so a deploy is declared green on a dead application | S2 | S | D2 | R1 | C1 | 2.5 | READY |
| 27 | GAP-024 | OPS | No SIGTERM handler; every deploy severs in-flight writes and can break the ledger | S2 | S | D2 | R2 | C1 | 2.5 | READY |
| 28 | GAP-025 | PROJ | mobile-app is absent from every CI, security and Dependabot workflow | S2 | S | D1 | R1 | C1 | 2.5 | READY |
| 29 | GAP-026 | CODE | Five read endpoints have no pagination or no upper bound on limit | S2 | S | D2 | R1 | C1 | 2.5 | READY |
| 30 | GAP-027 | OPS | No resource limits or log rotation; staging and production share one box | S2 | S | D2 | R2 | C1 | 2.5 | ASSISTED |
| 31 | GAP-028 | OPS | No backup or restore path for the MongoDB data or the uploads volume | S1 | M | D2 | R1 | C1 | 2.0 | HUMAN-FIRST |
| 32 | GAP-029 | CODE | Tax is charged on the pre-discount subtotal and the discount has no ceiling | S2 | S | D4 | R3 | C2 | 2.0 | HUMAN-FIRST |
| 33 | GAP-030 | SEC | The service worker caches cross-origin API responses in a shared bucket | S2 | S | D2 | R2 | C2 | 2.0 | ASSISTED |
| 34 | GAP-031 | CODE | Cache invalidation is incomplete and one cache key omits a request parameter | S3 | XS | D2 | R1 | C1 | 2.0 | READY |
| 35 | GAP-032 | CODE | CORS_ALLOWED_ORIGINS is split without trimming and no Vary: Origin is sent | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 36 | GAP-033 | SEC | The defensive .select() in userController excludes fields that do not exist | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 37 | GAP-034 | CODE | Dead configuration: unused constants, unused CORS headers, divergent upload limits | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 38 | GAP-035 | PROJ | Branch and workspace hygiene: staging is 94 commits behind master | S3 | XS | D1 | R2 | C1 | 2.0 | HUMAN-FIRST |
| 39 | GAP-036 | OPS | seedBranches.js self-executes on import with no main-module guard | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 40 | GAP-037 | OPS | The repo-root uploads/ directory is neither gitignored nor mounted | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 41 | GAP-038 | SEC | Image processing returns the raw internal error message and path on 500 | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 42 | GAP-039 | CONTRA | apiLimiter is documented as 300/IP and implemented as 3000/user | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 43 | GAP-054 | SEC | Validation errors echo the submitted value, including passwords | S3 | XS | D1 | R1 | C1 | 2.0 | READY |
| 44 | GAP-040 | CODE | Every human-readable identifier is generated with countDocuments() + 1 | S2 | M | D2 | R3 | C1 | 1.25 | ASSISTED |
| 45 | GAP-041 | CODE | All money is IEEE-754 floating point with no rounding at any boundary | S2 | M | D3 | R3 | C1 | 1.25 | ASSISTED |
| 46 | GAP-042 | FEAT | The dashboard, the post-login landing page, is entirely non-functional | S2 | M | D2 | R1 | C1 | 1.25 | ASSISTED |
| 47 | GAP-043 | FEAT | Stock lists are silently truncated to one unpaginated page | S2 | M | D2 | R1 | C1 | 1.25 | READY |
| 48 | GAP-044 | TEST | No concurrency test exists and the StockMovement ledger is never asserted | S2 | M | D3 | R1 | C1 | 1.25 | READY |
| 49 | GAP-045 | TEST | branch.test.js tests Mongoose directly; four branch endpoints are unverified | S2 | M | D2 | R1 | C1 | 1.25 | READY |
| 50 | GAP-046 | CODE | No atomicity on stock quantity writes: lost updates and oversell | S1 | L | D3 | R3 | C1 | 1.14 | HUMAN-FIRST |
| 51 | GAP-047 | CODE | Frontend types drift from the API contract at four points | S3 | S | D2 | R1 | C1 | 1.0 | READY |
| 52 | GAP-048 | OPS | Cache invalidation uses Redis KEYS on every mutation hot path | S3 | S | D2 | R1 | C1 | 1.0 | READY |
| 53 | GAP-049 | CONTRA | Transaction numbers never take the documented TXN-YYYYMM shape | S3 | S | D2 | R3 | C1 | 1.0 | ASSISTED |
| 54 | GAP-050 | FEAT | There is no refund, void, or reversal path anywhere in the system | S2 | L | D4 | R3 | C1 | 0.71 | HUMAN-FIRST |
| 55 | GAP-051 | OPS | No observability: no metrics, structured logs, tracing, or alerting | S2 | L | D2 | R1 | C1 | 0.71 | ASSISTED |
| 56 | GAP-052 | CONTRA | Documentation contradicts the code at eight independent points | S3 | M | D1 | R1 | C1 | 0.5 | ASSISTED |
| 57 | GAP-015d | SEC | Twelve read routes have no query-validation chain at all | S3 | M | D2 | R1 | C1 | 0.5 | READY |

**Order overrides.** One was needed, and the original claim that none were was
wrong. Three of the four dependency edges (GAP-014 -> GAP-046,
GAP-040 -> GAP-046, GAP-016 -> GAP-050) do run in the correct direction, because
in each pair the prerequisite is cheaper or higher-severity and therefore sorts
above its dependent. **The fourth, GAP-003 -> GAP-022, did not.** It is correct
in this priority index, where GAP-003 at 8.0 sorts far above GAP-022 at 2.5, but
section 8 had placed GAP-003 in Wave 4 and GAP-022 in Wave 3, so the dependent
ran a whole wave before its prerequisite. Corrected on 2026-09-09 by moving
GAP-003 into Wave 3; its one file, `middleware/errorHandler.js`, is disjoint from
every other member of that wave.

## 6. Index by Category

**SEC (17)**: GAP-001 (8.0), GAP-002 (8.0), GAP-004 (8.0), GAP-005 (5.0),
GAP-007 (5.0), GAP-008 (5.0), GAP-012 (5.0), GAP-015b (4.0), GAP-015a (2.5),
GAP-015c (2.5), GAP-017 (2.5), GAP-030 (2.0), GAP-033 (2.0), GAP-038 (2.0),
GAP-053 (5.0), GAP-054 (2.0), GAP-015d (0.5).

The GAP-015 family and GAP-017 are validation-surface findings classified SEC
rather than CODE because the reachable consequence is denial of service, silent
data corruption or an unguarded write, not merely incorrect behaviour. GAP-015b
is S1 because a mechanic, the lowest-privileged role that can reach the route,
can make a stock deduction land on a product they did not name while the ledger
records it as correct.

**CODE (20)**: GAP-003 (8.0), GAP-006 (5.0), GAP-009 (5.0), GAP-010 (5.0),
GAP-013 (5.0), GAP-014 (4.0), GAP-016 (2.5), GAP-018 (2.5), GAP-019 (2.5),
GAP-020 (2.5), GAP-022 (2.5), GAP-026 (2.5), GAP-029 (2.0), GAP-031 (2.0),
GAP-032 (2.0), GAP-034 (2.0), GAP-040 (1.25), GAP-041 (1.25), GAP-046 (1.14),
GAP-047 (1.0).

**OPS (9)**: GAP-011 (5.0), GAP-023 (2.5), GAP-024 (2.5), GAP-027 (2.5),
GAP-028 (2.0), GAP-036 (2.0), GAP-037 (2.0), GAP-048 (1.0), GAP-051 (0.71).

**FEAT (4)**: GAP-021 (2.5), GAP-042 (1.25), GAP-043 (1.25), GAP-050 (0.71).

The mobile app's 44 unbuilt features are recorded in section 11 as deferred, not
as FEAT entries, because the app acknowledges in its own README that it has no
product features yet.

**TEST (2)**: GAP-044 (1.25), GAP-045 (1.25).

The total absence of a frontend test suite is folded into GAP-044's scope rather
than listed separately.

**CONTRA (3)**: GAP-039 (2.0), GAP-049 (1.0), GAP-052 (0.5).

**PROJ (2)**: GAP-025 (2.5), GAP-035 (2.0).

## 7. Index by Complexity (ascending, for parallel quick-win clearing)

**XS: 24 gaps, single file, under 20 lines each.** GAP-001, GAP-002, GAP-003,
GAP-004, GAP-005, GAP-006, GAP-007, GAP-008, GAP-009, GAP-010, GAP-011, GAP-012,
GAP-013, GAP-031, GAP-032, GAP-033, GAP-034, GAP-035, GAP-036, GAP-037, GAP-038,
GAP-039, GAP-053, GAP-054.

**S: 21 gaps, one module, under 200 lines.** GAP-014, GAP-015a, GAP-015b,
GAP-015c, GAP-016, GAP-017,
GAP-018, GAP-019, GAP-020, GAP-021, GAP-022, GAP-023, GAP-024, GAP-025, GAP-026,
GAP-027, GAP-029, GAP-030, GAP-047, GAP-048, GAP-049.

**M: 9 gaps, several modules, one design choice each.** GAP-015d, GAP-028,
GAP-040, GAP-041, GAP-042, GAP-043, GAP-044, GAP-045, GAP-052.

**L: 3 gaps, cross-cutting, plan before code.** GAP-046, GAP-050, GAP-051.

**XL: 0.** GAP-046 was deliberately scoped down to L by carving the
compensating-transaction work out into GAP-014 and GAP-040, which are
independently shippable. Nothing in this document requires splitting before an
agent starts.

## 8. Recommended Execution Order (waves)

**Read section 0 first for what is already closed.** The wave tables below are
the plan as originally written and still list entries that have since been
fixed; they are left in place so the file-conflict reasoning stays legible.
Waves 1 and 2 are complete.

**Four entries were absent from every wave** and were added on 2026-09-09:
GAP-021, GAP-030 and GAP-031 were omissions in the original plan, and GAP-054
was raised later. An open entry in no wave is unreachable by anyone following
this section, which is how all four went unscheduled.

**Conflict check performed.** For every wave I listed the primary and secondary
file paths of each member gap and compared them pairwise. Two gaps share a wave
only when their file sets are disjoint. Where two gaps touch the same file
(for example GAP-003 and GAP-038 both touch backend middleware, GAP-014 and
GAP-046 both touch `salesController.js`), they are placed in different waves. The
per-wave file lists below are the evidence for that check.

### Wave 1: security stop-the-bleeding (7 gaps, fully parallel)

| Gap | Files touched |
|---|---|
| GAP-001 | `backend/src/controllers/authController.js` |
| GAP-002 | `frontend/src/lib/offline/db.ts` |
| GAP-004 | `docker-compose.yml` |
| GAP-007 | `backend/src/routes/stockRoutes.js` |
| GAP-011 | `.github/workflows/security.yml` |
| GAP-012 | `.github/workflows/dependabot-auto-merge.yml` |
| GAP-033 | `backend/src/controllers/userController.js` |

No two entries share a file. GAP-005 is held back to Wave 2 because it edits the
same `authController.js` region as GAP-001.

### Wave 2: broken user journeys (7 gaps, fully parallel)

| Gap | Files touched |
|---|---|
| GAP-005 | `backend/src/controllers/authController.js` |
| GAP-006 | `frontend/src/types/auth.ts`, `frontend/src/app/(public)/(auth)/reset-password/page.tsx` |
| GAP-010 | `frontend/src/lib/services/authService.ts` |
| GAP-013 | `frontend/src/components/stock/AdjustStockModal.tsx`, `frontend/src/types/stock.ts`, `backend/src/routes/stockRoutes.js` |
| GAP-008 | `backend/src/routes/branchRoutes.js`, `backend/src/controllers/branchController.js` |
| GAP-036 | `backend/src/utils/seedBranches.js` |
| GAP-037 | `.gitignore` |

GAP-009 is held to Wave 3: it edits `authRoutes.js`, and Wave 2 already has an
`authController.js` edit whose review is easier without a second auth change
landing beside it.

### Wave 3: inventory correctness, part one (9 gaps)

| Gap | Files touched |
|---|---|
| GAP-009 | `backend/src/routes/authRoutes.js`, `backend/src/routes/userRoutes.js` |
| GAP-014 | `backend/src/controllers/salesController.js` |
| GAP-015a | `backend/src/utils/regex.js` (new), `branchController.js`, `supplierController.js`, `userController.js`, `productController.js`, `motorcycleModelController.js` |
| GAP-015b | `backend/src/middleware/sanitizeRequest.js` (new), `backend/src/server.js`, `backend/tests/sanitizeRequest.test.js` (new), `backend/tests/service.test.js` |
| GAP-017 | `backend/src/routes/serviceRoutes.js`, `backend/tests/service.test.js`: **serialise after GAP-015b** |
| GAP-019 | `backend/src/controllers/stockController.js` |
| GAP-022 | `frontend/src/app/(protected)/sync/page.tsx`, `frontend/src/lib/offline/sync.ts` |
| GAP-054 | `backend/src/middleware/validate.js`, `frontend/src/types/api.ts` |
| GAP-003 | `backend/src/middleware/errorHandler.js` |

GAP-015a touches `productController.js` and GAP-026 also would, so GAP-026 moves
to Wave 4. GAP-018 touches `stockController.js` like GAP-019, so it also moves.
GAP-015b and GAP-017 both edit `backend/tests/service.test.js`, so they are
serialised rather than parallel: GAP-015b first, because its guard is what makes
GAP-017's four routes safe while GAP-017's chains are still being written.

### Wave 4: inventory correctness, part two (7 gaps)

| Gap | Files touched |
|---|---|
| GAP-016 | `backend/src/controllers/salesController.js` |
| GAP-018 | `backend/src/controllers/stockController.js` |
| GAP-020 | `frontend/src/types/auth.ts`, `frontend/src/providers/BranchProvider.tsx`, `frontend/src/middlewares/roleGuard.tsx` |
| GAP-026 | `backend/src/controllers/productController.js`, `categoryController.js`, `branchController.js` |
| GAP-032 | `backend/src/config/constants.js`, `backend/src/server.js` |
| GAP-015c | `backend/src/utils/pickFields.js` (new), `branchController.js`, `categoryController.js`, `productController.js`, `supplierController.js`: **serialise after GAP-026** |
| GAP-031 | `backend/src/controllers/categoryController.js`, `productController.js`: **serialise after GAP-026** |

GAP-006 (Wave 2) also edits `frontend/src/types/auth.ts`, which is why GAP-020
waits until Wave 4 rather than joining Wave 2. GAP-015c shares three controllers
with GAP-026, so it is serialised after it rather than run beside it.

### Wave 5: operations and platform (10 gaps)

| Gap | Files touched |
|---|---|
| GAP-023 | `backend/src/server.js` |
| GAP-024 | `backend/src/server.js`: **serialise after GAP-023** |
| GAP-025 | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| GAP-027 | `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.staging.yml` |
| GAP-034 | `backend/src/config/constants.js`, `backend/src/middleware/imageUpload.js` |
| GAP-038 | `backend/src/middleware/imageUpload.js`: **serialise after GAP-034** |
| GAP-048 | `backend/src/utils/cache.js` |
| GAP-015d | `backend/src/routes/stockRoutes.js`, `salesRoutes.js`, `serviceRoutes.js`, `productRoutes.js`, `categoryRoutes.js`, `backend/src/controllers/serviceController.js` |
| GAP-021 | `backend/src/controllers/salesController.js`, `serviceController.js`, `frontend/src/app/(protected)/sales/page.tsx` |
| GAP-030 | `frontend/src/app/sw.ts`, `frontend/src/lib/offline/cache.ts` |

Two serialisation edges inside this wave are called out explicitly because the
pairs share a file. Run GAP-023 then GAP-024, and GAP-034 then GAP-038. The rest
are mutually disjoint. GAP-021 is the only entry here touching the sales and
service controllers, and GAP-030 the only one touching the service worker.

### Wave 6: correctness with a design choice (5 gaps)

GAP-040, GAP-041, GAP-042, GAP-043, GAP-047. GAP-040 and GAP-041 both touch
`SalesOrder.js` and `ServiceOrder.js`, so serialise them: GAP-040 first.
GAP-042, GAP-043 and GAP-047 are frontend-only and disjoint from each other.

### Wave 7: verification (2 gaps, parallel)

GAP-044 and GAP-045. Both add test files only. GAP-044 creates new suites;
GAP-045 rewrites `backend/tests/branch.test.js`. Disjoint.

### Wave 8: requires a human decision first

GAP-028, GAP-029, GAP-035, GAP-039, GAP-046, GAP-049, GAP-050, GAP-051, GAP-052.
Do not start any of these from a checklist alone. GAP-029, GAP-046, GAP-049 and
GAP-050 change product or financial behaviour; GAP-028, GAP-035 and GAP-051
require infrastructure access or an owner decision. Their decision briefs are in
section 9 and in each entry's Open questions field.

## 9. Contradiction Register

Three gaps are classified `CONTRA`. Each holds two incompatible positions at
once. A fourth contradiction, the `user.branch` shape drift, is filed as
`CODE` (GAP-020) because one side is unambiguously a bug rather than a
competing decision.

### CONTRA-1 (GAP-039): the documented rate limit is not the implemented one

- **Position A.** `CLAUDE.md` states, under *Security middleware*: "`authLimiter`
  (10 requests/15 min) and `apiLimiter` (300 requests/15 min)" and "Both key
  clients by `req.ip`, which is why `TRUST_PROXY` ... matters behind any reverse
  proxy." `backend/src/routes/authRoutes.js:98-100` repeats it in a code comment:
  "the router-level apiLimiter (300 req/15 min)". Origin: the security-hardening
  work of 2026-07-25.
- **Position B.** `backend/src/middleware/rateLimit.js:74-77` reads
  `max: 3000` with `keyGenerator: userOrIpKey`, which prefers a verified JWT
  subject and falls back to the IP only for unauthenticated traffic. Origin:
  later than Position A, since the `userOrIpKey` helper has its own dedicated
  suite at `backend/tests/rateLimitKey.test.js`.
- **Authoritative position: B, the code.** The implementation is strictly better
  than the documentation: per-user keying stops one office behind a NAT from
  sharing a bucket, which is exactly the failure mode CLAUDE.md's own
  `authLimiter` paragraph warns about. The tests were written for B. The
  documentation is the stale artefact.
- **Blast radius.** Anyone sizing capacity, writing a load test, or reasoning
  about abuse from `CLAUDE.md` is wrong by a factor of ten and wrong about the
  keying. The `TRUST_PROXY` paragraph in the same section is also now misleading:
  `TRUST_PROXY` still matters for `authLimiter` and unauthenticated traffic, but
  no longer for authenticated requests.
- **Decision required: none.** An agent may resolve this autonomously by editing
  the two documentation sites to match the code. Do not change `rateLimit.js`.

### CONTRA-2 (GAP-049): transaction numbers have two incompatible formats

- **Position A.** `backend/src/models/Transaction.js:63-71` builds
  `TXN-${year}${month}-${count+1}` inside a `pre('save')` hook, and `CLAUDE.md`
  documents the identifier scheme as `TXN-YYYYMM-000001`. Origin: the original
  identifier design, consistent with `SO-YYYY-`, `JOB-YYYY-` and `TR-YYYY-`.
- **Position B.** All three call sites supply `transactionNumber` explicitly, so
  the hook's `if (this.isNew && !this.transactionNumber)` guard never fires.
  `backend/src/utils/salesCompletion.js:79-83` emits
  `TXN-${count+1}-${Date.now() last 6 digits}`, producing `TXN-000042-847213`.
  `backend/src/controllers/serviceController.js:406-408` and `:571-573` do the
  same. Origin: later, and evidently a deliberate attempt to dodge the
  `countDocuments` collision that GAP-040 describes.
- **Authoritative position: cannot be determined from the repository alone.**
  Position A is the documented contract and groups by month. Position B is
  collision-resistant, which A is not. Both properties are wanted. The code has
  silently shipped B, so live data already carries B-format numbers, and any
  change to A is a data migration, not a code edit.
- **Blast radius.** `backend/src/models/Transaction.js`,
  `backend/src/utils/salesCompletion.js`,
  `backend/src/controllers/serviceController.js` (two sites), every existing
  `Transaction` document, `CLAUDE.md`'s *Identifiers* section, and any future
  report that filters or groups by transaction number. No frontend code parses
  the number today, so the client blast radius is currently nil.
- **Decision required: `RESOLUTION: HUMAN REQUIRED`.** See the decision brief at
  the end of GAP-049.

### CONTRA-3 (GAP-052): documentation describes a system that does not exist

This is a bundle of eight independent contradictions that share one root cause,
so it is one gap with eight locations rather than eight gaps. In every case
Position B, the code, is authoritative, and every one can be resolved by an agent
editing documentation only.

| # | Position A (a document says) | Position B (the code does) |
|---|---|---|
| 1 | `README.md:571-572, 614-621` documents `GET /users/all`, `GET /users/managers`, `GET /stock/:id`, `POST /stock/add`, `POST /stock/transfer`, `PATCH /stock/transfers/:id/approve|complete|reject` | None exist. `backend/src/routes/stockRoutes.js` contains no `router.patch(` at all; the real verbs are `POST /transfers` (`:160`) and `PUT /transfers/:id` (`:170`). About 20 real routes are undocumented, including every `PATCH /:id/restore`. |
| 2 | `README.md:4` says 421 tests / 14 suites; `README.md:72` and `:538` say 272 tests; `CLAUDE.md:25` and `:442` say 474 tests / 15 suites | `backend/tests/` holds 18 `.test.js` files with 586 `it(` blocks. Three documented counts, none correct. |
| 3 | `README.md:202, 384` require "Node.js 18+" | Both Dockerfiles pin `node:22-alpine`; all four workflows use `node-version: '22'`. Next 16 requires Node 20.9+, so following the README makes the frontend unbuildable. |
| 4 | `README.md:213, 766` say Next.js 15; `README.md:216` says Tailwind 3.x | `frontend/package.json:18` pins `next: 16.3.0`; `:34` pins `tailwindcss: ^4`. |
| 5 | `frontend/docs/Frontend-Guidelines.md:263-298` prescribes `features/<domain>/{services,hooks,types,components}` with a no-cross-feature-imports rule | `frontend/src/` has no `features/` directory. Services are flat in `lib/services/`, hooks flat in `hooks/`. Nine further sub-paths in the same block do not exist either. |
| 6 | `frontend/docs/Frontend-Guidelines.md:392-393` states Jest + React Testing Library are the unit-test stack, in the present tense | `frontend/package.json` has no `test` script and no test runner in any dependency block. Zero test files. |
| 7 | `frontend/docs/Frontend-Guidelines.md:403` documents `NEXT_PUBLIC_API_URL=http://localhost:5000` | The backend mounts every router under `/api/*`, so the value must carry the `/api` suffix. Every compose file, both CI workflows and the Dockerfile get this right; this doc and the in-code fallbacks at `frontend/src/lib/apiClient.ts:15` and `:196` do not. |
| 8 | `CLAUDE.md:501-503` presents an explicitly "verified via grep" exhaustive list of backend environment variables | `backend/src/controllers/salesController.js:602` reads `REPORT_TIMEZONE`, which the list omits. `CLAUDE.md:512-514` also still claims `REDIS_HOST`/`REDIS_PORT` feed a boot-log line; `backend/src/config/redis.js:62` now logs `REDIS_URL` and neither variable is read anywhere. |

**Decision required: none.** An agent may fix all eight by editing documentation.
Item 7 additionally requires a one-line code change to the two `apiClient.ts`
fallbacks, which is unambiguous.

## 10. Gap Detail Entries

---

### GAP-001 [SEC] Password reset does not revoke the session or the refresh token

> **FIXED 2026-09-06, Wave 1, PR #39.** `authController.resetPassword` now
> clears `user.refreshToken`. A regression test in `backend/tests/auth.test.js`
> asserts a refresh token captured before a reset is rejected afterwards and the
> stored value is cleared. Residual and deliberately out of scope: access tokens
> already issued stay valid for their 7-day life, which needs a
> `passwordChangedAt` claim checked in `protect`.

| Field | Value |
|---|---|
| Severity | S1 Critical |
| Complexity | XS |
| Difficulty | D1 Mechanical |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 8.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 2-4 |

**Location**
- `backend/src/controllers/authController.js:287-291` (primary)
- `backend/src/controllers/userController.js:254`, `:310` (the two paths that *do* clear it)
- `backend/src/models/User.js:73-76` (the field)
- `backend/tests/auth.test.js` (coverage absent)

**Evidence**

```js
// backend/src/controllers/authController.js:287-291
  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
```

`user.refreshToken` is not touched. `deactivateUser` and `changeUserPassword` in
`userController.js` both clear it explicitly.

**What is wrong**

`resetPassword` rewrites the password and clears the reset token, but leaves the
stored refresh token intact. `backend/src/controllers/authController.js:167`
compares the presented refresh cookie against that stored value, so an attacker
holding the pre-reset 30-day refresh cookie keeps minting fresh 7-day access
tokens. Separately, `protect` (`backend/src/middleware/auth.js:13-16`) verifies
only the signature and `isActive`; the JWT payload is `{ id }`
(`backend/src/utils/jwt.js:5`) with no `passwordChangedAt` or token version, so
access tokens already issued stay valid for their full 7 days regardless.

**Why it matters**

A shop owner notices someone else is placing orders, uses "forgot password",
sets a new one, and is told "Password reset successful". The attacker retains
full access for up to 30 more days. The only way to actually end that session is
to deactivate the account, which also locks out the legitimate owner. This is the
one flow whose entire purpose is remediating a compromise, and it is the only
password-changing path in the codebase that does not revoke the session.

**Intended behavior**

After a successful password reset, the user's stored `refreshToken` is cleared,
so the next `POST /auth/refresh-token` presenting the old cookie returns 401.

**Proposed fix**

Add `user.refreshToken = undefined;` alongside the two existing `undefined`
assignments before `await user.save()`. This matches exactly what
`changeUserPassword` already does, so no new pattern is introduced. Do not
attempt to invalidate outstanding access tokens in this change: that needs a
`passwordChangedAt` claim checked in `protect` and is a separate, larger piece of
work. Note the 7-day access-token residue in the commit message so it is not
mistaken for fully solved.

**Implementation checklist**

- [ ] In `backend/src/controllers/authController.js`, add `user.refreshToken = undefined;` immediately after line 290, before `await user.save()`.
- [ ] In `backend/tests/auth.test.js`, add a test: request a reset token, reset the password, then `POST /api/auth/refresh-token` with the pre-reset refresh token and assert 401.
- [ ] In `backend/tests/auth.test.js`, add a test asserting the user document's `refreshToken` is falsy after a successful reset.
- [ ] Run `npm test -- auth.test.js` from `backend/` and confirm both new tests pass.

**Acceptance criteria**

- [ ] A refresh token captured before a password reset returns 401 after the reset.
- [ ] `User.findById(id).select('+refreshToken')` returns a falsy `refreshToken` after a reset.
- [ ] The existing auth suite still passes unchanged.

**Verification commands**

```bash
cd backend && npm test -- auth.test.js
```

**Do not**

Do not add a `passwordChangedAt` claim or change `protect` in this gap. Do not
rotate refresh tokens on refresh (that is its own piece of work). Do not touch
`forgotPassword`: GAP-005 owns that function and a second agent may be editing
the same file.

**Rollback**

Revert the single line. No data or schema change, so nothing to migrate. Users
who reset a password between deploy and rollback will simply have a cleared
refresh token and must log in again once.

**Open questions**

None.

---

### GAP-002 [SEC] The offline outbox survives logout and replays under the next user

> **FIXED 2026-09-06, Wave 1, PR #39.** `clearOutboxStore()` added to
> `frontend/src/lib/offline/db.ts` and called from `clearOfflineCache()`.
> `handleLogout` warns before discarding, and counts `rejected` entries as well
> as unsent ones, because those are the rows awaiting a decision at `/sync`.

| Field | Value |
|---|---|
| Severity | S1 Critical |
| Complexity | XS |
| Difficulty | D2 Standard |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 8.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 2-5 |

**Location**
- `frontend/src/lib/offline/db.ts:188-195` (primary)
- `frontend/src/lib/offline/db.ts:27-37` (the store list that omits the outbox)
- `frontend/src/lib/offline/db.ts:66-72` (the comment stating the omission is deliberate)
- `frontend/src/lib/offline/cache.ts:76-78` (`clearOfflineCache`)
- `frontend/src/stores/authStore.ts:157` (the logout caller)
- `frontend/src/providers/AuthProvider.tsx:33` (`initOutboxSync`, which replays on mount)

**Evidence**

```ts
// frontend/src/lib/offline/db.ts:188-195
export async function clearAllStores(): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;

  const storeNames: string[] = [...OFFLINE_STORE_NAMES, META_STORE];
  const tx = db.transaction(storeNames, 'readwrite');
  await Promise.all([...storeNames.map((name) => tx.objectStore(name).clear()), tx.done]);
}
```

`OFFLINE_STORE_NAMES` (`db.ts:27-37`) lists nine mirror stores. The outbox is not
among them, and `db.ts:66-72` says so explicitly: "Deliberately not part of
`OFFLINE_STORE_NAMES`".

**What is wrong**

`authStore.logout()` calls `clearOfflineCache()`, which calls `clearAllStores()`,
which clears the nine mirror stores plus `meta` and leaves `outbox` untouched.
Queued sales and service orders, including customer name, phone, email, address,
line items and amounts, persist in IndexedDB across logout. `AuthProvider` then
runs `initOutboxSync(queryClient)` unconditionally on mount, which replays
immediately when `navigator.onLine` is true.

**Why it matters**

On a shared counter tablet, salesperson A takes two sales while the wifi is down
and logs out. Salesperson B logs in, possibly at a different branch. A's queued
orders replay against B's session and B's access token, and the `/sync` page
shows B the previous user's customer names and order amounts. CLAUDE.md states
the opposite as a guarantee: "the mirror never survives into the next person's
session". Because an offline order carries a branch id in its payload, a replay
under a user at another branch is also a cross-branch write that
`resolveBranchScope` will reject, so the orders are additionally at risk of being
marked permanently `rejected`.

**Intended behavior**

Logging out leaves no order payloads in IndexedDB. If queued work would be
destroyed by logging out, the user is told before it happens rather than after.

**Proposed fix**

Two reasonable approaches. **Recommended:** clear the outbox on logout as well,
and warn first. Add an exported `hasPendingOutboxEntries()` to `outbox.ts`, have
the logout path check it, and if entries exist show a confirmation naming the
count before clearing. The alternative, tagging each outbox entry with the user
id that enqueued it and replaying only matching entries, preserves the queued
sales but leaves another user's customer PII on the device and adds a filter to
every outbox read. Prefer clearing: the design target is a shift-length window,
not cross-user durability, and silently holding one user's customer data on a
shared device is the more serious problem.

**Implementation checklist**

- [ ] In `frontend/src/lib/offline/db.ts`, add an exported `clearOutboxStore()` that opens a `readwrite` transaction on `OUTBOX_STORE` and clears it.
- [ ] In `frontend/src/lib/offline/outbox.ts`, add an exported `countPendingEntries()` returning the number of entries whose status is `pending` or `syncing`.
- [ ] In `frontend/src/lib/offline/cache.ts`, call `clearOutboxStore()` from `clearOfflineCache()` after `clearAllStores()`.
- [ ] In `frontend/src/stores/authStore.ts`, before the logout request, call `countPendingEntries()`; when it is greater than zero, surface a confirmation naming the count and abort the logout if the user declines.
- [ ] Update the *Offline / PWA* section of `CLAUDE.md` to say the outbox is cleared on logout and that the user is warned when entries would be lost.

**Acceptance criteria**

- [ ] After logout, an IndexedDB inspection of the `outbox` store returns zero records.
- [ ] Logging out with at least one pending entry presents a confirmation naming the count; declining leaves the session and the queue intact.
- [ ] Logging out with an empty queue shows no confirmation.
- [ ] Logging out while offline still clears the outbox, because `authStore.logout()` clears in its `finally`.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
# Manual: queue an order offline, log out, confirm the warning, then in DevTools
# check Application > IndexedDB > talyer-offline > outbox is empty.
```

**Do not**

Do not bump `DB_VERSION`: no store is being added or removed, and an unnecessary
bump forces a schema upgrade on every existing browser. Do not change the outbox
entry shape. Do not touch `sync.ts`'s failure classification; GAP-022 owns that
file.

**Rollback**

Revert the four file edits. No schema change, so existing browsers are
unaffected. Any outbox entries already cleared by the new behaviour are gone;
that is the intended effect and is not recoverable, which is why the confirmation
step is part of this gap rather than a follow-up.

**Open questions**

None.

---

### GAP-003 [CODE] Every MongoServerError is answered 400, so offline replay discards real sales

> **FIXED 2026-09-09, Wave 3.** The duplicate-key branch is keyed on
> `err.code === 11000` alone. It also matched `err.name === 'MongoServerError'`,
> which is the name the driver gives *every* server-side failure: a failover, a
> stepdown, a write-concern timeout, an exhausted pool. All were answered 400
> "Field already exists", and the outbox treats a 4xx as permanent, so a Mongo
> blip during replay discarded real sales. Tests cover four transient codes, a
> MongoServerError with no code at all, and a code-11000 error the driver named
> something else.
>
> Moved into Wave 3 in the same change: GAP-022 depends on this entry and was
> scheduled a whole wave earlier, which is recorded under **Order overrides**.

| Field | Value |
|---|---|
| Severity | S1 Critical |
| Complexity | XS |
| Difficulty | D2 Standard |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 8.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | GAP-022 |
| Est. agent turns | 2-4 |

**Location**
- `backend/src/middleware/errorHandler.js:17-22` (primary)
- `frontend/src/lib/offline/sync.ts:124-128` (the consumer that makes it destructive)
- `backend/tests/errorHandler.test.js` (coverage absent for this branch)

**Evidence**

```js
// backend/src/middleware/errorHandler.js:17-21
  if (err.code === 11000 || err.name === 'MongoServerError') {
    const keyPattern = err.keyPattern || err.keyValue || {};
    const field = Object.keys(keyPattern)[0] || 'field';
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = { message, statusCode: 400 };
```

**What is wrong**

A genuine duplicate key already carries `code === 11000`, so the first clause is
sufficient. The added `|| err.name === 'MongoServerError'` widens the branch to
the entire MongoServerError family: write conflicts, `MaxTimeMSExpired`, replica
set step-downs, storage-quota exhaustion, and database auth failures. For all of
those `keyPattern` and `keyValue` are undefined, so `field` falls back to the
literal string and the client receives `400 {"message": "Field already exists"}`.

**Why it matters**

`frontend/src/lib/offline/sync.ts:124` classifies any status in [400, 500) as
`rejected`: permanent, never retried, moved past. During a Mongo failover or a
deploy-time blip, a tablet replaying its outbox therefore receives a 400 rather
than a 5xx, and a real sale is silently and permanently discarded, surfacing at
`/sync` as "Field already exists". CLAUDE.md states the 5xx-stays-pending rule
exists precisely so "a deploy would not discard real sales"; this line routes
around it. Secondarily, a full-storage outage produces zero 5xx anywhere, so
there is no error-rate signal at all.

**Intended behavior**

Only `err.code === 11000` maps to 400 with a duplicate-key message. Every other
MongoServerError falls through to the generic 500 handler, so the outbox holds
the entry as `pending` and retries.

**Proposed fix**

Delete `|| err.name === 'MongoServerError'` from the condition. The comment above
it explains the intent was to catch duplicates raised as `MongoServerError`, but
those already carry `code === 11000`, so nothing is lost. Do not attempt to
enumerate other Mongo error codes into specific statuses; falling through to 500
is the correct and safe default for the outbox contract.

**Implementation checklist**

- [ ] In `backend/src/middleware/errorHandler.js`, change line 17 to test `err.code === 11000` only, and update the comment above it.
- [ ] In `backend/tests/errorHandler.test.js`, add a test throwing an error with `name: 'MongoServerError'` and no `code`, asserting a 500 response.
- [ ] In `backend/tests/errorHandler.test.js`, add a test throwing an error with `code: 11000` and a `keyPattern`, asserting 400 and the field-named message.
- [ ] Run `npm test -- errorHandler.test.js` from `backend/` and confirm both pass.

**Acceptance criteria**

- [ ] An error with `name: 'MongoServerError'` and no `code` yields 500, and in production yields the message `Server Error`.
- [ ] An error with `code: 11000` still yields 400 naming the duplicated field.
- [ ] The full backend suite passes with no other change.

**Verification commands**

```bash
cd backend && npm test -- errorHandler.test.js && npm test
```

**Do not**

Do not change `frontend/src/lib/offline/sync.ts`: its 4xx-permanent rule is
correct and is what makes this backend bug destructive. Do not add retry logic to
the backend. Do not touch the `CastError` or `ValidationError` branches.

**Rollback**

Revert the one-line condition change. No data effect.

**Open questions**

None.

---

### GAP-004 [SEC] Mongo credentials fail open to a change-me default published in a public repo

| Field | Value |
|---|---|
| Severity | S1 Critical |
| Complexity | XS |
| Difficulty | D1 Mechanical |
| Risk | R2 |
| Confidence | C1 Verified |
| Priority score | 8.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 1-3 |

**Location**
- `docker-compose.yml:7` and `:40` (primary)
- `docker-compose.yml:42`, `:44` (the correct pattern, used for the JWT secrets)
- `docs/DEPLOYMENT.md:164-168` (documents the exposure without closing it)

**Evidence**

```yaml
# docker-compose.yml:7 and :40
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-change-me}
      MONGODB_URI: ${MONGODB_URI:-mongodb://talyer:change-me@mongo:27017/talyer-e-inventory?authSource=admin}
# contrast, docker-compose.yml:42
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
```

**What is wrong**

Compose's `:?` operator aborts `up` when a variable is unset, and `:-` silently
substitutes a default. The two JWT secrets use `:?`; the two Mongo credentials
use `:-`. A deploy that omits `MONGODB_URI` from its GitHub Environment therefore
comes up healthy on the credential `talyer:change-me`, which is written verbatim
in a file in a public repository.

> **FIXED 2026-09-06, Wave 1, PR #39.** Both Mongo variables now use `:?` and a
> deploy that omits either aborts at `docker compose up` instead of silently
> starting on `talyer:change-me`. Set `MONGODB_URI` and
> `MONGO_INITDB_ROOT_PASSWORD` in every GitHub Environment before deploying.
>
> **SEVERITY NOTE, revised twice on 2026-09-06.** This entry rated the exposure
> S1 because the fallback credential sits in a public repository, citing
> `docs/DEPLOYMENT.md:46`. Mid-remediation the repository was found to be
> private, which briefly made that basis look wrong and the rating too high. It
> was then made public again the same day, having drifted private around
> 2026-08-30. So the original S1 basis holds: the default credential was, and
> is, readable by anyone. Recorded here because the intermediate reasoning is in
> the git history of this file and would otherwise look like an unexplained
> reversal.

**Why it matters**

Anyone with read access to the repository can read the fallback credential out
of `docker-compose.yml`. Mongo publishes no host port
in any overlay, so reaching it requires a shell on the VPS or another container
on the same Compose network, but staging and production share one box
(`docs/DEPLOYMENT.md:28-37`), so a compromise of the staging stack reaches the
production database with a credential that took no effort to discover. The
failure is silent: the stack reports healthy and the deploy workflow reports
success.

**Intended behavior**

A deploy missing either Mongo credential fails loudly at `docker compose up`,
the same way a missing JWT secret already does.

**Proposed fix**

Change both `:-` defaults to `:?` with a message, matching lines 42 and 44
exactly. This is the same one-character-class change in two places. Consider
whether the local-development path needs a default; it does not, because
`README.md:423` already instructs `cp .env.example .env`, and `.env.example`
carries values for both variables.

**Implementation checklist**

- [ ] In `docker-compose.yml` line 7, replace the `:-change-me` default with `:?MONGO_INITDB_ROOT_PASSWORD is required`.
- [ ] In `docker-compose.yml` line 40, replace the `:-mongodb://...` default with `:?MONGODB_URI is required`.
- [ ] Confirm `.env.example` defines both variables so the documented local flow still works.
- [ ] Run `docker compose config` with both variables unset and confirm it exits non-zero naming the missing variable.
- [ ] Update `docs/DEPLOYMENT.md:164-168` to state the fail-open condition is now closed.

**Acceptance criteria**

- [ ] `docker compose config` with `MONGODB_URI` unset exits non-zero and names it.
- [ ] `docker compose config` with all four secrets set succeeds and emits no `change-me` string.
- [ ] `grep -c 'change-me' docker-compose.yml` returns 0.

**Verification commands**

```bash
# From the repo root, with a shell that has none of the four secrets exported:
docker compose config; echo "exit=$?"   # expect non-zero, naming MONGODB_URI
grep -n 'change-me' docker-compose.yml  # expect no output
```

**Do not**

Do not edit `docker-compose.staging.yml` or `docker-compose.production.yml`, which
inherit from the base file. Do not add the real credential to any tracked file.
Do not change the JWT lines, which are already correct.

**Rollback**

Revert the two lines. Note that after this change a deploy with missing secrets
will fail rather than silently succeed, which is the point; rolling back to
restore a deploy is the wrong response to that failure.

**Open questions**

None.

---

### GAP-005 [SEC] forgot-password returns the reset token unless NODE_ENV is exactly production

> **FIXED 2026-09-08, Wave 2.** The gate is now an affirmative test for
> `development` or `test` via `backend/src/utils/environment.js`, applied to
> both the token echo and the errorHandler message/stack. Anything else,
> including an unset NODE_ENV, is treated as production. Tests cover `staging`,
> `PRODUCTION`, `prod`, a typo, an empty string and unset, and assert the token
> is still *minted* so an email transport would work.
>
> Residual, deliberately out of scope: `getRefreshTokenCookieOptions` in
> `authController.js` derives the cookie's `secure` and `sameSite` from the same
> `=== 'production'` test and has the same fail-open shape. It was left alone
> because flipping it would set `Secure` on plain-HTTP localhost and break local
> login. It needs its own entry.

| Field | Value |
|---|---|
| Severity | S2 Major |
| Complexity | XS |
| Difficulty | D1 Mechanical |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 5.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 2-4 |

**Location**
- `backend/src/controllers/authController.js:250-254` (primary)
- `backend/src/middleware/errorHandler.js:44-56` (the same fail-open shape)
- `backend/src/routes/authRoutes.js:110` (the route)

**Evidence**

```js
// backend/src/controllers/authController.js:250-254
  if (process.env.NODE_ENV === 'production') {
    return ApiResponse.success(res, 200, genericMessage);
  }

  return ApiResponse.success(res, 200, genericMessage, { resetToken });
```

**What is wrong**

The guard is fail-open on an environment variable with no default. `NODE_ENV`
unset, or set to `PRODUCTION`, `prod`, or `development`, all take the second
branch. An unauthenticated caller posts any email address and receives the
plaintext reset token in `data.resetToken`, which `POST /auth/reset-password`
accepts directly. This is an unauthenticated account-takeover primitive for every
account including admins, rate-limited only to ten attempts per IP per 15 minutes.

**Why it matters**

The committed compose files do set `NODE_ENV: production`, so a containerised
deploy is safe today. The exposure is a bare-metal run, a systemd unit without
`Environment=NODE_ENV=production`, a PM2 default, or any host where the variable
is spelled differently. One such deploy turns the password-recovery endpoint into
full account takeover, and nothing logs or signals that it has happened.

**Intended behavior**

The token is echoed only when the process is explicitly and affirmatively in a
non-production mode, so an unset or misspelled `NODE_ENV` is treated as
production.

**Proposed fix**

Invert the condition to fail closed: echo the token only when `NODE_ENV` is
exactly `development` or `test`, and return the generic message in every other
case. This preserves the local and test ergonomics the comment at lines 248-249
describes while removing the fail-open. Apply the same inversion to
`errorHandler.js:44-56`, which gates stack-trace exposure on the identical
condition. An alternative, adding a startup assertion that `NODE_ENV` is one of a
known set, is worth doing later but is a larger change and does not by itself fix
this branch.

**Implementation checklist**

- [ ] In `backend/src/controllers/authController.js`, replace the production check at line 250 with a positive test for `development` or `test`, returning the token only in that case.
- [ ] In `backend/src/middleware/errorHandler.js`, apply the same inversion to the 5xx message and stack-trace gate at lines 44-56.
- [ ] In `backend/tests/auth.test.js`, add a test that sets `NODE_ENV` to an unrecognised value, calls `POST /api/auth/forgot-password`, and asserts the response body carries no `resetToken`.
- [ ] In `backend/tests/errorHandler.test.js`, add the matching test for an unrecognised `NODE_ENV` asserting the message is `Server Error` and no `stack` is present.
- [ ] Run `npm test -- auth.test.js errorHandler.test.js` from `backend/`.

**Acceptance criteria**

- [ ] With `NODE_ENV` unset, `POST /api/auth/forgot-password` returns 200 with no `resetToken` in the body.
- [ ] With `NODE_ENV=test`, the token is still echoed, so the existing auth suite passes unchanged.
- [ ] With `NODE_ENV` unset, a thrown 500 returns the message `Server Error` and no stack.

**Verification commands**

```bash
cd backend && npm test -- auth.test.js errorHandler.test.js
```

**Do not**

Do not remove the development echo entirely: the suites depend on it and there is
no mail transport configured. Do not touch `resetPassword` itself; GAP-001 owns
that function. Do not add email sending in this gap.

**Rollback**

Revert both conditions. No data effect.

**Open questions**

None.

---

### GAP-006 [CODE] Password reset is impossible: the client sends token, the API requires resetToken

> **FIXED 2026-09-08, Wave 2.** The client field is renamed to `resetToken` in
> `frontend/src/types/auth.ts` and the reset page. The page now renders the
> first entry of `errors[]` before falling back to `message`.
>
> Doing that turned up a second contract drift: `ApiResponse.errors` was typed
> `Record<string, string[]>`, but `backend/src/middleware/validate.js` sends an
> array of `{ field, message, value }`. Nothing in the frontend read the field,
> so the drift had gone unnoticed. `frontend/src/types/api.ts` now declares an
> `ApiFieldError[]` matching what the server actually sends.

| Field | Value |
|---|---|
| Severity | S2 Major |
| Complexity | XS |
| Difficulty | D1 Mechanical |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 5.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 2-4 |

**Location**
- `frontend/src/types/auth.ts:68-71` (primary)
- `frontend/src/app/(public)/(auth)/reset-password/page.tsx:60-63`
- `backend/src/routes/authRoutes.js:82-83`
- `backend/src/controllers/authController.js:261`

**Evidence**

```ts
// frontend/src/types/auth.ts:68-71
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
```

```js
// backend/src/routes/authRoutes.js:82-83
  body('resetToken')
    .notEmpty().withMessage('Reset token is required'),
// backend/src/controllers/authController.js:261
  const { resetToken, newPassword } = req.body;
```

**What is wrong**

The request body carries `token`; the validator and the controller both read
`resetToken`. The field the server looks for is never present, so
`express-validator` rejects every request. `authRoutes.js` is wired with
`validate.js`, which answers with a generic `message: 'Validation failed'` and
puts the per-field detail in `errors[]`, which the reset page does not read.

**Why it matters**

Password reset is completely non-functional end to end. A user who forgets their
password follows the emailed link, submits a new password, and sees "Validation
failed" with no indication of what is wrong and no way to recover. Combined with
GAP-001, the account-recovery path is both broken and, when it does work,
ineffective at ending an attacker's session.

**Intended behavior**

Submitting the reset form with a valid token sets the new password and returns
200, and a genuine validation failure shows the specific field message.

**Proposed fix**

Rename the client-side field to `resetToken` rather than changing the API. The
backend name is used by the validator, the controller, and any existing
integration; the frontend name appears in exactly two places. Additionally make
the page surface `errors[]`, since a generic "Validation failed" is what hid this
bug in the first place. Do not switch `authRoutes.js` from `validate.js` to
`validationHandler.js`: that changes the payload shape for every auth route.

**Implementation checklist**

- [ ] In `frontend/src/types/auth.ts`, rename the `token` field of `ResetPasswordRequest` to `resetToken`.
- [ ] In `frontend/src/app/(public)/(auth)/reset-password/page.tsx`, change the `authService.resetPassword` call to pass `resetToken`.
- [ ] In the same page, extend the error handler to render the first entry of `errors[]` when present, falling back to `message`.
- [ ] In `frontend/src/lib/services/authService.ts`, confirm `resetPassword` forwards its argument unchanged and adjust the type import if needed.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.
- [ ] Manually verify: request a reset in a non-production environment, take the echoed token, submit the form, confirm 200 and that the new password logs in.

**Acceptance criteria**

- [ ] Submitting the reset form with a valid token returns 200 and the new password works at login.
- [ ] Submitting with an expired or wrong token shows the specific server message, not a bare "Validation failed".
- [ ] `grep -rn "token:" frontend/src/app/\(public\)/\(auth\)/reset-password/` shows no remaining bare `token` field in the request payload.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not rename the backend field. Do not change `validate.js` or swap the
validation middleware on `authRoutes.js`. Do not alter the reset-token hashing or
the 10-minute expiry in `backend/src/models/User.js`.

**Rollback**

Revert the two frontend files. Password reset returns to being broken, which is
the pre-change state.

**Open questions**

None.

---

### GAP-007 [SEC] GET /stock/movements/branch/:branchId has no authorize() guard

> **FIXED 2026-09-06, Wave 1, PR #39.** `authorize(USER_ROLES.ADMIN,
> USER_ROLES.SALESPERSON)` added to the route. Regression tests assert a
> mechanic is refused and a salesperson reaches only their own branch.

| Field | Value |
|---|---|
| Severity | S2 Major |
| Complexity | XS |
| Difficulty | D1 Mechanical |
| Risk | R1 |
| Confidence | C1 Verified |
| Priority score | 5.0 |
| Agent suitability | AGENT-READY |
| Depends on | none |
| Blocks | none |
| Est. agent turns | 2-4 |

**Location**
- `backend/src/routes/stockRoutes.js:130-137` (primary)
- `backend/src/routes/stockRoutes.js:103-108`, `:111-118`, `:121-128` (the three siblings that do guard)
- `backend/src/controllers/stockController.js:1071-1116` (the controller, whose docblock claims admin-only)

**Evidence**

```js
// backend/src/routes/stockRoutes.js:130-137
router.get(
  '/movements/branch/:branchId',
  protect,
  checkBranchAccess,
  branchIdValidation,
  handleValidationErrors,
  stockController.getMovementsByBranch
);
```

Every neighbouring movement route names its roles: `/movements` is
`authorize(USER_ROLES.ADMIN)`, and both `/movements/stock/:stockId` and
`/movements/product/:productId` are `authorize(ADMIN, SALESPERSON)`.

**What is wrong**

This route's only gate is `protect` plus `checkBranchAccess`, and
`checkBranchAccess` compares branch ids without consulting the role. Any
authenticated user holding the requested branch passes. The controller's own
docblock says `@access Private (Admin + Branch Access)`, so the route does not do
what its own documentation states.

**Why it matters**

A mechanic, a role otherwise confined to their own assigned service orders, can
pull the complete paginated stock-movement ledger for their branch: every sale
with quantities and timing, every restock with supplier attribution, every
adjustment with its free-text reason, and the `performedBy` name and email of
whoever did it. That is the branch's entire purchasing and sales activity.
Customers are excluded only incidentally, because they hold no branch assignment.

**Intended behavior**

The route admits only `admin` and `salesperson`, matching its two siblings and
its own docblock, and continues to apply `checkBranchAccess` on top.

**Proposed fix**

Insert `authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON)` between `protect` and
`checkBranchAccess`, matching the exact shape of the sibling route at
`stockRoutes.js:111-118`. Choose ADMIN+SALESPERSON rather than ADMIN-only because
that is what the two per-entity movement routes already grant and because the
sibling branch-stock read at `stockRoutes.js:179-187` uses the same pair; making
this one admin-only would be a stricter change than the surrounding code implies
and would need a product decision.

**Implementation checklist**

- [ ] In `backend/src/routes/stockRoutes.js`, add `authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),` after `protect,` in the `/movements/branch/:branchId` route.
- [ ] In `backend/tests/stock.test.js`, add a test asserting a mechanic token receives 403 from `GET /api/stock/movements/branch/:branchId`.
- [ ] In `backend/tests/stock.test.js`, add a test asserting a salesperson receives 200 for their own branch and 403 for another branch.
- [ ] Run `npm test -- stock.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A mechanic token receives 403 from this route even for their own branch.
- [ ] A salesperson receives 200 for their own branch and 403 for another.
- [ ] An admin still receives 200 for any branch.

**Verification commands**

```bash
cd backend && npm test -- stock.test.js
```

**Do not**

Do not change `checkBranchAccess` or `branchAccess.js`. Do not alter the three
sibling movement routes. Do not touch the controller: GAP-026 covers pagination
on other reads and a second agent may be in `stockController.js`.

**Rollback**

Revert the single added line. Mechanics regain the access they have today.

**Open questions**

None.

---

### GAP-008 [SEC] Any authenticated customer can enumerate branch managers' names and emails

> **FIXED 2026-09-08, Wave 2.** `canSeeStaffIdentity` in `branchController.js`
> gates the manager populate on both the list and detail reads; a customer gets
> the branch with `manager` absent. The route stays open to customers.
>
> The entry named one cache to fix. There are **two**, and both were role-blind:
> the route-level `cacheMiddleware`, which keys on `req.originalUrl`, and an
> internal `CacheUtil.generateKey('branches', 'list', ...)` inside
> `getBranches`. Fixing only the middleware would have left the controller cache
> serving one role's shape to the other. Both now carry the role, and there are
> tests for both directions: a staff request must not leak the manager to a
> customer afterwards, and a customer request must not blank it out for staff.

Severity S2 Major | Complexity XS | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `backend/src/routes/branchRoutes.js:88-93` (primary)
- `backend/src/controllers/branchController.js:57` and `:90` (the populate calls)
- `backend/src/controllers/authController.js:299-322` (public customer registration)

**Evidence**

```js
// backend/src/controllers/branchController.js:55-57
    Branch.find(query)
      .populate('manager', 'name email')
// backend/src/routes/branchRoutes.js:88-93: protect only, no authorize
router.get('/', protect, cacheMiddleware('branches', CACHE_TTL.LONG), getBranches);
```

**What is wrong**

`POST /auth/register-customer` is public and unconditionally mints a `customer`
account. `GET /api/branches` and `GET /api/branches/:id` require only `protect`,
with no `authorize`, and both populate the manager sub-document with `name` and
`email`; the detail route additionally adds `role` and a `staffCount` virtual.
Every other domain router gates its reads by role.

**Why it matters**

Anyone on the internet registers a customer account and immediately pulls a
directory of every branch with its manager's real name and work email. That is a
ready-made target list for credential phishing aimed at precisely the accounts
holding elevated roles, and the shop has no way to detect the enumeration.

**Intended behavior**

A customer can see the information a customer needs (branch name, code, address,
opening hours) and cannot see staff identities. Staff roles continue to see the
manager.

**Proposed fix**

Do not add `authorize` to the route: customers legitimately need the branch list.
Instead make the populate conditional on the caller's role in the controller.
When `req.user.role === USER_ROLES.CUSTOMER`, skip the `manager` populate and
strip the field from the response; otherwise keep today's behaviour. The
alternative, a second customer-facing endpoint, duplicates the branch read for no
benefit. Note the route is cached by `cacheMiddleware`, which keys on
`req.originalUrl` and therefore does **not** vary by role, so the cache key must
gain a role component or the first caller's shape will be served to everyone.

**Implementation checklist**

- [ ] In `backend/src/controllers/branchController.js`, gate the `.populate('manager', 'name email')` at line 57 on the caller not being a customer.
- [ ] In `backend/src/controllers/branchController.js`, apply the same gate to the single-branch read at line 90, including the `role` field.
- [ ] In `backend/src/middleware/cache.js`, include `req.user.role` in the generated cache key so cached branch responses do not cross role boundaries.
- [ ] In `backend/tests/branch.test.js`, add a test asserting a customer token receives branches with no `manager` field.
- [ ] In `backend/tests/branch.test.js`, add a test asserting a salesperson token still receives the populated `manager`.
- [ ] Run `npm test -- branch.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A customer token receives 200 from `GET /api/branches` with no `manager` key on any element.
- [ ] An admin or salesperson token still receives the populated manager name and email.
- [ ] Two sequential requests, one customer and one admin, return different shapes, proving the cache key varies by role.

**Verification commands**

```bash
cd backend && npm test -- branch.test.js
```

**Do not**

Do not add `authorize` to the branch list route: customers need it. Do not remove
the manager relationship from the model. Do not change `cacheMiddleware`'s TTL.

**Rollback**

Revert the controller and cache-key changes. Cached entries written under the new
key scheme become unreachable rather than wrong, and expire on their own TTL.

**Open questions**

Should a customer see the branch `phone` and `email` contact fields? I left them
untouched because a customer plausibly needs to call the shop, but that is a
product call, which is why this entry is AGENT-ASSISTED rather than AGENT-READY.

---

### GAP-009 [CODE] normalizeEmail on admin user routes but not on login locks accounts out

> **FIXED 2026-09-09, Wave 3.** All four `.normalizeEmail()` calls are gone;
> `grep -rn normalizeEmail backend/src` is empty. The schema's
> `lowercase: true` plus `.trim()` is the whole policy now, so the address an
> admin types is the address that authenticates. Tests assert a dotted,
> subaddressed Gmail address survives creation unchanged, survives an unrelated
> edit, and is still lowercased.
>
> The open question below is unchanged and still needs a human: accounts created
> before this change whose stored address was already rewritten cannot log in
> with the credentials they were given, and nothing here repairs them.

Severity S2 Major | Complexity XS | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `backend/src/routes/userRoutes.js:62` and `:86` (primary)
- `backend/src/routes/branchRoutes.js:54` and `:80` (same treatment)
- `backend/src/routes/authRoutes.js` (login and register chains, which do **not** normalise)
- `backend/src/controllers/authController.js:108` (the lookup)

**Evidence**

```js
// backend/src/routes/userRoutes.js:58-62
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail({ allow_utf8_local_part: false }).withMessage('Please provide a valid email')
    .normalizeEmail(),
```

`grep -n normalizeEmail backend/src/routes/*.js` returns hits only in
`userRoutes.js` and `branchRoutes.js`. `authRoutes.js` has none.

**What is wrong**

`validator.js`'s `normalizeEmail()` defaults to `gmail_remove_dots: true` and
`gmail_remove_subaddress: true`. `POST /api/users` and `PUT /api/users/:id`
therefore rewrite `john.doe+shop@gmail.com` to `johndoe@gmail.com` before storing
it. `POST /auth/login` does not normalise, so `User.findOne({ email })` searches
for the address the user was actually given. The schema's `lowercase: true`
handles case but not dots or subaddressing.

**Why it matters**

An admin creates a salesperson as `maria.santos+branch2@gmail.com`, hands over
those credentials, and the account cannot log in. The error is "Invalid
credentials" with no hint of the cause. Worse, `updateUser` applies the same
normalisation, so editing an unrelated field on a working account can rewrite its
email and lock the user out retroactively.

**Intended behavior**

The address stored at creation is the address that authenticates at login. One
normalisation policy applies everywhere or nowhere.

**Proposed fix**

Remove `.normalizeEmail()` from all four route sites and rely on the schema's
`lowercase: true` plus `.trim()`. Aggressive normalisation is the wrong default
for a system where an admin hands credentials to a staff member: subaddressing is
a legitimate way to route mail per branch, and silently rewriting it is
surprising. The alternative, adding `.normalizeEmail()` to login and register
too, is internally consistent but still destroys the address the user typed and
would not repair accounts already stored in normalised form. Neither option
repairs existing rows; see Open questions.

**Implementation checklist**

- [ ] In `backend/src/routes/userRoutes.js`, remove `.normalizeEmail()` from the chains at lines 62 and 86.
- [ ] In `backend/src/routes/branchRoutes.js`, remove `.normalizeEmail()` at lines 54 and 80.
- [ ] In `backend/tests/user.test.js`, add a test creating a user with a dotted, subaddressed Gmail address and asserting the stored `email` matches the input exactly, lowercased.
- [ ] In `backend/tests/auth.test.js`, add a test that a user created with such an address can log in with it.
- [ ] Run `npm test -- user.test.js auth.test.js` from `backend/`.

**Acceptance criteria**

- [ ] `POST /api/users` with `a.b+tag@gmail.com` stores exactly `a.b+tag@gmail.com`.
- [ ] That user logs in successfully with the same string.
- [ ] `grep -rn normalizeEmail backend/src` returns no matches.

**Verification commands**

```bash
cd backend && npm test -- user.test.js auth.test.js
grep -rn "normalizeEmail" backend/src   # expect no output
```

**Do not**

Do not add `.normalizeEmail()` to `authRoutes.js`. Do not write a data migration
in this gap. Do not change the `User` schema's `lowercase: true`.

**Rollback**

Revert the four line removals. Accounts created in the interim keep their
un-normalised addresses and continue to work, because login does not normalise
either way.

**Open questions**

Existing users whose stored address was already normalised at creation cannot log
in with the address they were given, and this change does not repair them. Does
the owner want a one-off report listing accounts whose stored email differs from
what an admin would have typed? That needs the original values, which are not
recorded anywhere, so the realistic remedy is an admin-driven password-and-email
correction per affected account. A human must decide whether that list is worth
producing.

---

### GAP-010 [CODE] authService.refreshToken omits the CSRF header, so session restore always 403s

> **FIXED 2026-09-08, Wave 2.** `csrfHeaders()` is exported from
> `frontend/src/lib/apiClient.ts` and used both by the 401 interceptor and by
> `authService.refreshToken()`, which previously sent no header at all.

Severity S2 Major | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `frontend/src/lib/services/authService.ts:110-113` (primary)
- `frontend/src/lib/apiClient.ts:194-201` (the interceptor that does send the header)
- `frontend/src/stores/authStore.ts:191` (the caller)
- `backend/src/middleware/csrf.js:126-140` (`requireCsrfToken`)

**Evidence**

```ts
// frontend/src/lib/services/authService.ts:110-113
  async refreshToken(): Promise<ApiResponse<RefreshTokenResponse>> {
    const { data } = await apiClient.post<ApiResponse<RefreshTokenResponse>>(
      '/auth/refresh-token'
    );
```

**What is wrong**

`requireCsrfToken` rejects with 403 when an `XSRF-TOKEN` cookie exists and the
`X-XSRF-TOKEN` header does not echo it. `ensureCsrfToken` is mounted router-wide
on `/api/auth`, so that cookie exists after any auth call. Only the `apiClient`
response interceptor attaches the header; this service method does not.
`authStore.initialize()` calls it directly on the path where `localStorage` holds
no access token, and `/auth/refresh-token` is in `AUTH_ENDPOINTS`, so the
interceptor does not retry it.

**Why it matters**

A user whose `localStorage` was cleared but whose 30-day refresh cookie is still
valid: a private window, storage eviction, "clear site data", or a browser that
evicts under pressure: gets a 403, `initialize()`'s catch clears the tokens, and
they are bounced to `/login` instead of being silently restored. The refresh
cookie exists precisely to make that restore work.

**Intended behavior**

`authService.refreshToken()` sends `X-XSRF-TOKEN` echoing the readable
`XSRF-TOKEN` cookie, so a valid refresh cookie restores the session.

**Proposed fix**

Extract the cookie-read-and-header-set logic that `apiClient.ts:194-201` already
performs into an exported helper, and call it from both places. Duplicating the
few lines inline in `authService.ts` would work but would leave two copies of a
security-relevant detail that must not drift.

**Implementation checklist**

- [ ] In `frontend/src/lib/apiClient.ts`, export a `csrfHeaders()` helper returning the `X-XSRF-TOKEN` header object, or an empty object when no cookie is readable.
- [ ] In `frontend/src/lib/apiClient.ts`, use that helper at line 194-201 in place of the inline logic.
- [ ] In `frontend/src/lib/services/authService.ts`, pass `{ headers: csrfHeaders() }` as the third argument to the `refreshToken` post.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.
- [ ] Manually verify: log in, clear only `localStorage`, reload, and confirm the session restores rather than redirecting to `/login`.

**Acceptance criteria**

- [ ] With a valid refresh cookie and empty `localStorage`, a page load restores the session and does not redirect to `/login`.
- [ ] With no `XSRF-TOKEN` cookie at all, the request still succeeds, because the backend's migration allowance admits it.
- [ ] The interceptor-driven refresh path continues to work unchanged.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not remove `/auth/refresh-token` from `AUTH_ENDPOINTS`: a 401 there genuinely
means the refresh failed and must not be retried. Do not change the backend CSRF
middleware or its migration allowance.

**Rollback**

Revert the three edits. Session restore returns to failing, which is today's
behaviour.

**Open questions**

None.

---

### GAP-011 [OPS] Branch protection requires four check names the workflows can never report

Severity S2 Major | Complexity XS | Difficulty D1 Mechanical | Risk R2 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `.github/branch-protection.json:8-13` (primary)
- `.github/workflows/security.yml:20-26` and `:71-77`
- `CLAUDE.md`, *CI* section, which both documents the required names and warns about this exact failure

**Evidence**

```json
// .github/branch-protection.json:8-13
    "dependency-audit (backend)",
    "dependency-audit (frontend)",
    ...
    "image-scan (backend)",
    "image-scan (frontend)"
```

```yaml
# .github/workflows/security.yml:20-26
  dependency-audit:
    name: dependency-audit
    strategy:
      matrix:
        package: [backend, frontend]
```

> **DISPROVEN 2026-09-06. No change required; do not action this entry.**
> The premise was wrong. GitHub appends the matrix values to a matrix job's
> check-run name *even when* `jobs.<id>.name` is set, in order to keep the legs
> distinguishable. Observed on the Security run for `master` at `d92d38f`, which
> predates any edit to `security.yml`: the check runs are already named
> `dependency-audit (backend)`, `dependency-audit (frontend)`,
> `image-scan (backend)` and `image-scan (frontend)`, exactly matching
> `.github/branch-protection.json`. A trial edit adding `${{ matrix.package }}`
> to both names produced identical check names, confirming the suffix is not
> doubled and the edit is a no-op. It was reverted.
>
> The rest of this entry is left as written, for the record of what was
> believed. The real blockers to enabling branch protection are the genuinely
> failing checks, not the names. Verified separately: `codeql` and both
> `image-scan` legs fail because `security.yml` did not grant `actions: read`,
> which `github/codeql-action` needs while uploading SARIF, and `secret-scan`
> fails on pull requests because gitleaks needs `pull-requests: read`. Those are
> fixed in the same change that reverted this one.

**What is wrong**

GitHub appends `(<matrix values>)` to a check name only when `jobs.<id>.name` is
absent. Both jobs set a static `name:` containing no matrix expression, so every
matrix leg publishes under the bare name `dependency-audit` or `image-scan`. The
four parenthesised contexts named in the protection file never appear in the
check-run list.

**Why it matters**

`CLAUDE.md` instructs the operator to enable protection with
`gh api -X PUT ... --input .github/branch-protection.json`. The moment that runs,
every PR to `master` blocks permanently on four required checks that are
"Expected" and never arrive. `enforce_admins: false` means an admin can bypass,
but bypassing means skipping the entire gate rather than the four broken entries.
The same CLAUDE.md section warns that mismatched names "block permanently" and
then ships the mismatch.

**Intended behavior**

Enabling branch protection from the committed file yields a repository where a
correct PR can merge and a failing one cannot.

**Proposed fix**

Make the workflow names carry the matrix value: set
`name: dependency-audit (${{ matrix.package }})` and
`name: image-scan (${{ matrix.package }})`. This preserves the per-package
granularity that the protection file wants and that `CLAUDE.md` documents.
The alternative, editing the protection file down to the two bare names, is
fewer characters but loses the ability to require both legs and silently accepts
a green frontend leg while the backend leg fails.

**Implementation checklist**

- [ ] In `.github/workflows/security.yml`, change the `dependency-audit` job's `name:` at line 21 to include `(${{ matrix.package }})`.
- [ ] In `.github/workflows/security.yml`, change the `image-scan` job's `name:` at line 72 the same way.
- [ ] Push the branch and read the resulting check-run names on the PR, confirming all four parenthesised names appear.
- [ ] Only after confirming, note in `docs/DEPLOYMENT.md` that branch protection is now safe to enable.

**Acceptance criteria**

- [ ] A PR shows check runs literally named `dependency-audit (backend)`, `dependency-audit (frontend)`, `image-scan (backend)`, `image-scan (frontend)`.
- [ ] Every context string in `.github/branch-protection.json` matches a check-run name observed on a real PR.
- [ ] `secret-scan`, `codeql`, `backend-test`, `frontend-build` and `docker-build` names are unchanged.

**Verification commands**

```bash
gh pr checks <PR-number> --json name,state --jq '.[].name' | sort
# Compare against:
jq -r '.required_status_checks.contexts[]' .github/branch-protection.json | sort
```

**Do not**

Do not enable branch protection as part of this gap: that is a separate,
deliberate operator action once the names are verified. Do not remove the matrix.
Do not touch `dependabot-auto-merge.yml`; GAP-012 owns it.

**Rollback**

Revert the two `name:` lines. Since protection is not enabled, there is no
production impact either way.

**Open questions**

None.

---

### GAP-012 [SEC] Dependabot auto-merge treats a still-running security check as passing

> **FIXED 2026-09-06, Wave 1, PR #39.** The gate now requires a terminal success
> from every check, waits for pending ones under a bounded timeout, excludes its
> own check run so it cannot wait on itself, and tolerates the non-zero exit
> `gh pr checks` returns for a non-passing aggregate state.
>
> One correction to this entry's reasoning: because `gh pr checks` sets its exit
> code from the aggregate state, the old gate under `set -e` most likely failed
> its step rather than merging, so the practical symptom was eligible pull
> requests never auto-merging rather than merging unsafely. The rewrite is
> correct under either reading.

Severity S2 Major | Complexity XS | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 3-5

**Location**
- `.github/workflows/dependabot-auto-merge.yml:100-109` (primary)
- `.github/workflows/dependabot-auto-merge.yml:25-27` (the `workflow_run` trigger)
- `.github/workflows/security.yml` (the jobs that are still running when the gate evaluates)

**Evidence**

```bash
# .github/workflows/dependabot-auto-merge.yml:100-104
  failing=$(gh pr checks "$PR" --repo "$REPO" --json name,state \
    --jq '[.[] | select(.state == "FAILURE" or .state == "ERROR")] | length')
  ...
  if [ "$failing" != "0" ]; then
```

**What is wrong**

The gate counts only `FAILURE` and `ERROR`. A check in `PENDING`, `IN_PROGRESS`
or `QUEUED` contributes zero to that count, so the step reports success and the
next step squash-merges. The workflow is triggered by `workflow_run` on CI
completion, and CI (`backend-test`, `frontend-build`, `docker-build`) finishes
well before the Security workflow's `codeql` analysis and its two matrixed Trivy
`image-scan` builds.

**Why it matters**

A Dependabot minor or patch bump that CI passes but that CodeQL or
`dependency-audit` would have failed gets merged to `master` while those jobs are
still queued. The workflow's own comment states the intent this defeats:
"Merging while one of those is red would make this automation a way to bypass
them." The bypass is not hypothetical; it is the normal timing.

**Intended behavior**

Auto-merge proceeds only when every check on the PR has reached a terminal state
and none of them failed. A still-running check blocks the merge until it finishes.

**Proposed fix**

Extend the gate to require terminal success rather than absence of failure: count
checks whose state is not `SUCCESS`, `SKIPPED` or `NEUTRAL`, and refuse to merge
while that count is above zero. Add a bounded wait-and-poll loop so a pending
check delays rather than permanently abandons the merge, since the workflow will
not be re-triggered by the Security workflow finishing. Do not switch to
`gh pr merge --auto`: `CLAUDE.md` records that `--auto` only defers on *required*
checks, and with no branch protection configured it merges immediately.

**Implementation checklist**

- [ ] In `.github/workflows/dependabot-auto-merge.yml`, change the jq filter at line 101 to count checks whose state is not in the terminal-success set.
- [ ] In the same step, wrap the check query in a bounded poll loop with an explicit timeout and a clear log line naming the checks still pending.
- [ ] Add an explicit failure when the timeout is reached, so a stuck check leaves the PR unmerged and visible rather than silently merged.
- [ ] Verify against a real Dependabot PR that the job waits for `codeql` and both `image-scan` legs before merging.
- [ ] Update the comment block above the gate to describe the terminal-state rule.

**Acceptance criteria**

- [ ] A PR with a queued `codeql` check is not merged; the job log names `codeql` as pending.
- [ ] A PR where every check has succeeded is merged as today.
- [ ] A PR with a failing `dependency-audit` is not merged, as today.
- [ ] The job fails, rather than merging, if the poll times out.

**Verification commands**

```bash
gh run list --workflow=dependabot-auto-merge.yml --limit 5
gh run view <run-id> --log | grep -i "pending\|waiting\|merg"
```

**Do not**

Do not switch to `gh pr merge --auto`. Do not change the `workflow_run` trigger to
`pull_request`: `CLAUDE.md` records that this deadlocks the workflow waiting on
itself. Do not widen the branch allow-list.

**Rollback**

Revert the gate step. Auto-merge returns to its current permissive behaviour.

**Open questions**

None.

---

### GAP-013 [CODE] The adjust-stock form defaults to an invalid reason and offers one the API rejects

> **FIXED 2026-09-08, Wave 2.** Completed in two parts. The `userController`
> projection defect that shared this wave closed on 2026-09-06 in Wave 1 (PR
> #39): the six `.select()` calls name the real schema fields through a shared
> `PUBLIC_USER_FIELDS` constant. The remaining two defects closed on 2026-09-08:
> the adjust form now defaults to `inventory_count`, a real member of
> `ADJUSTMENT_REASONS`, and the server's reason floor moved from 5 to 3 at both
> adjust routes. A parameterised test asserts every one of the seven reasons the
> UI offers is accepted, `lost` included, and that a one-character reason is
> still rejected.

Severity S2 Major | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `frontend/src/components/stock/AdjustStockModal.tsx:57` and `:67` (primary)
- `frontend/src/types/stock.ts:242-250` (`ADJUSTMENT_REASONS`)
- `backend/src/routes/stockRoutes.js:72-73` and `:30-31` (the `min: 5` rule)
- `frontend/src/app/(protected)/stock/page.tsx:264` (submits the raw enum value)

**Evidence**

```ts
// frontend/src/components/stock/AdjustStockModal.tsx:57
    defaultValues: { quantity: 0, reason: 'correction', notes: '' },
```

```js
// backend/src/routes/stockRoutes.js:72-73
  body('reason').notEmpty().isString().isLength({ min: 5, max: 500 })
    .withMessage('Reason is required and must be between 5-500 characters'),
```

**What is wrong**

Two independent defects in one form. First, `'correction'` is not a member of
`ADJUSTMENT_REASONS`, which holds `damaged | lost | found | inventory_count |
returned | expired | other`, so the select renders with no selection while the
form state holds a value the Zod `z.enum` rejects. Second, the raw enum value is
submitted verbatim, and `'lost'` is four characters, failing the server's
`isLength({ min: 5 })`. `'found'` and `'other'` are exactly five and squeak
through.

**Why it matters**

An admin adjusting stock who does not explicitly re-pick the reason gets
"Please select a valid reason" on a field that looks filled in, and the reset at
line 67 reproduces it every time the modal opens. Separately, writing off lost
stock is impossible: the modal reports a 5-to-500-character error for a reason
the UI itself offered. Lost and damaged write-offs are the two most common
adjustments in a parts shop.

**Intended behavior**

The form opens with a valid, selected default reason, and every reason the UI
offers is accepted by the API.

**Proposed fix**

Change the default to `'inventory_count'`, an existing member and the most
neutral of them. For the length rule, lower the server bound from 5 to 3 rather
than renaming the enum value: the enum value is a stable identifier used in the
`StockMovement` ledger, and renaming it would orphan existing rows. Apply the
change to both `adjustValidation` sites so the body-based and by-id routes agree.

**Implementation checklist**

- [ ] In `frontend/src/components/stock/AdjustStockModal.tsx`, change the `reason` default at line 57 to `'inventory_count'`.
- [ ] In the same file, change the reset at line 67 to use the same value.
- [ ] In `backend/src/routes/stockRoutes.js`, change `isLength({ min: 5, max: 500 })` to `min: 3` at both line 30-31 and line 72-73, updating both messages.
- [ ] In `backend/tests/stock.test.js`, add a test posting `reason: 'lost'` to the adjust route and asserting 200.
- [ ] Run `npm test -- stock.test.js` from `backend/`, then `npm run lint && npm run build` from `frontend/`.

**Acceptance criteria**

- [ ] Opening the adjust modal shows a reason already selected in the dropdown.
- [ ] Submitting without changing the reason succeeds.
- [ ] Submitting with reason `Lost` succeeds and writes a `StockMovement` row.
- [ ] Every value in `ADJUSTMENT_REASONS` is accepted by both adjust routes.

**Verification commands**

```bash
cd backend && npm test -- stock.test.js
cd frontend && npm run lint && npm run build
```

**Do not**

Do not rename any member of `ADJUSTMENT_REASONS`: the values are persisted in
the `StockMovement` ledger. Do not remove the length rule entirely; a free-text
reason still needs a floor.

**Rollback**

Revert the four edits. The form returns to rejecting its own default.

**Open questions**

None.

---

### GAP-014 [CODE] Stock reservations leak on every order-creation failure path

> **FIXED 2026-09-09, Wave 3.** `createSalesOrder` now runs a read-only
> validation pass over every item before writing anything, then reserves inside
> a try/catch that releases everything it took if the create fails.
> `createStockTransfer` got the same treatment. Four regression tests assert a
> failed multi-item order leaves every `reservedQuantity` untouched.
>
> One thing the entry did not mention and the validation pass exposed: two lines
> of the same product each passed `hasSufficientStock` on their own, so an order
> for 6 + 6 of a product with 8 in stock reserved 12 and drove
> `availableQuantity` negative. The quantities are now summed per stock row and
> checked once, with a test.

Severity S1 Critical | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 4.0 | Agent suitability AGENT-READY |
Depends on none | Blocks GAP-046 | Est. agent turns 5-10

**Location**
- `backend/src/controllers/salesController.js:204-246` (primary; the reserve is at `:245`)
- `backend/src/controllers/salesController.js:208`, `:212`, `:218`, `:226` (the early returns)
- `backend/src/controllers/salesController.js:249-254` (the create that can also fail)
- `backend/src/controllers/stockController.js:612-615` (the same shape for transfers)
- `backend/src/models/Stock.js:112-115` (`releaseReservedStock`, never called from salesController)

**Evidence**

```js
// backend/src/controllers/salesController.js:245-254
    // Reserve stock
    await stock.reserveStock(item.quantity);
  }
  // Generate order number (MVP CRITICAL - model validation requires it)
  const count = await SalesOrder.countDocuments();
  ...
  const order = await SalesOrder.create({
```

**What is wrong**

The item loop persists `reservedQuantity += quantity` to the database one item at
a time, and only afterwards is the `SalesOrder` built and validated. Every exit
between the first reservation and a successful `create` strands the reservations
already taken: a later item whose product is missing, inactive, unstocked at the
branch or short; a schema rejection on a negative total; or a duplicate-key
collision on `orderNumber`. There is no try/catch, no transaction, and no
compensating release. `createStockTransfer` has the identical shape.

**Why it matters**

A cashier rings up three items where the third is not stocked at that branch. The
request 404s and no order exists, but items one and two are now reserved forever.
`availableQuantity` is `quantity - reservedQuantity`, so those units become
unsellable with nothing in the UI explaining why, and no endpoint releases an
orphan reservation. Repeat the mistake across a busy counter and a product reads
"out of stock" while the shelf is full. The only repair is a manual database
write.

**Intended behavior**

An order-creation request either creates the order with all its reservations, or
leaves every `Stock` row exactly as it found it.

**Proposed fix**

Wrap the reservation loop and the create in a try/catch that records which
`(stockId, quantity)` pairs were reserved and releases them in the catch before
re-throwing or returning the error. Validate every item first in a read-only pass
and reserve only once all items are known good, so the common failure modes never
reserve at all. This is a compensating-action approach, not a transaction; the
real fix is GAP-046, but that is a larger change and this one closes the leak
today without changing the storage engine's guarantees. Apply the same pattern to
`createStockTransfer`.

**Implementation checklist**

- [ ] In `backend/src/controllers/salesController.js`, split the item loop into a validation pass that resolves every product and stock row and returns early on any problem, before any write.
- [ ] In the same file, collect the reserved pairs in an array as the reservation pass runs.
- [ ] In the same file, wrap the reservation pass and `SalesOrder.create` in try/catch, releasing every collected pair via `releaseReservedStock` in the catch.
- [ ] Apply the identical validate-then-reserve-then-compensate structure to `createStockTransfer` in `backend/src/controllers/stockController.js` around lines 612-615.
- [ ] In `backend/tests/sales.test.js`, add a test posting a three-item order whose third item is unstocked, asserting 400 or 404 and that the first two stock rows have unchanged `reservedQuantity`.
- [ ] In `backend/tests/stock.test.js`, add the equivalent test for a transfer whose create fails.
- [ ] Run `npm test -- sales.test.js stock.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A multi-item order that fails on a later item leaves every `Stock.reservedQuantity` at its pre-request value.
- [ ] A successful order still reserves every item exactly once.
- [ ] A transfer whose create fails leaves the source `Stock` row unchanged.
- [ ] The existing sales and stock suites pass unchanged.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js stock.test.js
```

**Do not**

Do not introduce MongoDB sessions or transactions here: that is GAP-046 and
requires a replica set. Do not change `reserveStock` or `releaseReservedStock` on
the model. Do not alter the order-number generation; GAP-040 owns it.

**Rollback**

Revert `salesController.js` and `stockController.js`. Reservations leaked before
the change are not repaired by rolling back or by applying the change; they need a
one-off reconciliation, which is out of scope here.

**Open questions**

None for the fix itself. Separately, existing leaked reservations in production
data are not addressed; a reconciliation script comparing `reservedQuantity`
against open orders would be a sensible follow-up gap.

---

### GAP-015a [SEC] User-supplied text reaches MongoDB $regex unescaped at eight sites

> **FIXED 2026-09-07.** `escapeRegex` now lives once in
> `backend/src/utils/regex.js`; the two identical copies in
> `productController.js` and `motorcycleModelController.js` are gone and all
> eight unescaped sites go through it. `GET /api/branches` and
> `GET /api/suppliers` gained the search length cap they had none of, with
> `.isString()` so a repeated parameter cannot reach `$regex` as an array.
> Residual, now closed: the other query parameters on those two routes
> (`active`, `page`, `limit`) were deferred to GAP-015d, but GAP-015d's twelve
> routes were in stock, sales, service, product and category and never covered
> this file, so the deferral pointed at a gap that closed without doing it. Both
> routes now declare them through the shared factories in
> `backend/src/utils/queryRules.js`.

> **Re-scoped on 2026-09-07 from the original GAP-015.** The 60 CodeQL
> `js/sql-injection` alerts were triaged one by one; the result is in section 13.
> GAP-015 has been split into GAP-015a (this entry, regex escaping), GAP-015b
> (operator injection through request bodies), GAP-015c (update documents built
> from raw `req.body`) and GAP-015d (read routes with no query validation),
> because the four have different fixes in different files. The original entry
> said seven sites in three controllers; there are eight sites in four
> controllers, and the `userController.js` citations had drifted by eight lines.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/controllers/branchController.js:24`, `:29`, `:30` (primary; lowest privilege, `GET /api/branches` needs only `protect`)
- `backend/src/controllers/supplierController.js:23`, `:24`
- `backend/src/controllers/userController.js:35`, `:36`
- `backend/src/controllers/productController.js:125` (the `brand` filter)
- `backend/src/controllers/motorcycleModelController.js:13` and `backend/src/controllers/productController.js:16` (two identical copies of the escape helper that is not applied at the sites above)
- `backend/src/routes/branchRoutes.js:88-93` and `backend/src/routes/supplierRoutes.js:41-46` (the two list routes with no query validation chain at all)

**Evidence**

```js
// backend/src/controllers/branchController.js:23-31
  if (city) {
    query['address.city'] = { $regex: city, $options: 'i' };
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }
```

```js
// backend/src/controllers/productController.js:16: the helper that exists and is not used above
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Verified this session with `grep -rn '\$regex' backend/src`: twelve occurrences,
of which two are already escaped (`motorcycleModelController.js:43`, `:51`), one
more is escaped (`productController.js:252`), one is built from a server-side
constant (`models/StockMovement.js:132`), and the remaining eight are the
unescaped sites listed above.

**What is wrong**

The same concern is solved two incompatible ways in one codebase. `escapeRegex`
is defined identically in two controllers and used correctly by
`searchMotorcycleModels` and `searchProducts`, while eight other sites
interpolate raw request input into a regex. `GET /api/branches` carries `protect`
and no validation chain at all, so any authenticated user, including a
self-registered customer, controls the pattern with no length cap.

Five of the eight sites are not reported by CodeQL at all. `branchController.js`
alerts are numbers 6, 8 and 9, which point at `User.findById(manager)` and
`Branch.findByIdAndUpdate`, not at the regex construction; the
`getBranches` sink is unflagged, as is `getSuppliers`. Working only the alert
list would leave five of the eight unescaped sites open.

**Why it matters**

A catastrophic-backtracking pattern such as `(a+)+(a+)+$` pins the single Node
event loop for the whole process, so one request from a throwaway customer
account stalls the entire API for every branch. `GET /api/users` is admin-only
and capped at 100 characters by `userRoutes.js:19-22`, which bounds but does not
remove the exposure. The branch and supplier list routes have no cap at all.

Operator injection is *not* part of this entry. Under Express 5.2.1 the default
`query parser` is `simple`, so `?search[$ne]=x` arrives as the literal key
`search[$ne]` and never becomes a nested object. That was verified empirically
against the pinned Express version, and it is why the original entry's claim that
`?search[$ne]=1` reaches Mongo as an operator object is wrong. The query-string
half of the operator problem is covered by GAP-015d; the body half is GAP-015b.

**Intended behavior**

Every user-supplied value that reaches `$regex` is escaped, and the escaping lives
in one place rather than being duplicated and unevenly applied.

**Proposed fix**

Promote `escapeRegex` to `backend/src/utils/regex.js`, import it in all five
controllers, delete both local copies, and apply it at all eight sites. Add a
length cap to the search validators on the branch and supplier routes, which
today have none. Escaping is the correct primary fix; a length cap alone still
permits a short pathological pattern.

**Implementation checklist**

- [ ] Create `backend/src/utils/regex.js` exporting `escapeRegex`, copied verbatim from `productController.js:16`.
- [ ] In `backend/src/controllers/productController.js`, delete the local `escapeRegex` and import from the new util; apply it at line 125.
- [ ] In `backend/src/controllers/motorcycleModelController.js`, delete the local copy and import from the new util.
- [ ] In `backend/src/controllers/branchController.js`, import and apply at lines 24, 29 and 30.
- [ ] In `backend/src/controllers/supplierController.js`, import and apply at lines 23 and 24.
- [ ] In `backend/src/controllers/userController.js`, import and apply at lines 35 and 36.
- [ ] In `backend/src/routes/branchRoutes.js` and `supplierRoutes.js`, add a `query('search').optional().isString().isLength({ max: 100 })` rule with the file's existing validation-handler wiring.
- [ ] In `backend/tests/branch.test.js`, add a test sending a regex metacharacter in `?search=` and asserting a 200 with zero matches rather than an error or a hang.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] `grep -rn '\$regex' backend/src` shows every occurrence wrapped in `escapeRegex` or built from a non-user constant.
- [ ] `escapeRegex` is defined exactly once, in `backend/src/utils/regex.js`.
- [ ] `GET /api/branches?search=(a%2B)%2B%24` returns 200 promptly with no matches.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test
grep -rn "escapeRegex" src/ | grep -v "utils/regex.js"   # expect only import + call sites
grep -rn '\$regex' src/                                   # expect no raw request value
```

**Do not**

Do not switch these queries to `$text` search: the indexes do not support it on
these fields and the behaviour would change. Do not add a global regex-sanitising
middleware. Do not change `searchProducts`' or `searchMotorcycleModels`' existing
correct usage beyond swapping the import.

**Rollback**

Revert the util and the five controllers. Search behaviour returns to accepting
regex metacharacters as patterns.

**Open questions**

None.

---

### GAP-015b [SEC] JSON request bodies reach Mongo as query operators; there is no request-shape guard

> **FIXED 2026-09-07.** `backend/src/middleware/sanitizeRequest.js` rejects any
> request key beginning with `$` or containing a `.`, mounted in `server.js`
> between the body parsers and the routers.
> `backend/tests/sanitizeRequest.test.js` covers it in 15 cases and needs no
> database, so it runs where `mongodb-memory-server` cannot fetch its binary.
> `backend/tests/service.test.js` now mounts the guard the way `server.js` does
> and asserts that
> `{"partsUsed":[{"product":{"$ne":null},"quantity":1}]}` on
> `PUT /api/services/:id/parts` returns 400 with the stock untouched.
>
> Two residuals, both deliberate. The CodeQL alerts will not close: the query
> does not recognise a hand-written guard as a barrier, so 36 of the 60 stay
> open and the measure of this gap is the behaviour, not the alert count. And
> the guard is a floor, not a substitute for GAP-017's validation chains, which
> are still needed for the same four routes.

Severity S1 Critical | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 4.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/server.js:29-30` (the two body parsers; no guard follows them)
- `backend/src/controllers/serviceController.js:224` (`User.findById(assignedTo)`, alert 26)
- `backend/src/controllers/serviceController.js:295` (`User.findById(mechanicId)`, alert 29)
- `backend/src/controllers/serviceController.js:485` (`Product.findById(part.product)`, alert 33)
- `backend/src/controllers/serviceController.js:490` (`Stock.findOne({ product: part.product, branch: order.branch })`, alert 34)
- `backend/src/routes/serviceRoutes.js:22-36` (`createServiceValidation` has no `assignedTo` rule)
- `backend/src/routes/serviceRoutes.js:103-110`, `:125-129` (`/:id/assign` and `/:id/parts` have no chain at all; see GAP-017)

**Evidence**

```js
// backend/src/controllers/serviceController.js:293-295
  // Validate mechanic
  const mechanic = await User.findById(mechanicId);
```

```js
// backend/src/routes/serviceRoutes.js:103-107: the route that feeds it
router.put(
  '/:id/assign',
  authorize('admin', 'salesperson'),
  serviceController.assignMechanic
);
```

Three facts were established empirically this session against the versions the
lockfile pins, not inferred:

- `express@5.2.1` parses `{"mechanicId": {"$ne": null}}` from an
  `application/json` body into a real nested object, and
  `express.urlencoded({ extended: true })` does the same for
  `mechanicId[$ne]=x`. Both parsers are mounted at `server.js:29-30`.
- `mongoose@9.9.4` casts `findOne({ _id: { $ne: null } })` to exactly that
  filter and executes it. It is not rejected and it is not stripped.
- `express-validator@7.3.2` only writes a value back into the request when the
  chain contains a *sanitizer*. A validator that rejects the payload stops the
  request, which is a barrier; a validator that accepts it is not.
  `body('x').notEmpty()` accepts `{"$ne": null}`, because express-validator
  stringifies it to `"[object Object]"` before testing, and leaves the object in
  `req.body`.

**What is wrong**

There is no place in the request pipeline where a value is constrained to a
scalar. The documented chain is
`protect -> authorize -> express-validator -> handleValidationErrors -> controller`,
and it works wherever a chain exists, because `isMongoId`, `isEmail`, `isIn`,
`isInt` and `isString` all reject `"[object Object]"` and the request 400s before
the controller runs. That is why 24 of the 60 alerts are false positives.

The four sites above are the ones where no chain exists. `POST /api/services`
has a chain but no rule for `assignedTo`. `PUT /api/services/:id/assign` and
`PUT /api/services/:id/parts` have no chain at all. So the raw object survives
into a filter.

**Why it matters**

`PUT /api/services/<id>/parts` with `{"partsUsed":[{"product":{"$ne":null},"quantity":1}]}`
makes `serviceController.js:490` resolve `Stock.findOne` to an arbitrary stock row
at that branch rather than the named product. The controller then deducts from
whatever row Mongo returned and writes a `StockMovement` naming it, so the ledger
records a deduction the caller never asked for and the real part is never
decremented. A mechanic, the lowest-privileged role that can reach the route, is
enough. This is silent inventory corruption with an audit trail that looks
correct, which is why it is S1 rather than S2.

`PUT /api/services/<id>/assign` with `{"mechanicId":{"$ne":null}}` selects an
arbitrary user; the `role !== MECHANIC` check at `:299` then leaks whether the
first matching user is a mechanic.

**Intended behavior**

A request value that a route does not explicitly declare as a Mongo operator can
never be interpreted as one. The guard is positional, not per-site, so a route
added later inherits it.

**Proposed fix**

Add `backend/src/middleware/sanitizeRequest.js` exporting a middleware that walks
`req.body`, `req.query` and `req.params` and answers 400 through
`ApiResponse.error` when any object key begins with `$` or contains a `.`. Mount
it in `server.js` immediately after the two body parsers and before the routers.
Reject rather than strip: stripping turns an attack into a silently different
query, and no legitimate client sends such a key. This was checked, not assumed:
`grep` over `frontend/src/lib/services/` finds no `$`-prefixed and no dotted key
in any payload, and no backend test sends one.

Note the interaction with Express 5. Assigning to `req.query` silently does
nothing, because it is a getter; `Object.defineProperty` and in-place mutation
both work. An inspect-and-reject guard needs neither, which is a further reason
to reject rather than rewrite.

This does not replace per-route validation. GAP-017 still has to add the chains
for the same four routes, and GAP-015d still has to add them for the read routes.
The guard is the floor that holds while those land, and the backstop for routes
nobody has written yet.

**Implementation checklist**

- [ ] Create `backend/src/middleware/sanitizeRequest.js` exporting a default middleware that recursively inspects `req.body`, `req.query` and `req.params`.
- [ ] Reject with `ApiResponse.error(res, 400, ...)` when an object key starts with `$` or contains `.`; name the offending key in the message.
- [ ] Cap recursion depth and node count so a deeply nested body cannot make the guard itself expensive.
- [ ] In `backend/src/server.js`, mount it after `express.urlencoded` at line 30 and before the first router.
- [ ] Add `backend/tests/sanitizeRequest.test.js` mounting the middleware on a bare Express app, asserting 400 for a `$`-prefixed key at top level, nested in an object, and nested inside an array element, and 200 for an ordinary body.
- [ ] In `backend/tests/service.test.js`, add a test posting `{"partsUsed":[{"product":{"$ne":null},"quantity":1}]}` to `PUT /api/services/:id/parts` and asserting 400.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] A JSON body containing `{"$ne": null}` at any depth returns 400, not 200.
- [ ] An ordinary create-order body still returns 201.
- [ ] `backend/tests/sanitizeRequest.test.js` passes without a database, so it runs in a sandbox where `mongodb-memory-server` cannot fetch its binary.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test -- sanitizeRequest.test.js
cd backend && npm test
```

**Do not**

Do not use `express-mongo-sanitize`: it mutates `req.query` in place, which is
the pattern Express 5's getter broke, and it strips silently rather than
rejecting. Do not mount the guard inside `/api/auth` only, the way `cookieParser`
is scoped: the reachable sites are on `/api/services`. Do not treat this as a
substitute for GAP-017 or GAP-015d.

**Rollback**

Remove the mount line from `server.js`. The middleware file is inert on its own.

**Open questions**

None.

---

### GAP-015c [SEC] Four update paths pass the whole request body to findByIdAndUpdate

> **FIXED 2026-09-08.** `backend/src/utils/pickFields.js` builds the update
> document from an explicit allow-list, applied at all four sites.
> `grep -rn "findByIdAndUpdate" backend/src/controllers` now shows no call whose
> second argument is `req.body`.
>
> **The proposed fix below was wrong on one point and was not followed.** It
> said to build each allow-list from the fields the route's *update validator*
> declares. That would have broken the application: `updateBranchValidation`
> names four fields while `UpdateBranchPayload` in
> `frontend/src/types/branch.ts` sends eight, so address, contact, settings and
> isActive edits would have stopped saving with no error. The allow-lists are
> the schema's top-level paths instead, which match each client payload type
> exactly. `backend/tests/branch.test.js` has a regression test for precisely
> that: it sends address, contact and settings and asserts they persist.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/controllers/branchController.js:175-178` (alert 9)
- `backend/src/controllers/categoryController.js:177-180` (alert 12)
- `backend/src/controllers/productController.js:408-411` (alert 120)
- `backend/src/controllers/supplierController.js:108-111` (alert 27)

**Evidence**

```js
// backend/src/controllers/branchController.js:175-179
  branch = await Branch.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  );
```

Verified against `mongoose@9.9.4` by casting the query offline with
`Query#cast()`:

```
body = {$unset:{code:1}}            -> CAST UPDATE: {"$unset":{"code":1}}
body = {$rename:{name:"code"}}      -> CAST UPDATE: {"$rename":{"name":"code"}}
body = {$inc:{"settings.taxRate":999}} -> CAST UPDATE: {"$inc":{"settings.taxRate":999}}
body = {notInSchema:"x"}            -> CAST UPDATE: {"notInSchema":"x"}
```

Nothing is stripped, and `runValidators: true` does not help: it validates the
paths the update names, not the ones it does not.

**What is wrong**

The express-validator chains on these four routes validate the fields they know
about and say nothing about the rest of the body, because express-validator is a
whitelist of *rules*, not a whitelist of *fields*. The controller then hands the
entire body to Mongoose as an update document, so any key the chain did not
mention reaches the database, including update operators.

**Why it matters**

`PUT /api/branches/<id>` with `{"$rename":{"name":"code"}}` renames a field on the
stored document, which no application code can then read. `{"$unset":{"isActive":1}}`
removes the archive flag entirely. On `PUT /api/products/<id>`,
`{"$inc":{"sellingPrice":-9999}}` reprices a part without going through any of the
price validation on the route.

All four routes are `authorize(USER_ROLES.ADMIN)`, so this is not a
privilege-escalation path from a low-privileged account; it is a way for a
compromised or careless admin session to write shapes the schema was meant to
forbid, and a mass-assignment hole for every field the chain does not name.
GAP-015b's guard removes the operator half of this by rejecting `$`-prefixed
keys before the controller runs. The mass-assignment half, an admin setting a
field the form never exposes, survives the guard and is what this entry is for.

**Intended behavior**

An update document is built from an explicit allow-list of the fields the route
accepts, not from whatever the client sent.

**Proposed fix**

In each of the four controllers, replace `req.body` with an object built by
picking the fields the route's validation chain declares. Add a small
`pickFields(source, allowed)` helper in `backend/src/utils/` rather than writing
the same destructuring four times. Keep `runValidators: true`.

**Implementation checklist**

- [ ] Create `backend/src/utils/pickFields.js` exporting `pickFields(source, allowed)` that copies only own, defined keys named in `allowed`.
- [ ] In `backend/src/controllers/branchController.js:175-178`, build the update from the fields `updateBranchValidation` declares in `branchRoutes.js:64-85`.
- [ ] In `backend/src/controllers/categoryController.js:177-180`, do the same against `updateCategoryValidation` in `categoryRoutes.js:78-140`.
- [ ] In `backend/src/controllers/productController.js:408-411`, do the same against `updateProductValidation` in `productRoutes.js:136-234`.
- [ ] In `backend/src/controllers/supplierController.js:108-111`, do the same against `updateSupplierValidation` in `supplierRoutes.js:29-32`.
- [ ] In `backend/tests/branch.test.js`, add a test sending an unlisted field and asserting it is not persisted.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] `grep -rn "findByIdAndUpdate(\s*$" backend/src/controllers` shows no call whose second argument is `req.body`.
- [ ] A `PUT` carrying a field the route never declares leaves the stored document unchanged in that field.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test
grep -rn "req.body," src/controllers/ | grep -i "findbyidandupdate" -A1
```

**Do not**

Do not solve this by setting `strict: 'throw'` on the schemas: that changes
behaviour for every write path in the application, including seeds and
migrations, and it converts a silent no-op into a 500 rather than a 400. Do not
remove `runValidators: true`.

**Rollback**

Revert the four controllers and delete the helper. Updates return to accepting
any field.

**Open questions**

None.

---

### GAP-015d [SEC] Twelve read routes have no query-validation chain at all

> **FIXED 2026-09-08.** All twelve routes now declare a chain, composed from
> shared rule factories in `backend/src/utils/queryRules.js` so the same six
> parameters are not respelled twelve times.
>
> One implementation detail is load-bearing and easy to undo: **every rule
> begins with `.not().isArray()`.** Verified against express-validator 7.3.2
> that `isMongoId()`, `isInt()` and `isISO8601()` all *accept* an array,
> validating its first element and leaving the array in place; only
> `isString()` and an explicit array check reject it. Since Mongoose rewrites
> `{field: [...]}` into `{field: {$in: [...]}}`, dropping that first check
> silently restores the filter widening this entry exists to close.
>
> Two further notes. `GET /api/categories` cannot use the shared `idRule` for
> `parent`, because `?parent=null` is the documented way to ask for root
> categories; it uses a custom test, and `.if()` is not an alternative because
> express-validator skips a chain when the condition *throws*, not when it
> returns false. And the `assignedTo` authorisation hole is closed: a mechanic
> is now pinned to their own jobs regardless of the parameter.
>
> The `sortBy` allow-list for `GET /api/products` landed here as
> `PRODUCT_SORT_FIELDS` in `productRoutes.js`. The checklist below pointed at
> GAP-026 for it, which was a mis-citation: GAP-026 is about pagination bounds.
> GAP-021 owns the equivalent work for the sales and service lists and is
> untouched.

Severity S3 Moderate | Complexity M | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 0.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 10-20

**Location**
- `backend/src/routes/stockRoutes.js:85-90`, `:93-98`, `:103-108`, `:142-147` (no chain), `:121-128`, `:131-139`, `:180-188` (path parameter validated, query not)
- `backend/src/routes/salesRoutes.js:77-82`, `:85-90` (no chain), `:93-100` (path parameter only)
- `backend/src/routes/serviceRoutes.js:46-50`, `:57-61` (no chain)
- `backend/src/routes/productRoutes.js:293-298` (no chain)
- `backend/src/routes/categoryRoutes.js:143-148` (no chain)

These twelve routes account for 28 of the 60 CodeQL alerts. The full mapping from
alert number to route is in section 13.

**Evidence**

```js
// backend/src/routes/stockRoutes.js:85-90: GET /api/stock, no validation chain
router.get(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN, USER_ROLES.SALESPERSON),
  stockController.getAllStock
);
```

```js
// backend/src/controllers/stockController.js:71-73: what it feeds
  if (product) {
    query.product = product;
  }
```

**What is wrong**

`userRoutes.js:18-45` shows what a complete read-route chain looks like in this
codebase: every one of `search`, `role`, `branch`, `isActive`, `page`, `limit`,
`sortBy` and `sortOrder` is constrained. The twelve routes above have nothing.
Their query values go from `req.query` into a filter object with no type, format
or length check.

**Why it matters**

The severity is S3, not higher, and the reason is specific and load-bearing.
Express 5.2.1's default `query parser` is `simple`, verified empirically against
the pinned version: `?branch[$ne]=x` produces the literal key `"branch[$ne]"`,
not a nested object, so the operator injection these alerts describe is **not
reachable through the query string today**. `server.js` never calls
`app.set('query parser', ...)`, so the default stands.

What *is* reachable is array widening. `?product=a&product=b` produces
`["a","b"]`, and `mongoose@9.9.4` silently rewrites `{product: ["a","b"]}` into
`{product: {$in: ["a","b"]}}` rather than raising a cast error. Both were
verified this session. Every branch-scoping clamp was then re-read against this:
`resolveBranchScope` (`utils/branchScope.js:13-29`), the inline
`role !== ADMIN` clamps in `salesController.js:39-43` and
`serviceController.js:41-45`, `checkBranchAccess` and `canAccessBranch` all pin a
non-admin to a server-supplied branch id, so widening a filter does not cross a
branch boundary. It broadens a result set the caller is already entitled to.

The real cost is that this is one configuration line away from being critical. A
future `app.set('query parser', 'extended')`, an Express major that restores `qs`
as the default, or a proxy that rewrites the query string, turns all 28 of these
into live operator injection with no other code change. GAP-015b's guard is what
holds that line; this entry is about restoring the documented pipeline so the
guard is not the only thing standing between request input and a filter.

`serviceController.js:48-52` is a separate, smaller defect found during the same
read and worth fixing here: `getServiceOrders` lets any non-mechanic caller set
`?assignedTo=` freely, so a salesperson can read another user's jobs within their
own branch. It is an authorisation gap rather than an injection, and it exists
with or without arrays.

**Intended behavior**

Every read route declares its query parameters with the same express-validator
wiring the write routes in the same file already use, so the pipeline documented
in CLAUDE.md holds everywhere rather than in most places.

**Proposed fix**

Add a query-validation chain per route, modelled on `getUsersValidation` in
`userRoutes.js:18-45`. Constrain ids with `isMongoId()`, enumerations with
`isIn()` against `backend/src/config/constants.js`, `page` and `limit` with
`isInt().toInt()`, dates with `isISO8601().toDate()`, and free text with
`isString().isLength({ max: 100 })`. Prefer a sanitizer on every rule, since a
sanitizer is what actually writes a scalar back into the request.

Match the file's existing handler: `stockRoutes.js` and `supplierRoutes.js` use
`handleValidationErrors`, the others use `validate`. They produce different
payloads and the frontend reads both shapes.

**Implementation checklist**

- [ ] In `backend/src/routes/stockRoutes.js`, add chains for `GET /`, `/low-stock`, `/movements`, `/transfers`, and extend the three routes that validate only their path parameter.
- [ ] In `backend/src/routes/salesRoutes.js`, add chains for `GET /` and `GET /stats`, and extend `GET /branch/:branchId`.
- [ ] In `backend/src/routes/serviceRoutes.js`, add chains for `GET /` and `GET /my-jobs`.
- [ ] In `backend/src/routes/productRoutes.js`, add a chain for `GET /`, including `sortBy` against an allow-list.
- [ ] In `backend/src/routes/categoryRoutes.js`, add a chain for `GET /`.
- [ ] In `backend/src/controllers/serviceController.js:48-52`, clamp `assignedTo` so a non-admin cannot read another user's jobs.
- [ ] Add tests asserting 400 for a malformed `?branch=`, a non-integer `?page=`, and an out-of-enum `?status=` on at least one route per file.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] Every `router.get` in the five files names a validation chain.
- [ ] `GET /api/stock?branch=notanid` returns 400.
- [ ] `GET /api/services?assignedTo=<another user>` no longer returns that user's jobs to a non-admin.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test
grep -n "router.get" src/routes/*.js    # every hit should name a *Validation chain
```

**Do not**

Do not set `app.set('query parser', 'extended')` to make the alerts reproduce.
That converts 28 latent findings into live ones. Do not drop GAP-015b's guard on
the grounds that these chains supersede it: the guard covers routes that do not
exist yet.

**Rollback**

Revert the five route files. Reads return to accepting any query shape.

**Open questions**

None.

---

### GAP-016 [CODE] A completed-but-unpaid sale can never be paid; on-account revenue is unrecordable

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks GAP-050 | Est. agent turns 4-8

**Location**
- `backend/src/controllers/salesController.js:437-439` (primary)
- `backend/src/utils/salesCompletion.js:47-52` (the deliberate no-transaction branch)
- `backend/src/controllers/serviceController.js:554-556` (the service path, which gets this right)

**Evidence**

```js
// backend/src/controllers/salesController.js:437-439
  if (order.status === 'completed' || order.status === 'cancelled') {
    return ApiResponse.error(res, 400, 'Cannot update payment for completed/cancelled order');
  }
```

```js
// backend/src/utils/salesCompletion.js:47-52: the comment that names the missing path
  // Only money actually received is recorded. An order completed while still
  // unpaid (goods released on account) produces no transaction: one is written
  // when the payment lands, by the payment path.
```

**What is wrong**

`PUT /sales/:id/status` accepts `pending -> completed` regardless of payment
status. `completeSalesOrder` deducts stock and, seeing the order is not paid,
deliberately writes no `Transaction`, documenting that the payment path will
write it later. But `updateSalesOrderPayment` refuses any order already in
`completed` state. There is no third path, so the payment can never land. The
service controller's equivalent blocks only `cancelled`.

**Why it matters**

A regular customer takes PHP 4,500 of parts on account. Staff mark the order
completed so the shelf count is right. A week later the customer pays and
`PUT /sales/:id/payment` returns 400. The amount can never be recorded: the order
stays `payment.status: 'pending'` forever and no `Transaction` row is ever
written, while `getSalesStatistics` counts the order in `revenue.total` because
that aggregation filters on `status: 'completed'`. Reported revenue and the cash
ledger diverge permanently, and the divergence grows with every on-account sale.

**Intended behavior**

A completed order can still receive payment, and doing so writes exactly one
`Transaction`. A cancelled order cannot.

**Proposed fix**

Narrow the guard to reject only `cancelled`, matching
`serviceController.js:554-556`. The dedupe already present in
`recordSaleTransaction` (`salesCompletion.js:71-77`) queries for an existing
`Transaction` by `reference.model` and `reference.id`, so calling it from the
payment path cannot double-write. Call it from `updateSalesOrderPayment` when the
order is completed and the payment has become `paid`.

**Implementation checklist**

- [ ] In `backend/src/controllers/salesController.js`, change the guard at line 437 to reject only `cancelled`.
- [ ] In the same function, after saving the order, call `recordSaleTransaction` when `order.status === 'completed'` and `order.payment.status === 'paid'`.
- [ ] In `backend/src/controllers/salesController.js`, invalidate `cache:sales:*` after that write, matching the completion path.
- [ ] In `backend/tests/sales.test.js`, add a test: complete an unpaid order, then pay it, asserting 200 and exactly one `Transaction` with `reference.id` equal to the order id.
- [ ] In `backend/tests/sales.test.js`, add a test asserting paying an already-paid completed order writes no second `Transaction`.
- [ ] In `backend/tests/sales.test.js`, add a test asserting a cancelled order still rejects payment with 400.
- [ ] Run `npm test -- sales.test.js` from `backend/`.

**Acceptance criteria**

- [ ] Paying a completed, unpaid order returns 200 and creates exactly one `Transaction`.
- [ ] Repeating that payment call creates no additional `Transaction`.
- [ ] Paying a cancelled order still returns 400.
- [ ] `Transaction` totals for a day match `getSalesStatistics` revenue for the same day in a test fixture containing one on-account sale.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js
```

**Do not**

Do not add a refund or reversal path here; GAP-050 owns that. Do not change
`getSalesStatistics`' aggregation. Do not remove the deliberate
no-transaction-on-unpaid-completion branch in `salesCompletion.js`: it is
correct, it just had no counterpart.

**Rollback**

Revert `salesController.js`. Orders paid after completion in the interim keep
their `Transaction` rows, which remain correct.

**Open questions**

Should completing an unpaid order be allowed at all, or should the status
transition require payment first? The current behaviour supports selling on
account, which is normal in this trade, so I assumed it is intended. If the owner
says on-account sales are not permitted, the correct fix is the opposite one:
block the `completed` transition while unpaid. That is a product decision, which
is why this entry is AGENT-ASSISTED.

---

### GAP-017 [SEC] Four mutating service routes have no validation chain

> **FIXED 2026-09-09, Wave 3.** All five mutating routes now declare chains
> wired through the file's existing `validationHandler`: `:id` as a MongoId on
> every one, `mechanicId` on assign, `partsUsed` as an array with per-element
> product and positive-integer quantity, `amountPaid` as a non-negative float
> with `paymentMethod` against `PAYMENT_METHODS`, and `status` against
> `SERVICE_STATUS`. Tests assert 400 rather than 500 for an empty parts body, a
> non-array `partsUsed`, a zero quantity, a non-numeric `amountPaid`, a
> malformed `:id`, and an out-of-enum status.

> **The 2026-09-07 NoSQL triage raised what is at stake here.** These four routes
> are the only place in the backend where an unvalidated request *body* value
> reaches a Mongo filter, so they carried all four TP-1 alerts (26, 29, 33, 34).
> `PUT /:id/parts` with `{"partsUsed":[{"product":{"$ne":null},"quantity":1}]}`
> made `serviceController.js:490` deduct stock from an arbitrary product. The
> guard added by GAP-015b closes that, so this entry is back to being about 400
> versus 500 and the `NaN` payment. Add one thing to its scope: `POST /` has a
> chain but declares no rule for `assignedTo`, which reaches
> `serviceController.js:224`. See section 13.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/routes/serviceRoutes.js:103-140` (primary: `/:id/assign`, `/:id/status`, `/:id/parts`, `/:id/payment`)
- `backend/src/controllers/serviceController.js:484` (the unguarded `for...of`)
- `backend/src/controllers/serviceController.js:562-564` (the unchecked `amountPaid` assignment)

**Evidence**

```js
// backend/src/routes/serviceRoutes.js:125-129
router.put(
  '/:id/parts',
  authorize('admin', 'salesperson', 'mechanic'),
  serviceController.updatePartsUsed
);
```

**What is wrong**

`POST /` is the only route in the file wired with a validator. The four mutating
PUTs and the DELETE go straight from `authorize` to the controller.
`updatePartsUsed` destructures `partsUsed` and feeds it to `for...of` with no
array or presence check, so a body of `{}` throws
`TypeError: partsUsed is not iterable`. `updatePayment` assigns `amountPaid`
directly with no numeric check. Neither `:id` nor `mechanicId` is checked as a
MongoId. This contradicts the documented pipeline that every other router follows.

**Why it matters**

`PUT /api/services/<id>/parts` with an empty body returns a 500 rather than an
actionable 400. `PUT /api/services/<id>/payment` with `{"amountPaid": "abc"}`
casts to `NaN`; the pre-save comparison chain then leaves `payment.status`
unchanged while `amountPaid` persists as `NaN`, producing a document no later
save can repair. Because no suite mounts `errorHandler`, these surface as 500s in
tests too, so the shape is invisible.

**Intended behavior**

Every mutating service route validates its body and path parameters and answers
400 with a field-level message, matching `salesRoutes.js`.

**Proposed fix**

Add express-validator chains for the four routes plus the DELETE, using the same
`handleValidationErrors` wiring the file already imports for `POST /`. Validate
`:id` and `mechanicId` as MongoIds, `partsUsed` as an array with per-element
product and positive-integer quantity rules, `amountPaid` as a non-negative
float, and `status` and `priority` against the constants in
`backend/src/config/constants.js`.

**Implementation checklist**

- [ ] In `backend/src/routes/serviceRoutes.js`, add an `idValidation` chain checking `param('id').isMongoId()` and apply it to all five routes.
- [ ] Add an `assignValidation` chain checking `body('mechanicId').isMongoId()`.
- [ ] Add a `partsValidation` chain checking `body('partsUsed').isArray()`, `body('partsUsed.*.product').isMongoId()`, and `body('partsUsed.*.quantity').isInt({ min: 1 }).toInt()`.
- [ ] Add a `paymentValidation` chain checking `body('amountPaid').isFloat({ min: 0 }).toFloat()` and `body('paymentMethod').optional().isIn(Object.values(PAYMENT_METHODS))`.
- [ ] Add a `statusValidation` chain checking `body('status').isIn(Object.values(SERVICE_STATUS))`.
- [ ] Wire each chain with `handleValidationErrors` before its controller, matching the `POST /` route's shape.
- [ ] In `backend/tests/service.test.js`, add tests asserting 400 for an empty `parts` body, a non-numeric `amountPaid`, and a malformed `:id`.
- [ ] Run `npm test -- service.test.js` from `backend/`.

**Acceptance criteria**

- [ ] `PUT /api/services/<id>/parts` with `{}` returns 400 naming `partsUsed`, not 500.
- [ ] `PUT /api/services/<id>/payment` with a non-numeric `amountPaid` returns 400.
- [ ] A malformed `:id` returns 400, not 404.
- [ ] The existing service suite passes.

**Verification commands**

```bash
cd backend && npm test -- service.test.js
```

**Do not**

Do not switch this file between `validate.js` and `validationHandler.js`: match
whichever the `POST /` route already uses. Do not change the controllers'
business logic in this gap.

**Rollback**

Revert `serviceRoutes.js`. Requests that now 400 will return to 500.

**Open questions**

None.

---

### GAP-018 [CODE] Stock adjustments ignore reservedQuantity and can strand pending orders

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/controllers/stockController.js:421-423` (primary)
- `backend/src/controllers/stockController.js:545-547` (the by-id variant)
- `backend/src/models/Stock.js:76-78` (the `available` virtual that hides the inconsistency)

**Evidence**

```js
// backend/src/controllers/stockController.js:421-423
  const oldQuantity = stock.quantity;
  stock.quantity = Math.max(0, stock.quantity + adjustment);
  await stock.save();
```

**What is wrong**

Both adjustment endpoints clamp `quantity` at zero and never consult
`reservedQuantity`. Because the `available` virtual is
`Math.max(0, quantity - reservedQuantity)`, a row with `quantity: 0` and
`reservedQuantity: 5` reports `available: 0` and simply looks empty. Nothing
reconciles the two fields.

**Why it matters**

A branch has five units, all reserved by a pending order. An admin writes off five
damaged units, so `quantity` goes to 0 while `reservedQuantity` stays 5.
Completing that order calls `deductStock(5)` against `quantity: 0`, which throws
and surfaces as a 500. The order can then never be completed or cleanly
cancelled, and the five phantom reservations survive indefinitely.

**Intended behavior**

An adjustment that would drive `quantity` below `reservedQuantity` is refused with
a message naming the committed quantity, so the operator cancels or amends the
blocking order first.

**Proposed fix**

Before writing, compute the target quantity and compare it against
`stock.reservedQuantity`; when the target is lower, return 400 naming both
numbers. Refusing is preferable to silently releasing reservations, because the
reservations belong to real orders that a human needs to decide about. Apply to
both adjustment sites.

**Implementation checklist**

- [ ] In `backend/src/controllers/stockController.js`, in `adjustStock` around line 421, compute the target quantity and return 400 when it is below `stock.reservedQuantity`.
- [ ] Apply the identical guard in `adjustById` around line 545.
- [ ] Include the reserved quantity and the requested target in the 400 message so the operator can act on it.
- [ ] In `backend/tests/stock.test.js`, add a test reserving stock then adjusting below the reserved level, asserting 400 and an unchanged `quantity`.
- [ ] In `backend/tests/stock.test.js`, add a test that an adjustment down to exactly the reserved level succeeds.
- [ ] Run `npm test -- stock.test.js` from `backend/`.

**Acceptance criteria**

- [ ] An adjustment that would leave `quantity < reservedQuantity` returns 400 and writes nothing.
- [ ] An adjustment down to exactly `reservedQuantity` succeeds.
- [ ] An adjustment upward always succeeds.
- [ ] No `StockMovement` row is written for a refused adjustment.

**Verification commands**

```bash
cd backend && npm test -- stock.test.js
```

**Do not**

Do not auto-release reservations to make room. Do not change the `available`
virtual. Do not touch `deductStock`.

**Rollback**

Revert both guards. Rows already made inconsistent before the change are not
repaired by it.

**Open questions**

Should an admin be able to force an adjustment below the reserved level, with the
blocking orders listed for cancellation? That is a workflow decision the code
cannot answer, and it is why this entry is AGENT-ASSISTED rather than READY.

---

### GAP-019 [CODE] Transfer completion credits the destination when the source Stock row is missing

> **FIXED 2026-09-09, Wave 3.** The transfer-completion branch resolves the
> source row before mutating anything and returns 400 when it is absent, so the
> unconditional destination credit is never reached and the `sourceStock.costPrice`
> dereference on a null is gone. `salesCompletion.js` and the service completion
> path both resolve every stock row up front and refuse a missing one, rather
> than `continue`-ing past it: that also means a later missing row cannot leave
> an order half-deducted. Five tests cover the transfer case, including that no
> movement rows are written and the transfer stays retryable.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/controllers/stockController.js:684-738` (primary; the guard is at `:692`, the unconditional credit at `:713-730`, the null dereference at `:722`)
- `backend/src/utils/salesCompletion.js:31-32` (the same silent-skip shape)
- `backend/src/controllers/serviceController.js:385-401` (and again)

**Evidence**

```js
// backend/src/controllers/stockController.js, transfer completion
    if (sourceStock) {
      await sourceStock.deductStock(transfer.quantity);
  ...
      destStock = await Stock.create({
        ...
        costPrice: sourceStock.costPrice,
```

**What is wrong**

The source debit is inside `if (sourceStock)` but the destination credit is
unconditional, and the create path then dereferences `sourceStock.costPrice` on
the very null it just guarded against. So a transfer whose source row is missing
either invents inventory, when the destination row already exists and is simply
incremented, or throws a `TypeError` after `transfer.status` has already been
mutated in memory. The two order-completion paths share the softer form of the
same bug: `if (!stock) continue` means an order completes, is marked paid, and
writes a `Transaction` while deducting nothing.

**Why it matters**

A transfer of 20 units is marked completed after the source branch's `Stock` row
was deleted. The destination gains 20 units, the source loses none, and a
`transfer_in` movement is written with no matching `transfer_out`. Twenty units
of inventory are created from nothing, with a ledger that looks internally
consistent on the receiving side. On the sales side, a missing stock row means
revenue is booked for goods that were never deducted.

**Intended behavior**

A missing `Stock` row on any quantity-moving path is an error that aborts the
operation with a message naming the product and branch, not a silently skipped
step.

**Proposed fix**

Replace each silent guard with an explicit failure. In the transfer path, resolve
the source row before mutating anything and return 400 when it is absent, so the
destination credit is never reached. In the two completion paths, replace
`if (!stock) continue` with a returned error naming the product. This is three
small, independent edits sharing one rule.

**Implementation checklist**

- [ ] In `backend/src/controllers/stockController.js`, move the source-stock lookup above any mutation in the transfer-completion branch and return 400 when it is null.
- [ ] In the same branch, remove the now-redundant `if (sourceStock)` wrapper so the debit and credit are unconditionally paired.
- [ ] In `backend/src/utils/salesCompletion.js`, replace the `if (!stock) continue` at lines 31-32 with an error naming the product id and branch.
- [ ] In `backend/src/controllers/serviceController.js`, apply the same change around lines 385-401.
- [ ] In `backend/tests/stock.test.js`, add a test completing a transfer whose source row was deleted, asserting 400 and that the destination quantity is unchanged.
- [ ] In `backend/tests/sales.test.js`, add a test completing an order whose stock row was deleted, asserting a non-2xx and that no `Transaction` was written.
- [ ] Run `npm test -- stock.test.js sales.test.js service.test.js` from `backend/`.

**Acceptance criteria**

- [ ] Completing a transfer with a missing source row returns 400 and changes no quantity at either branch.
- [ ] No `StockMovement` row is written for a refused transfer.
- [ ] Completing an order with a missing stock row does not write a `Transaction`.

**Verification commands**

```bash
cd backend && npm test -- stock.test.js sales.test.js service.test.js
```

**Do not**

Do not create the missing `Stock` row automatically. Do not change
`createMovementWithOldQuantity`. Do not restructure the transfer state machine.

**Rollback**

Revert the three files. Transfers with missing source rows return to silently
inventing stock.

**Open questions**

None.

---

### GAP-020 [CODE] user.branch shape drift breaks BranchProvider, roleGuard and hasBranchAccess

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on GAP-006 | Blocks none | Est. agent turns 4-8

**Location**
- `frontend/src/types/auth.ts:14` (primary)
- `frontend/src/providers/BranchProvider.tsx:58` and `:66`
- `frontend/src/middlewares/roleGuard.tsx:65`, `frontend/src/hooks/useAuth.ts:102`
- `backend/src/controllers/authController.js:358` (the populate that creates the drift)

**Evidence**

```ts
// frontend/src/types/auth.ts:14
  branch?: string; // Branch ID for non-admin users
// frontend/src/providers/BranchProvider.tsx:58
  const branchId = user?.branch ?? null;
```

`getMe` runs `User.findById(...).populate('branch', 'name code')`, so `/auth/me`
returns an object, while `login` and `refresh-token` return the raw id.

**What is wrong**

`authStore.initialize()` calls `getProfile()` on every cold load, so after a
reload `user.branch` is `{_id, name, code}` while the type declares `string`.
Three call sites already work around this by hand: `sales/page.tsx:68`,
`sales/new/page.tsx:143` and `services/new/page.tsx:92` each test
`typeof user.branch === 'string'`, which is itself evidence of the drift.
`BranchProvider`, `roleGuard` and `hasBranchAccess` do not.

**Why it matters**

After a browser refresh, a salesperson's `useBranchContext().currentBranch` is
permanently null and the branch fetch is issued against the path
`/branches/[object Object]`. `withRoleGuard({branchId})` and `hasBranchAccess()`
compare an object to a string and always return false, so branch-scoped UI gates
fail closed for the whole session until the user logs in again.

**Intended behavior**

`user.branch` has one declared shape that matches every endpoint that returns it,
and every consumer reads it the same way.

**Proposed fix**

Type the field as a discriminated union of `string | { _id: string; name: string;
code: string }` and add a `resolveBranchId(branch)` helper in
`frontend/src/types/auth.ts` that returns the id from either form. Replace the
three hand-rolled inline checks and the three broken consumers with that helper.
Changing the backend to stop populating is the alternative, but the populated
name and code are used to render the branch label, so removing them would break
the navbar.

**Implementation checklist**

- [ ] In `frontend/src/types/auth.ts`, widen `User.branch` to the union type and export a `resolveBranchId` helper.
- [ ] In `frontend/src/providers/BranchProvider.tsx`, use `resolveBranchId` at lines 58 and 66.
- [ ] In `frontend/src/middlewares/roleGuard.tsx`, use it at line 65.
- [ ] In `frontend/src/hooks/useAuth.ts`, use it in `hasBranchAccess` at line 102.
- [ ] Replace the inline `typeof` checks in `sales/page.tsx`, `sales/new/page.tsx` and `services/new/page.tsx` with the helper.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`, and confirm `tsc` reports no error on the widened type.
- [ ] Manually verify: log in as a non-admin, reload the page, and confirm the branch label renders and branch-scoped controls stay enabled.

**Acceptance criteria**

- [ ] After a reload as a non-admin, `useBranchContext().currentBranch` is non-null.
- [ ] No request path in the network log contains `[object Object]`.
- [ ] `grep -rn "typeof user.branch" frontend/src` returns no matches.
- [ ] `npm run build` succeeds.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
grep -rn "typeof user.branch" src/    # expect no output
```

**Do not**

Do not remove the `populate` in `getMe`. Do not change `login` or
`refresh-token` response shapes. Do not edit `frontend/src/types/auth.ts`'s
`ResetPasswordRequest`: GAP-006 owns that interface in the same file, so
sequence the two.

**Rollback**

Revert the type and its consumers. Branch context returns to being null after a
reload.

**Open questions**

None.

---

### GAP-021 [FEAT] Sales and service list search and sort are silently dropped by the API

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 5-9

**Location**
- `backend/src/controllers/salesController.js:26-34` (primary; the complete accepted parameter set)
- `backend/src/controllers/serviceController.js:29-37`
- `frontend/src/app/(protected)/sales/page.tsx:52-53`, `:56`, `:114`, `:209-222`
- `frontend/src/app/(protected)/services/page.tsx:72`, `:117-125`

**Evidence**

```js
// backend/src/controllers/salesController.js:26-34: everything the endpoint reads
  const {
    branch, status, paymentStatus, startDate, endDate,
    page = 1, limit = PAGINATION.DEFAULT_LIMIT
  } = req.query;
```

The list types declare `search`, `sortBy` and `sortOrder`; both controllers hard
code `.sort({ createdAt: -1 })`.

**What is wrong**

The pages put `search`, `sortBy` and `sortOrder` into their filter objects and
axios serialises them onto the query string, but neither controller destructures
them, so they are silently dropped. The sales page compensates with a client-side
filter over `orders`, which holds only the current 20-row page; the services page
has no fallback at all. Neither page sorts client-side, while both render
clickable sort headers wired to `onSortChange`.

**Why it matters**

Searching for order `SO-2026-000042` from page one of a 400-order list returns
"no results" on the sales page and returns the unfiltered page on the services
page. Clicking a column header changes the arrow and refetches identical data.
Both are core daily operations and both fail in a way that looks like missing
data rather than a broken feature.

**Intended behavior**

`search` matches order number and customer name or phone server-side across the
whole collection, and `sortBy` with `sortOrder` orders the full result set before
pagination.

**Proposed fix**

Implement the three parameters in both controllers. Accept `search` and build an
escaped `$or` over `orderNumber`, `customer.name` and `customer.phone` using the
shared `escapeRegex` from GAP-015a. Accept `sortBy` against an allow-list of
sortable fields and `sortOrder` as `asc` or `desc`, defaulting to the current
`createdAt` descending. Then delete the client-side `filteredOrders` fallback,
which is misleading because it silently searches one page.

**Implementation checklist**

- [ ] In `backend/src/controllers/salesController.js`, destructure `search`, `sortBy` and `sortOrder` and build the escaped `$or` and the sort object against a field allow-list.
- [ ] Apply the same change in `backend/src/controllers/serviceController.js`, matching on job number, customer name and vehicle.
- [ ] In `backend/src/routes/salesRoutes.js` and `serviceRoutes.js`, add validators bounding `search` length and restricting `sortBy` and `sortOrder` to the allow-list.
- [ ] In `frontend/src/app/(protected)/sales/page.tsx`, delete the client-side `filteredOrders` filter and render the server result directly.
- [ ] In `backend/tests/sales.test.js`, add a test asserting `?search=` matches an order on page two of a paginated fixture.
- [ ] In `backend/tests/sales.test.js`, add a test asserting `?sortBy=total&sortOrder=asc` returns ascending totals.
- [ ] Run `npm test -- sales.test.js service.test.js` from `backend/`, then build the frontend.

**Acceptance criteria**

- [ ] Searching an order number that lives on page 3 returns it from page 1 of the results.
- [ ] Clicking a sortable column header changes the returned order.
- [ ] An unknown `sortBy` value returns 400 rather than being ignored.
- [ ] The sales page no longer filters client-side.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js service.test.js
cd frontend && npm run build
```

**Do not**

Do not add a `$text` index. Do not make `search` match line-item product names,
that changes the result semantics and needs a product decision. Do not remove the
existing filter parameters.

**Rollback**

Revert the controllers, routes and the page. Search returns to being dropped.

**Open questions**

Which fields should `search` cover, and should sorting be offered on customer name
as well as date and total? I implemented the smallest set that makes the existing
UI honest. Widening it is a product call, which is why this is AGENT-ASSISTED.

---

### GAP-022 [CODE] The offline replay queue can stall indefinitely with no user-visible retry

> **FIXED 2026-09-09, Wave 3.** `replayOutbox` now reports whether it stopped
> on a transient failure, and `initOutboxSync` schedules a bounded backoff
> (5s, 15s, 45s, 120s) when it did. A real `online` event resets the schedule
> rather than waiting out the current delay, a clean run resets it too, and the
> teardown cancels any pending timer so it cannot fire against a torn-down query
> client. `/sync` renders Retry for the Pending and Syncing sections, not just
> Rejected.
>
> The backoff is deliberately finite. Entries carry their own `attempts` counter
> and are rejected at `OUTBOX_MAX_ATTEMPTS`, so an unbounded timer would keep
> waking to do nothing; the `online` event and the manual Retry remain the ways
> back.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on GAP-003 | Blocks none | Est. agent turns 4-8

**Location**
- `frontend/src/lib/offline/sync.ts:192-194` and `:222-235` (primary)
- `frontend/src/app/(protected)/sync/page.tsx:234-255`, `:263-268` (Retry rendered only for "Rejected")
- `frontend/src/hooks/useOutboxQueue.ts:57-59` (polls state, never replays)

**Evidence**

```ts
// frontend/src/lib/offline/sync.ts, the transient-stop branch
      // 'network-stop' or 'transient-stop': stop the whole run. Everything
      // from here on stays untouched and still `pending`, in order.
      break;
```

**What is wrong**

`initOutboxSync` wires replay to the browser `online` event and to one immediate
run at mount. A 5xx while the device stays online produces `transient-stop`,
which breaks the run and returns. No `online` event will ever fire because the
interface never dropped, and `useOutboxQueue` polls IndexedDB without ever
calling `replayOutbox`. On `/sync`, the Retry action is passed only to the
"Rejected" section.

**Why it matters**

A backend restart during a busy hour leaves queued sales sitting in "Pending"
with the navbar badge lit and no control anywhere to push them. The only
recoveries are a full page reload or physically toggling the device's wifi,
neither of which a counter operator will guess.

**Intended behavior**

A stalled queue is retryable from `/sync`, and a transient stop schedules its own
bounded retry rather than waiting for an event that will not arrive.

**Proposed fix**

Render the Retry action for the Pending and Syncing sections as well, wired to
`replayOutbox`. Add a bounded backoff timer in `initOutboxSync` that re-runs after
a transient stop, capped by the existing `OUTBOX_MAX_ATTEMPTS`. Keep replay
strictly sequential.

**Implementation checklist**

- [ ] In `frontend/src/app/(protected)/sync/page.tsx`, pass `renderActions` to the Pending and Syncing sections, wired to `replayOutbox`.
- [ ] In `frontend/src/lib/offline/sync.ts`, schedule a backoff re-run after a `transient-stop`, clearing any pending timer on a successful run.
- [ ] Ensure the timer is cleared on unmount so it cannot outlive the provider.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.
- [ ] Manually verify: stop the backend, queue an order, restart the backend, and confirm the queue drains without a page reload.

**Acceptance criteria**

- [ ] A Pending entry shows a working Retry control on `/sync`.
- [ ] After a backend restart, the queue drains without reloading the page.
- [ ] Replay remains strictly sequential, oldest first.
- [ ] `clientRequestId` is unchanged across retries.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not parallelise replay. Do not regenerate `clientRequestId` on retry. Do not
change the 4xx/5xx/network classification: GAP-003 fixes the backend side that
makes it misfire.

**Rollback**

Revert both files. The queue returns to stalling silently.

**Open questions**

None.

---

### GAP-023 [OPS] /health is a static 200, so a deploy is declared green on a dead application

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks GAP-024 | Est. agent turns 3-6

**Location**
- `backend/src/server.js:113-119` (primary)
- `backend/Dockerfile:27-28` (the container liveness probe)
- `.github/workflows/deploy.yml:220-232` (the deploy gate)

**Evidence**

```js
// backend/src/server.js:113-119
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});
```

**What is wrong**

The handler touches neither `mongoose.connection.readyState` nor the Redis
client. It returns 200 as long as the Node process is listening. A post-boot
Mongo drop only logs, so nothing else notices either.

**Why it matters**

If Mongo becomes unreachable after startup, Docker's HEALTHCHECK keeps the
container marked healthy, `restart: unless-stopped` never fires, and the deploy
workflow's poll reports "Backend is healthy" on a stack where every request 500s.
The deploy is declared successful on a dead application.

**Intended behavior**

`/health` reports 200 only when the process can serve requests, which means the
Mongo connection is in the connected state. Redis is optional by design, so its
absence is reported but does not fail the check.

**Proposed fix**

Return 503 with a body naming the failed dependency when
`mongoose.connection.readyState !== 1`, and include a `redis` field that reports
availability without affecting the status code. Keep the response shape
additive so the existing CI and deploy polls, which only check the HTTP status,
continue to work.

**Implementation checklist**

- [ ] In `backend/src/server.js`, import the mongoose connection state and return 503 from `/health` when it is not connected.
- [ ] Add a `dependencies` object to the response body reporting `mongo` and `redis` state.
- [ ] Add a `backend/tests/health.test.js` that mounts the route and asserts 503 when the connection is down.
- [ ] Run `npm test -- health.test.js` from `backend/`.

**Acceptance criteria**

- [ ] `/health` returns 200 with `dependencies.mongo` connected when the database is up.
- [ ] `/health` returns 503 when the Mongo connection is not in the connected state.
- [ ] Redis being absent yields 200 with `dependencies.redis` reported as unavailable.

**Verification commands**

```bash
cd backend && npm test -- health.test.js
curl -si http://localhost:5000/health | head -1
```

**Do not**

Do not make Redis failure return 503: the cache is optional by design. Do not
add an authentication requirement to `/health`; the Docker probe is unauthenticated.
Do not edit `server.js` concurrently with GAP-024; sequence them.

**Rollback**

Revert the handler. The probe returns to always-200.

**Open questions**

None.

---

### GAP-024 [OPS] No SIGTERM handler; every deploy severs in-flight writes and can break the ledger

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on GAP-023 | Blocks none | Est. agent turns 3-6

**Location**
- `backend/src/server.js:194-196` (primary; the `app.listen` return value is discarded)
- `backend/src/config/database.js:22` and `backend/src/config/redis.js:81` (SIGINT only)

**Evidence**

A repository-wide grep for `SIGTERM`, `unhandledRejection`, `uncaughtException`
and `server.close` across `backend/src` returns no matches. Only two `SIGINT`
handlers exist, both for connection teardown.

**What is wrong**

`docker compose up -d --build` sends SIGTERM to the old container on every
deploy. Node has no listener, so the process dies immediately, mid-request.
`app.listen`'s return value is discarded, so nothing can call `.close()` to drain.
`app.listen` also has no `error` listener, so an `EADDRINUSE` escapes
`startServer`'s try/catch as an uncaught exception rather than the intended exit.

**Why it matters**

A request that has completed `stock.save()` but not yet reached
`createMovementWithOldQuantity()` commits the quantity change and never writes
the `StockMovement` row. CLAUDE.md documents that three-step sequence as
load-bearing for the audit trail. A deploy during business hours can therefore
silently punch holes in the ledger, and nothing detects the divergence.

**Intended behavior**

On SIGTERM the server stops accepting new connections, finishes in-flight
requests within a bounded grace period, closes the Mongo and Redis connections,
and exits zero.

**Proposed fix**

Capture the `app.listen` return value, register SIGTERM and SIGINT handlers that
call `server.close()` and then close the database and cache connections, and exit
after a bounded timeout if connections do not drain. Add an `error` listener on
the server so `EADDRINUSE` reaches the existing failure path.

**Implementation checklist**

- [ ] In `backend/src/server.js`, assign the `app.listen` result to a `server` constant.
- [ ] Add an `error` listener on that server that logs and exits non-zero.
- [ ] Add a shared shutdown function handling SIGTERM and SIGINT: stop accepting connections, close Mongo and Redis, exit zero, with a bounded force-exit timer.
- [ ] Remove or fold in the two existing SIGINT handlers in `config/database.js` and `config/redis.js` so shutdown runs once.
- [ ] Add a `stop_grace_period` to the backend service in `docker-compose.yml` longer than the drain timeout.
- [ ] Manually verify: start the stack, issue a slow request, `docker compose stop backend`, and confirm the request completes.

**Acceptance criteria**

- [ ] SIGTERM causes the process to exit zero after in-flight requests finish.
- [ ] A request in flight at SIGTERM receives its response.
- [ ] `EADDRINUSE` produces a logged error and a non-zero exit, not an unhandled exception.

**Verification commands**

```bash
docker compose up -d backend
docker compose stop backend && docker compose logs backend | tail -20
```

**Do not**

Do not add `unhandledRejection` or `uncaughtException` handlers that swallow
errors and keep the process alive. Do not edit `server.js` at the same time as
GAP-023.

**Rollback**

Revert `server.js` and the compose grace period. Deploys return to hard kills.

**Open questions**

None.

---

### GAP-025 [PROJ] mobile-app is absent from every CI, security and Dependabot workflow

Severity S2 Major | Complexity S | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `.github/workflows/ci.yml` (three jobs, scoped to `backend` and `frontend`)
- `.github/workflows/security.yml:26` and `:77` (matrices listing only `[backend, frontend]`)
- `.github/dependabot.yml` (no `mobile-app` npm entry)
- `mobile-app/package.json` (defines `lint`, `typecheck`, `test`, all uninvoked)

**Evidence**

A grep for the string `mobile` across `.github/` returns nothing. `mobile-app`
defines `lint`, `typecheck` and `test` scripts, and no workflow runs any of them.

**What is wrong**

The mobile package is committed on `origin/master` with 37 files and roughly 50
dependencies, and no automated check touches it. It is outside the
`dependency-audit` and `image-scan` matrices, outside Dependabot's ecosystems,
and outside CI.

**Why it matters**

A change that breaks `tsc --noEmit` or `eslint` in `mobile-app` merges green.
Its dependency tree, which includes the whole Expo SDK 54 surface, receives no
security updates and is never audited. As the app grows from scaffold to product
this gap widens rather than closing.

**Intended behavior**

`mobile-app` is linted, type-checked and audited on every push and PR, on the
same terms as the other two packages.

**Proposed fix**

Add a `mobile-check` job to `ci.yml` running `npm ci`, `npm run lint`,
`npm run typecheck` and `npm test` in `mobile-app`. Add `mobile-app` to the
`dependency-audit` matrix in `security.yml`. Add an npm entry for
`/mobile-app` to `dependabot.yml` mirroring the frontend grouping. Do not add it
to `image-scan`: there is no Dockerfile for it.

**Implementation checklist**

- [ ] In `.github/workflows/ci.yml`, add a `mobile-check` job with `working-directory: mobile-app`, Node 22, `npm ci`, `lint`, `typecheck` and `test`.
- [ ] In `.github/workflows/security.yml`, add `mobile-app` to the `dependency-audit` matrix at line 26.
- [ ] In `.github/dependabot.yml`, add an npm ecosystem entry for `/mobile-app` with `mobile-minor-patch` and `mobile-major` groups mirroring the frontend.
- [ ] In `.github/workflows/dependabot-auto-merge.yml`, add `mobile-minor-patch` to the eligible group allow-list.
- [ ] Push and confirm all four jobs appear and pass on a PR.

**Acceptance criteria**

- [ ] A PR shows a `mobile-check` job that runs lint, typecheck and test.
- [ ] `dependency-audit (mobile-app)` appears as a check run.
- [ ] Dependabot opens grouped PRs for the mobile npm ecosystem.
- [ ] Introducing a deliberate type error in `mobile-app` fails CI.

**Verification commands**

```bash
cd mobile-app && npm ci && npm run lint && npm run typecheck && npm test
```

**Do not**

Do not enable branch protection for the new checks in this gap; GAP-011 must land
first and the names must be verified. Do not remove `passWithNoTests` yet,
GAP-044 covers adding real tests, and failing CI on an empty suite before then
would block every PR.

**Rollback**

Revert the four workflow files.

**Open questions**

None.

---

### GAP-026 [CODE] Five read endpoints have no pagination or no upper bound on limit

> **Partly overtaken by GAP-015d and its follow-up, 2026-09-08.** Several of
> these endpoints now bound `limit` at the route instead of the controller: the
> shared `limitRule()` in `backend/src/utils/queryRules.js` caps it at
> `PAGINATION.MAX_LIMIT` and 400s anything larger, which is applied to the stock,
> sales, service, product, category, branch and supplier list routes. That closes
> the *input* half for those, including `branchController.js:51`.
>
> What remains is the controller half, which is what this entry should now be
> read as: `getLowStock` still has no skip and no limit at all, and the
> controllers still trust whatever reaches them, which matters for any caller
> that bypasses the route. Re-check each location before working it rather than
> assuming the list is still accurate.

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/controllers/stockController.js:266-270` (primary: `getLowStock`, no skip and no limit)
- `backend/src/controllers/productController.js:283` (`.limit(parseInt(limit))`, uncapped)
- `backend/src/controllers/branchController.js:51` (`parseInt(limit)` with no `Math.min`)
- `backend/src/controllers/categoryController.js:36-42`, `:94-96`; `motorcycleModelController.js:63-65`

**Evidence**

```js
// backend/src/controllers/stockController.js:266-270: no skip, no limit
  const lowStockItems = await Stock.find(query)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code contact')
    .sort({ quantity: 1 });
```

Twelve other list reads apply `Math.min(parseInt(limit), PAGINATION.MAX_LIMIT)`.
These five do not.

**What is wrong**

`getLowStock`, `getCategories`, `getCategoryChildren` and `getMotorcycleModels`
return the entire matching set with populates attached. `searchProducts` takes
`limit` straight into `.limit()` with no cap and no route validator, so
`?limit=abc` yields `.limit(NaN)`. `getBranches` computes `parseInt(limit)` with
no clamp, and `branchRoutes.js` has no `limit` validator either. None of the
five guards against a negative or non-numeric value.

**Why it matters**

`GET /stock/low-stock` as an admin, with three branches and thousands of SKUs
below reorder point, serialises the whole set in one response, and it is exactly
the endpoint a dashboard polls. `GET /products/search?q=a&limit=100000` lets any
authenticated user pull the entire catalog in one request, 300 times per 15
minutes under the current limiter.

**Intended behavior**

Every list read clamps `limit` to `PAGINATION.MAX_LIMIT`, coerces non-numeric and
negative input to the default, and paginates.

**Proposed fix**

Add a shared `resolvePagination(query)` helper in `backend/src/utils/` returning
sanitised `pageNum`, `limitNum` and `skip`, clamping to `MAX_LIMIT` and falling
back to defaults on `NaN` or values below one. Apply it at all five sites and add
`skip`/`limit` to `getLowStock`, returning the paginated envelope. Add `limit`
validators to the branch and product-search routes.

**Implementation checklist**

- [ ] Create `backend/src/utils/pagination.js` exporting `resolvePagination`, clamping to `PAGINATION.MAX_LIMIT` and rejecting `NaN` and values below 1.
- [ ] Apply it in `getLowStock` and add `.skip()` and `.limit()`, returning through `ApiResponse.paginate`.
- [ ] Apply it in `searchProducts`, `getBranches`, `getCategories`, `getCategoryChildren` and `getMotorcycleModels`.
- [ ] Add `query('limit').optional().isInt({ min: 1, max: 100 }).toInt()` validators to `branchRoutes.js` and the product-search route.
- [ ] In `backend/tests/stock.test.js` and `product.test.js`, add tests asserting `?limit=100000` returns at most 100 rows and `?limit=abc` returns the default page size.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] No list endpoint returns more than `PAGINATION.MAX_LIMIT` rows.
- [ ] `?limit=abc` and `?limit=-5` both yield the default page size, not an error or an unbounded result.
- [ ] `GET /stock/low-stock` returns a paginated envelope with `total` and `pages`.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test
```

**Do not**

Do not change `PAGINATION.MAX_LIMIT`. Do not alter the twelve endpoints that
already clamp correctly beyond swapping in the shared helper. Do not edit
`productController.js` at the same time as GAP-015a; sequence them.

**Rollback**

Revert the helper and the five call sites. Note that `getLowStock`'s response
shape changes to a paginated envelope, so any client reading it as a bare array
must be updated in the same change; today the only consumer is the frontend
low-stock alert.

**Open questions**

None.

---

### GAP-027 [OPS] No resource limits or log rotation; staging and production share one box

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 2.5 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `docker-compose.yml` (primary), `docker-compose.staging.yml`, `docker-compose.production.yml`, `docker-compose.override.yml`
- `backend/src/server.js:49` and `:59-61` (two log lines per request)
- `docs/DEPLOYMENT.md:280-285` (documents the unpruned-image half and leaves it open)

**Evidence**

A grep across all four compose files for `deploy:`, `resources`, `limits`,
`mem_limit`, `cpus`, `logging:`, `max-size`, `ulimits` and `pids_limit` returns
zero matches.

**What is wrong**

Every service runs with unbounded memory and CPU and the default `json-file` log
driver with no `max-size` or `max-file`. The backend writes two log lines per
request. Staging and production share one VPS.

**Why it matters**

Three unbounded disk consumers compound on one box: per-request logs with no
rotation, unpruned image layers that `docs/DEPLOYMENT.md` already documents, and
Mongo's own growth. A memory leak or an OOM in staging takes production down with
it, because nothing constrains either stack.

**Intended behavior**

Each service has a memory limit sized to the box, and log files are capped and
rotated, so one stack cannot starve the other.

**Proposed fix**

Add a `logging` block with `max-size` and `max-file` to every service in the base
compose file, which the overlays inherit. Add `deploy.resources.limits.memory` per
service, with the staging overlay set lower than production. The exact numbers
depend on the VPS specification, which is not in the repository.

**Implementation checklist**

- [ ] In `docker-compose.yml`, add a `logging` driver block with `max-size` and `max-file` to the mongo, redis, backend and frontend services.
- [ ] In `docker-compose.yml`, add `deploy.resources.limits.memory` to each service using values supplied by the operator.
- [ ] In `docker-compose.staging.yml`, override those limits downward so staging cannot starve production.
- [ ] Add a scheduled image-prune step or a documented cron to `docs/DEPLOYMENT.md`, closing the item already flagged there.
- [ ] Verify with `docker compose config` that limits appear in the resolved configuration for both project names.

**Acceptance criteria**

- [ ] `docker compose -p talyer-production config` shows a memory limit and a log cap for every service.
- [ ] Staging limits are strictly lower than production limits.
- [ ] `docker inspect` on a running container reports the configured log options.

**Verification commands**

```bash
docker compose -p talyer-production config | grep -A3 'resources\|logging'
```

**Do not**

Do not guess memory limits. Do not add CPU pinning. Do not change the restart
policies.

**Rollback**

Revert the compose files. Containers return to unbounded.

**Open questions**

What are the VPS memory and CPU figures, and what split between staging and
production does the owner want? Without those numbers any limit is a guess that
could OOM-kill production, which is why this entry is AGENT-ASSISTED and the
checklist defers to operator-supplied values.

---

### GAP-028 [OPS] No backup or restore path for the MongoDB data or the uploads volume

Severity S1 Critical | Complexity M | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability HUMAN-FIRST |
Depends on none | Blocks none | Est. agent turns 6-12

**Location**
- `docker-compose.yml:67-70` (the three named volumes)
- `docs/DEPLOYMENT.md:367-369` (states the exposure)
- `README.md:750` (an unchecked "Automated database backups" roadmap box)

**Evidence**

A repository-wide grep for `mongodump`, `mongorestore`, `db.dump` and
`dumpDatabase` returns zero matches, and there is no `scripts/` directory. The
only scheduled workflow is `security.yml`'s weekly scan.

```
docs/DEPLOYMENT.md:367-369
Named volumes survive `up -d --build`, so application data is not affected by a
redeploy. `docker compose -p talyer-<env> down -v` **destroys that environment's
database**: it is not part of any workflow, and should not be.
```

**What is wrong**

`mongo-data`, `redis-data` and `backend-uploads` are named volumes on a single
self-hosted VPS with no replica, no snapshot, no export, and no restore
procedure. The only volume-copy command anywhere in the repository is a one-time
project-rename migration, not a backup. The documented "Rollback" section covers
application code only.

**Why it matters**

A single mistyped `down -v`, a disk failure, or a ransomware event destroys every
sales order, service job, stock ledger row, and product image with no recovery
path. This is the largest single risk in the repository, and the documentation
states the exposure without closing it. Every other data-integrity gap in this
document is survivable; this one is not.

**Intended behavior**

A scheduled job produces a consistent dump of the Mongo database and an archive of
the uploads volume, stores them off the VPS, verifies them, retains them on a
stated schedule, and has a restore procedure that has been executed at least once.

**Proposed fix**

Add a backup script invoking `mongodump` against the running container and
`tar` for the uploads volume, writing to a directory outside the Compose project.
Schedule it with a GitHub Actions cron on the self-hosted runner, or with a host
cron, whichever the owner prefers. Ship the matching restore script and a
documented drill. Off-site storage requires a destination and credentials that do
not exist in the repository, so an agent cannot complete this unaided.

**Implementation checklist**

- [ ] Create `scripts/backup.sh` running `mongodump` via `docker compose exec` and archiving the uploads volume, writing timestamped artifacts to an operator-supplied path.
- [ ] Create `scripts/restore.sh` taking a timestamp and restoring both, refusing to run unless an explicit confirmation flag is passed.
- [ ] Add a retention step pruning archives older than an operator-supplied window.
- [ ] Add a scheduled workflow, or a documented host cron, invoking the backup on the self-hosted runner.
- [ ] Add an off-site upload step using an operator-supplied destination and credential.
- [ ] Add a "Backup and restore" section to `docs/DEPLOYMENT.md` covering schedule, retention, off-site location, and the restore drill.
- [ ] Perform one restore drill into a scratch Compose project and record the date in that section.

**Acceptance criteria**

- [ ] A backup run produces a Mongo dump and an uploads archive with a timestamp.
- [ ] A restore into an empty scratch project reproduces the record counts of the source database.
- [ ] Archives older than the retention window are removed.
- [ ] `docs/DEPLOYMENT.md` names the schedule, the retention window, the off-site destination, and the date of the last successful drill.

**Verification commands**

```bash
bash scripts/backup.sh && ls -la "$BACKUP_DIR" | tail -5
bash scripts/restore.sh <timestamp> --confirm --project talyer-restoretest
docker compose -p talyer-restoretest exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("talyer-e-inventory").salesorders.countDocuments()'
```

**Do not**

Do not write backups to a volume inside the same Compose project. Do not commit
any credential or destination URL. Do not use `down -v` anywhere in these
scripts. Do not run the restore script against production during the drill.

**Rollback**

Remove the scripts and the schedule. No application code changes, so there is
nothing to revert in the running services.

**Open questions**

`RESOLUTION: HUMAN REQUIRED` for three inputs an agent cannot invent. Where should
backups be stored off-site, and with what credential? What retention window and
what recovery point objective does the owner accept, given the shop's tolerance
for losing a day of sales? And is a nightly dump sufficient, or is
point-in-time recovery needed, which would mean running Mongo as a replica set
rather than a standalone? The scripts are mechanical once those three are
answered; without them, any schedule or destination an agent picks is a guess
about the owner's risk tolerance.

---

### GAP-029 [CODE] Tax is charged on the pre-discount subtotal and the discount has no ceiling

Severity S2 Major | Complexity S | Difficulty D4 Judgment | Risk R3 |
Confidence C2 Strong | Priority score 2.0 | Agent suitability HUMAN-FIRST |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/models/SalesOrder.js:182-188` (primary)
- `backend/src/routes/salesRoutes.js:35`, `:37` (the unbounded discount validators)
- `backend/src/models/ServiceOrder.js:208-230` (the same arithmetic)

**Evidence**

```js
// backend/src/models/SalesOrder.js, the totals hook
  this.tax.amount = this.subtotal * (this.tax.rate / 100);
  ...
  this.total = this.subtotal + this.tax.amount - (this.discount || 0);
// backend/src/routes/salesRoutes.js:37
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
```

**What is wrong**

Tax is computed from `subtotal` and the order-level discount is subtracted
afterwards, so the customer pays tax on money they were never charged. Separately,
neither `discount` nor `items.*.discount` is bounded above: `isFloat({ min: 0 })`
with no `max`. A discount larger than the subtotal drives `total` negative into
the schema's `min: 0` validator, which surfaces as a 400 from deep in the model
rather than a field-level rejection, after the stock reservations have already
been taken.

**Why it matters**

A PHP 1,000 order with 12% VAT and a PHP 100 discount totals PHP 1,020 here,
against PHP 1,008 if the discount applied before tax: PHP 12 overcharged per
PHP 100 discounted, on every discounted sale. Whether that is wrong depends on
Philippine VAT rules for trade discounts, which the repository does not state.
The unbounded discount is unambiguously a defect regardless.

**Intended behavior**

The discount ordering matches the applicable tax rule, stated once in the code
with a comment citing that rule. A discount larger than the discountable base is
rejected by the route validator with a message naming the field.

**Proposed fix**

Two separable changes. The bound is mechanical: add a custom validator rejecting
an order-level discount above the computed subtotal and a line discount above the
line total. The ordering is not: it depends on a tax rule the repository does not
record. Do not change the ordering without an answer, because it alters every
historical comparison and the amounts customers were charged.

**Implementation checklist**

- [ ] In `backend/src/routes/salesRoutes.js`, add a custom validator rejecting `discount` greater than the summed line totals, with a message naming the field.
- [ ] In the same chain, bound `items.*.discount` by that line's `quantity * unitPrice`.
- [ ] Apply the same two bounds to the service-order route.
- [ ] In `backend/tests/sales.test.js`, add a test asserting an over-large discount returns 400 naming `discount` and leaves `reservedQuantity` unchanged.
- [ ] Only after the tax question below is answered, adjust the ordering in both models and add a comment citing the rule.
- [ ] Run `npm test -- sales.test.js service.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A discount exceeding the subtotal returns 400 naming the field, not a model-level "Total cannot be negative".
- [ ] A line discount exceeding its line total returns 400.
- [ ] No stock is reserved by a request rejected for either reason.
- [ ] The tax ordering is unchanged unless and until the open question is answered.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js service.test.js
```

**Do not**

Do not change the tax ordering on your own judgment. Do not introduce a
tax-exempt or zero-rated concept. Do not alter the `min: 0` schema guards, which
remain a correct backstop.

**Rollback**

Revert the validators. If the ordering was changed, note that orders created
under the new rule carry different totals, so a rollback leaves the data set
internally inconsistent; that is the main reason the ordering is gated on a human
answer.

**Open questions**

`RESOLUTION: HUMAN REQUIRED`. Under the applicable Philippine VAT treatment,
is a trade discount applied before or after VAT is computed? The code currently
applies it after, which charges VAT on the discounted amount. If the correct
treatment is before, every discounted order in the database has an incorrect
`tax.amount` and `total`, and correcting the code without deciding what to do
about existing rows leaves two populations of orders computed differently. The
decision brief the owner needs: the current behaviour overcharges roughly 12% of
each discount; changing it affects future orders only unless a migration is also
commissioned; and the answer determines whether a migration is needed at all.

---

### GAP-030 [SEC] The service worker caches cross-origin API responses in a shared bucket

Severity S2 Major | Complexity S | Difficulty D2 Standard | Risk R2 |
Confidence C2 Strong | Priority score 2.0 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `frontend/src/app/sw.ts:18` (primary; `runtimeCaching: defaultCache`)
- `frontend/src/lib/offline/cache.ts:76-78` (`clearOfflineCache`, which touches only IndexedDB)
- `frontend/public/sw.js` (the generated artifact showing the catch-all rule)

**Evidence**

The generated service worker contains a catch-all NetworkFirst rule for every
cross-origin GET, named `cross-origin`, with 32 entries, a one-hour TTL and a
ten-second network timeout. The backend is a different origin in every compose
file, port 5000 against the frontend's 3000.

**What is wrong**

Serwist's `defaultCache` ends with that catch-all, so authenticated API responses
land in Cache Storage. Nothing clears Cache Storage on logout;
`clearOfflineCache()` only touches IndexedDB. CLAUDE.md states the opposite as a
design guarantee: the service worker "deliberately does not cache API responses:
a shared HTTP cache on a shared tablet can serve one user's data to the next."

**Why it matters**

On a link slower than the ten-second timeout, or offline, NetworkFirst serves the
cached copy. After user A logs out and user B logs in on the same tablet, a slow
`/api/sales` request can render A's order list to B. This is the same class of
cross-user leak as GAP-002 and on the same device.

**Intended behavior**

No API response is written to Cache Storage, and any cache the app does keep is
cleared on logout.

**Proposed fix**

Replace `defaultCache` with an explicit list that omits the cross-origin
catch-all and the same-origin `/api/*` rule, keeping the app-shell precache and
static-asset rules. Additionally clear Cache Storage on logout as a defence in
depth. I marked this C2 rather than C1 because the evidence is the generated
`sw.js` and Serwist's published `defaultCache` composition rather than a runtime
observation; confirm by inspecting Cache Storage in DevTools after an API call.

**Implementation checklist**

- [ ] In `frontend/src/app/sw.ts`, replace `runtimeCaching: defaultCache` with an explicit rule array covering fonts, images and static assets only.
- [ ] Verify the regenerated `frontend/public/sw.js` contains no `cross-origin` cache entry and no `apis` rule.
- [ ] In `frontend/src/lib/offline/cache.ts`, extend `clearOfflineCache()` to delete all Cache Storage buckets the app owns.
- [ ] Run `npm run build` from `frontend/` and confirm the service worker is emitted.
- [ ] Manually verify in DevTools: after loading the sales list, Application > Cache Storage contains no API response.

**Acceptance criteria**

- [ ] After exercising the app, Cache Storage holds no entry whose URL points at the API origin.
- [ ] The app shell still loads offline and `/offline` still serves for uncached navigations.
- [ ] Logging out leaves Cache Storage empty of app-owned buckets.

**Verification commands**

```bash
cd frontend && npm run build
grep -c 'cross-origin' public/sw.js    # expect 0
```

**Do not**

Do not remove the app-shell precache or the `/offline` fallback. Do not disable
the service worker. Do not remove the `--webpack` flag from the build script:
`@serwist/next` has no Turbopack support and dropping it ships no service worker
at all.

**Rollback**

Revert `sw.ts` and rebuild. Existing clients keep whatever service worker they
last installed until it updates.

**Open questions**

Should any API response be cached deliberately, for example the product catalog,
to speed a cold offline start? The IndexedDB mirror already covers that need, so
I assumed no. Confirming that is a design call, which is why this is
AGENT-ASSISTED.

---

### GAP-031 [CODE] Cache invalidation is incomplete and one cache key omits a request parameter

Severity S3 Moderate | Complexity XS | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `backend/src/controllers/categoryController.js:28` (primary; the key that omits `includeChildren`)
- `backend/src/controllers/categoryController.js:38-40` (the branch that changes the shape)
- `backend/src/controllers/productController.js:351-353`, `:430-432`, `:456-458`, `:492-494` (mutations that clear the wrong patterns)

**Evidence**

```js
// backend/src/controllers/categoryController.js:28 and :38-40
  const cacheKey = CacheUtil.generateKey('categories', 'list', JSON.stringify(query));
  ...
  if (includeChildren === 'true') {
    categoriesQuery = categoriesQuery.populate('children');
  }
```

**What is wrong**

Two related defects. `includeChildren` is read from `req.query` but never enters
`query`, so it never enters the cache key: whichever variant is requested first
populates the entry and every subsequent request with the other value gets the
wrong shape for up to an hour. Separately, the category list caches a
`productCount` for `CACHE_TTL.LONG`, and no product write clears
`cache:categories:*`; `createProduct` clears the singular `cache:category:*` but
not the list, and `updateProduct`, `deleteProduct` and `restoreProduct` clear
neither. The motorcycle-model controller does this correctly in the other
direction, which shows the rule was understood and applied asymmetrically.

**Why it matters**

The first request of the hour being a flat `GET /categories` means every
`GET /categories?includeChildren=true` for the next sixty minutes returns
categories with no `children` array, so a category-tree UI renders every node as
a leaf. Restart Redis and the failure inverts. Meanwhile an admin who adds twelve
products to a category sees the old count for up to an hour. Redis is optional,
so none of this is visible in the test suite or in a dev setup without it.

**Intended behavior**

Two different response shapes never share a cache entry, and any write that
changes a cached count invalidates the caches holding it.

**Proposed fix**

Include `includeChildren` in the generated cache key. Add
`CacheUtil.delPattern('cache:categories:*')` and
`cache:motorcycleModels:*` to the four product mutation paths, alongside the
patterns they already clear. Both are additive.

**Implementation checklist**

- [ ] In `backend/src/controllers/categoryController.js`, add `includeChildren` to the `generateKey` arguments at line 28.
- [ ] In `backend/src/controllers/productController.js`, add `cache:categories:*` and `cache:motorcycleModels:*` invalidation to `createProduct`, `updateProduct`, `deleteProduct` and `restoreProduct`.
- [ ] In `backend/src/controllers/productController.js`, add `cache:products:search:*` invalidation to the three image endpoints.
- [ ] In `backend/tests/category.test.js`, add a test requesting the list with and without `includeChildren` and asserting the shapes differ.
- [ ] Run `npm test -- category.test.js product.test.js` from `backend/`.

**Acceptance criteria**

- [ ] Requesting `GET /categories` then `GET /categories?includeChildren=true` returns two different shapes, in either order.
- [ ] Creating a product changes the `productCount` returned by the next category-list read.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test -- category.test.js product.test.js
```

**Do not**

Do not shorten `CACHE_TTL.LONG`. Do not switch the controller-side caching to
`cacheMiddleware`; the two produce different keys and mixing them for one
resource is the underlying hazard. Do not touch `delPattern`'s implementation,
GAP-048 owns it.

**Rollback**

Revert both controllers. Existing cache entries expire on their own TTL.

**Open questions**

None.

---

### GAP-032 [CODE] CORS_ALLOWED_ORIGINS is split without trimming and no Vary: Origin is sent

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `backend/src/config/constants.js:101-104` (primary)
- `backend/src/server.js:68-86` (the matcher; no `Vary` header anywhere in the file)

**Evidence**

```js
// backend/src/config/constants.js:101-104
  ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',')
    : [process.env.CLIENT_URL || 'http://localhost:3000'],
```

**What is wrong**

No `.map(s => s.trim())` and no `.filter(Boolean)`. `server.js:72` matches with an
exact `Array.includes(origin)`, so a value written the way people write lists,
with a space after the comma, yields an entry with a leading space that never
matches. Separately, the allow-origin header is origin-dependent with no
`Vary: Origin`.

**Why it matters**

A second configured origin silently fails CORS with no log line: the header is
simply omitted, the browser blocks the response including cookie-based refresh,
and the symptom presents as "the staging frontend cannot log in" with nothing
server-side to look at. The missing `Vary` matters more now that
`docs/DEPLOYMENT.md` prescribes nginx in front of the stack: once a shared cache
is enabled, a response cached for one origin is served to another with a
mismatched allow-origin header.

**Intended behavior**

Whitespace around a comma-separated origin is tolerated, and every response whose
allow-origin header depends on the request carries `Vary: Origin`.

**Proposed fix**

Add `.map(s => s.trim()).filter(Boolean)` to the split. Set `Vary: Origin` in the
CORS middleware unconditionally, before the origin test, so it is present whether
or not the origin matched.

**Implementation checklist**

- [ ] In `backend/src/config/constants.js`, add `.map` and `.filter` to the `ALLOWED_ORIGINS` split.
- [ ] In `backend/src/server.js`, add `res.header('Vary', 'Origin')` at the top of the CORS middleware, before the allow-list test.
- [ ] Add a test asserting a configured origin with surrounding whitespace is accepted.
- [ ] Add a test asserting every response carries `Vary: Origin`.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] An origin list written with spaces after the commas admits every listed origin.
- [ ] Every response carries `Vary: Origin`, including responses to disallowed origins.
- [ ] An unlisted origin still receives no allow-origin header.

**Verification commands**

```bash
cd backend && npm test
```

**Do not**

Do not switch to the `cors` package. Do not widen the allow-list or add a
wildcard. Do not edit `server.js` concurrently with GAP-023 or GAP-024.

**Rollback**

Revert both files.

**Open questions**

None.

---

### GAP-033 [SEC] The defensive .select() in userController excludes fields that do not exist

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-3

**Location**
- `backend/src/controllers/userController.js:61`, `:84`, `:141`, `:223`, `:260`, `:289` (all six)
- `backend/src/models/User.js:77`, `:81` (the real field names)

**Evidence**

```js
// backend/src/controllers/userController.js:61 (and five identical siblings)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
// backend/src/models/User.js:77,81: the actual names
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
```

**What is wrong**

The schema fields are `resetPasswordToken` and `resetPasswordExpire`; the
exclusion lists name `passwordResetToken` and `passwordResetExpires`. Mongoose
silently ignores an exclusion for a path that does not exist, so those two
clauses are dead at all six call sites.

**Why it matters**

There is no live leak today, because the schema marks both fields
`select: false`. But the defence in depth that was written to survive a schema
change is not there. Removing `select: false` while debugging the reset flow, a
plausible edit, would immediately begin returning live password-reset token
hashes and expiries from six admin endpoints, and the guard intended to prevent
exactly that would not fire.

**Intended behavior**

The exclusion lists name the fields that actually exist, so the guard works
independently of the schema's `select: false`.

**Proposed fix**

Correct the two names at all six sites. A shared constant for the projection
string would prevent the six copies drifting again and is worth adding in the
same change.

**Implementation checklist**

- [ ] Add a `PUBLIC_USER_PROJECTION` constant in `backend/src/controllers/userController.js` naming `-password -refreshToken -resetPasswordToken -resetPasswordExpire`.
- [ ] Replace the string at lines 61, 84, 141, 223, 260 and 289 with that constant.
- [ ] Add a test that temporarily selects the reset fields and asserts they are absent from a user-list response.
- [ ] Run `npm test -- user.test.js` from `backend/`.

**Acceptance criteria**

- [ ] `grep -n passwordReset backend/src/controllers/userController.js` returns no matches.
- [ ] All six reads use the shared constant.
- [ ] The user suite passes unchanged.

**Verification commands**

```bash
cd backend && npm test -- user.test.js
grep -n "passwordReset" src/controllers/userController.js   # expect no output
```

**Do not**

Do not remove `select: false` from the model. Do not change which fields are
excluded beyond correcting the two misspellings.

**Rollback**

Revert the constant and the six call sites.

**Open questions**

None.

---

### GAP-034 [CODE] Dead configuration: unused constants, unused CORS headers, divergent upload limits

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 3-5

**Location**
- `backend/src/config/constants.js:52`, `:59`, `:66`, `:75` (`NOTIFICATION_TYPES`, `NOTIFICATION_CATEGORIES`, `EXPENSE_CATEGORIES`, `TRANSACTION_TYPES`: no importer)
- `backend/src/config/constants.js:112`, `:117` (`X-Refresh-Token`, `X-Total-Count`, `X-Total-Pages`: never set or read)
- `backend/src/config/constants.js:95-99` versus `backend/src/middleware/imageUpload.js:8-15`

**Evidence**

Grepping each symbol across `backend/src` and `frontend/src`, excluding
`constants.js` itself, returns no matches for `NOTIFICATION_TYPES`,
`NOTIFICATION_CATEGORIES`, `EXPENSE_CATEGORIES`, `TRANSACTION_TYPES`,
`X-Refresh-Token`, `X-Total-Count` and `X-Total-Pages`. `UPLOAD.ALLOWED_IMAGE_TYPES`
lists three MIME types; `imageUpload.js` defines its own `IMAGE_CONFIG` listing
four, adding `image/webp`, and never imports `UPLOAD`.

**What is wrong**

Four enum constants exist for features that were never built, three CORS header
entries are configured for headers nothing sets or reads, and the upload limits
are declared twice with the two copies already diverged.

**Why it matters**

The `UPLOAD` divergence is the one with teeth: someone tightening the accepted
MIME types by editing `constants.js`, the obvious place given every other
cross-cutting value lives there, changes nothing and will believe the restriction
shipped. `X-Refresh-Token` in the allowed-headers list is a small unnecessary
widening of the preflight surface. The unused enums mislead a reader into
thinking notifications and expenses exist.

**Intended behavior**

Configuration that nothing reads is deleted, and any value that must be shared is
declared once and imported.

**Proposed fix**

Have `imageUpload.js` import `UPLOAD` from `constants.js` and delete its local
`IMAGE_CONFIG`, keeping the four-type list including `image/webp` as the single
source. Remove `X-Refresh-Token` from `ALLOWED_HEADERS` and remove
`EXPOSED_HEADERS` entirely. Delete the four unused enums, or, if the POST-MVP
phases are imminent, leave them with a comment naming the phase that will consume
them. Deleting is cleaner; the phase docs are the record of intent.

**Implementation checklist**

- [ ] In `backend/src/config/constants.js`, update `UPLOAD.ALLOWED_IMAGE_TYPES` to include `image/webp`, matching the middleware.
- [ ] In `backend/src/middleware/imageUpload.js`, import `UPLOAD` and delete the local `IMAGE_CONFIG`, using the shared constant for the size limit and type list.
- [ ] In `backend/src/config/constants.js`, remove `X-Refresh-Token` from `ALLOWED_HEADERS` and remove the `EXPOSED_HEADERS` key.
- [ ] In `backend/src/config/constants.js`, delete `NOTIFICATION_TYPES`, `NOTIFICATION_CATEGORIES`, `EXPENSE_CATEGORIES` and `TRANSACTION_TYPES`.
- [ ] Run `npm test` from `backend/` and confirm nothing referenced the removed symbols.

**Acceptance criteria**

- [ ] `imageUpload.js` contains no local MIME-type or size list.
- [ ] Uploading a WebP image still succeeds and uploading a GIF still fails.
- [ ] `X-XSRF-TOKEN` remains in `ALLOWED_HEADERS`: removing it breaks token refresh entirely.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test
grep -n "X-XSRF-TOKEN" src/config/constants.js   # must still match
```

**Do not**

Do not remove `X-XSRF-TOKEN` from `ALLOWED_HEADERS`. CLAUDE.md records that
dropping it fails the preflight for the refresh call, which logs out every user at
their first token expiry. Do not delete `TRANSACTION_TYPES` if GAP-050 is being
worked concurrently.

**Rollback**

Revert `constants.js` and `imageUpload.js`.

**Open questions**

None.

---

### GAP-035 [PROJ] Branch and workspace hygiene: staging is 94 commits behind master

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R2 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability HUMAN-FIRST |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- The `staging` branch, and 16 local branches
- `docs/DEPLOYMENT.md:28-37` (which treats `staging` as a live deploy target)

**Evidence**

`git rev-list --left-right --count master...staging` returns `94 0`: master is 94
commits ahead and staging is zero ahead. The local checkout is 8 commits behind
`origin/master`. Sixteen local branches exist, most last touched in early August
against a master last touched 2026-08-17, including two leftover
`worktree-agent-*` branches.

**What is wrong**

The `staging` branch, which both CI workflows run against and which
`docs/DEPLOYMENT.md` names as a deploy environment, has received nothing for 94
commits. Staging therefore validates a codebase that no longer resembles
production. The stale local branches are lower stakes but make it hard to see
what is actually in flight.

**Why it matters**

Staging exists to catch problems before production. Deploying it today would
exercise the system as it was weeks ago, so a staging pass says nothing about a
production candidate. Worse, someone may reasonably believe staging is a preview
of production and act on what they see there.

**Intended behavior**

`staging` tracks `master` closely enough that a staging deploy is a meaningful
rehearsal, and merged or abandoned branches are deleted.

**Proposed fix**

Fast-forward `staging` to `master`, then delete the local branches whose work is
merged and the two `worktree-agent-*` leftovers. Deciding which unmerged branches
are abandoned rather than paused requires knowing the developer's intent, which is
why this is HUMAN-FIRST.

**Implementation checklist**

- [ ] Confirm `staging` is strictly behind `master` with `git rev-list --left-right --count master...staging`.
- [ ] Fast-forward `staging` to `master` and push it.
- [ ] Run a staging deploy and confirm it comes up healthy before touching anything else.
- [ ] List local branches fully merged into `master` and delete them.
- [ ] Delete the two `worktree-agent-*` branches and prune any stale worktree registrations.
- [ ] Record in `docs/DEPLOYMENT.md` that `staging` is expected to track `master`, and how often.

**Acceptance criteria**

- [ ] `git rev-list --left-right --count master...staging` reports `0 0`.
- [ ] A staging deploy succeeds against the fast-forwarded branch.
- [ ] No `worktree-agent-*` branch remains.
- [ ] `docs/DEPLOYMENT.md` states the tracking expectation.

**Verification commands**

```bash
git fetch --all --prune
git rev-list --left-right --count master...staging      # expect 0 0
git branch --merged master | grep -v '^\*\|master'      # candidates for deletion
```

**Do not**

Do not force-push `staging`. Do not delete any unmerged branch without the
owner's confirmation. Do not delete `master` or `origin/master`.

**Rollback**

Branch deletions are recoverable from the reflog for a period; record the SHAs
before deleting. The `staging` fast-forward is trivially reversible by resetting
to the recorded SHA.

**Open questions**

`RESOLUTION: HUMAN REQUIRED` for the branch deletions only. Which of the
unmerged local branches: `feat/navbar-icon-only`, `feat/offline-pwa`,
`fix/admin-update-branch-null`, `deps/redis6-uuid14`,
`fix/dependabot-noise-and-authz-gaps`, `fix/ci-red-jobs`,
`feat/seeding-and-deploy-pipeline`: hold work that is still wanted? An agent
cannot tell an abandoned experiment from a paused feature, and deleting the wrong
one loses work that exists nowhere else. The fast-forward of `staging` needs no
decision and can proceed.

---

### GAP-036 [OPS] seedBranches.js self-executes on import with no main-module guard

> **FIXED 2026-09-08, Wave 2.** Three guards now stand between an import and a
> deletion: the module must be the process entry point, `--confirm` must be
> passed, and `NODE_ENV=production` additionally needs `--force-production`. The
> target host and database are printed, credentials redacted, before anything is
> deleted. Verified: importing the module performs no writes, and both refusal
> paths exit 1.

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `backend/src/utils/seedBranches.js` (the bare top-level `seedBranches()` call at the end of the file)
- `CLAUDE.md`, *Commands* section, which advertises running it

**Evidence**

The file ends with a bare `seedBranches();`. The function connects with
`mongoose.connect(process.env.MONGODB_URI)` and then runs
`Branch.deleteMany({})`. There is no `import.meta.url` guard, no `NODE_ENV`
check, and no confirmation prompt. CLAUDE.md documents the command and labels it
DESTRUCTIVE.

**What is wrong**

Importing the module for any reason executes the deletion. Today nothing imports
it and there is no npm script, so it is reachable only by a deliberate manual
run, but the safety depends entirely on nobody ever importing the file.

**Why it matters**

A developer with `backend/.env` temporarily pointed at production, a normal state
while investigating production data, runs the documented command and deletes every
Branch document, exiting zero. Every salesperson and mechanic then holds a branch
id that no longer resolves, and `User` makes `branch` required for those roles, so
their next profile save fails validation. Stock rows keyed on the deleted branch
ids are orphaned with no cascade.

**Intended behavior**

The module can be imported safely, and running it directly requires an explicit
confirmation and refuses to run against a production database by default.

**Proposed fix**

Guard the invocation behind a check that the module is the entry point, and
require an explicit `--confirm` argument. Refuse to run when `NODE_ENV` is
`production` unless a second explicit override flag is passed. Print the target
database host before acting.

**Implementation checklist**

- [ ] In `backend/src/utils/seedBranches.js`, wrap the bare call in a check comparing `import.meta.url` against the process entry point.
- [ ] Require a `--confirm` argument, printing usage and exiting non-zero without it.
- [ ] Refuse to run when `NODE_ENV === 'production'` unless an explicit override flag is also present.
- [ ] Log the resolved database host before deleting, so the operator can abort.
- [ ] Update the CLAUDE.md command line to include the new flag.

**Acceptance criteria**

- [ ] Importing the module performs no database work.
- [ ] Running it without `--confirm` exits non-zero and deletes nothing.
- [ ] Running it with `NODE_ENV=production` and no override exits non-zero.
- [ ] Running it with `--confirm` in development still seeds the three branches.

**Verification commands**

```bash
cd backend && node -e "import('./src/utils/seedBranches.js').then(()=>console.log('imported, no writes'))"
node src/utils/seedBranches.js            # expect usage message, exit non-zero
```

**Do not**

Do not add it to `package.json` scripts. Do not change the seeded branch data.
Do not apply the same guard to `seedAdmin.js`, which is deliberately called from
`server.js` on boot and is already idempotent.

**Rollback**

Revert the file. Note that any branches deleted before the guard existed are not
recoverable without a backup, which is GAP-028.

**Open questions**

None.

---

### GAP-037 [OPS] The repo-root uploads/ directory is neither gitignored nor mounted

> **FIXED 2026-09-08, Wave 2.** `/uploads/` is gitignored at the repository
> root, and `backend/src/utils/uploadsPath.js` resolves the directory from its
> own module location so the launch directory no longer decides where images go.
> Both the multer writer and the `express.static` mount use it. The container
> path is unchanged: `/app/src/utils/` resolves to `/app/uploads`, which is where
> `docker-compose.yml` mounts the `backend-uploads` volume.
>
> One knock-on: `import.meta` is a *parse* error under Jest's Babel-to-CJS
> transform, so any file containing it fails to load and takes its whole suite
> with it. `product.test.js` and `imageUpload.test.js` both broke this way.
> `babel-plugin-transform-import-meta` is now a devDependency and is registered
> in `babel.config.cjs`; the production ESM path is untouched.

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-3

**Location**
- `.gitignore` (covers `backend/uploads/`, not the repo-root `uploads/`)
- `backend/src/server.js:42` and `backend/src/middleware/imageUpload.js` (both `process.cwd()`-relative)

**Evidence**

`git check-ignore -v uploads/products/test.jpg` exits non-zero with no output, so
the path is not ignored, while `git check-ignore -v backend/uploads` matches the
`backend/uploads/` rule. An empty `uploads/products/` directory exists at the
repository root.

**What is wrong**

Image paths are resolved from `process.cwd()`. Inside the container that is
`/app`, correctly backed by the `backend-uploads` volume. Running `npm run dev`
from `backend/` writes to `backend/uploads/`, which is ignored. Launching from
the repository root: `node backend/src/server.js`, a systemd unit with no
`WorkingDirectory`, a PM2 default: writes to a root `uploads/` that no ignore
rule covers. The empty directory already present is evidence that has happened at
least once.

**Why it matters**

A single `git add .` after a root-cwd launch commits user-uploaded binary blobs
into history permanently. Separately, images written to the root path are
invisible to `express.static` when the app is next started correctly, so those
products show broken images with no error logged, because the directory creation
is wrapped in a try/catch that swallows the mismatch.

**Intended behavior**

No uploads directory is ever committable, and the resolved uploads path does not
depend on where the process was launched from.

**Proposed fix**

Add a root-level `uploads/` rule to `.gitignore`, and resolve the uploads
directory from the module's own location rather than `process.cwd()` so the path
is stable regardless of launch directory. The ignore rule alone closes the
commit risk; the path fix closes the broken-image case.

**Implementation checklist**

- [ ] In `.gitignore`, add a rule covering the repository-root `uploads/`.
- [ ] In `backend/src/middleware/imageUpload.js`, resolve the uploads directory relative to the module location instead of `process.cwd()`.
- [ ] In `backend/src/server.js`, resolve the static mount path the same way.
- [ ] Verify `git check-ignore -v uploads/products/test.jpg` now matches.
- [ ] Run `npm test` from `backend/` and confirm the image-upload suite still passes.

**Acceptance criteria**

- [ ] `git check-ignore uploads/products/test.jpg` exits zero.
- [ ] `git status --porcelain uploads/` reports nothing after writing a file there.
- [ ] Starting the server from the repository root and from `backend/` resolves the same uploads directory.
- [ ] The container path is unchanged, so the named volume still receives uploads.

**Verification commands**

```bash
git check-ignore -v uploads/products/test.jpg
cd backend && npm test -- imageUpload.test.js
```

**Do not**

Do not delete the existing `backend/uploads/` contents. Do not change the
container `WORKDIR` or the volume mount in any compose file. Do not remove the
try/catch around directory creation; it exists for read-only filesystems.

**Rollback**

Revert `.gitignore` and the two path resolutions.

**Open questions**

None.

---

### GAP-038 [SEC] Image processing returns the raw internal error message and path on 500

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `backend/src/middleware/imageUpload.js:118-125` (primary)
- `backend/src/middleware/errorHandler.js:44-51` (the redaction this bypasses)

**Evidence**

```js
// backend/src/middleware/imageUpload.js:120-124
    return res.status(500).json({
      success: false,
      message: 'Failed to process image',
      error: error.message,
    });
```

**What is wrong**

`errorHandler` deliberately collapses every 5xx message in production because
internal failures can carry connection strings and file paths. This handler
answers directly with `res.status(500).json(...)` and never reaches that
middleware, so `error.message` goes to the client verbatim in every environment.
It also breaks the `ApiResponse` envelope the frontend types expect.

**Why it matters**

A sharp or filesystem failure on a host with a full or read-only disk returns the
container's absolute upload path and the exact errno in the HTTP response, in
production. The audience is limited to admins, so the severity is moderate rather
than major, but the fix is one line and the same class of leak was already closed
in `errorHandler` and left open here.

**Intended behavior**

The handler forwards the error to `errorHandler` via `next(error)`, so production
redaction and the response envelope both apply.

**Proposed fix**

Replace the direct `res.status(500).json(...)` with `next(error)`. The
`errorHandler` already produces a correctly shaped 500 and redacts the message in
production.

**Implementation checklist**

- [ ] In `backend/src/middleware/imageUpload.js`, replace the direct 500 response at lines 118-125 with `return next(error)`.
- [ ] Confirm the enclosing function receives `next` and forwards it.
- [ ] In `backend/tests/imageUpload.test.js`, add a test forcing a processing failure and asserting `next` is called with the error rather than a response being written.
- [ ] Run `npm test -- imageUpload.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A processing failure calls `next(error)` and writes no response directly.
- [ ] In production the client receives the message `Server Error` with no path or errno.
- [ ] The response carries the standard `ApiResponse` shape.

**Verification commands**

```bash
cd backend && npm test -- imageUpload.test.js
```

**Do not**

Do not change the `sharp` pipeline. In particular do not move `.rotate()` after
`.resize()`: CLAUDE.md records that ordering as load-bearing for EXIF
orientation, and `imageUpload.test.js` guards it. Do not edit this file at the
same time as GAP-034.

**Rollback**

Revert the one line.

**Open questions**

None.

---

### GAP-039 [CONTRA] apiLimiter is documented as 300/IP and implemented as 3000/user

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-3

**Location**
- `backend/src/middleware/rateLimit.js:74-77` (the implementation, authoritative)
- `CLAUDE.md`, *Security middleware* section (stale)
- `backend/src/routes/authRoutes.js:98-100` (a stale in-code comment)

**Evidence**

```js
// backend/src/middleware/rateLimit.js:74-77
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  keyGenerator: userOrIpKey,
```

CLAUDE.md states "`apiLimiter` (300 requests/15 min)" and "Both key clients by
`req.ip`". `authRoutes.js:99` repeats "the router-level apiLimiter (300 req/15
min)".

**What is wrong**

The documented ceiling is ten times lower than the implemented one, and the
documented keying is by IP where the implementation prefers a verified JWT
subject and falls back to the IP only for unauthenticated traffic. Both the
CLAUDE.md paragraph and the in-code comment are stale.

**Why it matters**

Anyone sizing capacity, writing a load test, or reasoning about abuse from the
documentation is wrong by an order of magnitude and wrong about the keying. The
`TRUST_PROXY` explanation in the same CLAUDE.md section is consequently also
misleading: it still matters for `authLimiter` and unauthenticated traffic, but no
longer for authenticated requests. Full detail is in CONTRA-1 in section 9.

**Intended behavior**

The documentation describes the implemented limiter.

**Proposed fix**

Update the CLAUDE.md *Security middleware* paragraph and the `authRoutes.js`
comment to state 3000 requests per 15 minutes keyed by authenticated user with an
IP fallback, and correct the `TRUST_PROXY` sentence to say it governs
unauthenticated traffic and `authLimiter`. Do not change `rateLimit.js`: the
implementation is better than the documentation and has its own test suite.

**Implementation checklist**

- [ ] Update the `apiLimiter` sentence in the CLAUDE.md *Security middleware* section to the implemented figure and keying.
- [ ] Update the `TRUST_PROXY` sentence in the same section to scope it to `authLimiter` and unauthenticated traffic.
- [ ] Update the stale comment at `backend/src/routes/authRoutes.js:98-100`.
- [ ] Confirm `backend/src/middleware/rateLimit.js` is unmodified.

**Acceptance criteria**

- [ ] No document or comment states 300 requests per 15 minutes for `apiLimiter`.
- [ ] `git diff --stat` shows no change to `backend/src/middleware/rateLimit.js`.
- [ ] The backend suite passes unchanged.

**Verification commands**

```bash
grep -rn "300 req" CLAUDE.md backend/src/    # expect no output
cd backend && npm test -- rateLimit.test.js rateLimitKey.test.js
```

**Do not**

Do not change the limiter's `max` or `keyGenerator`. Do not remove
`userOrIpKey`.

**Rollback**

Revert the documentation edits.

**Open questions**

None.

---

### GAP-040 [CODE] Every human-readable identifier is generated with countDocuments() + 1

Severity S2 Major | Complexity M | Difficulty D2 Standard | Risk R3 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks GAP-046 | Est. agent turns 6-12

**Location**
- `backend/src/controllers/salesController.js:249-251` (primary)
- `backend/src/controllers/serviceController.js:237-238`
- `backend/src/models/SalesOrder.js:161-168`, `ServiceOrder.js`, `StockTransfer.js`, `Transaction.js`, `Product.js`
- `backend/src/models/StockMovement.js:125-145` (the regex-scan variant)

**Evidence**

```js
// backend/src/controllers/salesController.js:249-251
  const count = await SalesOrder.countDocuments();
  const year = new Date().getFullYear();
  const orderNumber = `SO-${year}-${String(count + 1).padStart(6, '0')}`;
```

**What is wrong**

Eight generation sites count a collection and add one, then insert against a
unique index. Two concurrent creates read the same count, build the same string,
and the second is rejected with a duplicate-key error. The count is also over the
whole collection rather than the year, so the `SO-YYYY-` prefix is decorative and
the sequence never resets. Any hard delete makes the counter run backwards and
reuse a retired identifier. `StockMovement` uses a regex scan for the last id,
which has the same race but fires *after* the stock quantity has already been
saved, so a collision aborts the loop with the ledger row missing.

**Why it matters**

Two cashiers ringing up in the same second both compute `SO-2026-000517`; one
receives a 400 and the customer's sale vanishes, with its stock reservations
already stranded. On the offline path the failure is worse: `sync.ts` classifies a
4xx as permanent and discards the queued sale, so a numbering collision destroys a
real order rather than retrying it. The `StockMovement` counter is global, so a
restock at one branch can break a sale at another.

**Intended behavior**

Identifier generation is atomic. Concurrent creates receive distinct, monotonic
identifiers, the sequence is scoped to the period the prefix advertises, and a
deletion never causes reuse.

**Proposed fix**

Introduce a `Counter` collection keyed by sequence name and period, and allocate
identifiers with a single `findOneAndUpdate` using `$inc` and `upsert: true`,
which is atomic in MongoDB without a transaction. Replace all eight sites with a
shared `nextSequence(name, period)` helper. Existing documents keep their current
identifiers; seed each counter from the current maximum so the new sequence
continues rather than colliding.

**Implementation checklist**

- [ ] Create `backend/src/models/Counter.js` with a `_id` string key and a numeric `seq`.
- [ ] Create `backend/src/utils/sequence.js` exporting `nextSequence(name, period)` using `findOneAndUpdate` with `$inc` and `upsert`.
- [ ] Replace the generation in `salesController.js` and `serviceController.js` with the helper.
- [ ] Replace the `pre('save')` generators in `SalesOrder.js`, `ServiceOrder.js`, `StockTransfer.js`, `Transaction.js` and `Product.js` with the helper.
- [ ] Replace the regex-scan generator in `StockMovement.js` with the helper.
- [ ] Write a one-off migration seeding each counter from the current maximum existing identifier, and add it as an npm script.
- [ ] In `backend/tests/sales.test.js`, add a test issuing two concurrent order creations and asserting two distinct order numbers and two persisted orders.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] Two concurrent creates of the same entity type both succeed with distinct identifiers.
- [ ] Deleting the newest order and creating another does not reuse the deleted identifier.
- [ ] Existing documents retain their identifiers, and new ones continue the sequence without collision.
- [ ] The full backend suite passes, including a new concurrency test.

**Verification commands**

```bash
cd backend && npm run migrate:counters && npm test
```

**Do not**

Do not introduce MongoDB transactions here; the `$inc` upsert is atomic on its
own and works on a standalone server. Do not change the identifier formats.
Do not run the seeding migration against production without a backup, which is
GAP-028.

**Rollback**

Revert the code and leave the `Counter` collection in place; it is inert once
unreferenced. Identifiers issued under the new scheme remain valid, so no data
repair is needed.

**Open questions**

Should the sequence reset annually, matching the `SO-YYYY-` prefix, or continue
monotonically? Resetting matches the format's implication and is what a
bookkeeper would expect; continuing is simpler and avoids any chance of a
year-boundary collision. I recommend resetting per year, keyed by
`salesOrder:2026`, but it changes the numbers customers see on invoices, so a
human should confirm.

---

### GAP-041 [CODE] All money is IEEE-754 floating point with no rounding at any boundary

Severity S2 Major | Complexity M | Difficulty D3 Specialist | Risk R3 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-ASSISTED |
Depends on GAP-040 | Blocks none | Est. agent turns 6-12

**Location**
- `backend/src/models/SalesOrder.js:171-207` (primary)
- `backend/src/models/ServiceOrder.js:208-230`
- `backend/src/utils/salesCompletion.js` (the `Transaction.amount` write)
- `backend/src/controllers/salesController.js` (the `$sum: '$total'` aggregations)

**Evidence**

```js
// backend/src/models/SalesOrder.js, the totals hook
    item.total = (item.quantity * item.unitPrice) - (item.discount || 0);
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.tax.amount = this.subtotal * (this.tax.rate / 100);
  this.total = this.subtotal + this.tax.amount - (this.discount || 0);
```

No `toFixed`, no cents-integer representation, and no rounding helper exists
anywhere in `backend/src`.

**What is wrong**

Every monetary value is a double with no rounding at any boundary. The results
feed the `>=` comparison that decides `payment.status`, the `change`
calculation, the `Transaction.amount` written to the cash ledger, and the
revenue aggregations.

**Why it matters**

Three units at PHP 8.10 gives 24.299999999999997, not 24.30. At 12% VAT the total
is 27.215999999999998, so a cashier tendering PHP 27.22 is `paid` while one
tendering exactly 27.216 is `partial` and the order silently refuses to
auto-complete. A full line discount can produce a total of about negative
3.55e-15, which trips the schema's `min: 0` guard and rejects the sale with a
message that describes nothing the operator did.

**Intended behavior**

Monetary amounts are exact to the centavo. Comparisons that decide payment status
operate on exact values, and stored amounts round half-up to two decimal places.

**Proposed fix**

Add a `roundCurrency(value)` helper rounding half-up to two decimals, and apply
it to every computed monetary field at the point of assignment in both totals
hooks. This is the smaller change and keeps the existing schema types. The more
robust alternative, storing integer centavos throughout, removes the class of
error entirely but changes every stored amount, every API response and every
frontend formatter, and needs a migration. Prefer the helper now; record the
integer-centavo option as the eventual fix if discrepancies persist.

**Implementation checklist**

- [ ] Create `backend/src/utils/currency.js` exporting `roundCurrency`, rounding half-up to two decimals.
- [ ] Apply it to `item.total`, `subtotal`, `tax.amount`, `total` and `payment.change` in `backend/src/models/SalesOrder.js`.
- [ ] Apply it to the equivalent fields in `backend/src/models/ServiceOrder.js`.
- [ ] Apply it to the `amount` written in `backend/src/utils/salesCompletion.js` and both service-order transaction writes.
- [ ] In `backend/tests/sales.test.js`, add a test with three units at 8.10 and a 12% tax rate asserting a total of exactly 27.22.
- [ ] In `backend/tests/sales.test.js`, add a test asserting a full line discount produces a total of exactly 0 and does not trip the schema guard.
- [ ] Run `npm test -- sales.test.js service.test.js` from `backend/`.

**Acceptance criteria**

- [ ] Three units at 8.10 with 12% tax totals exactly 27.22.
- [ ] A full-value discount yields exactly 0, not a negative epsilon.
- [ ] Paying the displayed total always transitions payment status to `paid`.
- [ ] `Transaction.amount` equals the order total exactly.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js service.test.js
```

**Do not**

Do not convert the schema to integer centavos in this gap. Do not change the tax
ordering; GAP-029 owns that and it is gated on a human answer. Do not apply
rounding inside the aggregation pipelines, which would mask rather than fix the
stored values.

**Rollback**

Revert the helper and its call sites. Orders written under the new rounding keep
their exact values, which remain correct.

**Open questions**

Rounding half-up is the common retail convention, but banker's rounding is used in
some accounting contexts. I chose half-up because it matches what a cashier and a
printed receipt expect. If the owner's bookkeeper requires banker's rounding, that
is a one-line change in the helper, and it should be decided before the first
production run rather than after.

---

### GAP-042 [FEAT] The dashboard, the post-login landing page, is entirely non-functional

Severity S2 Major | Complexity M | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 6-12

**Location**
- `frontend/src/app/(protected)/dashboard/page.tsx:48` (the component that drops its `href`)
- `frontend/src/app/(protected)/dashboard/page.tsx:86-121` (four stat cards passing a literal em dash)
- `frontend/src/app/(protected)/dashboard/page.tsx:133`, `:145`, `:157`, `:171`, `:181`, `:191` (six dead buttons)
- `frontend/src/hooks/useAuth.ts:40` (the redirect that lands every user here)

**Evidence**

```tsx
// frontend/src/app/(protected)/dashboard/page.tsx:48
const QuickAction: React.FC<QuickActionProps> = ({ title, description, icon }) => (
  <button className="flex items-center p-4 bg-white rounded-lg shadow-md ...">
```

`QuickActionProps` declares `href`, the component destructures only three props,
and renders a bare `<button>` with no `onClick` and no `Link`. The four
`StatCard`s each pass the literal string for an em dash.

**What is wrong**

Every Quick Action is inert, and the `href` values it ignores point at
`/inventory`, `/service-jobs`, `/inventory/new` and `/reports`, none of which
exist; the real routes are `/stock`, `/services/my-jobs` and `/products/new`, and
there is no reports page at all. The stat cards have no query, no loading state
and no error state.

**Why it matters**

`useAuth.handleLogin` redirects every successful login to `/dashboard`. The first
screen every user sees on every session shows four placeholders where the numbers
should be and six buttons that do nothing when clicked. It reads as a broken
application before the user reaches any working page.

**Intended behavior**

The dashboard shows real figures scoped to the user's branch and role, with
loading and error states, and every Quick Action navigates to a route that exists
and that the user's role may open.

**Proposed fix**

Fix the navigation first, since it is mechanical and independently valuable:
destructure `href` and render a `Link`, and correct the four wrong paths. Then
wire the stat cards. There is no aggregate dashboard endpoint, so the numbers must
either be composed from existing endpoints (`GET /sales/stats` and
`GET /stock/low-stock`) or a new endpoint added. Composing from existing
endpoints avoids new backend surface and is the smaller change; prefer it unless
the request count proves a problem.

**Implementation checklist**

- [ ] In `frontend/src/app/(protected)/dashboard/page.tsx`, destructure `href` in `QuickAction` and render a `Link` wrapping the content.
- [ ] Correct the four wrong hrefs to `/stock`, `/services/my-jobs`, `/products/new`, and remove or replace the `/reports` action.
- [ ] Hide Quick Actions the current role may not use, matching the role gates the target pages apply.
- [ ] Replace the four placeholder stat values with data from `useSalesStats` and the low-stock hook.
- [ ] Add loading and error states to the stat card region.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.

**Acceptance criteria**

- [ ] Every Quick Action navigates to a route that exists.
- [ ] No Quick Action is shown to a role that would be refused by the target page.
- [ ] The four stat cards show real numbers, a spinner while loading, and a message on error.
- [ ] A mechanic and an admin see appropriately different dashboards.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not add a new backend aggregate endpoint without confirming the composed
approach is too slow. Do not build a reports page; that is out of scope and
`/reports` should simply be removed from the actions.

**Rollback**

Revert the page. It returns to being inert.

**Open questions**

Which four figures does the owner actually want on the dashboard, and should they
be branch-scoped for admins or show all branches? The placeholders give no
indication of intent, so I would otherwise be inventing a product spec, which is
why this is AGENT-ASSISTED.

---

### GAP-043 [FEAT] Stock lists are silently truncated to one unpaginated page

Severity S2 Major | Complexity M | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-READY |
Depends on GAP-026 | Blocks none | Est. agent turns 5-10

**Location**
- `frontend/src/app/(protected)/stock/page.tsx:119-127` (no page or limit passed), `:385` (a pagination placeholder comment)
- `frontend/src/lib/services/stockService.ts:43-53` (`getByBranch` sends no params)
- `frontend/src/app/(protected)/stock/transfers/page.tsx:36`, `:205`

**Evidence**

```tsx
// frontend/src/app/(protected)/stock/page.tsx:119-122 and the footer
  const allStockQuery = useStock({}, { enabled: !effectiveBranch });
  const branchStockQuery = useStockByBranch(effectiveBranch || undefined, ...);
  ...
          Showing {filteredStock.length} of {stockData.length} stock records
```

`GET /stock` defaults to a 20-row page and `GET /stock/branch/:branchId` defaults
to 50. No caller passes `page` or `limit`, and the page has no pagination control.

**What is wrong**

The stock page requests the first page and reports its own row count as the
total, so a shop with 300 SKUs sees 20 of them and is told "Showing 20 of 20
stock records". The New Sale product picker is capped at the first 50 products in
the branch, and the transfer modal at the first 20.

**Why it matters**

The New Sale picker is the application's most-used screen and the one the offline
mirror is built around. A branch stocking more than 50 products cannot sell the
rest through the picker at all, and nothing in the interface indicates that
anything is missing. The stock page's footer actively asserts a false total.

**Intended behavior**

Stock lists paginate with visible controls and an accurate total, and the New Sale
picker searches server-side rather than filtering a truncated first page.

**Proposed fix**

Thread `page` and `limit` through `stockService` and the hooks, render pagination
controls on the stock page using the `total` and `pages` from the API envelope,
and correct the footer to report the server-side total. For the New Sale picker,
use the existing `GET /products/search` endpoint with a debounced query rather
than paginating a full list, which suits a type-ahead better. GAP-026 must land
first so `getLowStock` and the branch read return a paginated envelope.

**Implementation checklist**

- [ ] In `frontend/src/lib/services/stockService.ts`, accept and forward `page` and `limit` in `getAll` and `getByBranch`.
- [ ] In `frontend/src/hooks/useStock.ts`, thread the parameters through and include them in the query keys.
- [ ] In `frontend/src/app/(protected)/stock/page.tsx`, add pagination controls and replace the placeholder comment at line 385.
- [ ] Correct the footer text to report the server-side `total`, not the loaded row count.
- [ ] In the New Sale picker, switch the product source to the debounced search endpoint.
- [ ] In `frontend/src/app/(protected)/stock/transfers/page.tsx`, paginate the transfer picker.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.

**Acceptance criteria**

- [ ] The stock page shows pagination controls and an accurate total for a fixture of more than 100 rows.
- [ ] The New Sale picker can reach a product that is not among the first 50 in the branch.
- [ ] The footer count matches the server-side total.
- [ ] Offline behaviour is unchanged: the mirror still serves the cached page.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not raise the server-side `MAX_LIMIT` to avoid paginating. Do not remove the
offline fallback in the stock hooks. Do not change the query-key factory shape
beyond adding the pagination parameters.

**Rollback**

Revert the frontend files. Lists return to silent truncation.

**Open questions**

None.

---

### GAP-044 [TEST] No concurrency test exists and the StockMovement ledger is never asserted

Severity S2 Major | Complexity M | Difficulty D3 Specialist | Risk R1 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 6-12

**Location**
- `backend/tests/` (no `Promise.all`, `Promise.allSettled` or `Promise.race` in any suite)
- `backend/tests/stock.test.js` (the only two `StockMovement` references are fixture writes)
- `frontend/` (no test runner, no test files, no `test` script)
- `backend/jest.config.cjs` (no `coverageThreshold`; `coverage` appears in no workflow)

**Evidence**

Grepping the tests directory for `Promise.all` returns nothing: every request in
all 18 suites is awaited sequentially. Grepping for `StockMovement` returns an
import and two `StockMovement.create` fixture writes, so no test performs a
stock-mutating action and then queries the ledger to confirm a row was written.

**What is wrong**

Three verification holes. Nothing fires two requests at the same `Stock`
document, so the lost-update shape behind GAP-046 is entirely unprobed. The
append-only ledger that CLAUDE.md calls load-bearing has ten write sites in
production code and zero assertions. And the frontend, which holds the offline
outbox whose classification comments describe a data-loss bug if wrong, has no
test framework at all.

**Why it matters**

Any of the ten `createMovementWithOldQuantity` calls can be dropped, or moved
before `stock.save()` so the before-and-after pair is wrong, and the entire suite
stays green; the audit trail then develops holes that only a manual stock count
would surface. On the frontend, the `clientRequestId` reuse rule, the
4xx-versus-5xx classification, and the logout cache clear are all unverified, and
each is a documented, already-once-shipped class of bug.

**Intended behavior**

Concurrency behaviour on stock is exercised, every stock-mutating endpoint asserts
its ledger row, and the frontend has a runner with tests for the offline layer.

**Proposed fix**

Add ledger assertions to the existing stock, sales and service suites, which is
mechanical. Add concurrency tests using `Promise.all` against a single stock
document, asserting the invariant that the sum of movements equals the quantity
delta; these will fail until GAP-046 lands, so write them as the specification and
mark them pending with a comment naming GAP-046 rather than leaving them red.
Stand up Vitest in the frontend and cover the outbox classification table first.

**Implementation checklist**

- [ ] In `backend/tests/stock.test.js`, after each restock, adjust and transfer, assert a `StockMovement` row exists with the correct `type`, `quantityBefore`, `quantityAfter` and `reference`.
- [ ] In `backend/tests/sales.test.js` and `service.test.js`, assert the movement rows written on completion.
- [ ] Add `backend/tests/concurrency.test.js` firing two concurrent order creations against one stock row and asserting no oversell, marked pending against GAP-046.
- [ ] Add Vitest and a `test` script to `frontend/package.json`.
- [ ] Add `frontend/src/lib/offline/sync.test.ts` covering the network, 4xx and 5xx classification branches and the attempts cap.
- [ ] Add a test asserting `clientRequestId` is unchanged across a retry.
- [ ] Add a `frontend-test` job to `.github/workflows/ci.yml`.
- [ ] Run `npm test` in both packages.

**Acceptance criteria**

- [ ] Every stock-mutating endpoint has a test asserting its ledger row.
- [ ] A concurrency test exists and documents the expected invariant.
- [ ] `frontend/npm test` runs and covers the three outbox classification branches.
- [ ] CI runs the frontend suite on every PR.

**Verification commands**

```bash
cd backend && npm test
cd frontend && npm test
```

**Do not**

Do not add a `coverageThreshold` in this gap; a threshold set before the frontend
suite exists would either be meaningless or block every PR. Do not change
production code here: the concurrency test is a specification for GAP-046, not a
licence to fix it in a test commit.

**Rollback**

Remove the added test files and the CI job.

**Open questions**

None.

---

### GAP-045 [TEST] branch.test.js tests Mongoose directly; four branch endpoints are unverified

Severity S2 Major | Complexity M | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 1.25 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 5-10

**Location**
- `backend/tests/branch.test.js:54-411` (primary)
- `backend/tests/branch.test.js:56-70` (a test whose only assertion is a tautology)
- Uncovered endpoints: `POST /api/auth/register-customer`, `GET /api/branches/:id`, `POST /api/branches`, `PUT /api/branches/:id`, `POST /api/products/:id/images`, `PUT /api/stock/:id/adjust`, `GET /api/stock/movements`, `GET /api/stock/movements/branch/:branchId`

**Evidence**

`branch.test.js` contains 41 `it()` blocks and only 11 `request(app)` calls. The
describe blocks named for HTTP routes call `Branch.create` and
`Branch.findByIdAndUpdate` directly and assert on Mongoose's return value.

```js
// backend/tests/branch.test.js:67-69
      // This test will fail without proper auth setup in test app
      // We'll test the controller logic separately
      expect(true).toBe(true);
```

**What is wrong**

Most of the branch suite is a Mongoose model test wearing an HTTP test's name.
The controller, the `protect` and `authorize` chain, the express-validator chain
and the `ApiResponse` envelope are never entered for create, read-one, update or
delete. Two tests assert tautologies. Separately, eight endpoints across the API
receive no request from any suite, including `register-customer`, which is a
public unauthenticated write path into the user collection.

**Why it matters**

`createBranch` could 500, drop its manager-role check, or return the wrong
envelope, and 41 tests stay green. The role guards on all four branch endpoints
are entirely unverified. `register-customer` is the sibling of `/register`, which
has two dedicated privilege-escalation tests; if `registerCustomer` ever spreads
`req.body` or omits its role pin, an anonymous request could mint a privileged
account and nothing would catch it.

**Intended behavior**

Every suite exercises its endpoints over HTTP through the real middleware chain,
and every route has at least one test issuing a real request.

**Proposed fix**

Rewrite `branch.test.js` to the mount-the-router pattern the other suites use,
minting tokens through `testHelpers` and issuing `request(app)` calls for all
five branch routes including their role guards. Delete the two tautological
tests. Add HTTP tests for the seven other uncovered endpoints in their existing
suites.

**Implementation checklist**

- [ ] Rewrite the create, read-one, update and delete describe blocks in `backend/tests/branch.test.js` to issue `request(app)` calls.
- [ ] Delete the two tests whose only assertion is a tautology and replace them with real role-guard assertions.
- [ ] Add a role-guard test per branch endpoint asserting 403 for a non-admin.
- [ ] Add `register-customer` tests to `backend/tests/auth.test.js`, including one asserting an attacker-supplied `role` and `branch` are ignored.
- [ ] Add HTTP tests for `PUT /api/stock/:id/adjust`, `GET /api/stock/movements` and `GET /api/stock/movements/branch/:branchId`.
- [ ] Add a multipart upload test for `POST /api/products/:id/images` using supertest `.attach()`.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] `grep -c "request(app)" backend/tests/branch.test.js` is at least equal to the number of `it()` blocks that name an HTTP route.
- [ ] No test in the suite asserts a tautology.
- [ ] Every route in `backend/src/routes/branchRoutes.js` receives at least one request.
- [ ] `register-customer` has a privilege-escalation test mirroring the one on `/register`.
- [ ] The full backend suite passes.

**Verification commands**

```bash
cd backend && npm test -- branch.test.js auth.test.js stock.test.js product.test.js
```

**Do not**

Do not mount `src/server.js` in any suite; the mount-the-router pattern is
deliberate. Remember these suites mount no `errorHandler`, so a rule that must
produce a 4xx has to live in the route's validator chain, not only in the schema.
Do not change production code to make a test pass.

**Rollback**

Revert the test files. Coverage returns to its current state.

**Open questions**

None.

---

### GAP-046 [CODE] No atomicity on stock quantity writes: lost updates and oversell

Severity S1 Critical | Complexity L | Difficulty D3 Specialist | Risk R3 |
Confidence C1 Verified | Priority score 1.14 | Agent suitability HUMAN-FIRST |
Depends on GAP-014, GAP-040 | Blocks none | Est. agent turns 10-20

**Location**
- `backend/src/models/Stock.js:103-125` (`reserveStock`, `deductStock`, `releaseReservedStock`)
- `backend/src/controllers/salesController.js:225-245` (check then reserve, two round trips)
- `backend/src/utils/salesCompletion.js:30-45` (deduct loop)
- `backend/src/controllers/stockController.js` (transfer and adjustment paths)
- `backend/src/controllers/serviceController.js` (parts deduction)

**Evidence**

A repository-wide grep for `startSession`, `withTransaction` and `.session(`
across `backend/src` returns zero matches, and a grep for `$inc`,
`findOneAndUpdate`, `updateOne` and `bulkWrite` on `Stock` returns none. Every
quantity change is `findOne`, mutate the in-memory document, `save()`.

```js
// backend/src/models/Stock.js, deductStock
  if (quantity > this.quantity) {
    throw new Error('Cannot deduct more than available quantity');
  }
  this.quantity -= quantity;
```

**What is wrong**

Mongoose's `save()` on a loaded document writes the whole computed value, not a
delta, so two requests that both read `quantity: 10` and each subtract 3 both
write 7. There is no optimistic-concurrency check on these paths and no atomic
operator, so nothing detects the lost update. The availability check and the
reservation are separate round trips against a stale in-memory snapshot, so two
concurrent orders can both pass a check for the last five units.

**Why it matters**

Two cashiers complete two three-unit sales of the same part in the same window.
Both read 10, both write 7. Six units left the shelf and the system says four
were sold. The `StockMovement` ledger records two rows both claiming
`quantityBefore: 10, quantityAfter: 7`, so the audit trail cannot even detect the
discrepancy. The offline replay path makes this the normal case rather than the
rare one, because `sync.ts` replays queued orders against stock that moved while
the device was offline.

**Intended behavior**

A quantity change is atomic and conditional: a deduction succeeds only if
sufficient stock is still present at the moment of the write, and concurrent
writers either both succeed with a correct final total or one is cleanly refused.

**Proposed fix**

Replace read-modify-write with conditional atomic updates.
`findOneAndUpdate({ _id, quantity: { $gte: qty } }, { $inc: { quantity: -qty } })`
returns null when the condition no longer holds, which is the refusal signal, and
is atomic on a standalone MongoDB with no replica set required. Apply the same
shape to reservation and release. This handles single-document atomicity, which
covers the oversell and lost-update cases. Multi-document atomicity across an
order's several stock rows still needs either transactions, which require a
replica set, or the compensating-release approach from GAP-014. Land GAP-014 and
GAP-040 first: they remove the leak and the identifier race, so this change can
focus purely on the quantity arithmetic.

**Implementation checklist**

- [ ] Rewrite `reserveStock` in `backend/src/models/Stock.js` as a static using a conditional `findOneAndUpdate` with `$inc`, returning null when the condition fails.
- [ ] Rewrite `deductStock` and `releaseReservedStock` the same way.
- [ ] Update `salesController.js` to treat a null result as insufficient stock and return 400 naming the product.
- [ ] Update `salesCompletion.js`, `serviceController.js` and the transfer and adjustment paths in `stockController.js` to the new signatures.
- [ ] Ensure `createMovementWithOldQuantity` still receives the true before-and-after values, taking them from the returned document rather than a stale copy.
- [ ] Enable the concurrency tests written under GAP-044 and confirm they pass.
- [ ] Run `npm test` from `backend/`.

**Acceptance criteria**

- [ ] Two concurrent three-unit deductions from a quantity of 10 leave exactly 4, or one is refused with 400 and the other leaves 7.
- [ ] Two concurrent orders for the last five units result in exactly one success.
- [ ] Every `StockMovement` row's `quantityBefore` and `quantityAfter` reflect the actual persisted transition.
- [ ] The concurrency suite from GAP-044 passes.

**Verification commands**

```bash
cd backend && npm test -- concurrency.test.js stock.test.js sales.test.js
```

**Do not**

Do not introduce MongoDB transactions without first confirming the deployment runs
a replica set; the compose files run a standalone `mongo` service, where
`startSession` transactions are unavailable. Do not remove the
`StockMovement` writes or reorder them relative to the save. Do not change
identifier generation here; GAP-040 owns it.

**Rollback**

Revert the model and its callers. Data written under the atomic path is correct
and needs no repair, but any oversell that occurred before the fix remains in the
data and is not detectable from the ledger.

**Open questions**

`RESOLUTION: HUMAN REQUIRED` on one infrastructure question before work starts.
Is the production MongoDB a standalone server or a replica set? The compose files
define a standalone, which means multi-document transactions are unavailable and
the fix must be the conditional-update plus compensating-release approach above.
If the owner is willing to run a single-node replica set, which MongoDB supports
and which enables transactions, the correct fix is materially simpler and covers
the multi-row case properly. That is an infrastructure decision with an
operational cost, and it changes the shape of this work substantially, so it must
be answered before an agent starts rather than discovered midway.

---

### GAP-047 [CODE] Frontend types drift from the API contract at four points

Severity S3 Moderate | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 1.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 4-8

**Location**
- `frontend/src/types/stock.ts:112-116`, `:130-134` (`StockTransfer` invents four field names)
- `frontend/src/types/api.ts:13-20` (`PaginationInfo` declares two booleans the API never sends)
- `frontend/src/types/stock.ts:25` (`lastRestocked` versus the model's `lastRestockedAt`)
- `frontend/src/components/stock/TransferList.tsx:159-160`, `:206-207` (the consumer that renders nothing)

**Evidence**

```ts
// frontend/src/types/stock.ts: none of these exist on the model
  requestedBy: TransferUser | string;
  shippedBy?: TransferUser | string;
  completedBy?: TransferUser | string;
export interface TransferUser { _id: string; firstName: string; lastName: string; }
```

`backend/src/models/StockTransfer.js` has `initiatedBy`, `approvedBy`,
`receivedBy` and `receivedAt`, populated with `'name'`; the `User` model has a
single `name` field and no `firstName` or `lastName`. `ApiResponse.paginate`
emits exactly `page`, `limit`, `total` and `pages`.

**What is wrong**

Four independent name mismatches between the declared types and what the API
returns. Because the fields are optional or the objects are widened unions,
TypeScript reports no error and every read yields `undefined` at runtime.

**Why it matters**

The transfers list permanently omits the "by whom" attribution: the type guard
always returns false and the block never renders. `PaginationInfo`'s two booleans
are typed as `boolean` and are always `undefined`, so
`if (pagination.hasNextPage)` compiles cleanly and is always falsy: precisely how
a paging bug ships. The `lastRestocked` mismatch is latent today because nothing
renders it, and would surface as a blank column the moment someone adds one.

**Intended behavior**

Every declared type matches the runtime shape the API returns, so a type error
appears when the contract drifts.

**Proposed fix**

Rename the four `StockTransfer` fields to `initiatedBy`, `approvedBy`,
`receivedBy` and `receivedAt`, and change `TransferUser` to a single `name`
field. Remove `hasNextPage` and `hasPrevPage` from `PaginationInfo`, or derive
them in a helper from `page` and `pages` rather than declaring them as API
fields. Rename `lastRestocked` to `lastRestockedAt`. Update `TransferList.tsx`
accordingly.

**Implementation checklist**

- [ ] In `frontend/src/types/stock.ts`, rename the four transfer fields and change `TransferUser` to a single `name`.
- [ ] In `frontend/src/components/stock/TransferList.tsx`, update the type guard and the two render sites to use `name`.
- [ ] In `frontend/src/types/api.ts`, remove `hasNextPage` and `hasPrevPage` and add a derived helper if any consumer needs them.
- [ ] In `frontend/src/lib/services/userService.ts`, remove the fallback branch that synthesises the two booleans.
- [ ] In `frontend/src/types/stock.ts`, rename `lastRestocked` to `lastRestockedAt`.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.

**Acceptance criteria**

- [ ] The transfers list renders the initiating and receiving user's name.
- [ ] No declared field in `frontend/src/types/stock.ts` or `api.ts` is absent from the corresponding API response.
- [ ] `npm run build` succeeds with no type error.

**Verification commands**

```bash
cd frontend && npm run lint && npm run build
```

**Do not**

Do not change the backend model field names to match the frontend. Do not add
`firstName` and `lastName` to the `User` model. Do not add `hasNextPage` to
`ApiResponse.paginate`.

**Rollback**

Revert the type and component changes.

**Open questions**

None.

---

### GAP-048 [OPS] Cache invalidation uses Redis KEYS on every mutation hot path

Severity S3 Moderate | Complexity S | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 1.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 3-6

**Location**
- `backend/src/utils/cache.js:101-115` (primary)
- Call sites throughout `salesController.js`, `serviceController.js`, `stockController.js` and `productController.js`

**Evidence**

```js
// backend/src/utils/cache.js, delPattern
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
```

**What is wrong**

`KEYS` is O(N) over the entire keyspace and blocks Redis single-threadedly for
its duration. `delPattern` is called on the hot path of every mutation: a single
completed sale issues two, and a service completion two more.

**Why it matters**

As the keyspace grows, because product and stock reads are cached per document
id, each sale adds a stall proportional to the total key count, felt by every
concurrent request. Redis is optional here, so this degrades rather than
outright fails, but the degradation is invisible until it is severe.

**Intended behavior**

Pattern deletion iterates with a cursor and never blocks the server, or
invalidation is driven by a per-domain tag set rather than a keyspace scan.

**Proposed fix**

Replace `KEYS` with `SCAN` using a cursor loop and batched `UNLINK`, which is the
smaller change and needs no key-naming change. Maintain the existing
`cache:<domain>:*` conventions so every current call site is unaffected. A tag-set
design is faster still but restructures how keys are written and read; prefer
`SCAN` now.

**Implementation checklist**

- [ ] In `backend/src/utils/cache.js`, rewrite `delPattern` to iterate with `SCAN` and a cursor, batching deletions.
- [ ] Use `UNLINK` rather than `DEL` where available so deletion is non-blocking, falling back to `DEL`.
- [ ] Keep the existing null-safety contract: return false when no client is present.
- [ ] Keep the `forLog` sanitisation of the pattern in the error path exactly as it is.
- [ ] Add a `backend/tests/cache.test.js` covering the cursor loop against a mocked client, following the pattern in `redis.test.js`.
- [ ] Run `npm test -- cache.test.js redis.test.js` from `backend/`.

**Acceptance criteria**

- [ ] `grep -n "client.keys" backend/src/utils/cache.js` returns no matches.
- [ ] `delPattern` still returns false when no client is configured.
- [ ] Deleting a pattern matching many keys removes all of them.
- [ ] The existing cache-key conventions are unchanged.

**Verification commands**

```bash
cd backend && npm test -- cache.test.js redis.test.js
grep -n "client.keys" src/utils/cache.js    # expect no output
```

**Do not**

Do not change the `forLog` helper. CLAUDE.md records two properties as
load-bearing for a CodeQL log-injection barrier: the key must be passed as a `%s`
argument against a literal format string, never interpolated, and CR and LF must
be removed one constant pattern at a time replaced with an empty string. A
combined character class is equally safe at runtime but is not the shape CodeQL
recognises, and the alerts reopen. Do not change the key-naming scheme.

**Rollback**

Revert `cache.js`.

**Open questions**

None.

---

### GAP-049 [CONTRA] Transaction numbers never take the documented TXN-YYYYMM shape

Severity S3 Moderate | Complexity S | Difficulty D2 Standard | Risk R3 |
Confidence C1 Verified | Priority score 1.0 | Agent suitability AGENT-ASSISTED |
Depends on GAP-040 | Blocks none | Est. agent turns 4-8

**Location**
- `backend/src/utils/salesCompletion.js:79-83` (primary)
- `backend/src/controllers/serviceController.js:406-408`, `:571-573`
- `backend/src/models/Transaction.js:63-71` (the dead generator)
- `CLAUDE.md`, *Identifiers* section

**Evidence**

```js
// backend/src/utils/salesCompletion.js:79-83
  const txnCount = await Transaction.countDocuments();
  const timestamp = Date.now().toString().slice(-6);
  await Transaction.create({
    transactionNumber: `TXN-${String(txnCount + 1).padStart(6, '0')}-${timestamp}`,
```

**What is wrong**

`Transaction.pre('save')` builds `TXN-YYYYMM-NNNNNN` but only when
`transactionNumber` is absent. All three call sites supply one, so the hook never
runs. The emitted format is sequence-first then the last six digits of
`Date.now()`, carrying no month at all. CLAUDE.md and the model both document the
other format.

**Why it matters**

A bookkeeper reconciling by transaction number cannot tell which month a row
belongs to without joining on `createdAt`. Anyone who reads CLAUDE.md or the model
and writes a report parsing `TXN-YYYYMM-` gets zero matches against real data. The
two generators are also collision-prone in different ways, so they cannot be
reconciled without deciding which one wins.

**Intended behavior**

One transaction-number format, generated in one place, matching what the
documentation states.

**Proposed fix**

Once GAP-040 lands, generate transaction numbers through the shared
`nextSequence` helper keyed by year and month, restoring the documented
`TXN-YYYYMM-NNNNNN` shape, and delete the three inline generators and the dead
model hook. Existing rows keep their current numbers. Do not start before the
open question is answered: the choice of what to do with existing rows determines
whether this is a code change or a migration.

**Implementation checklist**

- [ ] Confirm GAP-040's `nextSequence` helper exists and is keyed by an arbitrary period string.
- [ ] Replace the generator in `backend/src/utils/salesCompletion.js` with a call keyed by year and month.
- [ ] Replace both generators in `backend/src/controllers/serviceController.js` the same way.
- [ ] Delete the now-unreachable `pre('save')` generator in `backend/src/models/Transaction.js`, or keep it as the single implementation and remove the explicit field from the three call sites instead.
- [ ] Seed the counter from the highest existing sequence so new numbers cannot collide with old ones.
- [ ] Add a test asserting a created transaction's number matches the documented pattern.
- [ ] Run `npm test -- sales.test.js service.test.js` from `backend/`.

**Acceptance criteria**

- [ ] A newly created transaction's `transactionNumber` matches `TXN-YYYYMM-NNNNNN`.
- [ ] Two concurrent transaction creations produce distinct numbers.
- [ ] Existing rows are unmodified.
- [ ] CLAUDE.md's *Identifiers* section matches the implementation.

**Verification commands**

```bash
cd backend && npm test -- sales.test.js service.test.js
```

**Do not**

Do not rewrite existing `transactionNumber` values without an explicit decision
and a backup. Do not leave two generators in place.

**Rollback**

Revert the generators. Rows created under the new format keep it, so the data set
holds two formats either way; that is the substance of the open question below.

**Open questions**

`RESOLUTION: HUMAN REQUIRED`. See CONTRA-2 in section 9 for the full brief. The
decision the owner must make: live data already carries the undocumented
`TXN-NNNNNN-tttttt` format. Adopting the documented format going forward leaves
two populations of transaction numbers in one collection, which a bookkeeper will
encounter. Rewriting the old ones makes the collection uniform but changes
identifiers that may already appear on printed records. Neither option is
reversible once printed records exist, which is why an agent must not choose.

---

### GAP-050 [FEAT] There is no refund, void, or reversal path anywhere in the system

Severity S2 Major | Complexity L | Difficulty D4 Judgment | Risk R3 |
Confidence C1 Verified | Priority score 0.71 | Agent suitability HUMAN-FIRST |
Depends on GAP-016 | Blocks none | Est. agent turns 10-20

**Location**
- `backend/src/models/SalesOrder.js:197-207` (payment status is recomputed on every save)
- `backend/src/config/constants.js` (`PAYMENT_STATUS.REFUNDED`, `TRANSACTION_TYPES.REFUND`)
- `backend/src/models/Transaction.js:13` (the enum declaring refund)
- `backend/src/controllers/salesController.js` (`validTransitions.completed` is empty; delete refuses completed orders)

**Evidence**

Grepping `refund` across `backend/src` returns four enum declarations and zero
code. `payment.status` is recomputed unconditionally from `amountPaid` on every
save, so writing `'refunded'` is overwritten by the next save of that document.
`validTransitions.completed` is empty and `deleteSalesOrder` refuses completed
orders.

**What is wrong**

Once a sale is completed and paid, no API can restore the stock, write the
offsetting `StockMovement`, or reverse the `Transaction`. The `refunded` and
`refund` enum values exist in three files, which reads to a maintainer as though
the feature is present.

**Why it matters**

A customer returns a PHP 1,800 part an hour after purchase, which is an ordinary
event in a parts shop. Staff must either fabricate an additive stock adjustment
with a free-text reason, which breaks the reference chain back to the sale and
corrupts the audit trail, or leave the books wrong. Both happen in practice, and
the second is worse because it is invisible.

**Intended behavior**

A completed sale can be reversed in whole or in part by an authorised role. The
reversal restores stock with a movement referencing the original order, writes an
offsetting `Transaction`, and leaves both the original and the reversal visible
in the record. Nothing is deleted.

**Proposed fix**

Add a reversal endpoint rather than making completed orders mutable: a `refund`
or `void` action creating a linked reversal record. Stop recomputing
`payment.status` unconditionally so a terminal refunded state can persist. Reuse
the existing `MOVEMENT_TYPES` and `TRANSACTION_TYPES.REFUND` values. The scope of
this work is genuinely a product design question, not a code question, which is
why no checklist is offered below beyond the decision brief.

**Implementation checklist**

- [ ] Do not begin implementation until the decision brief below is answered; the answers determine the data model.
- [ ] Once answered, write the design into `backend/docs/` before any code, covering the reversal record shape, the movement type, and the transaction type.
- [ ] Then split this gap into sub-gaps for the model, the endpoint, the ledger and transaction side effects, the role guard, and the frontend.

**Acceptance criteria**

- [ ] A completed, paid sale can be reversed by an authorised role.
- [ ] The reversal restores stock and writes a `StockMovement` referencing the original order.
- [ ] The reversal writes an offsetting `Transaction` of type refund.
- [ ] The original order remains readable and is visibly linked to its reversal.
- [ ] Sales statistics net the reversal against the original for the reporting period.

**Verification commands**

```bash
cd backend && npm test
```

**Do not**

Do not make completed orders editable. Do not delete or mutate the original order
or its `Transaction`. Do not implement this by having staff post a compensating
stock adjustment; that is the current workaround and it is what breaks the audit
trail.

**Rollback**

Not applicable until a design exists.

**Open questions**

`RESOLUTION: HUMAN REQUIRED`. The decision brief:

1. **Partial or whole only?** Can a customer return two of five units, or only the
   entire order? Partial returns need per-line reversal quantities and materially
   change the data model.
2. **Who may reverse, and within what window?** Admin only, or salesperson within
   the same day? This determines the role guard and whether a supervisor override
   is needed.
3. **What happens to the returned stock?** Does it go back to sellable quantity, or
   to a quarantine state pending inspection? A returned brake pad may not be
   resaleable, and the answer decides whether a second stock state is required.
4. **Cash refund, store credit, or both?** Store credit implies a customer balance
   concept that does not exist anywhere in the system today and would be a
   significantly larger piece of work.
5. **How should reversals appear in reporting?** Netted against the original
   period, or recorded in the period the reversal occurred? Bookkeepers differ,
   and the answer changes `getSalesStatistics`.

None of these can be inferred from the code. Answering them is a shop-operations
decision, and a checklist that silently picked answers would encode a guess into
the financial records.

---

### GAP-051 [OPS] No observability: no metrics, structured logs, tracing, or alerting

Severity S2 Major | Complexity L | Difficulty D2 Standard | Risk R1 |
Confidence C1 Verified | Priority score 0.71 | Agent suitability AGENT-ASSISTED |
Depends on GAP-023 | Blocks none | Est. agent turns 8-16

**Location**
- `backend/src/server.js:44-65` (the request logger)
- `backend/src/middleware/errorHandler.js:7` (unconditional full-object logging)
- Repository-wide: no metrics endpoint, no scrape config, no alert rule, no monitoring service in any compose file

**Evidence**

A repository-wide grep for `sentry`, `opentelemetry`, `otel`, `prom-client`,
`prometheus`, `winston`, `pino`, `bunyan`, `morgan`, `datadog` and `newrelic`
returns no source hits, only unchecked roadmap boxes in the phase documents.
Logging is 52 `console.*` calls across 13 backend files, with no levels, no
request id, no user id, and no JSON.

**What is wrong**

`server.js:49` and `:59-61` log two lines per request with raw `req.url`,
including query strings, and emit ANSI colour escapes unconditionally with no TTY
check, so escape sequences are written verbatim into container stdout.
`errorHandler.js:7` logs the complete error object for every error before
classification, so routine expired-token 401s emit full objects at error level.
There is no `/metrics` route and nothing scrapes or alerts.

**Why it matters**

A production incident is diagnosable only by reading `docker compose logs`
manually, after someone notices. Because every 401 logs at error level, an
error-rate signal would be dominated by non-events even if one existed. Combined
with GAP-003, a full storage outage produces zero 5xx and therefore no signal at
all. Separately, `errorHandler.js:7` is an unbounded sink: a Mongoose
`ValidationError` carries the offending field's raw value, so customer names,
phone numbers and addresses land in logs in plaintext. `seedAdmin.js` already
avoids exactly this sink with an explanatory comment, so the risk is understood
in this codebase and simply not applied where every error passes through.

**Intended behavior**

Logs are structured, levelled, and carry a request id; errors are logged once at a
level matching their status; a metrics endpoint exposes request rate, latency and
error rate; and something alerts a human when the error rate or the health check
degrades.

**Proposed fix**

Introduce `pino` with `pino-http` for structured, levelled request logging with a
generated request id, replacing the hand-rolled logger and its ANSI escapes.
Change `errorHandler` to log at `warn` for 4xx and `error` for 5xx, and to log
`err.message` and `err.name` rather than the whole object. Add `prom-client` and a
`/metrics` endpoint. Alerting requires a destination that does not exist in the
repository.

**Implementation checklist**

- [ ] Add `pino` and `pino-http` to `backend/package.json` and configure a logger with a request-id generator.
- [ ] Replace the request logger in `backend/src/server.js` with `pino-http`, removing the ANSI escapes.
- [ ] In `backend/src/middleware/errorHandler.js`, log at a level derived from the resolved status code and log only `err.name`, `err.message` and the request id.
- [ ] Replace the remaining `console.*` calls in `backend/src` with the logger.
- [ ] Add `prom-client` and expose `/metrics` with default process metrics plus request duration and count.
- [ ] Add a scrape target and an alert rule, using an operator-supplied monitoring destination.
- [ ] Document the log format, the metrics endpoint and the alert destinations in `docs/DEPLOYMENT.md`.

**Acceptance criteria**

- [ ] Every log line is JSON with a level, a timestamp and a request id.
- [ ] A 401 logs at warn, not error, and carries no full error object.
- [ ] No log line contains a raw request field value from a validation failure.
- [ ] `/metrics` returns Prometheus-format output including request count and duration.

**Verification commands**

```bash
cd backend && npm start 2>&1 | head -5 | python -c "import sys,json; [json.loads(l) for l in sys.stdin]"
curl -s http://localhost:5000/metrics | head -20
```

**Do not**

Do not log request bodies. Do not expose `/metrics` publicly without restricting
it to the monitoring network. Do not remove the existing `console.error` in
`seedAdmin.js` without preserving its message-only behaviour.

**Rollback**

Revert the logger and metrics changes. No data effect.

**Open questions**

Where should metrics be scraped from and where should alerts go? There is no
monitoring stack in the repository and adding one to the same VPS competes for the
resources GAP-027 is trying to bound. That is an infrastructure decision for the
owner, which is why this is AGENT-ASSISTED: the logging half can proceed
immediately, and the metrics and alerting half needs a destination.

---

### GAP-052 [CONTRA] Documentation contradicts the code at eight independent points

Severity S3 Moderate | Complexity M | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 0.5 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 5-10

**Location**
- `README.md:4`, `:72`, `:202`, `:213`, `:216`, `:384`, `:538`, `:566-628`, `:766`
- `frontend/docs/Frontend-Guidelines.md:247-298`, `:392-393`, `:403`
- `CLAUDE.md`, *Environment* section
- `backend/src/server.js:122-140` (the root index that advertises unprefixed paths and omits services)
- `frontend/src/lib/apiClient.ts:15`, `:196` (the two fallbacks missing `/api`)

**Evidence**

The eight contradictions are tabulated in full, with both positions quoted, in
CONTRA-3 in section 9. In every case the code is authoritative.

**What is wrong**

README documents eight endpoints that do not exist and omits roughly twenty that
do; it states three mutually exclusive backend test counts; it requires Node 18
where everything pins 22; and it names Next 15 and Tailwind 3 where the code uses
16 and 4. `Frontend-Guidelines.md` prescribes a `features/` architecture that does
not exist, asserts a Jest and React Testing Library stack that is not installed,
and documents `NEXT_PUBLIC_API_URL` without the mandatory `/api` suffix.
CLAUDE.md's explicitly verified environment-variable list omits `REPORT_TIMEZONE`
and still describes `REDIS_HOST` and `REDIS_PORT` as read.

**Why it matters**

A contributor following the frontend guidelines creates `src/features/...` and
produces a second, parallel architecture. One following README's Node 18
prerequisite cannot build the frontend, and the failure names no version. One
writing a client from README's endpoint list issues `POST /api/stock/add` and gets
a 404, and never discovers the restore endpoints, so soft-deleted records become
unrecoverable through that client. The documentation is not merely stale; it
actively directs work in the wrong direction.

**Intended behavior**

Every documented endpoint, version, path and variable matches the code, and the
API's own root index advertises the paths it actually serves.

**Proposed fix**

Correct the documentation to match the code at all eight points, and make the two
code-side corrections that are unambiguous: add `/api` to the two `apiClient.ts`
fallbacks, and correct `server.js`'s root index to advertise prefixed paths and
include `services`. Regenerate the README endpoint list from the route files
rather than editing it by hand, so it can be regenerated again later.

**Implementation checklist**

- [ ] Regenerate the README API section from `backend/src/routes/*.js`, removing the eight phantom endpoints and adding the roughly twenty missing ones.
- [ ] Correct the Node version to 22 at `README.md:202` and `:384`, and the Next and Tailwind versions at `:213`, `:216` and `:766`.
- [ ] Replace the three conflicting test counts in `README.md:4`, `:72` and `:538` with a single statement, and correct the count in CLAUDE.md.
- [ ] Rewrite the directory-structure block in `frontend/docs/Frontend-Guidelines.md:247-298` to describe the actual layout.
- [ ] Correct `frontend/docs/Frontend-Guidelines.md:392-393` to state that no frontend test suite exists yet, cross-referencing GAP-044.
- [ ] Add the `/api` suffix at `frontend/docs/Frontend-Guidelines.md:403` and at `frontend/src/lib/apiClient.ts:15` and `:196`.
- [ ] Add `REPORT_TIMEZONE` to the CLAUDE.md environment list and remove the stale `REDIS_HOST`/`REDIS_PORT` sentence.
- [ ] Correct the root index in `backend/src/server.js:122-140` to advertise `/api`-prefixed paths and include `services`.
- [ ] Add `engines` fields pinning Node 22 to both `package.json` files, and an `.nvmrc`, so the version is machine-enforced rather than only documented.

**Acceptance criteria**

- [ ] Every endpoint in the README API section resolves against `backend/src/routes/`.
- [ ] One test count appears across all documents.
- [ ] `grep -rn "Node.js 18" README.md` returns nothing.
- [ ] `frontend/docs/Frontend-Guidelines.md` describes directories that exist.
- [ ] `GET /` returns paths that resolve.
- [ ] `npm ci` on Node 18 fails with an engines error rather than building.

**Verification commands**

```bash
grep -rn "Node.js 18\|Next.js 15\|Tailwind CSS 3" README.md    # expect no output
curl -s http://localhost:5000/ | grep -o '"/api/[a-z-]*"' | sort
cd backend && node -e "console.log(require('./package.json').engines)"
```

**Do not**

Do not delete the `backend/docs/Phase-*.md` files; they are historical records and
CLAUDE.md already marks them as stale in places. Do not change any route path to
match the README. Do not add a `features/` directory to make the guidelines true.

**Rollback**

Revert the documentation edits and the three small code corrections.

**Open questions**

Should `frontend/docs/Frontend-Guidelines.md` be corrected or retired? Much of it
is superseded by CLAUDE.md, and maintaining two overlapping frontend guides is how
this drift happened. Retiring it and folding the still-accurate design constraints
into CLAUDE.md may be better than fixing it, but that is the owner's call about
their own documentation, which is why this entry is AGENT-ASSISTED.

### GAP-053 [SEC] The refresh cookie's secure and sameSite fail open on NODE_ENV

> **FIXED 2026-09-09, same day it was raised.** The open question below was
> answered: local development is meant to run with `NODE_ENV=development`, so
> the simple inversion is the right shape and the `COOKIE_SECURE` override was
> not needed. Both flags now derive from `isDebugEnvironment()`.
>
> **The premise needed making true first.** `npm run dev` was
> `nodemon src/server.js` and set nothing; only the three `test` scripts used
> `cross-env`, and `.env.example` never mentions `NODE_ENV`. So the value came
> from whatever a developer happened to have in their own `backend/.env`, and
> inverting the flags on that basis would have set `Secure` on plain-HTTP
> localhost for anyone whose file omitted it. The dev script now declares
> `cross-env NODE_ENV=development` explicitly.
>
> Two things found while fixing it. `clearRefreshTokenCookie` hardcoded its own
> attributes instead of reusing the options, so the clear no longer matched the
> set once `secure` flipped; a browser will not let a non-Secure write replace a
> Secure cookie, which would have left a live 30-day refresh token after logout.
> Both now derive from one function. And the attribute matrix is asserted
> against the exported options function rather than over HTTP, because varying
> `NODE_ENV` re-enables `authLimiter` (it skips only on exactly `test`) and a
> table of logins exhausts the 10-request budget and starts returning 429.

Severity S2 Major | Complexity XS | Difficulty D2 Standard | Risk R2 |
Confidence C1 Verified | Priority score 5.0 | Agent suitability AGENT-ASSISTED |
Depends on none | Blocks none | Est. agent turns 2-4

**Location**
- `backend/src/controllers/authController.js:14-15` (primary, inside `getRefreshTokenCookieOptions` at `:12`)
- `backend/src/utils/environment.js` (the affirmative test GAP-005 introduced for the same shape)

**Evidence**

```js
// backend/src/controllers/authController.js:12-15
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
```

**What is wrong**

This is the same fail-open shape GAP-005 removed from the reset-token echo and
the error handler, in the one place GAP-005 deliberately did not touch. The
condition gates the *safe* value on `NODE_ENV` being exactly `production`, so
unset, `PRODUCTION`, `prod` and `staging` all produce `secure: false` and
`sameSite: 'lax'`.

It was left out of GAP-005 because the naive inversion is not safe here.
Flipping it to fail closed sets `Secure` on a plain-HTTP `localhost`, and a
browser will not store a `Secure` cookie over HTTP, so local login stops working
entirely. The other two call sites had no such cost, which is why they were
changed immediately and this one was recorded instead.

**Why it matters**

`secure: false` lets the 30-day refresh cookie travel over plaintext, so any
network position between the browser and the app can lift a long-lived session
credential. `sameSite: 'lax'` rather than `strict` widens the set of cross-site
navigations that attach it. The committed compose files set
`NODE_ENV: production`, so a containerised deploy is unaffected today; the
exposure is a bare-metal run, a systemd unit with no `Environment=`, a PM2
default, or a staging environment named `staging`.

**Intended behavior**

The cookie is `Secure` and `SameSite=strict` everywhere except an explicitly
declared local HTTP development environment, so a misspelled or absent
`NODE_ENV` yields the safe setting rather than the permissive one.

**Proposed fix**

Derive the flags from `isDebugEnvironment()` in
`backend/src/utils/environment.js` rather than from `=== 'production'`, so the
permissive values require an explicit `development` or `test`. That inverts the
default without changing behaviour for anyone who already sets `NODE_ENV`
correctly, and it keeps local HTTP working because local runs set
`NODE_ENV=development`.

The residual risk is a developer who runs with `NODE_ENV` unset over HTTP: they
would get `Secure` and lose login. Whether that is acceptable is the open
question below. A more conservative variant adds an explicit
`COOKIE_SECURE` override read only when `isDebugEnvironment()` is true, so the
insecure setting can never be reached in an unrecognised environment.

**Implementation checklist**

- [ ] In `backend/src/controllers/authController.js`, import `isDebugEnvironment` and derive both `secure` and `sameSite` from it.
- [ ] Confirm `clearRefreshTokenCookie` uses the same options object, so the clear matches the set and the cookie is actually removed.
- [ ] In `backend/tests/auth.test.js`, add a test asserting the `set-cookie` header carries `Secure` and `SameSite=Strict` when `NODE_ENV` is an unrecognised value.
- [ ] In `backend/tests/auth.test.js`, add the matching test asserting it does not when `NODE_ENV=development`.
- [ ] Document the local-development expectation in `README.md` if the decision below requires `NODE_ENV=development` to be set explicitly.
- [ ] Run `npm test -- auth.test.js` from `backend/`.

**Acceptance criteria**

- [ ] With `NODE_ENV` unset, the refresh cookie is issued with `Secure` and `SameSite=Strict`.
- [ ] With `NODE_ENV=development`, local login over `http://localhost` still works.
- [ ] The cookie set on login and the cookie cleared on logout use identical attributes.
- [ ] The full auth suite passes.

**Verification commands**

```bash
cd backend && npm test -- auth.test.js
grep -n "NODE_ENV === 'production'" src/          # expect no security-relevant hits
```

**Do not**

Do not simply delete the `secure` flag. Do not change the refresh token's
lifetime or the CSRF pairing in `middleware/csrf.js`. Do not alter
`isDebugEnvironment()`'s list without also reconsidering GAP-005, which depends
on it.

**Rollback**

Revert the one function. The cookie returns to being permissive when `NODE_ENV`
is not exactly `production`.

**Open questions**

Answered 2026-09-09: local development runs with `NODE_ENV=development`, so the
simple inversion applies. `npm run dev` now sets it explicitly rather than
relying on each developer's `.env`, which is what makes that answer true in
practice as well as in intent.

---

### GAP-054 [SEC] Validation errors echo the submitted value, including passwords

> **FIXED 2026-09-09, Wave 3.** `value` is gone from `validate.js`'s formatted
> errors and from `ApiFieldError`. Nothing consumed it, and the existing suites
> assert on `field` and `message` only, so no test needed changing.

Severity S3 Moderate | Complexity XS | Difficulty D1 Mechanical | Risk R1 |
Confidence C1 Verified | Priority score 2.0 | Agent suitability AGENT-READY |
Depends on none | Blocks none | Est. agent turns 2-3

**Location**
- `backend/src/middleware/validate.js:12-16` (primary)
- `backend/src/routes/authRoutes.js:32`, `:48`, `:86` (the three password length rules that reach it)
- `frontend/src/types/api.ts` (`ApiFieldError`, which declares the field)

**Evidence**

```js
// backend/src/middleware/validate.js:12-16
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param || 'unknown',
      message: err.msg,
      value: err.value
    }));
```

**What is wrong**

Every rejection carries the value that was rejected. `registerValidation`,
`customerRegisterValidation` and `resetPasswordValidation` all apply
`isLength({ min: 6 })` to a password field, so submitting a short password
returns that password in the 400 body under `errors[0].value`.

`value` is not read anywhere. Verified with `grep` over `frontend/src`: nothing
consumes `errors[].value`, and `ApiFieldError` marks it optional. It is emitted
for no consumer.

**Why it matters**

The value returns to the same client over the same TLS connection, so this is
not a disclosure to a third party. The cost is everywhere else a response body
is retained: an access log that captures bodies, an error-tracking service, a
proxy buffer, a screenshot in a support ticket. A rejected password is still a
password, and users commonly retry a rejected one with a small edit. GAP-051
proposes structured logging, which would widen this from a transient body to a
stored record.

**Intended behavior**

A validation error names the field and says what is wrong with it, without
repeating what was sent.

**Proposed fix**

Drop `value` from the formatted error. It has no consumer, so nothing needs a
replacement. The narrower alternative, redacting only fields whose name matches
a password pattern, is worse: it needs a list that will drift, and it leaves the
same exposure for any other sensitive field added later.

**Implementation checklist**

- [ ] In `backend/src/middleware/validate.js`, remove `value: err.value` from the mapped error object.
- [ ] In `frontend/src/types/api.ts`, remove `value` from `ApiFieldError`.
- [ ] In `backend/tests/auth.test.js`, add a test posting a too-short password to `POST /api/auth/register` and asserting the response body does not contain it.
- [ ] Run `npm test` from `backend/`, then `npm run build` from `frontend/`.

**Acceptance criteria**

- [ ] A 400 from a password rule contains the field name and message but not the submitted password.
- [ ] `grep -rn "errors\[.*\]\.value\|\.value" frontend/src/types/api.ts` shows the field is gone.
- [ ] The existing auth and validation tests still pass; they assert on `field` and `message` only.

**Verification commands**

```bash
cd backend && npm test
cd frontend && npm run build
```

**Do not**

Do not switch `authRoutes.js` from `validate.js` to `validationHandler.js`: that
changes the payload shape for every auth route, which is what GAP-006 warns
against. Do not stop returning `errors[]` itself; the reset page now depends on
it.

**Rollback**

Restore the one property. No data effect.

**Open questions**

None.

---

## 11. Deferred and Rejected

Things considered and consciously not listed as gaps, with the reason.

**Planned post-MVP work, not gaps.** `backend/docs/Phase-7-POST-MVP.md` through
`Phase-10-POST-MVP.md` specify financial management with an Expense model,
analytics and reporting, Socket.io notifications, and an activity-log audit
trail. All four are explicitly labelled POST-MVP. Their absence is planned scope,
not a defect. The only related defect is that `constants.js` already ships the
enums for them, which is folded into GAP-034. The `socket.io` dependency in
`backend/package.json` with zero imports belongs to the same set.

**The mobile app's 44 absent features.** `mobile-app/docs/FEATURES.md` and
`DESIGN_BRIEF.md` promise 64 distinct capabilities; 13 are built, 6 partial, 44
absent, of which 3 the documents themselves exclude. Listing 44 `FEAT` gaps for
an app whose own README says "**No product features yet**: this is the boot
skeleton" would be padding of exactly the kind this audit is meant to avoid. The
mobile app is a scaffold that accurately describes itself. Two real gaps are
carved out because they are defects rather than unbuilt scope: GAP-025, the total
absence from CI, and the configuration defects below. The remainder is a
work plan, not a gap list, and `mobile-app/docs/FEATURES.md` already is that plan.

**Mobile configuration defects, deferred not rejected.** Three are real and
small, and are recorded here so they are not lost: no EAS profile sets
`EXPO_PUBLIC_API_URL`, so a production build bakes in the `localhost` fallback;
`app.json` locks `orientation: portrait` while the design brief treats tablet
landscape as a first-class viewport; and the Tailwind `content` globs cover only
`app/` and `components/`, so the first styled component written under `contexts/`
will render unstyled with no error. None can affect a user today because the app
ships no features. They should become gaps the moment mobile work resumes.

**The `withAuthGuard` and `withRoleGuard` HOCs are dead code.** Roughly 168 lines
in `frontend/src/middlewares/` that no page imports, which CLAUDE.md presents as
live architecture. Role restriction is done ad hoc instead, with five pages doing
an inline admin check and six protected pages having no page-level gate at all.
I did not raise this as its own gap because the server-side guards are the real
enforcement and they are present; the frontend gap is a consistency and
documentation problem, and the documentation half is inside GAP-052. It is worth
a follow-up once someone decides whether to adopt the HOCs or delete them.

**1,653 unreachable `dark:` utility classes across 70 files.** Verified: the
custom variant in `globals.css` is class-based, and no code anywhere sets a
`dark` class on any element. Every dark-mode style compiles into CSS that never
matches. I did not raise it because it is inert: it costs bundle size and
readability, not correctness. It becomes a real gap the moment anyone adds a
theme toggle, at which point 70 files have a half-written dark theme that will
render as a broken mix.

**124 `transition` uses and a palette wider than the documented one.** CLAUDE.md
states "No transitions or animations. Loading spinners are the only exception"
and a strict yellow-black-white-gray palette. The code violates both, including
in the shared `Modal` primitive and in domain constants like `ROLE_DISPLAY` and
`MOVEMENT_TYPE_CONFIG` that bake in semantic colours. I did not raise this as a
gap because I cannot tell which side is stale: the constraint may have been
relaxed deliberately, and the colour coding now carries meaning, so reverting to
the strict palette would be a functional change. This needs the owner to say
whether the documented constraint still stands. If it does, it is a real CONTRA
gap; if it does not, it is a one-line documentation fix.

**The shared Modal has no focus trap.** `role="dialog"` sits on the click-catching
overlay rather than the panel, there is no focus trap, no initial focus move, and
no focus restoration on close. This is a genuine accessibility defect affecting
every modal in the application. I deferred it because accessibility was not in the
stated scope and no other a11y review was performed, so raising one a11y finding
would imply a coverage I did not achieve. It deserves its own review pass.

**Dead Zod validators and client-server bound mismatches.** Roughly 250 lines of
shared validators in `frontend/src/utils/validators/sales.ts` and `service.ts` are
unreachable, replaced by weaker inline schemas on the two order pages. Separately
there are four client-versus-server bound mismatches: product barcode has no
client minimum against the API's 8, the user form offers a `customer` role the API
rejects, the supplier form submits empty strings for optional nested fields that
`.optional()` does not skip, and registration allows a 100-character name the API
caps at 50. Each produces a 400 on a form the app itself rendered as valid. I
folded none of these into the master index because they are individually small and
collectively one theme: the client and server validation are maintained
separately. That theme deserves one consolidating gap, which I would write after
the higher-priority work lands rather than now.

**`ownBranchOnly` is dead.** The middleware in
`backend/src/middleware/branchAccess.js` has exactly two references, its
definition and its export. Not raised: unused code that is correct and cheap.

**Things checked and found correct.** Recorded so nobody re-audits them. Every
route in all ten routers carries `protect`; there is no unauthenticated route
besides the deliberately public auth endpoints, `/health` and `/`. The CSRF
double-submit uses `crypto.timingSafeEqual` with a length pre-check.
`cookieParser()` is correctly scoped to `/api/auth` only. Public registration
ignores an attacker-supplied `role` and `branch`, and a test proves it. Order
pricing comes from the branch's `Stock.sellingPrice`, never from the request. The
sharp `.rotate()`-before-`.resize()` ordering is intact and guarded by a test.
`resolveTrustProxy` defaults to 0 on every malformed input. `seedAdminUser`
distinguishes a race loss from a taken email and never logs the password. No
secrets are tracked in git. The `clientRequestId` idempotency contract is the
best-tested area of the backend, covering same-key, different-key and no-key
cases including the sparse-index regression. There are zero skipped, focused or
todo tests. The four `jest.mock` sites are all legitimate, and the `seedAdmin`
pair, which tests a race against both a mock and a real unique index, is
exemplary. `frontend/src/` is `strict: true` with zero `any` casts across 37,635
lines, no empty catch blocks, and no page importing axios directly.

## 12. Machine-Readable Appendix

```json
[
{"id":"GAP-001","cat":"SEC","sev":"S1","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":8.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/controllers/authController.js"],"title":"Password reset does not revoke the session or the refresh token"},
{"id":"GAP-002","cat":"SEC","sev":"S1","cplx":"XS","diff":"D2","risk":"R1","conf":"C1","pri":8.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["frontend/src/lib/offline/db.ts","frontend/src/lib/offline/cache.ts","frontend/src/lib/offline/outbox.ts","frontend/src/stores/authStore.ts"],"title":"The offline outbox survives logout and replays under the next user"},
{"id":"GAP-003","cat":"CODE","sev":"S1","cplx":"XS","diff":"D2","risk":"R1","conf":"C1","pri":8.0,"agent":"AGENT-READY","depends_on":[],"blocks":["GAP-022"],"files":["backend/src/middleware/errorHandler.js"],"title":"Every MongoServerError is answered 400, so offline replay discards real sales"},
{"id":"GAP-004","cat":"SEC","sev":"S1","cplx":"XS","diff":"D1","risk":"R2","conf":"C1","pri":8.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["docker-compose.yml","docs/DEPLOYMENT.md"],"title":"Mongo credentials fail open to a change-me default published in a public repo"},
{"id":"GAP-005","cat":"SEC","sev":"S2","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/controllers/authController.js","backend/src/middleware/errorHandler.js"],"title":"forgot-password returns the reset token unless NODE_ENV is exactly production"},
{"id":"GAP-006","cat":"CODE","sev":"S2","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["frontend/src/types/auth.ts","frontend/src/app/(public)/(auth)/reset-password/page.tsx","frontend/src/lib/services/authService.ts"],"title":"Password reset is impossible: the client sends token, the API requires resetToken"},
{"id":"GAP-007","cat":"SEC","sev":"S2","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/routes/stockRoutes.js"],"title":"GET /stock/movements/branch/:branchId has no authorize() guard"},
{"id":"GAP-008","cat":"SEC","sev":"S2","cplx":"XS","diff":"D2","risk":"R2","conf":"C1","pri":5.0,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["backend/src/controllers/branchController.js","backend/src/middleware/cache.js"],"title":"Any authenticated customer can enumerate branch managers names and emails"},
{"id":"GAP-009","cat":"CODE","sev":"S2","cplx":"XS","diff":"D2","risk":"R2","conf":"C1","pri":5.0,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["backend/src/routes/userRoutes.js","backend/src/routes/branchRoutes.js"],"title":"normalizeEmail on admin user routes but not on login locks accounts out"},
{"id":"GAP-010","cat":"CODE","sev":"S2","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["frontend/src/lib/services/authService.ts","frontend/src/lib/apiClient.ts"],"title":"authService.refreshToken omits the CSRF header, so session restore always 403s"},
{"id":"GAP-011","cat":"OPS","sev":"S2","cplx":"XS","diff":"D1","risk":"R2","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":[".github/workflows/security.yml",".github/branch-protection.json"],"title":"Branch protection requires four check names the workflows can never report"},
{"id":"GAP-012","cat":"SEC","sev":"S2","cplx":"XS","diff":"D2","risk":"R2","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":[".github/workflows/dependabot-auto-merge.yml"],"title":"Dependabot auto-merge treats a still-running security check as passing"},
{"id":"GAP-013","cat":"CODE","sev":"S2","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":5.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["frontend/src/components/stock/AdjustStockModal.tsx","backend/src/routes/stockRoutes.js"],"title":"The adjust-stock form defaults to an invalid reason and offers one the API rejects"},
{"id":"GAP-014","cat":"CODE","sev":"S1","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":4.0,"agent":"AGENT-READY","depends_on":[],"blocks":["GAP-046"],"files":["backend/src/controllers/salesController.js","backend/src/controllers/stockController.js"],"title":"Stock reservations leak on every order-creation failure path"},
{"id":"GAP-015a","cat":"SEC","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/utils/regex.js","backend/src/controllers/branchController.js","backend/src/controllers/supplierController.js","backend/src/controllers/userController.js","backend/src/controllers/productController.js","backend/src/controllers/motorcycleModelController.js"],"title":"User-supplied text reaches MongoDB regex unescaped at eight sites"},
{"id":"GAP-015b","cat":"SEC","sev":"S1","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":4.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/middleware/sanitizeRequest.js","backend/src/server.js","backend/tests/sanitizeRequest.test.js","backend/tests/service.test.js"],"title":"JSON request bodies reach Mongo as query operators; there is no request-shape guard"},
{"id":"GAP-015c","cat":"SEC","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/utils/pickFields.js","backend/src/controllers/branchController.js","backend/src/controllers/categoryController.js","backend/src/controllers/productController.js","backend/src/controllers/supplierController.js"],"title":"Four update paths pass the whole request body to findByIdAndUpdate"},
{"id":"GAP-015d","cat":"SEC","sev":"S3","cplx":"M","diff":"D2","risk":"R1","conf":"C1","pri":0.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/routes/stockRoutes.js","backend/src/routes/salesRoutes.js","backend/src/routes/serviceRoutes.js","backend/src/routes/productRoutes.js","backend/src/routes/categoryRoutes.js","backend/src/controllers/serviceController.js"],"title":"Twelve read routes have no query-validation chain at all"},
{"id":"GAP-016","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":["GAP-050"],"files":["backend/src/controllers/salesController.js","backend/src/utils/salesCompletion.js"],"title":"A completed-but-unpaid sale can never be paid; on-account revenue is unrecordable"},
{"id":"GAP-017","cat":"SEC","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/routes/serviceRoutes.js"],"title":"Four mutating service routes have no validation chain"},
{"id":"GAP-018","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["backend/src/controllers/stockController.js"],"title":"Stock adjustments ignore reservedQuantity and can strand pending orders"},
{"id":"GAP-019","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/controllers/stockController.js","backend/src/utils/salesCompletion.js","backend/src/controllers/serviceController.js"],"title":"Transfer completion credits the destination when the source Stock row is missing"},
{"id":"GAP-020","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":["GAP-006"],"blocks":[],"files":["frontend/src/types/auth.ts","frontend/src/providers/BranchProvider.tsx","frontend/src/middlewares/roleGuard.tsx","frontend/src/hooks/useAuth.ts"],"title":"user.branch shape drift breaks BranchProvider, roleGuard and hasBranchAccess"},
{"id":"GAP-021","cat":"FEAT","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["backend/src/controllers/salesController.js","backend/src/controllers/serviceController.js","frontend/src/app/(protected)/sales/page.tsx"],"title":"Sales and service list search and sort are silently dropped by the API"},
{"id":"GAP-022","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":["GAP-003"],"blocks":[],"files":["frontend/src/lib/offline/sync.ts","frontend/src/app/(protected)/sync/page.tsx"],"title":"The offline replay queue can stall indefinitely with no user-visible retry"},
{"id":"GAP-023","cat":"OPS","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":["GAP-024","GAP-051"],"files":["backend/src/server.js"],"title":"/health is a static 200, so a deploy is declared green on a dead application"},
{"id":"GAP-024","cat":"OPS","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":["GAP-023"],"blocks":[],"files":["backend/src/server.js","docker-compose.yml"],"title":"No SIGTERM handler; every deploy severs in-flight writes and can break the ledger"},
{"id":"GAP-025","cat":"PROJ","sev":"S2","cplx":"S","diff":"D1","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":[".github/workflows/ci.yml",".github/workflows/security.yml",".github/dependabot.yml",".github/workflows/dependabot-auto-merge.yml"],"title":"mobile-app is absent from every CI, security and Dependabot workflow"},
{"id":"GAP-026","cat":"CODE","sev":"S2","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":2.5,"agent":"AGENT-READY","depends_on":[],"blocks":["GAP-043"],"files":["backend/src/utils/pagination.js","backend/src/controllers/stockController.js","backend/src/controllers/productController.js","backend/src/controllers/branchController.js","backend/src/controllers/categoryController.js","backend/src/controllers/motorcycleModelController.js"],"title":"Five read endpoints have no pagination or no upper bound on limit"},
{"id":"GAP-027","cat":"OPS","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C1","pri":2.5,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["docker-compose.yml","docker-compose.staging.yml","docker-compose.production.yml","docs/DEPLOYMENT.md"],"title":"No resource limits or log rotation; staging and production share one box"},
{"id":"GAP-028","cat":"OPS","sev":"S1","cplx":"M","diff":"D2","risk":"R1","conf":"C1","pri":2.0,"agent":"HUMAN-FIRST","depends_on":[],"blocks":[],"files":["scripts/backup.sh","scripts/restore.sh","docs/DEPLOYMENT.md"],"title":"No backup or restore path for the MongoDB data or the uploads volume"},
{"id":"GAP-029","cat":"CODE","sev":"S2","cplx":"S","diff":"D4","risk":"R3","conf":"C2","pri":2.0,"agent":"HUMAN-FIRST","depends_on":[],"blocks":[],"files":["backend/src/models/SalesOrder.js","backend/src/models/ServiceOrder.js","backend/src/routes/salesRoutes.js"],"title":"Tax is charged on the pre-discount subtotal and the discount has no ceiling"},
{"id":"GAP-030","cat":"SEC","sev":"S2","cplx":"S","diff":"D2","risk":"R2","conf":"C2","pri":2.0,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["frontend/src/app/sw.ts","frontend/src/lib/offline/cache.ts"],"title":"The service worker caches cross-origin API responses in a shared bucket"},
{"id":"GAP-031","cat":"CODE","sev":"S3","cplx":"XS","diff":"D2","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/controllers/categoryController.js","backend/src/controllers/productController.js"],"title":"Cache invalidation is incomplete and one cache key omits a request parameter"},
{"id":"GAP-032","cat":"CODE","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/config/constants.js","backend/src/server.js"],"title":"CORS_ALLOWED_ORIGINS is split without trimming and no Vary Origin is sent"},
{"id":"GAP-033","cat":"SEC","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/controllers/userController.js"],"title":"The defensive select in userController excludes fields that do not exist"},
{"id":"GAP-034","cat":"CODE","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/config/constants.js","backend/src/middleware/imageUpload.js"],"title":"Dead configuration: unused constants, unused CORS headers, divergent upload limits"},
{"id":"GAP-035","cat":"PROJ","sev":"S3","cplx":"XS","diff":"D1","risk":"R2","conf":"C1","pri":2.0,"agent":"HUMAN-FIRST","depends_on":[],"blocks":[],"files":["docs/DEPLOYMENT.md"],"title":"Branch and workspace hygiene: staging is 94 commits behind master"},
{"id":"GAP-036","cat":"OPS","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/utils/seedBranches.js","CLAUDE.md"],"title":"seedBranches.js self-executes on import with no main-module guard"},
{"id":"GAP-037","cat":"OPS","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":[".gitignore","backend/src/middleware/imageUpload.js","backend/src/server.js"],"title":"The repo-root uploads directory is neither gitignored nor mounted"},
{"id":"GAP-038","cat":"SEC","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/middleware/imageUpload.js"],"title":"Image processing returns the raw internal error message and path on 500"},
{"id":"GAP-039","cat":"CONTRA","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["CLAUDE.md","backend/src/routes/authRoutes.js"],"title":"apiLimiter is documented as 300 per IP and implemented as 3000 per user"},
{"id":"GAP-040","cat":"CODE","sev":"S2","cplx":"M","diff":"D2","risk":"R3","conf":"C1","pri":1.25,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":["GAP-046","GAP-049"],"files":["backend/src/models/Counter.js","backend/src/utils/sequence.js","backend/src/controllers/salesController.js","backend/src/controllers/serviceController.js","backend/src/models/SalesOrder.js","backend/src/models/ServiceOrder.js","backend/src/models/StockTransfer.js","backend/src/models/Transaction.js","backend/src/models/Product.js","backend/src/models/StockMovement.js"],"title":"Every human-readable identifier is generated with countDocuments plus one"},
{"id":"GAP-041","cat":"CODE","sev":"S2","cplx":"M","diff":"D3","risk":"R3","conf":"C1","pri":1.25,"agent":"AGENT-ASSISTED","depends_on":["GAP-040"],"blocks":[],"files":["backend/src/utils/currency.js","backend/src/models/SalesOrder.js","backend/src/models/ServiceOrder.js","backend/src/utils/salesCompletion.js"],"title":"All money is IEEE-754 floating point with no rounding at any boundary"},
{"id":"GAP-042","cat":"FEAT","sev":"S2","cplx":"M","diff":"D2","risk":"R1","conf":"C1","pri":1.25,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["frontend/src/app/(protected)/dashboard/page.tsx"],"title":"The dashboard, the post-login landing page, is entirely non-functional"},
{"id":"GAP-043","cat":"FEAT","sev":"S2","cplx":"M","diff":"D2","risk":"R1","conf":"C1","pri":1.25,"agent":"AGENT-READY","depends_on":["GAP-026"],"blocks":[],"files":["frontend/src/lib/services/stockService.ts","frontend/src/hooks/useStock.ts","frontend/src/app/(protected)/stock/page.tsx","frontend/src/app/(protected)/stock/transfers/page.tsx"],"title":"Stock lists are silently truncated to one unpaginated page"},
{"id":"GAP-044","cat":"TEST","sev":"S2","cplx":"M","diff":"D3","risk":"R1","conf":"C1","pri":1.25,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/tests/stock.test.js","backend/tests/sales.test.js","backend/tests/service.test.js","backend/tests/concurrency.test.js","frontend/package.json","frontend/src/lib/offline/sync.test.ts",".github/workflows/ci.yml"],"title":"No concurrency test exists and the StockMovement ledger is never asserted"},
{"id":"GAP-045","cat":"TEST","sev":"S2","cplx":"M","diff":"D2","risk":"R1","conf":"C1","pri":1.25,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/tests/branch.test.js","backend/tests/auth.test.js","backend/tests/stock.test.js","backend/tests/product.test.js"],"title":"branch.test.js tests Mongoose directly; four branch endpoints are unverified"},
{"id":"GAP-046","cat":"CODE","sev":"S1","cplx":"L","diff":"D3","risk":"R3","conf":"C1","pri":1.14,"agent":"HUMAN-FIRST","depends_on":["GAP-014","GAP-040"],"blocks":[],"files":["backend/src/models/Stock.js","backend/src/controllers/salesController.js","backend/src/utils/salesCompletion.js","backend/src/controllers/stockController.js","backend/src/controllers/serviceController.js"],"title":"No atomicity on stock quantity writes: lost updates and oversell"},
{"id":"GAP-047","cat":"CODE","sev":"S3","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":1.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["frontend/src/types/stock.ts","frontend/src/types/api.ts","frontend/src/components/stock/TransferList.tsx","frontend/src/lib/services/userService.ts"],"title":"Frontend types drift from the API contract at four points"},
{"id":"GAP-048","cat":"OPS","sev":"S3","cplx":"S","diff":"D2","risk":"R1","conf":"C1","pri":1.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/utils/cache.js","backend/tests/cache.test.js"],"title":"Cache invalidation uses Redis KEYS on every mutation hot path"},
{"id":"GAP-049","cat":"CONTRA","sev":"S3","cplx":"S","diff":"D2","risk":"R3","conf":"C1","pri":1.0,"agent":"AGENT-ASSISTED","depends_on":["GAP-040"],"blocks":[],"files":["backend/src/utils/salesCompletion.js","backend/src/controllers/serviceController.js","backend/src/models/Transaction.js","CLAUDE.md"],"title":"Transaction numbers never take the documented TXN-YYYYMM shape"},
{"id":"GAP-050","cat":"FEAT","sev":"S2","cplx":"L","diff":"D4","risk":"R3","conf":"C1","pri":0.71,"agent":"HUMAN-FIRST","depends_on":["GAP-016"],"blocks":[],"files":["backend/src/models/SalesOrder.js","backend/src/controllers/salesController.js","backend/src/models/Transaction.js"],"title":"There is no refund, void, or reversal path anywhere in the system"},
{"id":"GAP-051","cat":"OPS","sev":"S2","cplx":"L","diff":"D2","risk":"R1","conf":"C1","pri":0.71,"agent":"AGENT-ASSISTED","depends_on":["GAP-023"],"blocks":[],"files":["backend/src/server.js","backend/src/middleware/errorHandler.js","backend/package.json","docs/DEPLOYMENT.md"],"title":"No observability: no metrics, structured logs, tracing, or alerting"},
{"id":"GAP-052","cat":"CONTRA","sev":"S3","cplx":"M","diff":"D1","risk":"R1","conf":"C1","pri":0.5,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["README.md","frontend/docs/Frontend-Guidelines.md","CLAUDE.md","backend/src/server.js","frontend/src/lib/apiClient.ts","backend/package.json","frontend/package.json"],"title":"Documentation contradicts the code at eight independent points"}
{"id":"GAP-053","cat":"SEC","sev":"S2","cplx":"XS","diff":"D2","risk":"R2","conf":"C1","pri":5.0,"agent":"AGENT-ASSISTED","depends_on":[],"blocks":[],"files":["backend/src/controllers/authController.js","backend/src/utils/environment.js"],"title":"The refresh cookie's secure and sameSite fail open on NODE_ENV"},
{"id":"GAP-054","cat":"SEC","sev":"S3","cplx":"XS","diff":"D1","risk":"R1","conf":"C1","pri":2.0,"agent":"AGENT-READY","depends_on":[],"blocks":[],"files":["backend/src/middleware/validate.js","frontend/src/types/api.ts"],"title":"Validation errors echo the submitted value, including passwords"}
]
```

## 13. NoSQL Injection Alert Triage (CodeQL `js/sql-injection`)

Triaged on 2026-09-07 against `origin/master` at `ca99b7d`. Sixty open
high-severity alerts, every one read at its sink and traced back to the route
that feeds it. `js/sql-injection` is the query CodeQL uses for NoSQL injection
on a Mongo codebase.

**Result: 8 exploitable today, 28 real but latent, 24 false positives.**

### 13.1 How the verdicts were reached

Four facts decide every row, and all four were established by running code
against the versions `backend/package-lock.json` pins, not by reading docs:

1. **`express@5.2.1`'s default `query parser` is `simple`.** `?x[$ne]=1` yields
   the literal key `"x[$ne]"`, never a nested object. `server.js` never calls
   `app.set('query parser', ...)`. So **no query-string value can become an**
   **operator object.** `?x=1&x=2` does yield `["1","2"]`.
2. **`express.json()` and `express.urlencoded({ extended: true })` both do**
   **produce nested objects** (`server.js:29-30`). So a *body* value can.
3. **`express-validator@7.3.2` writes a value back only from a sanitizer.** A
   validator that rejects `"[object Object]"` stops the request and is a real
   barrier: `isMongoId`, `isEmail`, `isIn`, `isInt`, `isFloat`, `isString`,
   `isURL`, `isBoolean` and a `.matches()` or `.custom()` regex test all do.
   `notEmpty()` does **not**: it accepts `"[object Object]"` and leaves the
   object in `req.body`. `.optional()` alone is not a barrier either.
4. **`mongoose@9.9.4` neither strips nor rejects.** `{_id:{$ne:null}}` casts
   and executes; `{code:["a","b"]}` is silently rewritten to
   `{code:{$in:["a","b"]}}`; `$unset`, `$rename` and `$inc` pass through an
   update document untouched even with `runValidators: true`.

Route parameters are never a vector: an Express path segment is always a
string, so neither an object nor an array is constructible there.

### 13.2 Verdict classes

| Class | Count | Meaning | Gap |
|---|---|---|---|
| TP-1 | 4 | Unvalidated **body** value reaches a filter. Operator injection works today. | GAP-015b |
| TP-2 | 4 | Whole `req.body` becomes an update document. Operator injection and mass assignment work today. | GAP-015c |
| TP-3 | 28 | Unvalidated **query** value reaches a filter. Operator injection blocked by the `simple` parser; array widening to `$in` works. One config line from critical. | GAP-015d |
| FP-A | 24 | A route validator rejects the payload before the controller runs. Not exploitable. | dismiss |

TP-3 is recorded as **LATENT** rather than TRUE POSITIVE in the table below,
because the exploit CodeQL describes does not currently work. It is not a
dismissal: the code is unconstrained, and every branch-scoping clamp was
re-read to confirm array widening crosses no authorisation boundary today.

### 13.3 Per-alert table

All paths are relative to `backend/src/controllers/`; route citations are
relative to `backend/src/routes/`.

| # | Sink | Request field | Route and validator | Verdict | Class |
|---|---|---|---|---|---|
| 5 | `authController.js:55` | `body.email` | POST /auth/register: body('email').trim().isEmail() authRoutes.js:26-29 | FALSE POSITIVE | FP-A |
| 10 | `authController.js:108` | `body.email` | POST /auth/login: body('email').trim().isEmail() authRoutes.js:57-60 | FALSE POSITIVE | FP-A |
| 13 | `authController.js:238` | `body.email` | POST /auth/forgot-password: body('email').trim().isEmail() authRoutes.js:74-77 | FALSE POSITIVE | FP-A |
| 14 | `authController.js:314` | `body.email` | POST /auth/register-customer: body('email').trim().isEmail() authRoutes.js:42-45 | FALSE POSITIVE | FP-A |
| 6 | `branchController.js:118` | `body.manager` | POST /branches: body('manager').optional().isMongoId() branchRoutes.js:55-57 | FALSE POSITIVE | FP-A |
| 8 | `branchController.js:165` | `body.manager` | PUT /branches/:id: body('manager').optional().isMongoId() branchRoutes.js:81-83 | FALSE POSITIVE | FP-A |
| 9 | `branchController.js:177` | `whole req.body` | PUT /branches/:id: chain validates named fields only, branchRoutes.js:64-85 | TRUE POSITIVE | TP-2 |
| 4 | `categoryController.js:36` | `query.parent` | GET /categories: no chain, categoryRoutes.js:143-148 | LATENT | TP-3 |
| 7 | `categoryController.js:116` | `body.parent` | POST /categories: custom /^[0-9a-fA-F]{24}$/ test, categoryRoutes.js:46-58 | FALSE POSITIVE | FP-A |
| 11 | `categoryController.js:170` | `body.parent` | PUT /categories/:id: custom ObjectId test, categoryRoutes.js:105-117 | FALSE POSITIVE | FP-A |
| 12 | `categoryController.js:179` | `whole req.body` | PUT /categories/:id: chain validates named fields only, categoryRoutes.js:78-140 | TRUE POSITIVE | TP-2 |
| 119 | `productController.js:165` | `query.* (7 fields)` | GET /products: no chain, productRoutes.js:293-298 | LATENT | TP-3 |
| 16 | `productController.js:171` | `query.* (7 fields)` | GET /products: no chain, productRoutes.js:293-298 | LATENT | TP-3 |
| 17 | `productController.js:314` | `body.category` | POST /products: body('category').notEmpty().isMongoId() productRoutes.js:59-63 | FALSE POSITIVE | FP-A |
| 18 | `productController.js:383` | `body.category` | PUT /products/:id: body('category').optional().isMongoId() productRoutes.js:161-164 | FALSE POSITIVE | FP-A |
| 120 | `productController.js:410` | `whole req.body` | PUT /products/:id: chain validates named fields only, productRoutes.js:136-234 | TRUE POSITIVE | TP-2 |
| 24 | `salesController.js:65` | `query.* (5 fields)` | GET /sales: no chain, salesRoutes.js:85-90 | LATENT | TP-3 |
| 25 | `salesController.js:72` | `query.* (5 fields)` | GET /sales: no chain, salesRoutes.js:85-90 | LATENT | TP-3 |
| 28 | `salesController.js:142` | `query.status/dates` | GET /sales/branch/:branchId: param only, salesRoutes.js:93-100 | LATENT | TP-3 |
| 30 | `salesController.js:148` | `query.status/dates` | GET /sales/branch/:branchId: param only, salesRoutes.js:93-100 | LATENT | TP-3 |
| 109 | `salesController.js:193` | `body.clientRequestId, body.branch` | POST /sales: isString() + isMongoId(), salesRoutes.js:25-27 | FALSE POSITIVE | FP-A |
| 31 | `salesController.js:206` | `body.items[].product` | POST /sales: body('items.*.product').isMongoId() salesRoutes.js:33 | FALSE POSITIVE | FP-A |
| 32 | `salesController.js:216` | `body.items[].product` | POST /sales: body('items.*.product').isMongoId() salesRoutes.js:33 | FALSE POSITIVE | FP-A |
| 35 | `salesController.js:621` | `query.branch/dates` | GET /sales/stats: no chain, salesRoutes.js:77-82 | LATENT | TP-3 |
| 36 | `salesController.js:622` | `query.branch/dates` | GET /sales/stats: no chain, salesRoutes.js:77-82 | LATENT | TP-3 |
| 37 | `salesController.js:623` | `query.branch/dates` | GET /sales/stats: no chain, salesRoutes.js:77-82 | LATENT | TP-3 |
| 38 | `salesController.js:624` | `query.branch/dates` | GET /sales/stats: no chain, salesRoutes.js:77-82 | LATENT | TP-3 |
| 111 | `salesController.js:629` | `query.branch/dates` | GET /sales/stats: no chain, salesRoutes.js:77-82 | LATENT | TP-3 |
| 20 | `serviceController.js:78` | `query.* (7 fields)` | GET /services: no chain, serviceRoutes.js:46-50 | LATENT | TP-3 |
| 21 | `serviceController.js:86` | `query.* (7 fields)` | GET /services: no chain, serviceRoutes.js:46-50 | LATENT | TP-3 |
| 22 | `serviceController.js:121` | `query.status` | GET /services/my-jobs: no chain, serviceRoutes.js:57-61 | LATENT | TP-3 |
| 23 | `serviceController.js:129` | `query.status` | GET /services/my-jobs: no chain, serviceRoutes.js:57-61 | LATENT | TP-3 |
| 110 | `serviceController.js:213` | `body.clientRequestId, body.branch` | POST /services: isString() + isMongoId(), serviceRoutes.js:25-27 | FALSE POSITIVE | FP-A |
| 26 | `serviceController.js:224` | `body.assignedTo` | POST /services: chain exists but declares no assignedTo rule, serviceRoutes.js:22-36 | TRUE POSITIVE | TP-1 |
| 29 | `serviceController.js:295` | `body.mechanicId` | PUT /services/:id/assign: NO chain at all, serviceRoutes.js:103-107 | TRUE POSITIVE | TP-1 |
| 33 | `serviceController.js:485` | `body.partsUsed[].product` | PUT /services/:id/parts: NO chain at all, serviceRoutes.js:125-129 | TRUE POSITIVE | TP-1 |
| 34 | `serviceController.js:490` | `body.partsUsed[].product` | PUT /services/:id/parts: NO chain at all, serviceRoutes.js:125-129 | TRUE POSITIVE | TP-1 |
| 121 | `stockController.js:89` | `query.branch/product` | GET /stock: no chain, stockRoutes.js:85-90 | LATENT | TP-3 |
| 43 | `stockController.js:100` | `query.branch/product` | GET /stock: no chain, stockRoutes.js:85-90 | LATENT | TP-3 |
| 44 | `stockController.js:147` | `query.category` | GET /stock/branch/:branchId: param only, stockRoutes.js:180-188 | LATENT | TP-3 |
| 47 | `stockController.js:266` | `query.branch` | GET /stock/low-stock: no chain, stockRoutes.js:93-98 | LATENT | TP-3 |
| 48 | `stockController.js:309` | `body.product` | POST /stock/restock: body('product').notEmpty().isMongoId() stockRoutes.js:12 | FALSE POSITIVE | FP-A |
| 49 | `stockController.js:310` | `body.branch` | POST /stock/restock: body('branch').notEmpty().isMongoId() stockRoutes.js:13 | FALSE POSITIVE | FP-A |
| 50 | `stockController.js:327` | `body.product/branch` | POST /stock/restock: both isMongoId(), stockRoutes.js:12-13 | FALSE POSITIVE | FP-A |
| 51 | `stockController.js:406` | `body.product/branch` | POST /stock/adjust: both isMongoId(), stockRoutes.js:27-28 | FALSE POSITIVE | FP-A |
| 122 | `stockController.js:415` | `body.product` | POST /stock/adjust: body('product').notEmpty().isMongoId() stockRoutes.js:27 | FALSE POSITIVE | FP-A |
| 52 | `stockController.js:597` | `body.product/fromBranch` | POST /stock/transfers: both isMongoId(), stockRoutes.js:35-36 | FALSE POSITIVE | FP-A |
| 53 | `stockController.js:830` | `query.branch/status` | GET /stock/transfers: no chain, stockRoutes.js:142-147 | LATENT | TP-3 |
| 54 | `stockController.js:838` | `query.branch/status` | GET /stock/transfers: no chain, stockRoutes.js:142-147 | LATENT | TP-3 |
| 55 | `stockController.js:942` | `query.* (5 fields)` | GET /stock/movements: no chain, stockRoutes.js:103-108 | LATENT | TP-3 |
| 56 | `stockController.js:950` | `query.* (5 fields)` | GET /stock/movements: no chain, stockRoutes.js:103-108 | LATENT | TP-3 |
| 57 | `stockController.js:1051` | `query.branch` | GET /stock/movements/product/:productId: param only, stockRoutes.js:121-128 | LATENT | TP-3 |
| 58 | `stockController.js:1058` | `query.branch` | GET /stock/movements/product/:productId: param only, stockRoutes.js:121-128 | LATENT | TP-3 |
| 59 | `stockController.js:1108` | `query.type/dates` | GET /stock/movements/branch/:branchId: param only, stockRoutes.js:131-139 | LATENT | TP-3 |
| 60 | `stockController.js:1115` | `query.type/dates` | GET /stock/movements/branch/:branchId: param only, stockRoutes.js:131-139 | LATENT | TP-3 |
| 27 | `supplierController.js:110` | `whole req.body` | PUT /suppliers/:id: chain validates named fields only, supplierRoutes.js:29-32 | TRUE POSITIVE | TP-2 |
| 171 | `userController.js:68` | `query.search (regex)` | GET /users: full chain, query('search').trim() userRoutes.js:18-45 | FALSE POSITIVE | FP-A |
| 42 | `userController.js:74` | `query.search (regex)` | GET /users: full chain, query('search').trim() userRoutes.js:18-45 | FALSE POSITIVE | FP-A |
| 45 | `userController.js:128` | `body.branch` | POST /users: body('branch').optional().isMongoId() userRoutes.js:69-71 | FALSE POSITIVE | FP-A |
| 46 | `userController.js:212` | `body.branch` | PUT /users/:id: body('branch').optional({values:'null'}).isMongoId() userRoutes.js:94-96 | FALSE POSITIVE | FP-A |

### 13.4 What the triage does not cover

The alert list is not a complete list of the unconstrained sites. Five of the
eight unescaped `$regex` sites in GAP-015a carry no alert at all: CodeQL
reports at the query sink, and the `getBranches` and `getSuppliers` sinks were
not flagged. Fixing only what the Security tab lists would leave them open.

Dismissing the 24 FP-A alerts in the Security tab is a human action and is not
part of any gap. Expect the TP and LATENT alerts to stay open after GAP-015b
lands: CodeQL will not recognise a hand-written guard as a barrier. The
measure of that gap is the behaviour, not the alert count.

---
## 14. Self-Audit Note

I re-read the deliverable against the Quality Bar and made the following changes.

**Revised: 1 finding, materially.** A subagent reported the entire `mobile-app`
tree as untracked in git, with only the two design documents committed, and rated
it a critical project risk on the grounds that a `git clean` would destroy the
scaffold. I checked it and the framing was wrong. `mobile-app` is committed on
`origin/master` with 37 files; the working checkout only appeared to lack them
because local `master` was 8 commits behind the merge that added them. I verified
the working copies are byte-identical to `origin/master` except one document. The
finding was rewritten from "the scaffold exists only in the working tree" to
GAP-035, a workspace-staleness and branch-hygiene issue, and the severity dropped
from critical to moderate. This also caused me to re-baseline the whole audit onto
`origin/master`, because the same 8 commits changed ten model files that other
findings cited by line number.

**Corrected: line numbers across one subsystem.** Every citation into
`backend/src/models/` was re-verified against `origin/master` after the
re-baseline. The `pre('save')` hooks had moved when they were converted off the
`next` callback. Citations that had shifted were corrected against the file as it
now stands.

**Dropped: roughly 20 findings, as padding or duplication.** The six audit passes
produced about 120 raw findings. I merged aggressively on the root-cause rule:
the reservation leak, the TOCTOU oversell, the lost update and the partial
deduction were reported separately by two passes and became GAP-014 and GAP-046;
seven separate unescaped-regex sites became one GAP-015, which the 2026-09-07
triage later corrected to eight sites and split into four entries; eight documentation
contradictions became one GAP-052; four cache defects became GAP-031 and GAP-048.
I dropped the mobile app's 44 absent features to a single paragraph in section 11
rather than writing 44 `FEAT` entries for an app whose own README says it has no
features yet, and I moved the dead `dark:` classes, the dead guard HOCs, the dead
Zod validators, the Modal focus trap, and the design-constraint violations to
section 11 with the reason each was not raised.

**Upgraded: 1 confidence rating.** The branch-protection check-name mismatch was
reported C2. I read both `.github/branch-protection.json` and the two job
definitions in `security.yml` directly and confirmed the static `name:` keys, so
GAP-011 is C1.

**Not resolved, and stated as such.** Two subagent findings I could not verify to
C1 are carried at their reported confidence rather than promoted: the service
worker's cross-origin caching (GAP-030, C2, because the evidence is the generated
`sw.js` and Serwist's published `defaultCache` composition, not a runtime
observation) and the tax-ordering question (GAP-029, C2 on the arithmetic, with
the correctness question handed to a human). One further subagent finding, a
possible path traversal in `deleteImageFile` on Windows hosts, was reported at C3
and is not in this document at all: the chain depends on `validator.js`'s `isURL`
accepting a backslash in the path component, which neither the agent nor I
confirmed. It belongs in Deferred as a hypothesis, and the way to confirm it is a
single unit test against `isURL`.

**Confirmations required before returning.**

- [x] Every gap has a unique ID, at least one cited location, and all six scores.
- [x] The master index is sorted by priority descending and the arithmetic was recomputed for each row.
- [x] No dependency is ordered after its dependent; all four dependency edges run in the correct direction and no override was needed.
- [x] Every wave in section 8 lists its members' file paths, and the two same-file pairs inside Wave 5 are called out as serialised rather than parallel.
- [x] Every checklist item is a single action naming the file it touches.
- [x] Every AGENT-READY entry has `Open questions: None`. The five HUMAN-FIRST entries and the eight AGENT-ASSISTED entries each carry a real question.
- [x] Every CONTRA entry names both positions with quoted evidence and states who decides.
- [x] The JSON appendix has 57 objects whose ids, scores, dependencies and titles match the prose entries.
- [x] Counts in the metadata block match the actual entries: 57 total; S1 8, S2 34, S3 15, S4 0; CODE 20, SEC 17, OPS 9, FEAT 4, TEST 2, CONTRA 3, PROJ 2. The metadata block itself still reads 52 and is deliberately left as first written; section 0 records the change.
- [x] S1 findings are 8 of 57, or 14.0%, inside the 15% calibration ceiling.

**One caveat on my own confidence.** I read about 62% of the source and executed
none of it. The largest unread surface is the frontend, which also has no tests,
so the true defect count there is almost certainly higher than the 14 frontend
gaps listed. Treat the frontend section of this document as a sample, not a
census.
