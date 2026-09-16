# @revopush/config

[![npm](https://img.shields.io/npm/v/@revopush/config.svg)](https://www.npmjs.com/package/@revopush/config)

Layered, schema-validated configuration for Node services — per-environment and per-region files,
environment variables, and pluggable secret providers, with a debugger that answers "why is this
value what it is."

## Install

```bash
npm i @revopush/config
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

Call `init()` once, in one place, and share the resulting `config`: it is not idempotent by
design (a later call re-reads every file and re-fetches every secret, which is what lets a test
change an environment variable and re-read), so awaiting it from two separate entry points pays
for the vault round trip twice.

## Documentation

These guides live in the [repository](../../README.md), so the links below only resolve when
you're browsing the source rather than the npm page:

- [Root README](../../README.md) — concepts and links.
- [`docs/layering.md`](https://github.com/revopush/config/blob/main/docs/layering.md) — precedence, strict booleans, requiring a layer
  file to exist, unknown-key rejection, `explain()`.
- [`docs/writing-a-source.md`](https://github.com/revopush/config/blob/main/docs/writing-a-source.md) — the `Source` interface and a
  worked example.
- [`docs/writing-a-secret-source.md`](https://github.com/revopush/config/blob/main/docs/writing-a-secret-source.md) — the `SecretSource`
  interface and a worked example.
- [`docs/typed-keys.md`](https://github.com/revopush/config/blob/main/docs/typed-keys.md) — generating and using the `ConfigKeys`
  interface, the mapping table, and `--check` in CI.
- [`docs/migrating.md`](https://github.com/revopush/config/blob/main/docs/migrating.md) — from convict or node-config.
- [`@revopush/config-azure-keyvault`](../azure/README.md) — the Azure Key Vault secret provider.

## License

MIT
