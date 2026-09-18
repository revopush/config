import convict from "convict";
import { NON_EMPTY_STRING, STRICT_BOOLEAN } from "./constants";

export { NON_EMPTY_STRING, STRICT_BOOLEAN };

const TRUE_VALUES = ["true", "1", "yes", "on"];
const FALSE_VALUES = ["false", "0", "no", "off"];

let registered = false;

/**
 * Registers the library's custom convict formats. Idempotent, so importing more than once is safe.
 *
 * convict's own boolean format coerces every spelling but the literal "false" to true, which turns
 * `ENABLE_ACCOUNT_REGISTRATION=0` into *enabled*. `strict-boolean` accepts only unambiguous
 * spellings and fails startup on anything else.
 *
 * convict has no way to say "this must be provided". `non-empty-string` is it: paired with an
 * empty default, an unset key fails validation instead of resolving to `""`.
 */
export function registerFormats(): void {
  if (registered) return;
  registered = true;

  convict.addFormat({
    name: STRICT_BOOLEAN,
    validate: (value: unknown): void => {
      if (typeof value !== "boolean") {
        throw new Error(`must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(", ")}`);
      }
    },
    coerce: (value: string): boolean | string => {
      const normalized = String(value).trim().toLowerCase();
      if (TRUE_VALUES.includes(normalized)) return true;
      if (FALSE_VALUES.includes(normalized)) return false;
      return value;
    },
  });

  convict.addFormat({
    name: NON_EMPTY_STRING,
    validate: (value: unknown): void => {
      // Whitespace counts as empty: a key set to " " is a mistake, not a value.
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error("must be a non-empty string");
      }
    },
  });
}
