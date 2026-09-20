import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { createConfig } from "../../src/create-config";
import { env } from "../../src/sources/env";
import { runTypes } from "../../src/codegen/cli";
import { pruneBranch } from "../../src/schema-walk";
import { Schema } from "../../src/types";
import {
  bind,
  type ConfigKeys,
  type PlatformSaasCloudflareSettings,
} from "../fixtures/accessors/generated";

const DIR = path.join(__dirname, "..", "fixtures", "accessors");
const schema = JSON.parse(fs.readFileSync(path.join(DIR, "schema.json"), "utf8")) as Schema;

const configFor = async (values: Record<string, string>, platform?: string) => {
  const config = createConfig<ConfigKeys>({
    schema: platform ? pruneBranch(schema, "platform", platform) : schema,
    sources: [env({ from: values })],
  });
  await config.init();
  return config;
};

// The tests below run the committed fixture, so it has to be what the generator produces today.
// Asking the CLI keeps that honest and covers --import at the same time.
describe("the committed fixture", () => {
  it("is what the generator writes today", async () => {
    const silent = { log: () => undefined, error: () => undefined };

    const code = await runTypes(
      [
        "--dir",
        DIR,
        "--out",
        path.join(DIR, "generated.ts"),
        "--check",
        "--import",
        "../../../src/index",
      ],
      silent
    );

    expect(code).to.equal(0);
  });
});

describe("bound accessors", () => {
  it("reads a value through the path, with no string at the call site", async () => {
    const { redis, platform } = bind(
      await configFor({ REDIS_HOST: "cache", CLOUDFLARE_URI: "https://r2" })
    );

    expect(redis.host).to.equal("cache");
    expect(platform.saas.cloudflare.uri).to.equal("https://r2");
  });

  it("keeps the schema's value types, not strings", async () => {
    const { redis } = bind(await configFor({ REDIS_PORT: "6380" }));

    expect(redis.port).to.equal(6380);
    expect(typeof redis.port).to.equal("number");
  });

  // A getter, not a value: bind() runs at import, long before init() has resolved anything.
  it("reads when touched rather than when bound", async () => {
    const config = createConfig<ConfigKeys>({
      schema,
      sources: [env({ from: { REDIS_HOST: "late" } })],
    });
    const { redis } = bind(config);

    expect(() => redis.host).to.throw();
    await config.init();
    expect(redis.host).to.equal("late");
  });

  it("passes a whole group to a function that names its type", async () => {
    const { platform } = bind(await configFor({ CLOUDFLARE_URI: "https://r2" }));
    const endpoint = (cloudflare: PlatformSaasCloudflareSettings) => cloudflare.uri;

    expect(endpoint(platform.saas.cloudflare)).to.equal("https://r2");
  });

  it("throws for another platform's key once the branch is pruned", async () => {
    const { platform } = bind(await configFor({}, "azure"));

    expect(() => platform.saas.cloudflare.uri).to.throw(/platform\.saas\.cloudflare\.uri/);
    expect(platform.azure.tables.daily).to.equal("AcquisitionDaily");
  });
});
