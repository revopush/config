import { describe, expect, it } from "vitest";
import { getPath, leaves, nodes, pruneBranch, setPath } from "../src/schema-walk";
import { ConfigError } from "../src/errors";

const schema = {
  api: {
    port: { doc: "HTTP port", format: "port", default: 3000, env: "PORT" },
    nested: { deep: { doc: "Deep", default: "x" } },
  },
  flag: { doc: "Flag", default: false },
};

describe("leaves", () => {
  it("treats any node carrying `default` as a leaf and returns dotted paths", () => {
    expect(leaves(schema).map((l) => l.path)).to.deep.equal([
      "api.port",
      "api.nested.deep",
      "flag",
    ]);
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

const branched = {
  redis: { host: { doc: "Host", default: "" } },
  platform: {
    saas: { cloudflare: { uri: { doc: "R2", default: "" } } },
    azure: { tables: { name: { doc: "Table", default: "t" } } },
  },
};

describe("nodes", () => {
  it("returns every node that is not a leaf, outermost first", () => {
    expect(nodes(branched).map((n) => n.path)).to.deep.equal([
      "redis",
      "platform",
      "platform.saas",
      "platform.saas.cloudflare",
      "platform.azure",
      "platform.azure.tables",
    ]);
  });

  it("does not descend into a leaf that happens to hold objects", () => {
    expect(nodes({ key: { default: { nested: {} }, doc: "d" } })).to.deep.equal([]);
  });
});

describe("pruneBranch", () => {
  it("keeps the selected child and drops its siblings", () => {
    const pruned = pruneBranch(branched, "platform", "saas");

    expect(Object.keys(pruned.platform as object)).to.deep.equal(["saas"]);
    expect(leaves(pruned).map((l) => l.path)).to.deep.equal([
      "redis.host",
      "platform.saas.cloudflare.uri",
    ]);
  });

  it("leaves the rest of the schema untouched and does not mutate the input", () => {
    const pruned = pruneBranch(branched, "platform", "azure");

    expect(pruned.redis).to.equal(branched.redis);
    expect(Object.keys(branched.platform as object)).to.deep.equal(["saas", "azure"]);
  });

  it("names what is declared when the selection is not one of them", () => {
    expect(() => pruneBranch(branched, "platform", "gcp")).to.throw(ConfigError, /Declared: saas, azure/);
  });

  it("refuses a branch key the schema does not have", () => {
    expect(() => pruneBranch(branched, "cloud", "saas")).to.throw(ConfigError, /no "cloud" node/);
  });
});
