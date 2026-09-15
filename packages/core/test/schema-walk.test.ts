import { describe, expect, it } from "vitest";
import { getPath, leaves, setPath } from "../src/schema-walk";

const schema = {
  api: {
    port: { doc: "HTTP port", format: "port", default: 3000, env: "PORT" },
    nested: { deep: { doc: "Deep", default: "x" } },
  },
  flag: { doc: "Flag", default: false },
};

describe("leaves", () => {
  it("treats any node carrying `default` as a leaf and returns dotted paths", () => {
    expect(leaves(schema).map((l) => l.path)).to.deep.equal(["api.port", "api.nested.deep", "flag"]);
  });

  it("returns the entry beside each path", () => {
    expect(leaves(schema)[0]!.entry.env).to.equal("PORT");
  });

  it("returns nothing for an empty schema", () => {
    expect(leaves({})).to.deep.equal([]);
  });
});

describe("getPath and setPath", () => {
  it("reads a nested path", () => {
    expect(getPath({ a: { b: 1 } }, "a.b")).to.equal(1);
  });

  it("returns undefined for a path that is absent", () => {
    expect(getPath({ a: {} }, "a.b")).to.equal(undefined);
    expect(getPath({}, "a.b.c")).to.equal(undefined);
  });

  // A schema value may legitimately be null; absent and null must stay distinguishable.
  it("distinguishes a null value from an absent one", () => {
    expect(getPath({ a: { b: null } }, "a.b")).to.equal(null);
  });

  it("creates intermediate objects when writing", () => {
    const target = {};
    setPath(target, "a.b.c", 7);
    expect(target).to.deep.equal({ a: { b: { c: 7 } } });
  });

  // Layer merging relies on this: an intermediate primitive from an earlier layer is silently
  // replaced by an object rather than causing a write failure.
  it("silently overwrites a non-object intermediate segment", () => {
    const target: Record<string, unknown> = { a: 1 };
    setPath(target, "a.b", 2);
    expect(target).to.deep.equal({ a: { b: 2 } });
  });
});
