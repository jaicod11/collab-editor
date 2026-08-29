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
 *    "doc:load"        { content, revision, title }
 *    "presence:update" [{ userId, name, initials }]  full roster, to the joiner
 *    "presence:join"   { userId, name, initials }    to everyone already in room
 *    "presence:leave"  { userId }                    to everyone else in the room
 *    "op:ack"          { revision, op }              only to the submitting socket
 *    "op:broadcast"    { op, revision, userId }      to all others, via Redis
 *    "access:role"     { docId, role }               to the one user whose role
 *                                                    changed, without a reconnect
 *    "doc:error"       { code, message }             the client keys its resync
 *                                                    decision on `code`
 *
 * op:submit flow:
 *   1. Authorise the write and validate the op's shape (otService.validateOp)
 *      before taking any lock.
 *   2. Enter the critical section. Serialisation is done by the in-process FIFO
 *      queue in lockService — same-document submissions QUEUE rather than race.
 *      The Redis SET NX PX lock wrapped around it extends that exclusion across
 *      nodes; its 10s TTL is a crash safety net, not the concurrency control,
 *      and release is a compare-and-delete so a holder can only free its own.
 *   3. Load the canonical document, then the ops applied since the client's
 *      revision — from the Redis op cache, falling back to the durable
 *      MongoDB log when the cached range has been trimmed.
 *   4. Transform the incoming op against each missed op, apply it, and
 *      increment the revision.
 *   5. Persist the op and the updated document to MongoDB, AWAITED inside the
 *      lock, then refresh the Redis cache. This lengthens the critical section
 *      on purpose: an op:ack therefore means the write is durable.
 *   6. Ack the submitter, then publish to Redis — both still inside the lock,
 *      so back-to-back ops reach other clients in revision order.
 *   7. Release the lock.
 *
 * No latency target is claimed here. The end-to-end time is dominated by the
 * awaited MongoDB writes in step 5 and has not been measured.
 */

const Document = require("../../models/Document");
const Operation = require("../../models/Operation");
const otService = require("../../services/otService");
const redisService = require("../../services/redisService");
const snapshotService = require("../../services/snapshotService");
const documentService = require("../../services/documentService");
const lockService = require("../../services/lockService");

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
  // docId -> role ("owner" | "editor" | "viewer"). Caching the ROLE, not just
  // the fact of access, is what lets op:submit reject a viewer without a
  // database round trip per keystroke.
  const grantedDocs = new Map();

  /**
   * Verify the connected user may read/write this document.
   * Emits a generic doc:error and returns false when access is refused —
   * "Access denied" is used for both 403 and 404 so the socket API cannot be
   * used to probe which document IDs exist.
   *
   * @returns {Promise<boolean>} true when access is granted
   */
  async function ensureAccess(docId) {
    if (grantedDocs.has(docId)) return grantedDocs.get(docId);

    try {
      const { role } = await documentService.assertAccess(docId, user.id);
      grantedDocs.set(docId, role);
      return role;
    } catch (err) {
      console.warn(
        `[documentHandler] access refused: user=${user.id} doc=${docId} (${err.statusCode ?? 500})`
      );
      socket.emit("doc:error", { code: "ACCESS_DENIED", message: "Access denied" });
      return null;
    }
  }

  /**
   * Access for an operation that CHANGES the document.
   * A viewer passes ensureAccess (they may read) but must not get here.
   */
  async function ensureWriteAccess(docId) {
    const role = await ensureAccess(docId);
    if (!role) return null; // ensureAccess already reported it
    if (!documentService.canWrite(role)) {
      socket.emit("doc:error", {
        code: "VIEWER_READONLY",
        message: "You have view-only access to this document",
      });
      return null;
    }
    return role;
  }

  // ── Access changes pushed from the REST layer ─────────────────────────────
  // Fired when the owner removes this user or changes their role. The
  // per-socket role cache above would otherwise keep serving the stale value
  // until the socket reconnected — a removed collaborator would carry on
  // editing, and an upgraded viewer would stay locked out.
  //
  // Installed on socket.data rather than as a socket.on() listener: socket.on
  // handles messages coming FROM the client, so an io.to(...).emit() from the
  // server would reach the browser and never run this. socketServer looks the
  // function up on each LOCAL socket instead, with Redis fanning the event out
  // to the other nodes.
  socket.data.applyAccessChange = (changedDocId, { disconnect = true, role = null } = {}) => {
    if (!changedDocId) return;

    // Always drop the cached role. Re-reading it from the database on the next
    // operation is cheaper than reasoning about whether a seeded value could be
    // stale after two changes in flight.
    grantedDocs.delete(changedDocId);

    if (disconnect) {
      const rooms = require("../rooms");
      socket.leave(`doc:${changedDocId}`);
      rooms.leave(changedDocId, socket.id);
      socket.to(`doc:${changedDocId}`).emit("presence:leave", { userId: user.id });
      socket.emit("doc:error", {
        code: "ACCESS_REVOKED",
        message: "Your access to this document has been removed",
      });
      return;
    }

    // A ROLE CHANGE, in either direction. This used to emit doc:error with code
    // VIEWER_READONLY whenever `disconnect` was false — so being promoted from
    // viewer to editor told the user they had just become read-only, and the
    // client duly made their editor read-only. The event now carries the actual
    // new role and is not an error.
    if (role) {
      socket.emit("access:role", { docId: changedDocId, role });
    }
  };

  // ── doc:join ──────────────────────────────────────────────────────────────
  socket.on("doc:join", async ({ docId }) => {
    if (!docId) return;

    try {
      // ── Authorization — BEFORE joining the room or loading any content ──
      const role = await ensureAccess(docId);
      if (!role) return;

      // Join Socket.io room
      socket.join(`doc:${docId}`);

      const rooms = require("../rooms");
      rooms.join(docId, { userId: user.id, name: user.name, socketId: socket.id });

      // Canonical loader — one cached shape shared with the REST layer.
      const doc = await documentService.loadCanonical(docId);
      if (!doc) {
        return socket.emit("doc:error", { code: "NOT_FOUND", message: "Document not found" });
      }

      // Send initial document state to this socket only. `role` travels with
      // it so the editor can render read-only for a viewer — the UI hint is a
      // convenience; the server enforces it independently on every write.
      socket.emit("doc:load", {
        content: doc.content,
        revision: doc.revision,
        title: doc.title,
        role,
      });

      // ── Presence ────────────────────────────────────────────────────────
      // Send the JOINING socket the full roster. presence:join below only
      // reaches sockets already in the room, so without this a user opening an
      // active document saw nobody — only people who arrived after them.
      //
      // NOTE: rooms.js is an in-process Map, so this roster covers only the
      // members connected to THIS node. With more than one server process a
      // user would see just their own node's collaborators. Making it correct
      // across nodes means moving room membership into Redis (e.g. a hash per
      // document, written on join and reaped on disconnect); that is a separate
      // piece of work and is deliberately not attempted here.
      socket.emit("presence:update", rooms.getMembers(docId)
        .filter((m) => m.userId !== user.id)
        .map((m) => ({ userId: m.userId, name: m.name, initials: m.initials })));

      // Notify users already in the room that we arrived.
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

    // Also drop the in-memory room entry. Only `disconnecting` used to do this,
    // so navigating between documents left a ghost member behind for the rest
    // of the process lifetime, inflating getMembers()/getUserCount().
    const rooms = require("../rooms");
    rooms.leave(docId, socket.id);

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

    try {
      // ── Authorization — before taking the lock ──────────────────────────
      // Write access, not merely access: a viewer may read the document but
      // must not be able to change it. Enforced on the server, not by hiding
      // a button in the UI.
      if (!(await ensureWriteAccess(docId))) return;

      // ── Validate op shape — before taking the lock ──────────────────────
      // Rejects malformed indices that String.slice would otherwise accept and
      // silently corrupt the document with.
      if (!otService.validateOp(op)) {
        return socket.emit("doc:error", {
          code: "INVALID_OP",
          message: "Invalid operation",
        });
      }

      // ── Critical section ───────────────────────────────────────────────
      // Everything that reads-then-writes the document runs under the lock,
      // and the lock is released in lockService's `finally` — an early return
      // in here can no longer leak it, which the old inline version did.
      //
      // Submissions to the same document QUEUE rather than racing: the old
      // code gave up after one 10ms retry and told the client "Server busy",
      // which the client ignored, losing the op while the editor still showed
      // the text. Two simultaneous submissions were enough to trigger that.
      const outcome = await lockService.withDocumentLock(redisClient, docId, async () => {
        const doc = await documentService.loadCanonical(docId);
        if (!doc) return { kind: "missing" };

        const serverRevision = doc.revision;

        // ── Ops applied since the client's revision ────────────────────
        let missedOps = [];
        if (clientRevision < serverRevision) {
          missedOps = await redisService.getOpsRange(docId, clientRevision, serverRevision);

          if (missedOps.length === 0) {
            // Redis could not cover the range — fall back to the durable log.
            const dbOps = await Operation.find({
              docId,
              revision: { $gt: clientRevision, $lte: serverRevision },
            })
              .sort({ revision: 1 })
              .lean();
            missedOps = dbOps.map((o) => o.op);
          }
        }

        // ── Transform ──────────────────────────────────────────────────
        // `op.site` rides along and is preserved by every transform — it is
        // the deterministic insert/insert tie-break, so it must survive into
        // the op log for later catch-up transforms to agree with live clients.
        const transformedOp = otService.transformAgainst(op, missedOps);

        // Concurrent edits can cancel this op out entirely. Nothing to apply,
        // persist or broadcast — but the client is still waiting, so ack at the
        // unchanged revision to clear its pending state.
        if (otService.isNoop(transformedOp)) {
          return { kind: "noop", revision: serverRevision };
        }

        const newContent = otService.applyOp(doc.content ?? "", transformedOp);
        const newRevision = serverRevision + 1;

        // ── Persist, AWAITED inside the lock ───────────────────────────
        // These used to be fire-and-forget. The lock was released before they
        // landed, so the next op could read a stale document on a cache miss
        // and reuse a revision number.
        await Operation.create({
          docId,
          userId: user.id,
          revision: newRevision,
          op: transformedOp,
          site: typeof transformedOp.site === "string" ? transformedOp.site : undefined,
        });

        // NOTE: deliberately does NOT add the editor to `collaborators`.
        // Membership is never granted as a side effect of editing.
        await Document.findByIdAndUpdate(docId, {
          content: newContent,
          revision: newRevision,
        });

        await redisService.setDocCache(docId, { ...doc, content: newContent, revision: newRevision });
        await redisService.pushOp(docId, transformedOp, newRevision);

        // ── Ack and broadcast, still inside the lock ───────────────────
        // Ordering matters: two ops processed back to back must reach other
        // clients in revision order, or their transforms are applied against
        // the wrong base. Publishing after release allows them to interleave.
        socket.emit("op:ack", { revision: newRevision, op: transformedOp });

        await redisClient.publish(
          `${CHANNEL_PREFIX}${docId}`,
          JSON.stringify({
            op: transformedOp,
            revision: newRevision,
            userId: user.id,
            _socketId: socket.id, // excluded from broadcast on the receiving end
          })
        );

        return { kind: "applied", revision: newRevision, content: newContent };
      });

      if (outcome.kind === "missing") {
        return socket.emit("doc:error", { code: "NOT_FOUND", message: "Document not found" });
      }
      if (outcome.kind === "noop") {
        return socket.emit("op:ack", { revision: outcome.revision, op: { type: "noop" } });
      }

      // ── Periodic snapshot, outside the lock ────────────────────────────
      if (outcome.revision % snapshotService.SNAPSHOT_EVERY === 0) {
        snapshotService
          .save(docId, outcome.content, outcome.revision)
          .catch((e) => console.error("[Snapshot]", e));
      }
    } catch (err) {
      if (err instanceof lockService.LockTimeoutError) {
        console.error(`[documentHandler] lock timeout doc=${docId}`);
        return socket.emit("doc:error", {
          code: "LOCK_TIMEOUT",
          message: "Document is busy, resynchronising",
        });
      }
      console.error("[documentHandler] op:submit error:", err);
      socket.emit("doc:error", { code: "OP_FAILED", message: "Operation failed" });
    }
  });

  // ── doc:restore ───────────────────────────────────────────────────────────
  socket.on("doc:restore", async ({ docId, versionId }) => {
    if (!docId || !versionId) return;

    try {
      // ── Authorization — BEFORE reading or rewriting any content ─────────
      // Restoring rewrites the document wholesale, so it needs write access.
      if (!(await ensureWriteAccess(docId))) return;

      const outcome = await lockService.withDocumentLock(redisClient, docId, async () => {
        const target = await Operation.findById(versionId).lean();
        if (!target) return { kind: "no-version" };
        if (target.docId?.toString() !== docId) return { kind: "wrong-doc" };

        const doc = await documentService.loadCanonical(docId);
        if (!doc) return { kind: "missing" };

        // Replays from the nearest snapshot AT OR BEFORE the target revision.
        // The old code always used Document.snapshot — a single field holding
        // the MOST RECENT snapshot — so when the snapshot was newer than the
        // target (the common case) the replay range was empty and the user
        // silently got the snapshot's content instead of the version asked for.
        const content = await snapshotService.contentAtRevision(docId, target.revision);

        const newRevision = doc.revision + 1;

        // A restore is a real edit: record it so the op log has no gap and
        // clients catching up over this revision see something coherent.
        await Operation.create({
          docId,
          userId: user.id,
          revision: newRevision,
          op: { type: "restore", toRevision: target.revision, length: content.length },
        });

        await Document.findByIdAndUpdate(docId, { content, revision: newRevision });

        // Canonical shape — the old code cached { content, revision } only,
        // which erased owner/collaborators and made getOne() 403 the owner out
        // of their own document until the cache TTL expired.
        await redisService.setDocCache(docId, { ...doc, content, revision: newRevision });

        // Broadcast the document's REAL title. The old code sent the literal
        // string "Restored version", overwriting the name in every open editor.
        io.to(`doc:${docId}`).emit("doc:load", {
          content,
          revision: newRevision,
          title: doc.title,
        });

        return { kind: "restored", revision: newRevision };
      });

      if (outcome.kind === "no-version") {
        return socket.emit("doc:error", { code: "NOT_FOUND", message: "Version not found" });
      }
      if (outcome.kind === "wrong-doc") {
        return socket.emit("doc:error", {
          code: "INVALID_VERSION",
          message: "Version does not belong to this document",
        });
      }
      if (outcome.kind === "missing") {
        return socket.emit("doc:error", { code: "NOT_FOUND", message: "Document not found" });
      }
    } catch (err) {
      if (err instanceof lockService.LockTimeoutError) {
        return socket.emit("doc:error", { code: "LOCK_TIMEOUT", message: "Document is busy" });
      }
      console.error("[documentHandler] doc:restore error:", err);
      socket.emit("doc:error", { code: "RESTORE_FAILED", message: "Restore failed" });
    }
  });
};
