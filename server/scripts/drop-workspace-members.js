/**
 * server/scripts/drop-workspace-members.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Removes the vestigial `members` array from every workspace.
 *
 *   node scripts/drop-workspace-members.js --dry-run
 *   node scripts/drop-workspace-members.js
 *
 * A workspace is a private organisational category belonging to one user. The
 * `members` array granted nothing, no endpoint could ever add to it, and it
 * always held exactly one id — the owner. It was removed from the schema
 * because leaving it implied a sharing capability the product does not have.
 *
 * Mongoose hydrates fields that are on disk but not in the schema, and the list
 * endpoint uses .lean(), so those arrays would otherwise keep being returned by
 * the API. The controller now projects the field out, which makes the contract
 * true whether or not this has run; this script removes the dead data itself.
 *
 * Idempotent, and safe to run while the app is serving: no code reads the field.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const mongoose = require("mongoose");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  const workspaces = mongoose.connection.db.collection("workspaces");
  console.log(`[drop-workspace-members] connected to ${mongoose.connection.name}`);

  const affected = await workspaces.countDocuments({ members: { $exists: true } });
  const total = await workspaces.countDocuments();
  console.log(`  workspaces          : ${total}`);
  console.log(`  carrying members    : ${affected}`);

  // Anything other than a lone owner id would mean the field was doing
  // something after all, so it is reported rather than silently discarded.
  const unexpected = await workspaces
    .find({ $expr: { $gt: [{ $size: { $ifNull: ["$members", []] } }, 1] } })
    .project({ _id: 1, name: 1, members: 1 })
    .toArray();

  if (unexpected.length) {
    console.log(`\n  ⚠ ${unexpected.length} workspace(s) have more than one member:`);
    for (const w of unexpected) console.log(`      ${w._id} "${w.name}" → ${w.members.length} members`);
    console.log("    Review these before proceeding — the field was expected to be vestigial.");
  }

  if (DRY_RUN) {
    console.log(`\n[drop-workspace-members] dry run — would unset ${affected} array(s)`);
  } else {
    const { modifiedCount } = await workspaces.updateMany(
      { members: { $exists: true } },
      { $unset: { members: "" } }
    );
    console.log(`\n[drop-workspace-members] unset ${modifiedCount} array(s)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[drop-workspace-members] failed:", err.message);
  process.exit(1);
});
