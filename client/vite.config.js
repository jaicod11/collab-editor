// client/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls in dev so CORS is never an issue
      "/api": {
        target:      "http://localhost:4000",
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      "/socket.io": {
        target:      "http://localhost:4000",
        changeOrigin: true,
        ws:           true,
      },
    },
  },
});
