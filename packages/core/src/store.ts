import convict from "convict";
import { DEFAULT_LAYER, SECRET_PREFIX } from "./constants";
import { ConfigError, ConfigValidationError } from "./errors";
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
    // convict's typings don't accept this library's Schema type (see the `no-explicit-any`
    // comment in eslint.config.js); this cast is the one documented boundary where that mismatch
    // is absorbed.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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

  /**
   * Sets one key above every merged layer. Used for secrets.
   *
   * The key must be in the schema: convict accepts a write to an undeclared key silently, and
   * without a matching `layers` entry it would vanish from `explain()`'s audit trail, reporting
   * as `default` even though a source set it.
   */
  set(source: string, key: string, value: unknown): void {
    if (!this.layers.has(key)) {
      throw new ConfigError(`Source "${source}" set "${key}", which is not in the schema.`);
    }
    this.store.set(key, value);
    this.layers.get(key)!.push({ source, value });
  }

  /** Throws `ConfigError` naming the key when it is not declared in the schema. */
  private assertKnown(key: string): void {
    if (!this.entries.has(key)) {
      throw new ConfigError(`Unknown configuration key "${key}": not declared in the schema.`);
    }
  }

  /** Reads one key's resolved value. Throws `ConfigError` for a key not in the schema. */
  get(key: string): unknown {
    this.assertKnown(key);
    return this.store.get(key);
  }

  /**
   * True when the key holds a value that is neither undefined, null, nor empty. Returns `false`,
   * rather than throwing, for a key that is not in the schema — unlike `get()` and `explain()` —
   * because `has()` exists to answer "is this set", and an undeclared key is never set.
   */
  has(key: string): boolean {
    if (!this.entries.has(key)) return false;
    if (!this.store.has(key)) return false;
    const value = this.store.get(key);
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

  /**
   * Returns the `Provenance` for one key: its resolved value, which source won, and what every
   * merged layer contributed — the audit trail behind "why is this value what it is". Throws
   * `ConfigError` for a key not in the schema.
   */
  explain(key: string): Provenance {
    this.assertKnown(key);
    const layers = this.layers.get(key) ?? [];
    const winner = layers[layers.length - 1];
    return {
      key,
      value: this.get(key),
      winner: winner ? winner.source : DEFAULT_LAYER,
      layers: layers.map((layer) => ({ ...layer })),
    };
  }

  /**
   * The resolved configuration with secrets redacted.
   *
   * A key is redacted when it is marked `sensitive` *or* when it lives under the `secret.` node:
   * everything under that node is by definition a secret, and requiring `sensitive: true` on each
   * one would make a forgotten flag leak a vault value into whatever logged this.
   */
  toJSON(): Record<string, unknown> {
    const dumped: Record<string, unknown> = {};
    for (const [path, entry] of this.entries) {
      // `||`, not `??`: `entry.sensitive` is `boolean | undefined`, and an explicit `false` must
      // still fall through to the `secret.`-prefix check below, per the doc comment above.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const redact = entry.sensitive || path.startsWith(SECRET_PREFIX);
      setPath(dumped, path, redact ? "[REDACTED]" : this.get(path));
    }
    return dumped;
  }

  /**
   * Keys declared `required` that no source supplied.
   *
   * Presence is "some layer other than the default set it", not `has()`: `has()` reads `0` and
   * `false` as supplied, so a required port defaulting to `0` could never be reported missing.
   */
  missingRequired(): string[] {
    const missing: string[] = [];
    for (const [path, entry] of this.entries) {
      if (!entry.required) continue;
      if (!this.layers.get(path)!.some((layer) => layer.source !== DEFAULT_LAYER))
        missing.push(path);
    }
    return missing;
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
