/**
 * server/src/services/notificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The ONE place a notification is created. Persisting and delivering happen
 * together here so the two can never drift — a bell that updates live but has
 * nothing behind it on reload is the fabricated-UI problem Phase 6 removed.
 *
 * Delivery reuses the existing personal-room plumbing rather than adding a
 * parallel path: the caller hands in `req.app.get("notifyUser")`, which
 * publishes to Redis so the event reaches the user's sockets on whichever node
 * holds them. See socket/socketServer.js.
 *
 * Failure policy: creating a notification must never fail the action that
 * triggered it. Approving a request is the user's intent; the bell entry is a
 * side effect. So everything here is caught and logged, and the caller is not
 * made to await a rollback it cannot sensibly perform.
 */

const Notification = require("../models/Notification");

/** Newest N kept per user. Older rows are trimmed as new ones arrive. */
const MAX_PER_USER = 100;

/** The socket event the client listens on for a live bell update. */
const LIVE_EVENT = "notification:new";

/**
 * Trim a user's history back to the cap.
 *
 * Runs after the insert rather than before, so the new row is never the one
 * evicted by its own arrival. Reads only _id, and only past the cap, so the
 * common case (a user under the limit) costs one indexed lookup returning
 * nothing.
 */
async function trim(userId) {
  const overflow = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .skip(MAX_PER_USER)
    .select("_id")
    .lean();

  if (overflow.length === 0) return 0;
  await Notification.deleteMany({ _id: { $in: overflow.map((n) => n._id) } });
  return overflow.length;
}

/**
 * Create a notification and push it to the recipient's live sockets.
 *
 * @param {object}   fields
 * @param {string}   fields.userId     recipient
 * @param {string}   fields.type       one of Notification.TYPES
 * @param {string}   [fields.docId]
 * @param {string}   [fields.docTitle]
 * @param {string}   [fields.actorName]
 * @param {string}   [fields.role]
 * @param {Function} [notify]  req.app.get("notifyUser") — omitted in tests and
 *                             wherever no socket layer is mounted.
 * @returns {Promise<object|null>} the created row, or null if it could not be
 *                                 written (already logged).
 */
async function create({ userId, type, docId, docTitle, actorName, role }, notify) {
  if (!userId || !type) return null;

  try {
    const doc = await Notification.create({
      userId,
      type,
      payload: {
        docId: docId ?? null,
        docTitle: docTitle || "Untitled Document",
        actorName: actorName || "",
        role: role ?? null,
      },
    });

    // Send the same shape the REST list returns, so the client renders a live
    // arrival and a fetched row through one code path.
    notify?.(String(userId), LIVE_EVENT, {
      notification: {
        _id: String(doc._id),
        type: doc.type,
        payload: {
          docId: doc.payload.docId ? String(doc.payload.docId) : null,
          docTitle: doc.payload.docTitle,
          actorName: doc.payload.actorName,
          role: doc.payload.role,
        },
        read: doc.read,
        createdAt: doc.createdAt,
      },
    });

    await trim(userId);
    return doc;
  } catch (err) {
    // Deliberately swallowed — see the failure policy at the top of the file.
    console.error("[notificationService] create failed:", err.message);
    return null;
  }
}

/**
 * Remove every notification pointing at a document.
 *
 * Called when a document is permanently deleted. A notification whose link
 * leads to a 404 is worse than no notification: the user clicks it, lands
 * nowhere, and the bell keeps offering it.
 */
async function cascadeForDocument(docId) {
  try {
    const { deletedCount } = await Notification.deleteMany({ "payload.docId": docId });
    return deletedCount ?? 0;
  } catch (err) {
    console.error("[notificationService] cascade failed:", err.message);
    return 0;
  }
}

module.exports = { create, cascadeForDocument, trim, MAX_PER_USER, LIVE_EVENT };
