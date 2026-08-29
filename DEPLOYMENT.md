# Deployment

**Target:** Render (backend Web Service) + Vercel (frontend), with MongoDB Atlas
and Upstash Redis as managed dependencies.

Both platforms terminate TLS and route traffic themselves, so there is no
reverse proxy in this architecture. `infra/` is the local development stack
only — see [`infra/README.md`](infra/README.md).

Deploy in the order below. Steps 4 and 5 are the two migrations that have only
ever been run against a local database; skipping either leaves the app running
but visibly wrong.

---

## 1. Render service settings

Create a **Web Service** pointed at this repository.

| Setting | Value |
|---|---|
| Language / Runtime | `Node` |
| **Root Directory** | *(leave blank — repo root)* |
| **Build Command** | `npm ci --prefix server --omit=dev` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/health` |
| **Instance count** | `1` (see below — more than one breaks collaboration) |
| Auto-Deploy | your preference |

**Why the root directory stays blank.** Render uses the repo root's
`package.json` when one exists, and this repo has one. That is the right choice
here for a second reason: the server reaches the OT engine by relative path
(`server/src/services/otService.js` → `../../../shared/ot/operations.js`), so
`shared/` must be present alongside `server/`. Building from the repo root
guarantees that; setting Root Directory to `server/` would put the build one
level below the code it depends on.

The consequence is that Render's default `npm install` would install the *root*
package.json's dependencies — of which there are none. Hence the explicit
`--prefix server` build command. `npm start` at the root resolves to
`node server/src/index.js`.

`npm ci` (not `npm install`) is correct because lockfiles are committed. It
installs the exact tree the test suite passes against and fails loudly if a
lockfile and its manifest disagree, instead of silently re-resolving.

**Verified locally**, from a checkout containing only git-tracked files (no
`node_modules`): `npm ci --prefix server --omit=dev` installs 116 packages, and
`npm start` with `PORT=10000` boots and answers `/health` with
`{"status":"ok","checks":{"mongo":"up","redis":"up"}}`.

### Instance count must stay at 1

`@socket.io/redis-adapter` is not installed. The **edit stream** does fan out
across nodes — ops, per-user notifications and access revocations are published
to Redis and re-broadcast by every subscriber — but **presence does not**:
`presence:join` / `presence:leave` / cursor updates go out via `socket.to(room)`
on the default in-memory adapter, and `socket/rooms.js` is a per-process `Map`.

With two instances, two users on different nodes see each other's edits but not
each other's cursors, and each sees an incomplete collaborator list. See
"Running Multiple Instances" in the README for what lifting this would require.

### PORT

Render injects `PORT` (10000 by default). The server reads
`process.env.PORT ?? 4000` ([server/src/index.js:30](server/src/index.js#L30));
4000 is only a local fallback and is never used on Render. `server.listen(PORT)`
omits the host argument, so Node binds all interfaces, which is what Render
requires.

---

## 2. Environment variables

### Backend (Render)

| Variable | Secret | Value | Notes |
|---|:--:|---|---|
| `MONGODB_URI` | **yes** | `mongodb+srv://…/collab-editor` | Atlas SRV string, password embedded |
| `REDIS_URL` | **yes** | `rediss://default:…@….upstash.io:6379` | Note `rediss://` — TLS |
| `JWT_SECRET` | **yes** | 64+ random hex chars | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CLIENT_URL` | no | `https://your-app.vercel.app` | Exact Vercel origin, no trailing slash |
| `NODE_ENV` | no | `production` | **Required** — see below |
| `NODE_VERSION` | no | `22.12.0` | Redundant explicit pin — see step 3 |
| `PORT` | no | *(leave unset)* | Render injects it |
| `JWT_EXPIRES` | no | `7d` | Default is `7d` |
| `RATE_LIMIT_MAX` | no | `1000` | Default; raise for a large shared-NAT user base |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | 15 minutes |

`NODE_ENV=production` is not cosmetic: `errorHandler` returns the stack trace in
the JSON body when it is anything else.

`CLIENT_URL` is the **frontend** origin, not the backend's. It drives three
things at once: the REST CORS origin, the Socket.io CORS origin
([server/src/index.js:120](server/src/index.js#L120)), and the base for
generated share links. If it does not match the browser's origin exactly, the
**WebSocket handshake fails while REST keeps working** — the app loads, the
document opens, and nothing syncs. A wrong value also produces share links
pointing at the wrong host.

The server refuses to boot without `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` or
`CLIENT_URL` ([server/src/config/env.js](server/src/config/env.js)) — a missing
one is a failed deploy, not a silent misconfiguration.

> **Vercel preview deployments** get their own origins
> (`…-git-branch-….vercel.app`) which will not match `CLIENT_URL`, so previews
> cannot talk to the production backend. Either point previews at a separate
> Render service or accept that only the production origin works.

### Frontend (Vercel)

| Variable | Secret | Value |
|---|:--:|---|
| `VITE_API_URL` | no | `https://<service>.onrender.com/api` |
| `VITE_WS_URL` | no | `https://<service>.onrender.com` |

Both point at the **Render backend**, and `VITE_API_URL` keeps the `/api`
suffix while `VITE_WS_URL` does not — Socket.io connects to the origin. Use
`https://`, not `ws://`; Socket.io negotiates the upgrade itself. If you attach
a custom domain to the Render service, use that origin in both.

Vite **inlines these at build time**. They must exist in Vercel's build
environment before the build runs; setting them afterwards changes nothing until
you redeploy. Neither is secret — both ship inside the JavaScript bundle, so
never put a key in a `VITE_` variable.

Build settings: root directory `client`, build command `npm run build`, output
directory `dist`.

---

## 3. Node version

The server is CommonJS and `require()`s `shared/ot`, which is an ESM package.
`require(ESM)` is only unflagged from **Node 22.12**; on Node 20 the process
dies at startup with `ERR_REQUIRE_ESM` before serving a request.

Render's precedence is `NODE_VERSION` env var → `.node-version` → `.nvmrc` →
`package.json` engines. Two pins are in place:

- [`.nvmrc`](.nvmrc) contains `22.12.0` — an exact version, not a range.
- `engines` is `>=22.12.0 <23` in all three `package.json` files. The upper
  bound matters: Render resolves an unbounded range to the newest Node release,
  which would eventually cross a major version on its own.

Set `NODE_VERSION=22.12.0` in the Render dashboard as well. It is redundant with
`.nvmrc`, and that is the point — it is the highest-precedence pin and it is
visible in the dashboard next to the other settings.

**Verify it took effect.** Render's Shell is a paid-plan feature, so on the free
tier read the build log instead — it names the version explicitly:

```
==> Using Node.js version 22.12.0 via /opt/render/project/src/.nvmrc
```

A wrong version fails at `require()` during startup, so the runtime log is the
other tell. On a correct boot you will see this in the runtime log:

```
ExperimentalWarning: CommonJS module .../otService.js is loading ES Module
.../shared/ot/operations.js using require()
```

That warning is expected on 22.12 and is not an error — it is `require(ESM)`
working. Its absence, combined with an `ERR_REQUIRE_ESM` crash, means the pin
did not take.

The full suite (273 tests) has been run under Node 22.12.0 in a container and
passes, so the code is confirmed good on the pinned runtime. What that cannot
confirm is whether Render actually provisions 22.12 — check the build log.

Vercel needs no equivalent: the client is a static build and Vite supports
`^18 || >=20`. Set Node 22 in Vercel's project settings anyway so both halves
build on the same major.

---

## 4. Deploy the backend

Push, let Render build, then confirm the health endpoint before pointing the
frontend at it:

```bash
curl -i https://<service>.onrender.com/health
```

`200 {"status":"ok","checks":{"mongo":"up","redis":"up"}}` means both
dependencies answered. **`503 {"status":"degraded",…}` names which one is
down** — the endpoint probes MongoDB and Redis rather than only reporting that
the process is alive, so Render's health check pulls a broken instance out of
rotation instead of serving traffic it cannot fulfil. Probes are bounded at 2s,
so a hung dependency returns 503 rather than hanging the check.

On a free instance this first request may take 30–60s. See step 8.

### Verify `trust proxy`

`app.set("trust proxy", 1)` tells Express to trust exactly one hop, which is
what Render's router adds. This is the one setting that cannot be checked
locally: if the hop count is wrong, `req.ip` is a proxy address and
`express-rate-limit` puts **every user in one bucket**.

Test it from two different networks (e.g. laptop on wifi, phone tethered to
cellular). The limiter emits standard headers, so:

```bash
curl -sI https://<service>.onrender.com/api/documents | grep -i ratelimit
```

Run it from network A twice, then from network B. `RateLimit-Remaining` should
decrement **independently** per network. If network B continues network A's
count, the hop count is wrong — raise `trust proxy` to `2` in
[server/src/index.js](server/src/index.js). Never set it to `true`: that trusts
a client-supplied `X-Forwarded-For` and lets anyone evade the limiter entirely.

---

## 5. Migration: collaborator roles  ⚠️ required

Converts `Document.collaborators` from `[ObjectId]` to
`[{ user, role, addedAt }]`. **Until this runs, "Shared with me" returns
nothing** — the query filters on `collaborators.user`, which does not exist on
unmigrated rows.

Everyone currently in the array becomes an `editor`, matching the access they
already had.

Render's free tier has no shell and no one-off jobs, so run these from your own
machine against the production Atlas URI. The scripts are ordinary MongoDB
clients; they do not need to run inside the deployed service:

```bash
cd server
MONGODB_URI='<production Atlas URI>' node scripts/migrate-collaborator-roles.js --dry-run
MONGODB_URI='<production Atlas URI>' node scripts/migrate-collaborator-roles.js
```

Run the `--dry-run` first and read its output. Idempotent — safe to re-run;
already-migrated rows are skipped.

> On a paid instance you can use the **Shell** tab in the Render dashboard and
> run `node server/scripts/migrate-collaborator-roles.js` there instead, which
> avoids putting the production URI in your local shell history.

---

## 6. Migration: indexes  ⚠️ required

```bash
cd server
MONGODB_URI='<production Atlas URI>' node scripts/sync-indexes.js
```

Mongoose creates new indexes but **never drops ones removed from a schema**, so
this is what makes the index changes real. It:

- adds the compound indexes the dashboard query needs — without them the list is
  a full collection scan plus an in-memory sort (measured: 5000 documents
  examined to return 100);
- drops the old `{title, content}` text index, which re-tokenised the **entire
  document body on every keystroke**;
- adds the `collaborators.user`, `starredBy` and `shareToken` indexes;
- adds the two workspace-filtered dashboard indexes
  (`{owner, workspace, status, updatedAt}` and the `collaborators.user`
  equivalent). Measured on 5000 documents, that query examines 14.9 documents
  per document returned without them and 1.0 with them. They are additive — the
  unfiltered indexes stay, because folding `workspace` into them gives the
  unfiltered dashboard an in-memory sort;
- drops the 90-day TTL that was deleting version history.

`syncIndexes()` drops and rebuilds, so run it in a maintenance window on a large
collection — queries relying on an index are unindexed while it rebuilds.

Verify:

```bash
MONGODB_URI='<production Atlas URI>' node -e "
const m=require('mongoose');
(async()=>{await m.connect(process.env.MONGODB_URI);
console.log((await m.connection.db.collection('documents').indexes()).map(i=>i.name));
await m.disconnect();})()"
```

Expect `owner_1_status_1_updatedAt_-1`,
`collaborators.user_1_status_1_updatedAt_-1`,
`owner_1_workspace_1_status_1_updatedAt_-1`,
`collaborators.user_1_workspace_1_status_1_updatedAt_-1`,
`starredBy_1_status_1_updatedAt_-1`, `shareToken_1`, `title_text`.

---

## 7. Deploy the frontend

Deploy on Vercel with the variables from step 2, **after** the Render service
has a stable URL. Then set `CLIENT_URL` on Render to the Vercel origin and
redeploy the backend so CORS and the socket origin match.

The two services reference each other, so the first deploy is necessarily two
passes.

---

## 8. Cold starts on the free instance ⚠️ read before demoing

A free Render Web Service **spins down after 15 minutes without inbound
traffic**, and the next request takes **30–60 seconds** while it wakes. This app
handles that worse than a plain CRUD app does, in three specific ways.

**First load after idle shows an error, not a spinner.** The axios client has
`timeout: 10_000` ([client/src/services/api.js:16](client/src/services/api.js#L16)),
which is shorter than the cold start. The request aborts before the service is
up. The dashboard catches it and shows the toast *"Could not load your
documents"* over an empty list. The user is **not** signed out — the response
interceptor only tears down the session on a `401` carrying
`code: "AUTH_REQUIRED"`, and an aborted request has no response at all — so a
reload once the service is warm works normally. But the first impression is a
failure state, and a visitor who does not retry simply sees a broken app.

**An open editor should keep the service awake.** Socket.io runs on engine.io's
default heartbeat (server pings every 25s, client replies with a pong), so an
open document tab produces inbound traffic well inside the 15-minute idle
window. This is the one claim here that has not been verified against a real
deploy — confirm it before relying on it.

**A dropped socket may not recover.** The client is configured with
`reconnectionDelay: 500` and `reconnectionAttempts: 10`
([client/src/services/socket.js:48](client/src/services/socket.js#L48)). With
Socket.io's default 5s backoff cap and ±50% jitter, ten attempts span roughly
**19–56 seconds** — the same magnitude as the cold start. If the service is
still waking when the tenth attempt fails, Socket.io gives up permanently.
Nothing re-establishes it: `sessionSocket.js` only reacts to *token* changes,
not to a dead socket. The user must reload the page.

If it does reconnect in time, recovery is clean and automatic:
[useSocket.js](client/src/hooks/useSocket.js) re-emits `doc:join` on every
`connect`, the server replies with `doc:load`, and `useOT` applies it and
restores the caret. Nothing is lost except operations that were never acked.

### Recommendation: the $7/month instance is worth it here

For a portfolio demo, yes — pay for it. The failure mode is not "slow", it is
"the reviewer opens your link, sees an error toast over an empty dashboard, and
closes the tab." That happens on *every* first visit after 15 minutes of quiet,
which for a portfolio project is essentially every visit.

The alternatives are all worse. A keep-alive pinger is out of scope here (and
against Render's free-tier terms). Raising the axios timeout past 60s would swap
the error toast for a minute-long blank screen and slow down every genuine
failure elsewhere in the app. Raising `reconnectionAttempts` helps the socket
case but not the first-load case. A paid instance removes the entire class of
problem for less than the cost of the domain.

If you stay on free: raise `timeout` in `api.js` to ~65s and
`reconnectionAttempts` to ~25, and expect the first load of a demo session to
take about a minute. Both are application changes, deliberately not made here.

---

## 9. Post-deploy smoke checklist

Run in order; each depends on the previous. On a free instance, load the app
once and wait for it to wake before starting.

1. **Log in.** Register a new account, confirm you land on the dashboard.
2. **Reload the page** (hard-reload, several times). You must stay signed in —
   this exercises the Phase 7.5 session-persistence fix. Being bounced to
   `/auth` means the persisted store is not rehydrating.
3. **Create a document.** Type; confirm the word count moves and the indicator
   goes "Saving…" → "Saved" (driven by the server ack, not a timer).
4. **Two browsers, one document.** Sign in as a second user in a different
   browser profile. Type in both at once and confirm text converges, both names
   appear in the presence roster, and both appear in version history. Press
   Enter in one and confirm the line break appears in the other.
5. **Share link, end to end.** Owner: Share → create link → copy. Second user:
   paste it into the "Open a shared link" box on the dashboard. Confirm they see
   the title and owner name **but not the content**, and can request access.
6. **Approve.** As owner, approve the request. The requester should be moved into
   the document **without refreshing**.
7. **Change a role.** Set the collaborator to viewer — their editor becomes
   read-only with the "View only" banner, without reconnecting. Set them back to
   editor and confirm they can type again.
8. **Export a PDF.** Use the download button; confirm the dialog's filename
   defaults to the document title and the output contains the rendered markdown
   with the app chrome hidden.

If step 4 fails but 1–3 pass, suspect a `CLIENT_URL` / `VITE_WS_URL` mismatch —
REST works and the WebSocket handshake does not. Check the browser console for a
CORS error on the Socket.io polling request.

---

## Rollback

Render keeps previous deploys: **Dashboard → the service → Deploys →** pick a
previous successful deploy → **Rollback** (paid), or **Manual Deploy → Deploy a
specific commit** on free. Vercel rolls back from its own Deployments tab.

Neither migration has a down-script. The role migration is additive in effect
(old code reading the new shape finds no `collaborators` entries it recognises),
so **rolling the backend back past the Phase 5 sharing work while the migration
stands will make sharing appear broken.** Restore from an Atlas snapshot if that
becomes necessary.
