#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { emitTypes } from "./emit";

/**
 * I/O interface for the types command, allowing testing without console.
 */
export interface CliIO {
  /**
   * Log a message.
   */
  log(message: string): void;
  /**
   * Log an error message.
   */
  error(message: string): void;
}

const USAGE = `Usage: revopush-config types --dir <schema-dir> --out <file> [--check] [--interface <name>]

  --dir        Directory containing schema.json
  --out        File to write
  --check      Exit non-zero if --out does not match the schema; writes nothing
  --interface  Name of the emitted interface (default: ConfigKeys)`;

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/**
 * Runs the `types` command. Returns the process exit code rather than exiting, so it is testable.
 */
export async function runTypes(argv: string[], io: CliIO = console): Promise<number> {
  const dir = flag(argv, "--dir");
  const out = flag(argv, "--out");
  const check = argv.includes("--check");
  const interfaceName = flag(argv, "--interface");

  if (!dir || !out) {
    io.error("Both --dir and --out are required.\n\n" + USAGE);
    return 1;
  }

  const schemaFile = path.join(dir, "schema.json");
  if (!fs.existsSync(schemaFile)) {
    io.error(`No schema.json in ${dir}.`);
    return 1;
  }

  let expected: string;
  try {
    expected = emitTypes(JSON.parse(fs.readFileSync(schemaFile, "utf8")), { interfaceName });
  } catch (error) {
    io.error(`Could not read ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (check) {
    const actual = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    if (actual === expected) {
      io.log(`${out} is up to date.`);
      return 0;
    }
    io.error(`${out} is out of date. Re-run without --check to regenerate.`);
    return 1;
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, expected);
  io.log(`Wrote ${out}.`);
  return 0;
}

const invokedDirectly = process.argv[1] && /codegen[/\\]cli\.(c?js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  const [, , command, ...rest] = process.argv;
  if (command !== "types") {
    console.error(USAGE);
    process.exit(1);
  }
  runTypes(rest).then((code) => process.exit(code));
}
