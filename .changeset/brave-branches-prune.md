---
"@revopush/config": minor
---

Schema branches, generated accessors, and secrets found by node.

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
