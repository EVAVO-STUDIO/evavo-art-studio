import path from "node:path";

import {
  inspectBmFont,
  inspectGodotTextResource,
  inspectPng,
  objectValue,
  pathInside,
  stable,
  stableRegularFile,
  text,
  verifySelfHash,
} from "./common.mjs";
import { APPROVAL_SCHEMA } from "./request.mjs";

export async function inspectItem(item, roots) {
  const source = await stableRegularFile(item.sourcePath, `delivery source ${item.assetId}`);
  if (!roots.some((root) => pathInside(root, source.path))) {
    throw new Error(`delivery source ${item.assetId} is outside every allowed source root.`);
  }
  if (source.sha256 !== item.expected.sha256 || source.sizeBytes !== item.expected.bytes) {
    throw new Error(`delivery source ${item.assetId} identity changed.`);
  }
  const extension = path.extname(source.path).toLowerCase();
  let inspection = { type: "binary" };
  if (extension === ".png") {
    const png = inspectPng(source.bytes, `delivery source ${item.assetId}`);
    if (item.expected.width !== undefined && png.width !== item.expected.width) {
      throw new Error(`delivery source ${item.assetId} width differs.`);
    }
    if (item.expected.height !== undefined && png.height !== item.expected.height) {
      throw new Error(`delivery source ${item.assetId} height differs.`);
    }
    if (item.expected.hasAlpha !== undefined && png.hasAlpha !== item.expected.hasAlpha) {
      throw new Error(`delivery source ${item.assetId} alpha policy differs.`);
    }
    inspection = { type: "png", ...png };
  } else if (extension === ".fnt") {
    inspection = { type: "bmfont", ...inspectBmFont(source.bytes, `delivery source ${item.assetId}`) };
  } else if (extension === ".tres" || extension === ".tscn") {
    inspection = { type: "godot-text-resource", ...inspectGodotTextResource(source.bytes, `delivery source ${item.assetId}`) };
  } else if (extension === ".json") {
    try {
      JSON.parse(source.bytes.toString("utf8").replace(/^\uFEFF/u, ""));
    } catch (error) {
      throw new Error(`delivery source ${item.assetId} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    inspection = { type: "json" };
  }
  return Object.freeze({
    assetId: item.assetId,
    kind: item.kind,
    role: item.role,
    sourcePath: source.path,
    targetPath: item.targetPath,
    mediaType: item.mediaType,
    installationMode: item.installationMode,
    expectedTargetSha256: item.expectedTargetSha256,
    sha256: source.sha256,
    bytes: source.sizeBytes,
    tags: item.tags,
    sequence: item.sequence,
    inspection: Object.freeze(inspection),
  });
}

export function verifySequences(items) {
  const groups = new Map();
  for (const item of items.filter((entry) => entry.sequence)) {
    const key = item.sequence.clipId;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  for (const [clipId, entries] of groups) {
    const first = entries[0].sequence;
    if (entries.length !== first.frameCount) throw new Error(`Sequence ${clipId} is incomplete.`);
    const indices = entries.map((entry) => entry.sequence.frameIndex).sort((left, right) => left - right);
    for (let index = 0; index < first.frameCount; index += 1) {
      if (indices[index] !== index) throw new Error(`Sequence ${clipId} has missing or duplicate frame index ${index}.`);
    }
    for (const entry of entries) {
      if (
        entry.sequence.frameCount !== first.frameCount ||
        entry.sequence.fps !== first.fps ||
        entry.sequence.loop !== first.loop
      ) {
        throw new Error(`Sequence ${clipId} has inconsistent timing metadata.`);
      }
    }
  }
}

export function verifyApproval(value, request, itemBindings, campaignSha256, styleSha256) {
  if (value.schema !== APPROVAL_SCHEMA) throw new Error(`approval.schema must be ${APPROVAL_SCHEMA}.`);
  verifySelfHash(value, "approvalSha256");
  if (value.decision !== "approved" || value.humanDecision !== true || value.agentSelfApproval !== false) {
    throw new Error("Approval must be a named human approved decision and not agent self-approval.");
  }
  const approver = objectValue(value.approver, "approval.approver");
  text(approver.name, "approval.approver.name", { maximum: 256 });
  text(approver.id, "approval.approver.id", { maximum: 256 });
  text(approver.role, "approval.approver.role", { maximum: 256 });
  text(value.rationale, "approval.rationale", { minimum: 20, maximum: 8000 });
  if (
    value.gameHead !== request.gameHead ||
    value.campaignPlanSha256 !== campaignSha256 ||
    value.styleProfileSha256 !== styleSha256
  ) {
    throw new Error("Approval evidence bindings differ from the exact request inputs.");
  }
  for (const key of ["creative", "historical", "provenance"]) {
    if (value[key] !== true) throw new Error(`Approval does not grant ${key}.`);
  }
  if (value.nativeComposition !== false || value.publicationAuthority !== false) {
    throw new Error("Approval may not claim native composition or publication authority.");
  }
  if (stable(value.itemBindings) !== stable(itemBindings)) {
    throw new Error("Approval item bindings differ from the exact delivery item set.");
  }
  return Object.freeze({
    approvalSha256: value.approvalSha256,
    approver: { name: approver.name, id: approver.id, role: approver.role },
    rationale: value.rationale,
    creative: true,
    historical: true,
    provenance: true,
    nativeComposition: false,
    publicationAuthority: false,
  });
}
