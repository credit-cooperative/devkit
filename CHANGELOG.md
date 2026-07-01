# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Common Changelog](https://common-changelog.org/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

[1.3.0]: https://github.com/credit-cooperative/devkit/releases/tag/v1.3.0
[1.2.0]: https://github.com/credit-cooperative/devkit/releases/tag/v1.2.0
[1.1.0]: https://github.com/credit-cooperative/devkit/releases/tag/v1.1.0
[1.0.0]: https://github.com/yourorg/devkit/releases/tag/v1.0.0

## [1.3.0] - 2026-07-02

### Added

- `deployments.ts extract` now also emits chain-independent contract ABIs to `deployments/abis/<Contract>.json`, read
  from the Foundry `out/` build artifacts, for every deployed contract **plus** any contract/interface types listed in
  an optional `deployments/abi-extras.json` (e.g. factory-created facilities that have no deployed singleton address).
  Lets the address-book aggregator ship ABIs alongside addresses.
- `deployments-dispatch.yml` now includes `deployments/abis/*.json` in the change set it dispatches.

## [1.2.0] - 2026-06-23

### Changed

- `deployments-dispatch.yml`: authenticate as the org-owned GitHub App instead of a raw token. The reusable workflow now
  takes `app-id` + `app-private-key` secrets (was `dispatch-token`) and mints a short-lived installation token scoped to
  the target repo. **Breaking for callers**: update the caller's `secrets:` block to pass `app-id`/`app-private-key`
  (see the usage header in the workflow).

## [1.1.0] - 2026-06-12

### Added

- `scripts/deployments.ts`: extracts deployed contract addresses from Foundry broadcast artifacts into a curated,
  committed `deployments/<chainId>.json` registry; re-deployments push the previous entry into the contract's `history`
  array. Also provides a `check` command that verifies every registry address has code on-chain
- Just recipes in `evm.just`: `deploy`, `deploy-dry`, `deployments-extract`, `deployments-check`
- Reusable GitHub workflow `deployments-dispatch.yml`: sends a `repository_dispatch` event to the `address-book`
  aggregator repo when a project's `deployments/` registry changes on main

## [1.0.0] - 2025-12-03

### Added

- Initial release of credit-cooperative Devkit
- Forked from Sablier Devkit v1.3.5
- Updated branding and package naming
- Just recipes for EVM development
- Biome and Prettier configurations
- TypeScript base configurations
- GitHub Actions setup workflow
