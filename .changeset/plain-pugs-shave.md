---
"@revopush/config": minor
---

Add the `non-empty-string` format, exported as `NON_EMPTY_STRING`.

convict has no way to declare a key required: every entry needs a `default`, and an unset key
resolves to it silently. The usual workaround, `default: null`, makes the key required but types it
as `T | null` for every consumer even though validation guarantees it is never null after `init()`.

Paired with an empty default, `non-empty-string` fails validation naming the key, and the generated
type stays `string`. Whitespace counts as empty.
