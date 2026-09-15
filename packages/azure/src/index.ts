import type { SecretSource } from "@revopush/config";

/** The part of the Azure SDK's SecretClient this provider uses. */
export interface SecretClient {
  getSecret(name: string): Promise<{ value?: string }>;
}

/**
 * Where the vault is: `AZURE_KEYVAULT_URI`, or a URI built from the legacy
 * `AZURE_KEYVAULT_ACCOUNT`. Empty when neither is set, which disables vault loading.
 */
export function resolveVaultUri(env: Record<string, string | undefined>): string {
  if (env.AZURE_KEYVAULT_URI) return env.AZURE_KEYVAULT_URI;
  if (env.AZURE_KEYVAULT_ACCOUNT) return `https://${env.AZURE_KEYVAULT_ACCOUNT}.vault.azure.net`;
  return "";
}

function createClient(uri: string): SecretClient {
  // Required lazily, not imported at module scope: the Azure SDK is 322 modules, and pulling it
  // into every process that touches config costs more than most test suites take to run.
  const { DefaultAzureCredential } = require("@azure/identity");
  const { SecretClient: AzureSecretClient } = require("@azure/keyvault-secrets");
  return new AzureSecretClient(uri, new DefaultAzureCredential());
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { statusCode?: number; code?: string };
  return candidate?.statusCode === 404 || candidate?.code === "SecretNotFound";
}

/**
 * Reads secrets from Azure Key Vault using `DefaultAzureCredential`.
 *
 * A secret the vault does not hold is omitted rather than thrown, because optional secrets are
 * absent by design and every secret also has an environment variable. Any other failure rejects,
 * because an unreachable vault is indistinguishable from an outage and must stop startup.
 */
export function azureKeyVault(client?: SecretClient): SecretSource {
  return {
    name: "azure-key-vault",
    async load(names: ReadonlyMap<string, string>): Promise<Map<string, string>> {
      const values = new Map<string, string>();
      if (names.size === 0) return values;

      const uri = resolveVaultUri(process.env);
      if (!client && !uri) return values;
      const vault = client ?? createClient(uri);

      await Promise.all(
        Array.from(names, async ([key, name]) => {
          try {
            const { value } = await vault.getSecret(name);
            if (value) values.set(key, value);
          } catch (error) {
            if (isNotFound(error)) return;
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read Key Vault secret "${name}" for config key "${key}": ${detail}`);
          }
        })
      );

      return values;
    },
  };
}
