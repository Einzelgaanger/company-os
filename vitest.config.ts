import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/** SPA design-system tests — 07_DESIGN_SYSTEM §7.3 tokens and §7.11 a11y floor. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
});
