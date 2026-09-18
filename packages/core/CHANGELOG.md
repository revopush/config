# @revopush/config

## 0.2.0

### Minor Changes

- 8c76d8a: Add `required: true` to the schema entry vocabulary.

  convict needs a `default` on every entry, so an unset key resolves to it silently. `required` says
  a default is not good enough: if no source supplied the key, `init()` throws `ConfigValidationError`
  naming every key that is missing.

  Presence means "a source set it", so it works for numbers, booleans and enums, not only strings,
  and the key keeps an ordinary default — and so an ordinary generated type, unlike the `default: null`
  workaround which types the key `T | null` for every consumer.

### Patch Changes

- 28c802a: Reject a source named `default`. That name is the provenance of schema defaults, so a source using
  it had every value it supplied read back as a default — and any secret it declared was never
  requested from the secret store.
