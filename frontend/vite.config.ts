import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Packaged Tauri builds load from an application protocol rather than a web
  // server root. Relative assets work in both that environment and localhost.
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
          return "vendor";
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4141",
      "/health": "http://localhost:4141"
    }
  }
});
