#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_ID = "evavo_godot_media_production_contract_v1";
const PLAN_ID = "evavo_godot_media_production_plan_v1";
const MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_ITEMS = 100_000;

class FoundationMediaPlanError extends Error {
  constructor(code, message) {
    super(`${code}:${message}`);
    this.name = "FoundationMediaPlanError";
    this.code = code;
  }
}

const parseArgs = (argv) => {
  const result = { roles: [], strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strict") {
      result.strict = true;
      continue;
    }
    if (!["--repo", "--contract", "--audit", "--output", "--role"].includes(token)) {
      throw new FoundationMediaPlanError("OPTION_UNSUPPORTED", token);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new FoundationMediaPlanError("OPTION_VALUE_MISSING", token);
    }
    index += 1;
    if (token === "--role") result.roles.push(value);
    else result[token.slice(2)] = value;
  }
  for (const required of ["repo", "contract", "audit", "output"]) {
    if (!result[required]) {
      throw new FoundationMediaPlanError("OPTION_REQUIRED", `--${required}`);
    }
  }
  return result;
};

const isWithin = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveDirectory = (value, label) => {
  const absolute = fs.realpathSync.native(path.resolve(value));
  const stats = fs.lstatSync(absolute);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new FoundationMediaPlanError("DIRECTORY_INVALID", label);
  }
  return absolute;
};

const stableJson = (value, label) => {
  const absolute = fs.realpathSync.native(path.resolve(value));
  const statsBefore = fs.lstatSync(absolute);
  if (!statsBefore.isFile() || statsBefore.isSymbolicLink()) {
    throw new FoundationMediaPlanError("FILE_INVALID", label);
  }
  if (statsBefore.size > MAXIMUM_INPUT_BYTES) {
    throw new FoundationMediaPlanError("FILE_TOO_LARGE", label);
  }
  const bytes = fs.readFileSync(absolute);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new FoundationMediaPlanError("JSON_INVALID", `${label}:${error.message}`);
  }
  const statsAfter = fs.lstatSync(absolute);
  if (
    statsBefore.dev !== statsAfter.dev ||
    statsBefore.ino !== statsAfter.ino ||
    statsBefore.size !== statsAfter.size ||
    statsBefore.mtimeMs !== statsAfter.mtimeMs
  ) {
    throw new FoundationMediaPlanError("FILE_CHANGED_DURING_READ", label);
  }
  return {
    path: absolute,
    value: parsed,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

const normalizeRelative = (value, label) => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new FoundationMediaPlanError("PATH_INVALID", label);
  }
  const normalized = value.replaceAll("\\", "/").normalize("NFC");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new FoundationMediaPlanError("PATH_INVALID", `${label}:${value}`);
  }
  return normalized;
};

const portableKey = (value) => normalizeRelative(value, "portable path").toLocaleLowerCase("en-US");

const stringArray = (value, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new FoundationMediaPlanError("STRING_ARRAY_INVALID", label);
  }
  if (new Set(value).size !== value.length) {
    throw new FoundationMediaPlanError("STRING_ARRAY_DUPLICATE", label);
  }
  return [...value];
};

const contractRoles = (contract, repository) => {
  if (
    contract?.schemaVersion !== "1.0" ||
    contract?.contract !== CONTRACT_ID ||
    contract?.repository !== repository ||
    contract?.engine?.name !== "Godot" ||
    contract?.engine?.minimumVersion !== "4.6.2"
  ) {
    throw new FoundationMediaPlanError("CONTRACT_IDENTITY_INVALID", repository);
  }
  if (
    contract?.batchPolicy?.sourceFilesAreImmutable !== true ||
    contract?.batchPolicy?.outputsAreUnapprovedUntilPromoted !== true ||
    contract?.batchPolicy?.automaticDeletionAllowed !== false ||
    contract?.batchPolicy?.partialBatchPublicationAllowed !== false
  ) {
    throw new FoundationMediaPlanError("CONTRACT_BATCH_POLICY_INVALID", repository);
  }
  if (
    contract?.mcpExecution?.rootRestrictionRequired !== true ||
    contract?.mcpExecution?.arbitraryShellAllowed !== false ||
    contract?.mcpExecution?.arbitraryGitArgumentsAllowed !== false ||
    contract?.mcpExecution?.forcePushAllowed !== false
  ) {
    throw new FoundationMediaPlanError("CONTRACT_MCP_POLICY_INVALID", repository);
  }
  if (!Array.isArray(contract.roles) || contract.roles.length === 0 || contract.roles.length > 100) {
    throw new FoundationMediaPlanError("CONTRACT_ROLES_INVALID", repository);
  }
  const roles = new Map();
  const identities = new Set();
  for (const source of contract.roles) {
    if (!source || typeof source !== "object" || typeof source.id !== "string") {
      throw new FoundationMediaPlanError("CONTRACT_ROLE_INVALID", repository);
    }
    const identity = source.id.toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw new FoundationMediaPlanError("CONTRACT_ROLE_DUPLICATE", source.id);
    }
    identities.add(identity);
    const role = {
      ...source,
      runtimeRoot: normalizeRelative(source.runtimeRoot, `${source.id}.runtimeRoot`),
      auditRoles: stringArray(source.auditRoles, `${source.id}.auditRoles`),
      pathTokens: stringArray(source.pathTokens, `${source.id}.pathTokens`),
      requiredStages: stringArray(source.requiredStages, `${source.id}.requiredStages`),
    };
    roles.set(source.id, role);
  }
  return roles;
};

const auditRows = (audit, repositoryRoot) => {
  if (
    audit?.schemaVersion !== "1.0" ||
    audit?.analysisVersion !== "1.0" ||
    audit?.engine !== "godot" ||
    audit?.truncated === true ||
    !Array.isArray(audit?.artFiles)
  ) {
    throw new FoundationMediaPlanError("AUDIT_AUTHORITY_INVALID", repositoryRoot);
  }
  if (audit.artFiles.length > MAXIMUM_ITEMS) {
    throw new FoundationMediaPlanError("AUDIT_ITEM_LIMIT_EXCEEDED", String(audit.artFiles.length));
  }
  return audit.artFiles;
};

const roleMatches = (row, role) => {
  const auditMatch = role.auditRoles.includes(row.role);
  const lowerPath = `/${String(row.path).replaceAll("\\", "/").toLocaleLowerCase("en-US")}`;
  const tokenMatch = role.pathTokens.some((token) => lowerPath.includes(String(token).toLocaleLowerCase("en-US")));
  return { auditMatch, tokenMatch, matched: auditMatch || tokenMatch };
};

const extensionFor = (runtimeFormat, sourceExtension) => {
  const normalized = String(runtimeFormat).toLocaleLowerCase("en-US");
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("ogg")) return ".ogg";
  if (normalized.includes("wav")) return ".wav";
  return sourceExtension.startsWith(".") ? sourceExtension : `.${sourceExtension}`;
};

const runtimeName = (sourcePath, extension) => {
  const parsed = path.posix.parse(sourcePath);
  const stem = parsed.name
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";
  return `${stem}${extension}`;
};

const itemActions = (role) => {
  const actions = ["retain-immutable-source-identity"];
  if (role.canvas !== null) {
    actions.push("master-to-role-owned-canvas");
    actions.push("verify-nearest-godot-import");
  }
  if (role.alphaPolicy === "require-meaningful-alpha") {
    actions.push("master-and-review-alpha-edges");
  }
  if (role.animation) actions.push("compile-and-review-animation-sequence");
  return actions;
};

const roleBlockers = (row, role) => {
  const blockers = [];
  if (role.canvas !== null && !row.image) blockers.push("image-evidence-required");
  if (
    role.alphaPolicy === "require-meaningful-alpha" &&
    row.image?.alphaUsage !== "meaningful"
  ) {
    blockers.push("meaningful-alpha-required");
  }
  if (role.alphaPolicy === "preserve-authored-opaque" && row.image?.alphaUsage === "fully-transparent") {
    blockers.push("opaque-art-cannot-be-fully-transparent");
  }
  if (role.canvas?.policy === "exact") {
    if (row.image?.width !== role.canvas.width || row.image?.height !== role.canvas.height) {
      blockers.push("exact-canvas-mismatch");
    }
  }
  return [...new Set(blockers)].sort();
};

const writeCreateOnly = (output, value) => {
  const absolute = path.resolve(output);
  const parent = fs.realpathSync.native(path.dirname(absolute));
  if (fs.existsSync(absolute)) {
    throw new FoundationMediaPlanError("OUTPUT_EXISTS", absolute);
  }
  if (!isWithin(absolute, parent)) {
    throw new FoundationMediaPlanError("OUTPUT_PATH_INVALID", absolute);
  }
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(absolute, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, source, { encoding: "utf8" });
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolveDirectory(options.repo, "repository");
  const contractRecord = stableJson(options.contract, "contract");
  if (!isWithin(contractRecord.path, repositoryRoot)) {
    throw new FoundationMediaPlanError("CONTRACT_OUTSIDE_REPOSITORY", contractRecord.path);
  }
  const auditRecord = stableJson(options.audit, "audit");
  const repository = contractRecord.value.repository;
  const roles = contractRoles(contractRecord.value, repository);
  const requestedRoles = options.roles.length === 0 ? [...roles.keys()] : [...new Set(options.roles)];
  for (const roleId of requestedRoles) {
    if (!roles.has(roleId)) throw new FoundationMediaPlanError("ROLE_UNKNOWN", roleId);
  }
  const selectedRoleSet = new Set(requestedRoles);
  const rows = auditRows(auditRecord.value, repositoryRoot);
  const workItems = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const sourcePath = normalizeRelative(row.path, "audit.artFiles.path");
    const identity = portableKey(sourcePath);
    if (seen.has(identity)) {
      throw new FoundationMediaPlanError("AUDIT_PATH_COLLISION", sourcePath);
    }
    seen.add(identity);
    const candidates = [];
    for (const role of roles.values()) {
      if (role.canvas === null || !selectedRoleSet.has(role.id)) continue;
      const match = roleMatches(row, role);
      if (match.matched) candidates.push({ role, ...match });
    }
    if (candidates.length === 0) continue;
    candidates.sort((left, right) => {
      if (left.auditMatch !== right.auditMatch) return left.auditMatch ? -1 : 1;
      return left.role.id.localeCompare(right.role.id, "en-US");
    });
    const strongest = candidates.filter((candidate) => candidate.auditMatch === candidates[0].auditMatch);
    const role = strongest[0].role;
    const blockers = roleBlockers(row, role);
    if (strongest.length > 1) blockers.push("ambiguous-role-classification");
    const findings = Array.isArray(row.findings)
      ? [...new Set(row.findings.filter((value) => typeof value === "string" && value.length > 0))].sort()
      : [];
    const extension = extensionFor(role.runtimeFormat, String(row.extension ?? ".png"));
    const runtimeTargetPath = `${role.runtimeRoot}/${runtimeName(sourcePath, extension)}`;
    workItems.push({
      sourcePath,
      sourceSha256: row.sha256,
      sourceBytes: row.sizeBytes,
      sourceExtension: row.extension,
      role: role.id,
      roleAuthority: candidates[0].auditMatch ? "audit-role" : "path-token",
      runtimeRoot: role.runtimeRoot,
      runtimeFormat: role.runtimeFormat,
      runtimeTargetPath,
      ...(role.canvas === undefined ? {} : { canvas: role.canvas }),
      alphaPolicy: role.alphaPolicy,
      fitPolicy: role.fitPolicy,
      ...(role.godotImport === undefined ? {} : { godotImport: role.godotImport }),
      actions: itemActions(role),
      requiredStages: role.requiredStages,
      blockers: [...new Set(blockers)].sort(),
      reviewRequired: blockers.length > 0 || findings.length > 0,
      auditFindings: findings,
    });
  }
  workItems.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en-US", { sensitivity: "base" }));
  const targetIdentities = new Set();
  for (const item of workItems) {
    const key = portableKey(item.runtimeTargetPath);
    if (targetIdentities.has(key)) item.blockers.push("runtime-target-collision");
    targetIdentities.add(key);
    item.blockers = [...new Set(item.blockers)].sort();
    item.reviewRequired = item.blockers.length > 0 || item.auditFindings.length > 0;
  }
  const roleCounts = {};
  const blockerCounts = {};
  let blocked = 0;
  let reviewRequired = 0;
  for (const item of workItems) {
    roleCounts[item.role] = (roleCounts[item.role] ?? 0) + 1;
    if (item.blockers.length > 0) blocked += 1;
    if (item.reviewRequired) reviewRequired += 1;
    for (const blocker of item.blockers) {
      blockerCounts[blocker] = (blockerCounts[blocker] ?? 0) + 1;
    }
  }
  if (options.strict && (blocked > 0 || reviewRequired > 0)) {
    throw new FoundationMediaPlanError(
      "STRICT_PLAN_NOT_READY",
      `blocked=${blocked},reviewRequired=${reviewRequired}`,
    );
  }
  const contractPath = normalizeRelative(path.relative(repositoryRoot, contractRecord.path), "contractPath");
  const plan = {
    schemaVersion: "1.0",
    contract: PLAN_ID,
    repository,
    contractPath,
    contractSha256: contractRecord.sha256,
    auditRoot: String(auditRecord.value.root ?? repositoryRoot),
    auditSha256: auditRecord.sha256,
    selectedRoles: requestedRoles.filter((roleId) => roles.get(roleId).canvas !== null).sort(),
    summary: {
      workItems: workItems.length,
      reviewRequired,
      blocked,
      roleCounts: Object.fromEntries(Object.entries(roleCounts).sort()),
      blockerCounts: Object.fromEntries(Object.entries(blockerCounts).sort()),
    },
    workItems,
    publicationAuthority: false,
    deletionAuthority: false,
    humanCreativeApprovalRequired: true,
  };
  writeCreateOnly(options.output, plan);
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    output: path.resolve(options.output),
    workItems: workItems.length,
    blocked,
    reviewRequired,
    contractSha256: contractRecord.sha256,
    auditSha256: auditRecord.sha256,
    mutationPerformed: false,
    publicationAuthority: false,
  }, null, 2)}\n`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: "failed", error: message })}\n`);
  process.exitCode = 2;
}
