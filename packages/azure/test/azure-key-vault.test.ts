import { describe, expect, it } from "vitest";
import { testSecretSource } from "@revopush/config/testing";
import { ConfigError } from "@revopush/config";
import { azureKeyVault, resolveVaultUri } from "../src/index";

function stub(values: Record<string, string | undefined>, failing?: string) {
  return {
    // No `await` needed: a throw here happens while `getSecret(...)` is still being evaluated,
    // inside the caller's try/await, so it is caught exactly as a rejected promise would be.
    getSecret: (name: string) => {
      if (name === failing) throw new Error("unreachable");
      if (!(name in values)) throw Object.assign(new Error("SecretNotFound"), { statusCode: 404 });
      return Promise.resolve({ value: values[name] });
    },
  };
}

describe("resolveVaultUri", () => {
  it("prefers the full URI over the legacy account name", () => {
    expect(
      resolveVaultUri({
        AZURE_KEYVAULT_URI: "https://v.vault.azure.net",
        AZURE_KEYVAULT_ACCOUNT: "other",
      })
    ).to.equal("https://v.vault.azure.net");
  });

  it("builds a URI from the legacy account name", () => {
    expect(resolveVaultUri({ AZURE_KEYVAULT_ACCOUNT: "myvault" })).to.equal(
      "https://myvault.vault.azure.net"
    );
  });

  it("returns empty when neither is set, which disables the vault", () => {
    expect(resolveVaultUri({})).to.equal("");
  });
});

describe("azureKeyVault", () => {
  it("keys the result by config key", async () => {
    const source = azureKeyVault({ client: stub({ "redis-key": "r1" }) });
    const resolved = await source.load(new Map([["secret.redisKey", "redis-key"]]));
    expect(resolved.get("secret.redisKey")).to.equal("r1");
  });

  // A vault entry that exists but is blank must not shadow a working environment variable.
  it("drops empty and undefined values", async () => {
    const source = azureKeyVault({ client: stub({ a: "", b: undefined }) });
    const resolved = await source.load(
      new Map([
        ["secret.a", "a"],
        ["secret.b", "b"],
      ])
    );
    expect(resolved.size).to.equal(0);
  });

  // A whitespace-only vault entry is the same class of misconfiguration as an empty string and
  // must not shadow a working environment variable either.
  it("drops whitespace-only values", async () => {
    const source = azureKeyVault({ client: stub({ a: "   " }) });
    const resolved = await source.load(new Map([["secret.a", "a"]]));
    expect(resolved.size).to.equal(0);
  });

  // Optional secrets are absent by design; a 404 must leave the environment variable in charge
  // rather than abort startup for every other secret too.
  it("treats a secret that is not in the vault as absent", async () => {
    const source = azureKeyVault({ client: stub({ present: "p" }) });
    const resolved = await source.load(
      new Map([
        ["secret.present", "present"],
        ["secret.missing", "missing"],
      ])
    );
    expect(resolved.get("secret.present")).to.equal("p");
    expect(resolved.has("secret.missing")).to.equal(false);
  });

  it("names the failing secret when a fetch rejects for any other reason", async () => {
    const source = azureKeyVault({ client: stub({}, "redis-key") });
    await expect(source.load(new Map([["secret.redisKey", "redis-key"]]))).rejects.toThrow(
      /redis-key/
    );
  });

  it("holds nothing when no vault is configured", async () => {
    const saved = {
      uri: process.env.AZURE_KEYVAULT_URI,
      account: process.env.AZURE_KEYVAULT_ACCOUNT,
    };
    delete process.env.AZURE_KEYVAULT_URI;
    delete process.env.AZURE_KEYVAULT_ACCOUNT;
    try {
      const resolved = await azureKeyVault().load(new Map([["secret.a", "a"]]));
      expect(resolved.size).to.equal(0);
    } finally {
      if (saved.uri) process.env.AZURE_KEYVAULT_URI = saved.uri;
      if (saved.account) process.env.AZURE_KEYVAULT_ACCOUNT = saved.account;
    }
  });

  it("is named", () => {
    expect(azureKeyVault().name).to.equal("azure-key-vault");
  });

  describe("required", () => {
    function withoutVaultEnv<T>(fn: () => T): T {
      const saved = {
        uri: process.env.AZURE_KEYVAULT_URI,
        account: process.env.AZURE_KEYVAULT_ACCOUNT,
      };
      delete process.env.AZURE_KEYVAULT_URI;
      delete process.env.AZURE_KEYVAULT_ACCOUNT;
      try {
        return fn();
      } finally {
        if (saved.uri) process.env.AZURE_KEYVAULT_URI = saved.uri;
        if (saved.account) process.env.AZURE_KEYVAULT_ACCOUNT = saved.account;
      }
    }

    it("throws ConfigError when required and no vault location is configured", async () =>
      withoutVaultEnv(async () => {
        const source = azureKeyVault({ required: true });
        await expect(source.load(new Map([["secret.a", "a"]]))).rejects.toThrow(ConfigError);
        await expect(source.load(new Map([["secret.a", "a"]]))).rejects.toThrow(
          /AZURE_KEYVAULT_URI|AZURE_KEYVAULT_ACCOUNT/
        );
      }));

    it("does not throw when required is false (the default) and no vault location is configured", async () =>
      withoutVaultEnv(async () => {
        const resolved = await azureKeyVault().load(new Map([["secret.a", "a"]]));
        expect(resolved.size).to.equal(0);
      }));

    it("does not throw when required and a client is supplied directly", async () => {
      const source = azureKeyVault({ required: true, client: stub({ "redis-key": "r1" }) });
      const resolved = await source.load(new Map([["secret.redisKey", "redis-key"]]));
      expect(resolved.get("secret.redisKey")).to.equal("r1");
    });

    it("does not throw for an empty request even when required and no vault is configured", async () =>
      withoutVaultEnv(async () => {
        const resolved = await azureKeyVault({ required: true }).load(new Map());
        expect(resolved.size).to.equal(0);
      }));
  });
});

describe("azure key vault conformance", () =>
  testSecretSource(({ present, failing }) =>
    azureKeyVault({ client: stub({ ...present }, failing) })
  ));
