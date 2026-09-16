import { defineConfig } from "vitest/config";
import * as path from "node:path";

const here = import.meta.dirname;

export default defineConfig({
  test: { include: ["packages/*/test/**/*.test.ts"] },
  resolve: {
    // Tests run against source, not dist, so a suite never depends on a prior build.
    alias: {
      "@revopush/config/testing": path.resolve(here, "packages/core/src/testing/index.ts"),
      "@revopush/config": path.resolve(here, "packages/core/src/index.ts"),
    },
  },
});
