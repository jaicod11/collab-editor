/**
 * server/src/socket/rooms.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory room state manager.
 * Tracks which users are currently in which document rooms.
 *
 * Why in-memory?
 *   Socket.io's built-in room tracking tells you which socket IDs are in a
 *   room, but not the user metadata (name, colour) associated with each.
 *   This module bridges that gap without a Redis round-trip on every
 *   presence query.
 *
 * For multi-node deployments: replace the Map with a Redis hash
 *   (HSET doc:members:{docId} {userId} {json}) so all nodes share state.
 *
 * Usage (in documentHandler.js):
 *   const rooms = require("../rooms");
 *   rooms.join("docABC", { userId, name, socketId });
 *   rooms.getMembers("docABC");   // → [{ userId, name, socketId }]
 *   rooms.leave("docABC", socketId);
 */

// Map<docId, Map<socketId, MemberInfo>>
const roomMap = new Map();

/**
 * Add a user to a document room.
 * @param {string} docId
 * @param {{ userId: string, name: string, socketId: string }} member
 */
function join(docId, member) {
    if (!roomMap.has(docId)) roomMap.set(docId, new Map());
    roomMap.get(docId).set(member.socketId, {
        userId: member.userId,
        name: member.name,
        initials: member.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2),
        socketId: member.socketId,
        joinedAt: Date.now(),
    });
}

/**
 * Remove a socket from all rooms it was in.
 * Called on "disconnecting".
 * @param {string} socketId
 * @returns {string[]} docIds the socket was removed from
 */
function leaveAll(socketId) {
    const affected = [];
    for (const [docId, members] of roomMap.entries()) {
        if (members.has(socketId)) {
            members.delete(socketId);
            affected.push(docId);
            // Cleanup empty rooms
            if (members.size === 0) roomMap.delete(docId);
        }
    }
    return affected;
}

/**
 * Remove a specific socket from a specific room.
 * @param {string} docId
 * @param {string} socketId
 */
function leave(docId, socketId) {
    const members = roomMap.get(docId);
    if (!members) return;
    members.delete(socketId);
    if (members.size === 0) roomMap.delete(docId);
}

/**
 * Get all members currently in a document room.
 * @param {string} docId
 * @returns {Array<{ userId, name, initials, socketId, joinedAt }>}
 */
function getMembers(docId) {
    const members = roomMap.get(docId);
    if (!members) return [];
    return Array.from(members.values());
}

/**
 * Get the count of unique users in a room (de-duplicates multi-tab sessions).
 * @param {string} docId
 * @returns {number}
 */
function getUserCount(docId) {
    const members = getMembers(docId);
    return new Set(members.map((m) => m.userId)).size;
}

/**
 * Check if a specific user is currently in a room.
 * @param {string} docId
 * @param {string} userId
 * @returns {boolean}
 */
function hasUser(docId, userId) {
    return getMembers(docId).some((m) => m.userId === userId);
}

/**
 * Get all docIds with at least one active member.
 * Useful for metrics / admin.
 * @returns {string[]}
 */
function getActiveRooms() {
    return Array.from(roomMap.keys());
}

module.exports = { join, leave, leaveAll, getMembers, getUserCount, hasUser, getActiveRooms };