/**
 * server/test/history-coalescing.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure unit tests for historyService.coalesceOperations — no database needed.
 *
 * The behaviour being pinned: the op log stays one row per keystroke (OT
 * catch-up and restore depend on it), while the history panel shows readable
 * entries. Before this, `limit=20` returned the last twenty CHARACTERS typed,
 * which is why only one collaborator ever appeared in the panel.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { coalesceOperations, DEFAULT_WINDOW_MS } = require("../src/services/historyService");

const ALICE = { _id: "u-alice", name: "Alice Adams" };
const BOB = { _id: "u-bob", name: "Bob Brown" };

const t0 = new Date("2026-01-01T12:00:00Z").getTime();
const at = (secondsAgo) => new Date(t0 - secondsAgo * 1000);

/** One typed character at `revision`, `secondsAgo` before t0. */
const typed = (revision, user, char, secondsAgo) => ({
  _id: `op-${revision}`,
  revision,
  userId: user,
  appliedAt: at(secondsAgo),
  op: { type: "insert", pos: 0, text: char },
});
const deleted = (revision, user, len, secondsAgo) => ({
  _id: `op-${revision}`,
  revision,
  userId: user,
  appliedAt: at(secondsAgo),
  op: { type: "delete", pos: 0, len },
});

/** Descending by revision — the order getHistory fetches in. */
const desc = (ops) => [...ops].sort((a, b) => b.revision - a.revision);

describe("coalescing consecutive edits by one author", () => {
  test("a typing run becomes a single entry", () => {
    const ops = desc([
      typed(1, ALICE, "h", 10), typed(2, ALICE, "e", 9), typed(3, ALICE, "l", 8),
      typed(4, ALICE, "l", 7), typed(5, ALICE, "o", 6),
    ]);
    const [entry, ...rest] = coalesceOperations(ops);

    assert.equal(rest.length, 0, "five keystrokes, one entry");
    assert.equal(entry.opCount, 5);
    assert.equal(entry.fromRevision, 1);
    assert.equal(entry.toRevision, 5);
    assert.equal(entry.inserted, 5);
    assert.equal(entry.removed, 0);
    assert.equal(entry.author.name, "Alice Adams");
    assert.equal(entry.author.initials, "AA");
    assert.match(entry.description, /5 characters added/);
  });

  test("a different author starts a new entry", () => {
    const ops = desc([
      typed(1, ALICE, "a", 10), typed(2, ALICE, "b", 9),
      typed(3, BOB, "c", 8),
      typed(4, ALICE, "d", 7),
    ]);
    const entries = coalesceOperations(ops);

    assert.equal(entries.length, 3, "alice | bob | alice");
    assert.deepEqual(entries.map((e) => e.author.name), ["Alice Adams", "Bob Brown", "Alice Adams"]);
    // Newest first.
    assert.equal(entries[0].revision, 4);
    assert.equal(entries[2].fromRevision, 1);
  });

  test("BOTH collaborators appear — the symptom that started this", () => {
    // Alice types 30 characters, Bob types 5. At limit=20 over raw ops, Bob was
    // never visible; grouped, both are.
    const ops = desc([
      ...Array.from({ length: 30 }, (_, i) => typed(i + 1, ALICE, "x", 60 - i)),
      ...Array.from({ length: 5 }, (_, i) => typed(31 + i, BOB, "y", 25 - i)),
    ]);
    const entries = coalesceOperations(ops);
    const names = new Set(entries.map((e) => e.author.name));
    assert.ok(names.has("Alice Adams") && names.has("Bob Brown"));
    assert.equal(entries.length, 2);
  });

  test("a gap in the revision range breaks the group", () => {
    // Something else occupied the missing revision, so these are not one run.
    const ops = desc([typed(1, ALICE, "a", 10), typed(3, ALICE, "b", 9)]);
    assert.equal(coalesceOperations(ops).length, 2);
  });

  test("insertions and deletions are counted separately", () => {
    const ops = desc([
      typed(1, ALICE, "a", 10), typed(2, ALICE, "b", 9),
      deleted(3, ALICE, 3, 8),
    ]);
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.inserted, 2);
    assert.equal(entry.removed, 3);
    assert.match(entry.description, /2 characters added, 3 removed/);
  });

  test("a batch op contributes the sum of its parts", () => {
    const ops = [{
      _id: "op-1", revision: 1, userId: ALICE, appliedAt: at(5),
      op: { type: "batch", ops: [{ type: "delete", pos: 0, len: 4 }, { type: "delete", pos: 9, len: 2 }] },
    }];
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.removed, 6);
    assert.equal(entry.inserted, 0);
  });

  test("newlines count as the characters they are", () => {
    const ops = desc([typed(1, ALICE, "a", 10), typed(2, ALICE, "\n", 9), typed(3, ALICE, "b", 8)]);
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.inserted, 3, "a newline is one character, not a structural event");
  });
});

describe("the session window", () => {
  test("edits inside the window join", () => {
    const ops = desc([typed(1, ALICE, "a", 100), typed(2, ALICE, "b", 40)]);
    assert.equal(coalesceOperations(ops, { windowMs: 120_000 }).length, 1);
  });

  test("edits separated by more than the window split", () => {
    // Same author, contiguous revisions, but ten minutes apart: two sessions.
    const ops = desc([typed(1, ALICE, "a", 700), typed(2, ALICE, "b", 10)]);
    const entries = coalesceOperations(ops, { windowMs: 120_000 });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].revision, 2);
    assert.equal(entries[1].revision, 1);
  });

  test("the window is measured against the group's OLDEST op, so a long run stays one entry", () => {
    // 60 keystrokes one second apart spans 60s — inside a 2-minute window.
    const ops = desc(Array.from({ length: 60 }, (_, i) => typed(i + 1, ALICE, "x", 60 - i)));
    assert.equal(coalesceOperations(ops).length, 1);
  });

  test("default window is two minutes", () => {
    assert.equal(DEFAULT_WINDOW_MS, 120_000);
  });
});

describe("entries stay restorable", () => {
  test("the entry id is the newest operation in the group", () => {
    const ops = desc([typed(1, ALICE, "a", 10), typed(2, ALICE, "b", 9), typed(3, ALICE, "c", 8)]);
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.id, "op-3", "restoring this entry restores to the end of the run");
    assert.equal(entry.revision, 3);
  });

  test("the underlying revision range is preserved for pagination", () => {
    const ops = desc([typed(5, ALICE, "a", 10), typed(6, ALICE, "b", 9), typed(7, BOB, "c", 8)]);
    const entries = coalesceOperations(ops);
    assert.equal(entries[0].fromRevision, 7);
    assert.equal(entries[1].fromRevision, 5);
    assert.equal(entries[1].toRevision, 6);
  });
});

describe("restores are never folded into a typing run", () => {
  const restore = (revision, user, toRevision, secondsAgo) => ({
    _id: `op-${revision}`, revision, userId: user, appliedAt: at(secondsAgo),
    op: { type: "restore", toRevision, length: 10 },
  });

  test("a restore is its own entry even between edits by the same author", () => {
    const ops = desc([
      typed(1, ALICE, "a", 12), typed(2, ALICE, "b", 11),
      restore(3, ALICE, 1, 10),
      typed(4, ALICE, "c", 9),
    ]);
    const entries = coalesceOperations(ops);
    assert.equal(entries.length, 3);
    assert.match(entries[1].description, /Restored the document to revision 1/);
    assert.equal(entries[1].opCount, 1);
  });

  test("consecutive restores do not merge with each other", () => {
    const ops = desc([restore(1, ALICE, 0, 10), restore(2, ALICE, 1, 9)]);
    assert.equal(coalesceOperations(ops).length, 2);
  });
});

describe("edge cases", () => {
  test("an empty log yields no entries", () => {
    assert.deepEqual(coalesceOperations([]), []);
    assert.deepEqual(coalesceOperations(undefined), []);
  });

  test("a missing author does not throw", () => {
    const ops = [{ _id: "op-1", revision: 1, userId: null, appliedAt: at(1), op: { type: "insert", pos: 0, text: "x" } }];
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.author.name, "Unknown");
    assert.equal(entry.author.initials, "?");
  });

  test("a noop contributes nothing but still forms an entry", () => {
    const ops = [{ _id: "op-1", revision: 1, userId: ALICE, appliedAt: at(1), op: { type: "noop" } }];
    const [entry] = coalesceOperations(ops);
    assert.equal(entry.inserted, 0);
    assert.equal(entry.removed, 0);
    assert.equal(entry.description, "No net change");
  });

  test("entries come back newest first", () => {
    const ops = desc([typed(1, ALICE, "a", 30), typed(2, BOB, "b", 20), typed(3, ALICE, "c", 10)]);
    const revisions = coalesceOperations(ops).map((e) => e.revision);
    assert.deepEqual(revisions, [3, 2, 1]);
  });
});
