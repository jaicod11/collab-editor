/**
 * server/src/controllers/workspaceController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A workspace is a PRIVATE organisational category — see models/Workspace.js.
 * Every route here is therefore scoped to `owner: req.user.id`, with no
 * membership dimension: there is nobody else who can see a workspace.
 *
 * GET    /api/workspaces      → list the current user's workspaces
 * POST   /api/workspaces      → create a new workspace
 * PATCH  /api/workspaces/:id  → rename / recolor (owner only)
 * DELETE /api/workspaces/:id  → delete (owner only)
 */

const Workspace = require("../models/Workspace");
const Document = require("../models/Document");
const redisService = require("../services/redisService");

// ── GET /api/workspaces ───────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // `-members` is defensive, not cosmetic. Rows created before the field
        // was removed still carry it on disk, and Mongoose hydrates unknown
        // fields rather than dropping them — .lean() below returns the raw
        // document outright. Without this projection the API would keep
        // advertising a membership capability that no longer exists, on every
        // pre-existing workspace, until scripts/drop-workspace-members.js has
        // run. The projection makes the contract true immediately; the script
        // removes the dead data.
        const workspaces = await Workspace.find({ owner: userId })
            .select("-members")
            .sort({ createdAt: 1 })
            .lean();

        res.json({ workspaces });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/workspaces ──────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
    try {
        const { name, color } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Workspace name is required" });
        }

        const workspace = await Workspace.create({
            name: name.trim(),
            color: color || "#22c55e",
            owner: req.user.id,
        });

        res.status(201).json(workspace);
    } catch (err) {
        next(err);
    }
};

// ── PATCH /api/workspaces/:id ─────────────────────────────────────────────────
exports.update = async (req, res, next) => {
    try {
        const { name, color } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (color !== undefined) updates.color = color;

        const workspace = await Workspace.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id }, // only the owner can edit
            updates,
            { new: true, runValidators: true, projection: { members: 0 } }
        );

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found or access denied" });
        }

        res.json(workspace);
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/workspaces/:id ────────────────────────────────────────────────
exports.remove = async (req, res, next) => {
    try {
        const workspace = await Workspace.findOneAndDelete({
            _id: req.params.id,
            owner: req.user.id, // only the owner can delete
        });

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found or access denied" });
        }

        // ── Unfile, never cascade ────────────────────────────────────────────
        // Deleting a folder must not delete what is in it. The alternative —
        // blocking deletion while non-empty — was rejected because it makes
        // tidying up a chore and leaves dead workspaces behind, and because
        // "no workspace" is already a valid resting state for a document.
        //
        // Filtering on the workspace id alone is exact: only a document's owner
        // can file it, and only into a workspace they own, so everything here
        // belongs to this same user. The filter stays on the id rather than
        // gaining a redundant owner clause, which also makes it correct for any
        // row that predates that rule.
        //
        // The ids are collected BEFORE the update: afterwards these documents
        // no longer match the filter, and their cached canonical shape still
        // carries the old workspace id, so the cache has to be invalidated by
        // id rather than re-derived.
        const affected = await Document.find({ workspace: workspace._id }, { _id: 1 }).lean();

        const { modifiedCount } = await Document.updateMany(
            { workspace: workspace._id },
            { $set: { workspace: null } }
        );

        await Promise.all(
            affected.map((d) => redisService.invalidateDocCache(d._id.toString()))
        );

        res.json({ message: "Workspace deleted", unfiled: modifiedCount ?? 0 });
    } catch (err) {
        next(err);
    }
};