import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/codegen/cli.ts", "src/codegen/bin.ts", "src/testing/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // On deliberately: this is open source, so the TypeScript source these maps embed
  // (tsup inlines sourcesContent) is a feature — it lets a consumer step into the real source
  // instead of the compiled output. Do not turn this off.
  sourcemap: true,
  target: "node20",
  external: ["vitest"],
  // bin.ts resolves its own package.json via `__dirname`, which Node's ESM loader does not define;
  // shims polyfills it (and `__filename`/`require`) in the ESM build from `import.meta.url`.
  shims: true,
});
