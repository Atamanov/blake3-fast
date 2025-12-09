import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    // Default environment is node, use --environment jsdom for browser-like testing
    environment: "node",
  },
});
