import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"], // Later tasks add src/testing/index.ts and src/codegen/cli.ts
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  external: ["vitest"],
});
