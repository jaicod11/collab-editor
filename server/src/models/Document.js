const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Untitled Document" },
    content: { type: String, default: "" },
    revision: { type: Number, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["Active", "Archived", "Deleted"], // ← "Deleted" added
      default: "Active",
    },
    snapshot: {
      content: String,
      revision: Number,
      savedAt: Date,
    },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
//
// documentController.list runs
//   { $or: [{ owner }, { collaborators }], status } sorted by updatedAt desc
// MongoDB evaluates each $or branch independently and unions the results, so
// each branch needs its OWN index — one compound index covering both is not
// possible. Field order is equality (owner/collaborators), then equality
// (status), then sort (updatedAt): that lets the planner seek straight to the
// matching range and walk it in sort order, with no in-memory SORT stage.
documentSchema.index({ owner: 1, status: 1, updatedAt: -1 });
documentSchema.index({ collaborators: 1, status: 1, updatedAt: -1 });

// Full-text search on the TITLE only.
//
// `content` was previously in this index. Every op:submit rewrites
// Document.content, so MongoDB re-tokenised the entire document body on every
// keystroke — the write amplification grew with document length and was the
// single most expensive thing on the edit path.
//
// Body search is therefore no longer available, and this is a real capability
// removed, not a silent one. Restoring it without taxing writes would mean
// decoupling the searchable copy from the live one, e.g.:
//   - Atlas Search / a dedicated search cluster fed asynchronously from the op
//     log or a change stream, so indexing never blocks an edit; or
//   - a separate `document_search` collection refreshed on the snapshot cadence
//     (every SNAPSHOT_EVERY revisions) instead of per keystroke, trading search
//     freshness for write throughput.
// Both are their own piece of work; neither belongs on the keystroke path.
documentSchema.index({ title: "text" });

module.exports = mongoose.model("Document", documentSchema);