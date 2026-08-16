import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit/component tests for pure rendering logic — range-bar, trust-meter,
// eventHref — the pieces that are safe to test without a running API, since
// every page in the app is a Server Component fetching over the network.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  // Skip the project's own PostCSS/Tailwind pipeline — component tests never
  // render real CSS in jsdom, and the root postcss config's plugin-by-string
  // form isn't understood by this (older, Node 20.1-compatible) Vite.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
