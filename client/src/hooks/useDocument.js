/**
 * hooks/useDocument.js — updated
 * ─────────────────────────────────────────────────────────────────────────────
 * Fix: createDoc() now accepts an optional `content` parameter and sends it
 * to the backend. Previously it only ever sent `title`, which meant the
 * "Duplicate" action in MyDocumentsPage.jsx silently created an EMPTY copy
 * instead of a real duplicate — the title had "(copy)" appended, but the
 * actual document body was blank.
 */

import { useState, useEffect, useCallback } from "react";
import { useDocumentStore } from "../store/documentSlice";
import api from "../services/api";

export function useDocument() {
  const { documents, setDocuments, addDocument, removeDocument, setLoading, loading } =
    useDocumentStore();
  const [error, setError] = useState(null);

  // ── Load all documents ────────────────────────────────────────────────────
  const loadDocuments = useCallback(async (filter = "all", search = "") => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/documents", { params: { filter, search } });
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
  const createDoc = useCallback(async (title = "Untitled Document", content = "") => {
    try {
      const { data } = await api.post("/documents", { title, content });
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
    deleteDoc,
  };
}