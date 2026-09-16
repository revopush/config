import { ConfigError } from "./errors";
import { SECRET_PREFIX } from "./constants";
import { leaves } from "./schema-walk";
import { Schema } from "./types";

const PLACEHOLDER = /\{([^}]+)\}/g;

/**
 * kebab-cases a key path. Dots become dashes as well, so a nested secret such as
 * `secret.redis.password` yields `redis-password` — a legal name in stores like Azure Key Vault,
 * whose names match `^[0-9a-zA-Z-]+$` — rather than the dotted `redis.password`, which every such
 * store rejects or reports as not found.
 */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\./g, "-")
    .toLowerCase();
}

/**
 * The name each declared secret has in its store.
 *
 * Defaults to the key below `secret.` in kebab-case, with dots flattened to dashes, so
 * `secret.redisKey` is `redis-key` and `secret.redis.password` is `redis-password`. An entry
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
