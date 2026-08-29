/**
 * server/src/controllers/notificationController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   /api/notifications           → newest page + unread count
 * PATCH /api/notifications/:id/read  → mark one read
 * POST  /api/notifications/read-all  → mark every unread one read
 *
 * ── Scoping ──────────────────────────────────────────────────────────────────
 * Every query here carries `userId: req.user.id` IN THE FILTER, never as a
 * post-hoc check on a fetched row. The id comes from the verified JWT and is
 * never read from params or the body, so there is no request shape that reaches
 * another user's rows: a PATCH for someone else's notification id matches
 * nothing and returns 404, which is also the correct answer for an id that does
 * not exist — the endpoint cannot be used to probe for which is which.
 */

const mongoose = require("mongoose");
const Notification = require("../models/Notification");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// ── GET /api/notifications ────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const skip = Math.max(Number.parseInt(req.query.skip, 10) || 0, 0);

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments({ userId, read: false }),
      Notification.countDocuments({ userId }),
    ]);

    res.json({
      notifications,
      unreadCount,
      total,
      // What the client needs to decide whether to offer "load more", without
      // it having to infer anything from a short page.
      hasMore: skip + notifications.length < total,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id }, // ← the scope IS the filter
      { $set: { read: true } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Notification not found" });

    const unreadCount = await Notification.countDocuments({ userId: req.user.id, read: false });
    res.json({ notification: updated, unreadCount });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/notifications/read-all ──────────────────────────────────────────
exports.markAllRead = async (req, res, next) => {
  try {
    const { modifiedCount } = await Notification.updateMany(
      { userId: req.user.id, read: false },
      { $set: { read: true } }
    );

    res.json({ marked: modifiedCount ?? 0, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
};
