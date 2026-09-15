import { describe, expect, it } from "vitest";
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
});
