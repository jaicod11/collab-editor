/**
 * server/src/controllers/authController.js — updated
 * ─────────────────────────────────────────────────────────────────────────────
 * Added three new endpoints to support the Settings page:
 *   PATCH  /api/auth/me        → update name / bio
 *   PATCH  /api/auth/password  → change password (requires current password)
 *   DELETE /api/auth/me        → delete account permanently
 *
 * Existing endpoints (register, login, logout) are unchanged.
 * `me` now also returns `bio`.
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const redisService = require("../services/redisService");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES ?? "7d";

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const user = await User.create({ name, email, password });
    const token = signToken(user);

    await redisService.setSession(user._id.toString(), { id: user._id, name, email });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);
    await redisService.setSession(user._id.toString(), {
      id: user._id, name: user.name, email: user.email,
    });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio ?? "",
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/auth/me ─────────────────────────────────────────────────────────
// Updates editable profile fields. Email is intentionally NOT editable here —
// changing it safely requires re-verification, which is out of scope for now.
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: "Name cannot be empty" });
      updates.name = name.trim();
    }
    if (bio !== undefined) {
      updates.bio = bio.trim().slice(0, 280);
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio ?? "",
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/auth/password ──────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = newPassword; // pre-save hook re-hashes it automatically
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/auth/me ───────────────────────────────────────────────────────
// Permanently deletes the account. Note: this does NOT cascade-delete the
// user's documents or workspaces — consider adding that cleanup separately
// if you want a true "scorched earth" delete.
exports.deleteAccount = async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    await redisService.deleteSession(req.user.id);
    res.json({ message: "Account deleted" });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    await redisService.deleteSession(req.user.id);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
};