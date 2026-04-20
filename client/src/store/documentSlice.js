/**
 * store/documentSlice.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand document store.
 * Tracks the document list (dashboard) and the active document (editor).
 *
 * Usage:
 *   import { useDocumentStore } from "./documentSlice";
 *   const { documents, activeDocument, setDocuments, ... } = useDocumentStore();
 */

import { create } from "zustand";

export const useDocumentStore = create((set, get) => ({
  // ── Document list (DocumentDashboard) ─────────────────────────────────────
  documents:  [],
  recentDocs: [],
  loading:    false,
  error:      null,

  setDocuments:  (documents)  => set({ documents }),
  setRecentDocs: (recentDocs) => set({ recentDocs }),
  setLoading:    (loading)    => set({ loading }),
  setError:      (error)      => set({ error }),

  addDocument: (doc) =>
    set((s) => ({ documents: [doc, ...s.documents] })),

  updateDocument: (id, patch) =>
    set((s) => ({
      documents: s.documents.map((d) =>
        (d._id ?? d.id) === id ? { ...d, ...patch } : d
      ),
    })),

  removeDocument: (id) =>
    set((s) => ({
      documents: s.documents.filter((d) => (d._id ?? d.id) !== id),
    })),

  // ── Active document (EditorPage) ──────────────────────────────────────────
  activeDocument: null,  // { _id, title, content, revision, status, ... }

  setActiveDocument: (doc)   => set({ activeDocument: doc }),
  clearActiveDocument: ()    => set({ activeDocument: null }),

  updateActiveTitle: (title) =>
    set((s) => ({
      activeDocument: s.activeDocument ? { ...s.activeDocument, title } : null,
    })),

  updateActiveContent: (content, revision) =>
    set((s) => ({
      activeDocument: s.activeDocument
        ? { ...s.activeDocument, content, revision }
        : null,
    })),

  // ── Helpers ───────────────────────────────────────────────────────────────
  getDocById: (id) =>
    get().documents.find((d) => (d._id ?? d.id) === id) ?? null,
}));
