import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/codegen/cli.ts", "src/codegen/bin.ts", "src/testing/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  external: ["vitest"],
  // bin.ts resolves its own package.json via `__dirname`, which Node's ESM loader does not define;
  // shims polyfills it (and `__filename`/`require`) in the ESM build from `import.meta.url`.
  shims: true,
});
