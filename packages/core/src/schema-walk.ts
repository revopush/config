import { Schema, SchemaEntry } from "./types";

/** A schema leaf found by `leaves()`: its dotted path and the entry at that path. */
export interface SchemaLeaf {
  path: string;
  entry: SchemaEntry;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every schema leaf, as a dotted path and its entry. A node carrying `default` is a leaf. */
export function leaves(schema: Schema): SchemaLeaf[] {
  const found: SchemaLeaf[] = [];
  walk(schema, "", found);
  return found;
}

function walk(node: Record<string, unknown>, prefix: string, found: SchemaLeaf[]): void {
  for (const [key, value] of Object.entries(node)) {
    if (!isObject(value)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if ("default" in value) found.push({ path, entry: value as unknown as SchemaEntry });
    else walk(value, path, found);
  }
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
