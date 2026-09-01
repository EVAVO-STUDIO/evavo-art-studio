#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(root, "contracts/animation-character-family-v1.lock.json");
function fail(code, detail = "") { throw new Error(detail ? `${code}:${detail}` : code); }
function inside(base, target) { const rel = relative(base, target); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); }
async function digest(path) { return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`; }
async function containedFile(rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0") || isAbsolute(rel)) fail("ANIMATION_CHARACTER_FAMILY_LOCK_PATH_INVALID");
  const path = resolve(root, rel);
  if (!inside(root, path)) fail("ANIMATION_CHARACTER_FAMILY_LOCK_PATH_ESCAPE", rel);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) fail("ANIMATION_CHARACTER_FAMILY_LOCK_FILE_INVALID", rel);
  if (!inside(root, await realpath(path))) fail("ANIMATION_CHARACTER_FAMILY_LOCK_PHYSICAL_ESCAPE", rel);
  return path;
}
function run(args, code) { const result = spawnSync(process.execPath, args, { cwd: root, shell: false, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); if (result.error || result.status !== 0) fail(code, `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()); }
const lock = JSON.parse(await readFile(lockPath, "utf8"));
if (lock.schema !== "evavo.animation-character-family-lock.v1" || lock.protocolVersion !== "2026-09-01.2" || !Array.isArray(lock.files) || lock.files.length < 10) fail("ANIMATION_CHARACTER_FAMILY_LOCK_INVALID");
const seen = new Set();
for (const entry of lock.files) { if (!entry || seen.has(entry.path)) fail("ANIMATION_CHARACTER_FAMILY_LOCK_ENTRY_INVALID"); seen.add(entry.path); const path = await containedFile(entry.path); if (await digest(path) !== entry.sha256) fail("ANIMATION_CHARACTER_FAMILY_LOCK_DIGEST_MISMATCH", entry.path); }
const schema = JSON.parse(await readFile(resolve(root, "contracts/animation-character-family-v1.schema.json"), "utf8"));
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema" || schema.oneOf?.length !== 8 || !schema.$defs?.request || !schema.$defs?.runtimePlan) fail("ANIMATION_CHARACTER_FAMILY_SCHEMA_INVALID");
const mcpName = "evavo-animation-character-family-v1";
const dedicated = JSON.parse(await readFile(resolve(root, ".mcp.animation-character-family-v1.json"), "utf8"));
const rootMcp = JSON.parse(await readFile(resolve(root, ".mcp.json"), "utf8"));
if (JSON.stringify(dedicated.mcpServers?.[mcpName]) !== JSON.stringify(rootMcp.mcpServers?.[mcpName])) fail("ANIMATION_CHARACTER_FAMILY_MCP_REGISTRATION_DRIFT");
run(["--check", "tools/animation_character_family_v1.mjs"], "ANIMATION_CHARACTER_FAMILY_CORE_SYNTAX_FAILED");
run(["--check", "tools/animation_character_family_v1_mcp.mjs"], "ANIMATION_CHARACTER_FAMILY_MCP_SYNTAX_FAILED");
run(["--test", "scripts/test-animation-character-family-v1.mjs", "scripts/test-animation-character-family-v1-mcp.mjs"], "ANIMATION_CHARACTER_FAMILY_TEST_FAILED");
process.stdout.write(`${JSON.stringify({ status: "passed", protocolVersion: lock.protocolVersion, lockedFiles: lock.files.length, providerExecution: false, creativeApproval: false, artifactPromotion: false, runtimeActivation: false, publication: false })}\n`);
