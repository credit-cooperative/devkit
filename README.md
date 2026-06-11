# 🛠️ Credit-cooperative Devkit

This repository contains configuration files and reusable scripts for various credit-cooperative repositories.

The files are meant to be extended and customized as needed.

## ⚙️ Config Files

| Tool            | Config File/Directory                 |
| --------------- | :------------------------------------ |
| 🔍 Biome        | [`biome.jsonc`](./biome.jsonc)        |
| 📝 EditorConfig | [`.editorconfig`](./.editorconfig)    |
| 🛠 Just         | [`just/`](./just/)                    |
| ✨ Prettier     | [`prettier.json`](./.prettierrc.json) |
| 📦 TSConfig     | [`tsconfig/`](./tsconfig/)            |

## 📒 Deployments Registry

Foundry projects consuming this devkit get a committed, curated registry of deployed contract addresses in
`deployments/<chainId>.json`, fed by Foundry broadcast artifacts (which stay gitignored). Re-deployments preserve the
previous address in the contract's `history` array.

| Command                                   | Description                                               |
| ----------------------------------------- | :-------------------------------------------------------- |
| `just deploy <script> <chain> [args]`     | Run a deploy script, broadcast, and update the registry   |
| `just deploy-dry <script> <chain> [args]` | Simulate a deploy script without broadcasting             |
| `just deployments-extract <script>`       | Update the registry from the latest broadcast of a script |
| `just deployments-check [args]`           | Verify every registry address has code on-chain           |

See [`scripts/deployments.ts`](./scripts/deployments.ts) for details. The reusable
[`deployments-dispatch.yml`](./.github/workflows/deployments-dispatch.yml) workflow notifies the
[address-book](https://github.com/credit-cooperative/address-book) aggregator when a registry changes on main.

## 🐈‍⬛ GitHub Actions

The [setup](./actions/setup/) GitHub Actions workflow is used to setup the requisite dependencies in a GitHub CI
workflow.

## 🚀 Setup Script

This is meant to be run by credit-cooperative employees and staff.

See [`setup.sh`](./shell/setup.sh) for details.

## 📦 VSCode Settings

See [`vscode/settings.json`](./vscode/settings.json).

## 📄 License

This project is licensed under MIT.
