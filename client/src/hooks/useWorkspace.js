/**
 * hooks/useWorkspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace CRUD via the REST API. Mirrors the shape of useDocument.js.
 *
 * Usage:
 *   const { workspaces, loading, loadWorkspaces, createWorkspace, deleteWorkspace } = useWorkspace();
 */

import { useState, useCallback } from "react";
import api from "../services/api";

export function useWorkspace() {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadWorkspaces = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get("/workspaces");
            setWorkspaces(data.workspaces ?? []);
            return data;
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to load workspaces");
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const createWorkspace = useCallback(async (name, color) => {
        try {
            const { data } = await api.post("/workspaces", { name, color });
            setWorkspaces((prev) => [...prev, data]);
            return data;
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to create workspace");
            return null;
        }
    }, []);

    const updateWorkspace = useCallback(async (id, patch) => {
        try {
            const { data } = await api.patch(`/workspaces/${id}`, patch);
            setWorkspaces((prev) => prev.map((w) => (w._id ?? w.id) === id ? data : w));
            return data;
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to update workspace");
            return null;
        }
    }, []);

    const deleteWorkspace = useCallback(async (id) => {
        try {
            await api.delete(`/workspaces/${id}`);
            setWorkspaces((prev) => prev.filter((w) => (w._id ?? w.id) !== id));
            return true;
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to delete workspace");
            return false;
        }
    }, []);

    return {
        workspaces,
        loading,
        error,
        loadWorkspaces,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
    };
}