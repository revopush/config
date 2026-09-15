import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/codegen/cli.ts", "src/codegen/bin.ts", "src/testing/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  external: ["vitest"],
});
