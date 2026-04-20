/**
 * models/Document.js
 */
const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Untitled Document" },
    content: { type: String, default: "" },
    revision: { type: Number, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["Active", "Archived"], default: "Active" },
    snapshot: {
      content: String,
      revision: Number,
      savedAt: Date,
    },
  },
  { timestamps: true }
);

documentSchema.index({ title: "text", content: "text" });

module.exports = mongoose.model("Document", documentSchema);

// Operation model is now in models/Operation.js — do NOT define it here