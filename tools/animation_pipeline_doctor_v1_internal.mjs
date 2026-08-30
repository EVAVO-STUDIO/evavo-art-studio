#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ANIMATION_PIPELINE_DOCTOR_VERSION = "1.0.0";
export const ANIMATION_PIPELINE_DOCTOR_SCHEMA = "evavo.animation-pipeline-doctor-report.v1";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LOCK_FILES = 1024;
const SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/;
const ROLES = Object.freeze(["art-studio", "cel-animation-studio", "video-studio", "game-runtime"]);
const ROOT_KEYS = Object.freeze({
  "art-studio": "artStudioRoot",
  "cel-animation-studio": "celAnimationStudioRoot",
  "video-studio": "videoStudioRoot",
  "game-runtime": "gameRuntimeRoot",
});
const PIPELINE_SERVER = "evavo-animation-pipeline-v1";
const PIPELINE_ENTRY = "tools/animation_pipeline_control_plane_v1_1_mcp.mjs";
const FOCUSED_CONFIG = ".mcp.animation-pipeline-v1.json";
const DANGEROUS_FLAGS = Object.freeze([
  "EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED",
  "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL_ENABLED",
  "EVAVO_ANIMATION_ARTIFACT_PROMOTION_ENABLED",
  "EVAVO_ANIMATION_TARGET_REPOSITORY_MUTATION_ENABLED",
  "EVAVO_ANIMATION_GIT_COMMIT_ENABLED",
  "EVAVO_ANIMATION_GIT_PUSH_ENABLED",
  "EVAVO_ANIMATION_RUNTIME_ACTIVATION_ENABLED",
  "EVAVO_ANIMATION_PUBLICATION_ENABLED",
]);
const AUTHORITY = Object.freeze({
  fileRead: true,
  fileWrite: false,
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});
const REQUIRED = Object.freeze({
  "art-studio": Object.freeze([
    "tools/animation_pipeline_control_plane_v1_mcp.mjs",
    PIPELINE_ENTRY,
    "contracts/animation-pipeline-control-plane-v1.lock.json",
    "tools/animation_production_profile_canonical_v1.mjs",
    "tools/animation_production_review_receipt_canonical_v1.mjs",
    "tools/animation_sequence_delivery_canonical_v1.mjs",
    "tools/animation_frame_work_ledger_v1.mjs",
    ".mcp.json",
    FOCUSED_CONFIG,
  ]),
  "cel-animation-studio": Object.freeze([
    "tools/animation_pipeline_control_plane_v1_mcp.mjs",
    PIPELINE_ENTRY,
    "contracts/animation-pipeline-control-plane-v1.lock.json",
    "tools/animation_production_profile_review_canonical_v1.mjs",
    "tools/animation_production_review_receipt_canonical_v1.mjs",
    "tools/animation_sequence_delivery_canonical_v1.mjs",
    "tools/animation_frame_work_ledger_v1.mjs",
    ".mcp.json",
    FOCUSED_CONFIG,
  ]),
  "video-studio": Object.freeze([
    "tools/animation_pipeline_control_plane_v1_mcp.mjs",
    PIPELINE_ENTRY,
    "contracts/animation-pipeline-control-plane-v1.lock.json",
    "tools/animation_sequence_delivery_canonical_v1.mjs",
    ".mcp.json",
    FOCUSED_CONFIG,
  ]),
  "game-runtime": Object.freeze([]),
});
const SHARED_GROUPS = Object.freeze([
  Object.freeze({ id: "pipeline-control-plane-v1", roles: Object.freeze(["art-studio", "cel-animation-studio", "video-studio"]), paths: Object.freeze(["tools/animation_pipeline_control_plane_v1_mcp.mjs", PIPELINE_ENTRY, "contracts/animation-pipeline-control-plane-v1.lock.json"]) }),
  Object.freeze({ id: "accepted-sequence-delivery", roles: Object.freeze(["art-studio", "cel-animation-studio", "video-studio"]), paths: Object.freeze(["tools/animation_sequence_delivery_canonical_v1.mjs"]) }),
  Object.freeze({ id: "independent-review-receipt", roles: Object.freeze(["art-studio", "cel-animation-studio"]), paths: Object.freeze(["tools/animation_production_review_receipt_canonical_v1.mjs"]) }),
  Object.freeze({ id: "frame-work-ledger", roles: Object.freeze(["art-studio", "cel-animation-studio"]), paths: Object.freeze(["tools/animation_frame_work_ledger_v1.mjs"]), optionalPaths: Object.freeze(["tools/animation_frame_work_ledger_v1_internal.mjs", "contracts/animation-frame-work-ledger-v1.schema.json", "contracts/animation-frame-work-ledger-v1.lock.json"]) }),
]);

function fail(code, detail) { throw new Error(detail ? `${code}:${detail}` : code); }
function object(value, code) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(code); return value; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function animationPipelineDoctorSha256(value) { return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`; }
function rawSha256(value) { return createHash("sha256").update(value).digest("hex"); }
function normalizeDigest(value) { if (typeof value !== "string" || !SHA256.test(value)) return null; return value.startsWith("sha256:") ? value.slice(7) : value; }
function safeRelativePath(value, code) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\0") || value.split(/[\\/]+/u).some((part) => part === "..")) fail(code, String(value));
  return value.replaceAll("\\", "/");
}
function withinRoot(root, candidate) { const rel = relative(root, candidate); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); }
async function regularFile(root, relativePath, { optional = false } = {}) {
  const safe = safeRelativePath(relativePath, "ANIMATION_PIPELINE_DOCTOR_PATH_INVALID");
  const absolute = resolve(root, safe);
  if (!withinRoot(root, absolute)) fail("ANIMATION_PIPELINE_DOCTOR_PATH_OUTSIDE_ROOT", safe);
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) return { ok: false, code: "SYMLINK_FORBIDDEN", path: safe };
    if (!stat.isFile()) return { ok: false, code: "REGULAR_FILE_REQUIRED", path: safe };
    if (stat.size > MAX_FILE_BYTES) return { ok: false, code: "FILE_TOO_LARGE", path: safe, bytes: stat.size };
    const bytes = await readFile(absolute);
    return { ok: true, path: safe, absolute, bytes, sha256: rawSha256(bytes), size: stat.size };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, optional, code: "FILE_MISSING", path: safe };
    throw error;
  }
}
async function jsonFile(root, path, options) {
  const file = await regularFile(root, path, options);
  if (!file.ok) return file;
  try { return { ...file, value: JSON.parse(file.bytes.toString("utf8")) }; }
  catch { return { ...file, ok: false, code: "JSON_INVALID" }; }
}
function finding(severity, code, role, path, message, remediation) { return { severity, code, role, ...(path ? { path } : {}), message, remediation }; }
function sortFindings(items) {
  const rank = { blocking: 0, warning: 1, information: 2 };
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity] || a.role.localeCompare(b.role) || (a.path ?? "").localeCompare(b.path ?? "") || a.code.localeCompare(b.code));
}
async function validateRoot(role, submittedRoot) {
  if (!ROLES.includes(role)) fail("ANIMATION_PIPELINE_DOCTOR_ROLE_INVALID", role);
  if (typeof submittedRoot !== "string" || !submittedRoot.trim()) fail("ANIMATION_PIPELINE_DOCTOR_ROOT_INVALID", role);
  const root = resolve(submittedRoot);
  let stat;
  try { stat = await lstat(root); }
  catch (error) {
    if (error?.code === "ENOENT") return { role, root, available: false, findings: [finding("blocking", "REPOSITORY_ROOT_MISSING", role, null, `Configured ${role} repository root does not exist.`, "Restore or correct the local repository root before production.")] };
    throw error;
  }
  const findings = [];
  if (stat.isSymbolicLink()) findings.push(finding("blocking", "REPOSITORY_ROOT_SYMLINK_FORBIDDEN", role, null, "Repository roots must not be symbolic links.", "Use the canonical physical checkout path."));
  if (!stat.isDirectory()) findings.push(finding("blocking", "REPOSITORY_ROOT_DIRECTORY_REQUIRED", role, null, "Configured repository root is not a directory.", "Point the doctor at a repository directory."));
  let physicalRoot = root;
  try { physicalRoot = await realpath(root); } catch {}
  return { role, root, physicalRoot, available: findings.length === 0, findings };
}
function registrationFinding(role, path, code, message, remediation) { return finding("blocking", code, role, path, message, remediation); }
function validateMcpRegistration(role, path, document) {
  const findings = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) return [registrationFinding(role, path, "MCP_CONFIG_OBJECT_REQUIRED", "MCP configuration must be a JSON object.", "Restore the governed MCP configuration.")];
  const server = document.mcpServers?.[PIPELINE_SERVER];
  if (!server || typeof server !== "object" || Array.isArray(server)) return [registrationFinding(role, path, "PIPELINE_MCP_REGISTRATION_MISSING", `MCP server ${PIPELINE_SERVER} is not registered.`, "Register the hardened animation pipeline control plane.")];
  if (server.command !== "node") findings.push(registrationFinding(role, path, "PIPELINE_MCP_COMMAND_INVALID", "Animation pipeline MCP command must be node.", "Restore the canonical Node entry point."));
  if (!Array.isArray(server.args) || server.args.length !== 1 || server.args[0] !== PIPELINE_ENTRY) findings.push(registrationFinding(role, path, "PIPELINE_MCP_ENTRY_INVALID", `Animation pipeline MCP must enter through ${PIPELINE_ENTRY}.`, "Replace the legacy or divergent MCP entry point."));
  if (server.env?.EVAVO_ANIMATION_PIPELINE_ROLE !== role) findings.push(registrationFinding(role, path, "PIPELINE_MCP_ROLE_INVALID", "Animation pipeline MCP role does not match the repository.", `Set EVAVO_ANIMATION_PIPELINE_ROLE to ${role}.`));
  for (const flag of DANGEROUS_FLAGS) if (server.env?.[flag] !== "disabled") findings.push(registrationFinding(role, path, "PIPELINE_MCP_AUTHORITY_NOT_DISABLED", `${flag} must be explicitly disabled in checked-in configuration.`, `Set ${flag} to disabled; grant side-effect authority through a separate governed execution surface.`));
  return findings;
}
async function inspectRegistration(info) {
  const findings = [];
  for (const path of [".mcp.json", FOCUSED_CONFIG]) {
    const document = await jsonFile(info.root, path);
    if (!document.ok) findings.push(registrationFinding(info.role, path, document.code, `${path} is missing, unreadable or invalid.`, "Restore the governed animation MCP registration."));
    else findings.push(...validateMcpRegistration(info.role, path, document.value));
  }
  return findings;
}
async function listLockFiles(root) {
  try {
    const entries = await readdir(resolve(root, "contracts"), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.startsWith("animation") && entry.name.endsWith(".lock.json")).slice(0, MAX_LOCK_FILES).map((entry) => `contracts/${entry.name}`).sort();
  } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}
function lockTargetPairs(lock) {
  const pairs = [];
  for (const [key, digest] of Object.entries(lock)) {
    if (!key.endsWith("Sha256") || typeof digest !== "string") continue;
    const pathKey = `${key.slice(0, -"Sha256".length)}Path`;
    if (typeof lock[pathKey] === "string") pairs.push({ digestKey: key, pathKey, digest, path: lock[pathKey] });
  }
  if (typeof lock.sha256 === "string") {
    const pathKey = ["implementationPath", "schemaPath", "contractPath"].find((key) => typeof lock[key] === "string");
    if (pathKey) pairs.push({ digestKey: "sha256", pathKey, digest: lock.sha256, path: lock[pathKey] });
  }
  return pairs;
}
async function inspectLocks(info) {
  const findings = [];
  const lockPaths = await listLockFiles(info.root);
  if (lockPaths.length === 0 && info.role !== "game-runtime") return [finding("blocking", "ANIMATION_LOCKS_MISSING", info.role, "contracts", "No animation contract lock files were found.", "Restore the repository's animation contract locks.")];
  for (const lockPath of lockPaths) {
    const lockFile = await jsonFile(info.root, lockPath);
    if (!lockFile.ok) { findings.push(finding("blocking", `ANIMATION_LOCK_${lockFile.code}`, info.role, lockPath, "Animation lock file is missing, unreadable or invalid JSON.", "Regenerate the lock from the authoritative implementation or schema.")); continue; }
    const pairs = lockTargetPairs(lockFile.value);
    if (pairs.length === 0) { findings.push(finding("warning", "ANIMATION_LOCK_TARGET_UNRECOGNISED", info.role, lockPath, "Animation lock has no recognised path-and-SHA-256 pair.", "Document the lock format or add a standard *Path/*Sha256 binding.")); continue; }
    for (const pair of pairs) {
      let target;
      try { target = await regularFile(info.root, pair.path); }
      catch { findings.push(finding("blocking", "ANIMATION_LOCK_TARGET_PATH_INVALID", info.role, lockPath, `${pair.pathKey} contains an unsafe path.`, "Use a repository-relative, traversal-free target path.")); continue; }
      if (!target.ok) { findings.push(finding("blocking", `ANIMATION_LOCK_TARGET_${target.code}`, info.role, pair.path, `Lock target for ${lockPath} is missing or unsafe.`, "Restore the exact locked target file.")); continue; }
      const expected = normalizeDigest(pair.digest);
      if (!expected) findings.push(finding("blocking", "ANIMATION_LOCK_DIGEST_INVALID", info.role, lockPath, `${pair.digestKey} is not a lowercase SHA-256 digest.`, "Regenerate the lock with a lowercase SHA-256 digest."));
      else if (expected !== target.sha256) findings.push(finding("blocking", "ANIMATION_LOCK_DIGEST_MISMATCH", info.role, lockPath, `${pair.digestKey} does not match ${pair.path}.`, "Reconcile the implementation or schema with the authoritative lock; do not silently bless drift."));
    }
  }
  return findings;
}
async function inspectRequiredFiles(info) {
  const findings = [];
  for (const path of REQUIRED[info.role] ?? []) {
    const file = await regularFile(info.root, path);
    if (!file.ok) findings.push(finding("blocking", `REQUIRED_${file.code}`, info.role, path, "Required animation pipeline surface is missing or unsafe.", "Restore the canonical file from the owning studio and rerun the doctor."));
  }
  return findings;
}
async function compareSharedFiles(rootByRole) {
  const findings = [];
  const comparisons = [];
  for (const group of SHARED_GROUPS) {
    const participating = group.roles.filter((role) => rootByRole.has(role));
    if (participating.length < 2) continue;
    for (const path of [...group.paths, ...(group.optionalPaths ?? [])]) {
      const optional = (group.optionalPaths ?? []).includes(path);
      const records = [];
      for (const role of participating) records.push({ role, file: await regularFile(rootByRole.get(role).root, path, { optional }) });
      const existing = records.filter(({ file }) => file.ok);
      const missing = records.filter(({ file }) => !file.ok && !file.optional);
      const optionalMissing = records.filter(({ file }) => file.optional);
      if (missing.length > 0 || (optionalMissing.length > 0 && existing.length > 0)) for (const { role } of [...missing, ...optionalMissing]) findings.push(finding("blocking", "SHARED_IMPLEMENTATION_PARTICIPANT_MISSING", role, path, `${group.id} exists in another participating studio but is missing here.`, "Restore the byte-identical shared file from the authoritative participating studio."));
      if (existing.length < 2) continue;
      const digestSet = new Set(existing.map(({ file }) => file.sha256));
      comparisons.push({ group: group.id, path, roles: existing.map(({ role }) => role), byteIdentical: digestSet.size === 1, sha256ByRole: Object.fromEntries(existing.map(({ role, file }) => [role, `sha256:${file.sha256}`])) });
      if (digestSet.size > 1) for (const { role } of existing) findings.push(finding("blocking", "SHARED_IMPLEMENTATION_DRIFT", role, path, `${group.id} is not byte-identical across participating studios.`, "Select the authoritative implementation deliberately, propagate it unchanged, and update its lock only after validation."));
    }
  }
  return { findings, comparisons };
}
function rootsFromInput(input) {
  const submitted = input.repositoryRoots && typeof input.repositoryRoots === "object" ? input.repositoryRoots : {};
  const result = new Map();
  const currentRole = input.role ?? process.env.EVAVO_ANIMATION_PIPELINE_ROLE;
  if (currentRole) result.set(currentRole, input.root ?? process.cwd());
  for (const role of ROLES) { const key = ROOT_KEYS[role]; if (typeof submitted[key] === "string" && submitted[key].trim()) result.set(role, submitted[key]); }
  if (result.size === 0) fail("ANIMATION_PIPELINE_DOCTOR_ROOTS_REQUIRED", "Provide role/root or repositoryRoots.");
  return result;
}
export async function inspectAnimationPipelineV1(submitted = {}, now = new Date()) {
  const input = object(submitted, "ANIMATION_PIPELINE_DOCTOR_INPUT_INVALID");
  const timestamp = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(timestamp.valueOf())) fail("ANIMATION_PIPELINE_DOCTOR_TIME_INVALID");
  const requested = rootsFromInput(input);
  const roots = [];
  const rootByRole = new Map();
  let findings = [];
  for (const [role, root] of requested) {
    const info = await validateRoot(role, root);
    roots.push({ role, root: info.root, ...(info.physicalRoot ? { physicalRoot: info.physicalRoot } : {}), available: info.available });
    findings.push(...info.findings);
    if (!info.available) continue;
    rootByRole.set(role, info);
    findings.push(...await inspectRequiredFiles(info));
    if (role !== "game-runtime") findings.push(...await inspectRegistration(info));
    findings.push(...await inspectLocks(info));
  }
  const shared = await compareSharedFiles(rootByRole);
  findings.push(...shared.findings);
  findings = sortFindings(findings);
  const summary = { blocking: findings.filter((item) => item.severity === "blocking").length, warning: findings.filter((item) => item.severity === "warning").length, information: findings.filter((item) => item.severity === "information").length };
  const status = summary.blocking > 0 ? "blocked" : summary.warning > 0 ? "degraded" : "ready";
  const body = { schema: ANIMATION_PIPELINE_DOCTOR_SCHEMA, version: ANIMATION_PIPELINE_DOCTOR_VERSION, status, roots: roots.sort((a, b) => a.role.localeCompare(b.role)), summary, sharedComparisons: shared.comparisons.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path)), findings, authority: AUTHORITY };
  return { ...body, reportDigest: animationPipelineDoctorSha256(body), generatedAt: timestamp.toISOString() };
}
export function planAnimationPipelineRepairsV1(report) {
  object(report, "ANIMATION_PIPELINE_DOCTOR_REPORT_INVALID");
  if (report.schema !== ANIMATION_PIPELINE_DOCTOR_SCHEMA || report.version !== ANIMATION_PIPELINE_DOCTOR_VERSION || typeof report.reportDigest !== "string") fail("ANIMATION_PIPELINE_DOCTOR_REPORT_PROTOCOL_INVALID");
  const { reportDigest, generatedAt: _generatedAt, ...body } = report;
  if (animationPipelineDoctorSha256(body) !== reportDigest) fail("ANIMATION_PIPELINE_DOCTOR_REPORT_DIGEST_MISMATCH");
  const repairs = report.findings.map((entry, index) => ({ sequence: index + 1, ownerRole: entry.role, severity: entry.severity, action: entry.code.includes("MISSING") ? "restore-missing-surface" : entry.code.includes("DRIFT") || entry.code.includes("MISMATCH") ? "reconcile-authoritative-bytes" : entry.code.includes("MCP") ? "repair-mcp-registration" : entry.code.includes("LOCK") ? "repair-contract-lock" : "review-diagnostic-finding", ...(entry.path ? { path: entry.path } : {}), findingCode: entry.code, instruction: entry.remediation, automaticMutationAllowed: false }));
  const value = { schema: "evavo.animation-pipeline-doctor-repair-plan.v1", version: ANIMATION_PIPELINE_DOCTOR_VERSION, sourceReportDigest: report.reportDigest, status: repairs.some((entry) => entry.severity === "blocking") ? "repair-required" : repairs.length > 0 ? "review-required" : "no-repair-required", repairs, authority: { ...AUTHORITY, fileRead: false } };
  return { ...value, planDigest: animationPipelineDoctorSha256(value) };
}
export async function verifyAnimationPipelineV1(input = {}) {
  const report = await inspectAnimationPipelineV1(input);
  if (report.status === "blocked") fail("ANIMATION_PIPELINE_DOCTOR_BLOCKED", `${report.summary.blocking} blocking finding(s); report=${report.reportDigest}`);
  return report;
}
async function readInput(path) {
  if (!path) return {};
  const safe = safeRelativePath(path, "ANIMATION_PIPELINE_DOCTOR_INPUT_PATH_INVALID");
  const absolute = resolve(process.cwd(), safe);
  if (!withinRoot(process.cwd(), absolute)) fail("ANIMATION_PIPELINE_DOCTOR_INPUT_PATH_OUTSIDE_WORKSPACE");
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) fail("ANIMATION_PIPELINE_DOCTOR_INPUT_FILE_INVALID");
  return JSON.parse(await readFile(absolute, "utf8"));
}
async function cli() {
  const [command = "inspect", inputPath] = process.argv.slice(2);
  if (!new Set(["inspect", "verify", "plan"]).has(command)) fail("ANIMATION_PIPELINE_DOCTOR_USAGE", "node tools/animation_pipeline_doctor_v1_internal.mjs <inspect|verify|plan> [input.json]");
  const input = await readInput(inputPath);
  const report = command === "verify" ? await verifyAnimationPipelineV1(input) : await inspectAnimationPipelineV1(input);
  process.stdout.write(`${JSON.stringify(command === "plan" ? planAnimationPipelineRepairsV1(report) : report, null, 2)}\n`);
}
if ((process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") === import.meta.url) cli().catch((error) => { process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY })}\n`); process.exitCode = 1; });
