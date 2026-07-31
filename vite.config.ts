/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/* Dev-only auth: the proxy injects the bearer token server-side from the
   shell environment (never a .env file), so the token can never appear in
   client code or the bundle. Missing token → header omitted → the backend
   answers with its 401 envelope. Keep the dev server on localhost: --host
   would hand this token-injecting proxy to the whole network. */
const token = process.env.RAG_RECIPES_TOKEN;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
