/**
 * server/test/persistence.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence-layer coverage that needs real Redis and MongoDB.
 * Runs against the LOCAL dev stack only (infra/docker-compose.dev.yml).
 *
 *   docker compose -f infra/docker-compose.dev.yml up -d
 *   npm --prefix server test
 *
 * Skips itself if the local stack is unreachable rather than failing, so the
 * shared OT suite can still run on a machine without Docker.
 */

require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const REDIS_URL = process.env.REDIS_URL ?? "";
const MONGODB_URI = process.env.MONGODB_URI ?? "";

// Hard guard: these tests delete data. They must never touch a remote host.
const isLocal = (url) => /(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (!isLocal(REDIS_URL) || !isLocal(MONGODB_URI)) {
  throw new Error(
    `Refusing to run persistence tests against a non-local target.\n` +
    `  MONGODB_URI=${MONGODB_URI.replace(/\/\/[^@]*@/, "//")}\n` +
    `  REDIS_URL=${REDIS_URL.replace(/\/\/[^@]*@/, "//")}\n` +
    `Copy server/.env.local.example to server/.env.local first.`
  );
}

const { redisClient, redisSub, connectRedis } = require("../src/config/redis");
const redisService = require("../src/services/redisService");
const snapshotService = require("../src/services/snapshotService");
const Operation = require("../src/models/Operation");
const Snapshot = require("../src/models/Snapshot");
const { transform } = require("../../shared/ot/operations.js");

const DOC = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();

/** A real batch: delete(2,6) split by a concurrent insert at 5. */
function makeBatch() {
  const [, split] = transform(
    { type: "insert", pos: 5, text: "XY", site: "b" },
    { type: "delete", pos: 2, len: 6, site: "a" }
  );
  return split;
}

before(async () => {
  await mongoose.connect(MONGODB_URI);
  await connectRedis();
});

// Pushing 520 ops one at a time is three Redis round trips each; give the
// boundary tests room rather than letting the default timeout cut them off.
const SLOW = { timeout: 60_000 };

after(async () => {
  await Operation.deleteMany({ docId: DOC });
  await Snapshot.deleteMany({ docId: DOC });
  await redisClient.del(`doc:ops:${DOC}`);
  await mongoose.disconnect();
  // connectRedis() opens TWO clients; both must close or the test process
  // keeps an open handle and never exits.
  await Promise.all([redisClient.quit(), redisSub.quit()]);
});

describe("redisService.getOpsRange — batch on a partial-trim boundary", () => {
  const key = `doc:ops:${DOC}`;

  test("a batch survives the Redis cache round trip", async () => {
    await redisClient.del(key);
    const batch = makeBatch();
    await redisService.pushOp(DOC.toString(), batch, 1);

    const [got] = await redisService.getOpsRange(DOC.toString(), 0, 1);
    assert.deepEqual(got, batch, "batch must come back byte-identical");
  });

  test("a range fully inside the retained window is served from Redis", async () => {
    await redisClient.del(key);
    for (let rev = 1; rev <= 10; rev++) {
      await redisService.pushOp(DOC.toString(), { type: "insert", pos: 0, text: `${rev}` }, rev);
    }
    const ops = await redisService.getOpsRange(DOC.toString(), 3, 7);
    assert.equal(ops.length, 4, "revisions 4..7");
    assert.deepEqual(ops.map((o) => o.text), ["4", "5", "6", "7"]);
  });

  test("a range starting BEFORE the trim boundary reports a gap, not partial data", SLOW, async () => {
    // MAX_OPS_CACHED is 500, so pushing 520 trims the oldest 20 away. Asking
    // from revision 0 can no longer be served, and getOpsRange must say so by
    // returning [] — a partial answer would silently transform an op against an
    // incomplete concurrent set.
    await redisClient.del(key);
    const batchAt = 15; // batch sits in the trimmed-away region
    for (let rev = 1; rev <= 520; rev++) {
      const op = rev === batchAt ? makeBatch() : { type: "insert", pos: 0, text: "x" };
      await redisService.pushOp(DOC.toString(), op, rev);
    }
    const cachedCount = await redisClient.lLen(key);
    assert.equal(cachedCount, 500, "list trimmed to MAX_OPS_CACHED");

    const gap = await redisService.getOpsRange(DOC.toString(), 0, 520);
    assert.deepEqual(gap, [], "must report a gap so the caller falls back to MongoDB");

    // A range that IS covered still works, including one spanning the boundary.
    const covered = await redisService.getOpsRange(DOC.toString(), 100, 105);
    assert.equal(covered.length, 5);
  });

  test("a batch retained just inside the boundary is still returned intact", SLOW, async () => {
    await redisClient.del(key);
    const batch = makeBatch();
    // 520 pushes trims to revisions 21..520; put the batch at 21, the very edge.
    for (let rev = 1; rev <= 520; rev++) {
      const op = rev === 21 ? batch : { type: "insert", pos: 0, text: "x" };
      await redisService.pushOp(DOC.toString(), op, rev);
    }
    const ops = await redisService.getOpsRange(DOC.toString(), 20, 22);
    assert.ok(ops.length >= 1, "boundary range is covered");
    assert.deepEqual(ops[0], batch, "the boundary batch is intact");
  });
});

describe("MongoDB fallback round trip", () => {
  test("a batch persisted to the op log reads back usable as a transform operand", async () => {
    await Operation.deleteMany({ docId: DOC });
    const batch = makeBatch();

    await Operation.create({ docId: DOC, userId: USER, revision: 1, op: batch });
    const [row] = await Operation.find({ docId: DOC, revision: { $gt: 0, $lte: 1 } }).lean();

    assert.equal(row.op.type, "batch");
    assert.equal(row.op.ops.length, batch.ops.length);

    // The Mixed field must survive well enough to drive a transform — this is
    // exactly what op:submit does with the fallback result.
    const incoming = { type: "insert", pos: 0, text: "!", site: "c" };
    assert.deepEqual(transform(incoming, row.op), transform(incoming, batch));
  });
});

describe("snapshotService.contentAtRevision", () => {
  test("uses the nearest snapshot AT OR BEFORE the target, not the newest", async () => {
    await Operation.deleteMany({ docId: DOC });
    await Snapshot.deleteMany({ docId: DOC });

    // Build a history: "" -> A -> AB -> ABC -> ABCD
    for (let i = 0; i < 4; i++) {
      await Operation.create({
        docId: DOC, userId: USER, revision: i + 1,
        op: { type: "insert", pos: i, text: String.fromCharCode(65 + i) },
      });
    }
    await snapshotService.save(DOC, "AB", 2);
    await snapshotService.save(DOC, "ABCD", 4); // newer snapshot

    // Asking for revision 3 must NOT return the rev-4 snapshot's content.
    const atThree = await snapshotService.contentAtRevision(DOC, 3);
    assert.equal(atThree, "ABC", "replayed forward from the rev-2 snapshot");

    const atTwo = await snapshotService.contentAtRevision(DOC, 2);
    assert.equal(atTwo, "AB");

    const atFour = await snapshotService.contentAtRevision(DOC, 4);
    assert.equal(atFour, "ABCD");
  });

  test("reconstructs from revision 0 when no snapshot exists", async () => {
    await Snapshot.deleteMany({ docId: DOC });
    assert.equal(await snapshotService.contentAtRevision(DOC, 3), "ABC");
  });

  test("a corrupt op surfaces as an error instead of a wrong document", async () => {
    await Operation.deleteMany({ docId: DOC });
    await Snapshot.deleteMany({ docId: DOC });
    await Operation.create({ docId: DOC, userId: USER, revision: 1, op: { type: "insert", pos: 0, text: "ok" } });
    // `op` is Mixed, so a malformed row is representable and must not be skipped.
    await Operation.collection.insertOne({ docId: DOC, userId: USER, revision: 2, op: { type: "insert", pos: 0 } });

    await assert.rejects(
      () => snapshotService.contentAtRevision(DOC, 2),
      (err) => err.code === "REPLAY_FAILED" && err.detail.failedRevision === 2,
      "must throw rather than silently returning a partially-applied document"
    );
  });

  test("restore markers are skipped during replay", async () => {
    await Operation.deleteMany({ docId: DOC });
    await Snapshot.deleteMany({ docId: DOC });
    await Operation.create({ docId: DOC, userId: USER, revision: 1, op: { type: "insert", pos: 0, text: "hi" } });
    await Operation.create({ docId: DOC, userId: USER, revision: 2, op: { type: "restore", toRevision: 1, length: 2 } });
    assert.equal(await snapshotService.contentAtRevision(DOC, 2), "hi");
  });
});
