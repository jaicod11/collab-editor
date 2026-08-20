const mongoose = require("mongoose");

/**
 * Collaborator roles. `owner` is not stored here — it lives in Document.owner —
 * but assertAccess reports it so callers can reason about all three uniformly.
 */
const ROLES = Object.freeze({ OWNER: "owner", EDITOR: "editor", VIEWER: "viewer" });

/** Roles that may modify document CONTENT (ops, restore). */
const WRITE_ROLES = Object.freeze([ROLES.OWNER, ROLES.EDITOR]);

const collaboratorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: [ROLES.EDITOR, ROLES.VIEWER], default: ROLES.EDITOR },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Untitled Document" },
    content: { type: String, default: "" },
    revision: { type: Number, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Was a bare [ObjectId]. Every entry carried an implicit "can do anything"
    // and the UI invented a Can edit / Can view distinction that the server did
    // not enforce. The role is now stored and checked server-side.
    collaborators: [collaboratorSchema],

    // ── Share by link ──────────────────────────────────────────────────────
    // The token grants the ability to REQUEST access. It is never itself
    // access: resolving it returns title and owner name only, and joining
    // creates a pending AccessRequest the owner must approve.
    //
    // Generated lazily on first share so a document that is never shared never
    // has a token to leak, and so revoking is a real state change rather than
    // a no-op on a token that always existed.
    // No default: the field is simply absent until the document is first
    // shared, which is what "generated lazily" should mean on disk too.
    shareToken: { type: String },
    shareEnabled: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["Active", "Archived", "Deleted"],
      default: "Active",
    },

    // Who last moved this document between Active / Archived / Deleted, and
    // when. Recorded because the Trash and Archive pages need to show it — they
    // previously displayed the document's OWNER and its `updatedAt`, which is
    // whoever created it and whenever it was last edited, not who binned it.
    statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    statusChangedAt: { type: Date, default: null },

    // Per-user stars. Starring was previously a localStorage set, so it
    // vanished on another device or a cache clear, and the Starred page had to
    // fetch every document and intersect client-side — which silently lost any
    // starred document outside the first 100.
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
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
// Path updated with the schema change: the collaborator id moved from the array
// element itself to `.user`. Without this the dashboard's $or branch would
// silently fall back to a collection scan.
documentSchema.index({ "collaborators.user": 1, status: 1, updatedAt: -1 });

// Serves filter=starred: "documents this user starred, by recency". Same
// equality-then-sort shape as the owner/collaborator indexes above.
documentSchema.index({ starredBy: 1, status: 1, updatedAt: -1 });

// Share-token lookup (GET /api/documents/join/:token), unique so two documents
// can never resolve from the same link.
//
// partialFilterExpression, NOT sparse: a sparse unique index still indexes
// documents whose field is explicitly null — it only skips MISSING fields. With
// `shareToken: null` written by revokeShare, the second unshared document
// collided on null and document creation failed outright with
// "shareToken already exists". Restricting the index to actual string tokens
// leaves every unshared document out of it.
documentSchema.index(
  { shareToken: 1 },
  { unique: true, partialFilterExpression: { shareToken: { $type: "string" } } }
);

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

const Document = mongoose.model("Document", documentSchema);

Document.ROLES = ROLES;
Document.WRITE_ROLES = WRITE_ROLES;

module.exports = Document;