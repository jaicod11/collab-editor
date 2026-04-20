/**
 * config/db.js — MongoDB connection via Mongoose
 */
const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/collab-editor";
  await mongoose.connect(uri);
  console.log("[DB] MongoDB connected →", mongoose.connection.name);
}

module.exports = connectDB;
