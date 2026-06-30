import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "os";
import path from "path";

// The web portal calls the API at /api; in dev we proxy that to the backend
// (port 4400) so there are no CORS hops. In production set VITE_API_BASE.
export default defineConfig({
  plugins: [react()],
  // Keep Vite's dep-optimizer cache OUT of the Dropbox-synced project tree —
  // Dropbox locks node_modules/.vite/deps during sync, which breaks optimization
  // (EBUSY on rename) and leaves the app blank in dev.
  cacheDir: path.join(os.tmpdir(), "mico360-vite-cache"),
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4400", changeOrigin: true },
      "/static": { target: "http://localhost:4400", changeOrigin: true },
    },
  },
});
