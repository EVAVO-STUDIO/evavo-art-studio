import { canonicalSha256 } from "../../layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
} from "../../layered-godot-workspace-auditor.mjs";
import {
  AUDIT_AUTHORITY_KEYS,
  absolutePath,
  exactObject,
  gateFail,
  relativeResourcePath,
  repository,
  safeBytes,
  sha,
  utc,
  validateFilesystemIdentity,
} from "./common.mjs";

export function stableAudit(value) {
  const { auditSha256: _hash, auditedAt: _time, ...stable } = value;
  return stable;
}

export function validateAuditReceipt(value, label = "auditReceipt") {
  const code = "AUDIT_INVALID";
  const receipt = exactObject(
    value,
    [
      "schemaVersion",
      "kind",
      "protocolVersion",
      "requestSha256",
      "integrationSha256",
      "writeReceiptSha256",
      "target",
      "files",
      "totals",
      "auditedAt",
      "authority",
      "auditSha256",
    ],
    label,
    code,
  );

  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND ||
    receipt.protocolVersion !== LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION
  ) {
    gateFail(code, `${label} schema, kind or protocol is not current.`);
  }

  sha(receipt.requestSha256, `${label}.requestSha256`, code);
  sha(receipt.integrationSha256, `${label}.integrationSha256`, code);
  sha(receipt.writeReceiptSha256, `${label}.writeReceiptSha256`, code);
  sha(receipt.auditSha256, `${label}.auditSha256`, code);

  const { auditSha256, ...payload } = receipt;
  if (canonicalSha256(payload) !== auditSha256) {
    gateFail(code, `${label} self-hash is invalid.`);
  }
  utc(receipt.auditedAt, `${label}.auditedAt`, code);

  const target = exactObject(
    receipt.target,
    ["expectedRepository", "workspaceRoot"],
    `${label}.target`,
    code,
  );
  repository(target.expectedRepository, `${label}.target.expectedRepository`, code);
  absolutePath(target.workspaceRoot, `${label}.target.workspaceRoot`, code);

  if (!Array.isArray(receipt.files) || receipt.files.length !== 7) {
    gateFail(code, `${label}.files must contain exactly seven audited resources.`);
  }
  const seenPaths = new Set();
  let totalBytes = 0;
  receipt.files.forEach((entryValue, index) => {
    const entryLabel = `${label}.files[${index}]`;
    const entry = exactObject(
      entryValue,
      ["path", "sha256", "bytes", "filesystemIdentity"],
      entryLabel,
      code,
    );
    const resourcePath = relativeResourcePath(entry.path, `${entryLabel}.path`, code);
    if (seenPaths.has(resourcePath)) {
      gateFail(code, `${label}.files contains duplicate resource path ${resourcePath}.`);
    }
    seenPaths.add(resourcePath);
    sha(entry.sha256, `${entryLabel}.sha256`, code);
    safeBytes(entry.bytes, `${entryLabel}.bytes`, code);
    validateFilesystemIdentity(
      entry.filesystemIdentity,
      `${entryLabel}.filesystemIdentity`,
      code,
      entry.bytes,
    );
    totalBytes += entry.bytes;
  });

  const totals = exactObject(
    receipt.totals,
    ["resources", "bytes", "residueFiles"],
    `${label}.totals`,
    code,
  );
  if (
    totals.resources !== 7 ||
    totals.bytes !== totalBytes ||
    totals.residueFiles !== 0
  ) {
    gateFail(code, `${label}.totals do not match the exact audited resources.`);
  }

  const authority = exactObject(
    receipt.authority,
    AUDIT_AUTHORITY_KEYS,
    `${label}.authority`,
    code,
  );
  for (const key of AUDIT_AUTHORITY_KEYS) {
    if (authority[key] !== false) {
      gateFail(code, `${label}.authority.${key} must remain false.`);
    }
  }
  return receipt;
}

export function assertCurrentAudit(supplied, current, currentLabel = "currentAudit") {
  const admittedSupplied = validateAuditReceipt(supplied, "auditReceipt");
  const admittedCurrent = validateAuditReceipt(current, currentLabel);
  if (
    canonicalSha256(stableAudit(admittedSupplied)) !==
    canonicalSha256(stableAudit(admittedCurrent))
  ) {
    gateFail(
      "TARGET_DRIFT",
      "Selected workspace no longer matches the audit state used for runtime validation.",
    );
  }
  return admittedCurrent;
}
