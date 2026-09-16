# Writing a source

A `Source` is anything `createConfig` can merge into the layered configuration. `fileLayers()` and
`env()` are the two built into core; anything else — a remote config service, a database table, a
feature-flag provider — is a `Source` you write.

## The interface

```ts
/** Values a source returns: a nested object shaped like the schema. Strings are coerced. */
type SourceValues = Record<string, unknown>;

/** What a source is given when it loads. */
interface SourceContext {
  readonly schema: Schema;
  /** The schema directory, when `createConfig` was given one. Undefined for an inline schema. */
  readonly dir?: string;
  /** Values merged so far, for a source that needs to read an earlier layer. */
  get(key: string): unknown;
  /** Routes to `onWarning`, so a source never writes to the console itself. */
  warn(message: string): void;
}

/** Where configuration values come from. Sources apply in order, later winning. */
interface Source {
  /** Identifies this source in errors and in `explain()`. Must be unique within one config. */
  readonly name: string;
  load(context: SourceContext): Promise<SourceValues> | SourceValues;
}
```

`load()` returns a nested object shaped like the schema — dotted paths written as nested objects,
e.g. `{ redis: { port: 6380 } }` for the key `redis.port`. Values may be strings; convict coerces
them against the schema's `format` the same way it coerces environment variables.

## A worked example

A source that reads one JSON document over HTTP, using `SourceContext.get()` to read a value an
earlier layer already resolved — here, an optional bearer token:

```ts
import type { Source, SourceContext, SourceValues } from "@revopush/config";

/** A source reading a JSON document over HTTP. */
export function httpJson(url: string, options: { name?: string } = {}): Source {
  return {
    name: options.name ?? "http-json",
    async load(context: SourceContext): Promise<SourceValues> {
      // context.get() reads a value an earlier layer already resolved — here, an optional
      // bearer token, so this source can authenticate without knowing where the token came
      // from. The key must be declared in the schema; get() reads through the same store
      // sources merge into, and an undeclared key throws.
      const token = context.get("apiToken");
      const headers =
        typeof token === "string" && token ? { authorization: `Bearer ${token}` } : {};
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
  };
}
```

Used ahead of `env()` so `apiToken` is already resolved when `httpJson` reads it. `apiToken` must be
declared in the schema for `context.get()` to read it:

```json
// config/schema.json
{
  "apiToken": { "doc": "Bearer token for the config server", "default": "", "env": "API_TOKEN" },
  "featureFlag": { "doc": "Example remote flag", "format": "Boolean", "default": false }
}
```

```ts
const config = createConfig({
  schemaDir: "./config",
  sources: [env({ from: { API_TOKEN: "shh" } }), httpJson(`http://127.0.0.1:${port}/config`)],
});
await config.init();

config.get("featureFlag"); // true — served by the local test server as { "featureFlag": true }
config.explain("featureFlag");
// {
//   key: 'featureFlag',
//   value: true,
//   winner: 'http-json',
//   layers: [
//     { source: 'default', value: false },
//     { source: 'http-json', value: true }
//   ]
// }
```

This was run against a real local HTTP server returning `{"featureFlag": true}`; the output above
is what it printed.

## Reading an earlier layer

`SourceContext.get(key)` reads whatever value the layers merged _before_ this source hold for that
key — the schema default if nothing has set it yet, or whatever an earlier source in the `sources`
array supplied. It is how a source that needs configuration of its own (an endpoint, a token, a
tenant ID) gets it from the same layering system instead of inventing a separate way to be
configured, as `httpJson` does above with `apiToken`. The key it reads must be declared in the
schema — `get()` reads through the same underlying store every source merges into, and asking for a
key the schema never declared throws.

## Failures become `SourceError`

A source that throws — network failure, malformed response, anything — is not left to propagate as
whatever error it produced. `createConfig` catches it and wraps it in `SourceError`, which carries
`.source` (this source's `name`) and `.cause` (the original error), so a failure always names the
plugin responsible:

```ts
const config = createConfig({
  schemaDir: "./config",
  sources: [httpJson("http://127.0.0.1:1/config")],
});

try {
  await config.init();
} catch (error) {
  error.name; // "SourceError"
  error.message; // 'Source "http-json" failed: fetch failed'
  error.source; // "http-json"
}
```

(If the thrown error is already a `SourceError` — for instance, one your source constructs itself —
it passes through unwrapped.)

## Verifying it with `testSource`

`@revopush/config/testing` exports `testSource(factory)`, a small conformance suite that checks a
source has a name, returns a plain object, and does not mutate the `SourceContext` it is given.
Call it inside a `describe`:

```ts
import { createServer } from "node:http";
import { describe } from "vitest";
import { testSource } from "@revopush/config/testing";
import { httpJson } from "./http-source";

// testSource calls load() for real, so point it at a server that answers.
const server = createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ redis: { port: 6380 } }));
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

describe("httpJson", () => testSource(() => httpJson(url)));
```

This is what stops a source from silently returning an array, mutating the shared schema object, or
otherwise breaking assumptions every other source in the pipeline relies on.
