/** The published version of this package. */
export const VERSION = "0.1.0";

export { createConfig } from "./create-config";
export { env, type EnvOptions } from "./sources/env";
export { fileLayers, type FileLayersOptions } from "./sources/file-layers";
export { STRICT_BOOLEAN, registerFormats } from "./formats";
export { SECRET_PREFIX, SECRET_NODE } from "./constants";
export {
  ConfigError,
  ConfigNotInitializedError,
  ConfigValidationError,
  MissingSecretsError,
  SourceError,
} from "./errors";
export type {
  Config,
  CreateConfigOptions,
  Provenance,
  ReadonlyConfig,
  Schema,
  SchemaEntry,
  SecretSource,
  Source,
  SourceContext,
  SourceValues,
} from "./types";
