# Layering and precedence

## Precedence order

`createConfig` resolves a key by merging, in order, the schema default, then each source in
`sources`, then any resolved secret — every later layer overriding the ones before it for the keys
it sets. Layers it does not touch fall through to whatever the previous layer left.

```ts
const config = createConfig({
  schemaDir: "./config",
  sources: [fileLayers({ environment: "staging" }), env()],
});
```

Here the order is: schema defaults, then `staging.json` (and `staging.<region>.json` if a `region`
is given), then environment variables, then — if a `secretSource` is configured — the secret store,
which applies above environment variables so a vault value beats a stale one. Omitting `sources`
entirely defaults to exactly `[fileLayers(), env()]`.

## An empty environment variable means unset

`env()` treats `""` the same as a variable that was never set — it does not merge it, so the value
falls through to whatever the previous layer supplied. This matches the common `process.env.X ||
default` idiom services already rely on, and it matters in practice: a platform's environment
variable UI (an App Service configuration blade, a `.env` file with a trailing `KEY=`) makes it easy
to define a variable with an empty value. Without this rule, `AZURE_TABLE_NAME=` would resolve to a
table literally named `""` instead of falling back to the schema default or an earlier layer.

```ts
import { createConfig, env } from "@revopush/config";

const config = createConfig({
  schemaDir: "./config",
  sources: [env({ from: { PORT: "" } })],
});
await config.init();

config.get("port"); // 3000 — the schema default, PORT="" counted as unset
config.explain("port");
// {
//   key: "port",
//   value: 3000,
//   winner: "default",
//   layers: [{ source: "default", value: 3000 }]
// }
```

## Strict booleans

convict's built-in boolean format accepts every spelling except the literal string `"false"` as
true — which means `ENABLE_ACCOUNT_REGISTRATION=0` would be coerced to `true`, the opposite of what
the variable says. This library registers `STRICT_BOOLEAN` (`format: "strict-boolean"` in the
schema) instead: only `true/1/yes/on` and `false/0/no/off`, case-insensitive and trimmed, are
accepted, and anything else fails startup rather than being silently misread.

```json
{
  "enableAccountRegistration": {
    "doc": "Whether new accounts can register",
    "format": "strict-boolean",
    "default": true,
    "env": "ENABLE_ACCOUNT_REGISTRATION"
  }
}
```

```ts
const config = createConfig({
  schemaDir: "./config",
  sources: [env({ from: { ENABLE_ACCOUNT_REGISTRATION: "0" } })],
});
await config.init();

config.get("enableAccountRegistration"); // false
```

## Required strings

convict has no way to say "this key must be provided": every entry needs a `default`, and an unset
key quietly resolves to it. The usual workaround, `default: null`, makes the key required but also
types it as `T | null` for every consumer, even though validation guarantees it is never null once
`init()` resolves.

`NON_EMPTY_STRING` (`format: "non-empty-string"`) is the alternative: pair it with an empty default
and an unset key fails validation naming itself, while the generated type stays `string`.

```json
{
  "secret": {
    "signingKey": {
      "doc": "Signs session cookies",
      "format": "non-empty-string",
      "default": "",
      "env": "SIGNING_KEY"
    }
  }
}
```

Whitespace counts as empty, so `SIGNING_KEY=" "` fails the same way. Use it for the keys a deploy
cannot run without; leave an ordinary `String` format on the ones that have a usable default.

## Requiring a layer file to exist

By default, `fileLayers()` treats a missing layer file as normal: no file for the given
`environment` just means "fall through to the schema defaults and whatever earlier sources set,"
with a warning routed through `onWarning`. That is convenient in development, where not every
environment has a file, but it means a typo'd `ENVIRONMENT` value (or a deploy that forgot to ship
the file) silently runs on defaults in production instead of failing loudly.

Pass `{ required: true }` to turn that into a hard failure: `fileLayers({ environment, required:
true })` throws a `ConfigError` naming the environment and the directory it searched, instead of
warning and returning `{}`, the moment no candidate file exists. Defaults to `false`.

```ts
sources: [fileLayers({ environment: process.env.ENVIRONMENT, required: true }), env()];
```

## Unknown keys are rejected

A key that appears in a layer file (or, via `secretName`, in a secret store) but is not declared in
`schema.json` fails `init()` rather than being silently dropped or accepted — this is what catches a
typo like `adminEamil` before it reaches production.

```json
// config/dev.json
{ "port": 4000, "adminEmail": "ops@example.test" }
```

```ts
try {
  await config.init();
} catch (error) {
  error.name; // "ConfigValidationError"
  error.message;
  // Configuration is invalid (1 problem(s)):
  // configuration param 'adminEmail' not declared in the schema
}
```

`ConfigValidationError` carries `.keys`, every rejected key rather than just the first.

## Reading `explain()`

`explain(key)` returns the resolved value, which source won, and every layer that contributed a
value for that key, lowest precedence first:

```ts
const config = createConfig({
  schemaDir: "./config",
  sources: [fileLayers({ environment: "staging" }), env({ from: { REDIS_PORT: "16379" } })],
});
await config.init();

config.explain("redis.port");
```

With a schema default of `6379`, `staging.json` setting `6380`, and `REDIS_PORT=16379`, this prints:

```js
{
  key: 'redis.port',
  value: 16379,
  winner: 'env',
  layers: [
    { source: 'default', value: 6379 },
    { source: 'files', value: 6380 },
    { source: 'env', value: '16379' }
  ]
}
```

(The `env` layer's recorded value is the raw string convict later coerced to a number — `explain()`
shows what each source contributed, not the final coerced value, except for the `value` field at
the top, which is the fully resolved one.)

## `fileLayers` collapses the two files it reads into one source

`fileLayers({ environment, region })` reads `<environment>.json`, then merges
`<environment>.<region>.json` on top of it, and returns the result as a single object under one
source name — `"files"` by default. That means `explain()` cannot tell you whether the winning
value for a key came from the environment file or the region file: both show up as the same layer,
`"files"`.

This is a real limitation, not a documentation gap — `explain()` is the library's headline
debugging feature, and this is the one place it can't fully answer "why is this value what it is."

**Workaround — no library change required.** Pass `fileLayers()` twice, once per file, each with a
distinct `name`, and point the second call's `names` at only the region file so it does not also
re-read the environment file:

```ts
sources: [
  fileLayers({ environment, name: "environment-file" }),
  fileLayers({ environment, region, names: (e, r) => [`${e}.${r}.json`], name: "region-file" }),
  env(),
];
```

With `environment: "production"`, `region: "eu"`, `production.json` setting
`{ "service": "demo-prod", "endpoint": "https://prod.example.test" }`, and `production.eu.json`
setting `{ "region": "eu", "endpoint": "https://eu.prod.example.test" }`, this actually separates
the provenance:

```js
// config.explain("endpoint")
{
  key: 'endpoint',
  value: 'https://eu.prod.example.test',
  winner: 'region-file',
  layers: [
    { source: 'default', value: 'https://example.test' },
    { source: 'environment-file', value: 'https://prod.example.test' },
    { source: 'region-file', value: 'https://eu.prod.example.test' }
  ]
}

// config.explain("service")
{
  key: 'service',
  value: 'demo-prod',
  winner: 'environment-file',
  layers: [
    { source: 'default', value: 'demo' },
    { source: 'environment-file', value: 'demo-prod' }
  ]
}
```

`service`, set only by the environment file, now unambiguously shows `environment-file` as its
winner; `endpoint`, set by both files, shows both contributions and correctly attributes the win to
`region-file`. This composition was verified by running it — both calls read files from the same
directory, and later sources still win, so nothing about `fileLayers` itself needs to change to get
per-file provenance.
