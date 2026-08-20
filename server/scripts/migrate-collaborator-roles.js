/**
 * server/scripts/migrate-collaborator-roles.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrates Document.collaborators from [ObjectId] to [{ user, role, addedAt }].
 *
 *   node scripts/migrate-collaborator-roles.js [--dry-run]
 *
 * Everyone currently in the array becomes an "editor". That is not a policy
 * choice so much as a statement of fact: before this change every collaborator
 * could edit, and the Can edit / Can view badge in the UI was computed from
 * ObjectId parity rather than from anything stored. Making them all editors
 * preserves the behaviour people actually had; downgrading anyone to viewer is
 * a decision for the document's owner, not for a migration.
 *
 * Idempotent — entries already in the new shape are left alone.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const mongoose = require("mongoose");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  console.log(`[migrate-roles] connected to ${mongoose.connection.name}${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Work through the raw driver: the Mongoose schema now describes the NEW
  // shape, so reading legacy rows through the model would cast them away.
  const collection = mongoose.connection.db.collection("documents");

  const cursor = collection.find({ collaborators: { $exists: true, $ne: [] } });
  let scanned = 0;
  let migrated = 0;
  let alreadyNew = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const entries = doc.collaborators ?? [];

    // New-shape entries are subdocuments with a `user` field.
    const legacy = entries.filter((e) => e && !e.user);
    if (legacy.length === 0) {
      alreadyNew += 1;
      continue;
    }

    const converted = entries.map((e) =>
      e && e.user
        ? e
        : { user: e, role: "editor", addedAt: doc.createdAt ?? new Date() }
    );

    console.log(`  ${doc._id}: ${legacy.length} legacy entr${legacy.length === 1 ? "y" : "ies"} -> editor`);
    if (!DRY_RUN) {
      await collection.updateOne({ _id: doc._id }, { $set: { collaborators: converted } });
    }
    migrated += 1;
  }

  console.log(
    `\n[migrate-roles] scanned ${scanned}, migrated ${migrated}, already current ${alreadyNew}` +
    (DRY_RUN ? " — nothing written" : "")
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate-roles] failed:", err.message);
  process.exit(1);
});
