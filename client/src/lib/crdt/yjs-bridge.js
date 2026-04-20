/**
 * lib/crdt/yjs-bridge.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional Yjs CRDT adapter.
 * Use this INSTEAD of useOT if you want CRDT-based sync (no server transforms).
 *
 * Yjs advantages over OT:
 *   ✓ No server-side transform needed — clients converge automatically
 *   ✓ Works offline + syncs on reconnect
 *   ✓ Handles complex rich-text operations via y-prosemirror / y-quill
 *
 * Install dependencies to activate:
 *   npm install yjs y-websocket
 *
 * Usage (in EditorPage.jsx — swap out useOT):
 *   const { yText, provider, connected } = useYjsBridge(docId);
 *   // Then bind yText to your editor (Quill, ProseMirror, CodeMirror, etc.)
 */

// import * as Y          from "yjs";
// import { WebsocketProvider } from "y-websocket";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";

/**
 * createYjsDoc(docId)
 * Returns a Yjs document + WebSocket provider pair for a given document room.
 *
 * @param {string} docId
 * @returns {{ ydoc, provider, yText }}
 */
export function createYjsDoc(docId) {
  // Uncomment when yjs is installed:
  //
  // const ydoc    = new Y.Doc();
  // const yText   = ydoc.getText("content");
  // const provider = new WebsocketProvider(
  //   `${WS_URL}/yjs`,   // point to your y-websocket server or the collab-editor server
  //   docId,
  //   ydoc,
  //   { connect: true }
  // );
  //
  // provider.on("status", ({ status }) => {
  //   console.log("[Yjs] WebSocket status:", status);
  // });
  //
  // return { ydoc, provider, yText };

  console.warn("[yjs-bridge] Yjs not installed. Install yjs + y-websocket to enable CRDT mode.");
  return { ydoc: null, provider: null, yText: null };
}

/**
 * destroyYjsDoc({ ydoc, provider })
 * Cleanly disconnects the provider and destroys the Yjs document.
 * Call this in a useEffect cleanup.
 */
export function destroyYjsDoc({ ydoc, provider }) {
  // provider?.destroy();
  // ydoc?.destroy();
}

/**
 * NOTE: OT vs CRDT choice
 * ─────────────────────────────────────────────────────────────────────────────
 * This project implements OT by default (useOT.js + otService.js on server).
 * The Yjs bridge here is provided as an upgrade path if you need:
 *   - Offline-first editing
 *   - Rich text with embedded media (y-prosemirror)
 *   - Awareness (cursor + presence natively in Yjs)
 *
 * To switch: replace useOT in EditorCore.jsx with useYjsBridge,
 * and remove the server-side OT transform pipeline.
 */
