#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  ASSET_CLASSES, HANDOFF_SCHEMA, PROTOCOL_VERSION, REQUEST_CONTRACT, RIGHTS, ROLES,
  SHA, VIEWS, authority, canonicalJson, exact, fail, finite, id, imageEvidence,
  jsonEvidence, requiredViews, sha256, text, boolean,
} from "./asset-fabricator-reference-common.mjs";
import {
  normalizeArtDirection, normalizeDelivery, normalizeGeometry, normalizeMaterial,
  normalizeRigging,
} from "./asset-fabricator-reference-policy.mjs";
export { HANDOFF_SCHEMA, PROTOCOL_VERSION, REQUEST_CONTRACT } from "./asset-fabricator-reference-common.mjs";

export async function compileReferenceHandoff(request, { baseDirectory = process.cwd() } = {}) {
  exact(request, [
    "contractVersion", "assetId", "subjectId", "assetClass", "sourceProgramPath",
    "references", "artDirection", "geometryIntent", "materialIntent", "riggingIntent",
    "deliveryIntent", "dimensionsMetres", "anchors", "provenance",
  ], "request");
  if (request.contractVersion !== REQUEST_CONTRACT) fail("request:version");
  const assetId = id(request.assetId, "assetId");
  const subjectId = id(request.subjectId, "subjectId");
  if (!ASSET_CLASSES.has(request.assetClass)) fail("assetClass:invalid");
  const source = await jsonEvidence(request.sourceProgramPath, baseDirectory, "sourceProgram");
  if (!Array.isArray(request.references) || request.references.length < 5 || request.references.length > 32) fail("references:count");
  const referenceIds = new Set();
  const views = new Set();
  const references = [];
  for (const [index, raw] of request.references.entries()) {
    exact(raw, ["id", "path", "view", "role", "rights", "notes"], `references[${index}]`);
    const referenceId = id(raw.id, `references[${index}].id`);
    if (referenceIds.has(referenceId)) fail("references:duplicate-id");
    referenceIds.add(referenceId);
    if (!VIEWS.has(raw.view) || !ROLES.has(raw.role) || !RIGHTS.has(raw.rights)) fail(`references[${index}]:classification`);
    views.add(raw.view);
    references.push({
      id: referenceId,
      ...await imageEvidence(raw.path, baseDirectory, `references[${index}]`),
      view: raw.view, role: raw.role, rights: { status: raw.rights },
      notes: typeof raw.notes === "string" ? raw.notes : "",
    });
  }
  const required = requiredViews(request.assetClass);
  const missingViews = required.filter((view) => !views.has(view));
  if (missingViews.length) fail(`references:missing-views:${missingViews.join(",")}`);
  references.sort((a, b) => a.id.localeCompare(b.id));

  exact(request.dimensionsMetres, ["width", "height", "depth", "groundOrigin"], "dimensionsMetres");
  if (!["center", "bottom-center"].includes(request.dimensionsMetres.groundOrigin)) fail("dimensionsMetres:ground-origin");
  const dimensionsMetres = {
    width: finite(request.dimensionsMetres.width, "dimensionsMetres.width", { minimum: 0.001 }),
    height: finite(request.dimensionsMetres.height, "dimensionsMetres.height", { minimum: 0.001 }),
    depth: finite(request.dimensionsMetres.depth, "dimensionsMetres.depth", { minimum: 0.001 }),
    groundOrigin: request.dimensionsMetres.groundOrigin,
  };
  if (!Array.isArray(request.anchors) || request.anchors.length > 64) fail("anchors:count");
  const anchorIds = new Set();
  const anchors = request.anchors.map((raw, index) => {
    exact(raw, ["id", "purpose", "parentHint", "positionMetres"], `anchors[${index}]`);
    const anchorId = id(raw.id, `anchors[${index}].id`);
    if (anchorIds.has(anchorId)) fail("anchors:duplicate-id");
    anchorIds.add(anchorId);
    if (!Array.isArray(raw.positionMetres) || raw.positionMetres.length !== 3) fail(`anchors[${index}]:position`);
    return {
      id: anchorId,
      purpose: text(raw.purpose, `anchors[${index}].purpose`, 512),
      parentHint: text(raw.parentHint, `anchors[${index}].parentHint`, 128),
      positionMetres: raw.positionMetres.map((value, axis) => finite(value, `anchors[${index}].positionMetres[${axis}]`, { minimum: -100000, maximum: 100000 })),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  exact(request.provenance, ["requestedBy", "project", "rightsReviewRequired", "notes"], "provenance");
  const provenance = {
    requestedBy: text(request.provenance.requestedBy, "provenance.requestedBy", 256),
    project: text(request.provenance.project, "provenance.project", 256),
    rightsReviewRequired: boolean(request.provenance.rightsReviewRequired, "provenance.rightsReviewRequired"),
    notes: typeof request.provenance.notes === "string" ? request.provenance.notes : "",
  };
  const body = {
    schema: HANDOFF_SCHEMA, protocolVersion: PROTOCOL_VERSION,
    producer: "EVAVO-STUDIO/evavo-art-studio", assetId, subjectId,
    assetClass: request.assetClass, source, references,
    viewCoverage: { required, supplied: [...views].sort(), complete: true },
    artDirection: normalizeArtDirection(request.artDirection),
    geometryIntent: normalizeGeometry(request.geometryIntent),
    materialIntent: normalizeMaterial(request.materialIntent),
    riggingIntent: normalizeRigging(request.riggingIntent),
    deliveryIntent: normalizeDelivery(request.deliveryIntent),
    dimensionsMetres, anchors, provenance,
    target: { multiView3dGeneration: true, assetProductionBrief: true, universalAsset: true, assetFabricatorMaterials: true },
    authority: authority(),
  };
  return { ...body, handoffSha256: sha256(body) };
}

export function verifyReferenceHandoff(document) {
  exact(document, [
    "schema", "protocolVersion", "producer", "assetId", "subjectId", "assetClass",
    "source", "references", "viewCoverage", "artDirection", "geometryIntent",
    "materialIntent", "riggingIntent", "deliveryIntent", "dimensionsMetres", "anchors",
    "provenance", "target", "authority", "handoffSha256",
  ], "handoff");
  if (document.schema !== HANDOFF_SCHEMA || document.protocolVersion !== PROTOCOL_VERSION || document.producer !== "EVAVO-STUDIO/evavo-art-studio") fail("handoff:identity");
  if (!SHA.test(document.handoffSha256)) fail("handoff:sha-format");
  const body = { ...document }; delete body.handoffSha256;
  if (sha256(body) !== document.handoffSha256) fail("handoff:sha-mismatch");
  if (!Array.isArray(document.references) || document.references.length < 5) fail("handoff:references");
  const views = new Set(document.references.map((reference) => reference.view));
  for (const view of requiredViews(document.assetClass)) if (!views.has(view)) fail(`handoff:missing-${view}`);
  if (document.materialIntent.normalConvention !== "opengl") fail("handoff:normal-convention");
  if (canonicalJson(document.materialIntent.channelPacking) !== canonicalJson({ r: "ao", g: "roughness", b: "metalness", a: "mask" })) fail("handoff:packing");
  if (canonicalJson(document.authority) !== canonicalJson(authority())) fail("handoff:authority");
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify", "capabilities"].includes(command)) fail("usage");
  let result;
  if (command === "capabilities") {
    result = {
      contractVersion: "evavo_art_asset_fabricator_reference_capabilities_v1",
      protocolVersion: PROTOCOL_VERSION, requestContract: REQUEST_CONTRACT,
      handoffSchema: HANDOFF_SCHEMA,
      requiredCanonicalViews: ["front", "back", "left", "right", "three-quarter"],
      normalConvention: "opengl", orm: { r: "ao", g: "roughness", b: "metalness", a: "mask" },
      authority: authority(),
    };
  } else {
    if (!inputPath) fail("usage");
    const absolute = path.resolve(inputPath);
    const input = JSON.parse(await readFile(absolute, "utf8"));
    result = command === "compile"
      ? await compileReferenceHandoff(input, { baseDirectory: path.dirname(absolute) })
      : { valid: verifyReferenceHandoff(input), assetId: input.assetId, handoffSha256: input.handoffSha256 };
  }
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(path.resolve(outputPath), rendered, "utf8");
  process.stdout.write(rendered);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
