<div align="center">
  <h1>📝 CollabDocs</h1>
  <p><strong>A high-performance, real-time collaborative document editor.</strong></p>
  
  ![Status](https://img.shields.io/badge/Status-Active-green?style=for-the-badge)
  ![Node](https://img.shields.io/badge/Node.js-v20+-brightgreen?style=for-the-badge&logo=node.js)
  ![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)
  ![Socket.io](https://img.shields.io/badge/Socket.io-4.7-black?style=for-the-badge&logo=socket.io)
  ![MongoDB](https://img.shields.io/badge/MongoDB-Ready-success?style=for-the-badge&logo=mongodb)
</div>

---

## 📖 About The Project

**CollabDocs** is a Google Docs-style collaborative editor built from the ground up. The primary objective of this project is to solve the complex computer science problem of concurrent editing. 

Instead of relying on heavy third-party synchronization libraries, CollabDocs implements a custom **Operational Transformation (OT)** engine. This ensures that when multiple users type in the exact same document at the exact same millisecond, all conflicts are resolved seamlessly without data loss or cursor jumping.

## ✨ Key Features

* ⚡ **Real-time Collaboration** — Multiple users can edit the same document simultaneously with zero friction.
* 🔄 **Operational Transformation** — Conflict-free concurrent edits achieving sub-50ms latency.
* 🖱️ **Live Presence** — See other users' cursors and selections moving in real-time.
* ⏪ **Version History & Restores** — Full append-only operation log allowing point-in-time document restoration.
* 🚀 **Horizontally Scalable** — Uses Redis Pub/Sub to sync document state and operations across multiple Node.js server instances.
* 🔒 **Secure Authentication** — JWT-based authentication for user registration and secure document access.

### Markdown, deliberately

The editor is a **markdown source editor**. The formatting toolbar inserts
markdown characters — `**bold**`, `_italic_`, `# heading`, `- list` — and a
Preview toggle renders the result.

This is not a stylistic preference. The OT engine in `shared/ot/` transforms
operations over a flat string: `insert(pos, text)` and `delete(pos, len)`, with
positions as character offsets. Formatting therefore has to *be* characters. If
it were an attribute on a range, it would need its own operation type and its
own transform — so that two people bolding overlapping ranges while a third
deletes across them converge on the same result. Markdown sidesteps that
entirely: formatting is text, so it syncs through the existing transform with no
special handling, and a formatting action is indistinguishable from typing.

An earlier version shipped a toolbar built on `document.execCommand`, which
writes HTML into the editable element. Because the sync layer reads and writes
`textContent`, that formatting never entered the diff, never reached the server,
and was destroyed the moment anyone else's edit rewrote the element. Native
formatting shortcuts are blocked at the `beforeinput` level for the same reason;
Ctrl/Cmd+B, I and U are intercepted earlier and insert markdown markers instead.

The preview is a read view rather than a live side-by-side pane, and inline
WYSIWYG inside the contentEditable is deliberately not attempted — a second
editable surface reintroduces exactly the DOM-structure problem the plain-text
invariant exists to prevent. Document content is untrusted, so the preview
renders through `marked` and is sanitised with `DOMPurify` before it reaches the
DOM; raw HTML from a document is never rendered.

True WYSIWYG remains a future milestone. It requires replacing the plain-string
operation type with an attributed document model (along the lines of a Quill
delta or a ProseMirror step), plus a matching transform and storage format — not
a change that can be made in the view layer.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Zustand |
| **Real-time Engine** | Socket.io 4.7, Custom Operational Transformation (OT) |
| **Backend API** | Node.js, Express.js |
| **Database** | MongoDB (Mongoose) |
| **Cache & Pub/Sub** | Redis |
| **Security** | JWT (jsonwebtoken), bcryptjs |

---

## 🏗️ Architecture & Data Flow

CollabDocs is designed to handle high-frequency events efficiently by buffering operations in Redis before flushing them to MongoDB asynchronously.

```text
┌─────────────────────────────────────────────────────────┐
│  CLIENT  (React + Vite + Tailwind)                      │
│                                                         │
│  DocumentDashboard → EditorPage → EditorCore            │
│          useSocket → useOT → usePresence                │
└──────────────┬────────────────────────┬─────────────────┘
               │ WebSocket (Socket.io)  │ REST (axios)
               ▼                        ▼
┌─────────────────────────────────────────────────────────┐
│  SERVER  (Node.js + Express + Socket.io)                │
│                                                         │
│  socketServer → documentHandler → otService             │
│               → presenceHandler                         │
│  authRoutes / documentRoutes / historyRoutes            │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
     ┌─────▼─────┐              ┌─────▼────────┐
     │   Redis   │              │   MongoDB    │
     │ pub/sub   │              │ Documents    │
     │ op cache  │              │ Operations   │
     │ sessions  │              │ Users        │
     └───────────┘              └──────────────┘
```

### ⚡ Sub-50ms OT Resolution Flow
1. Client submits operation to Server.
2. Server acquires a **Redis Lock** (100ms TTL) for the document.
3. Loads missed operations from the Redis Cache.
4. Transforms the incoming operation against missed operations.
5. Applies transformed op, increments revision, and updates Redis cache.
6. Persists to MongoDB (Asynchronously).
7. Publishes via Redis to all connected nodes/clients.

---

## 🚀 Quick Start

### Prerequisites
* Node.js v20+
* MongoDB instance (Atlas free tier works)
* Redis instance (Upstash free tier works)

### 1. Clone the repository
```bash
git clone [https://github.com/yourusername/collab-editor.git](https://github.com/yourusername/collab-editor.git)
cd collab-editor
```

### 2. Backend Setup
```bash
cd server
cp .env.example .env
```
Update your `.env` variables:
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/collab-editor
REDIS_URL=rediss://default:<pass>@your-endpoint.upstash.io:6379
JWT_SECRET=your_secure_random_string
JWT_EXPIRES=7d
CLIENT_URL=http://localhost:5173
```
Install dependencies and start the server:
```bash
npm install
npm run dev
```

### 3. Frontend Setup
```bash
cd ../client
cp .env.example .env
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## 🌐 API & Socket Reference

<details>
<summary><strong>Click to expand REST API Endpoints</strong></summary>

### Auth Endpoints (`/api/auth`)
| Method | Path | Payload | Description |
|---|---|---|---|
| POST | `/register` | `{name, email, password}` | Register new user |
| POST | `/login` | `{email, password}` | Authenticate user |
| GET | `/me` | — | Get current user profile |

### Document Endpoints (`/api/documents`)
| Method | Path | Payload | Description |
|---|---|---|---|
| GET | `/` | `?filter=all&search=` | List documents |
| POST | `/` | `{title}` | Create new document |
| GET | `/:id` | — | Get single document |

### History Endpoints (`/api/history`)
| Method | Path | Payload | Description |
|---|---|---|---|
| GET | `/:id` | — | Get version history array |
| POST | `/:id/restore/:revId` | — | Restore to specific revision |

</details>

<details>
<summary><strong>Click to expand WebSocket Events</strong></summary>

| Event | Direction | Payload |
|---|---|---|
| `doc:join` | Client → Server | `{docId}` |
| `op:submit` | Client → Server | `{docId, op, revision}` |
| `presence:cursor` | Client → Server | `{docId, cursor}` |
| `doc:load` | Server → Client | `{content, revision, title}` |
| `op:ack` | Server → Client | `{op, revision}` |
| `op:broadcast` | Server → Client | `{op, revision, userId}` |

</details>

---

## 📂 Project Structure

<details>
<summary><strong>View Directory Tree</strong></summary>

```text
collab-editor/
├── client/                      # React + Vite frontend
│   ├── src/
│   │   ├── components/          # Reusable UI components (Editor, Sidebar, etc.)
│   │   ├── hooks/               # Custom hooks (useSocket, useOT, usePresence)
│   │   ├── lib/                 # Client-side OT primitives
│   │   ├── pages/               # Route components
│   │   ├── services/            # API and Socket instances
│   │   └── store/               # Zustand state management
│   └── package.json
│
├── server/                      # Node.js backend
│   ├── src/
│   │   ├── config/              # DB and Redis connection logic
│   │   ├── controllers/         # REST request handlers
│   │   ├── middleware/          # Auth and Error handling
│   │   ├── models/              # Mongoose schemas
│   │   ├── routes/              # Express routing
│   │   ├── services/            # Core business logic & OT Engine
│   │   └── socket/              # WebSockets room & presence handlers
│   └── package.json
│
├── shared/                      # Shared types and OT logic
│   └── ot/operations.js
│
└── infra/                       # Local dev stack only — see infra/README.md
    ├── docker-compose.dev.yml
    └── redis.dev.conf
```
</details>

---

## 📈 Running Multiple Instances

**The app must run as a single instance today.** Some real-time paths fan out
across nodes and some do not, so a second instance splits collaboration in ways
that are easy to miss.

**Works across nodes.** These are published to Redis, and every node subscribes
and forwards to its own connected clients (`socket/socketServer.js`):

- document operations (`op:broadcast`) — the OT edit stream
- per-user notifications from the REST layer (share request approve / deny)
- forced access revocation and role changes

**Single-instance only.** These use Socket.io's default in-memory adapter, so
they reach only the sockets held by the node that emitted them:

- presence — `presence:join`, `presence:leave` and cursor updates are sent with
  `socket.to(room)` (`socket/handlers/presenceHandler.js`)
- room membership — `socket/rooms.js` is a plain in-process `Map`, so each node
  knows only its own members and reports an under-counted collaborator list
- the `doc:load` broadcast after a version restore
  (`socket/handlers/documentHandler.js`)

So with two instances, two users on different nodes would see each other's
**edits** but not each other's **cursors or presence**, and each would see an
incomplete list of who is in the document.

`@socket.io/redis-adapter` is **not** installed. Redis is still required for a
single instance — it backs the distributed lock, the op cache and the
cross-node channels above.

### What multi-instance would require

1. Install `@socket.io/redis-adapter` and wire it into `initSocket()`. That makes
   `io.to()` / `socket.to()` fan out across nodes, fixing presence and making the
   hand-rolled op pub/sub redundant.
2. Move room membership out of `socket/rooms.js` into shared Redis state —
   per-process membership cannot be made correct by an adapter alone.
3. Sticky sessions at the load balancer, or `transports: ["websocket"]` on the
   client, so Socket.io's long-polling handshake does not land on a different
   node mid-negotiation.
4. Keep a single shared Redis. `services/lockService.js` already assumes every
   node talks to the same instance; separate Redises would void the lock.

---

## 📄 License

Distributed under the MIT License.