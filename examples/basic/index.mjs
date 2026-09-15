import { createConfig, env } from "@revopush/config";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "config");

const config = createConfig({ schemaDir: dir, sources: [env({ from: { PORT: "8080" } })] });
await config.init();

assert(config.get("port") === 8080, "port should be 8080");
assert(config.get("logLevel") === "info", "logLevel should fall back to its default");
console.log("basic:", config.toJSON());
