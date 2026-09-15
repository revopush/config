#!/usr/bin/env node
import { runTypes } from "./cli";

/**
 * CLI entry point for the `types` command. Handles argv parsing and process exit.
 */

const USAGE = `Usage: revopush-config types --dir <schema-dir> --out <file> [--check] [--interface <name>]

  --dir        Directory containing schema.json
  --out        File to write
  --check      Exit non-zero if --out does not match the schema; writes nothing
  --interface  Name of the emitted interface (default: ConfigKeys)`;

async function main() {
  const [, , command, ...rest] = process.argv;
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
