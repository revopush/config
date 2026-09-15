import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

for (const example of ["basic", "layered", "azure"]) {
  console.log(`\n── ${example} ──`);
  execFileSync(process.execPath, [path.join(here, example, "index.mjs")], { stdio: "inherit" });
}
