# Migrating to @revopush/config

## From convict

A convict schema already works here largely unchanged — the schema format this library uses _is_
convict's, JSON with `default`/`doc`/`format`/`env`/`sensitive` leaves. Migrating is mechanical:

1. **Move the schema to `schema.json`.** If it currently lives inline in a `.ts`/`.js` file, write
   it out as JSON in the directory that also holds your per-environment layer files:

   ```json
   // config/schema.json
   {
     "port": { "doc": "HTTP port", "format": "port", "default": 3000, "env": "PORT" }
   }
   ```

2. **Replace `convict(schema)` with `createConfig({ schemaDir })`.**

   ```ts
   // before
   import convict from "convict";
   import schema from "./schema.json";
   const config = convict(schema);
   config.loadFile(`./config/${process.env.NODE_ENV}.json`);
   config.validate({ allowed: "strict" });

   // after
   import { createConfig } from "@revopush/config";
   const config = createConfig({ schemaDir: __dirname });
   await config.init();
   ```

   `createConfig`'s default sources, `[fileLayers(), env()]`, already do what the `loadFile` +
   `validate` pair above did by hand: read `<environment>.json` (environment defaults to `"dev"`;
   pass `fileLayers({ environment: process.env.NODE_ENV })` to keep the old selection), apply
   environment variables per the schema's `env:` bindings, and reject unknown keys.

3. **Await `init()`.** convict's `loadFile` and `validate` are synchronous; `createConfig`'s
   equivalent work happens in `init()`, which is asynchronous because a real source (a file read, a
   secret store) may need to be. `createConfig` itself does no I/O and can be called at module
   scope; `await config.init()` once in the entry point before anything reads a key.

Everything downstream is unchanged: `config.get("redis.port")` keeps its shape. Two things convict
did not give you become available once you're on `createConfig`: `config.explain("redis.port")`
for provenance, and a generated `ConfigKeys` type so `get()` is no longer stringly-typed — both
opt-in, neither required to finish the migration.

## From node-config

node-config's `config.get("a.b")` maps directly — the dotted-path key shape is the same, and both
throw rather than return `undefined` for a key that isn't there (see below).

1. **`config.get("a.b")` needs no change.** Both libraries key by dotted path; the call site is
   identical.

2. **Replace `NODE_ENV`-driven file selection with `fileLayers({ environment })`.** node-config
   picks `config/${NODE_ENV}.json` (plus `local.json`, `local-${NODE_ENV}.json`, and others)
   implicitly from the environment variable and a fixed search path. This library's file loading is
   explicit and a single mechanism:

   ```ts
   // before: node-config resolves config/production.json from NODE_ENV automatically
   import config from "config";
   config.get("redis.port");

   // after: the source list says exactly which file, from which directory
   import { createConfig, env, fileLayers } from "@revopush/config";
   const config = createConfig({
     schemaDir: __dirname,
     sources: [fileLayers({ environment: process.env.NODE_ENV }), env()],
   });
   await config.init();
   config.get("redis.port");
   ```

   There is no `local.json`-style override layer or cascading search path — if you relied on one,
   add it explicitly as another `fileLayers()` call (see
   [`docs/layering.md`](layering.md#filelayers-collapses-the-two-files-it-reads-into-one-source) for
   composing more than one file source) or an `env()` layer ahead of it.

3. **A schema is now required, and unknown keys fail rather than returning `undefined`.**
   node-config has no schema: reading a key that was never set returns `undefined`, and a typo in a
   config file is silently ignored. Here every key `config.get()` can return must be declared in
   `schema.json` with a `default`, and a key present in a layer file but _not_ declared in the
   schema fails `init()` with `ConfigValidationError` rather than being silently accepted. Write a
   schema entry for every key node-config's files currently set — this is the one non-mechanical
   part of the migration, and it is also what catches the class of bug node-config lets through: a
   typo'd or removed key that used to silently read as `undefined` in production.
