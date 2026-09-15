import { describe, expect, it } from "vitest";
import { emitTypes } from "../../src/codegen/emit";

function line(schema: Record<string, unknown>, key: string): string {
  const match = emitTypes(schema)
    .split("\n")
    .find((text) => text.trim().startsWith(`${JSON.stringify(key)}:`));
  if (!match) throw new Error(`no line emitted for ${key}`);
  return match.trim();
}

describe("emitTypes", () => {
  it("emits a union for an enum format", () => {
    const schema = { env: { name: { doc: "E", format: ["dev", "prod"], default: "dev" } } };
    expect(line(schema, "env.name")).to.equal(`"env.name": "dev" | "prod";`);
  });

  it("emits boolean for the strict-boolean format and for a boolean default", () => {
    expect(line({ a: { doc: "A", format: "strict-boolean", default: false } }, "a")).to.equal(`"a": boolean;`);
    expect(line({ b: { doc: "B", default: true } }, "b")).to.equal(`"b": boolean;`);
  });

  it("emits number for numeric formats and for a number default", () => {
    for (const format of ["port", "int", "nat", "duration"]) {
      expect(line({ a: { doc: "A", format, default: 1 } }, "a"), format).to.equal(`"a": number;`);
    }
    expect(line({ b: { doc: "B", default: 5 } }, "b")).to.equal(`"b": number;`);
  });

  it("emits string for anything else", () => {
    expect(line({ a: { doc: "A", default: "" } }, "a")).to.equal(`"a": string;`);
  });

  it("appends null for a nullable key or a null default", () => {
    expect(line({ a: { doc: "A", format: "port", default: null, nullable: true } }, "a")).to.equal(
      `"a": number | null;`
    );
  });

  it("lets tsType override everything, which is the escape hatch for a custom format", () => {
    expect(line({ a: { doc: "A", format: "my-format", default: "", tsType: "0 | 1" } }, "a")).to.equal(`"a": 0 | 1;`);
  });

  it("carries the doc across as a comment", () => {
    expect(emitTypes({ a: { doc: "How many", default: 1 } })).to.contain("/** How many */");
  });

  it("emits a complete module with a do-not-edit banner", () => {
    const output = emitTypes({ a: { doc: "A", default: "" } });
    expect(output).to.contain("Do not edit");
    expect(output).to.contain("export interface ConfigKeys {");
    expect(output.endsWith("}\n")).to.equal(true);
  });

  it("accepts a custom interface name", () => {
    expect(emitTypes({ a: { doc: "A", default: "" } }, { interfaceName: "Keys" })).to.contain("export interface Keys {");
  });

  it("emits an empty interface for an empty schema", () => {
    expect(emitTypes({})).to.contain("export interface ConfigKeys {}");
  });
});
