import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { USAGE, readVersion, runTypes } from "../../src/codegen/cli";

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
    fs.writeFileSync(
      path.join(root, "schema.json"),
      JSON.stringify({ b: { doc: "B", default: "x" } })
    );
    expect(await runTypes(["--dir", root, "--out", out, "--check"], silent)).to.equal(1);
  });

  it("exits non-zero in check mode when the file is missing entirely", async () => {
    const root = scratch();
    expect(
      await runTypes(["--dir", root, "--out", path.join(root, "absent.ts"), "--check"], silent)
    ).to.equal(1);
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

  // The npm bin symlink cannot execute without a shebang. The bin entry point must have it.
  it("bin.ts starts with shebang", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../src/codegen/bin.ts"), "utf8");
    expect(source.startsWith("#!/usr/bin/env node\n")).to.equal(true);
  });

  // bin.ts and cli.ts used to each hard-code their own copy of USAGE; bin.ts must import the one
  // cli.ts exports instead of duplicating it.
  it("bin.ts imports USAGE from cli.ts instead of duplicating it", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../src/codegen/bin.ts"), "utf8");
    expect(source).toContain("USAGE");
    expect(source).not.toContain("const USAGE =");
  });

  describe("readVersion", () => {
    it("reads the version field from a package.json file", () => {
      const root = scratch();
      const pkgPath = path.join(root, "package.json");
      fs.writeFileSync(pkgPath, JSON.stringify({ name: "x", version: "9.9.9" }));
      expect(readVersion(pkgPath)).to.equal("9.9.9");
    });

    it("throws when the package.json has no version field", () => {
      const root = scratch();
      const pkgPath = path.join(root, "package.json");
      fs.writeFileSync(pkgPath, JSON.stringify({ name: "x" }));
      expect(() => readVersion(pkgPath)).toThrow(/version/);
    });
  });

  // The pure module (cli.ts) must have no side effects when imported, so it should not have
  // a shebang or any code that executes at module load time.
  it("cli.ts has no shebang or side-effect guard", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../src/codegen/cli.ts"), "utf8");
    expect(source.startsWith("#!/usr/bin/env node")).to.equal(false);
    expect(source).not.toContain("process.argv[1]");
    expect(source).not.toContain("process.exit");
  });

  it("exits non-zero when --out is given no value", async () => {
    const root = scratch();
    const errors: string[] = [];
    const code = await runTypes(["--dir", root, "--out"], {
      log: () => {},
      error: (m) => errors.push(m),
    });
    expect(code).to.equal(1);
    expect(errors.join(" ")).to.contain("--out");
  });

  it("exits non-zero and names --out when given --check as its value", async () => {
    const root = scratch();
    const errors: string[] = [];
    const code = await runTypes(["--dir", root, "--out", "--check"], {
      log: () => {},
      error: (m) => errors.push(m),
    });
    expect(code).to.equal(1);
    // Verify the error names --out as required (from "Both --dir and --out are required")
    expect(errors.join(" ")).to.contain("Both --dir and --out are required");
  });

  // The previous guard passed when the real file was executed directly and failed through a
  // symlink—which is the only path npm ever uses. This test creates a symlink to the built
  // binary and executes it as npm would, ensuring the CLI actually works in production.
  it("executes correctly through a symlink (as npm installs it)", () => {
    const binPath = path.join(__dirname, "../../dist/codegen/bin.cjs");
    if (!fs.existsSync(binPath)) {
      throw new Error(`Built binary not found at ${binPath}. Run 'npm run build' first.`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-cli-symlink-"));
    try {
      const symlinkPath = path.join(tempDir, "revopush-config");
      fs.symlinkSync(binPath, symlinkPath);

      const schemaDir = path.join(tempDir, "schema");
      fs.mkdirSync(schemaDir);
      fs.writeFileSync(
        path.join(schemaDir, "schema.json"),
        JSON.stringify({ a: { doc: "A", format: "port", default: 3000 } })
      );

      const outputFile = path.join(tempDir, "keys.ts");
      const result = spawnSync(symlinkPath, ["types", "--dir", schemaDir, "--out", outputFile], {
        encoding: "utf8",
      });

      expect(result.status).to.equal(0);
      expect(result.stdout).to.contain("Wrote");
      expect(fs.existsSync(outputFile)).to.equal(true);
      expect(fs.readFileSync(outputFile, "utf8")).to.contain('"a": number;');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Verify --check mode also works through a symlink.
  it("--check mode works correctly through a symlink", () => {
    const binPath = path.join(__dirname, "../../dist/codegen/bin.cjs");
    if (!fs.existsSync(binPath)) {
      throw new Error(`Built binary not found at ${binPath}. Run 'npm run build' first.`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-cli-symlink-check-"));
    try {
      const symlinkPath = path.join(tempDir, "revopush-config");
      fs.symlinkSync(binPath, symlinkPath);

      const schemaDir = path.join(tempDir, "schema");
      fs.mkdirSync(schemaDir);
      fs.writeFileSync(
        path.join(schemaDir, "schema.json"),
        JSON.stringify({ a: { doc: "A", format: "port", default: 3000 } })
      );

      const outputFile = path.join(tempDir, "keys.ts");

      // First, generate the file
      const generateResult = spawnSync(
        symlinkPath,
        ["types", "--dir", schemaDir, "--out", outputFile],
        {
          encoding: "utf8",
        }
      );
      expect(generateResult.status).to.equal(0);
      expect(fs.existsSync(outputFile)).to.equal(true);

      // Then, verify it with --check
      const checkResult = spawnSync(
        symlinkPath,
        ["types", "--dir", schemaDir, "--out", outputFile, "--check"],
        {
          encoding: "utf8",
        }
      );
      expect(checkResult.status).to.equal(0);
      expect(checkResult.stdout).to.contain("up to date");

      // Now corrupt the schema and verify --check fails
      fs.writeFileSync(
        path.join(schemaDir, "schema.json"),
        JSON.stringify({ b: { doc: "B", default: "x" } })
      );
      const staleResult = spawnSync(
        symlinkPath,
        ["types", "--dir", schemaDir, "--out", outputFile, "--check"],
        {
          encoding: "utf8",
        }
      );
      expect(staleResult.status).to.equal(1);
      expect(staleResult.stderr).to.contain("out of date");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Verify importing runTypes has no side effects (no process.exit, no file I/O).
  it("importing runTypes from cli.ts has no side effects", async () => {
    // If there were side effects, they would have happened during the import at the top of this file.
    // This test simply verifies the module loaded without error and we're still running.
    expect(typeof runTypes).to.equal("function");
    // Call it to ensure it's actually callable and works correctly
    const root = scratch();
    const out = path.join(root, "keys.ts");
    const result = await runTypes(["--dir", root, "--out", out], silent);
    expect(result).to.equal(0);
  });

  describe("through a symlink", () => {
    function withSymlink<T>(fn: (symlinkPath: string, tempDir: string) => T): T {
      const binPath = path.join(__dirname, "../../dist/codegen/bin.cjs");
      if (!fs.existsSync(binPath)) {
        throw new Error(`Built binary not found at ${binPath}. Run 'npm run build' first.`);
      }
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-cli-symlink-"));
      try {
        const symlinkPath = path.join(tempDir, "revopush-config");
        fs.symlinkSync(binPath, symlinkPath);
        return fn(symlinkPath, tempDir);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    // --help used to fall into the "unknown command" branch: usage on stderr, exit 1. It must
    // print to stdout and exit 0, like a well-behaved CLI's --help.
    it("--help prints usage to stdout and exits zero", () => {
      withSymlink((symlinkPath) => {
        const result = spawnSync(symlinkPath, ["--help"], { encoding: "utf8" });
        expect(result.status).to.equal(0);
        expect(result.stdout).toContain(USAGE);
        expect(result.stderr).to.equal("");
      });
    });

    it("--version prints the package's actual version and exits zero", () => {
      withSymlink((symlinkPath) => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
        const result = spawnSync(symlinkPath, ["--version"], { encoding: "utf8" });
        expect(result.status).to.equal(0);
        expect(result.stdout.trim()).to.equal(pkg.version);
      });
    });
  });
});
