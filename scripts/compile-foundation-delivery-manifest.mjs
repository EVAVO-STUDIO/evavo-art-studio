#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_ID = "evavo_godot_media_production_contract_v1";
const PLAN_ID = "evavo_godot_media_production_plan_v1";
const DELIVERY_SCHEMA = "evavo.art-delivery-optimization.v1";
const AUTHORITY_SCHEMA = "evavo.foundation-media-delivery-authority.v1";
const MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_ITEMS = 1_000;
const MAXIMUM_ROLES = 100;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SUPPORTED_ALPHA_POLICIES = new Set([
  "require-meaningful-alpha",
  "preserve-authored-opaque",
  "preserve-authored-black-stage",
  "review-required",
]);

class FoundationDeliveryManifestError extends Error {
  constructor(code, message) {
    super(`${code}:${message}`);
    this.name = "FoundationDeliveryManifestError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new FoundationDeliveryManifestError(code, message);
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalJson = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const parseArgs = (argv) => {
  const result = { roles: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!["--repo", "--contract", "--plan", "--output", "--role"].includes(token)) {
      fail("OPTION_UNSUPPORTED", token);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("OPTION_VALUE_MISSING", token);
    index += 1;
    if (token === "--role") result.roles.push(value);
    else result[token.slice(2)] = value;
  }
  for (const required of ["repo", "contract", "plan", "output"]) {
    if (!result[required]) fail("OPTION_REQUIRED", `--${required}`);
  }
  return result;
};

const text = (value, label, maximum = 2048) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\0\r\n]/u.test(value)
  ) {
    fail("TEXT_INVALID", label);
  }
  return value;
};

const identifier = (value, label) => {
  const candidate = text(value, label, 128);
  if (!IDENTIFIER.test(candidate)) fail("IDENTIFIER_INVALID", label);
  return candidate;
};

const integer = (value, label, minimum, maximum) => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail("INTEGER_INVALID", `${label}:${minimum}-${maximum}`);
  }
  return value;
};

const boolean = (value, label) => {
  if (typeof value !== "boolean") fail("BOOLEAN_INVALID", label);
  return value;
};

const canonicalRelative = (value, label) => {
  const candidate = text(value, label, 1024);
  if (candidate.includes("\\")) fail("PATH_INVALID", `${label}:backslash`);
  const normalized = path.posix.normalize(candidate).normalize("NFC");
  if (
    normalized !== candidate ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail("PATH_INVALID", `${label}:${candidate}`);
  }
  return candidate;
};

const stringArray = (value, label, maximumItems = 256) => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail("STRING_ARRAY_INVALID", label);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 512));
  if (new Set(result).size !== result.length) fail("STRING_ARRAY_DUPLICATE", label);
  return result;
};

const portableKey = (value) =>
  canonicalRelative(value, "portablePath").normalize("NFC").toLocaleLowerCase("en-US");

const isWithin = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

const rejectSymlinkSegments = (absoluteInput, label, allowMissingLeaf = false) => {
  const absolute = path.resolve(absoluteInput);
  const parsed = path.parse(absolute);
  const relative = path.relative(parsed.root, absolute);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    if (!fs.existsSync(current)) {
      if (allowMissingLeaf && index === segments.length - 1) return absolute;
      fail("PATH_MISSING", `${label}:${current}`);
    }
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) fail("SYMLINK_PATH_FORBIDDEN", `${label}:${current}`);
  }
  return absolute;
};

const resolveDirectory = (value, label) => {
  const requested = rejectSymlinkSegments(value, label, false);
  const canonical = fs.realpathSync.native(requested);
  const stats = fs.lstatSync(canonical);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail("DIRECTORY_INVALID", label);
  }
  return canonical;
};

const fileIdentity = (stats) => ({
  dev: stats.dev,
  ino: stats.ino,
  size: stats.size,
  mtimeMs: stats.mtimeMs,
});

const sameIdentity = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

const stableJson = (value, label) => {
  const requested = rejectSymlinkSegments(value, label, false);
  const descriptor = fs.openSync(requested, "r");
  try {
    const beforeStats = fs.fstatSync(descriptor);
    if (!beforeStats.isFile() || beforeStats.size > MAXIMUM_INPUT_BYTES) {
      fail("FILE_INVALID", label);
    }
    const before = fileIdentity(beforeStats);
    const bytes = fs.readFileSync(descriptor);
    const during = fileIdentity(fs.fstatSync(descriptor));
    if (!sameIdentity(before, during) || bytes.byteLength !== before.size) {
      fail("FILE_CHANGED_DURING_READ", label);
    }
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      fail("JSON_INVALID", `${label}:${error instanceof Error ? error.message : String(error)}`);
    }
    const afterPath = fileIdentity(fs.lstatSync(requested));
    if (!sameIdentity(before, afterPath)) fail("FILE_CHANGED_DURING_READ", label);
    return {
      path: fs.realpathSync.native(requested),
      value: parsed,
      sha256: sha256(bytes),
      identity: before,
    };
  } finally {
    fs.closeSync(descriptor);
  }
};

const stableSource = (repositoryRoot, sourcePath, expectedBytes, expectedSha256) => {
  const absolute = path.resolve(repositoryRoot, ...sourcePath.split("/"));
  if (!isWithin(absolute, repositoryRoot)) fail("SOURCE_PATH_ESCAPE", sourcePath);
  rejectSymlinkSegments(absolute, `source:${sourcePath}`, false);
  const canonical = fs.realpathSync.native(absolute);
  if (!isWithin(canonical, repositoryRoot)) fail("SOURCE_PATH_ESCAPE", sourcePath);
  const descriptor = fs.openSync(canonical, "r");
  try {
    const beforeStats = fs.fstatSync(descriptor);
    if (
      !beforeStats.isFile() ||
      beforeStats.size < 1 ||
      beforeStats.size > MAXIMUM_SOURCE_BYTES
    ) {
      fail("SOURCE_FILE_INVALID", sourcePath);
    }
    const before = fileIdentity(beforeStats);
    if (before.size !== expectedBytes) {
      fail("SOURCE_BYTES_MISMATCH", `${sourcePath}:${before.size}:${expectedBytes}`);
    }
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < before.size) {
      const length = fs.readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.byteLength, before.size - position),
        position,
      );
      if (length <= 0) fail("SOURCE_READ_INCOMPLETE", sourcePath);
      digest.update(buffer.subarray(0, length));
      position += length;
    }
    const during = fileIdentity(fs.fstatSync(descriptor));
    const afterPath = fileIdentity(fs.lstatSync(canonical));
    if (!sameIdentity(before, during) || !sameIdentity(before, afterPath)) {
      fail("SOURCE_CHANGED_DURING_READ", sourcePath);
    }
    const actualSha256 = digest.digest("hex");
    if (actualSha256 !== expectedSha256) {
      fail("SOURCE_SHA256_MISMATCH", `${sourcePath}:${actualSha256}:${expectedSha256}`);
    }
    return { absolute: canonical, identity: before, sha256: actualSha256 };
  } finally {
    fs.closeSync(descriptor);
  }
};

const reverifySource = (snapshot, sourcePath) => {
  const current = fileIdentity(fs.lstatSync(snapshot.absolute));
  if (!sameIdentity(snapshot.identity, current)) fail("SOURCE_CHANGED_BEFORE_WRITE", sourcePath);
};

const runtimeExtension = (runtimeFormat) => {
  const normalized = runtimeFormat.toLocaleLowerCase("en-US");
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  fail("RUNTIME_FORMAT_UNSUPPORTED", runtimeFormat);
};

const profileFor = (runtimeFormat, alphaPolicy) => {
  const normalized = runtimeFormat.toLocaleLowerCase("en-US");
  if (normalized.includes("png")) return "godot-sprite-lossless";
  if (normalized.includes("webp")) {
    return alphaPolicy === "require-meaningful-alpha"
      ? "godot-cutout-webp-1080p"
      : "godot-background-1080p";
  }
  fail("RUNTIME_FORMAT_UNSUPPORTED", runtimeFormat);
};

const validateContract = (value, repository) => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.contract !== CONTRACT_ID ||
    value.repository !== repository
  ) {
    fail("CONTRACT_IDENTITY_INVALID", repository);
  }
  const projectId = identifier(value.projectId, "contract.projectId");
  if (
    !isRecord(value.engine) ||
    value.engine.name !== "Godot" ||
    value.engine.minimumVersion !== "4.6.2"
  ) {
    fail("CONTRACT_ENGINE_INVALID", repository);
  }
  const renderingDomain = text(value.engine.renderingDomain, "contract.engine.renderingDomain", 64);
  const renderer = text(value.engine.renderer, "contract.engine.renderer", 64);
  if (
    !isRecord(value.batchPolicy) ||
    value.batchPolicy.sourceFilesAreImmutable !== true ||
    value.batchPolicy.outputsAreUnapprovedUntilPromoted !== true ||
    value.batchPolicy.automaticDeletionAllowed !== false ||
    value.batchPolicy.partialBatchPublicationAllowed !== false
  ) {
    fail("CONTRACT_BATCH_POLICY_INVALID", repository);
  }
  if (
    !isRecord(value.mcpExecution) ||
    value.mcpExecution.rootRestrictionRequired !== true ||
    value.mcpExecution.arbitraryShellAllowed !== false ||
    value.mcpExecution.arbitraryGitArgumentsAllowed !== false ||
    value.mcpExecution.forcePushAllowed !== false
  ) {
    fail("CONTRACT_MCP_POLICY_INVALID", repository);
  }
  if (!isRecord(value.roots)) fail("CONTRACT_ROOTS_INVALID", repository);
  const runtimeRoots = stringArray(value.roots.runtime, "contract.roots.runtime", MAXIMUM_ROLES)
    .map((entry, index) => canonicalRelative(entry, `contract.roots.runtime[${index}]`));
  if (runtimeRoots.length === 0) fail("CONTRACT_RUNTIME_ROOTS_REQUIRED", repository);
  const foldedRuntimeRoots = runtimeRoots.map(portableKey);
  if (new Set(foldedRuntimeRoots).size !== foldedRuntimeRoots.length) {
    fail("CONTRACT_RUNTIME_ROOT_COLLISION", repository);
  }
  if (
    !Array.isArray(value.roles) ||
    value.roles.length < 1 ||
    value.roles.length > MAXIMUM_ROLES
  ) {
    fail("CONTRACT_ROLES_INVALID", repository);
  }
  const roles = new Map();
  for (const [index, raw] of value.roles.entries()) {
    if (!isRecord(raw)) fail("CONTRACT_ROLE_INVALID", String(index));
    const id = identifier(raw.id, `contract.roles[${index}].id`);
    if (roles.has(id)) fail("CONTRACT_ROLE_DUPLICATE", id);
    const runtimeRoot = canonicalRelative(
      raw.runtimeRoot,
      `contract.roles[${index}].runtimeRoot`,
    );
    const runtimeKey = portableKey(runtimeRoot);
    if (
      !foldedRuntimeRoots.some(
        (root) => runtimeKey === root || runtimeKey.startsWith(`${root}/`),
      )
    ) {
      fail("CONTRACT_ROLE_RUNTIME_ROOT_OUTSIDE_AUTHORITY", id);
    }
    const runtimeFormat = text(
      raw.runtimeFormat,
      `contract.roles[${index}].runtimeFormat`,
      128,
    );
    runtimeExtension(runtimeFormat);
    const alphaPolicy = text(
      raw.alphaPolicy,
      `contract.roles[${index}].alphaPolicy`,
      128,
    );
    if (!SUPPORTED_ALPHA_POLICIES.has(alphaPolicy)) {
      fail("CONTRACT_ROLE_ALPHA_POLICY_INVALID", id);
    }
    const fitPolicy = text(raw.fitPolicy, `contract.roles[${index}].fitPolicy`, 128);
    const requiredStages = stringArray(
      raw.requiredStages,
      `contract.roles[${index}].requiredStages`,
      64,
    );
    roles.set(id, {
      id,
      runtimeRoot,
      runtimeFormat,
      alphaPolicy,
      fitPolicy,
      requiredStages,
      canvas: raw.canvas,
    });
  }
  const title =
    isRecord(value.product) && typeof value.product.hub === "string"
      ? text(value.product.hub, "contract.product.hub", 512)
      : projectId;
  return {
    projectId,
    title,
    engine: "Godot",
    engineVersion: value.engine.minimumVersion,
    rendering: `${renderingDomain}:${renderer}`,
    runtimeRoots,
    roles,
  };
};

const validateSummary = (summary, workItems) => {
  if (!isRecord(summary)) fail("PLAN_SUMMARY_INVALID", "summary");
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
  const expected = {
    workItems: workItems.length,
    reviewRequired,
    blocked,
    roleCounts: Object.fromEntries(Object.entries(roleCounts).sort()),
    blockerCounts: Object.fromEntries(Object.entries(blockerCounts).sort()),
  };
  if (canonicalJson(summary) !== canonicalJson(expected)) {
    fail("PLAN_SUMMARY_MISMATCH", "summary");
  }
};

const validatePlan = (value, contract, repository, repositoryRoot, contractRecord) => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.contract !== PLAN_ID ||
    value.repository !== repository
  ) {
    fail("PLAN_IDENTITY_INVALID", repository);
  }
  const contractPath = canonicalRelative(value.contractPath, "plan.contractPath");
  const actualContractPath = canonicalRelative(
    path.relative(repositoryRoot, contractRecord.path).split(path.sep).join("/"),
    "actualContractPath",
  );
  if (contractPath !== actualContractPath) {
    fail("PLAN_CONTRACT_PATH_MISMATCH", `${contractPath}:${actualContractPath}`);
  }
  if (value.contractSha256 !== contractRecord.sha256) {
    fail("PLAN_CONTRACT_SHA256_MISMATCH", String(value.contractSha256));
  }
  if (!SHA256.test(String(value.auditSha256 ?? ""))) {
    fail("PLAN_AUDIT_SHA256_INVALID", String(value.auditSha256 ?? ""));
  }
  const auditRoot = resolveDirectory(text(value.auditRoot, "plan.auditRoot", 4096), "plan.auditRoot");
  if (auditRoot !== repositoryRoot) {
    fail("PLAN_AUDIT_ROOT_MISMATCH", `${auditRoot}:${repositoryRoot}`);
  }
  if (
    value.publicationAuthority !== false ||
    value.deletionAuthority !== false ||
    value.humanCreativeApprovalRequired !== true
  ) {
    fail("PLAN_AUTHORITY_INVALID", repository);
  }
  const selectedRoles = stringArray(value.selectedRoles, "plan.selectedRoles", MAXIMUM_ROLES);
  if (selectedRoles.length === 0) fail("PLAN_SELECTED_ROLES_REQUIRED", repository);
  for (const role of selectedRoles) {
    if (!contract.roles.has(role)) fail("PLAN_ROLE_UNKNOWN", role);
  }
  if (!Array.isArray(value.workItems) || value.workItems.length > 100_000) {
    fail("PLAN_WORK_ITEMS_INVALID", repository);
  }
  const sources = new Set();
  const workItems = value.workItems.map((raw, index) => {
    if (!isRecord(raw)) fail("PLAN_ITEM_INVALID", String(index));
    const sourcePath = canonicalRelative(raw.sourcePath, `plan.workItems[${index}].sourcePath`);
    const sourceKey = portableKey(sourcePath);
    if (sources.has(sourceKey)) fail("PLAN_SOURCE_DUPLICATE", sourcePath);
    sources.add(sourceKey);
    const sourceSha256 = text(
      raw.sourceSha256,
      `plan.workItems[${index}].sourceSha256`,
      64,
    );
    if (!SHA256.test(sourceSha256)) fail("PLAN_SOURCE_SHA256_INVALID", sourcePath);
    const sourceBytes = integer(
      raw.sourceBytes,
      `plan.workItems[${index}].sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    );
    const sourceExtension = text(
      raw.sourceExtension,
      `plan.workItems[${index}].sourceExtension`,
      32,
    );
    if (
      sourceExtension !== sourceExtension.toLocaleLowerCase("en-US") ||
      sourceExtension !== path.posix.extname(sourcePath).toLocaleLowerCase("en-US")
    ) {
      fail("PLAN_SOURCE_EXTENSION_MISMATCH", sourcePath);
    }
    const role = identifier(raw.role, `plan.workItems[${index}].role`);
    const contractRole = contract.roles.get(role);
    if (!contractRole || !selectedRoles.includes(role)) fail("PLAN_ITEM_ROLE_INVALID", role);
    const runtimeRoot = canonicalRelative(
      raw.runtimeRoot,
      `plan.workItems[${index}].runtimeRoot`,
    );
    if (runtimeRoot !== contractRole.runtimeRoot) {
      fail("PLAN_ITEM_RUNTIME_ROOT_MISMATCH", sourcePath);
    }
    const runtimeFormat = text(
      raw.runtimeFormat,
      `plan.workItems[${index}].runtimeFormat`,
      128,
    );
    if (runtimeFormat !== contractRole.runtimeFormat) {
      fail("PLAN_ITEM_RUNTIME_FORMAT_MISMATCH", sourcePath);
    }
    const runtimeTargetPath = canonicalRelative(
      raw.runtimeTargetPath,
      `plan.workItems[${index}].runtimeTargetPath`,
    );
    const runtimeTargetKey = portableKey(runtimeTargetPath);
    const runtimeRootKey = portableKey(runtimeRoot);
    if (!runtimeTargetKey.startsWith(`${runtimeRootKey}/`)) {
      fail("PLAN_ITEM_RUNTIME_TARGET_OUTSIDE_ROOT", sourcePath);
    }
    if (path.posix.extname(runtimeTargetPath).toLowerCase() !== runtimeExtension(runtimeFormat)) {
      fail("PLAN_ITEM_RUNTIME_EXTENSION_MISMATCH", runtimeTargetPath);
    }
    if (raw.alphaPolicy !== contractRole.alphaPolicy) {
      fail("PLAN_ITEM_ALPHA_POLICY_MISMATCH", sourcePath);
    }
    if (raw.fitPolicy !== contractRole.fitPolicy) {
      fail("PLAN_ITEM_FIT_POLICY_MISMATCH", sourcePath);
    }
    const requiredStages = stringArray(
      raw.requiredStages,
      `plan.workItems[${index}].requiredStages`,
      64,
    );
    if (canonicalJson(requiredStages) !== canonicalJson(contractRole.requiredStages)) {
      fail("PLAN_ITEM_REQUIRED_STAGES_MISMATCH", sourcePath);
    }
    const blockers = stringArray(
      raw.blockers,
      `plan.workItems[${index}].blockers`,
      64,
    );
    const reviewRequired = boolean(
      raw.reviewRequired,
      `plan.workItems[${index}].reviewRequired`,
    );
    const auditFindings = stringArray(
      raw.auditFindings,
      `plan.workItems[${index}].auditFindings`,
      256,
    );
    return {
      sourcePath,
      sourceSha256,
      sourceBytes,
      sourceExtension,
      role,
      runtimeRoot,
      runtimeFormat,
      runtimeTargetPath,
      alphaPolicy: contractRole.alphaPolicy,
      fitPolicy: contractRole.fitPolicy,
      requiredStages,
      blockers,
      reviewRequired,
      auditFindings,
    };
  });
  validateSummary(value.summary, workItems);
  return {
    selectedRoles,
    workItems,
    auditRoot,
    auditSha256: value.auditSha256,
  };
};

const createOnlyWrite = (outputInput, repositoryRoot, value) => {
  const output = path.resolve(outputInput);
  const parent = rejectSymlinkSegments(path.dirname(output), "outputParent", false);
  const canonicalParent = fs.realpathSync.native(parent);
  const parentStats = fs.lstatSync(canonicalParent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    fail("OUTPUT_PARENT_INVALID", canonicalParent);
  }
  rejectSymlinkSegments(output, "output", true);
  if (isWithin(output, repositoryRoot)) fail("OUTPUT_INSIDE_REPOSITORY", output);
  if (fs.existsSync(output)) fail("OUTPUT_EXISTS", output);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const descriptor = fs.openSync(output, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const parentDescriptor = fs.openSync(canonicalParent, "r");
  try {
    fs.fsyncSync(parentDescriptor);
  } finally {
    fs.closeSync(parentDescriptor);
  }
  return { output, bytes, sha256: sha256(bytes) };
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolveDirectory(options.repo, "repository");
  const contractRecord = stableJson(options.contract, "contract");
  if (!isWithin(contractRecord.path, repositoryRoot)) {
    fail("CONTRACT_OUTSIDE_REPOSITORY", contractRecord.path);
  }
  const planRecord = stableJson(options.plan, "plan");
  if (isWithin(planRecord.path, repositoryRoot)) {
    fail("PLAN_INSIDE_REPOSITORY", planRecord.path);
  }
  const repository = text(contractRecord.value?.repository, "contract.repository", 256);
  const contract = validateContract(contractRecord.value, repository);
  const plan = validatePlan(
    planRecord.value,
    contract,
    repository,
    repositoryRoot,
    contractRecord,
  );
  const requestedRoles =
    options.roles.length === 0 ? [...plan.selectedRoles] : [...new Set(options.roles)];
  if (requestedRoles.length > MAXIMUM_ROLES) fail("ROLE_LIMIT_EXCEEDED", String(requestedRoles.length));
  for (const role of requestedRoles) {
    identifier(role, "requestedRole");
    if (!plan.selectedRoles.includes(role)) fail("ROLE_NOT_IN_PLAN", role);
  }
  const selected = plan.workItems.filter((item) => requestedRoles.includes(item.role));
  if (selected.length < 1) fail("EXECUTION_ITEMS_REQUIRED", repository);
  if (selected.length > MAXIMUM_ITEMS) fail("EXECUTION_ITEM_LIMIT_EXCEEDED", String(selected.length));
  for (const item of selected) {
    if (item.blockers.length > 0 || item.reviewRequired || item.auditFindings.length > 0) {
      fail(
        "PLAN_ITEM_NOT_READY",
        `${item.sourcePath}:blockers=${item.blockers.join(",")}:findings=${item.auditFindings.join(",")}`,
      );
    }
  }
  const targetOwners = new Map();
  for (const item of selected) {
    const key = portableKey(item.runtimeTargetPath);
    const prior = targetOwners.get(key);
    if (prior) fail("RUNTIME_TARGET_COLLISION", `${prior}:${item.sourcePath}`);
    targetOwners.set(key, item.sourcePath);
  }
  const sourceSnapshots = selected.map((item) => ({
    item,
    snapshot: stableSource(
      repositoryRoot,
      item.sourcePath,
      item.sourceBytes,
      item.sourceSha256,
    ),
  }));
  const manifestItems = selected
    .map((item) => {
      const itemIdentity = sha256(
        Buffer.from(
          canonicalJson({
            role: item.role,
            sourcePath: item.sourcePath,
            targetPath: item.runtimeTargetPath,
            sourceSha256: item.sourceSha256,
          }),
          "utf8",
        ),
      );
      return {
        id: `fm-${itemIdentity.slice(0, 24)}`,
        sourcePath: item.sourcePath,
        targetPath: item.runtimeTargetPath,
        sourceSha256: item.sourceSha256,
        sourceBytes: item.sourceBytes,
        profileId: profileFor(item.runtimeFormat, item.alphaPolicy),
        background: { mode: "preserve" },
      };
    })
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath, "en-US"));
  const batchId = `foundation-${planRecord.sha256.slice(0, 24)}`;
  const manifestCore = {
    schema: DELIVERY_SCHEMA,
    batchId,
    project: {
      id: contract.projectId,
      title: contract.title,
      engine: contract.engine,
      engineVersion: contract.engineVersion,
      rendering: contract.rendering,
    },
    items: manifestItems,
  };
  const postDeliveryItems = selected
    .map((item) => ({
      id: manifestItems.find((entry) => entry.sourcePath === item.sourcePath)?.id,
      role: item.role,
      sourcePath: item.sourcePath,
      runtimeTargetPath: item.runtimeTargetPath,
      requiredStages: item.requiredStages,
      sidecars:
        item.runtimeFormat.toLocaleLowerCase("en-US") === "png-plus-fnt"
          ? ["bitmap-font-metadata"]
          : [],
    }))
    .sort((left, right) => left.runtimeTargetPath.localeCompare(right.runtimeTargetPath, "en-US"));
  const output = {
    ...manifestCore,
    foundationAuthority: {
      schema: AUTHORITY_SCHEMA,
      repository,
      repositoryRoot,
      contractPath: canonicalRelative(
        path.relative(repositoryRoot, contractRecord.path).split(path.sep).join("/"),
        "authority.contractPath",
      ),
      contractSha256: contractRecord.sha256,
      planSha256: planRecord.sha256,
      auditSha256: plan.auditSha256,
      selectedRoles: [...requestedRoles].sort(),
      exactSourceBytesVerified: true,
      exactSourceCount: selected.length,
      deliveryManifestSha256: sha256(
        Buffer.from(canonicalJson(manifestCore), "utf8"),
      ),
      sourceFilesAreImmutable: true,
      outputsAreUnapprovedUntilPromoted: true,
      planFileCreated: true,
      mutationPerformed: true,
      mutationScope: "create-only-delivery-manifest",
      targetRepositoryMutationPerformed: false,
      providerCalled: false,
      deletionPerformed: false,
      selectionPerformed: false,
      promotionPerformed: false,
      publicationPerformed: false,
    },
    postDelivery: {
      items: postDeliveryItems,
      independentGate: "python -m godot_game_test_lab.foundation_media_plan",
      deliveryCommand:
        "pnpm --filter @evavo/art-delivery-optimizer start -- batch --manifest <manifest> --source-root <repository> --output-root <staging> --apply",
      stagingRootMustBeOutsideTargetRepository: true,
      applyAuthorized: false,
      humanCreativeApprovalRequired: true,
      publicationAuthority: false,
    },
  };
  for (const { item, snapshot } of sourceSnapshots) {
    reverifySource(snapshot, item.sourcePath);
  }
  const contractAfter = fileIdentity(fs.lstatSync(contractRecord.path));
  if (!sameIdentity(contractRecord.identity, contractAfter)) {
    fail("CONTRACT_CHANGED_BEFORE_WRITE", contractRecord.path);
  }
  const planAfter = fileIdentity(fs.lstatSync(planRecord.path));
  if (!sameIdentity(planRecord.identity, planAfter)) {
    fail("PLAN_CHANGED_BEFORE_WRITE", planRecord.path);
  }
  const written = createOnlyWrite(options.output, repositoryRoot, output);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "passed",
        output: written.output,
        outputSha256: written.sha256,
        batchId,
        items: manifestItems.length,
        contractSha256: contractRecord.sha256,
        planSha256: planRecord.sha256,
        auditSha256: plan.auditSha256,
        exactSourceBytesVerified: true,
        planFileCreated: true,
        mutationPerformed: true,
        mutationScope: "create-only-delivery-manifest",
        targetRepositoryMutationPerformed: false,
        providerCalled: false,
        selectionPerformed: false,
        promotionPerformed: false,
        publicationPerformed: false,
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
  process.stderr.write(`${JSON.stringify({ status: "failed", error: message })}\n`);
  process.exitCode = 2;
}
