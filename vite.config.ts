import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The Content-Security-Policy comes from the desktop shell
// (desktop/tauri.conf.json), which also allows its own IPC origins.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
