/** Base class for every error this library throws, so a consumer can catch the family. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when configuration is read before `init()` has resolved. */
export class ConfigNotInitializedError extends ConfigError {
  constructor(readonly key: string) {
    super(`Configuration was read before init(): "${key}". Await config.init() in the entry point first.`);
  }
}

/** Thrown when the merged configuration does not satisfy the schema. */
export class ConfigValidationError extends ConfigError {
  constructor(readonly keys: string[], detail: string) {
    super(`Configuration is invalid (${keys.length} problem(s)):\n${detail}`);
  }
}

/** Thrown when a secret an environment declares resolved from neither the source nor the environment. */
export class MissingSecretsError extends ConfigError {
  readonly keys: string[];
  constructor(readonly declaredBy: ReadonlyMap<string, string>) {
    const keys = [...declaredBy.keys()];
    super(
      `Missing secret(s): ${keys.join(", ")}. ` +
        `Not supplied by the secret source or the environment. ` +
        `Declared by: ${[...declaredBy].map(([key, by]) => `${key} (${by})`).join(", ")}.`
    );
    this.keys = keys;
  }
}

/** Thrown when a source or secret source fails, naming the plugin responsible. */
export class SourceError extends ConfigError {
  constructor(readonly source: string, readonly cause: unknown) {
    super(`Source "${source}" failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
