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

## How an environment reaches its box

The deploy job targets `runs-on: [self-hosted, linux, "${{ inputs.environment }}"]` — **the
environment name is the runner label**. Register the production VPS's runner with the label
`production` and the staging VPS's with `staging`, and each deploy lands on the right machine with
no workflow change. If you ever want both environments on a single box instead, give that one
runner *both* labels; the same workflow handles it.

Two further layers keep the stacks apart, which matter on a shared box and are harmless on
dedicated ones:

- **Compose project name** — the workflow passes `-p talyer-staging` or `-p talyer-production`,
  which namespaces containers, networks, and the `mongo-data` / `redis-data` / `backend-uploads`
  volumes. The two environments never share a database.
- **Published host ports** — supplied by `docker-compose.staging.yml` (frontend 3001, backend 5001)
  and `docker-compose.production.yml` (frontend 3000, backend 5000). The base `docker-compose.yml`
  publishes nothing on its own; `docker-compose.override.yml` restores 3000/5000 for plain local
  `docker compose up`, and the deploy workflow's explicit `-f` list excludes it.

On a dedicated staging box nothing else is competing for 3000/5000, so you may edit
`docker-compose.staging.yml` to use them if you prefer the two environments to look identical. The
deploy job reads the published port back from Compose rather than assuming one, so the health check
follows whatever you choose.

## Self-hosted runners on a public repository

This repository is **public**, and GitHub's own guidance is to avoid self-hosted runners on public
repos: a fork can open a pull request whose workflow executes on your machine.

What keeps this setup safe is that `deploy.yml` is `workflow_dispatch` only — it cannot be
triggered by a pull request, from a fork or otherwise. Every workflow that *does* respond to
`pull_request` (`ci.yml`, `security.yml`, `dependabot-auto-merge.yml`) runs on GitHub-hosted
`ubuntu-latest`.

**Never add `self-hosted` to a workflow on this repo that triggers on `pull_request` or
`pull_request_target`.** That single change would let anyone on the internet run code on your
production server. If that is ever needed, make the repository private first.

Two hardening steps worth taking on the box itself: run the runner as a dedicated unprivileged user
that owns nothing but its own work directory, and remember that membership in the `docker` group is
equivalent to root on that host — so treat the runner user as a privileged account and do not reuse
it for anything else.

## Setting up a runner

Do this once per box. The only difference between the production and staging boxes is the label.

**1. Docker, as root.** The runner needs Docker with the Compose v2 plugin and `curl`. It does
**not** need Node.js — the deploy job only shells out to `docker compose`.

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version          # must print v2.x
```

**2. A dedicated runner user, as root.** Do not run the runner as root, and do not reuse an
existing application user. Note that `docker` group membership is effectively root on this host.

```bash
adduser --system --group --shell /bin/bash --home /opt/actions-runner runner
usermod -aG docker runner
```

**3. Register the runner**, as that user. Get the download URL and token from
GitHub → repo → Settings → Actions → Runners → **New self-hosted runner** (Linux x64) — the token
is single-use and expires in about an hour.

```bash
sudo -iu runner
cd /opt/actions-runner
curl -o actions-runner.tar.gz -L <URL from the GitHub page>
tar xzf actions-runner.tar.gz

./config.sh \
  --url https://github.com/JohnFilhmar/talyer-e-inventory \
  --token <TOKEN from the GitHub page> \
  --name prod-runner \
  --labels self-hosted,linux,production \
  --work /opt/actions-runner/_work \
  --unattended --replace
```

The `--labels` value is what routes deploys to this box. Use `production` on the production VPS and
`staging` on the staging one — `self-hosted` and `linux` are added automatically, but listing them
is harmless and makes the intent obvious.

**4. Install it as a service** so it survives reboots. Back as root, from the same directory:

```bash
cd /opt/actions-runner
./svc.sh install runner
./svc.sh start
./svc.sh status
```

**5. Confirm** it shows as *Idle* under Settings → Actions → Runners with the expected label.

### Where the code and data actually live

`actions/checkout` clones into the runner's work directory (`/opt/actions-runner/_work/...`), and
that is where `docker compose` runs from. Application state does **not** live there — it is in the
Docker named volumes, which survive redeploys and are unaffected by the workspace being wiped.

So there is no need to place the repository under `/var/www` or anywhere else. If you want the
checkout in a specific path anyway, pass it to `--work` at registration time.

Only the `deploy` job runs on the self-hosted runner. The `security` job deliberately runs on
`ubuntu-latest`: it audits dependencies and builds throwaway images to scan, needs nothing from the
VPS, and running two image builds on the box that is serving production would compete with the live
app at exactly the wrong moment.

## Environments and configuration

Create two GitHub Environments — `staging` and `production` — under Settings → Environments. The
deploy job selects one via `environment: ${{ inputs.environment }}`, so each gets its own values.
Attach a required reviewer to `production` if you want a human approval step before it runs.

**Also set each Environment's "Deployment branches and tags" rule** — `production` → `Selected
branches and tags` → `master`; `staging` → `Selected branches and tags` → `staging`. This is the
durable version of the branch/environment pairing check: it is enforced by GitHub server-side
before the job is even allowed to start, so — unlike the in-job "Guard branch/environment pairing"
step, which only reads `github.ref_name` into a shell script — it cannot be bypassed by a
maliciously-crafted branch name. Treat the Environment rule as the real control and the in-job
guard as defense in depth / a fast, readable failure message.

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

**`MONGODB_URI` and `MONGO_INITDB_ROOT_PASSWORD` fail open, unlike `JWT_SECRET`.**
`docker-compose.yml` gives `JWT_SECRET` and `JWT_REFRESH_SECRET` a `:?...is required` default,
which aborts `up` if either is unset. `MONGODB_URI` and `MONGO_INITDB_ROOT_PASSWORD` instead use
`:-` defaults (`mongodb://talyer:change-me@mongo:27017/...` and `change-me` respectively) — see
[docker-compose.yml](../docker-compose.yml). Forgetting to set either of these two secrets in the
Environment does **not** fail the deploy: Compose silently falls back to the hardcoded default
credential and the stack comes up looking healthy, on a database anyone who has read this file can
authenticate to. This is deliberate compose behavior that this branch does not change — always set
both explicitly per environment before the first real deploy.

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

`concurrency` is keyed per environment, so two deploys of the same environment cannot interleave.
Staging and production do **not** actually deploy simultaneously in practice, though: both jobs
target the same single self-hosted runner (`runs-on: [self-hosted, linux]`), so a staging deploy
and a production deploy dispatched around the same time serialize on runner availability regardless
of the per-environment concurrency key. Two dispatches queue one after another rather than running
in parallel.

## Migrating from an older stack name

If a stack from before this pipeline existed is already running on the VPS under the old
`talyer-e-inventory` Compose project name (i.e. `docker compose` was run there without `-p`), the
first `-p talyer-production` deploy does **not** adopt it. Compose project name namespaces
volumes too, so `-p talyer-production` creates brand-new, empty `mongo-data` / `redis-data` /
`backend-uploads` volumes rather than reusing the old stack's data — and then fails at `up` with a
port conflict on 3000/5000, because the old containers are still bound to those host ports.

Before the first deploy under the new pipeline: stop and remove the old stack
(`docker compose -p talyer-e-inventory down`, **without** `-v` if you need the data), and if that
old stack holds real data, migrate it into the new project's volumes (e.g. `docker run --rm -v
talyer-e-inventory_mongo-data:/from -v talyer-production_mongo-data:/to alpine cp -a
/from/. /to/` for each volume, adjusting names to match `docker volume ls`) before running the new
volumes for the first time.

## Disk usage: no image pruning

Every deploy runs `docker compose up -d --build`, which rebuilds both images on the VPS from
scratch each time. Old, now-unreferenced image layers are not cleaned up by anything in this
pipeline, so disk usage on the runner creeps upward with every deploy. There is no cron or
post-deploy step doing this today. Add one — either a periodic `docker image prune -f` (or
`docker system prune -f` if build cache growth is also a problem) on a cron on the VPS, or a final
step in the `deploy` job that runs it after a successful health check — before disk pressure
becomes an outage.

## Putting it behind nginx

The production overlay binds both ports to `127.0.0.1`, so the stack is reachable only through a
reverse proxy on the same host. **Deploy that overlay only once nginx is actually proxying** — do it
earlier and the app looks down.

Use **one domain**, path-routed, rather than `app.` + `api.` subdomains. The refresh cookie is
`SameSite=Strict` in production, and a single origin makes it unambiguously first-party; it also
means the browser never makes a cross-origin request, so the CORS allowlist stops being something
that can break login.

A ready-to-edit site file is at [docs/nginx/talyer-production.conf](nginx/talyer-production.conf).
Three things in it are load-bearing:

- **`/uploads/` must be proxied to the backend.** `server.js` mounts `express.static` at `/uploads`,
  outside the `/api` prefix. Route only `/api` and every product image 404s.
- **`client_max_body_size 10m`.** multer accepts 5 MB images; nginx defaults to 1 MB and would
  reject them with a 413 before the app ever sees the request.
- **`X-Forwarded-For` and `X-Forwarded-Proto`.** With `TRUST_PROXY=1`, Express derives `req.ip` from
  the former, which is what `express-rate-limit` keys on. Omit it and every client shares one
  bucket.

```bash
sudo apt install -y nginx
sudo cp docs/nginx/talyer-production.conf /etc/nginx/sites-available/talyer
sudo sed -i 's/REPLACE_ME.example.com/your.domain/' /etc/nginx/sites-available/talyer
sudo ln -sf /etc/nginx/sites-available/talyer /etc/nginx/sites-enabled/talyer
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain
```

certbot rewrites the port-80 block and fills in the certificate paths. Renewal is installed as a
timer; check it with `systemctl list-timers | grep certbot`.

### Update the environment after the domain is live

In the `production` GitHub Environment:

| Variable | Value |
|---|---|
| `CLIENT_URL` | `https://your.domain` |
| `CORS_ALLOWED_ORIGINS` | `https://your.domain` |
| `BACKEND_URL` | `https://your.domain` |
| `NEXT_PUBLIC_API_URL` | `https://your.domain/api` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://your.domain` |
| `NEXT_PUBLIC_IMAGE_HOST` | `https://your.domain` |
| `TRUST_PROXY` | `1` |

The three `NEXT_PUBLIC_*` values are **inlined at build time**, so changing them has no effect until
you re-run the Deploy workflow. A deploy that predates the change will keep calling `localhost`.

Note this also resolves the product-image limitation below: once `BACKEND_URL` is a real HTTPS
hostname the browser and the frontend container can both reach, the Next.js optimizer stops
rejecting it.

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
