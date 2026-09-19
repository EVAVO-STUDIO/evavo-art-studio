#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ASSET_CLASSES,
  RIGHTS,
  ROLES,
  SHA,
  VIEWS,
  canonicalJson,
  exact,
  imageEvidence,
  sha256,
  sha256Bytes,
} from "./asset-fabricator-reference-common.mjs";
import {
  REQUEST_CONTRACT as REFERENCE_REQUEST_CONTRACT,
  compileReferenceHandoff,
  verifyReferenceHandoff,
} from "./asset-fabricator-reference-handoff.mjs";

export const ADAPTER_REQUEST_CONTRACT =
  "evavo_art_visual_continuity_3d_reference_adapter_request_v1";
export const ADAPTER_PROTOCOL_VERSION = "2026-09-19.1";
export const APPROVED_HANDOFF_KIND =
  "evavo.visual-continuity.approved-handoff";
export const APPROVED_HANDOFF_PROTOCOL_VERSION = "2026-09-19.1";
const APPROVAL_KIND = "evavo.visual-continuity.approval";
const REQUIRED_RECEIVER_ROUTE = Object.freeze({
  status: "adapter-required",
  adapterId: "asset-fabricator-reference-handoff",
  receiverId: "evavo-3d-art-reference-brief",
  workerTaskId: "creative-media-3d-art-reference-brief",
});
const APPROVED_HANDOFF_AUTHORITY = Object.freeze({
  sourceMutation: false,
  canonMutation: false,
  automaticCreativeApproval: false,
  targetRepositoryMutation: false,
  runtimeActivation: false,
  publication: false,
});
const APPROVAL_AUTHORITY = Object.freeze({
  decisionRecorded: true,
  providerExecution: false,
  imageMutation: false,
  canonMutation: false,
  repositoryMutation: false,
  publication: false,
});
const ID = /^[a-z0-9][a-z0-9-]{1,127}$/u;

function adapterFail(code) {
  throw new Error(`EVAVO_VISUAL_CONTINUITY_3D_ADAPTER_${code}`);
}

function text(value, code, maximum = 12000) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    adapterFail(code);
  }
  return value.trim();
}

function identifier(value, code) {
  if (typeof value !== "string" || !ID.test(value)) adapterFail(code);
  return value;
}

function stringArray(value, code, { minimum = 0, maximum = 256 } = {}) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    adapterFail(code);
  }
  const output = value.map((item) => item.trim());
  if (new Set(output).size !== output.length) adapterFail(`${code}_DUPLICATE`);
  return output;
}

function semanticHash(document, hashField, code) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    adapterFail(`${code}_INVALID`);
  }
  const supplied = document[hashField];
  if (typeof supplied !== "string" || !SHA.test(supplied)) {
    adapterFail(`${code}_HASH_INVALID`);
  }
  const body = { ...document };
  delete body[hashField];
  if (sha256(body) !== supplied) adapterFail(`${code}_HASH_MISMATCH`);
  return supplied;
}

function verifyApproval(approval, source, bibleSha256) {
  exact(
    approval,
    [
      "schemaVersion", "kind", "protocolVersion", "bibleSha256", "sessionId",
      "sessionRevision", "workItemId", "contextSha256", "artifactId",
      "candidateSha256", "attemptSha256", "decision", "reviewer", "reviewedAt",
      "evidenceSha256", "note", "authority", "approvalSha256",
    ],
    "approval",
  );
  if (
    approval.schemaVersion !== "1.0" ||
    approval.kind !== APPROVAL_KIND ||
    approval.protocolVersion !== APPROVED_HANDOFF_PROTOCOL_VERSION ||
    approval.bibleSha256 !== bibleSha256 ||
    approval.decision !== "approved" ||
    canonicalJson(approval.authority) !== canonicalJson(APPROVAL_AUTHORITY)
  ) {
    adapterFail("APPROVAL_IDENTITY_INVALID");
  }
  semanticHash(approval, "approvalSha256", "APPROVAL");
  if (
    approval.workItemId !== source.workItemId ||
    approval.contextSha256 !== source.contextSha256 ||
    approval.artifactId !== source.artifactId ||
    approval.candidateSha256 !== source.sha256
  ) {
    adapterFail("APPROVAL_SOURCE_MISMATCH");
  }
}

export function verifyApprovedContinuity3dHandoff(document) {
  exact(
    document,
    [
      "schemaVersion", "kind", "protocolVersion", "targetStudio",
      "receiverProjectId", "purpose", "bibleSha256", "sessionSha256", "sources",
      "continuity", "requestedOutputs", "receivingChecks", "notes", "authority",
      "approvalReceipts", "receiverRoute", "releaseStatus", "handoffSha256",
    ],
    "approvedHandoff",
  );
  if (
    document.schemaVersion !== "1.0" ||
    document.kind !== APPROVED_HANDOFF_KIND ||
    document.protocolVersion !== APPROVED_HANDOFF_PROTOCOL_VERSION ||
    document.targetStudio !== "3d-studio" ||
    document.releaseStatus !== "approved-for-receiver-validation" ||
    canonicalJson(document.authority) !== canonicalJson(APPROVED_HANDOFF_AUTHORITY)
  ) {
    adapterFail("HANDOFF_IDENTITY_INVALID");
  }
  semanticHash(document, "handoffSha256", "HANDOFF");
  for (const [key, expected] of Object.entries(REQUIRED_RECEIVER_ROUTE)) {
    if (document.receiverRoute?.[key] !== expected) {
      adapterFail("RECEIVER_ROUTE_INVALID");
    }
  }
  if (
    !Array.isArray(document.sources) ||
    document.sources.length < 5 ||
    document.sources.length > 32 ||
    !Array.isArray(document.approvalReceipts) ||
    document.approvalReceipts.length !== document.sources.length
  ) {
    adapterFail("SOURCE_APPROVAL_COUNT_INVALID");
  }
  if (
    !document.continuity ||
    typeof document.continuity !== "object" ||
    !document.continuity.style ||
    !Array.isArray(document.continuity.colourTokens) ||
    !Array.isArray(document.continuity.references) ||
    !Array.isArray(document.continuity.locks)
  ) {
    adapterFail("CONTINUITY_INVALID");
  }
  const sourceIds = new Set();
  const approvals = new Map();
  for (const approval of document.approvalReceipts) {
    if (!approval || typeof approval !== "object") adapterFail("APPROVAL_INVALID");
    if (approvals.has(approval.workItemId)) adapterFail("APPROVAL_DUPLICATE");
    approvals.set(approval.workItemId, approval);
  }
  for (const source of document.sources) {
    exact(
      source,
      ["workItemId", "assetType", "artifactId", "uri", "sha256", "contextSha256"],
      "source",
    );
    identifier(source.workItemId, "SOURCE_WORK_ITEM_ID_INVALID");
    if (sourceIds.has(source.workItemId)) adapterFail("SOURCE_DUPLICATE");
    sourceIds.add(source.workItemId);
    if (!SHA.test(source.sha256) || !SHA.test(source.contextSha256)) {
      adapterFail("SOURCE_HASH_INVALID");
    }
    const approval = approvals.get(source.workItemId);
    if (!approval) adapterFail("SOURCE_APPROVAL_MISSING");
    verifyApproval(approval, source, document.bibleSha256);
  }
  return true;
}

async function loadApprovedHandoff(request, baseDirectory) {
  const approvedPath = path.resolve(
    baseDirectory,
    text(request.approvedHandoffPath, "APPROVED_HANDOFF_PATH_INVALID", 4096),
  );
  const bytes = await readFile(approvedPath);
  if (bytes.length < 2 || bytes.length > 64 * 1024 * 1024) {
    adapterFail("APPROVED_HANDOFF_SIZE_INVALID");
  }
  if (
    typeof request.approvedHandoffFileSha256 !== "string" ||
    !SHA.test(request.approvedHandoffFileSha256) ||
    sha256Bytes(bytes) !== request.approvedHandoffFileSha256
  ) {
    adapterFail("APPROVED_HANDOFF_FILE_HASH_MISMATCH");
  }
  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    adapterFail("APPROVED_HANDOFF_JSON_INVALID");
  }
  verifyApprovedContinuity3dHandoff(document);
  return { path: approvedPath, document };
}

function continuityStyleDescription(continuity) {
  const style = continuity.style;
  return [
    style.title,
    style.intent,
    `Authored era: ${style.authoredEra}.`,
    ...(style.renderingLanguage ?? []),
    ...(style.lineLanguage ?? []),
    ...(style.valueStructure ?? []),
    ...(style.materialLanguage ?? []),
    ...(style.lightingLanguage ?? []),
    ...(style.compositionLanguage ?? []),
    `Distinctive motifs: ${(style.distinctiveMotifs ?? []).join(", ")}.`,
  ].filter(Boolean).join(" ");
}

function continuityAvoid(continuity, additionalAvoid) {
  const locks = continuity.locks ?? [];
  return [...new Set([
    ...(continuity.style.prohibitedGenericTraits ?? []),
    ...(continuity.style.prohibitedModernTraits ?? []),
    ...locks.flatMap((lock) => lock.mustNotVary ?? []).map((rule) => `Do not vary ${rule}`),
    ...additionalAvoid,
  ])];
}

function paletteFor(continuity, tokenIds) {
  const byId = new Map(
    continuity.colourTokens.map((token) => [token.id, token]),
  );
  const selected = tokenIds.length > 0
    ? tokenIds.map((tokenId) => {
        const token = byId.get(tokenId);
        if (!token) adapterFail(`PALETTE_TOKEN_UNKNOWN_${tokenId}`);
        return token;
      })
    : continuity.colourTokens;
  if (selected.length < 1 || selected.length > 16) {
    adapterFail("PALETTE_COUNT_INVALID");
  }
  return selected.map((token) => token.hex);
}

export async function compileContinuity3dReferenceHandoff(
  request,
  {
    baseDirectory = process.cwd(),
    sourceProgramPath,
  } = {},
) {
  exact(
    request,
    [
      "contractVersion", "approvedHandoffPath", "approvedHandoffFileSha256",
      "assetId", "subjectId", "assetClass", "references", "paletteTokenIds",
      "threeDArtDirection", "geometryIntent", "materialIntent", "riggingIntent",
      "deliveryIntent", "dimensionsMetres", "anchors", "provenance",
    ],
    "adapterRequest",
  );
  if (request.contractVersion !== ADAPTER_REQUEST_CONTRACT) {
    adapterFail("REQUEST_VERSION_INVALID");
  }
  if (typeof sourceProgramPath !== "string" || !sourceProgramPath) {
    adapterFail("SOURCE_PROGRAM_PATH_REQUIRED");
  }
  identifier(request.assetId, "ASSET_ID_INVALID");
  identifier(request.subjectId, "SUBJECT_ID_INVALID");
  if (!ASSET_CLASSES.has(request.assetClass)) adapterFail("ASSET_CLASS_INVALID");
  const approved = await loadApprovedHandoff(request, baseDirectory);
  if (approved.document.receiverProjectId !== request.subjectId) {
    adapterFail("RECEIVER_PROJECT_SUBJECT_MISMATCH");
  }
  const sourceById = new Map(
    approved.document.sources.map((source) => [source.workItemId, source]),
  );
  if (
    !Array.isArray(request.references) ||
    request.references.length < 5 ||
    request.references.length > 32
  ) {
    adapterFail("REFERENCES_COUNT_INVALID");
  }
  const usedWorkItems = new Set();
  const usedViews = new Set();
  const references = [];
  for (const [index, raw] of request.references.entries()) {
    exact(
      raw,
      ["id", "workItemId", "path", "view", "role", "rights", "notes"],
      `references[${index}]`,
    );
    const workItemId = identifier(
      raw.workItemId,
      `REFERENCE_${index}_WORK_ITEM_INVALID`,
    );
    const source = sourceById.get(workItemId);
    if (!source) adapterFail(`REFERENCE_${index}_SOURCE_UNKNOWN`);
    if (usedWorkItems.has(workItemId)) adapterFail("REFERENCE_WORK_ITEM_DUPLICATE");
    if (usedViews.has(raw.view)) adapterFail("REFERENCE_VIEW_DUPLICATE");
    usedWorkItems.add(workItemId);
    usedViews.add(raw.view);
    if (!VIEWS.has(raw.view) || !ROLES.has(raw.role) || !RIGHTS.has(raw.rights)) {
      adapterFail(`REFERENCE_${index}_CLASSIFICATION_INVALID`);
    }
    const evidence = await imageEvidence(
      raw.path,
      baseDirectory,
      `references[${index}]`,
    );
    if (evidence.sha256 !== source.sha256) {
      adapterFail(`REFERENCE_${index}_SOURCE_HASH_MISMATCH`);
    }
    references.push({
      id: identifier(raw.id, `REFERENCE_${index}_ID_INVALID`),
      path: evidence.path,
      view: raw.view,
      role: raw.role,
      rights: raw.rights,
      notes: text(raw.notes, `REFERENCE_${index}_NOTES_INVALID`, 2000),
    });
  }

  exact(
    request.threeDArtDirection,
    ["styleFamily", "silhouette", "detailStrategy", "additionalAvoid"],
    "threeDArtDirection",
  );
  const paletteTokenIds = stringArray(
    request.paletteTokenIds,
    "PALETTE_TOKEN_IDS_INVALID",
    { maximum: 16 },
  );
  const additionalAvoid = stringArray(
    request.threeDArtDirection.additionalAvoid,
    "ADDITIONAL_AVOID_INVALID",
    { maximum: 128 },
  );
  const sourceProgramAbsolute = path.resolve(baseDirectory, sourceProgramPath);
  const provenanceNotes = [
    typeof request.provenance?.notes === "string" ? request.provenance.notes : "",
    `Approved visual continuity handoff ${approved.document.handoffSha256}.`,
    `Bible ${approved.document.bibleSha256}; session ${approved.document.sessionSha256}.`,
    `Creative approvals: ${approved.document.approvalReceipts.map((approval) => approval.approvalSha256).join(", ")}.`,
  ].filter(Boolean).join(" ");

  const referenceRequest = {
    contractVersion: REFERENCE_REQUEST_CONTRACT,
    assetId: request.assetId,
    subjectId: request.subjectId,
    assetClass: request.assetClass,
    sourceProgramPath: sourceProgramAbsolute,
    references,
    artDirection: {
      styleFamily: request.threeDArtDirection.styleFamily,
      styleDescription: continuityStyleDescription(approved.document.continuity),
      silhouette: text(
        request.threeDArtDirection.silhouette,
        "SILHOUETTE_INVALID",
      ),
      palette: paletteFor(approved.document.continuity, paletteTokenIds),
      detailStrategy: text(
        request.threeDArtDirection.detailStrategy,
        "DETAIL_STRATEGY_INVALID",
      ),
      avoid: continuityAvoid(approved.document.continuity, additionalAvoid),
    },
    geometryIntent: request.geometryIntent,
    materialIntent: request.materialIntent,
    riggingIntent: request.riggingIntent,
    deliveryIntent: request.deliveryIntent,
    dimensionsMetres: request.dimensionsMetres,
    anchors: request.anchors,
    provenance: {
      ...request.provenance,
      notes: provenanceNotes,
    },
  };
  const handoff = await compileReferenceHandoff(referenceRequest, {
    baseDirectory,
  });
  verifyReferenceHandoff(handoff);
  return handoff;
}

export async function verifyContinuity3dReferenceHandoff(
  request,
  handoff,
  options = {},
) {
  verifyReferenceHandoff(handoff);
  const rebuilt = await compileContinuity3dReferenceHandoff(request, options);
  if (canonicalJson(rebuilt) !== canonicalJson(handoff)) {
    adapterFail("HANDOFF_REPLAY_MISMATCH");
  }
  return true;
}

async function main() {
  const [command, requestPath, handoffPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify", "capabilities"].includes(command)) {
    adapterFail("USAGE");
  }
  let result;
  if (command === "capabilities") {
    result = {
      contractVersion: "evavo_art_visual_continuity_3d_reference_adapter_capabilities_v1",
      protocolVersion: ADAPTER_PROTOCOL_VERSION,
      requestContract: ADAPTER_REQUEST_CONTRACT,
      outputSchema: "evavo.art.asset-fabricator-reference-handoff.v1",
      receiver: "evavo-3d-art-reference-brief",
      workerTaskId: "creative-media-3d-art-reference-brief",
      requiredViews: ["front", "back", "left", "right", "three-quarter"],
      topRequiredFor: ["vehicle", "architecture", "environment-piece", "environment-kit", "terrain"],
      providerExecution: false,
      receiverExecution: false,
      automaticCreativeApproval: false,
    };
  } else {
    if (!requestPath) adapterFail("USAGE");
    const absoluteRequest = path.resolve(requestPath);
    const request = JSON.parse(await readFile(absoluteRequest, "utf8"));
    const options = {
      baseDirectory: path.dirname(absoluteRequest),
      sourceProgramPath: absoluteRequest,
    };
    if (command === "compile") {
      result = await compileContinuity3dReferenceHandoff(request, options);
    } else {
      if (!handoffPath) adapterFail("USAGE");
      const handoff = JSON.parse(await readFile(path.resolve(handoffPath), "utf8"));
      result = {
        valid: await verifyContinuity3dReferenceHandoff(request, handoff, options),
        handoffSha256: handoff.handoffSha256,
      };
    }
  }
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(path.resolve(outputPath), rendered, "utf8");
  process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
