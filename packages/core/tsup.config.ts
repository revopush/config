import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/codegen/cli.ts"], // Task 10 adds src/testing/index.ts
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  external: ["vitest"],
});
