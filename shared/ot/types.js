/**
 * shared/ot/types.js
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript-style JSDoc type definitions for OT operations.
 * Used as documentation / IDE hints — no runtime code.
 *
 * @typedef {{ type: "insert", pos: number, text: string }} InsertOp
 * @typedef {{ type: "delete", pos: number, len: number  }} DeleteOp
 * @typedef {InsertOp | DeleteOp} Op
 *
 * @typedef {{
 *   docId:    string,
 *   op:       Op,
 *   revision: number,
 *   userId:   string,
 * }} OpPayload   — emitted by client via "op:submit"
 *
 * @typedef {{
 *   op:       Op,
 *   revision: number,
 * }} OpAck       — emitted by server via "op:ack"
 *
 * @typedef {{
 *   op:       Op,
 *   revision: number,
 *   userId:   string,
 * }} OpBroadcast — emitted by server via "op:broadcast"
 */

// No exports — types only
