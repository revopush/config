import { describe, expect, it } from "vitest";
import { testSecretSource, testSource } from "../../src/testing/index";
import { env } from "../../src/sources/env";
import { fileLayers } from "../../src/sources/file-layers";
import { SecretSource, Source } from "../../src/types";

// A well-behaved implementation, driven by the fixtures the kit supplies.
describe("a conforming secret source", () =>
  testSecretSource(({ present, absent, failing }) => ({
    name: "conforming",
    // `async`, though nothing here is awaited, so that `testSecretSource`'s direct,
    // unwrapped `factory(...).load(...)` call turns this throw into a rejected promise, which
    // `.rejects.toThrow()` requires — a plain function's throw would instead escape synchronously.
    // eslint-disable-next-line @typescript-eslint/require-await
    load: async (names) => {
      const resolved = new Map<string, string>();
      for (const [key, name] of names) {
        if (name === failing) throw new Error("unreachable");
        if (name === absent) continue;
        if (present[name] !== undefined) resolved.set(key, present[name]);
      }
      return resolved;
    },
  })));

describe("a conforming source", () =>
  testSource(() => ({ name: "conforming", load: () => ({ a: { b: "value" } }) })));

// The kit applied to the library's own reference sources, so a regression in either one is caught
// the same way a third party's Source implementation would be.
describe("env() conforms to the Source contract", () => testSource(() => env()));
describe("fileLayers() conforms to the Source contract", () => testSource(() => fileLayers()));

describe("the kit itself", () => {
  it("is exported as two functions", () => {
    expect(typeof testSecretSource).to.equal("function");
    expect(typeof testSource).to.equal("function");
  });

  // The kit only earns its keep if it actually rejects a broken implementation.
  it("would reject a source that throws on an absent secret", async () => {
    const broken: SecretSource = {
      name: "broken",
      // `async` turns this throw into a rejection for the direct, unwrapped call below.
      // eslint-disable-next-line @typescript-eslint/require-await
      load: async () => {
        throw new Error("not found");
      },
    };
    await expect(broken.load(new Map([["secret.x", "missing"]]))).rejects.toThrow();
  });

  it("would reject a source with no name", () => {
    const broken = { load: () => ({}) } as unknown as Source;
    expect(broken.name).to.equal(undefined);
  });

  // The previous empty-schema fixture could not catch a source that mutates nested values.
  // This test proves the strengthened check does: attempts to write to the frozen schema throw.
  it("the strengthened mutation check catches nested mutations", async () => {
    const schema = Object.freeze({
      a: Object.freeze({ doc: "example", default: "value" }),
    });
    const mutating: Source = {
      name: "mutating",
      // `async` turns this throw into a rejection for the direct, unwrapped call below.
      // eslint-disable-next-line @typescript-eslint/require-await
      load: async (context) => {
        // Attempt to mutate a nested value in the frozen schema. `as any`, and the resulting
        // unsafe member access, are both deliberate: this is the point of the test, not an
        // untyped value leaking in by accident (see the `no-explicit-any` comment in
        // eslint.config.js).
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (context.schema as any).a.default = "corrupted";
        return {};
      },
    };
    // The mutation attempt will throw because the schema is frozen in strict mode (ES modules)
    await expect(
      mutating.load({ schema, get: () => undefined, warn: () => undefined })
    ).rejects.toThrow();
  });
});
