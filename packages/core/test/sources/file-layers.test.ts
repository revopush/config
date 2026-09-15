import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { ConfigError } from "../../src/errors";
import { fileLayers } from "../../src/sources/file-layers";
import { Schema, SourceContext } from "../../src/types";

const DIR = path.join(__dirname, "..", "fixtures", "layers");
const schema: Schema = { redis: { host: { doc: "H", default: "localhost" } } };

function context(dir: string | undefined, warn: (message: string) => void = () => {}): SourceContext {
  return { schema, dir, get: () => undefined, warn };
}

describe("fileLayers source", () => {
  it("reads the environment file", async () => {
    const values = await fileLayers({ environment: "production" }).load(context(DIR));
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  it("lets the region file beat the environment file", async () => {
    const values = await fileLayers({ environment: "production", region: "eu" }).load(context(DIR));
    expect((values.redis as Record<string, unknown>).host).to.equal("eu-redis");
    // Not overridden by the region file, so the environment file still wins.
    expect((values.redis as Record<string, unknown>).port).to.equal(6380);
  });

  it("skips a region file that does not exist", async () => {
    const values = await fileLayers({ environment: "production", region: "apac" }).load(context(DIR));
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  it("returns nothing and warns when the environment matches no file", async () => {
    const warnings: string[] = [];
    const values = await fileLayers({ environment: "nope" }).load(context(DIR, (m) => warnings.push(m)));
    expect(values).to.deep.equal({});
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.contain("nope");
  });

  it("defaults to the dev environment", () => {
    expect(fileLayers().name).to.equal("files");
  });

  it("accepts a custom naming function", async () => {
    const names = (environment: string) => [`${environment}.eu.json`];
    const values = await fileLayers({ environment: "production", names }).load(context(DIR));
    expect((values.redis as Record<string, unknown>).host).to.equal("eu-redis");
  });

  it("prefers its own dir over the context dir", async () => {
    const values = await fileLayers({ dir: DIR, environment: "production" }).load(context(undefined));
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  it("fails clearly when no directory is available at all", async () => {
    await expect(fileLayers({ environment: "production" }).load(context(undefined))).rejects.toThrow(ConfigError);
  });
});
