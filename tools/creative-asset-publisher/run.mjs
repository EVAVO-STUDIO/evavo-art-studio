#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inside, safeRelative } from "./runtime-common.mjs";
import { loadSealedBundle } from "./runtime-bundle.mjs";
import { installSealedRuntime } from "./runtime-install.mjs";

const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const descriptor = JSON.parse(fs.readFileSync(path.join(distributionRoot, "distribution.json"), "utf8"));
const bundle = loadSealedBundle(distributionRoot, descriptor);
const { runtimeRoot, runtimeStats } = installSealedRuntime(bundle);
const mode = process.argv[2] || "help";
if (mode === "verify") {
  console.log(JSON.stringify({
    contract: "evavo.creative-asset-publisher-sealed-runtime-verification.v1",
    status: "verified",
    package: bundle.packageIdentity,
    bundleSha256: bundle.bundleSha256,
    archiveSha256: bundle.archiveSha256,
    runtimeRoot,
    fileCount: runtimeStats.fileCount,
    checksumEntryCount: runtimeStats.checksumEntryCount,
    totalFileBytes: runtimeStats.totalFileBytes,
    repositoryMutationAuthority: false,
    storageMutationAuthority: false,
    githubMcpMutationAuthority: false,
    developmentStudioSealedPublicationAuthority: true,
    sealedExecutionPackageRequired: true,
    exactShaProviderConfirmationRequired: true,
    repositoryReliabilityProfileRequired: true,
    rawMainlineApplyAuthority: false,
    directMainlinePublisherAuthority: false,
    forcePushAvailable: false
  }, null, 2));
  process.exitCode = 0;
} else {
  const entry = mode === "mcp" ? bundle.entrypoints.mcp : mode === "cli" ? bundle.entrypoints.cli : null;
  if (!entry) throw new Error("Usage: run.mjs <verify|mcp|cli> [arguments...]");
  const entryPath = path.resolve(runtimeRoot, ...safeRelative(entry, "entrypoint").split("/"));
  if (!inside(runtimeRoot, entryPath)) throw new Error("Runtime entrypoint escaped its root.");
  const entryMetadata = fs.lstatSync(entryPath);
  if (!entryMetadata.isFile() || entryMetadata.isSymbolicLink()) throw new Error("Runtime entrypoint is not an ordinary file.");
  const result = spawnSync(process.execPath, [entryPath, ...process.argv.slice(3)], { stdio: "inherit", shell: false, windowsHide: true, env: process.env });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Creative Asset Publisher terminated by ${result.signal}.`);
  process.exitCode = result.status ?? 1;
}
