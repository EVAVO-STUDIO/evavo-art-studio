#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REQUEST_CONTRACT = "evavo_art_asset_fabricator_material_request_v1";
export const HANDOFF_SCHEMA = "evavo.art.asset-fabricator-material-handoff.v1";
export const PROTOCOL_VERSION = "2026-08-16.3";
export const REQUIRED_OUTPUTS = Object.freeze([
  "base-color", "height", "normal", "roughness", "metalness", "ao",
  "curvature", "thickness", "wear-mask", "dirt-mask", "damage-mask",
]);
const ID = /^[a-z0-9][a-z0-9-]{1,127}$/u;
const SHA = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(`EVAVO_ART_ASSET_FABRICATOR_INVALID:${message}`); }
function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}:object-required`); return value; }
function exact(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}:field-closure`);
}
function id(value, label) { if (typeof value !== "string" || !ID.test(value)) fail(`${label}:invalid-id`); return value; }
function safePath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0")) fail(`${label}:invalid-path`);
  return value;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
export function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
export function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function sha256Bytes(value) { return createHash("sha256").update(value).digest("hex"); }

async function evidence(filePath, baseDirectory, label) {
  const absolute = path.resolve(baseDirectory, safePath(filePath, label));
  const bytes = await readFile(absolute);
  if (bytes.length < 1 || bytes.length > 64 * 1024 * 1024) fail(`${label}:unsafe-size`);
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label}:json-required`); }
  const contractVersion = document.contractVersion ?? document.schema;
  if (typeof contractVersion !== "string" || contractVersion.length < 3) fail(`${label}:contract-version-required`);
  return { path: absolute, sha256: sha256Bytes(bytes), bytes: bytes.length, contractVersion };
}

function authority() {
  return {
    providerExecution: false,
    automaticCreativeApproval: false,
    imageMutation: false,
    automaticTextureBake: false,
    automaticMaterialAssembly: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    namedHumanApprovalRequired: true,
  };
}

export async function compileMaterialHandoff(request, { baseDirectory = process.cwd() } = {}) {
  exact(request, ["contractVersion", "assetId", "subjectId", "materialProgramPath", "bindings"], "request");
  if (request.contractVersion !== REQUEST_CONTRACT) fail("request:version");
  const assetId = id(request.assetId, "assetId");
  const subjectId = id(request.subjectId, "subjectId");
  const source = await evidence(request.materialProgramPath, baseDirectory, "materialProgram");
  if (!Array.isArray(request.bindings) || request.bindings.length < 1 || request.bindings.length > 64) fail("bindings:count");
  const seen = new Set();
  const bindings = request.bindings.map((raw, index) => {
    exact(raw, ["materialId", "graphId", "slotPattern"], `bindings[${index}]`);
    const materialId = id(raw.materialId, `bindings[${index}].materialId`);
    if (seen.has(materialId)) fail("bindings:duplicate-material");
    seen.add(materialId);
    const graphId = id(raw.graphId, `bindings[${index}].graphId`);
    if (typeof raw.slotPattern !== "string" || raw.slotPattern.length < 1 || raw.slotPattern.length > 256) fail("bindings:slot-pattern");
    return {
      materialId,
      graphId,
      slotPattern: raw.slotPattern,
      outputs: [...REQUIRED_OUTPUTS],
      normalConvention: "opengl",
      orm: { r: "ao", g: "roughness", b: "metalness" },
    };
  }).sort((a, b) => a.materialId.localeCompare(b.materialId));
  const body = {
    schema: HANDOFF_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    producer: "EVAVO-STUDIO/evavo-art-studio",
    assetId,
    subjectId,
    source,
    bindings,
    target: {
      assetDoctorMaterialHandoff: true,
      semanticMaterialBake: true,
      semanticMaterialAssembly: true,
      godotMetallicRoughness: true,
    },
    authority: authority(),
  };
  return { ...body, handoffSha256: sha256(body) };
}

export function verifyMaterialHandoff(document) {
  exact(document, ["schema", "protocolVersion", "producer", "assetId", "subjectId", "source", "bindings", "target", "authority", "handoffSha256"], "handoff");
  if (document.schema !== HANDOFF_SCHEMA || document.protocolVersion !== PROTOCOL_VERSION || document.producer !== "EVAVO-STUDIO/evavo-art-studio") fail("handoff:identity");
  if (!SHA.test(document.handoffSha256)) fail("handoff:sha-format");
  const body = { ...document }; delete body.handoffSha256;
  if (sha256(body) !== document.handoffSha256) fail("handoff:sha-mismatch");
  if (!Array.isArray(document.bindings) || document.bindings.length < 1) fail("handoff:bindings");
  for (const binding of document.bindings) {
    if (JSON.stringify(binding.outputs) !== JSON.stringify(REQUIRED_OUTPUTS)) fail("handoff:output-closure");
    if (binding.normalConvention !== "opengl" || canonicalJson(binding.orm) !== canonicalJson({ r: "ao", g: "roughness", b: "metalness" })) fail("handoff:packing");
  }
  if (canonicalJson(document.authority) !== canonicalJson(authority())) fail("handoff:authority");
  return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  const outputIndex = rest.indexOf("--output");
  const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) fail("usage");
  const absolute = path.resolve(inputPath);
  const input = JSON.parse(await readFile(absolute, "utf8"));
  const result = command === "compile"
    ? await compileMaterialHandoff(input, { baseDirectory: path.dirname(absolute) })
    : { valid: verifyMaterialHandoff(input), assetId: input.assetId, handoffSha256: input.handoffSha256 };
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(path.resolve(outputPath), rendered, "utf8");
  process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
