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
}

const defaultNames = (environment: string, region: string): string[] =>
  region ? [`${environment}.json`, `${environment}.${region}.json`] : [`${environment}.json`];

function merge(target: SourceValues, source: SourceValues): SourceValues {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (value && typeof value === "object" && !Array.isArray(value) && existing && typeof existing === "object") {
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
        context.warn(`No layer file for environment "${environment}" in ${dir}; using schema defaults.`);
        return {};
      }

      return files.reduce<SourceValues>(
        (values, file) => merge(values, JSON.parse(fs.readFileSync(file, "utf8")) as SourceValues),
        {}
      );
    },
  };
}
