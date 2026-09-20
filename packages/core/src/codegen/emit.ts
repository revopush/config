import { STRICT_BOOLEAN } from "../constants";
import { leaves, nodes } from "../schema-walk";
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

/** Options for `emitTypes`. */
export interface EmitOptions {
  /** Name of the flat key interface. Default `ConfigKeys`. */
  interfaceName?: string;
  /** Emit the per-node interfaces and the `bind` factory. Default true. */
  accessors?: boolean;
  /** Module the generated file imports `ReadonlyConfig` from. Default `@revopush/config`. */
  importFrom?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLeaf = (value: unknown): value is SchemaEntry => isObject(value) && "default" in value;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Bare where it is a legal identifier, quoted where it is not: `redis-host` is a legal key. */
const member = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

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
  return `${pascal}Settings`;
}

const docComment = (entry: { doc?: string }, indent: string): string =>
  entry.doc ? `${indent}/** ${entry.doc.replace(/\*\//g, "*\\/")} */\n` : "";

/** One interface per node: its leaves typed, its child nodes referenced by name. */
function emitInterface(path: string, node: Schema): string {
  const members = Object.entries(node)
    .filter(([, value]) => isObject(value))
    .map(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;
      const type = isLeaf(value) ? tsType(value) : typeName(childPath);
      return `${docComment(value as SchemaEntry, "  ")}  readonly ${member(key)}: ${type};`;
    });

  const header = path ? `/** ${path} */\n` : "";
  if (members.length === 0) return `${header}export interface ${typeName(path)} {}`;
  return `${header}export interface ${typeName(path)} {\n${members.join("\n")}\n}`;
}

/** The accessor tree: a getter per leaf, so a value is read when touched rather than at import. */
function emitAccessors(path: string, node: Schema, indent: string): string {
  const entries = Object.entries(node)
    .filter(([, value]) => isObject(value))
    .map(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;
      if (isLeaf(value)) {
        return (
          `${indent}  get ${member(key)}() {\n` +
          `${indent}    return c.get(${JSON.stringify(childPath)});\n` +
          `${indent}  },`
        );
      }
      return `${indent}  ${member(key)}: ${emitAccessors(childPath, value as Schema, `${indent}  `)},`;
    });

  if (entries.length === 0) return "{}";
  return `{\n${entries.join("\n")}\n${indent}}`;
}

/** Two paths whose PascalCase collapses to one name would emit one interface for both. */
function assertDistinctNames(schema: Schema): void {
  const seen = new Map<string, string>();
  for (const { path } of nodes(schema)) {
    const name = typeName(path);
    const taken = seen.get(name);
    if (taken !== undefined) {
      throw new Error(`Nodes "${taken}" and "${path}" both emit the interface ${name}. Rename one.`);
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
  const entries = leaves(schema);

  const banner =
    "// Generated by `revopush-config types`. Do not edit.\n" +
    "// Re-run the generator after changing schema.json.\n\n";

  if (entries.length === 0) return `${banner}export interface ${name} {}\n`;

  const keys = entries
    .map(
      ({ path, entry }) => `${docComment(entry, "  ")}  ${JSON.stringify(path)}: ${tsType(entry)};`
    )
    .join("\n");
  const keyInterface = `export interface ${name} {\n${keys}\n}`;

  if (options.accessors === false) return `${banner}${keyInterface}\n`;

  assertDistinctNames(schema);

  const importFrom = options.importFrom ?? "@revopush/config";
  const interfaces = [
    emitInterface("", schema),
    ...nodes(schema).map(({ path, node }) => emitInterface(path, node)),
  ].join("\n\n");

  const bind =
    "/** Binds the accessors to a config. A factory, so this file imports no module of yours. */\n" +
    `export const bind = (c: ReadonlyConfig<${name}>): ${typeName("")} => (${emitAccessors("", schema, "")});`;

  return (
    `${banner}import type { ReadonlyConfig } from ${JSON.stringify(importFrom)};\n\n` +
    `${keyInterface}\n\n${interfaces}\n\n${bind}\n`
  );
}
