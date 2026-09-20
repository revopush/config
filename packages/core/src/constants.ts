/** Keys under this prefix are fetched from a secret source. So are keys under a nested one. */
export const SECRET_PREFIX = "secret.";

/** The schema and layer-file node holding secrets. */
export const SECRET_NODE = "secret";

/**
 * The part of a key below its nearest `secret` node, or undefined when the key is not a secret.
 *
 * A `secret` node is not always at the root: a schema branch holds one deployment's keys, and its
 * secrets live at `platform.saas.secret.cloudflareApiToken`. Matching the node rather than a
 * leading prefix is what keeps those fetched from the secret source — and it derives the same
 * name a root-level `secret.cloudflareApiToken` would, so no store has to be renamed.
 */
export function secretSuffix(path: string): string | undefined {
  const segments = path.split(".");
  const node = segments.lastIndexOf(SECRET_NODE);
  if (node < 0 || node === segments.length - 1) return undefined;
  return segments.slice(node + 1).join(".");
}

/** Provenance name for values that came from a schema default rather than a source. */
export const DEFAULT_LAYER = "default";

/** Name of the boolean format this library registers. Use it as `format` in a schema. */
export const STRICT_BOOLEAN = "strict-boolean";
