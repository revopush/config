import { ConfigError } from "./errors";
import { SECRET_PREFIX } from "./constants";
import { leaves } from "./schema-walk";
import { Schema } from "./types";

const PLACEHOLDER = /\{([^}]+)\}/g;

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * The name each declared secret has in its store.
 *
 * Defaults to the key's last segment in kebab-case, so `secret.redisKey` is `redis-key`. An entry
 * may override that with `secretName`, whose `{config.key}` placeholders resolve against values
 * merged so far — which is how a name built from another setting, such as a per-account storage
 * key, is expressed without code.
 *
 * Throws `ConfigError` if a placeholder in a `secretName` template resolves to `undefined`, `null`, or an empty string.
 */
export function secretNames(
  schema: Schema,
  declared: Iterable<string>,
  read: (key: string) => unknown
): Map<string, string> {
  const entries = new Map(leaves(schema).map(({ path, entry }) => [path, entry]));
  const names = new Map<string, string>();

  for (const key of declared) {
    const entry = entries.get(key);
    if (!entry) continue;
    const template = entry.secretName ?? kebab(key.slice(SECRET_PREFIX.length));
    names.set(
      key,
      template.replace(PLACEHOLDER, (_, placeholder: string) => {
        const value = read(placeholder);
        if (value === undefined || value === null || value === "") {
          throw new ConfigError(
            `Secret "${key}" has secretName "${template}", but "${placeholder}" resolved to nothing.`
          );
        }
        return String(value);
      })
    );
  }

  return names;
}
