import { describe, expect, it, vi } from "vitest";
import convict from "convict";
import { registerFormats, STRICT_BOOLEAN } from "../src/formats";

registerFormats();

function resolve(raw: string): boolean {
  const store = convict({ flag: { doc: "Flag", format: STRICT_BOOLEAN, default: false } });
  store.load({ flag: raw });
  store.validate({ allowed: "strict" });
  return store.get("flag");
}

describe("strict-boolean", () => {
  it("reads every affirmative spelling as true", () => {
    for (const raw of ["true", "TRUE", "1", "yes", "on", " On "])
      expect(resolve(raw), raw).to.equal(true);
  });

  // convict's own boolean format reads every spelling but "false" as true, which would have turned
  // ENABLE_ACCOUNT_REGISTRATION=0 into *enabled*.
  it("reads every negative spelling as false", () => {
    for (const raw of ["false", "FALSE", "0", "no", "off", " OFF "])
      expect(resolve(raw), raw).to.equal(false);
  });

  it("rejects a spelling it cannot read rather than guessing", () => {
    expect(() => resolve("maybe")).toThrow(/must be one of/);
  });

  it("is idempotent: re-registering does not call convict.addFormat again", () => {
    // The module-level registerFormats() above already ran, so the guard should make every
    // further call a no-op. If the `registered` guard were removed, each call below would
    // re-invoke convict.addFormat and this spy would observe it.
    const addFormat = vi.spyOn(convict, "addFormat");
    expect(() => {
      registerFormats();
      registerFormats();
    }).to.not.throw();
    expect(addFormat).not.toHaveBeenCalled();
    addFormat.mockRestore();
  });
});
