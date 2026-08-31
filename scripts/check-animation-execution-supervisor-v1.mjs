#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

async function fileSha256(path) {
  const state = await lstat(path);
  if (!state.isFile() || state.isSymbolicLink()) {
    fail("ANIMATION_EXECUTION_CHECK_FILE_UNSAFE", path);
  }
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function syntaxCheck(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(
      "ANIMATION_EXECUTION_CHECK_SYNTAX_FAILED",
      `${path}:${(result.stderr || result.stdout).trim()}`,
    );
  }
}

async function main() {
  const repositoryRoot = await realpath(resolve(HERE, ".."));
  const repositoryName = basename(repositoryRoot).toLowerCase();
  const role = repositoryName === "evavo-art-studio"
    ? "art-studio"
    : repositoryName === "cel-animation-studio"
      ? "cel-animation-studio"
      : fail("ANIMATION_EXECUTION_CHECK_REPOSITORY_UNKNOWN", repositoryName);
  const lockPath = resolve(
    repositoryRoot,
    "contracts/animation-execution-supervisor-v1.lock.json",
  );
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (
    lock.schema !== "evavo.animation-execution-supervisor-lock.v1" ||
    lock.protocolVersion !== "2026-08-31.2" ||
    lock.role !== role ||
    !Array.isArray(lock.files)
  ) {
    fail("ANIMATION_EXECUTION_CHECK_LOCK_INVALID");
  }
  const verifiedFiles = [];
  for (const entry of lock.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string" ||
      !DIGEST.test(entry.sha256)
    ) {
      fail("ANIMATION_EXECUTION_CHECK_LOCK_ENTRY_INVALID");
    }
    const path = resolve(repositoryRoot, entry.path);
    const actual = await fileSha256(path);
    if (actual !== entry.sha256) {
      fail("ANIMATION_EXECUTION_CHECK_FILE_DIGEST_MISMATCH", entry.path);
    }
    if (entry.path.endsWith(".mjs")) syntaxCheck(path);
    verifiedFiles.push(entry.path);
  }

  const supervisor = await import(
    `${pathToFileURL(
      resolve(repositoryRoot, "tools/animation_execution_supervisor_v1.mjs"),
    ).href}?check=${Date.now()}`,
  );
  const description = supervisor.describeAnimationExecutionSupervisor();
  if (description.protocolVersion !== lock.protocolVersion) {
    fail("ANIMATION_EXECUTION_CHECK_PROTOCOL_MISMATCH");
  }
  const cataloguePath = resolve(
    repositoryRoot,
    "config/animation-execution-adapter-catalogue-v1.json",
  );
  const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
  supervisor.assertAnimationExecutionAdapterCatalogueIntegrity(catalogue);
  if (catalogue.catalogueDigest !== lock.catalogueDigest) {
    fail("ANIMATION_EXECUTION_CHECK_CATALOGUE_DIGEST_MISMATCH");
  }
  for (const adapter of catalogue.adapters.filter(
    (entry) => entry.ownerRole === role,
  )) {
    const actual = await fileSha256(resolve(repositoryRoot, adapter.entrypoint));
    if (actual !== adapter.implementationSha256) {
      fail(
        "ANIMATION_EXECUTION_CHECK_ADAPTER_DIGEST_MISMATCH",
        adapter.id,
      );
    }
  }

  const mcp = JSON.parse(
    await readFile(resolve(repositoryRoot, ".mcp.json"), "utf8"),
  );
  const server =
    mcp.mcpServers?.["evavo-animation-execution-supervisor-v1"];
  const standaloneMcp = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        ".mcp.animation-execution-supervisor-v1.json",
      ),
      "utf8",
    ),
  );
  const standaloneServer =
    standaloneMcp.mcpServers?.["evavo-animation-execution-supervisor-v1"];
  if (
    server?.command !== "node" ||
    JSON.stringify(server.args) !==
      JSON.stringify(["scripts/start-animation-execution-supervisor-mcp-v1.mjs"]) ||
    server.env?.EVAVO_ANIMATION_EXECUTION_ENABLED !== "disabled" ||
    server.env?.EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED !== "disabled" ||
    JSON.stringify(standaloneServer) !== JSON.stringify(server)
  ) {
    fail("ANIMATION_EXECUTION_CHECK_MCP_WIRING_INVALID");
  }

  process.stdout.write(
    `${JSON.stringify({
      schema: "evavo.animation-execution-supervisor-check.v1",
      status: "verified",
      role,
      protocolVersion: lock.protocolVersion,
      catalogueDigest: catalogue.catalogueDigest,
      verifiedFiles,
    }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
