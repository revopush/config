#!/usr/bin/env node
import * as path from "node:path";
import { USAGE, readVersion, runTypes } from "./cli";

/**
 * CLI entry point for the `types` command. Handles argv parsing and process exit.
 */

// dist/codegen/bin.{cjs,js} -> packages/core/package.json, for both build formats.
const PACKAGE_JSON = path.join(__dirname, "../../package.json");

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(readVersion(PACKAGE_JSON));
    process.exit(0);
  }

  if (command !== "types") {
    console.error(USAGE);
    process.exit(1);
  }
  const code = await runTypes(rest);
  process.exit(code);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
