import convict from "convict";

/** Name of the boolean format this library registers. Use it as `format` in a schema. */
export const STRICT_BOOLEAN = "strict-boolean";

const TRUE_VALUES = ["true", "1", "yes", "on"];
const FALSE_VALUES = ["false", "0", "no", "off"];

let registered = false;

/**
 * Registers the library's custom convict formats. Idempotent, so importing more than once is safe.
 *
 * convict's own boolean format coerces every spelling but the literal "false" to true, which turns
 * `ENABLE_ACCOUNT_REGISTRATION=0` into *enabled*. This one accepts only unambiguous spellings and
 * fails startup on anything else.
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
}
