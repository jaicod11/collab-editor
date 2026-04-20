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
└── infra/                       # Deployment configs
    ├── docker-compose.yml
    ├── nginx.conf
    └── redis.conf
```
</details>

---

## 📈 Scaling to Multiple Nodes

CollabDocs is built to scale horizontally out of the box. To run multiple instances behind a load balancer, the app utilizes the `@socket.io/redis-adapter` to pass real-time events between nodes.

To deploy in production:
1. Ensure `nginx.conf` is configured for `ip_hash` load balancing.
2. Point all Node.js instances to the same Redis cluster to ensure accurate distributed locking and pub/sub delivery.

---

## 📄 License

Distributed under the MIT License.