import * as os from "node:os";
import { expect, it } from "vitest";
import { SecretSource, Source, SourceContext } from "../types";

/**
 * Fixtures a SecretSource implementation is tested against, describing names it must handle.
 */
export interface SecretFixtures {
  /** Names the source must resolve, mapped to the value it must return. */
  present: Record<string, string>;
  /** A name the source must treat as absent rather than throwing. */
  absent: string;
  /** A name whose lookup must reject, standing in for an unreachable store. */
  failing: string;
}

const FIXTURES: SecretFixtures = {
  present: { "conformance-present": "value" },
  absent: "conformance-absent",
  failing: "conformance-failing",
};

/**
 * Verifies a `SecretSource` against the contract, so third-party providers cannot each invent
 * their own semantics. Call inside a `describe`.
 */
export function testSecretSource(factory: (fixtures: SecretFixtures) => SecretSource): void {
  it("has a name", () => {
    expect(factory(FIXTURES).name).to.be.a("string").and.not.equal("");
  });

  it("returns a value keyed by config key, not by secret name", async () => {
    const resolved = await factory(FIXTURES).load(new Map([["secret.thing", "conformance-present"]]));
    expect(resolved.get("secret.thing")).to.equal("value");
  });

  it("omits a secret it does not hold rather than throwing", async () => {
    const resolved = await factory(FIXTURES).load(new Map([["secret.thing", FIXTURES.absent]]));
    expect(resolved.has("secret.thing")).to.equal(false);
  });

  it("rejects when the store cannot be read, so an outage stops startup", async () => {
    await expect(factory(FIXTURES).load(new Map([["secret.thing", FIXTURES.failing]]))).rejects.toThrow();
  });

  it("returns an empty map for an empty request without consulting the store", async () => {
    expect((await factory(FIXTURES).load(new Map())).size).to.equal(0);
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/**
 * Verifies a `Source` against the contract. Call inside a `describe`.
 */
export function testSource(factory: () => Source): void {
  const context: SourceContext = {
    schema: deepFreeze({
      a: { doc: "example", format: "string", default: "value", env: "EXAMPLE" },
      b: { doc: "another", format: "number", default: 42 },
    }),
    // A real, usable directory: file-based sources such as fileLayers() require `dir` and would
    // otherwise fail the whole kit before their own logic runs. No file in it is expected to
    // match, so a directory-based source that finds nothing here must fall through gracefully.
    dir: os.tmpdir(),
    get: () => undefined,
    warn: () => {},
  };

  it("has a name", () => {
    expect(factory().name).to.be.a("string").and.not.equal("");
  });

  it("returns a plain object", async () => {
    const values = await factory().load(context);
    expect(values).to.be.an("object");
    expect(Array.isArray(values)).to.equal(false);
  });

  it("does not mutate the context by attempting writes to the frozen schema", async () => {
    const source = factory();
    await source.load(context);
    expect(context.schema).to.deep.equal({
      a: { doc: "example", format: "string", default: "value", env: "EXAMPLE" },
      b: { doc: "another", format: "number", default: 42 },
    });
  });
}
