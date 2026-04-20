/**
 * store/index.js
 * Barrel re-export — old imports from "../store" still resolve.
 * Prefer importing directly from the slice file in new code.
 */
export { useAuthStore }     from "./authSlice";
export { useDocumentStore } from "./documentSlice";
