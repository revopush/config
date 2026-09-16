import { describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import {
  ConfigError,
  ConfigNotInitializedError,
  MissingSecretsError,
  SourceError,
  createConfig,
  env,
  fileLayers,
} from "../src/index";
import { SecretSource, Source } from "../src/types";

const DIR = path.join(__dirname, "fixtures", "app");

function build(overrides: Partial<Parameters<typeof createConfig>[0]> = {}) {
  return createConfig({
    schemaDir: DIR,
    sources: [fileLayers({ environment: "staging" }), env({ from: {} })],
    ...overrides,
  });
}

function stubSecrets(values: Record<string, string>, requested: string[] = []): SecretSource {
  return {
    name: "stub-vault",
    load: async (names) => {
      const resolved = new Map<string, string>();
      for (const [key, name] of names) {
        requested.push(name);
        if (values[name] !== undefined) resolved.set(key, values[name]!);
      }
      return resolved;
    },
  };
}

describe("createConfig", () => {
  it("rejects being given neither schemaDir nor schema", () => {
    expect(() => createConfig({})).toThrow(ConfigError);
  });

  it("rejects being given both", () => {
    expect(() => createConfig({ schemaDir: DIR, schema: {} })).toThrow(ConfigError);
  });

  it("throws a named error when read before init", () => {
    const config = build();
    expect(() => config.get("redis.host")).toThrow(ConfigNotInitializedError);
    expect(() => config.get("redis.host")).toThrow(/redis\.host/);
  });

  // The message used to name the key as "toJSON", which reads like a config key rather than the
  // method that was called.
  it("throws without implying a key name when toJSON() is read before init", () => {
    const config = build();
    expect(() => config.toJSON()).toThrow(ConfigNotInitializedError);
    try {
      config.toJSON();
      expect.fail("toJSON() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigNotInitializedError);
      expect((error as ConfigNotInitializedError).key).to.equal(undefined);
      expect((error as ConfigNotInitializedError).message).to.not.contain("toJSON");
    }
  });

  it("layers the file over the schema default", async () => {
    const config = build({ secretSource: stubSecrets({ "api-key": "k" }) });
    await config.init();
    expect(config.get("redis.host")).to.equal("staging-redis");
    expect(config.get("redis.port")).to.equal(6379);
  });

  it("disagrees on purpose about an unknown key: has() is false, get() and explain() throw ConfigError", async () => {
    const config = build({ secretSource: stubSecrets({ "api-key": "k" }) });
    await config.init();

    expect(config.has("typo" as any)).to.equal(false);

    expect(() => config.get("typo" as any)).toThrow(ConfigError);
    expect(() => config.get("typo" as any)).not.toThrow(/cannot find configuration param/);

    expect(() => config.explain("typo" as any)).toThrow(ConfigError);
    expect(() => config.explain("typo" as any)).not.toThrow(/cannot find configuration param/);
  });

  it("lets an environment variable beat the file", async () => {
    const config = build({
      sources: [
        fileLayers({ environment: "staging" }),
        env({ from: { APPTEST_REDIS_HOST: "env-redis" } }),
      ],
      secretSource: stubSecrets({ "api-key": "k" }),
    });
    await config.init();
    expect(config.get("redis.host")).to.equal("env-redis");
  });

  it("lets a secret source beat a stale environment variable", async () => {
    const config = build({
      sources: [
        fileLayers({ environment: "staging" }),
        env({ from: { APPTEST_API_KEY: "from-env" } }),
      ],
      secretSource: stubSecrets({ "api-key": "from-vault" }),
    });
    await config.init();
    expect(config.get("secret.apiKey")).to.equal("from-vault");
  });

  it("falls back to the environment variable for a secret the source does not hold", async () => {
    const config = build({
      sources: [
        fileLayers({ environment: "staging" }),
        env({ from: { APPTEST_API_KEY: "from-env" } }),
      ],
      secretSource: stubSecrets({}),
    });
    await config.init();
    expect(config.get("secret.apiKey")).to.equal("from-env");
  });

  it("requests only the secrets a layer file declared", async () => {
    const requested: string[] = [];
    const config = build({ secretSource: stubSecrets({ "api-key": "k" }, requested) });
    await config.init();
    expect(requested).to.deep.equal(["api-key"]);
  });

  it("fails init naming every secret that resolved nowhere", async () => {
    const config = build({ secretSource: stubSecrets({}) });
    await expect(config.init()).rejects.toThrow(MissingSecretsError);
    await config.init().catch((error: MissingSecretsError) => {
      expect(error.keys).to.deep.equal(["secret.apiKey"]);
      expect(error.declaredBy.get("secret.apiKey")).to.equal("files");
    });
  });

  it("never consults the source when no layer file declares a secret", async () => {
    const config = createConfig({
      schemaDir: DIR,
      sources: [env({ from: { APPTEST_REDIS_HOST: "h" } })],
      secretSource: {
        name: "explosive",
        load: () => {
          throw new Error("should not be consulted");
        },
      },
    });
    await config.init();
    expect(config.get("redis.host")).to.equal("h");
  });

  it("wraps a throwing source in SourceError naming the plugin", async () => {
    const broken: Source = {
      name: "broken",
      load: () => {
        throw new Error("disk on fire");
      },
    };
    const config = build({ sources: [broken] });
    await expect(config.init()).rejects.toThrow(SourceError);
    await config.init().catch((error: SourceError) => {
      expect(error.source).to.equal("broken");
      expect((error.cause as Error).message).to.equal("disk on fire");
    });
  });

  // Source.name is documented as unique within one config; without this check, explain()'s
  // layers and declaredSecrets()' attribution become ambiguous about which of the two same-named
  // sources actually won.
  it("rejects two sources that share a name", async () => {
    const first: Source = { name: "dup", load: () => ({}) };
    const second: Source = { name: "dup", load: () => ({}) };
    const config = build({ sources: [first, second] });
    await expect(config.init()).rejects.toThrow(ConfigError);
    await config.init().catch((error: ConfigError) => {
      expect(error.message).to.contain("dup");
    });
  });

  it("routes a source warning to onWarning instead of the console", async () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = createConfig({
      schemaDir: DIR,
      sources: [fileLayers({ environment: "no-such-env" })],
      onWarning: (message) => warnings.push(message),
    });
    await config.init();
    expect(warnings).to.have.length(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shares one load between concurrent init() calls", async () => {
    let loads = 0;
    const counting: Source = {
      name: "counting",
      load: async () => {
        loads++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {};
      },
    };
    const config = createConfig({ schemaDir: DIR, sources: [counting] });
    await Promise.all([config.init(), config.init(), config.init()]);
    expect(loads).to.equal(1);
  });

  it("re-reads on a later init, which is what lets a test change a variable", async () => {
    // Same config object, initialised twice: this is what pins the init-promise reset in
    // createConfig() (`pending` must be cleared after each load so a second init() re-runs
    // the pipeline instead of replaying the first result).
    const from: Record<string, string | undefined> = { APPTEST_REDIS_HOST: "first" };
    const config = build({ sources: [env({ from })] });

    await config.init();
    expect(config.get("redis.host")).to.equal("first");

    from.APPTEST_REDIS_HOST = "second";
    await config.init();
    expect(config.get("redis.host")).to.equal("second");
  });

  it("re-runs the pipeline after a rejected init(), not a cached rejection", async () => {
    // Pins that `pending` is cleared on rejection as well as on success: `load().finally(...)`
    // must reset `pending` even when `load()` throws, so a second init() genuinely retries
    // instead of replaying the same rejected promise forever. A source whose behaviour changes
    // between calls (fails, then succeeds) is what distinguishes this from a broken
    // implementation that returns the same rejection every time.
    let attempt = 0;
    const flaky: Source = {
      name: "flaky",
      load: () => {
        attempt++;
        if (attempt === 1) throw new Error("first attempt fails");
        return { redis: { host: "recovered" } };
      },
    };
    const config = build({ sources: [flaky] });

    await expect(config.init()).rejects.toThrow(SourceError);
    await config.init();
    expect(config.get("redis.host")).to.equal("recovered");
  });

  it("keeps a previously-successful config intact after a later init() fails", async () => {
    // A failed reload must not replace a working configuration: `store` is only reassigned after
    // validate() and the missing-secrets check pass, so a prior successful store must survive a
    // second init() that fails.
    const from: Record<string, string | undefined> = { APPTEST_API_KEY: "first-key" };
    const config = build({
      sources: [fileLayers({ environment: "staging" }), env({ from })],
    });

    await config.init();
    expect(config.get("secret.apiKey")).to.equal("first-key");

    delete from.APPTEST_API_KEY;
    await expect(config.init()).rejects.toThrow(MissingSecretsError);

    expect(config.get("secret.apiKey")).to.equal("first-key");
    expect(() => config.get("redis.host")).not.toThrow(ConfigNotInitializedError);
  });

  it("explains where a value came from", async () => {
    const config = build({
      sources: [
        fileLayers({ environment: "staging" }),
        env({ from: { APPTEST_REDIS_HOST: "env-redis" } }),
      ],
      secretSource: stubSecrets({ "api-key": "k" }),
    });
    await config.init();

    const provenance = config.explain("redis.host");
    expect(provenance.winner).to.equal("env");
    expect(provenance.layers.map((layer) => layer.source)).to.deep.equal([
      "default",
      "files",
      "env",
    ]);
  });

  it("redacts sensitive keys in toJSON", async () => {
    const config = build({ secretSource: stubSecrets({ "api-key": "hunter2" }) });
    await config.init();
    expect(JSON.stringify(config.toJSON())).to.not.contain("hunter2");
  });

  it("accepts an inline schema instead of a directory", async () => {
    const config = createConfig({
      schema: { a: { doc: "A", default: "x", env: "APPTEST_A" } },
      sources: [env({ from: { APPTEST_A: "y" } })],
    });
    await config.init();
    expect(config.get("a")).to.equal("y");
  });

  it("defaults to fileLayers and env when no sources are given", async () => {
    const config = createConfig({ schemaDir: DIR, secretSource: stubSecrets({ "api-key": "k" }) });
    await config.init();
    // The default environment is "dev", which has no layer file here, so defaults apply.
    expect(config.get("redis.host")).to.equal("localhost");
  });
});
