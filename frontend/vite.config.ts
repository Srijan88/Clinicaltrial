import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server runs on :5173 (the port the FastAPI CORS allowlist expects).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
