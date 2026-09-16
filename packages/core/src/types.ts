/** A convict schema: nested objects whose leaves carry a `default`. */
export type Schema = Record<string, any>;

/** One schema leaf. Only `default` is required; everything else is optional. */
export interface SchemaEntry {
  default: unknown;
  doc?: string;
  format?: unknown;
  env?: string;
  sensitive?: boolean;
  nullable?: boolean;
  /**
   * The name this secret has in its store. Defaults to the key below `secret.` in kebab-case with
   * dots flattened to dashes: `secret.redisKey` -> `redis-key`, `secret.redis.password` ->
   * `redis-password`.
   */
  secretName?: string;
  /** Overrides the emitted TypeScript type. The escape hatch for a custom format. */
  tsType?: string;
}

/** Values a source returns: a nested object shaped like the schema. Strings are coerced. */
export type SourceValues = Record<string, unknown>;

/** What a source is given when it loads. */
export interface SourceContext {
  readonly schema: Schema;
  /** The schema directory, when `createConfig` was given one. Undefined for an inline schema. */
  readonly dir?: string;
  /** Values merged so far, for a source that needs to read an earlier layer. */
  get(key: string): unknown;
  /** Routes to `onWarning`, so a source never writes to the console itself. */
  warn(message: string): void;
}

/** Where configuration values come from. Sources apply in order, later winning. */
export interface Source {
  /** Identifies this source in errors and in `explain()`. Must be unique within one config. */
  readonly name: string;
  load(context: SourceContext): Promise<SourceValues> | SourceValues;
}

/** Where secrets come from. Azure Key Vault is one implementation; any store of named values is another. */
export interface SecretSource {
  readonly name: string;
  /**
   * Takes config key -> secret name, returns config key -> value. A secret this source does not
   * hold is omitted, leaving its environment variable in charge; any other failure must reject.
   */
  load(names: ReadonlyMap<string, string>): Promise<Map<string, string>>;
}

/** Where a key's value came from, and what every layer contributed. */
export interface Provenance {
  key: string;
  value: unknown;
  /** Name of the source that supplied the winning value, or `"default"`. */
  winner: string;
  /** Every layer that supplied a value for this key, lowest precedence first. */
  layers: Array<{ source: string; value: unknown }>;
}

/** Read access to resolved configuration. */
export interface ReadonlyConfig<K = Record<string, any>> {
  get<P extends keyof K & string>(key: P): K[P];
  has(key: keyof K & string): boolean;
  explain(key: keyof K & string): Provenance;
  /** The resolved configuration with `sensitive` keys redacted. Safe to log. */
  toJSON(): Record<string, unknown>;
}

/** Configuration that has not been loaded yet. Reads throw until `init()` resolves. */
export interface Config<K = Record<string, any>> extends ReadonlyConfig<K> {
  init(): Promise<void>;
}

/** Options for `createConfig`. */
export interface CreateConfigOptions {
  /** Directory holding `schema.json` and the layer files. Mutually exclusive with `schema`. */
  schemaDir?: string;
  /** A parsed schema, for programmatic use. Mutually exclusive with `schemaDir`. */
  schema?: Schema;
  /**
   * Value sources, lowest precedence first. Defaults to `[fileLayers(), env()]` when `schemaDir`
   * is given, and to `[env()]` for an inline `schema`, which has no directory for `fileLayers()`.
   */
  sources?: Source[];
  /** Resolves the secrets the sources declare. Without one, secrets come from their env vars. */
  secretSource?: SecretSource;
  /** Called instead of writing to the console. Silent when omitted. */
  onWarning?: (message: string) => void;
}
