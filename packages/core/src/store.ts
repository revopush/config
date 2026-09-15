import convict from "convict";
import { DEFAULT_LAYER, SECRET_PREFIX } from "./constants";
import { ConfigValidationError } from "./errors";
import { registerFormats } from "./formats";
import { getPath, leaves, setPath } from "./schema-walk";
import { Provenance, Schema, SchemaEntry, SourceValues } from "./types";

interface Layer {
  source: string;
  value: unknown;
}

/**
 * Matches convict's message for a key that is not in the schema, which reads
 * `configuration param 'redis.hsot' not declared in the schema` — a different shape from the
 * `key: reason` lines convict emits for every other kind of validation failure.
 */
const UNKNOWN_PARAM = /^configuration param '([^']+)'/;

/**
 * Holds the merged configuration and remembers where every value came from.
 *
 * convict validates and coerces; this class owns layering and provenance, which is what lets
 * `explain()` answer "why is this value what it is" and what decides which secrets an environment
 * declared.
 */
export class Store {
  private readonly store: convict.Config<Record<string, unknown>>;
  private readonly entries: Map<string, SchemaEntry>;
  private readonly layers = new Map<string, Layer[]>();

  constructor(schema: Schema) {
    registerFormats();
    this.store = convict(schema as any);
    this.entries = new Map(leaves(schema).map(({ path, entry }) => [path, entry]));
    for (const [path, entry] of this.entries) {
      this.layers.set(path, [{ source: DEFAULT_LAYER, value: entry.default }]);
    }
  }

  /** Merges one source's values, recording which keys it supplied. */
  merge(source: string, values: SourceValues): void {
    this.store.load(values);
    for (const path of this.entries.keys()) {
      const value = getPath(values, path);
      if (value !== undefined) this.layers.get(path)!.push({ source, value });
    }
  }

  /** Sets one key above every merged layer. Used for secrets. */
  set(source: string, key: string, value: unknown): void {
    this.store.set(key, value);
    this.layers.get(key)?.push({ source, value });
  }

  get(key: string): unknown {
    return this.store.get(key);
  }

  /** True when the key holds a value that is neither undefined, null, nor empty. */
  has(key: string): boolean {
    if (!this.store.has(key)) return false;
    const value = this.get(key);
    return value !== undefined && value !== null && value !== "";
  }

  /** Throws `ConfigValidationError` listing every problem, including unknown keys. */
  validate(): void {
    try {
      this.store.validate({ allowed: "strict" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const keys = detail
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          const unknown = UNKNOWN_PARAM.exec(trimmed);
          return unknown ? unknown[1] : trimmed.split(":")[0]?.trim();
        })
        .filter((key): key is string => Boolean(key));
      throw new ConfigValidationError([...new Set(keys)], detail);
    }
  }

  explain(key: string): Provenance {
    const layers = this.layers.get(key) ?? [];
    const winner = layers[layers.length - 1];
    return {
      key,
      value: this.get(key),
      winner: winner ? winner.source : DEFAULT_LAYER,
      layers: layers.map((layer) => ({ ...layer })),
    };
  }

  /** The resolved configuration with `sensitive` keys redacted. */
  toJSON(): Record<string, unknown> {
    const dumped: Record<string, unknown> = {};
    for (const [path, entry] of this.entries) {
      setPath(dumped, path, entry.sensitive ? "[REDACTED]" : this.get(path));
    }
    return dumped;
  }

  /**
   * Secret keys a source explicitly set, mapped to that source's name.
   *
   * Schema defaults do not count: a schema declares which secrets exist, a layer file declares
   * which ones this environment requires.
   */
  declaredSecrets(): Map<string, string> {
    const declared = new Map<string, string>();
    for (const [path, layers] of this.layers) {
      if (!path.startsWith(SECRET_PREFIX)) continue;
      const first = layers.find((layer) => layer.source !== DEFAULT_LAYER);
      if (first) declared.set(path, first.source);
    }
    return declared;
  }
}
