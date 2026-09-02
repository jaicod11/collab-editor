/**
 * server/scripts/sync-indexes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Brings the database's indexes in line with the schemas.
 *
 *   node scripts/sync-indexes.js
 *
 * Mongoose creates new indexes automatically but NEVER drops ones you removed
 * from a schema, so the Phase 3 index changes need this to actually take
 * effect. It drops, in particular:
 *   - Document: the old { title: "text", content: "text" } index, replaced by a
 *     title-only one, so writes stop re-tokenising the whole body.
 *   - Operation: the redundant single-field { docId: 1 }, and the 90-day TTL on
 *     appliedAt that was deleting version history.
 *
 * Phase 11 ADDS two Document indexes for the workspace-filtered dashboard —
 * { owner, workspace, status, updatedAt } and the collaborators.user
 * equivalent. Without them that query examines 14.9 documents for every one it
 * returns (measured on 5000); with them, 1.0. They are additive: the existing
 * unfiltered indexes stay, because folding workspace into them would give the
 * unfiltered dashboard query an in-memory SORT.
 *
 * Phase 12 ADDS one more Document index for label filtering:
 * { owner, labels, status, updatedAt }. Filtering to one label goes from 496
 * documents examined per 100 returned (5.0x) to 100 (1.0x), with the unfiltered
 * dashboard query unchanged at 1.0x.
 *
 * There is deliberately no `collaborators.user` counterpart. A compound index
 * may contain at most one array field, and both `collaborators.user` and
 * `labels` are arrays, so MongoDB rejects that combination with
 * CannotIndexParallelArrays. The collaborator branch of the $or keeps using
 * { "collaborators.user", status, updatedAt } and applies the label as a
 * residual filter — which stays within the caller's own access scope, unlike a
 * standalone label index would.
 *
 * syncIndexes() drops-then-builds, so run it during a maintenance window on a
 * large collection: queries relying on an index are unindexed while it rebuilds.
 * It is safe to run repeatedly; it is a no-op once the database matches.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const mongoose = require("mongoose");

const Document = require("../src/models/Document");
const Operation = require("../src/models/Operation");
const Snapshot = require("../src/models/Snapshot");
const User = require("../src/models/User");
const Workspace = require("../src/models/Workspace");
// Both were missing from this map, so their indexes were only ever created
// implicitly by Mongoose on first use and never reconciled here.
const AccessRequest = require("../src/models/AccessRequest");
const Notification = require("../src/models/Notification");

const MODELS = { Document, Operation, Snapshot, User, Workspace, AccessRequest, Notification };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  console.log(`[sync-indexes] connected to ${mongoose.connection.name}`);

  for (const [name, model] of Object.entries(MODELS)) {
    const before = (await model.collection.indexes()).map((i) => i.name);
    const dropped = await model.syncIndexes();
    const after = (await model.collection.indexes()).map((i) => i.name);

    console.log(`\n[${name}]`);
    console.log(`  before : ${before.join(", ")}`);
    console.log(`  after  : ${after.join(", ")}`);
    if (dropped.length) console.log(`  dropped: ${dropped.join(", ")}`);
  }

  await mongoose.disconnect();
  console.log("\n[sync-indexes] done");
}

main().catch((err) => {
  console.error("[sync-indexes] failed:", err.message);
  process.exit(1);
});
