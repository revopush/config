import { STRICT_BOOLEAN } from "../constants";
import { isLeaf, isObject, leaves, nodes } from "../schema-walk";
import { ConfigError } from "../errors";
import { Schema, SchemaEntry } from "../types";

// convict's numeric formats, plus its `Number` type format in both spellings it accepts.
const NUMERIC_FORMATS = new Set(["port", "int", "nat", "duration", "number", "Number"]);
// This library's strict boolean, plus convict's own `Boolean` type format.
const BOOLEAN_FORMATS = new Set([STRICT_BOOLEAN, "boolean", "Boolean"]);

function inferType(entry: SchemaEntry): string {
  if (Array.isArray(entry.format)) {
    // An enum with no members has nothing to name; falling back to `string` keeps the generated
    // file compiling instead of emitting a bare `"key": ;`.
    if (entry.format.length === 0) return "string";
    return entry.format.map((value) => JSON.stringify(value)).join(" | ");
  }
  const format = typeof entry.format === "string" ? entry.format : undefined;
  if ((format !== undefined && BOOLEAN_FORMATS.has(format)) || typeof entry.default === "boolean") {
    return "boolean";
  }
  if ((format !== undefined && NUMERIC_FORMATS.has(format)) || typeof entry.default === "number") {
    return "number";
  }
  return "string";
}

function tsType(entry: SchemaEntry): string {
  const base = entry.tsType ?? inferType(entry);
  return entry.nullable || entry.default === null ? `${base} | null` : base;
}

/** Options for `emitTypes`. Every one has a default; see `emitTypes`. */
export interface EmitOptions {
  /** Name of the flat key interface. */
  interfaceName?: string;
  /** Whether to emit the per-node interfaces and the `bind` factory. */
  accessors?: boolean;
  /** Module the generated file imports `ReadonlyConfig` from. Consumers want the default; an
   *  in-repo generator pointing at a relative path is why this exists. */
  importFrom?: string;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Bare where it is a legal identifier, quoted where it is not: `redis-host` is a legal key. */
const member = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

/**
 * The same, for a key in an object literal. `__proto__: value` — quoted or not — sets the object's
 * prototype instead of defining the property, so that one name has to go through a computed key.
 */
const literalKey = (name: string): string =>
  name === "__proto__" ? `[${JSON.stringify(name)}]` : member(name);

/**
 * The interface name for a node: its path in PascalCase, suffixed.
 *
 * The suffix is not decoration. `History` and `Response` are global types and `Redis` and
 * `Session` are exported by common clients, so a bare node name resolves to whichever the import
 * order happens to favour.
 */
function typeName(path: string): string {
  const pascal = path
    .split(".")
    .map((segment) => segment.replace(/[^A-Za-z0-9]/g, ""))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
  // A node named `2fa` would otherwise emit `interface 2faSettings`, which does not parse.
  return /^[0-9]/.test(pascal) ? `_${pascal}Settings` : `${pascal}Settings`;
}

/** The root has no path, and naming it `""` in an error message helps nobody. */
const describePath = (path: string): string => (path === "" ? "the schema root" : `"${path}"`);

// `doc` is a node name like any other, so a schema may hold a node at `a.doc`; only a string is a
// doc comment, and anything else would have thrown on `.replace` below.
const docComment = (entry: { doc?: unknown }): string =>
  typeof entry.doc === "string" ? `  /** ${entry.doc.replace(/\*\//g, "*\\/")} */\n` : "";

/** A node's own children, each with the dotted path it is addressed by. */
function members<T>(
  path: string,
  node: Schema,
  render: (key: string, childPath: string, value: Schema) => T
): T[] {
  return Object.entries(node)
    .filter(([, value]) => isObject(value))
    .map(([key, value]) => render(key, path ? `${path}.${key}` : key, value as Schema));
}

function emitInterface(path: string, node: Schema): string {
  const lines = members(
    path,
    node,
    (key, childPath, value) =>
      `${docComment(value)}  readonly ${member(key)}: ${isLeaf(value) ? tsType(value) : typeName(childPath)};`
  );

  const header = path ? `/** ${path} */\n` : "";
  const body = lines.length === 0 ? "" : `\n${lines.join("\n")}\n`;
  return `${header}export interface ${typeName(path)} {${body}}`;
}

/** A getter per leaf, so a value is read when it is touched rather than when `bind` is called. */
function emitAccessors(path: string, node: Schema, indent: string): string {
  const lines = members(path, node, (key, childPath, value) =>
    isLeaf(value)
      ? `${indent}  get ${member(key)}() {\n` +
        `${indent}    return c.get(${JSON.stringify(childPath)});\n` +
        `${indent}  },`
      : `${indent}  ${literalKey(key)}: ${emitAccessors(childPath, value, `${indent}  `)},`
  );

  return lines.length === 0 ? "{}" : `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * Two paths whose PascalCase collapses to one name would emit one interface for both — and so
 * would a node whose name is the one `--interface` asked for, which is emitted from the same file.
 */
function assertDistinctNames(all: { path: string }[], keyInterface: string): void {
  const seen = new Map<string, string>();
  for (const { path } of all) {
    const name = typeName(path);
    if (name === keyInterface) {
      throw new ConfigError(
        `Node ${describePath(path)} emits the interface ${name}, which is also the key interface's ` +
          `name. Pass a different --interface.`
      );
    }
    const taken = seen.get(name);
    if (taken !== undefined) {
      throw new ConfigError(
        `Nodes ${describePath(taken)} and ${describePath(path)} both emit the interface ${name}. Rename one.`
      );
    }
    seen.set(name, path);
  }
}

/**
 * Renders a schema as a TypeScript module: a flat map of dotted key to value type, and — unless
 * `accessors` is off — one interface per node plus a factory binding an accessor tree to a config.
 *
 * The flat map is what keeps `get()` to a single generic parameter:
 * `get<P extends keyof K & string>(key: P): K[P]`. The accessors are the ergonomic layer over it,
 * for callers who would rather write `platform.saas.cloudflare.uri` than a string.
 */
export function emitTypes(schema: Schema, options: EmitOptions = {}): string {
  const name = options.interfaceName ?? "ConfigKeys";
  const importFrom = options.importFrom ?? "@revopush/config";

  const banner =
    "// Generated by `revopush-config types`. Do not edit.\n" +
    "// Re-run the generator after changing schema.json.\n\n";

  const keys = leaves(schema)
    .map(({ path, entry }) => `${docComment(entry)}  ${JSON.stringify(path)}: ${tsType(entry)};`)
    .join("\n");
  const keyInterface = `export interface ${name} {${keys ? `\n${keys}\n` : ""}}`;

  if (options.accessors === false) return `${banner}${keyInterface}\n`;

  // The root is a node too — it is what `Settings` is emitted from, and it can collide like any
  // other name.
  const all = [{ path: "", node: schema }, ...nodes(schema)];
  assertDistinctNames(all, name);

  const interfaces = all.map(({ path, node }) => emitInterface(path, node)).join("\n\n");
  const bind =
    "/** Binds the accessors to a config. A factory, so this file imports no module of yours. */\n" +
    `export const bind = (c: ReadonlyConfig<${name}>): ${typeName("")} => (${emitAccessors("", schema, "")});`;

  return (
    `${banner}import type { ReadonlyConfig } from ${JSON.stringify(importFrom)};\n\n` +
    `${keyInterface}\n\n${interfaces}\n\n${bind}\n`
  );
}
