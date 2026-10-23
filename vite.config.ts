import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: { "/api/local-storage": { target: "http://127.0.0.1:8787", changeOrigin: false } },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force single React instance by aliasing to exact path
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    // Prevent duplicate React instances (fixes: Invalid hook call / useState null)
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    // Force Vite to pre-bundle React as a single instance
    include: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    esbuildOptions: {
      // Ensure consistent module resolution
      mainFields: ["module", "main"],
    },
  },
}));
