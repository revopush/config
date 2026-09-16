import { describe, expect, it } from "vitest";
import { env } from "../../src/sources/env";
import { Schema, SourceContext } from "../../src/types";

const schema: Schema = {
  redis: {
    host: { doc: "Host", default: "localhost", env: "REDIS_HOST" },
    port: { doc: "Port", format: "port", default: 6379, env: "REDIS_PORT" },
  },
  derived: { doc: "No env binding", default: "x" },
};

function context(overrides: Partial<SourceContext> = {}): SourceContext {
  return { schema, get: () => undefined, warn: () => undefined, ...overrides };
}

describe("env source", () => {
  it("reads the variable each schema key binds", async () => {
    const values = await env({ from: { REDIS_HOST: "h", REDIS_PORT: "6380" } }).load(context());
    expect(values).to.deep.equal({ redis: { host: "h", port: "6380" } });
  });

  it("ignores keys with no env binding", async () => {
    const values = await env({ from: { REDIS_HOST: "h" } }).load(context());
    expect(values).to.deep.equal({ redis: { host: "h" } });
  });

  // A blank App Service setting is routine; before this module every key read
  // `process.env.X || <default>`, and an empty value must keep meaning exactly that.
  it("treats an empty variable as unset", async () => {
    const values = await env({ from: { REDIS_HOST: "", REDIS_PORT: "6380" } }).load(context());
    expect(values).to.deep.equal({ redis: { port: "6380" } });
  });

  it("returns nothing when no bound variable is set", async () => {
    expect(await env({ from: {} }).load(context())).to.deep.equal({});
  });

  it("is named env by default and can be renamed", () => {
    expect(env().name).to.equal("env");
    expect(env({ name: "container-env" }).name).to.equal("container-env");
  });

  it("reads process.env when given no explicit environment", async () => {
    process.env.REDIS_HOST = "from-process";
    try {
      const values = await env().load(context());
      expect((values.redis as Record<string, unknown>).host).to.equal("from-process");
    } finally {
      delete process.env.REDIS_HOST;
    }
  });
});
