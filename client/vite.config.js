import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(here, "../shared");

export default defineConfig({
  plugins: [react()],
  // shared/ot is the SINGLE source of truth for the OT algorithm; the client
  // imports it rather than restating it. Vite needs the alias plus fs.allow
  // because the directory sits outside the client root.
  resolve: { alias: { "@shared": sharedDir } },
  server: {
    fs: { allow: [here, sharedDir] },
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
