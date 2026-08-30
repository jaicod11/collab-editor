/**
 * server/src/models/Workspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A PRIVATE organisational category: a named, coloured badge a user files
 * their own documents under so they can group and find them again.
 *
 * It is not a sharing mechanism and not a team. A workspace belongs to exactly
 * one user, only that user can see it, and filing a document into one changes
 * nothing about who can open that document — sharing is entirely the business
 * of Document.collaborators.
 *
 * There was a `members` array here. It granted nothing, no endpoint could add
 * to it, and it always held exactly one id (the owner), so its only effect was
 * to imply a capability the product does not have. Removed rather than left as
 * a "future extension point": under this definition it is not a step towards
 * anything, and every owner-or-member check it fed collapsed to owner-only.
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
    },
    { timestamps: true }
);

module.exports = mongoose.model("Workspace", workspaceSchema);