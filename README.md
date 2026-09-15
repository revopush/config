# @revopush/config

[![npm](https://img.shields.io/npm/v/@revopush/config.svg)](https://www.npmjs.com/package/@revopush/config)

Layered, schema-validated configuration for Node services — per-environment and per-region files,
environment variables, and pluggable secret providers, with a debugger that answers "why is this
value what it is."

## Install

```bash
npm i @revopush/config
```

Using Azure Key Vault for secrets:

```bash
npm i @revopush/config-azure-keyvault
```

## Thirty-second example

`config/schema.json`:

```json
{
  "port": { "doc": "HTTP port", "format": "port", "default": 3000, "env": "PORT" },
  "redis": {
    "host": { "doc": "Redis host", "format": "String", "default": "127.0.0.1", "env": "REDIS_HOST" }
  },
  "secret": {
    "sessionSecret": {
      "doc": "Session signing secret",
      "default": "",
      "env": "SESSION_SECRET",
      "sensitive": true
    }
  }
}
```

`config/staging.json` — a layer applied on top of the schema defaults:

```json
{ "redis": { "host": "staging-redis.internal" } }
```

```ts
import { createConfig, env, fileLayers } from "@revopush/config";

const config = createConfig({
  schemaDir: "./config",
  sources: [fileLayers({ environment: "staging" }), env()],
});
await config.init();

config.get("port"); // 3000 — schema default, nothing overrides it
config.get("redis.host"); // "staging-redis.internal" — from staging.json
config.get("secret.sessionSecret"); // from SESSION_SECRET, since no secretSource is configured
```

## Concepts

**Schema.** A JSON file, `schema.json`, declares every configuration key up front: its default
value, an optional `doc`, an optional `format` for validation, the environment variable that can
set it, and whether it is `sensitive` or `nullable`. Nothing reaches `config.get()` that the schema
did not declare — an unknown key anywhere in a layer file fails startup instead of being silently
ignored.

**Layers.** Configuration is resolved by merging sources in order, each one allowed to override the
keys the ones before it set. The schema's own defaults are the base layer; everything else —
per-environment files, environment variables, secrets — applies on top, later sources winning. Ask
`config.explain(key)` at any time to see every layer that touched a key and which one won.

**Sources.** A source is anything that can supply values for a load: `fileLayers()` reads
`<environment>.json` and `<environment>.<region>.json` from the schema directory, and `env()` reads
the `env:` binding on each schema key from `process.env`. Sources compose in an array, and writing
your own is a ~15-line object — see [`docs/writing-a-source.md`](docs/writing-a-source.md).

**Secrets.** Keys under the `secret.` node are resolved by a `SecretSource` — Azure Key Vault today,
any store of named values in principle — with the environment variable as the fallback when the
source does not hold a given secret. See
[`docs/writing-a-secret-source.md`](docs/writing-a-secret-source.md).

## Why not node-config or convict alone

- **Typed keys from the schema.** Generate a `ConfigKeys` interface from `schema.json` and
  `config.get()` becomes fully typed and autocompleted — no hand-maintained interface to drift from
  the schema. See [`docs/typed-keys.md`](docs/typed-keys.md).
- **Provenance via `explain()`.** Every value can be traced to the layer that set it: schema
  default, which file, which environment variable, which secret source. `toJSON()` gives the same
  view for logging, with `sensitive` keys redacted.
- **Pluggable secret providers.** Secrets are a first-class, separate concept from configuration
  values, with a small provider contract ([`SecretSource`](docs/writing-a-secret-source.md)) that
  a new store implements without touching core.

## Guides

- [`docs/layering.md`](docs/layering.md) — precedence order, strict booleans, unknown-key
  rejection, and reading `explain()` output.
- [`docs/writing-a-source.md`](docs/writing-a-source.md) — the `Source` interface and a worked
  example.
- [`docs/writing-a-secret-source.md`](docs/writing-a-secret-source.md) — the `SecretSource`
  interface, its three rules, and a worked example.
- [`docs/typed-keys.md`](docs/typed-keys.md) — generating and using the `ConfigKeys` interface,
  the schema-to-TypeScript mapping table, and `--check` in CI.
- [`docs/migrating.md`](docs/migrating.md) — moving from convict or node-config.

## Packages

- [`packages/core`](packages/core/README.md) — `@revopush/config`.
- [`packages/azure`](packages/azure/README.md) — `@revopush/config-azure-keyvault`.
