import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError, ConfigNotInitializedError, MissingSecretsError, SourceError } from "./errors";
import { secretNames } from "./secrets";
import { env } from "./sources/env";
import { fileLayers } from "./sources/file-layers";
import { Store } from "./store";
import { Config, CreateConfigOptions, Provenance, Schema, Source, SourceContext } from "./types";

/**
 * Builds a configuration object. Synchronous and free of I/O, so the result can be exported at
 * module scope and shared by reference; `init()` is the asynchronous half.
 *
 * Pass the generated `ConfigKeys` interface as `K` for typed keys and autocomplete.
 */
export function createConfig<K = Record<string, any>>(options: CreateConfigOptions): Config<K> {
  if ((options.schemaDir === undefined) === (options.schema === undefined)) {
    throw new ConfigError("Pass exactly one of `schemaDir` or `schema` to createConfig().");
  }

  let store: Store | undefined;
  let pending: Promise<void> | undefined;

  const ready = (key?: string): Store => {
    if (!store) throw new ConfigNotInitializedError(key);
    return store;
  };

  async function load(): Promise<void> {
    const schema: Schema = options.schema ?? readSchema(options.schemaDir!);
    const next = new Store(schema);

    const context: SourceContext = {
      schema,
      dir: options.schemaDir,
      get: (key) => next.get(key),
      warn: (message) => options.onWarning?.(message),
    };

    const sources: Source[] = options.sources ?? [fileLayers(), env()];
    const seenSourceNames = new Set<string>();
    for (const source of sources) {
      if (seenSourceNames.has(source.name)) {
        throw new ConfigError(
          `Two sources are both named "${source.name}". Source.name must be unique within one config.`
        );
      }
      seenSourceNames.add(source.name);
    }

    for (const source of sources) {
      try {
        next.merge(source.name, await source.load(context));
      } catch (cause) {
        throw cause instanceof SourceError ? cause : new SourceError(source.name, cause);
      }
    }

    const declared = next.declaredSecrets();
    if (declared.size > 0 && options.secretSource) {
      const names = secretNames(schema, declared.keys(), (key) => next.get(key));
      try {
        const resolved = await options.secretSource.load(names);
        for (const [key, value] of resolved) next.set(options.secretSource.name, key, value);
      } catch (cause) {
        throw new SourceError(options.secretSource.name, cause);
      }
    }

    next.validate();

    const missing = new Map([...declared].filter(([key]) => !next.has(key)));
    if (missing.size > 0) throw new MissingSecretsError(missing);

    store = next;
  }

  return {
    /**
     * Loads every source and secret, then validates the result. Concurrent calls share one
     * in-flight load, but each call that starts after the previous one settles triggers a fresh
     * load — re-reading every file and re-fetching every secret. That is deliberate: it is what
     * lets a test change an environment variable and re-read. It also means a service that awaits
     * `init()` from two separate entry points (e.g. an HTTP server and a worker, each calling it
     * independently) pays for two full loads — including two secret-store round trips — rather
     * than sharing one. Call `init()` once, in one place, and share the resulting `config`.
     */
    init(): Promise<void> {
      if (pending) return pending;
      pending = load().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    get<P extends keyof K & string>(key: P): K[P] {
      return ready(key).get(key) as K[P];
    },
    has(key: keyof K & string): boolean {
      return ready(key).has(key);
    },
    explain(key: keyof K & string): Provenance {
      return ready(key).explain(key);
    },
    toJSON(): Record<string, unknown> {
      return ready().toJSON();
    },
  };
}

function readSchema(dir: string): Schema {
  const file = path.join(dir, "schema.json");
  if (!fs.existsSync(file)) throw new ConfigError(`No schema.json in ${dir}.`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Schema;
}
