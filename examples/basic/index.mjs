import { createConfig, env } from "@revopush/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "config");

const config = createConfig({ schemaDir: dir, sources: [env({ from: { PORT: "8080" } })] });
await config.init();

console.assert(config.get("port") === 8080, "port should be 8080");
console.assert(config.get("logLevel") === "info", "logLevel should fall back to its default");
console.log("basic:", config.toJSON());
