import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors";
import { secretNames } from "../src/secrets";

const schema = {
  azure: { storageAccount: { doc: "Account", default: "" } },
  secret: {
    redisKey: { doc: "Redis key", default: "", sensitive: true },
    sessionSecretPrevious: { doc: "Retired", default: "", sensitive: true },
    auth0ClientSecret: { doc: "Auth0", default: "", sensitive: true },
    password: { doc: "Password", default: "", sensitive: true },
    storageKey: { doc: "Storage", default: "", sensitive: true, secretName: "storage-{azure.storageAccount}" },
  },
};

const read = (key: string) => (key === "azure.storageAccount" ? "myaccount" : undefined);

describe("secretNames", () => {
  // A dotted name is rejected by stores such as Azure Key Vault, whose names must match
  // ^[0-9a-zA-Z-]+$ — which reads as "not found" and silently falls back to the env var.
  it("flattens a nested secret key to a dashed name a store will accept", () => {
    const nested = { secret: { redis: { password: { doc: "P", default: "" } } } };
    expect(secretNames(nested, ["secret.redis.password"], read).get("secret.redis.password")).to.equal(
      "redis-password"
    );
  });

  it("derives a kebab-case name from a camelCase key", () => {
    const names = secretNames(schema, ["secret.redisKey", "secret.sessionSecretPrevious"], read);
    expect(names.get("secret.redisKey")).to.equal("redis-key");
    expect(names.get("secret.sessionSecretPrevious")).to.equal("session-secret-previous");
  });

  // auth0ClientSecret is the awkward one: the boundary is digit-to-uppercase, not letter-to-uppercase.
  it("splits on a digit followed by an uppercase letter", () => {
    expect(secretNames(schema, ["secret.auth0ClientSecret"], read).get("secret.auth0ClientSecret")).to.equal(
      "auth0-client-secret"
    );
  });

  it("leaves an already-lowercase key untouched", () => {
    expect(secretNames(schema, ["secret.password"], read).get("secret.password")).to.equal("password");
  });

  it("prefers an explicit secretName over the derived one", () => {
    expect(secretNames(schema, ["secret.storageKey"], read).get("secret.storageKey")).to.equal("storage-myaccount");
  });

  it("resolves every placeholder in a secretName template", () => {
    const templated = {
      a: { one: { doc: "1", default: "" } },
      b: { two: { doc: "2", default: "" } },
      secret: { k: { doc: "K", default: "", secretName: "{a.one}-x-{b.two}" } },
    };
    const values: Record<string, string> = { "a.one": "A", "b.two": "B" };
    expect(secretNames(templated, ["secret.k"], (key) => values[key]).get("secret.k")).to.equal("A-x-B");
  });

  it("ignores a declared key that is not in the schema", () => {
    expect(secretNames(schema, ["secret.ghost"], read).size).to.equal(0);
  });

  // A truncated name like "storage-" would read as "the store does not hold this secret" and silently fall back to an environment variable.
  it("throws when a placeholder resolves to undefined", () => {
    const badRead = () => undefined;
    expect(() => secretNames(schema, ["secret.storageKey"], badRead)).toThrowError(
      /Secret "secret.storageKey" has secretName "storage-\{azure.storageAccount\}", but "azure.storageAccount" resolved to nothing\./
    );
  });

  // An empty value is as wrong as a missing one in a template — it silently produces a truncated name.
  it("throws when a placeholder resolves to an empty string", () => {
    const emptyRead = (key: string) => (key === "azure.storageAccount" ? "" : undefined);
    expect(() => secretNames(schema, ["secret.storageKey"], emptyRead)).toThrowError(
      /Secret "secret.storageKey" has secretName "storage-\{azure.storageAccount\}", but "azure.storageAccount" resolved to nothing\./
    );
  });
});
