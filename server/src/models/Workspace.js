/**
 * server/src/models/Workspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A workspace groups documents/collaborators under a named, colored badge
 * (shown in the sidebar — e.g. "Design Team", "Engineering").
 *
 * Kept intentionally simple for now:
 *   - owner: the user who created it (only they can rename/delete it)
 *   - members: everyone with access (owner is auto-included)
 *
 * Future extension point: invite other users into `members` via email,
 * and optionally scope documents to a workspace with a `workspace` field
 * on the Document model.
 */

const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 40,
        },
        color: {
            type: String,   // hex color used for the initials badge in the sidebar
            default: "#22c55e",
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        members: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
    },
    { timestamps: true }
);

module.exports = mongoose.model("Workspace", workspaceSchema);