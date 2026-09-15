# Security Policy

`@revopush/config` and `@revopush/config-azure-keyvault` load configuration and secrets for
production services. A vulnerability here — in schema validation, secret handling, or the Azure
Key Vault provider — can affect every service that depends on these packages, so please report it
privately rather than opening a public issue.

## Supported versions

This project has not yet reached a stable 1.0 release. Security fixes are made against the latest
published version on npm; there is no separate maintenance branch for older versions.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner rather than filing a
public GitHub issue or discussing them in a public channel. Include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce it, or a minimal example.
- The package(s) and version(s) affected.

You should receive an acknowledgement within a few business days. We will work with you to
understand and confirm the issue, prepare a fix, and coordinate disclosure — crediting you in the
release notes, if you would like — once a patched version is published.

## Scope

In scope: the `@revopush/config` and `@revopush/config-azure-keyvault` packages themselves —
configuration merging, schema validation, secret resolution, and the codegen CLI. Vulnerabilities
in dependencies (e.g. `convict`, the Azure SDKs) are best reported directly to those projects, but
we would still like to know if one affects how this library uses them.
