#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_ID = "evavo_godot_media_production_contract_v1";
const PLAN_ID = "evavo_godot_media_production_plan_v1";
const MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_ITEMS = 100_000;
const MAXIMUM_ROLES = 100;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ROLE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const EXTENSION = /^\.[a-z0-9][a-z0-9.+-]{0,31}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED_STEMS = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);
const ALPHA_USAGES = new Set([
  "none",
  "opaque-channel",
  "meaningful",
  "fully-transparent",
  "unknown",
]);
const IMAGE_ALPHA_POLICIES = new Set([
  "require-meaningful-alpha",
  "preserve-authored-opaque",
  "preserve-authored-black-stage",
  "review-required",
]);

class FoundationMediaPlanError extends Error {
  constructor(code, message) {
    super(`${code}:${message}`);
    this.name = "FoundationMediaPlanError";
    this.code = code;
  }
}

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (code, message) => {
  throw new FoundationMediaPlanError(code, message);
};

const parseArgs = (argv) => {
  const result = { roles: [], strict: false };
  const seenScalar = new Set();
  let strictSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strict") {
      if (strictSeen) fail("OPTION_DUPLICATE", token);
      strictSeen = true;
      result.strict = true;
      continue;
    }
    if (!["--repo", "--contract", "--audit", "--output", "--role"].includes(token)) {
      fail("OPTION_UNSUPPORTED", String(token));
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("OPTION_VALUE_MISSING", token);
    }
    index += 1;
    if (token === "--role") {
      result.roles.push(value);
      continue;
    }
    if (seenScalar.has(token)) fail("OPTION_DUPLICATE", token);
    seenScalar.add(token);
    result[token.slice(2)] = value;
  }
  for (const required of ["repo", "contract", "audit", "output"]) {
    if (!result[required]) fail("OPTION_REQUIRED", `--${required}`);
  }
  return result;
};

const isWithin = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

const samePath = (left, right) => path.relative(left, right) === "";

const assertNoSymlinkSegments = (
  value,
  label,
  { allowMissingLeaf = false } = {},
) => {
  const absolute = path.resolve(value);
  const parsed = path.parse(absolute);
  const parts = absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const finalPart = index === parts.length - 1;
    if (allowMissingLeaf && finalPart && !fs.existsSync(current)) break;
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      fail(
        "PATH_COMPONENT_MISSING",
        `${label}:${current}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (stats.isSymbolicLink()) {
      fail("SYMLINK_PATH_FORBIDDEN", `${label}:${current}`);
    }
  }
  return absolute;
};

const resolveDirectory = (value, label) => {
  const unresolved = assertNoSymlinkSegments(value, label);
  const absolute = fs.realpathSync.native(unresolved);
  const stats = fs.lstatSync(absolute);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail("DIRECTORY_INVALID", label);
  }
  return absolute;
};

const sameIdentity = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

const stableJson = (value, label) => {
  const unresolved = assertNoSymlinkSegments(value, label);
  const absolute = fs.realpathSync.native(unresolved);
  const statsBefore = fs.lstatSync(absolute);
  if (!statsBefore.isFile() || statsBefore.isSymbolicLink()) {
    fail("FILE_INVALID", label);
  }
  if (statsBefore.size > MAXIMUM_INPUT_BYTES) {
    fail("FILE_TOO_LARGE", label);
  }
  const descriptor = fs.openSync(absolute, "r");
  let bytes;
  try {
    const opened = fs.fstatSync(descriptor);
    if (!sameIdentity(statsBefore, opened)) {
      fail("FILE_CHANGED_BEFORE_OPEN", label);
    }
    bytes = fs.readFileSync(descriptor);
    const openedAfter = fs.fstatSync(descriptor);
    if (!sameIdentity(opened, openedAfter)) {
      fail("FILE_CHANGED_DURING_READ", label);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail(
      "JSON_INVALID",
      `${label}:${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const statsAfter = fs.lstatSync(absolute);
  if (!sameIdentity(statsBefore, statsAfter)) {
    fail("FILE_CHANGED_DURING_READ", label);
  }
  return {
    path: absolute,
    value: parsed,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

const normalizeRelative = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    CONTROL_CHARACTERS.test(value)
  ) {
    fail("PATH_INVALID", label);
  }
  const normalized = value.replaceAll("\\", "/").normalize("NFC");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized
      .split("/")
      .some((part) => part === ".." || part === "." || part === "")
  ) {
    fail("PATH_INVALID", `${label}:${value}`);
  }
  return normalized;
};

const portableKey = (value) =>
  normalizeRelative(value, "portable path").toLocaleLowerCase("en-US");

const nonEmptyString = (value, label, maximum = 512) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    CONTROL_CHARACTERS.test(value)
  ) {
    fail("STRING_INVALID", label);
  }
  return value;
};

const stringArray = (
  value,
  label,
  { allowEmpty = false, caseInsensitive = false, maximumItems = 10_000 } = {},
) => {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximumItems
  ) {
    fail("STRING_ARRAY_INVALID", label);
  }
  const output = value.map((item, index) =>
    nonEmptyString(item, `${label}[${index}]`, 2_048),
  );
  const identities = output.map((item) =>
    caseInsensitive ? item.toLocaleLowerCase("en-US") : item,
  );
  if (new Set(identities).size !== identities.length) {
    fail("STRING_ARRAY_DUPLICATE", label);
  }
  return output;
};

const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("POSITIVE_INTEGER_INVALID", label);
  }
  return value;
};

const nonNegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("NON_NEGATIVE_INTEGER_INVALID", label);
  }
  return value;
};

const normalizePathToken = (value, label) => {
  const token = nonEmptyString(value, label, 512)
    .replaceAll("\\", "/")
    .normalize("NFC");
  if (token.split("/").some((part) => part === ".." || part === ".")) {
    fail("PATH_TOKEN_INVALID", `${label}:${value}`);
  }
  return token;
};

const runtimeRootAllowed = (runtimeRoot, roots) =>
  roots.some(
    (root) =>
      runtimeRoot === root || runtimeRoot.startsWith(`${root}/`),
  );

const contractRoles = (contract, repository) => {
  if (
    !isRecord(contract) ||
    contract.schemaVersion !== "1.0" ||
    contract.contract !== CONTRACT_ID ||
    contract.repository !== repository ||
    !REPOSITORY_ID.test(repository) ||
    contract.engine?.name !== "Godot" ||
    contract.engine?.minimumVersion !== "4.6.2"
  ) {
    fail("CONTRACT_IDENTITY_INVALID", String(repository));
  }
  if (
    contract.batchPolicy?.sourceFilesAreImmutable !== true ||
    contract.batchPolicy?.outputsAreUnapprovedUntilPromoted !== true ||
    contract.batchPolicy?.automaticDeletionAllowed !== false ||
    contract.batchPolicy?.partialBatchPublicationAllowed !== false
  ) {
    fail("CONTRACT_BATCH_POLICY_INVALID", repository);
  }
  if (
    contract.mcpExecution?.rootRestrictionRequired !== true ||
    contract.mcpExecution?.arbitraryShellAllowed !== false ||
    contract.mcpExecution?.arbitraryGitArgumentsAllowed !== false ||
    contract.mcpExecution?.forcePushAllowed !== false
  ) {
    fail("CONTRACT_MCP_POLICY_INVALID", repository);
  }
  if (
    !Array.isArray(contract.roles) ||
    contract.roles.length === 0 ||
    contract.roles.length > MAXIMUM_ROLES
  ) {
    fail("CONTRACT_ROLES_INVALID", repository);
  }
  const runtimeRoots = Array.isArray(contract.roots?.runtime)
    ? stringArray(contract.roots.runtime, "contract.roots.runtime", {
        caseInsensitive: true,
        maximumItems: 1_000,
      }).map((entry, index) =>
        normalizeRelative(entry, `contract.roots.runtime[${index}]`),
      )
    : [];
  const roles = new Map();
  const identities = new Set();
  for (const source of contract.roles) {
    if (!isRecord(source) || typeof source.id !== "string" || !ROLE_ID.test(source.id)) {
      fail("CONTRACT_ROLE_INVALID", repository);
    }
    const identity = source.id.toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      fail("CONTRACT_ROLE_DUPLICATE", source.id);
    }
    identities.add(identity);
    const runtimeRoot = normalizeRelative(
      source.runtimeRoot,
      `${source.id}.runtimeRoot`,
    );
    if (
      runtimeRoots.length > 0 &&
      !runtimeRootAllowed(runtimeRoot, runtimeRoots)
    ) {
      fail("CONTRACT_RUNTIME_ROOT_UNDECLARED", `${source.id}:${runtimeRoot}`);
    }
    const auditRoles = stringArray(source.auditRoles, `${source.id}.auditRoles`, {
      caseInsensitive: true,
      maximumItems: 100,
    });
    const pathTokens = stringArray(source.pathTokens, `${source.id}.pathTokens`, {
      caseInsensitive: true,
      maximumItems: 100,
    }).map((entry, index) =>
      normalizePathToken(entry, `${source.id}.pathTokens[${index}]`),
    );
    const requiredStages = stringArray(
      source.requiredStages,
      `${source.id}.requiredStages`,
      { caseInsensitive: true, maximumItems: 1_000 },
    );
    if (source.canvas === null) {
      if (
        source.alphaPolicy !== "not-applicable" ||
        source.fitPolicy !== "not-applicable"
      ) {
        fail("CONTRACT_NON_IMAGE_ROLE_INVALID", source.id);
      }
    } else {
      if (!isRecord(source.canvas)) {
        fail("CONTRACT_ROLE_CANVAS_INVALID", source.id);
      }
      const policy = nonEmptyString(
        source.canvas.policy,
        `${source.id}.canvas.policy`,
        64,
      );
      if (policy === "exact") {
        positiveInteger(source.canvas.width, `${source.id}.canvas.width`);
        positiveInteger(source.canvas.height, `${source.id}.canvas.height`);
      }
      if (!IMAGE_ALPHA_POLICIES.has(source.alphaPolicy)) {
        fail("CONTRACT_ALPHA_POLICY_INVALID", source.id);
      }
      if (
        source.fitPolicy === "not-applicable" ||
        typeof source.fitPolicy !== "string" ||
        source.fitPolicy.length === 0
      ) {
        fail("CONTRACT_FIT_POLICY_INVALID", source.id);
      }
      if (!isRecord(source.godotImport)) {
        fail("CONTRACT_GODOT_IMPORT_INVALID", source.id);
      }
    }
    nonEmptyString(source.runtimeFormat, `${source.id}.runtimeFormat`, 128);
    const role = {
      ...source,
      runtimeRoot,
      auditRoles,
      auditRoleIdentities: new Set(
        auditRoles.map((entry) => entry.toLocaleLowerCase("en-US")),
      ),
      pathTokens,
      requiredStages,
    };
    roles.set(source.id, role);
  }
  return roles;
};

const validateImageEvidence = (image, label) => {
  if (!isRecord(image)) fail("AUDIT_IMAGE_EVIDENCE_INVALID", label);
  nonEmptyString(image.format, `${label}.format`, 64);
  if (image.width !== undefined) positiveInteger(image.width, `${label}.width`);
  if (image.height !== undefined) positiveInteger(image.height, `${label}.height`);
  if (typeof image.hasAlphaChannel !== "boolean") {
    fail("AUDIT_IMAGE_EVIDENCE_INVALID", `${label}.hasAlphaChannel`);
  }
  if (!ALPHA_USAGES.has(image.alphaUsage)) {
    fail("AUDIT_IMAGE_EVIDENCE_INVALID", `${label}.alphaUsage`);
  }
  if (typeof image.probeComplete !== "boolean") {
    fail("AUDIT_IMAGE_EVIDENCE_INVALID", `${label}.probeComplete`);
  }
  stringArray(image.warnings, `${label}.warnings`, {
    allowEmpty: true,
    maximumItems: 10_000,
  });
};

const validateAuditRow = (row, index) => {
  const label = `audit.artFiles[${index}]`;
  if (!isRecord(row)) fail("AUDIT_ROW_INVALID", label);
  const sourcePath = normalizeRelative(row.path, `${label}.path`);
  const extension = nonEmptyString(row.extension, `${label}.extension`, 32)
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
  if (!EXTENSION.test(extension)) {
    fail("AUDIT_ROW_EXTENSION_INVALID", `${label}:${extension}`);
  }
  if (path.posix.extname(sourcePath).toLocaleLowerCase("en-US") !== extension) {
    fail("AUDIT_ROW_EXTENSION_MISMATCH", `${sourcePath}:${extension}`);
  }
  if (typeof row.sha256 !== "string" || !SHA256.test(row.sha256)) {
    fail("AUDIT_ROW_SHA256_INVALID", sourcePath);
  }
  nonNegativeInteger(row.sizeBytes, `${label}.sizeBytes`);
  nonEmptyString(row.category, `${label}.category`, 64);
  nonEmptyString(row.role, `${label}.role`, 128);
  const findings = stringArray(row.findings, `${label}.findings`, {
    allowEmpty: true,
    maximumItems: 10_000,
  });
  if (row.category === "image" || row.image !== undefined) {
    validateImageEvidence(row.image, `${label}.image`);
  }
  return {
    ...row,
    path: sourcePath,
    extension,
    findings,
  };
};

const auditRows = (audit, repositoryRoot) => {
  if (
    !isRecord(audit) ||
    audit.schemaVersion !== "1.0" ||
    audit.analysisVersion !== "1.0" ||
    audit.engine !== "godot" ||
    audit.truncated !== false ||
    !Array.isArray(audit.artFiles)
  ) {
    fail("AUDIT_AUTHORITY_INVALID", repositoryRoot);
  }
  if (audit.artFiles.length > MAXIMUM_ITEMS) {
    fail("AUDIT_ITEM_LIMIT_EXCEEDED", String(audit.artFiles.length));
  }
  const auditRoot = resolveDirectory(audit.root, "audit.root");
  if (!samePath(auditRoot, repositoryRoot)) {
    fail("AUDIT_ROOT_MISMATCH", `${auditRoot}:${repositoryRoot}`);
  }
  return {
    auditRoot,
    rows: audit.artFiles.map(validateAuditRow),
  };
};

const roleMatches = (row, role) => {
  const auditMatch = role.auditRoleIdentities.has(
    row.role.toLocaleLowerCase("en-US"),
  );
  const lowerPath = `/${row.path.toLocaleLowerCase("en-US")}`;
  const tokenMatch = role.pathTokens.some((token) =>
    lowerPath.includes(token.toLocaleLowerCase("en-US")),
  );
  return { auditMatch, tokenMatch, matched: auditMatch || tokenMatch };
};

const extensionFor = (runtimeFormat, sourceExtension) => {
  const normalized = String(runtimeFormat).toLocaleLowerCase("en-US");
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("ogg")) return ".ogg";
  if (normalized.includes("wav")) return ".wav";
  return sourceExtension.startsWith(".")
    ? sourceExtension
    : `.${sourceExtension}`;
};

const runtimeName = (sourcePath, extension) => {
  const parsed = path.posix.parse(sourcePath);
  const stem =
    parsed.name
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "asset";
  return {
    fileName: `${stem}${extension}`,
    windowsReserved: WINDOWS_RESERVED_STEMS.has(stem),
  };
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
  if (role.animation) {
    actions.push("compile-and-review-animation-sequence");
  }
  return actions;
};

const roleBlockers = (row, role) => {
  const blockers = [];
  if (role.canvas !== null && !row.image) {
    blockers.push("image-evidence-required");
  }
  if (
    role.alphaPolicy === "require-meaningful-alpha" &&
    row.image?.alphaUsage !== "meaningful"
  ) {
    blockers.push("meaningful-alpha-required");
  }
  if (
    role.alphaPolicy === "preserve-authored-opaque" &&
    row.image?.alphaUsage === "fully-transparent"
  ) {
    blockers.push("opaque-art-cannot-be-fully-transparent");
  }
  if (role.canvas?.policy === "exact") {
    if (
      row.image?.width !== role.canvas.width ||
      row.image?.height !== role.canvas.height
    ) {
      blockers.push("exact-canvas-mismatch");
    }
  }
  return [...new Set(blockers)].sort();
};

const syncDirectoryBestEffort = (directory) => {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (!["EACCES", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(code)) {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
};

const writeCreateOnly = (output, value, repositoryRoot) => {
  const absolute = assertNoSymlinkSegments(output, "output", {
    allowMissingLeaf: true,
  });
  const parent = resolveDirectory(path.dirname(absolute), "output parent");
  if (fs.existsSync(absolute)) {
    fail("OUTPUT_EXISTS", absolute);
  }
  if (!isWithin(absolute, parent)) {
    fail("OUTPUT_PATH_INVALID", absolute);
  }
  if (isWithin(absolute, repositoryRoot)) {
    fail("OUTPUT_INSIDE_REPOSITORY", absolute);
  }
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(absolute, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, source, { encoding: "utf8" });
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  syncDirectoryBestEffort(parent);
  return absolute;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolveDirectory(options.repo, "repository");
  const contractRecord = stableJson(options.contract, "contract");
  if (!isWithin(contractRecord.path, repositoryRoot)) {
    fail("CONTRACT_OUTSIDE_REPOSITORY", contractRecord.path);
  }
  const auditRecord = stableJson(options.audit, "audit");
  const repository = contractRecord.value.repository;
  const roles = contractRoles(contractRecord.value, repository);
  const requestedRoleIdentities = new Set();
  const requestedRoles = [];
  for (const source of options.roles.length === 0
    ? [...roles.keys()]
    : options.roles) {
    const roleId = nonEmptyString(source, "--role", 96);
    const identity = roleId.toLocaleLowerCase("en-US");
    if (requestedRoleIdentities.has(identity)) continue;
    requestedRoleIdentities.add(identity);
    requestedRoles.push(roleId);
  }
  for (const roleId of requestedRoles) {
    if (!roles.has(roleId)) fail("ROLE_UNKNOWN", roleId);
  }
  const selectedRoleSet = new Set(requestedRoles);
  const audited = auditRows(auditRecord.value, repositoryRoot);
  const workItems = [];
  const seen = new Set();
  for (const row of audited.rows) {
    const sourcePath = row.path;
    const identity = portableKey(sourcePath);
    if (seen.has(identity)) {
      fail("AUDIT_PATH_COLLISION", sourcePath);
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
      if (left.auditMatch !== right.auditMatch) {
        return left.auditMatch ? -1 : 1;
      }
      return left.role.id.localeCompare(right.role.id, "en-US");
    });
    const strongest = candidates.filter(
      (candidate) => candidate.auditMatch === candidates[0].auditMatch,
    );
    const role = strongest[0].role;
    const blockers = roleBlockers(row, role);
    if (strongest.length > 1) {
      blockers.push("ambiguous-role-classification");
    }
    const extension = extensionFor(role.runtimeFormat, row.extension);
    const runtime = runtimeName(sourcePath, extension);
    if (runtime.windowsReserved) {
      blockers.push("windows-reserved-runtime-name");
    }
    const runtimeTargetPath = `${role.runtimeRoot}/${runtime.fileName}`;
    workItems.push({
      sourcePath,
      sourceSha256: row.sha256,
      sourceBytes: row.sizeBytes,
      sourceExtension: row.extension,
      role: role.id,
      roleAuthority: candidates[0].auditMatch
        ? "audit-role"
        : "path-token",
      runtimeRoot: role.runtimeRoot,
      runtimeFormat: role.runtimeFormat,
      runtimeTargetPath,
      ...(role.canvas === undefined ? {} : { canvas: role.canvas }),
      alphaPolicy: role.alphaPolicy,
      fitPolicy: role.fitPolicy,
      ...(role.godotImport === undefined
        ? {}
        : { godotImport: role.godotImport }),
      actions: itemActions(role),
      requiredStages: role.requiredStages,
      blockers: [...new Set(blockers)].sort(),
      reviewRequired: blockers.length > 0 || row.findings.length > 0,
      auditFindings: row.findings,
    });
  }
  workItems.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath, "en-US", {
        sensitivity: "base",
      }) || left.sourcePath.localeCompare(right.sourcePath, "en-US"),
  );
  const targetGroups = new Map();
  for (const item of workItems) {
    const key = portableKey(item.runtimeTargetPath);
    const members = targetGroups.get(key) ?? [];
    members.push(item);
    targetGroups.set(key, members);
  }
  for (const members of targetGroups.values()) {
    if (members.length < 2) continue;
    for (const item of members) {
      item.blockers.push("runtime-target-collision");
    }
  }
  for (const item of workItems) {
    item.blockers = [...new Set(item.blockers)].sort();
    item.reviewRequired =
      item.blockers.length > 0 || item.auditFindings.length > 0;
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
    fail(
      "STRICT_PLAN_NOT_READY",
      `blocked=${blocked},reviewRequired=${reviewRequired}`,
    );
  }
  const contractPath = normalizeRelative(
    path.relative(repositoryRoot, contractRecord.path),
    "contractPath",
  );
  const plan = {
    schemaVersion: "1.0",
    contract: PLAN_ID,
    repository,
    contractPath,
    contractSha256: contractRecord.sha256,
    auditRoot: audited.auditRoot,
    auditSha256: auditRecord.sha256,
    selectedRoles: requestedRoles
      .filter((roleId) => roles.get(roleId).canvas !== null)
      .sort(),
    summary: {
      workItems: workItems.length,
      reviewRequired,
      blocked,
      roleCounts: Object.fromEntries(Object.entries(roleCounts).sort()),
      blockerCounts: Object.fromEntries(
        Object.entries(blockerCounts).sort(),
      ),
    },
    workItems,
    publicationAuthority: false,
    deletionAuthority: false,
    humanCreativeApprovalRequired: true,
  };
  const outputPath = writeCreateOnly(options.output, plan, repositoryRoot);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "passed",
        output: outputPath,
        workItems: workItems.length,
        blocked,
        reviewRequired,
        contractSha256: contractRecord.sha256,
        auditSha256: auditRecord.sha256,
        planFileCreated: true,
        mutationPerformed: true,
        mutationScope: "create-only-plan-file",
        targetRepositoryMutationPerformed: false,
        publicationAuthority: false,
      },
      null,
      2,
    )}\n`,
  );
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ status: "failed", error: message })}\n`,
  );
  process.exitCode = 2;
}
