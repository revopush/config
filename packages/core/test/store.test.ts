import { describe, expect, it } from "vitest";
import { ConfigError, ConfigValidationError } from "../src/errors";
import { STRICT_BOOLEAN } from "../src/formats";
import { Store } from "../src/store";

const schema = {
  redis: {
    host: { doc: "Host", default: "localhost", env: "REDIS_HOST" },
    port: { doc: "Port", format: "port", default: 6379, env: "REDIS_PORT" },
  },
  api: { https: { doc: "HTTPS", format: STRICT_BOOLEAN, default: false } },
  secret: {
    apiKey: { doc: "Api key", default: "", sensitive: true },
    unused: { doc: "Unused", default: "", sensitive: true },
  },
};

describe("Store", () => {
  it("starts from the schema defaults", () => {
    expect(new Store(schema).get("redis.host")).to.equal("localhost");
  });

  it("lets a later layer beat an earlier one", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { host: "prod-redis" } });
    store.merge("env", { redis: { host: "env-redis" } });
    expect(store.get("redis.host")).to.equal("env-redis");
  });

  // Sources hand over raw strings; convict coerces them against the schema format.
  it("coerces string values, including custom formats", () => {
    const store = new Store(schema);
    store.merge("env", { redis: { port: "6380" }, api: { https: "yes" } });
    store.validate();
    expect(store.get("redis.port")).to.equal(6380);
    expect(store.get("api.https")).to.equal(true);
  });

  it("treats an empty value as absent for has()", () => {
    const store = new Store(schema);
    expect(store.has("secret.apiKey")).to.equal(false);
    expect(store.has("redis.host")).to.equal(true);
  });

  // has() answers "is this set" and an undeclared key is never set, so it stays false rather than
  // throwing — unlike get() and explain(), which must fail loudly on a typo'd key.
  it("reports a required key no source supplied", () => {
    const store = new Store({ token: { doc: "Token", default: "", required: true } });

    expect(store.missingRequired()).to.deep.equal(["token"]);
  });

  it("does not report a required key a source supplied", () => {
    const store = new Store({ token: { doc: "Token", default: "", required: true } });
    store.merge("env", { token: "abc" });

    expect(store.missingRequired()).to.deep.equal([]);
  });

  // has() reads 0 and false as supplied, so presence has to come from the layers instead.
  it("reports a required numeric key still on its default", () => {
    const store = new Store({ port: { doc: "Port", format: "port", default: 0, required: true } });

    expect(store.missingRequired()).to.deep.equal(["port"]);
  });

  it("ignores keys that are not required", () => {
    const store = new Store({ port: { doc: "Port", format: "port", default: 0 } });

    expect(store.missingRequired()).to.deep.equal([]);
  });

  it("returns false from has() for a key that is not in the schema, without throwing", () => {
    const store = new Store(schema);
    expect(store.has("typo")).to.equal(false);
  });

  it("throws ConfigError, not a raw convict error, from get() for a key that is not in the schema", () => {
    const store = new Store(schema);
    expect(() => store.get("typo")).toThrow(ConfigError);
    try {
      store.get("typo");
      expect.fail("get() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).to.contain("typo");
      expect((error as ConfigError).message).to.not.contain("cannot find configuration param");
    }
  });

  it("throws ConfigError, not a raw convict error, from explain() for a key that is not in the schema", () => {
    const store = new Store(schema);
    expect(() => store.explain("typo")).toThrow(ConfigError);
    try {
      store.explain("typo");
      expect.fail("explain() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).to.contain("typo");
      expect((error as ConfigError).message).to.not.contain("cannot find configuration param");
    }
  });

  it("rejects a key that is not in the schema, which catches typos", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { hsot: "typo" } });
    expect(() => store.validate()).toThrow(ConfigValidationError);
  });

  // convict formats an unknown-param problem as a sentence, not as "key: reason" like every
  // other validation failure, so the key extraction needs a separate case for it.
  it("names the offending key for an unknown key, not the whole convict sentence", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { hsot: "typo" } });
    try {
      store.validate();
      expect.fail("validate() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).keys).to.deep.equal(["redis.hsot"]);
    }
  });

  it("collects both an unknown key and a format error together", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { hsot: "typo", port: "not-a-port" } });
    try {
      store.validate();
      expect.fail("validate() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).keys.sort()).to.deep.equal([
        "redis.hsot",
        "redis.port",
      ]);
    }
  });

  it("collects every rejected key rather than only the first", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { port: "not-a-port" }, api: { https: "maybe" } });
    try {
      store.validate();
      expect.fail("validate() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).keys.sort()).to.deep.equal([
        "api.https",
        "redis.port",
      ]);
    }
  });

  it("reports which source supplied the winning value and what each layer contributed", () => {
    const store = new Store(schema);
    store.merge("file", { redis: { host: "prod-redis" } });
    store.merge("env", { redis: { host: "env-redis" } });

    const provenance = store.explain("redis.host");
    expect(provenance.winner).to.equal("env");
    expect(provenance.value).to.equal("env-redis");
    expect(provenance.layers).to.deep.equal([
      { source: "default", value: "localhost" },
      { source: "file", value: "prod-redis" },
      { source: "env", value: "env-redis" },
    ]);
  });

  it("names a key nothing overrode as coming from the defaults", () => {
    expect(new Store(schema).explain("redis.port").winner).to.equal("default");
  });

  it("applies set() above every merged layer", () => {
    const store = new Store(schema);
    store.merge("env", { secret: { apiKey: "from-env" } });
    store.set("vault", "secret.apiKey", "from-vault");
    expect(store.get("secret.apiKey")).to.equal("from-vault");
    expect(store.explain("secret.apiKey").winner).to.equal("vault");
  });

  // convict would otherwise accept the write silently and explain() would report it as
  // defaulted, hiding that a source set a misspelled secret key at all.
  it("rejects set() for a key that is not in the schema instead of silently dropping its provenance", () => {
    const store = new Store(schema);
    expect(() => store.set("vault", "secret.ghost", "x")).toThrow(ConfigError);
    try {
      store.set("vault", "secret.ghost", "x");
      expect.fail("set() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).to.contain("vault");
      expect((error as ConfigError).message).to.contain("secret.ghost");
    }
  });

  // A schema says which secrets exist; a layer file says which ones this environment requires.
  it("counts a secret as declared only when a source set it, not when it merely has a default", () => {
    const store = new Store(schema);
    store.merge("file", { secret: { apiKey: "" } });
    expect([...store.declaredSecrets().keys()]).to.deep.equal(["secret.apiKey"]);
    expect(store.declaredSecrets().get("secret.apiKey")).to.equal("file");
  });

  it("redacts sensitive keys in toJSON so a debug dump is safe", () => {
    const store = new Store(schema);
    store.merge("env", { secret: { apiKey: "hunter2" } });
    const dumped = store.toJSON();
    expect(JSON.stringify(dumped)).to.not.contain("hunter2");
    expect((dumped.secret as Record<string, unknown>).apiKey).to.equal("[REDACTED]");
    expect((dumped.redis as Record<string, unknown>).host).to.equal("localhost");
  });

  // A forgotten `sensitive: true` must not be the only thing standing between a vault value and
  // whatever logged toJSON(): everything under the secret. node is a secret by definition.
  it("redacts a key under the secret. node even without an explicit sensitive flag", () => {
    const store = new Store({ secret: { plain: { doc: "P", default: "" } } });
    store.set("vault", "secret.plain", "hunter2");
    expect(JSON.stringify(store.toJSON())).to.not.contain("hunter2");
  });
});
