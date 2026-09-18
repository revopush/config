---
"@revopush/config": patch
---

Reject a source named `default`. That name is the provenance of schema defaults, so a source using
it had every value it supplied read back as a default — and any secret it declared was never
requested from the secret store.
