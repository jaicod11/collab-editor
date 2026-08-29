# CollabDocs

**Live app → [collab-ediitor.vercel.app](https://collab-ediitor.vercel.app)**

A real-time collaborative document editor built on a custom **Operational
Transformation engine written from scratch** — no Yjs, no Automerge, no ShareDB.
Multiple people edit the same document simultaneously; concurrent edits are
transformed server-side so every replica converges on the same text.

The OT engine is the point of the project. Everything else — auth, sharing,
roles, version history — exists to put the engine under realistic load.

> **First load may take 30–60 seconds.** The backend runs on Render's free tier,
> which spins down after 15 minutes of inactivity. This is expected, not a
> failure. See [Known limitations](#known-limitations).

---

## Features

- **Real-time collaborative editing** — concurrent edits converge; the caret
  holds its position when remote operations rewrite the document around it.
- **Live presence and cursors** — remote collaborators appear as coloured
  carets, with a roster of who is in the document.
- **Markdown formatting** — a toolbar inserts markdown characters
  (`**bold**`, `_italic_`, `# heading`, `- list`) with a rendered preview
  toggle. Formatting syncs through OT like any other text; see
  [why the editor is plain text](#why-the-editor-is-plain-text).
- **Version history with restore** — an append-only operation log plus
  snapshots every 50 revisions, so any past revision can be reconstructed and
  restored.
- **Share by link with owner approval** — the owner generates a token link. A
  visitor opening it sees the title and owner but *not* the content, and can
  request access. Approval moves them into the document without a refresh.
- **Editor / viewer roles, enforced server-side** — a viewer's `op:submit` is
  rejected by the server, not merely hidden in the UI. Role changes take effect
  on connected sockets immediately.
- **Notifications** — a persisted, per-user feed for access requests,
  approvals, denials, role changes and revocations. Delivered live over the
  personal socket room so the bell updates without a refresh, and durable, so
  it survives a reload or a missed connection.
- **Starring**, and an **Active → Archived → Deleted** lifecycle with archive
  and trash views.
- **PDF export** via the browser's print pipeline, with the app chrome hidden
  and the filename defaulting to the document title.

---

## Architecture

Three packages. `shared/` is the important one: it is the single source of truth
for the OT algorithm, written as ESM and imported by **both** the browser and
the server, so the two sides cannot drift.

```
┌──────────────────────────────────────────────────────────┐
│  CLIENT  (React 18 + Vite, Vercel)                       │
│    EditorPage → EditorCore → CursorOverlay               │
│    useSocket · useOT · usePresence                       │
└───────────┬──────────────────────────┬───────────────────┘
            │ WebSocket (Socket.io)    │ REST (axios)
            ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│  SERVER  (Node 22 + Express + Socket.io, Render)         │
│    socketServer → documentHandler → otService            │
│                 → presenceHandler                        │
│    auth · documents · history · workspaces routes        │
└──────┬───────────────────────────────┬───────────────────┘
       │                               │
 ┌─────▼──────────┐            ┌───────▼────────────┐
 │  Redis         │            │  MongoDB Atlas     │
 │  (Upstash)     │            │  Documents         │
 │  document lock │            │  Operations (log)  │
 │  op cache      │            │  Snapshots         │
 │  pub/sub       │            │  Users             │
 │  sessions      │            │  AccessRequests    │
 │                │            │  Notifications     │
 └────────────────┘            └────────────────────┘
                    ▲
        shared/ot — imported by both sides
```

### The operation path

Every keystroke becomes an operation and takes this route
([`documentHandler.js`](server/src/socket/handlers/documentHandler.js)):

1. **Client submits** `op:submit { docId, op, revision }`, tagged with the
   tab's site id, and holds it as pending.
2. **Server authorises** — write access is checked per operation, and the op's
   shape is validated (`otService.validateOp`) before anything else happens.
3. **Lock** — an in-process FIFO queue serialises same-node submissions, wrapped
   in a Redis `SET NX PX` lock so the critical section holds across nodes.
4. **Catch up** — operations the client had not yet seen are read from the Redis
   op cache, falling back to the MongoDB operation log if the range has been
   trimmed.
5. **Transform** the incoming op against each missed op, in order.
6. **Apply** the transformed op, increment the revision.
7. **Persist** — the operation and the updated document are written to MongoDB
   and awaited *inside* the lock, then the Redis cache is refreshed.
8. **Ack** the submitting socket, then **publish** to Redis, which fans the
   broadcast out to every node's copy of the room.
9. **Release** the lock with a compare-and-delete.

Persistence sits inside the critical section deliberately. It lengthens the
lock, and the trade is that an `op:ack` means the operation is durable — a
client that has been acked never has to wonder whether its edit survived.

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3, Vite 5, Zustand 4.5, React Router 6 |
| Styling | Inline styles from per-file design-token objects; a small amount of Tailwind 3.4 for overlay and toast positioning |
| Editor | `contentEditable` with a plain-text invariant; `marked` + `DOMPurify` for preview |
| Real-time | Socket.io 4.7 + a from-scratch OT engine in `shared/ot/` |
| Backend | Node 22.12, Express 4.19, Mongoose 8.4 |
| Data | MongoDB Atlas; Redis (Upstash) for the lock, op cache, pub/sub and session fast path |
| Auth | JWT (`jsonwebtoken` 9), `bcryptjs`, `helmet`, `express-rate-limit` |
| Hosting | Vercel (client) + Render (server) |

---

## Engineering notes

### The OT engine and its correctness

The transform function is the part of this project most likely to be subtly
wrong, so it is tested as a mathematical property rather than by example.

An exhaustive sweep of the operation space — 36 operations (inserts and deletes
of varying length at every position in a 10-character document), every ordered
pair, **1,296 pairs** — initially failed **408 of them (31.5%)** on the TP1
convergence property. Three distinct defects were responsible:

1. **Overlapping deletes removed the union of both ranges.** Two users deleting
   overlapping spans each removed what the other had already removed, so the
   intersection was deleted twice and text either side was lost.
2. **An insert inside a concurrent delete range was duplicated or lost**,
   depending on which replica applied which order first.
3. **The insert/insert tie-break depended on argument order**, so
   `transform(a, b)` and `transform(b, a)` disagreed about which insert went
   first — the two replicas could not converge by construction.

All three are fixed and pinned by named regression tests
([`convergence.test.js`](shared/test/convergence.test.js)). The suite now runs:

| Sweep | Size | Failures |
|---|---|---|
| Exhaustive pair sweep (TP1) | 1,296 pairs | 0 |
| Cross-replica swapped sweep (two site ids) | 5,184 pairs | 0 |
| Randomised convergence fuzz | 5,000 + 5,000 pairs | 0 |
| Two-replica divergent op chains | 2,000 rounds | 0 |
| `transformAgainst` vs. a manual fold | 2,000 cases | 0 |

**The tie-break is a per-tab site UUID**, not the user id. One person with two
tabs open is two genuinely concurrent replicas; a shared user id would tie
forever and leave the ordering dependent on argument order again — defect (3)
by another route. The id lives in `sessionStorage`, which is per-tab and
survives a reload, which is exactly the lifetime required.

### Concurrency

The lock is exercised under deliberate contention
([`concurrency.test.js`](server/test/concurrency.test.js)): 8 sockets × 6
operations, **48 submissions all at the same base revision**, emitted with no
awaits between them. The test asserts all 48 acked, every operation present in
the final document *exactly once*, no `doc:error`, and the revision advanced by
exactly 48.

Lock release is a Lua compare-and-delete against a token unique to the
acquisition, so a holder can only ever release its own lock — an unconditional
`DEL` would let a process whose TTL had expired delete the *next* holder's lock.
The TTL is 10s and is a crash safety net, not the concurrency control; the queue
is.

### Why the editor is plain text

This is a design decision with a stated cost, not an unfinished feature.

The OT engine transforms operations over a flat string: `insert(pos, text)` and
`delete(pos, len)`, positions as character offsets. Formatting therefore has to
*be* characters. If bold were an attribute on a range, it would need its own
operation type and its own transform — so that two people bolding overlapping
ranges while a third deletes across them still converge. Markdown sidesteps that
entirely: formatting is text, so it flows through the existing transform with no
special handling, and a toolbar click is indistinguishable from typing.

The editor enforces the plain-text invariant rather than hoping for it. An
earlier version had a toolbar built on `document.execCommand`, which writes HTML
into the editable element; because the sync layer reads and writes
`textContent`, that formatting never entered the diff, never reached the server,
and was destroyed the moment anyone else's edit rewrote the element. Native
formatting paths are now blocked at `beforeinput`, and Ctrl/Cmd+B/I/U are
intercepted and insert markdown markers instead.

Document content is untrusted, so the preview renders through `marked` and is
sanitised with `DOMPurify`; raw HTML from a document is never rendered.

True WYSIWYG would mean replacing the plain-string operation type with an
attributed document model (a Quill delta or ProseMirror step), plus a matching
transform and storage format. That is a rewrite of the sync layer, not a change
in the view.

### Authentication

JWTs are signed with a `tokenVersion` claim, and the counter lives on the user
document in MongoDB. Logout, password change and account deletion bump it,
invalidating every outstanding token for that user.

Redis holds a session record as a **fast path**, and the record stores the
version it was created with. Verification compares the token's version against
the cached one, falling back to MongoDB when the session is missing or the
versions disagree. MongoDB is authoritative, so an evicted or flushed cache
costs one lookup rather than signing everyone out — and a fresh login cannot
resurrect a token that was already revoked.

When the session store is unreachable the middleware returns **503, not 401**.
The client tears down the session only on a 401 carrying `code:
"AUTH_REQUIRED"`, so a transient Redis outage cannot log the entire user base
out.

### Tests

**296 tests** across 21 files, all runnable locally:

| Package | Tests | Covers |
|---|---:|---|
| `shared` | 113 | Convergence sweeps, fuzz, batch/no-op handling, markdown helpers, newline behaviour, client sync bookkeeping |
| `client` | 94 | Socket/session wiring, the doc:join failure path, store rehydration on reload, share-link parsing, markdown sanitisation, PDF export naming |
| `server` | 89 | Lock primitives, concurrent admission, persistence, history coalescing, snapshot/restore, roles, sharing, presence, doc:error contract, notification scoping and creation |

Every server suite that touches a database boots the real server against the
local Docker stack, and refuses to run if `MONGODB_URI` or `REDIS_URL` is not
`localhost` — so a stray production URI in the environment aborts the run
instead of writing to it.

---

## Known limitations

**It must run as exactly one instance.** `@socket.io/redis-adapter` is not
installed. The *edit stream* genuinely is cross-node — operations, per-user
notifications and access revocations are published to Redis (`pSubscribe
doc:ops:*`) and re-broadcast by every subscribing node — but presence is not:
`presence:join` / `presence:leave` / cursor updates go out via
`socket.to(room)` on the default in-memory adapter, `socket/rooms.js` is a
per-process `Map`, and the post-restore `doc:load` broadcast is local too. With
two instances, users on different nodes would see each other's edits but not
each other's cursors, and each would see an incomplete collaborator list.

Lifting it would take: installing the Redis adapter and wiring it into
`initSocket()`; moving room membership into shared Redis state (an adapter alone
cannot fix per-process membership); and sticky sessions or websocket-only
transport so the handshake does not land on a different node mid-negotiation.

**Search matches titles only.** `content` was removed from the text index
because every `op:submit` rewrites `Document.content`, so MongoDB re-tokenised
the entire document body on every keystroke — write amplification that grew with
document length, and the most expensive thing on the edit path. Body search is a
real capability that was removed, not an oversight. Restoring it means
decoupling the searchable copy from the live one (Atlas Search fed
asynchronously, or a separate collection refreshed on the snapshot cadence).

**Plain text with markdown, not WYSIWYG** — see
[above](#why-the-editor-is-plain-text) for why, and what changing it would cost.

**Workspaces do not organise documents yet.** They exist as named, colour-coded
groups with an owner and members, with full CRUD and a sidebar UI — but
`Document` has no workspace reference and no document query filters by one. The
feature is the container, not the filing.

**Cold starts on the free tier.** Render spins the backend down after 15 minutes
idle; the next request takes 30–60 seconds. The client's HTTP timeout is shorter
than that, so the *first* load after an idle period shows an error toast over an
empty dashboard rather than a spinner. Reloading once the service is awake works
normally, and you are not signed out. An open editor tab produces socket
heartbeat traffic that should keep the service awake while it is open.

**Notifications are capped at 100 per user.** Beyond that the oldest are
trimmed as new ones arrive, and a document's notifications are deleted with the
document. There is deliberately no time-based expiry: a TTL quietly deleting
user-visible data on a clock nobody chose is the bug Phase 3 removed from
version history, and the same reasoning applies here. The consequence is that a
very active user can lose old notifications they had not read — bounded by their
own activity rather than by elapsed time.

**No E2E browser tests.** The suites cover the OT engine, the hooks and the
server; the assembled UI is verified by hand against the checklist in
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Local development

### Prerequisites

- **Node 22.12+** — required, not advisory. The server is CommonJS and
  `require()`s the ESM `shared/ot` package; `require(ESM)` is only unflagged
  from 22.12, and on Node 20 the process dies at startup with
  `ERR_REQUIRE_ESM`. `.nvmrc` pins `22.12.0`.
- **Docker** — for the local MongoDB and Redis stack.

### 1. Start the data stack

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

MongoDB runs as a single-node replica set on `127.0.0.1:27018` (a replica set
even for one node, because transactions and change streams need one); Redis on
`127.0.0.1:6380`. See [`infra/README.md`](infra/README.md) — this stack is for
local development only and is not what production runs.

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill them in by following the comments in each `.env.example`. The server
refuses to boot without `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` and
`CLIENT_URL`. Note that `VITE_` variables are inlined into the client bundle at
build time and are therefore never secret.

### 3. Install and run

```bash
npm ci --prefix server && npm run dev --prefix server   # http://localhost:4000
npm ci --prefix client && npm run dev --prefix client   # http://localhost:5173
```

Use `npm ci`, not `npm install` — lockfiles are committed so that local, CI and
deployed trees match.

### 4. Tests

```bash
npm test                    # all 273, in order: shared → client → server
npm run test:ot             # shared/ — convergence sweeps and fuzz
npm run test:client         # client/
npm run test:persistence    # server/ — needs the Docker stack running
```

### Project structure

```
collab-editor/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── components/      # Editor, Layout, UI
│       ├── hooks/           # useSocket, useOT, usePresence, useDocument
│       ├── lib/             # PDF export, share links, re-export shim for shared/ot
│       ├── pages/           # Route components
│       ├── services/        # axios instance, socket singleton, session↔socket wiring
│       └── store/           # Zustand slices
│
├── server/                  # Node + Express backend
│   ├── src/
│   │   ├── config/          # env validation, Mongo and Redis connections
│   │   ├── controllers/     # auth, document, share, history, notification, workspace
│   │   ├── middleware/      # JWT auth, rate limiting, error handling
│   │   ├── models/          # User, Document, Operation, Snapshot, AccessRequest,
│   │   │                    #   Notification, Workspace
│   │   ├── routes/
│   │   ├── services/        # otService, lockService, sessionService, snapshotService, …
│   │   └── socket/          # socketServer, document/presence handlers, rooms
│   ├── scripts/             # one-off migrations
│   └── test/
│
├── shared/                  # OT engine — one source of truth, ESM, both sides
│   ├── ot/                  # operations, client-sync, diff, markdown
│   └── test/
│
└── infra/                   # local dev stack only
```

---

## Deployment

Render (backend) + Vercel (frontend), with MongoDB Atlas and Upstash Redis.
Full runbook — service settings, environment variables, the two required
migrations, the Node pin, cold starts, and a post-deploy smoke checklist — is in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## License

MIT — see [LICENSE](LICENSE).
