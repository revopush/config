/** Keys under this prefix are the only ones fetched from a secret source. */
export const SECRET_PREFIX = "secret.";

/** The schema and layer-file node holding secrets. */
export const SECRET_NODE = "secret";

/** Provenance name for values that came from a schema default rather than a source. */
export const DEFAULT_LAYER = "default";

/** Name of the boolean format this library registers. Use it as `format` in a schema. */
export const STRICT_BOOLEAN = "strict-boolean";

/** Name of the required-string format this library registers. Use it as `format` in a schema. */
export const NON_EMPTY_STRING = "non-empty-string";
