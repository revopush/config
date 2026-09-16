import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError } from "../errors";
import { Source, SourceContext, SourceValues } from "../types";

/**
 * Configures which files to load and how.
 */
export interface FileLayersOptions {
  /** Directory holding the layer files. Defaults to the schema directory. */
  dir?: string;
  /** Which layer file to load. Defaults to `"dev"`. */
  environment?: string;
  /** Which region layer file to load on top, if any. */
  region?: string;
  /** Overrides the file naming convention. Receives the environment and region. */
  names?: (environment: string, region: string) => string[];
  /** Overrides the source name shown in errors and `explain()`. */
  name?: string;
  /**
   * Throw a `ConfigError` naming the environment and directory when no layer file matched, instead
   * of warning and continuing with schema defaults. Defaults to `false`, so local development
   * without every environment's file present is unaffected.
   */
  required?: boolean;
}

const defaultNames = (environment: string, region: string): string[] =>
  region ? [`${environment}.json`, `${environment}.${region}.json`] : [`${environment}.json`];

/** Arrays are values to replace wholesale, never nodes to merge. */
const isPlainObject = (value: unknown): value is SourceValues =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Keys that must never be written through. `JSON.parse` happily produces an *own* `__proto__`
 * property, and assigning it runs the prototype setter — so a layer file containing
 * `{"__proto__": {"x": 1}}` would otherwise make `merge` recurse into `Object.prototype` and set
 * `x` on every object in the process.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function merge(target: SourceValues, source: SourceValues): SourceValues {
  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const existing = target[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      merge(existing as SourceValues, value as SourceValues);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Reads `<environment>.json` then `<environment>.<region>.json`, the later winning.
 *
 * A missing file is skipped rather than an error, so an environment can add a region layer without
 * every other environment needing one.
 */
export function fileLayers(options: FileLayersOptions = {}): Source {
  return {
    name: options.name ?? "files",
    load(context: SourceContext): SourceValues {
      const dir = options.dir ?? context.dir;
      if (!dir) {
        throw new ConfigError(
          "fileLayers() needs a directory: pass `dir`, or give createConfig() a `schemaDir`."
        );
      }

      const environment = options.environment ?? "dev";
      const names = (options.names ?? defaultNames)(environment, options.region ?? "");
      const files = names.map((file) => path.join(dir, file)).filter((file) => fs.existsSync(file));

      if (files.length === 0) {
        if (options.required) {
          throw new ConfigError(
            `fileLayers() found no layer file for environment "${environment}" in ${dir}, and \`required\` is true.`
          );
        }
        context.warn(
          `No layer file for environment "${environment}" in ${dir}; using schema defaults.`
        );
        return {};
      }

      return files.reduce<SourceValues>((values, file) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          throw new ConfigError(`fileLayers() could not parse ${file}: ${detail}`);
        }
        return merge(values, parsed as SourceValues);
      }, {});
    },
  };
}
