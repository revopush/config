# Writing a secret source

A `SecretSource` resolves the keys under a schema's `secret.` node from an external store — Azure
Key Vault today (`@revopush/config-azure-keyvault`), or any other store of named values you write
one for.

## The interface

```ts
/** Where secrets come from. Azure Key Vault is one implementation; any store of named values is another. */
interface SecretSource {
  readonly name: string;
  /**
   * Takes config key -> secret name, returns config key -> value. A secret this source does not
   * hold is omitted, leaving its environment variable in charge; any other failure must reject.
   */
  load(names: ReadonlyMap<string, string>): Promise<Map<string, string>>;
}
```

`createConfig` calls `load()` once per `init()`, with one entry per secret key any source declared
(even to an empty string) — schema defaults alone do not count as declaring a secret. The map it
gets back is applied at the highest precedence, above environment variables, so a value actually in
the store beats a stale variable left lying around.

## The three rules

1. **Omit what you do not hold.** A key absent from your map is not an error — it leaves the
   environment variable in charge, since every secret also has one. Do not throw for "not found";
   just don't add it to the returned `Map`.
2. **Reject everything else.** A network failure, an auth failure, a malformed response — anything
   that is not "this specific secret does not exist" must reject the whole `load()` call. An
   unreachable store is indistinguishable from an outage, and an outage must stop startup rather
   than silently fall back to environment variables for secrets that do exist in the store.
3. **Key the result by config key, not by secret name.** `load()` receives `config key -> secret
   name`; it must return `config key -> value`, using the same keys it was given (e.g.
   `"secret.redisKey"`), not the store's own names (e.g. `"redis-key"`). `createConfig` matches the
   result back to the schema by config key.

This asymmetry — one kind of failure is silently absorbed, every other kind stops the process — is
the entire design of the secret layer. It lets an optional secret be genuinely optional (omit it,
env var takes over) while making sure a broken store is never mistaken for "nothing configured."

## How `secretName` and `{placeholder}` decide the names you receive

The name your source is asked to resolve is not the config key — it is derived, unless the schema
entry overrides it with `secretName`:

- **Default: kebab-case the key's last segment.** `secret.redisKey` asks for `"redis-key"`;
  `secret.password` asks for `"password"` unchanged.
- **The kebab-case conversion glues together runs of capital letters.** It only inserts a dash
  before an uppercase letter that follows a lowercase letter or digit — so a name with two adjacent
  capitals, like `awsIAMKey`, becomes `aws-iamkey`, not `aws-iam-key`. Likewise
  `auth0ClientSecret` splits only at the digit-to-letter boundary, `auth0-client-secret`. If the
  derived name is wrong for your store, override it explicitly:

  ```json
  { "secret": { "awsIAMKey": { "default": "", "secretName": "aws-iam-key" } } }
  ```

- **`secretName` can interpolate `{config.key}` placeholders**, resolved against whatever the
  layers merged before secrets are requested — useful for a name built from another setting, such
  as a per-account storage key:

  ```json
  {
    "azure": { "storageAccount": { "default": "demoaccount" } },
    "secret": {
      "storageKey": { "default": "", "secretName": "storage-{azure.storageAccount}" }
    }
  }
  ```

  With `azure.storageAccount` resolved to `"demoaccount"`, the source is asked to resolve
  `"storage-demoaccount"`. A placeholder that resolves to `undefined`, `null`, or `""` is a
  `ConfigError` at `init()` time rather than a truncated name silently sent to the store — a
  half-built name like `"storage-"` would otherwise read as "the store does not hold this," and the
  secret would silently fall back to its environment variable instead of failing loudly.

## A worked example

A secret source for a fictional store, "Vaultly," whose client rejects with `{ code: "NOT_FOUND" }`
for a name it does not hold:

```ts
import type { SecretSource } from "@revopush/config";

interface VaultlyClient {
  get(name: string): Promise<string>;
}

/** A secret source for the fictional Vaultly store. */
export function vaultly(client: VaultlyClient): SecretSource {
  return {
    name: "vaultly",
    async load(names: ReadonlyMap<string, string>): Promise<Map<string, string>> {
      const resolved = new Map<string, string>();
      await Promise.all(
        Array.from(names, async ([key, name]) => {
          try {
            const value = await client.get(name);
            if (value !== undefined) resolved.set(key, value);
          } catch (error) {
            if ((error as { code?: string })?.code === "NOT_FOUND") return; // rule 1: omit
            throw error; // rule 2: anything else stops startup
          }
        })
      );
      return resolved; // rule 3: keyed by config key, e.g. "secret.redisKey"
    },
  };
}
```

## Verifying it with `testSecretSource`

`@revopush/config/testing` exports `testSecretSource(factory)`, which drives an implementation
against fixed fixtures — a name it holds, a name it does not, and a name whose lookup must reject —
and checks all three rules plus the `name` and empty-request cases:

```ts
import { describe } from "vitest";
import { testSecretSource } from "@revopush/config/testing";
import { vaultly } from "./vault-store";

describe("vaultly", () =>
  testSecretSource(({ present, absent, failing }) =>
    vaultly({
      async get(name) {
        if (name === failing) throw new Error("unreachable");
        if (name in present) return present[name]!;
        throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
      },
    })
  ));
```

Run against the `vaultly` implementation above, this passes all five conformance checks: it has a
name, returns a value keyed by config key rather than secret name, omits an absent secret instead
of throwing, rejects when the store is unreachable, and returns an empty map for an empty request
without consulting the store.
