import { createConfig, env, fileLayers } from "@revopush/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "config");

const config = createConfig({
  schemaDir: dir,
  sources: [fileLayers({ environment: "production", region: "eu" }), env({ from: {} })],
});
await config.init();

console.assert(config.get("endpoint") === "https://eu.prod.example.test", "region layer should win");
console.assert(config.get("service") === "demo-prod", "environment layer should still apply");
console.log("layered:", config.explain("endpoint"));
