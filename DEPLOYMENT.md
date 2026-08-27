# Deployment

**Target:** Railway (backend) + Vercel (frontend), with MongoDB Atlas and
Upstash Redis as managed dependencies.

Both platforms terminate TLS and route traffic themselves, so there is no
reverse proxy in this architecture. `infra/` is the local development stack
only — see [`infra/README.md`](infra/README.md).

Deploy in the order below. Steps 4 and 5 are the two migrations that have only
ever been run against a local database; skipping either leaves the app running
but visibly wrong.

---

## 1. Environment variables

### Backend (Railway)

| Variable | Secret | Value | Notes |
|---|:--:|---|---|
| `MONGODB_URI` | **yes** | `mongodb+srv://…/collab-editor` | Atlas SRV string, password embedded |
| `REDIS_URL` | **yes** | `rediss://default:…@….upstash.io:6379` | Note `rediss://` — TLS |
| `JWT_SECRET` | **yes** | 64+ random hex chars | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CLIENT_URL` | no | `https://your-app.vercel.app` | Exact frontend origin, no trailing slash |
| `NODE_ENV` | no | `production` | **Required** — see below |
| `PORT` | no | *(leave unset)* | Railway injects it |
| `JWT_EXPIRES` | no | `7d` | Default is `7d` |
| `RATE_LIMIT_MAX` | no | `1000` | Default; raise for a large shared-NAT user base |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | 15 minutes |

`NODE_ENV=production` is not cosmetic: `errorHandler` returns the stack trace in
the JSON body when it is anything else.

`CLIENT_URL` is used for **both** the REST CORS origin and the Socket.io CORS
origin. If it does not exactly match the browser's origin, the WebSocket
handshake fails and the editor never syncs — while REST may appear to work. It
is also the base for generated share links, so a wrong value produces links
pointing at the wrong host.

The server refuses to start without `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` or
`CLIENT_URL` (`server/src/config/env.js`) — a missing one is a failed boot, not
a silent misconfiguration.

> **Vercel preview deployments** get their own origins
> (`…-git-branch-….vercel.app`) which will not match `CLIENT_URL`, so previews
> cannot talk to the production backend. Either point previews at a separate
> backend or accept that only the production origin works.

### Frontend (Vercel)

| Variable | Secret | Value |
|---|:--:|---|
| `VITE_API_URL` | no | `https://<railway-app>.up.railway.app/api` |
| `VITE_WS_URL` | no | `https://<railway-app>.up.railway.app` |

Vite **inlines these at build time**. They must exist in Vercel's build
environment before the build runs; setting them afterwards changes nothing until
you redeploy. Neither is secret — both ship inside the JavaScript bundle, so
never put a key in a `VITE_` variable.

`VITE_WS_URL` takes the `https://` origin, not `ws://`; Socket.io negotiates the
upgrade itself.

Build settings: root directory `client`, build command `npm run build`, output
directory `dist`.

---

## 2. Node version

The server is CommonJS and `require()`s `shared/ot`, which is an ESM package.
`require(ESM)` is only unflagged from **Node 22.12**; on Node 20 the process
dies at startup with `ERR_REQUIRE_ESM` before serving a request.

`engines` in `package.json` is advisory and most platforms ignore it. The
authoritative pin for Railway is **`nixpacks.toml`** (`nixPkgs = ["nodejs_22"]`),
which its builder reads directly. `.nvmrc` (`22.12.0`) covers local development
and any platform that honours it.

**Verify it took effect** — do not assume:

```bash
railway run node -v          # expect v22.x
railway logs | head -20      # a wrong version fails here, at require()
```

Vercel needs no equivalent: the client is a static build and Vite supports
`^18 || >=20`. Set Node 22 in Vercel's project settings anyway so both halves
build on the same major.

---

## 3. Deploy the backend

Railway runs `npm start` from the repo root → `node server/src/index.js`.

Confirm the health endpoint before sending traffic:

```bash
curl -i https://<railway-app>.up.railway.app/health
```

`200 {"status":"ok","checks":{"mongo":"up","redis":"up"}}` means both
dependencies answered. **`503 {"status":"degraded",…}` names which one is
down** — the endpoint probes MongoDB and Redis rather than only reporting that
the process is alive, so a platform health check fails when a dependency is
unreachable instead of keeping a broken instance in rotation. Probes are bounded
at 2s, so a hung dependency returns 503 rather than hanging the check.

Point Railway's health check at `/health`.

---

## 4. Migration: collaborator roles  ⚠️ required

Converts `Document.collaborators` from `[ObjectId]` to
`[{ user, role, addedAt }]`. **Until this runs, "Shared with me" returns
nothing** — the query filters on `collaborators.user`, which does not exist on
unmigrated rows.

Everyone currently in the array becomes an `editor`, which matches the access
they already had.

```bash
railway run node server/scripts/migrate-collaborator-roles.js --dry-run   # inspect
railway run node server/scripts/migrate-collaborator-roles.js             # apply
```

Idempotent — safe to re-run; already-migrated rows are skipped.

---

## 5. Migration: indexes  ⚠️ required

```bash
railway run node server/scripts/sync-indexes.js
```

Mongoose creates new indexes but **never drops ones removed from a schema**, so
this is what makes the index changes real. It:

- adds the compound indexes the dashboard query needs — without them the list is
  a full collection scan plus an in-memory sort (measured: 5000 documents
  examined to return 100);
- drops the old `{title, content}` text index, which re-tokenised the **entire
  document body on every keystroke**;
- adds the `collaborators.user`, `starredBy` and `shareToken` indexes;
- drops the 90-day TTL that was deleting version history.

`syncIndexes()` drops and rebuilds, so run it in a maintenance window on a large
collection — queries relying on an index are unindexed while it rebuilds.

Verify:

```bash
railway run node -e "
require('dotenv').config();const m=require('mongoose');
(async()=>{await m.connect(process.env.MONGODB_URI);
console.log((await m.connection.db.collection('documents').indexes()).map(i=>i.name));
await m.disconnect();})()"
```

Expect `owner_1_status_1_updatedAt_-1`,
`collaborators.user_1_status_1_updatedAt_-1`,
`starredBy_1_status_1_updatedAt_-1`, `shareToken_1`, `title_text`.

---

## 6. Deploy the frontend

Deploy on Vercel with the variables from step 1, **after** the backend has a
stable URL. Then set `CLIENT_URL` on Railway to the Vercel origin and redeploy
the backend so CORS and the socket origin match.

The two services reference each other, so the first deploy is necessarily two
passes.

---

## 7. Post-deploy smoke checklist

Run in order; each depends on the previous.

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
REST works and the WebSocket handshake does not.

---

## Rollback

Both platforms keep previous deployments; roll back from their dashboards.

Neither migration has a down-script. The role migration is additive in effect
(old code reading the new shape simply finds no `collaborators` entries it
recognises), so **rolling the backend back past Phase 5 while the migration
stands will make sharing appear broken.** Roll the data back from an Atlas
snapshot if that becomes necessary.
