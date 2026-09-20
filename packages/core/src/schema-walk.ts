import { SECRET_NODE } from "./constants";
import { ConfigError } from "./errors";
import { Schema, SchemaEntry } from "./types";

/** A schema leaf found by `leaves()`: its dotted path and the entry at that path. */
export interface SchemaLeaf {
  path: string;
  entry: SchemaEntry;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A schema entry, as opposed to a node holding more of them. Only a leaf carries `default`. */
export function isLeaf(value: unknown): value is SchemaEntry {
  return isObject(value) && "default" in value;
}

/** Walks every object in the schema, outermost first, handing each its dotted path. */
function walk(node: Schema, prefix: string, visit: (path: string, value: Schema) => void): void {
  for (const [key, value] of Object.entries(node)) {
    if (!isObject(value)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    visit(path, value);
    if (!isLeaf(value)) walk(value, path, visit);
  }
}

/** Every schema leaf, as a dotted path and its entry. A node carrying `default` is a leaf. */
export function leaves(schema: Schema): SchemaLeaf[] {
  const found: SchemaLeaf[] = [];
  walk(schema, "", (path, value) => {
    if (isLeaf(value)) found.push({ path, entry: value });
  });
  return found;
}

/** A schema node: an object that is not a leaf. Its dotted path, and the node itself. */
export interface SchemaNode {
  path: string;
  node: Schema;
}

/** Every node, outermost first. A node carrying `default` is a leaf and is not one. */
export function nodes(schema: Schema): SchemaNode[] {
  const found: SchemaNode[] = [];
  walk(schema, "", (path, node) => {
    if (!isLeaf(node)) found.push({ path, node });
  });
  return found;
}

/**
 * Keeps one child of a branch node and drops its siblings, leaving every other key untouched.
 *
 * A branch holds one deployment's keys per child — `platform.saas`, `platform.azure`. Pruning to
 * the selected one is what makes another deployment's key an unknown key rather than a default
 * silently read from a schema nobody resolved. Keys keep their path: nothing is flattened.
 */
export function pruneBranch(schema: Schema, branchKey: string, name: string): Schema {
  const branch = schema[branchKey] as unknown;
  if (!isObject(branch)) {
    throw new ConfigError(`The schema has no "${branchKey}" branch to select from.`);
  }

  const selected = branch[name];
  if (!isObject(selected)) {
    const declared = Object.keys(branch);
    throw new ConfigError(
      `Unknown ${branchKey} "${name}". The schema declares: ${declared.join(", ") || "nothing"}.`
    );
  }

  return { ...schema, [branchKey]: { [name]: selected } };
}

/**
 * The part of a key below its nearest `secret` node, or undefined when the key is not a secret.
 *
 * A `secret` node is not always at the root: a branch holds one deployment's keys, and its secrets
 * live at `platform.saas.secret.cloudflareApiToken`. Matching the node rather than a leading prefix
 * is what keeps those fetched from the secret source — and it derives the same name a root-level
 * `secret.cloudflareApiToken` would, so no store has to be renamed.
 */
export function secretSuffix(path: string): string | undefined {
  const segments = path.split(".");
  const node = segments.lastIndexOf(SECRET_NODE);
  if (node < 0 || node === segments.length - 1) return undefined;
  return segments.slice(node + 1).join(".");
}

/** Whether a key is resolved by the secret source. */
export function isSecret(path: string): boolean {
  return secretSuffix(path) !== undefined;
}

/** Reads a dotted path. Returns undefined when any segment is absent, which `null` is not. */
export function getPath(object: Record<string, unknown>, path: string): unknown {
  let current: unknown = object;
  for (const segment of path.split(".")) {
    if (!isObject(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Segments that would write through the prototype chain rather than onto the object itself. */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Writes a dotted path, creating intermediate objects. A path containing a segment that would
 * reach the prototype chain is refused rather than trusted.
 */
export function setPath(object: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return;
  const last = segments.pop()!;
  let current = object;
  for (const segment of segments) {
    if (!isObject(current[segment])) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[last] = value;
}
