#!/usr/bin/env bun
/**
 * Deployments registry tool for Foundry projects.
 *
 * Maintains a curated, committed registry of deployed contract addresses in
 * `deployments/<chainId>.json`, fed by Foundry broadcast artifacts (which stay gitignored).
 * When a contract is re-deployed to a new address, the previous entry is preserved in the
 * contract's `history` array.
 *
 * Usage:
 *   deployments.ts extract --script <DeployScript.s.sol> [--root <dir>] [--out <dir>]
 *   deployments.ts extract --broadcast <path/to/run-latest.json> [--root <dir>] [--out <dir>]
 *   deployments.ts check [--dir <dir>] [--chain-id <id>] [--rpc-url <url-or-alias>]
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Mirrors the rpc_endpoints aliases in the foundry-template foundry.toml.
const CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  100: "gnosis",
  137: "polygon",
  324: "zksync",
  919: "mode_sepolia",
  8453: "base",
  31337: "localhost",
  34443: "mode",
  42161: "arbitrum",
  43114: "avalanche",
  59144: "linea",
  81457: "blast",
  84532: "base_sepolia",
  421614: "arbitrum_sepolia",
  534352: "scroll",
  11155111: "sepolia",
  11155420: "optimism_sepolia",
};

interface DeploymentEntry {
  address: string;
  blockNumber: number | null;
  commit: string;
  constructorArgs?: string[];
  deployer: string;
  deprecated?: string;
  history?: DeploymentEntry[];
  timestamp: string;
  txHash: string;
  version: string;
}

interface Registry {
  chain: string;
  chainId: number;
  contracts: Record<string, DeploymentEntry>;
}

interface BroadcastTx {
  additionalContracts?: { address: string; transactionType: string }[];
  arguments?: string[] | null;
  contractAddress?: string;
  contractName?: string;
  hash?: string;
  transaction?: { from?: string };
  transactionType: string;
}

interface BroadcastFile {
  chain: number;
  commit?: string;
  receipts?: { blockNumber?: string | number; status?: string; transactionHash?: string }[];
  timestamp?: number;
  transactions: BroadcastTx[];
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function warn(message: string): void {
  console.warn(`warning: ${message}`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      fail(`unexpected argument: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`missing value for ${arg}`);
    }
    args[arg.slice(2)] = value;
    i += 1;
  }
  return args;
}

function toIsoTimestamp(raw: number | undefined): string {
  if (!raw) {
    return new Date().toISOString();
  }
  // Forge writes seconds in older versions and milliseconds in newer ones.
  const millis = raw > 1e12 ? raw : raw * 1000;
  return new Date(millis).toISOString();
}

function hexToNumber(raw: string | number | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  return typeof raw === "number" ? raw : Number.parseInt(raw, 16);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function resolveCommit(broadcast: BroadcastFile, root: string): string {
  if (broadcast.commit) {
    return broadcast.commit;
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function resolveVersion(root: string): string {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) {
    warn(`no package.json found in ${root}; recording version as 0.0.0`);
    return "0.0.0";
  }
  return readJson<{ version?: string }>(packagePath).version ?? "0.0.0";
}

function findLatestBroadcast(root: string, script: string): string {
  const scriptName = basename(script);
  const broadcastDir = join(root, "broadcast", scriptName);
  if (!existsSync(broadcastDir)) {
    fail(`no broadcast directory found at ${broadcastDir} - did the deployment broadcast?`);
  }
  const candidates = readdirSync(broadcastDir)
    .map((chainDir) => join(broadcastDir, chainDir, "run-latest.json"))
    .filter((path) => existsSync(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (candidates.length === 0) {
    fail(`no run-latest.json found under ${broadcastDir}`);
  }
  return candidates[0];
}

function loadRegistry(path: string, chainId: number): Registry {
  if (existsSync(path)) {
    return readJson<Registry>(path);
  }
  return {
    chain: CHAIN_NAMES[chainId] ?? `chain-${chainId}`,
    chainId,
    contracts: {},
  };
}

/** Merge a fresh deployment into the registry, pushing a replaced address into history. */
function mergeEntry(
  registry: Registry,
  name: string,
  entry: DeploymentEntry,
): "added" | "updated" | "replaced" {
  const existing = registry.contracts[name];
  if (!existing) {
    registry.contracts[name] = entry;
    return "added";
  }
  if (existing.address.toLowerCase() === entry.address.toLowerCase()) {
    registry.contracts[name] = { ...entry, history: existing.history };
    return "updated";
  }
  const { history: previousHistory, ...previous } = existing;
  previous.deprecated = entry.timestamp.slice(0, 10);
  registry.contracts[name] = {
    ...entry,
    history: [previous, ...(previousHistory ?? [])],
  };
  return "replaced";
}

function writeRegistry(path: string, registry: Registry): void {
  const sorted: Registry = {
    chain: registry.chain,
    chainId: registry.chainId,
    contracts: Object.fromEntries(
      Object.keys(registry.contracts)
        .sort()
        .map((name) => [name, registry.contracts[name]]),
    ),
  };
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** Recursively find the first file named `fileName` under `dir`. */
function findArtifact(dir: string, fileName: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findArtifact(full, fileName);
      if (found) {
        return found;
      }
    } else if (entry.name === fileName) {
      return full;
    }
  }
  return null;
}

/** Read a contract's ABI from its Foundry artifact: out/<name>.sol/<name>.json (fallback: search out/). */
function readArtifactAbi(root: string, name: string): unknown[] | null {
  const outRoot = join(root, "out");
  const primary = join(outRoot, `${name}.sol`, `${name}.json`);
  const path = existsSync(primary) ? primary : findArtifact(outRoot, `${name}.json`);
  if (!path) {
    return null;
  }
  const artifact = readJson<{ abi?: unknown[] }>(path);
  return Array.isArray(artifact.abi) ? artifact.abi : null;
}

/**
 * Emit chain-independent ABI JSON to `<outDir>/abis/<Contract>.json` for the deployed contracts plus any
 * contract/interface types listed in `<outDir>/abi-extras.json` (e.g. factory-created facilities that have no
 * deployed singleton address). ABIs are read from the Foundry `out/` build artifacts.
 */
function emitAbis(root: string, outDir: string, deployed: string[]): void {
  const extrasPath = join(outDir, "abi-extras.json");
  const extras = existsSync(extrasPath) ? readJson<string[]>(extrasPath) : [];
  const names = [...new Set([...deployed, ...extras])].sort();
  const abisDir = join(outDir, "abis");
  const written: string[] = [];
  for (const name of names) {
    const abi = readArtifactAbi(root, name);
    if (!abi) {
      warn(`no out/ artifact ABI found for ${name}; skipping (run a build so out/ exists)`);
      continue;
    }
    mkdirSync(abisDir, { recursive: true });
    writeFileSync(join(abisDir, `${name}.json`), `${JSON.stringify(abi, null, 2)}\n`);
    written.push(name);
  }
  if (written.length > 0) {
    console.log(`\nABIs written to ${abisDir}: ${written.join(", ")}`);
  }
}

function extract(args: Record<string, string>): void {
  const root = args.root ?? process.cwd();
  const outDir = args.out ?? join(root, "deployments");

  let broadcastPath: string;
  if (args.broadcast) {
    broadcastPath = args.broadcast;
  } else if (args.script) {
    broadcastPath = findLatestBroadcast(root, args.script);
  } else {
    fail("extract requires --script <DeployScript.s.sol> or --broadcast <path/to/run-latest.json>");
  }
  if (!existsSync(broadcastPath)) {
    fail(`broadcast file not found: ${broadcastPath}`);
  }

  const broadcast = readJson<BroadcastFile>(broadcastPath);
  const chainId = broadcast.chain;
  const commit = resolveCommit(broadcast, root);
  const version = resolveVersion(root);
  const timestamp = toIsoTimestamp(broadcast.timestamp);

  const receiptsByHash = new Map<string, { blockNumber: number | null; status?: string }>();
  for (const receipt of broadcast.receipts ?? []) {
    if (receipt.transactionHash) {
      receiptsByHash.set(receipt.transactionHash.toLowerCase(), {
        blockNumber: hexToNumber(receipt.blockNumber),
        status: receipt.status,
      });
    }
  }

  const registryPath = join(outDir, `${chainId}.json`);
  const registry = loadRegistry(registryPath, chainId);
  const results: { name: string; address: string; outcome: string }[] = [];

  for (const tx of broadcast.transactions) {
    if (tx.transactionType !== "CREATE" && tx.transactionType !== "CREATE2") {
      for (const sub of tx.additionalContracts ?? []) {
        warn(
          `contract created via internal call at ${sub.address} has no name in the broadcast file - ` +
            "add it to the registry manually if it should be tracked",
        );
      }
      continue;
    }
    if (!tx.contractName || !tx.contractAddress) {
      warn(`skipping unnamed ${tx.transactionType} transaction ${tx.hash ?? "(no hash)"}`);
      continue;
    }

    const receipt = tx.hash ? receiptsByHash.get(tx.hash.toLowerCase()) : undefined;
    if (receipt?.status && receipt.status !== "0x1") {
      warn(`skipping ${tx.contractName}: transaction ${tx.hash} reverted`);
      continue;
    }
    if (!receipt) {
      warn(
        `no receipt found for ${tx.contractName} (${tx.hash ?? "no hash"}); recording without block number`,
      );
    }

    const entry: DeploymentEntry = {
      address: tx.contractAddress,
      blockNumber: receipt?.blockNumber ?? null,
      commit,
      deployer: tx.transaction?.from ?? "unknown",
      timestamp,
      txHash: tx.hash ?? "unknown",
      version,
    };
    if (tx.arguments && tx.arguments.length > 0) {
      entry.constructorArgs = tx.arguments;
    }
    const outcome = mergeEntry(registry, tx.contractName, entry);
    results.push({ address: tx.contractAddress, name: tx.contractName, outcome });
  }

  if (results.length === 0) {
    warn("no successful CREATE/CREATE2 transactions found; registry not modified");
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeRegistry(registryPath, registry);

  console.log(`\nRegistry updated: ${registryPath}`);
  for (const result of results) {
    console.log(`  [${result.outcome}] ${result.name} -> ${result.address}`);
  }
  emitAbis(
    root,
    outDir,
    results.map((r) => r.name),
  );

  console.log("\nReview the diff and commit the registry change to make it canonical.");
}

function check(args: Record<string, string>): void {
  const dir = args.dir ?? join(process.cwd(), "deployments");
  if (!existsSync(dir)) {
    fail(`deployments directory not found: ${dir}`);
  }
  const files = readdirSync(dir)
    .filter((file) => /^\d+\.json$/.test(file))
    .filter((file) => !args["chain-id"] || file === `${args["chain-id"]}.json`);
  if (files.length === 0) {
    fail(`no registry files to check in ${dir}`);
  }

  let failures = 0;
  for (const file of files) {
    const registry = readJson<Registry>(join(dir, file));
    const rpc = args["rpc-url"] ?? registry.chain;
    console.log(`\nChecking ${file} (${registry.chain}) against rpc "${rpc}"`);
    for (const [name, entry] of Object.entries(registry.contracts)) {
      let code: string;
      try {
        code = execSync(`cast code ${entry.address} --rpc-url "${rpc}"`, {
          stdio: ["ignore", "pipe", "pipe"],
        })
          .toString()
          .trim();
      } catch {
        console.log(`  FAIL ${name} ${entry.address} - rpc call failed`);
        failures += 1;
        continue;
      }
      if (code === "0x" || code === "") {
        console.log(`  FAIL ${name} ${entry.address} - no code on-chain`);
        failures += 1;
      } else {
        console.log(`  ok   ${name} ${entry.address}`);
      }
    }
  }
  if (failures > 0) {
    fail(`${failures} contract(s) failed the on-chain code check`);
  }
  console.log("\nAll registry addresses have code on-chain.");
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case "extract":
      extract(args);
      break;
    case "check":
      check(args);
      break;
    default:
      fail("usage: deployments.ts <extract|check> [options]");
  }
}

main();
