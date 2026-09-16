import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigError } from "../../src/errors";
import { fileLayers } from "../../src/sources/file-layers";
import { Schema, SourceContext } from "../../src/types";

const DIR = path.join(__dirname, "..", "fixtures", "layers");
const schema: Schema = { redis: { host: { doc: "H", default: "localhost" } } };

function context(
  dir: string | undefined,
  warn: (message: string) => void = () => undefined
): SourceContext {
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
    const values = await fileLayers({ environment: "production", region: "apac" }).load(
      context(DIR)
    );
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  it("returns nothing and warns when the environment matches no file", async () => {
    const warnings: string[] = [];
    const values = await fileLayers({ environment: "nope" }).load(
      context(DIR, (m) => warnings.push(m))
    );
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
    const values = await fileLayers({ dir: DIR, environment: "production" }).load(
      context(undefined)
    );
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  it("fails clearly when no directory is available at all", () => {
    expect(() => fileLayers({ environment: "production" }).load(context(undefined))).toThrow(
      ConfigError
    );
  });

  it("replaces an existing array with an incoming object", async () => {
    const values = await fileLayers({ environment: "arraytest", region: "object" }).load(
      context(DIR)
    );
    const origins = values.origins;
    expect(origins).to.deep.equal({ custom: "object" });
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- chai's `.false` getter has a side effect, not a no-op.
    expect(Array.isArray(origins)).to.be.false;
  });

  it("replaces an existing object with an incoming array", async () => {
    const values = await fileLayers({ environment: "objecttest", region: "array" }).load(
      context(DIR)
    );
    const config = values.config;
    expect(config).to.deep.equal(["replaced", "with", "array"]);
  });

  it("replaces array wholesale rather than merging element-wise", async () => {
    // A list-valued setting merged element-wise is a silent data corruption,
    // so we verify that arrays replace completely: ["a","b","c"] overridden by ["x"] yields ["x"].
    const values = await fileLayers({ environment: "arrayreplace", region: "short" }).load(
      context(DIR)
    );
    const items = values.items;
    expect(items).to.deep.equal(["x"]);
  });

  it("names the file that failed to parse", async () => {
    try {
      await fileLayers({ environment: "broken" }).load(context(DIR));
      expect.fail("load() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).to.contain(path.join(DIR, "broken.json"));
    }
  });

  it("names the specific file among two candidates that failed to parse", async () => {
    // production.json is valid; production.brokenregion.json is not, so the error must identify
    // the region file, not the environment file, and not stay silent about which one it was.
    try {
      await fileLayers({ environment: "production", region: "brokenregion" }).load(context(DIR));
      expect.fail("load() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).to.contain(path.join(DIR, "production.brokenregion.json"));
      expect(message).to.not.contain(path.join(DIR, "production.json") + ":");
    }
  });

  it("throws ConfigError naming the environment and directory when required and no file matched", async () => {
    try {
      await fileLayers({ environment: "nope", required: true }).load(context(DIR));
      expect.fail("load() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).to.contain("nope");
      expect(message).to.contain(DIR);
    }
  });

  it("does not throw when required and a file matched", async () => {
    const values = await fileLayers({ environment: "production", required: true }).load(
      context(DIR)
    );
    expect((values.redis as Record<string, unknown>).host).to.equal("prod-redis");
  });

  // `JSON.parse` produces an *own* `__proto__` key, and assigning it runs the prototype setter, so
  // a naive recursive merge walks into Object.prototype and poisons every object in the process.
  it("does not let a layer file write through the prototype chain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layers-proto-"));
    try {
      fs.writeFileSync(
        path.join(dir, "dev.json"),
        '{"__proto__": {"polluted": "yes"}, "constructor": {"also": "no"}, "redis": {"host": "h"}}'
      );
      const values = await fileLayers({ dir }).load(context(dir));
      expect(({} as Record<string, unknown>).polluted).to.equal(undefined);
      expect(Object.prototype.hasOwnProperty.call(values, "__proto__")).to.equal(false);
      // The legitimate keys in the same file are still merged.
      expect((values.redis as Record<string, unknown>).host).to.equal("h");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      delete (Object.prototype as Record<string, unknown>).polluted;
    }
  });
});
