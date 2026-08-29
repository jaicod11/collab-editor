/**
 * server/src/models/Notification.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A durable record of something that happened to a user's access, so the bell
 * survives a page reload and a missed socket.
 *
 * The live socket delivery and this record are two halves of one thing: the
 * socket is how it arrives now, this is how it is still there tomorrow. Both
 * are written by services/notificationService.js — nothing creates one of these
 * without the other.
 *
 * The payload is DENORMALISED on purpose. A notification says what was true at
 * the moment it fired, so it must still render after the document is renamed or
 * the actor changes their display name — and it must not need a join per row to
 * paint a dropdown. The document link is a docId the UI navigates to; if that
 * document is gone the row is deleted outright (see notificationService.cascade
 * ForDocument), not left pointing at a 404.
 */

const mongoose = require("mongoose");

const TYPES = Object.freeze({
  ACCESS_REQUESTED: "access_requested", // someone asked for access to YOUR document
  ACCESS_APPROVED: "access_approved",   // your request was approved — you are now a collaborator
  ACCESS_DENIED: "access_denied",       // your request was declined
  ROLE_CHANGED: "role_changed",         // the owner changed your role
  ACCESS_REVOKED: "access_revoked",     // the owner removed you
});

const notificationSchema = new mongoose.Schema(
  {
    // The RECIPIENT. Every query in notificationController is scoped by this
    // field and it is never taken from user input.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: Object.values(TYPES), required: true },

    payload: {
      // Kept as an ObjectId ref so the cascade delete can match on it, but the
      // rest of the payload is a snapshot and is deliberately not populated.
      docId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", default: null },
      docTitle: { type: String, default: "Untitled Document" },
      actorName: { type: String, default: "" },
      // Only meaningful for ACCESS_APPROVED and ROLE_CHANGED.
      role: { type: String, enum: ["editor", "viewer", null], default: null },
    },

    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The two queries the bell makes: the unread count, and the newest page for
// this user. Both start from userId; `read` narrows the count; createdAt orders
// the page. One compound index serves both because the count uses the userId +
// read prefix and the listing uses userId + createdAt via the same leading key.
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Deleting a document takes its notifications with it, so this supports the
// cascade without a collection scan.
notificationSchema.index({ "payload.docId": 1 });

// NOTE: deliberately NO TTL index. A notification is user-visible data, and
// Phase 3 removed a TTL that had been silently deleting version history for the
// same reason: data disappearing on a timer that nobody chose is a bug that
// looks like forgetfulness. Retention is a per-user cap plus a cascade on
// document deletion, both in services/notificationService.js — bounded, but
// only ever by something the user did.

const Notification = mongoose.model("Notification", notificationSchema);
Notification.TYPES = TYPES;

module.exports = Notification;
