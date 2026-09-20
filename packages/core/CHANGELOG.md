# @revopush/config

## 0.3.0

### Minor Changes

- dc0dcd6: Schema branches, generated accessors, and secrets found by node.

  **Branches.** One schema can describe several deployments: a branch node holds one child per
  deployment, and `pruneBranch(schema, "platform", name)` keeps the one this process runs. Keys keep
  their path — `platform.saas.cloudflare.uri` is the key, nothing is flattened — so another
  deployment's key is an unknown key rather than a default nothing resolved.

  **Accessors.** `revopush-config types` now emits one interface per schema node and a `bind()`
  factory over them, alongside the existing `ConfigKeys`:

  ```ts
  export const { redis, platform } = bind(config);

  redis.port; // number
  platform.saas.cloudflare.uri; // string
  ```

  Every leaf is a getter, so a value is read when it is touched rather than when `bind()` is called
  — which is what makes binding at import safe, given `init()` is awaited later. `--no-accessors`
  emits only `ConfigKeys`, and `--import` points the generated `import type { ReadonlyConfig }` at
  something other than `@revopush/config`.

  **Secrets are found by their node.** A key is a secret when a `secret` node appears anywhere in its
  path, not only at the root, so a branch's secrets at `platform.saas.secret.apiToken` are fetched
  from the secret source and redacted from `toJSON()`. The name derived for the store is unchanged —
  the part below the nearest `secret` node — so nothing needs renaming.

  This widens behaviour: a `secret` group nested anywhere is now resolved by the secret source and
  redacted, where previously only a root-level `secret.` prefix was.

  **The generated file changes shape.** It now carries an `import type` line, the per-node
  interfaces and `bind`, so every consumer regenerates it. Because its style is the generator's
  rather than yours, exclude it from your formatter — reformatting makes `--check` fail.

## 0.2.0

### Minor Changes

- 8c76d8a: Add `required: true` to the schema entry vocabulary.

  convict needs a `default` on every entry, so an unset key resolves to it silently. `required` says
  a default is not good enough: if no source supplied the key, `init()` throws `ConfigValidationError`
  naming every key that is missing.

  Presence means "a source set it", so it works for numbers, booleans and enums, not only strings,
  and the key keeps an ordinary default — and so an ordinary generated type, unlike the `default: null`
  workaround which types the key `T | null` for every consumer.

### Patch Changes

- 28c802a: Reject a source named `default`. That name is the provenance of schema defaults, so a source using
  it had every value it supplied read back as a default — and any secret it declared was never
  requested from the secret store.
