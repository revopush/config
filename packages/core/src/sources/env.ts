import { leaves, setPath } from "../schema-walk";
import { Source, SourceContext, SourceValues } from "../types";

export interface EnvOptions {
  /** The environment to read. Defaults to `process.env`. */
  from?: Record<string, string | undefined>;
  /** Overrides the source name shown in errors and `explain()`. */
  name?: string;
}

/**
 * Reads the environment variable each schema key declares with `env:`.
 *
 * An empty variable counts as unset, matching `process.env.X || default`. Passing `from` keeps the
 * source testable without mutating the real environment.
 */
export function env(options: EnvOptions = {}): Source {
  return {
    name: options.name ?? "env",
    load({ schema }: SourceContext): SourceValues {
      const source = options.from ?? process.env;
      const values: SourceValues = {};
      for (const { path, entry } of leaves(schema)) {
        if (typeof entry.env !== "string") continue;
        const raw = source[entry.env];
        if (raw === undefined || raw === "") continue;
        setPath(values, path, raw);
      }
      return values;
    },
  };
}
