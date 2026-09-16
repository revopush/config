import { createConfig, fileLayers, env } from "@revopush/config";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "config");

// A stand-in for azureKeyVault() so the example runs in CI without an Azure subscription.
// Swap this line for `secretSource: azureKeyVault()` in a real service.
const fakeVault = {
  name: "fake-vault",
  load: async (names) => {
    const resolved = new Map();
    for (const [key, name] of names) resolved.set(key, `value-of-${name}`);
    return resolved;
  },
};

const config = createConfig({
  schemaDir: dir,
  sources: [fileLayers({ environment: "production" }), env({ from: {} })],
  secretSource: fakeVault,
});
await config.init();

assert(
  config.get("secret.storageKey") === "value-of-storage-demoaccount",
  "template should interpolate"
);
assert(!JSON.stringify(config.toJSON()).includes("value-of"), "toJSON must redact secrets");
console.log("azure:", config.toJSON());
