# Deployment

Manual, environment-selectable deploys to a self-hosted Linux VPS, driven from the GitHub Actions
tab. Nothing deploys automatically — there is no trigger on push.

## Branch model

| Branch | Role | Deploys to |
|---|---|---|
| `master` | default branch, production | `production` |
| `staging` | integration | `staging` |

`.github/workflows/deploy.yml` refuses to deploy `production` from anything but `master`, and
`staging` from anything but `staging`. The guard runs before checkout, so a wrong pairing costs
seconds rather than shipping the wrong code.

CI (`ci.yml`) and the security gates (`security.yml`) run on push and pull request for **both**
branches.

## One VPS, two stacks

Staging and production run side by side on the same host. They are kept apart by two things:

- **Compose project name** — the workflow passes `-p talyer-staging` or `-p talyer-production`,
  which namespaces containers, networks, and the `mongo-data` / `redis-data` / `backend-uploads`
  volumes. The two environments never share a database.
- **Published host ports** — supplied by `docker-compose.staging.yml` (frontend 3001, backend 5001)
  and `docker-compose.production.yml` (frontend 3000, backend 5000). The base `docker-compose.yml`
  publishes nothing on its own.

To split the environments onto separate VPSes later, register a second runner with a distinguishing
label and change `runs-on` in the deploy job. Nothing else in the pipeline assumes co-location.

## Setting up the runner

On the VPS, as a non-root user that is a member of the `docker` group:

```bash
# GitHub → repo → Settings → Actions → Runners → New self-hosted runner
# Follow the generated commands, then install it as a service so it survives reboots:
sudo ./svc.sh install
sudo ./svc.sh start
```

The runner needs Docker with the Compose v2 plugin, and `curl`. It does **not** need Node.js — the
deploy job only shells out to `docker compose`.

Only the `deploy` job runs on the self-hosted runner. The `security` job deliberately runs on
`ubuntu-latest`: it audits dependencies and builds throwaway images to scan, needs nothing from the
VPS, and running two image builds on the box that is serving production would compete with the live
app at exactly the wrong moment.

## Environments and configuration

Create two GitHub Environments — `staging` and `production` — under Settings → Environments. The
deploy job selects one via `environment: ${{ inputs.environment }}`, so each gets its own values.
Attach a required reviewer to `production` if you want a human approval step before it runs.

Secrets are passed to Compose through the job's process environment. **No `.env` file is ever
written on the runner.**

### Secrets (Settings → Environments → *env* → Secrets)

| Name | Notes |
|---|---|
| `JWT_SECRET` | Long random string. Compose aborts if unset. |
| `JWT_REFRESH_SECRET` | Different long random string. Compose aborts if unset. |
| `MONGO_INITDB_ROOT_PASSWORD` | Mongo root password for this environment. |
| `MONGODB_URI` | Full connection string — see the trap below. |
| `SEED_ADMIN_EMAIL` | Bootstrap admin login. Optional after first boot. |
| `SEED_ADMIN_PASSWORD` | At least 6 characters. Optional after first boot. |

### Variables (same screen → Variables)

| Name | Example (staging) |
|---|---|
| `MONGO_INITDB_ROOT_USERNAME` | `talyer` |
| `REDIS_URL` | `redis://redis:6379` |
| `JWT_EXPIRE` | `7d` |
| `JWT_REFRESH_EXPIRE` | `30d` |
| `CLIENT_URL` | `https://staging.example.com` |
| `CORS_ALLOWED_ORIGINS` | `https://staging.example.com` |
| `BACKEND_URL` | `https://staging-api.example.com` |
| `TRUST_PROXY` | `1` behind one reverse proxy, `0` if exposed directly |
| `NEXT_PUBLIC_API_URL` | `https://staging-api.example.com/api` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://staging-api.example.com` |
| `NEXT_PUBLIC_IMAGE_HOST` | `https://staging-api.example.com` |
| `SEED_ADMIN_NAME` | Optional; defaults to a generic administrator name |

Three easy mistakes, all of which produce a working-looking app that misbehaves:

- **`NEXT_PUBLIC_API_URL` must end in `/api`.** The backend mounts every router under `/api` while
  the frontend requests unprefixed paths.
- **`NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_IMAGE_HOST` must NOT end in `/api`.** They build
  image URLs against `/uploads`; with the suffix you get `/api/uploads/...`, which 404s.
- **`TRUST_PROXY` must match the real number of proxy hops.** At `0` behind a proxy,
  `express-rate-limit` sees the proxy's address for every client and buckets them all together —
  ten failed logins from anyone locks out everyone.

### The `MONGODB_URI` trap

`MONGODB_URI` is a separate secret and is **not** derived from `MONGO_INITDB_ROOT_USERNAME` and
`MONGO_INITDB_ROOT_PASSWORD`. If you change the Mongo password without updating the URI, Mongo
starts fine and the backend cannot authenticate. Change both together. The URI must point at the
`mongo` service name, not `localhost`:

```
mongodb://<user>:<password>@mongo:27017/talyer-e-inventory?authSource=admin
```

## First-run admin seeding

A fresh deployment has an empty database and no way in: public registration only ever creates a
`customer`, and creating staff requires an existing admin. `backend/src/utils/seedAdmin.js` closes
that gap on startup.

Behavior, in order:

1. If `SEED_ADMIN_EMAIL` or `SEED_ADMIN_PASSWORD` is missing, it does nothing. This is the normal
   case locally and under test — absence is never an error.
2. If **any** user with role `admin` already exists, it skips. Restarts, redeploys, and extra
   replicas never create a second admin, reset a password, or touch an existing account.
3. Otherwise it creates the admin. Admins need no branch assignment.

Every failure path is non-fatal — a malformed email, a too-short password, or a lost race against a
concurrently starting replica is logged and skipped, and the server still starts. The password is
never logged, on any path.

Once the first deploy has succeeded and you have logged in, remove `SEED_ADMIN_PASSWORD` from the
environment. Leaving a live admin password in CI configuration has no upside after bootstrap.

## Deploying

Actions → **Deploy** → *Run workflow*:

- **Use workflow from** — pick the branch. It must match the environment (`master` → production,
  `staging` → staging).
- **Environment to deploy** — `staging` or `production`.
- **Run dependency audit and image scan before deploying** — checked by default. Unchecking skips
  the whole `security` job.

When the box is checked, a failing security job **blocks** the deploy. When it is unchecked, the
deploy proceeds. This is deliberate: the checkbox is the escape hatch for an urgent hotfix, and
unchecking it is visible in the run history.

Note that the Trivy image scan inside that job is reporting-only — it uploads findings to GitHub
code scanning but does not fail the job, matching `security.yml`. What actually blocks a deploy is
`npm audit --audit-level=high` failing, or either image failing to build. Base-image CVEs are
frequently unfixable upstream, and failing every deploy on them would make the gate something
people route around permanently.

The deploy itself runs `docker compose up -d --build --remove-orphans` with the environment's
overlay, then polls the backend's `/health` until it answers. The port is read back from Compose
rather than hardcoded, so editing an overlay cannot silently break the check. If health never comes
up, the job fails and prints `docker compose ps` plus the last 200 log lines.

`concurrency` is keyed per environment, so two deploys of the same environment cannot interleave —
but staging and production can deploy simultaneously.

## Known limitation: product images

Product image URLs are absolute and built from `BACKEND_URL`. If that points at `localhost`, the
Next.js image optimizer inside the frontend container resolves it to the frontend itself, and Next
blocks loopback addresses anyway (`images.dangerouslyAllowLocalIP` defaults to `false`).
`/_next/image` then returns `400` and no product image renders; everything else works.

For a real deployment this resolves itself as long as `BACKEND_URL` and `NEXT_PUBLIC_IMAGE_HOST`
are a real hostname the browser and the frontend container can both reach — a reverse proxy in
front of both services. Do not set `dangerouslyAllowLocalIP` on anything reachable from an
untrusted network; the flag exists because it turns the optimizer into an SSRF primitive.

## Rollback

Deploys build from a branch, so rolling back means deploying an earlier commit:

```bash
git checkout master
git revert <bad-commit>   # or reset to a known-good commit and force-push if that is your policy
git push
```

Then re-run the Deploy workflow. Named volumes survive `up -d --build`, so application data is not
affected by a redeploy. `docker compose -p talyer-<env> down -v` **destroys that environment's
database** — it is not part of any workflow, and should not be.
