import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadSpriteProductionCensusFile } from "./sprite-production-census.mjs";

export const HMF_WORKSPACE_LAYOUT_SCHEMA = "evavo.heavy-metal-fighting-art-production-workspace.v1";
export const HMF_STYLE_CONTRACT_SCHEMA = "evavo.heavy-metal-fighting-style-authenticity-contract.v1";
export const HMF_BATCH_POLICY_SCHEMA = "evavo.heavy-metal-fighting-batch-production-policy.v1";
export const HMF_WORKSPACE_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONFIG_ROOT = path.join(ROOT, "config", "heavy-metal-fighting");
const LAYOUT_PATH = path.join(CONFIG_ROOT, "art-production-workspace.v1.json");
const STYLE_PATH = path.join(CONFIG_ROOT, "style-authenticity-contract.v1.json");
const BATCH_PATH = path.join(CONFIG_ROOT, "batch-production-policy.v1.json");
const CENSUS_PATH = path.join(CONFIG_ROOT, "sprite-production-census.v1.json");

const PERSISTENT_ROOTS = Object.freeze([
  "sources", "working", "versions", "masks", "scratch", "review", "masters", "exports", "manifests", "journals",
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ART_WORKSPACE_INVALID: ${message}`);
}
function assert(condition, message) { if (!condition) fail(message); }
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function safeRelative(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  assert(!value.includes("\\"), `${label} must use forward slashes.`);
  assert(!value.startsWith("/") && !/^[A-Za-z]:/.test(value), `${label} must be relative.`);
  const normalized = path.posix.normalize(value);
  assert(normalized === value && value !== "." && !value.startsWith("../") && !value.includes("/../"), `${label} is not canonical.`);
  return value;
}
async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while being read.`);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function uniqueStrings(values, label) {
  assert(Array.isArray(values), `${label} must be an array.`);
  const normalized = values.map((value, index) => safeRelative(value, `${label}[${index}]`));
  assert(new Set(normalized).size === normalized.length, `${label} contains duplicates.`);
  return normalized;
}
function expandTemplates(layout) {
  const directories = [...layout.directoryTemplates.fixed];
  for (const pilot of layout.subjects.pilots) {
    for (const template of layout.directoryTemplates.perPilot) directories.push(template.replaceAll("{pilot}", pilot));
  }
  for (const frame of layout.subjects.frames) {
    for (const template of layout.directoryTemplates.perFrame) directories.push(template.replaceAll("{frame}", frame));
  }
  for (const arena of layout.subjects.arenas) {
    for (const template of layout.directoryTemplates.perArena) directories.push(template.replaceAll("{arena}", arena));
  }
  const normalized = directories.map((entry, index) => safeRelative(entry, `expandedDirectories[${index}]`));
  assert(new Set(normalized).size === normalized.length, "expanded workspace directories contain duplicates.");
  return normalized.sort();
}
function validateLayout(layout) {
  assert(layout?.schema === HMF_WORKSPACE_LAYOUT_SCHEMA, `workspace schema must be ${HMF_WORKSPACE_LAYOUT_SCHEMA}.`);
  assert(layout.protocolVersion === HMF_WORKSPACE_PROTOCOL_VERSION, "workspace protocol version drifted.");
  assert(layout.projectId === "heavy-metal-fighting", "workspace project id drifted.");
  assert(JSON.stringify(layout.persistentWorkspaceRoots) === JSON.stringify(PERSISTENT_ROOTS), "persistent workspace roots must match the existing Art Studio workspace contract.");
  for (const [key, expected] of Object.entries({pilots:4,frames:4,arenas:4})) {
    assert(Array.isArray(layout.subjects?.[key]) && layout.subjects[key].length === expected, `${key} must contain exactly ${expected} canonical launch subjects.`);
    assert(new Set(layout.subjects[key]).size === expected, `${key} contains duplicates.`);
  }
  uniqueStrings(layout.directoryTemplates.fixed, "directoryTemplates.fixed");
  uniqueStrings(layout.directoryTemplates.perPilot, "directoryTemplates.perPilot");
  uniqueStrings(layout.directoryTemplates.perFrame, "directoryTemplates.perFrame");
  uniqueStrings(layout.directoryTemplates.perArena, "directoryTemplates.perArena");
  const directories = expandTemplates(layout);
  for (const directory of directories) {
    const top = directory.split("/")[0];
    assert(PERSISTENT_ROOTS.includes(top), `workspace directory ${directory} is outside the persistent workspace roots.`);
  }
  for (const frame of layout.subjects.frames) {
    for (const group of ["neutral-locomotion","defence-reactions","throws","normals","specials-overdrive","core-entrance-result"]) {
      assert(directories.includes(`working/frames/${frame}/sprites/${group}`), `${frame} is missing sprite group ${group}.`);
    }
  }
  assert(layout.authority?.providerExecution === false && layout.authority?.targetRepositoryMutation === false && layout.authority?.gitMutation === false, "workspace layout gained forbidden authority.");
  assert(layout.authority?.namedHumanApprovalRequired === true, "workspace layout must require named-human approval.");
  return freeze({ ...layout, expandedDirectories: freeze(directories) });
}
function validateStyle(style, census) {
  assert(style?.schema === HMF_STYLE_CONTRACT_SCHEMA, `style schema must be ${HMF_STYLE_CONTRACT_SCHEMA}.`);
  assert(style.protocolVersion === HMF_WORKSPACE_PROTOCOL_VERSION, "style protocol version drifted.");
  assert(style.projectId === "heavy-metal-fighting", "style project id drifted.");
  assert(style.pixelGrammar?.finalFrameCell?.width === census.productionMasterV3.cell.width && style.pixelGrammar.finalFrameCell.height === census.productionMasterV3.cell.height, "style native cell must match sprite census.");
  assert(style.pixelGrammar?.pivot?.x === census.productionMasterV3.pivot.x && style.pixelGrammar.pivot.y === census.productionMasterV3.pivot.y, "style pivot must match sprite census.");
  assert(style.pixelGrammar?.authoringCanvas?.width === census.project.authoringCanvas.width && style.pixelGrammar.authoringCanvas.height === census.project.authoringCanvas.height, "style authoring canvas must match sprite census.");
  assert(Array.isArray(style.antiGenericFailureCodes) && style.antiGenericFailureCodes.length >= 18, "style contract needs a substantial anti-generic failure vocabulary.");
  assert(new Set(style.antiGenericFailureCodes).size === style.antiGenericFailureCodes.length, "anti-generic failure codes must be unique.");
  for (const required of ["random-greebles","weapon-side-drift","pilot-face-drift","generated-or-malformed-text","modern-pbr-gloss","provider-packed-final-atlas"]) {
    assert(style.antiGenericFailureCodes.includes(required), `style contract is missing failure code ${required}.`);
  }
  assert(style.authority?.providerMayDefineStyle === false && style.authority?.providerMayApprove === false && style.authority?.namedHumanApprovalRequired === true, "style authority boundary drifted.");
  return freeze(style);
}
function validateBatchPolicy(policy, census) {
  assert(policy?.schema === HMF_BATCH_POLICY_SCHEMA, `batch schema must be ${HMF_BATCH_POLICY_SCHEMA}.`);
  assert(policy.protocolVersion === HMF_WORKSPACE_PROTOCOL_VERSION, "batch protocol version drifted.");
  assert(policy.maximumImagesPerBatch === 10, "batch size must remain exactly ten maximum images.");
  assert(policy.paddingForbidden === true && policy.oneAssetPerOutput === true && policy.contactSheetsForbidden === true && policy.providerPackedAtlasesForbidden === true, "batch output boundaries drifted.");
  const bodyCels = policy.frameAnimationProductionGroups.reduce((sum, group) => sum + group.celsPerFrame, 0);
  const bodyBatches = policy.frameAnimationProductionGroups.reduce((sum, group) => sum + group.batchesPerFrame, 0);
  assert(bodyCels === census.productionMasterV3.usedBodySlotsPerFrame, `Frame batch groups cover ${bodyCels} cels instead of ${census.productionMasterV3.usedBodySlotsPerFrame}.`);
  assert(bodyBatches === 26, "each Frame must remain 26 coherent body-animation batches under the six production groups.");
  const supportingImages = policy.supportingFamilyPacking.reduce((sum, family) => sum + family.sourceImages, 0);
  const supportingBatches = policy.supportingFamilyPacking.reduce((sum, family) => sum + family.minimumBatches, 0);
  assert(supportingImages + census.productionMasterV3.launchBodyCels === census.productionTotals.productionMasterSourceImages, "batch policy source-image totals do not match the production census.");
  assert(policy.authority?.providerExecution === false && policy.authority?.automaticPromotion === false && policy.authority?.namedHumanApprovalRequired === true, "batch authority boundary drifted.");
  return freeze({ ...policy, derived: freeze({ bodyBatchesPerFrame: bodyBatches, bodyAnimationBatches: bodyBatches * census.productionMasterV3.launchFrames, supportingBatches, minimumGovernedBatches: (bodyBatches * census.productionMasterV3.launchFrames) + supportingBatches, theoreticalUncontainedMinimumBatches: Math.ceil(census.productionTotals.productionMasterSourceImages / policy.maximumImagesPerBatch) }) });
}

export async function loadHmfArtProductionWorkspace() {
  const [layoutRaw, styleRaw, batchRaw, census] = await Promise.all([
    readStableJson(LAYOUT_PATH, "workspace layout"),
    readStableJson(STYLE_PATH, "style authenticity contract"),
    readStableJson(BATCH_PATH, "batch production policy"),
    loadSpriteProductionCensusFile(CENSUS_PATH),
  ]);
  const layout = validateLayout(layoutRaw);
  const style = validateStyle(styleRaw, census);
  const batchPolicy = validateBatchPolicy(batchRaw, census);
  return freeze({ layout, style, batchPolicy, census });
}

export async function heavyMetalFightingWorkspaceLayout() {
  const loaded = await loadHmfArtProductionWorkspace();
  return freeze({
    schema: "evavo.heavy-metal-fighting-art-workspace-layout-summary.v1",
    projectId: loaded.layout.projectId,
    roots: loaded.layout.persistentWorkspaceRoots,
    directoryCount: loaded.layout.expandedDirectories.length,
    directories: loaded.layout.expandedDirectories,
    subjects: loaded.layout.subjects,
    fileNaming: loaded.layout.fileNaming,
    workspaceRules: loaded.layout.workspaceRules,
    authority: loaded.layout.authority,
  });
}
export async function heavyMetalFightingStyleContract() {
  const loaded = await loadHmfArtProductionWorkspace();
  return loaded.style;
}
export async function heavyMetalFightingBatchPolicy() {
  const loaded = await loadHmfArtProductionWorkspace();
  return loaded.batchPolicy;
}
export async function verifyHmfArtProductionWorkspace() {
  const loaded = await loadHmfArtProductionWorkspace();
  const checks = [
    ["production-source-images", loaded.census.productionTotals.productionMasterSourceImages === 1573],
    ["production-body-cels", loaded.census.productionMasterV3.launchBodyCels === 896],
    ["native-cell", loaded.census.productionMasterV3.cell.width === 160 && loaded.census.productionMasterV3.cell.height === 160],
    ["batch-size", loaded.batchPolicy.maximumImagesPerBatch === 10],
    ["body-batches", loaded.batchPolicy.derived.bodyAnimationBatches === 104],
    ["minimum-governed-batches", loaded.batchPolicy.derived.minimumGovernedBatches === 179],
    ["workspace-roots", JSON.stringify(loaded.layout.persistentWorkspaceRoots) === JSON.stringify(PERSISTENT_ROOTS)],
    ["style-failure-vocabulary", loaded.style.antiGenericFailureCodes.length >= 18],
    ["human-approval", loaded.layout.authority.namedHumanApprovalRequired && loaded.style.authority.namedHumanApprovalRequired && loaded.batchPolicy.authority.namedHumanApprovalRequired],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({ schema: "evavo.heavy-metal-fighting-art-production-workspace-verification.v1", status: checks.every((check) => check.passed) ? "passed" : "failed", checks, failed: checks.filter((check) => !check.passed), directoryCount: loaded.layout.expandedDirectories.length, batchSummary: loaded.batchPolicy.derived });
}

async function requireDirectoryNoSymlink(candidate, label) {
  const metadata = await lstat(candidate).catch(() => null);
  assert(metadata?.isDirectory() && !metadata.isSymbolicLink(), `${label} must be an existing non-symlink directory: ${candidate}`);
}
async function createSafeDirectoryChain(root, relative) {
  let current = root;
  let created = 0;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    let metadata = await lstat(current).catch(() => null);
    if (!metadata) {
      await mkdir(current, { recursive: false, mode: 0o700 });
      created += 1;
      metadata = await lstat(current);
    }
    assert(metadata.isDirectory() && !metadata.isSymbolicLink(), `workspace path component is not a safe directory: ${current}`);
  }
  return created;
}
export async function materializeHmfArtProductionWorkspace(workspaceRoot) {
  const loaded = await loadHmfArtProductionWorkspace();
  const root = path.resolve(String(workspaceRoot ?? ""));
  assert(root && root !== path.parse(root).root, "workspaceRoot must be a specific existing persistent Artist Workspace root.");
  await requireDirectoryNoSymlink(root, "workspaceRoot");
  for (const required of PERSISTENT_ROOTS) await requireDirectoryNoSymlink(path.join(root, required), `persistent root ${required}`);
  let createdDirectories = 0;
  for (const relative of loaded.layout.expandedDirectories) createdDirectories += await createSafeDirectoryChain(root, relative);
  return freeze({ schema: "evavo.heavy-metal-fighting-art-production-workspace-materialize-receipt.v1", status: "passed", workspaceRoot: root, requestedDirectories: loaded.layout.expandedDirectories.length, createdDirectories, existingOrCreatedDirectories: loaded.layout.expandedDirectories.length, authority: { providerExecution: false, candidateApproval: false, targetRepositoryMutation: false, publication: false } });
}
