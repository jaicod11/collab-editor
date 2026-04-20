/**
 * controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/auth/register  → create user, return JWT
 * POST /api/auth/login     → verify credentials, return JWT
 * GET  /api/auth/me        → return current user from token
 * POST /api/auth/logout    → delete Redis session
 */

const jwt          = require("jsonwebtoken");
const User         = require("../models/User");
const redisService = require("../services/redisService");

const JWT_SECRET  = process.env.JWT_SECRET;
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

    const user  = await User.create({ name, email, password });
    const token = signToken(user);

    // Cache session in Redis
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

    // +password because it's select: false in schema
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
    res.json({ id: user._id, name: user.name, email: user.email, avatar: user.avatar });
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
