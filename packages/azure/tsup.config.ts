import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // On deliberately: this is open source, so the TypeScript source these maps embed
  // (tsup inlines sourcesContent) is a feature — it lets a consumer step into the real source
  // instead of the compiled output. Do not turn this off.
  sourcemap: true,
  target: "node20",
  external: ["@azure/identity", "@azure/keyvault-secrets", "@revopush/config"],
});
