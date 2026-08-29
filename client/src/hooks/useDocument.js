/**
 * hooks/useDocument.js — updated
 * ─────────────────────────────────────────────────────────────────────────────
 * Fix: createDoc() now accepts an optional `content` parameter and sends it
 * to the backend. Previously it only ever sent `title`, which meant the
 * "Duplicate" action in MyDocumentsPage.jsx silently created an EMPTY copy
 * instead of a real duplicate — the title had "(copy)" appended, but the
 * actual document body was blank.
 */

import { useState, useCallback } from "react";
import { useDocumentStore } from "../store/documentSlice";
import api from "../services/api";

export function useDocument() {
  const { documents, setDocuments, addDocument, removeDocument, setLoading, loading } =
    useDocumentStore();
  const [error, setError] = useState(null);

  // ── Load all documents ────────────────────────────────────────────────────
  // `workspace` is an id, or the literal "unfiled" for documents in none. It is
  // omitted entirely when not filtering, so the unfiltered query keeps hitting
  // the index it already had.
  const loadDocuments = useCallback(async (filter = "all", search = "", workspace) => {
    setLoading(true);
    setError(null);
    try {
      const params = { filter, search };
      if (workspace) params.workspace = workspace;
      const { data } = await api.get("/documents", { params });
      setDocuments(data.documents);
      return data;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [setDocuments, setLoading]);

  // ── Create a new document ─────────────────────────────────────────────────
  // `content` is optional — pass it when duplicating an existing document
  // or creating from a template. Defaults to an empty string for a blank doc.
  const createDoc = useCallback(async (title = "Untitled Document", content = "", workspace = null) => {
    try {
      const body = { title, content };
      if (workspace) body.workspace = workspace;
      const { data } = await api.post("/documents", body);
      addDocument(data);
      return data;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to create document");
      return null;
    }
  }, [addDocument]);

  // ── Update document title ─────────────────────────────────────────────────
  const updateTitle = useCallback(async (docId, title) => {
    try {
      const { data } = await api.patch(`/documents/${docId}`, { title });
      return data;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to update title");
    }
  }, []);

  // ── File a document into a workspace (or out of one) ──────────────────────
  // Owner-only, enforced server-side: a collaborator's PATCH matches nothing
  // and comes back 404. Pass null to unfile.
  const setDocumentWorkspace = useCallback(async (docId, workspaceId) => {
    try {
      const { data } = await api.patch(`/documents/${docId}`, {
        workspace: workspaceId ?? null,
      });
      return data;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to move document");
      return null;
    }
  }, []);

  // ── Archive / restore / trash a document ──────────────────────────────────
  const updateStatus = useCallback(async (docId, status) => {
    try {
      const { data } = await api.patch(`/documents/${docId}`, { status });
      return data;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to update status");
    }
  }, []);

  // ── Delete a document (permanent) ─────────────────────────────────────────
  const deleteDoc = useCallback(async (docId) => {
    try {
      await api.delete(`/documents/${docId}`);
      removeDocument(docId);
      return true;
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to delete document");
      return false;
    }
  }, [removeDocument]);

  return {
    documents,
    loading,
    error,
    loadDocuments,
    createDoc,
    updateTitle,
    updateStatus,
    setDocumentWorkspace,
    deleteDoc,
  };
}