import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 10_000,
    // Alias `server-only` to a noop so vitest can import server modules guarded
    // by `import "server-only"` (the package throws under any non-RSC bundler).
    // Tests run in plain Node where the import-time guard is meaningless.
    alias: {
      "server-only": path.resolve(__dirname, "tests/shims/server-only.ts"),
      "@/": path.resolve(__dirname, "src") + "/",
    },
  },
});
