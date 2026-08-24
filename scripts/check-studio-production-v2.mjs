#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "studio.production.v2.json");
const SAFE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SAFE_REPOSITORY = /^EVAVO-STUDIO\/[A-Za-z0-9._-]+$/;
const REQUIRED = new Set(["schema", "studioId", "repository", "runtime", "entrypoints", "contracts", "handoffs", "automation", "qualityGates", "authority", "ciWorkflow"]);
const CONTRACT_FIELDS = new Set(["id", "path", "role"]);
const AUTOMATION_FIELDS = new Set(["resumable", "atomicCheckpoints", "boundedRetries", "maxAttemptsPerStep", "targetedRepair", "replaySafe", "networkRequiredDuringValidation", "sourceMutationDuringValidation"]);
const AUTHORITY_FIELDS = new Set(["automaticCreativeApproval", "automaticReleaseApproval", "automaticPublication", "automaticDeployment"]);
const ROLES = new Set(["shared", "producer", "consumer", "quality", "orchestration"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, expected, label) {
  const observed = Object.keys(record(value, label));
  const unknown = observed.filter((key) => !expected.has(key));
  const missing = [...expected].filter((key) => !(key in value));
  if (unknown.length || missing.length) throw new Error(`${label} fields changed; missing=${missing.join(",")} unknown=${unknown.join(",")}`);
}
function safeRelative(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..") || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a portable relative path`);
  }
  return value;
}
async function ordinaryFile(relative, label) {
  const safe = safeRelative(relative, label);
  const target = path.resolve(ROOT, safe);
  if (!target.startsWith(`${ROOT}${path.sep}`)) throw new Error(`${label} escapes the repository`);
  const status = await lstat(target);
  if (!status.isFile() || status.isSymbolicLink()) throw new Error(`${label} is missing or unsafe: ${safe}`);
}
function stringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 64 || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} is invalid`);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return value;
}
function command(value, label, runtime) {
  const rows = stringArray(value, label, { allowEmpty: false });
  if (rows.length > 32 || rows[0] !== runtime) throw new Error(`${label} must use the declared runtime`);
  for (const token of rows) {
    if (/[\0\r\n]/u.test(token) || /[;&|`$<>]/u.test(token)) throw new Error(`${label} contains a shell-control token`);
  }
  return rows;
}

const bytes = await readFile(MANIFEST_PATH);
const manifest = JSON.parse(bytes.toString("utf8"));
exactKeys(manifest, REQUIRED, "manifest");
if (manifest.schema !== "evavo_studio_production_manifest_v2") throw new Error("manifest schema changed");
if (!SAFE_ID.test(manifest.studioId) || !SAFE_REPOSITORY.test(manifest.repository)) throw new Error("manifest identity is invalid");
exactKeys(manifest.runtime, new Set(["language", "version"]), "runtime");
if (manifest.runtime.language !== "node" || typeof manifest.runtime.version !== "string" || !manifest.runtime.version) throw new Error("Node runtime declaration is invalid");
exactKeys(manifest.entrypoints, new Set(["validate", "focused"]), "entrypoints");
command(manifest.entrypoints.validate, "entrypoints.validate", "node");
command(manifest.entrypoints.focused, "entrypoints.focused", "node");
if (!Array.isArray(manifest.contracts) || !manifest.contracts.length || manifest.contracts.length > 32) throw new Error("contracts are invalid");
const ids = new Set(); const paths = new Set();
for (const [index, contract] of manifest.contracts.entries()) {
  exactKeys(contract, CONTRACT_FIELDS, `contracts[${index}]`);
  if (!SAFE_ID.test(contract.id) || ids.has(contract.id)) throw new Error(`contract id is invalid or duplicated: ${contract.id}`);
  if (!ROLES.has(contract.role)) throw new Error(`contract role is invalid: ${contract.role}`);
  safeRelative(contract.path, `contracts[${index}].path`);
  if (paths.has(contract.path)) throw new Error(`contract path is duplicated: ${contract.path}`);
  ids.add(contract.id); paths.add(contract.path);
  await ordinaryFile(contract.path, `contracts[${index}].path`);
}
exactKeys(manifest.handoffs, new Set(["accepts", "produces"]), "handoffs");
stringArray(manifest.handoffs.accepts, "handoffs.accepts");
stringArray(manifest.handoffs.produces, "handoffs.produces");
exactKeys(manifest.automation, AUTOMATION_FIELDS, "automation");
for (const key of ["resumable", "atomicCheckpoints", "boundedRetries", "targetedRepair", "replaySafe"]) if (typeof manifest.automation[key] !== "boolean") throw new Error(`automation.${key} must be Boolean`);
if (!Number.isSafeInteger(manifest.automation.maxAttemptsPerStep) || manifest.automation.maxAttemptsPerStep < 1 || manifest.automation.maxAttemptsPerStep > 8) throw new Error("automation attempt bound is invalid");
if (manifest.automation.networkRequiredDuringValidation !== false || manifest.automation.sourceMutationDuringValidation !== false) throw new Error("validation must remain networkless and non-mutating");
stringArray(manifest.qualityGates, "qualityGates", { allowEmpty: false });
if (manifest.qualityGates.some((item) => !SAFE_ID.test(item))) throw new Error("quality gate identifier is invalid");
exactKeys(manifest.authority, AUTHORITY_FIELDS, "authority");
if (Object.values(manifest.authority).some((value) => value !== false)) throw new Error("manifest grants forbidden automatic authority");
await ordinaryFile(manifest.ciWorkflow, "ciWorkflow");
for (const entrypoint of Object.values(manifest.entrypoints)) {
  for (const token of entrypoint.slice(1)) {
    if (/\.(?:mjs|js|json)$/u.test(token)) await ordinaryFile(token, `entrypoint file ${token}`);
  }
}
const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(JSON.stringify({ ok: true, studioId: manifest.studioId, contracts: manifest.contracts.length, manifestSha256: sha256 }));
