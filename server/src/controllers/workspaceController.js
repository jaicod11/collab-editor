/**
 * server/src/controllers/workspaceController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/workspaces      → list workspaces the current user owns or belongs to
 * POST   /api/workspaces      → create a new workspace
 * PATCH  /api/workspaces/:id  → rename / recolor (owner only)
 * DELETE /api/workspaces/:id  → delete (owner only)
 */

const Workspace = require("../models/Workspace");

// ── GET /api/workspaces ───────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const workspaces = await Workspace.find({
            $or: [{ owner: userId }, { members: userId }],
        })
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
            members: [req.user.id],
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
            { new: true, runValidators: true }
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

        res.json({ message: "Workspace deleted" });
    } catch (err) {
        next(err);
    }
};