#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maximumFileBytes = 32 * 1024 * 1024;

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function inside(base, target) {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
async function containedFile(path) {
  if (typeof path !== "string" || !path || path.includes("\0") || isAbsolute(path)) {
    fail("ANIMATION_CHARACTER_FAMILY_LOCK_PATH_INVALID", String(path));
  }
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) fail("ANIMATION_CHARACTER_FAMILY_LOCK_PATH_ESCAPE", path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumFileBytes) {
    fail("ANIMATION_CHARACTER_FAMILY_LOCK_FILE_INVALID", path);
  }
  if (!inside(root, await realpath(absolute))) {
    fail("ANIMATION_CHARACTER_FAMILY_LOCK_PHYSICAL_ESCAPE", path);
  }
  return absolute;
}
async function digest(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}
function run(args, code) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) fail(code, `${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
}

const lock = JSON.parse(await readFile(resolve(root, "contracts/animation-character-family-v1.lock.json"), "utf8"));
if (
  lock.schema !== "evavo.animation-character-family-lock.v1" ||
  lock.protocolVersion !== "2026-09-01.2" ||
  !Array.isArray(lock.files) ||
  lock.files.length < 8
) fail("ANIMATION_CHARACTER_FAMILY_LOCK_INVALID");
const seen = new Set();
for (const entry of lock.files) {
  if (!entry || typeof entry !== "object" || seen.has(entry.path)) {
    fail("ANIMATION_CHARACTER_FAMILY_LOCK_ENTRY_INVALID");
  }
  seen.add(entry.path);
  const absolute = await containedFile(entry.path);
  if (await digest(absolute) !== entry.sha256) {
    fail("ANIMATION_CHARACTER_FAMILY_LOCK_DIGEST_MISMATCH", entry.path);
  }
}

const schema = JSON.parse(await readFile(resolve(root, "contracts/animation-character-family-v1.schema.json"), "utf8"));
if (
  schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
  schema.$id !== "https://schemas.evavo.com.au/animation/animation-character-family-v1.schema.json" ||
  !Array.isArray(schema.oneOf) || schema.oneOf.length !== 8 ||
  !schema.$defs?.request || !schema.$defs?.plan || !schema.$defs?.clipEvidence ||
  !schema.$defs?.status || !schema.$defs?.reviewInput || !schema.$defs?.assessment ||
  !schema.$defs?.reviewReceipt || !schema.$defs?.runtimePlan
) fail("ANIMATION_CHARACTER_FAMILY_SCHEMA_INVALID");

const roleFile = JSON.parse(await readFile(resolve(root, ".mcp.animation-character-family-v1.json"), "utf8"));
const rootMcp = JSON.parse(await readFile(resolve(root, ".mcp.json"), "utf8"));
const name = "evavo-animation-character-family-v1";
if (
  !roleFile.mcpServers?.[name] ||
  JSON.stringify(roleFile.mcpServers[name]) !== JSON.stringify(rootMcp.mcpServers?.[name])
) fail("ANIMATION_CHARACTER_FAMILY_MCP_REGISTRATION_DRIFT");

run(["--check", "tools/animation_character_family_v1.mjs"], "ANIMATION_CHARACTER_FAMILY_CORE_SYNTAX_FAILED");
run(["--check", "tools/animation_character_family_v1_mcp.mjs"], "ANIMATION_CHARACTER_FAMILY_MCP_SYNTAX_FAILED");
run(["--test", "scripts/test-animation-character-family-v1.mjs"], "ANIMATION_CHARACTER_FAMILY_TEST_FAILED");
run(["--test", "scripts/test-animation-character-family-v1-mcp.mjs"], "ANIMATION_CHARACTER_FAMILY_MCP_TEST_FAILED");

process.stdout.write(`${JSON.stringify({
  status: "passed",
  schema: "evavo.animation-character-family-check.v1",
  protocolVersion: lock.protocolVersion,
  lockedFiles: lock.files.length,
  providerExecution: false,
  creativeApproval: false,
  artifactPromotion: false,
  repositoryMutation: false,
  runtimeActivation: false,
  publication: false
})}\n`);
