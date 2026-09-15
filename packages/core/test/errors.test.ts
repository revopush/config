import { describe, expect, it } from "vitest";
import {
  ConfigError,
  ConfigNotInitializedError,
  ConfigValidationError,
  MissingSecretsError,
  SourceError,
} from "../src/errors";

describe("errors", () => {
  it("all extend ConfigError so a consumer can catch the family", () => {
    const all = [
      new ConfigNotInitializedError("a.b"),
      new ConfigValidationError(["a.b"], "a.b: must be an integer"),
      new MissingSecretsError(new Map([["secret.x", "file:staging.json"]])),
      new SourceError("env", new Error("boom")),
    ];
    for (const error of all) expect(error).toBeInstanceOf(ConfigError);
  });

  it("names the key that was read too early", () => {
    const error = new ConfigNotInitializedError("redis.port");
    expect(error.key).to.equal("redis.port");
    expect(error.message).to.contain("redis.port");
  });

  it("carries every rejected key, not just the first", () => {
    const error = new ConfigValidationError(["a.b", "c.d"], "detail");
    expect(error.keys).to.deep.equal(["a.b", "c.d"]);
  });

  it("carries which source declared each missing secret", () => {
    const error = new MissingSecretsError(new Map([["secret.x", "file:staging.json"]]));
    expect(error.keys).to.deep.equal(["secret.x"]);
    expect(error.declaredBy.get("secret.x")).to.equal("file:staging.json");
  });

  it("names the failing plugin and preserves its cause", () => {
    const cause = new Error("unreachable");
    const error = new SourceError("azure-key-vault", cause);
    expect(error.source).to.equal("azure-key-vault");
    expect(error.cause).to.equal(cause);
    expect(error.message).to.contain("azure-key-vault");
  });
});
