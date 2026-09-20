/**
 * The root secret node's prefix. Kept for consumers that built key strings with it; the library
 * itself asks `secretSuffix()`, which also finds a `secret` node nested inside a branch.
 */
export const SECRET_PREFIX = "secret.";

/** The schema and layer-file node holding secrets. */
export const SECRET_NODE = "secret";
/** Provenance name for values that came from a schema default rather than a source. */
export const DEFAULT_LAYER = "default";

/** Name of the boolean format this library registers. Use it as `format` in a schema. */
export const STRICT_BOOLEAN = "strict-boolean";
