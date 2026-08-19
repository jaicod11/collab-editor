/**
 * socket/handlers/documentHandler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all document-related Socket.io events:
 *
 *  Client → Server:
 *    "doc:join"     { docId }
 *    "doc:leave"    { docId }
 *    "op:submit"    { docId, op, revision }
 *    "doc:restore"  { docId, versionId }
 *
 *  Server → Client:
 *    "doc:load"     { content, revision, title }
 *    "op:ack"       { revision, op }          (only to submitting socket)
 *    "op:broadcast" { op, revision, userId }  (to all others via Redis)
 *    "doc:error"    { message }
 *
 * OT flow (sub-50ms target):
 *   1. Lock document revision in Redis (SETNX with 100ms TTL)
 *   2. Load ops since client's revision from Redis cache (fallback: MongoDB)
 *   3. Transform incoming op against missed ops
 *   4. Apply transformed op to document content
 *   5. Increment revision, persist op + updated content
 *   6. Release lock, publish via Redis pub/sub, ACK client
 */

const Document = require("../../models/Document");
const Operation = require("../../models/Operation");
const otService = require("../../services/otService");
const redisService = require("../../services/redisService");
const snapshotService = require("../../services/snapshotService");
const documentService = require("../../services/documentService");

module.exports = function documentHandler(io, socket, redisClient, CHANNEL_PREFIX) {
  const { user } = socket;

  // ── Per-socket authorization cache ────────────────────────────────────────
  // assertAccess() hits MongoDB, and op:submit fires on every keystroke, so a
  // granted result is memoised for as long as this socket stays in the room.
  // This closure is created once per connection, so the cache is inherently
  // scoped to (socket, docId). Cleared on doc:leave and on disconnect.
  //
  // Only grants are cached. A denial is re-checked every time, so a user who
  // is added as a collaborator mid-session is picked up without reconnecting,
  // and a stale denial can never be served from cache.
  const grantedDocs = new Set();

  /**
   * Verify the connected user may read/write this document.
   * Emits a generic doc:error and returns false when access is refused —
   * "Access denied" is used for both 403 and 404 so the socket API cannot be
   * used to probe which document IDs exist.
   *
   * @returns {Promise<boolean>} true when access is granted
   */
  async function ensureAccess(docId) {
    if (grantedDocs.has(docId)) return true;

    try {
      await documentService.assertAccess(docId, user.id);
      grantedDocs.add(docId);
      return true;
    } catch (err) {
      console.warn(
        `[documentHandler] access refused: user=${user.id} doc=${docId} (${err.statusCode ?? 500})`
      );
      socket.emit("doc:error", { message: "Access denied" });
      return false;
    }
  }

  // ── doc:join ──────────────────────────────────────────────────────────────
  socket.on("doc:join", async ({ docId }) => {
    if (!docId) return;

    try {
      // ── Authorization — BEFORE joining the room or loading any content ──
      if (!(await ensureAccess(docId))) return;

      // Join Socket.io room
      socket.join(`doc:${docId}`);

      const rooms = require("../rooms");
      rooms.join(docId, { userId: user.id, name: user.name, socketId: socket.id });

      // Load document (try Redis cache first)
      let doc = await redisService.getDocCache(docId);
      if (!doc) {
        doc = await Document.findById(docId).lean();
        if (!doc) {
          return socket.emit("doc:error", { message: "Document not found" });
        }
        await redisService.setDocCache(docId, doc);
      }

      // Send initial document state to this socket only
      socket.emit("doc:load", {
        content: doc.content,
        revision: doc.revision,
        title: doc.title,
      });

      // Notify other users in the room
      socket.to(`doc:${docId}`).emit("presence:join", {
        userId: user.id,
        name: user.name,
        initials: user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2),
      });

      console.log(`[Socket] ${user.name} joined doc:${docId} (rev ${doc.revision})`);
    } catch (err) {
      console.error("[documentHandler] doc:join error:", err);
      socket.emit("doc:error", { message: "Failed to load document" });
    }
  });

  // ── doc:leave ─────────────────────────────────────────────────────────────
  socket.on("doc:leave", ({ docId }) => {
    if (!docId) return;
    grantedDocs.delete(docId); // room membership ended — drop the cached grant
    socket.leave(`doc:${docId}`);
    socket.to(`doc:${docId}`).emit("presence:leave", { userId: user.id });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  // Belt-and-braces: the closure dies with the socket, but clearing explicitly
  // means a cached grant can never outlive the connection that earned it.
  socket.on("disconnect", () => {
    grantedDocs.clear();
  });

  // ── op:submit ─────────────────────────────────────────────────────────────
  socket.on("op:submit", async ({ docId, op, revision: clientRevision }) => {
    if (!docId || !op) return;

    const lockKey = `lock:doc:${docId}`;

    try {
      // ── 0a. Authorization — BEFORE taking the lock ──────────────────────
      if (!(await ensureAccess(docId))) return;

      // ── 0b. Validate op shape — BEFORE taking the lock ──────────────────
      // Rejects malformed indices that String.slice would otherwise accept
      // and silently corrupt the document with.
      if (!otService.validateOp(op)) {
        return socket.emit("doc:error", { message: "Invalid operation" });
      }

      // ── 1. Acquire optimistic lock (100ms TTL) ──────────────────────────
      const acquired = await redisClient.set(lockKey, socket.id, {
        NX: true,
        PX: 100,
      });
      // If lock not acquired, retry once after 10ms
      if (!acquired) {
        await new Promise((r) => setTimeout(r, 10));
        const retry = await redisClient.set(lockKey, socket.id, { NX: true, PX: 100 });
        if (!retry) {
          return socket.emit("doc:error", { message: "Server busy, please retry" });
        }
      }

      // ── 2. Load current doc state ─────────────────────────────────────
      let doc = await redisService.getDocCache(docId);
      if (!doc) {
        doc = await Document.findById(docId).lean();
        if (!doc) return socket.emit("doc:error", { message: "Document not found" });
      }

      const serverRevision = doc.revision;

      // ── 3. Fetch ops between clientRevision and serverRevision ──────────
      let missedOps = [];
      if (clientRevision < serverRevision) {
        // Try Redis op cache first (fast path)
        missedOps = await redisService.getOpsRange(docId, clientRevision, serverRevision);

        if (missedOps.length === 0 && clientRevision < serverRevision) {
          // Fallback to MongoDB op log
          const dbOps = await Operation.find({
            docId,
            revision: { $gt: clientRevision, $lte: serverRevision },
          })
            .sort({ revision: 1 })
            .lean();
          missedOps = dbOps.map((o) => o.op);
        }
      }

      // ── 4. Transform op against missed ops ───────────────────────────
      const transformedOp = otService.transformAgainst(op, missedOps);

      // ── 5. Apply to document content ──────────────────────────────────
      const newContent = otService.applyOp(doc.content ?? "", transformedOp);
      const newRevision = serverRevision + 1;

      // ── 6. Persist op to MongoDB (async, non-blocking) ────────────────
      const opRecord = new Operation({
        docId,
        userId: user.id,
        revision: newRevision,
        op: transformedOp,
      });
      opRecord.save().catch((e) => console.error("[Op persist]", e));

      // ── 7. Update document in MongoDB (async) ────────────────────────
      // NOTE: this deliberately does NOT add the editor to `collaborators`.
      // Membership is never granted as a side effect of editing — access is
      // enforced up front by ensureAccess() above, so anyone reaching this
      // line is already the owner or an existing collaborator.
      Document.findByIdAndUpdate(docId, {
        content: newContent,
        revision: newRevision,
      }).catch((e) => console.error("[Doc update]", e));

      // ── 8. Update Redis cache ─────────────────────────────────────────
      const updatedDoc = { ...doc, content: newContent, revision: newRevision };
      await redisService.setDocCache(docId, updatedDoc);
      await redisService.pushOp(docId, transformedOp, newRevision);

      // ── 9. Release lock ───────────────────────────────────────────────
      await redisClient.del(lockKey);

      // ── 10. ACK to submitting client ──────────────────────────────────
      socket.emit("op:ack", { revision: newRevision, op: transformedOp });

      // ── 11. Publish to Redis → other nodes forward to their rooms ─────
      await redisClient.publish(
        `${CHANNEL_PREFIX}${docId}`,
        JSON.stringify({
          op: transformedOp,
          revision: newRevision,
          userId: user.id,
          _socketId: socket.id, // excluded from broadcast on receiving end
        })
      );

      // ── 12. Periodic snapshot (every 50 revisions) ────────────────────
      if (newRevision % 50 === 0) {
        snapshotService.save(docId, newContent, newRevision).catch(console.error);
      }

    } catch (err) {
      await redisClient.del(lockKey).catch(() => { });
      console.error("[documentHandler] op:submit error:", err);
      socket.emit("doc:error", { message: "Operation failed" });
    }
  });

  // ── doc:restore ───────────────────────────────────────────────────────────
  socket.on("doc:restore", async ({ docId, versionId }) => {
    if (!docId || !versionId) return;

    try {
      // ── Authorization — BEFORE reading or rewriting any content ─────────
      if (!(await ensureAccess(docId))) return;

      const op = await Operation.findById(versionId).lean();
      if (!op) return socket.emit("doc:error", { message: "Version not found" });

      // Replay ops from snapshot up to target revision
      const snapshot = await Document.findById(docId).select("snapshot").lean();
      const baseContent = snapshot?.snapshot?.content ?? "";
      const baseRevision = snapshot?.snapshot?.revision ?? 0;

      const ops = await Operation.find({
        docId,
        revision: { $gt: baseRevision, $lte: op.revision },
      }).sort({ revision: 1 }).lean();

      let content = baseContent;
      for (const o of ops) {
        content = otService.applyOp(content, o.op);
      }

      const newRevision = (await Document.findById(docId).select("revision").lean()).revision + 1;
      await Document.findByIdAndUpdate(docId, { content, revision: newRevision });
      await redisService.setDocCache(docId, { content, revision: newRevision });

      // Broadcast full restore to all room members
      io.to(`doc:${docId}`).emit("doc:load", {
        content,
        revision: newRevision,
        title: "Restored version",
      });

    } catch (err) {
      console.error("[documentHandler] doc:restore error:", err);
      socket.emit("doc:error", { message: "Restore failed" });
    }
  });
};
