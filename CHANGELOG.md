# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Common Changelog](https://common-changelog.org/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

[1.1.0]: https://github.com/credit-cooperative/devkit/releases/tag/v1.1.0
[1.0.0]: https://github.com/yourorg/devkit/releases/tag/v1.0.0

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
