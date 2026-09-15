import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTypes } from "../../src/codegen/cli";

let dir: string;

function scratch(): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-cli-"));
  fs.writeFileSync(
    path.join(dir, "schema.json"),
    JSON.stringify({ a: { doc: "A", format: "port", default: 3000 } })
  );
  return dir;
}

const silent = { log: () => {}, error: () => {} };

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("revopush-config types", () => {
  it("writes the generated file and exits zero", async () => {
    const root = scratch();
    const out = path.join(root, "keys.ts");
    expect(await runTypes(["--dir", root, "--out", out], silent)).to.equal(0);
    expect(fs.readFileSync(out, "utf8")).to.contain(`"a": number;`);
  });

  it("exits zero in check mode when the file is current", async () => {
    const root = scratch();
    const out = path.join(root, "keys.ts");
    await runTypes(["--dir", root, "--out", out], silent);
    expect(await runTypes(["--dir", root, "--out", out, "--check"], silent)).to.equal(0);
  });

  // Without this in CI the generated file drifts and the types start lying, which is worse
  // than having no types at all.
  it("exits non-zero in check mode when the file is stale", async () => {
    const root = scratch();
    const out = path.join(root, "keys.ts");
    await runTypes(["--dir", root, "--out", out], silent);
    fs.writeFileSync(path.join(root, "schema.json"), JSON.stringify({ b: { doc: "B", default: "x" } }));
    expect(await runTypes(["--dir", root, "--out", out, "--check"], silent)).to.equal(1);
  });

  it("exits non-zero in check mode when the file is missing entirely", async () => {
    const root = scratch();
    expect(await runTypes(["--dir", root, "--out", path.join(root, "absent.ts"), "--check"], silent)).to.equal(1);
  });

  it("does not write anything in check mode", async () => {
    const root = scratch();
    const out = path.join(root, "keys.ts");
    await runTypes(["--dir", root, "--out", out, "--check"], silent);
    expect(fs.existsSync(out)).to.equal(false);
  });

  it("exits non-zero and explains when --dir is missing", async () => {
    const errors: string[] = [];
    const code = await runTypes(["--out", "x.ts"], { log: () => {}, error: (m) => errors.push(m) });
    expect(code).to.equal(1);
    expect(errors.join(" ")).to.contain("--dir");
  });

  it("exits non-zero when the directory has no schema.json", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-cli-empty-"));
    dir = root;
    expect(await runTypes(["--dir", root, "--out", path.join(root, "k.ts")], silent)).to.equal(1);
  });

  it("honours --interface", async () => {
    const root = scratch();
    const out = path.join(root, "keys.ts");
    await runTypes(["--dir", root, "--out", out, "--interface", "Keys"], silent);
    expect(fs.readFileSync(out, "utf8")).to.contain("export interface Keys {");
  });

  // The npm bin symlink cannot execute without a shebang.
  it("source file starts with shebang", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../src/codegen/cli.ts"), "utf8");
    expect(source.startsWith("#!/usr/bin/env node\n")).to.equal(true);
  });

  it("exits non-zero when --out is given no value", async () => {
    const root = scratch();
    const errors: string[] = [];
    const code = await runTypes(["--dir", root, "--out"], { log: () => {}, error: (m) => errors.push(m) });
    expect(code).to.equal(1);
    expect(errors.join(" ")).to.contain("--out");
  });

  it("exits non-zero and names --out when given --check as its value", async () => {
    const root = scratch();
    const errors: string[] = [];
    const code = await runTypes(["--dir", root, "--out", "--check"], { log: () => {}, error: (m) => errors.push(m) });
    expect(code).to.equal(1);
    // Verify the error names --out as required (from "Both --dir and --out are required")
    expect(errors.join(" ")).to.contain("Both --dir and --out are required");
  });
});
