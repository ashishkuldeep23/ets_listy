import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit + API tests run in plain Node. The "@" alias mirrors jsconfig.json.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    // Test-only secret; real ones live in .env.local.
    env: { SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long" },
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 300_000,
  },
});
