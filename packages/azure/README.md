# @revopush/config-azure-keyvault

[![npm](https://img.shields.io/npm/v/@revopush/config-azure-keyvault.svg)](https://www.npmjs.com/package/@revopush/config-azure-keyvault)

An Azure Key Vault [`SecretSource`](../core/README.md) for
[`@revopush/config`](https://www.npmjs.com/package/@revopush/config).

## Install

```bash
npm i @revopush/config-azure-keyvault
```

`@revopush/config` is a peer dependency, so install it alongside if you haven't already.

## Usage

```ts
import { createConfig, env, fileLayers } from "@revopush/config";
import { azureKeyVault } from "@revopush/config-azure-keyvault";

const config = createConfig({
  schemaDir: __dirname,
  sources: [fileLayers({ environment: process.env.ENVIRONMENT }), env()],
  secretSource: azureKeyVault(),
});
await config.init();
```

`azureKeyVault()` authenticates with `DefaultAzureCredential` — the standard Azure SDK credential
chain (managed identity in Azure, `az login` locally, environment variables in CI). The Azure SDK
itself (`@azure/identity`, `@azure/keyvault-secrets`) is imported lazily on first use, not at module
load, so requiring this package costs nothing when no vault is configured.

## Vault location

The vault is located from an environment variable, checked in this order:

1. **`AZURE_KEYVAULT_URI`** — the full vault URI, e.g. `https://my-vault.vault.azure.net`.
2. **`AZURE_KEYVAULT_ACCOUNT`** — the legacy shorthand, a bare vault name; the URI is built as
   `https://<AZURE_KEYVAULT_ACCOUNT>.vault.azure.net`.

If neither is set, `azureKeyVault()` resolves every secret to nothing rather than erroring — vault
loading is simply disabled, and every declared secret falls back to its environment variable.

Pass `{ required: true }` to make a missing vault location a hard failure instead:
`azureKeyVault({ required: true })` throws a `ConfigError` naming the two environment variables the
moment a secret is declared and neither is set, rather than silently falling back to environment
variables for every secret. Defaults to `false`, so local development without a vault is
unaffected.

## Required role

The identity `DefaultAzureCredential` resolves needs the **Key Vault Secrets User** role (or
equivalent `get`/`list` permissions under the vault's access policy) on the target vault. Without
it, every lookup fails with an authorization error, which — unlike a missing secret — is treated as
an outage and stops startup; see the 404 rule below for why that distinction matters.

## A secret the vault doesn't hold is treated as absent, not as a failure

A lookup that fails with HTTP 404 or Key Vault's `SecretNotFound` error code is not surfaced as an
error: it is treated the same as the vault simply not holding that secret, so the key's environment
variable stays in charge. This is deliberate — a service's secrets are not all required to live in
the vault, and an optional one being absent is not, by itself, a sign of trouble.

Every other failure — a network error, an authorization failure, any other rejected request — does
propagate, and stops `config.init()` from resolving. An unreachable vault is indistinguishable from
an outage and must never be silently treated the same as "this one secret isn't here."

A vault entry that exists but is empty or whitespace-only is also dropped rather than returned,
so it cannot silently shadow a working environment variable with a blank value. A value with
meaningful surrounding whitespace — not whitespace-only — is stored unchanged: this presence check
only gates whether the value counts as set, not what gets stored, because some tokens carry
significant whitespace.

## License

MIT
