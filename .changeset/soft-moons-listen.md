---
"@revopush/config": minor
---

Add `required: true` to the schema entry vocabulary.

convict needs a `default` on every entry, so an unset key resolves to it silently. `required` says
a default is not good enough: if no source supplied the key, `init()` throws `ConfigValidationError`
naming every key that is missing.

Presence means "a source set it", so it works for numbers, booleans and enums, not only strings,
and the key keeps an ordinary default — and so an ordinary generated type, unlike the `default: null`
workaround which types the key `T | null` for every consumer.
