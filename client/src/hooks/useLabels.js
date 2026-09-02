/**
 * hooks/useLabels.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reading and writing document labels.
 *
 * Two things live here so no page reimplements them:
 *
 *   - `inUse`: every label across the documents this user can see, from
 *     GET /api/documents/labels/in-use. Derived server-side from the documents
 *     themselves, so there is no label vocabulary to keep in sync and nothing
 *     to clean up when the last document carrying a label drops it.
 *   - `saveLabels`: PUT the whole set for one document. The server normalises
 *     (trim, collapse, lowercase, de-duplicate, cap) and returns what it
 *     actually stored, which is what callers must render — otherwise the chips
 *     on screen disagree with what the filter will match.
 *
 * Viewers get 403 from the write path. That is enforced server-side; the UI
 * hides the control as a convenience, never as the protection.
 */

import { useState, useCallback } from "react";
import api from "../services/api";

export function useLabels() {
  const [inUse, setInUse] = useState([]);
  const [loadingInUse, setLoadingInUse] = useState(false);

  const loadInUse = useCallback(async () => {
    setLoadingInUse(true);
    try {
      const { data } = await api.get("/documents/labels/in-use");
      setInUse(data.labels ?? []);
      return data.labels ?? [];
    } catch {
      return [];
    } finally {
      setLoadingInUse(false);
    }
  }, []);

  /**
   * Replace a document's labels.
   * @returns {Promise<{ok: boolean, labels?: string[], message?: string}>}
   */
  const saveLabels = useCallback(async (docId, labels) => {
    try {
      const { data } = await api.put(`/documents/${docId}/labels`, { labels });
      // Refresh the vocabulary: this write may have introduced a new label or
      // removed the last use of an old one.
      loadInUse();
      return { ok: true, labels: data.labels ?? [] };
    } catch (err) {
      const status = err.response?.status;
      return {
        ok: false,
        message:
          status === 403
            ? "You need edit access to change labels."
            : err.response?.data?.message ?? "Could not update labels.",
      };
    }
  }, [loadInUse]);

  return { inUse, loadingInUse, loadInUse, saveLabels };
}
