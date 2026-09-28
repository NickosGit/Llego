
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 30_000,
  },
});
