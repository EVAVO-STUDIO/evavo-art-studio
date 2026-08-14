import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  FORBIDDEN_AUTHORITY_KEYS,
  GAME_ART_PRODUCTION_PROTOCOL_VERSION,
  GAME_ART_PRODUCTION_RESOLVED_PROJECT_SCHEMA,
  GAME_ART_PRODUCTION_WORK_ORDER_SCHEMA,
  PATH_TOKEN_PATTERN,
  PROFILE_ROOT,
  PROJECT_ROOT,
  assert,
  freeze,
  id,
  integer,
  object,
  readStableJson,
  safeConfigFile,
  sha256,
  string,
} from "./common.mjs";
import { validateGameArtProductionProfile } from "./profile-validation.mjs";
import { resolveGameArtProductionProject } from "./project-resolution.mjs";

export async function loadGameArtProductionProfile(profileId) {
  const filePath = await safeConfigFile(PROFILE_ROOT, profileId, "profileId");
  return validateGameArtProductionProfile(await readStableJson(filePath, `game-art profile ${profileId}`));
}

export async function loadGameArtProductionProjectBinding(projectId) {
  const filePath = await safeConfigFile(PROJECT_ROOT, projectId, "projectId");
  return readStableJson(filePath, `game-art project ${projectId}`);
}

export async function compileGameArtProductionProject(projectId) {
  const rawProject = await loadGameArtProductionProjectBinding(projectId);
  const profile = await loadGameArtProductionProfile(rawProject.profileId);
  return resolveGameArtProductionProject({ profile, project: rawProject });
}

function safePathToken(value, label) {
  const text = String(value ?? "");
  assert(text.length >= 1 && text.length <= 300, `${label} must be a non-empty bounded token.`);
  assert(/^[A-Za-z0-9._-]+$/u.test(text) && text !== "." && text !== ".." && !text.includes(".."), `${label} contains unsafe path characters.`);
  return text;
}

export function renderGameArtPathTemplate(template, tokens, label = "path template") {
  const supplied = object(tokens, `${label} tokens`);
  const rendered = template.replace(PATH_TOKEN_PATTERN, (_, tokenName, width) => {
    assert(Object.hasOwn(supplied, tokenName), `${label} requires token ${tokenName}.`);
    if (width) {
      const number = integer(supplied[tokenName], `${label}.${tokenName}`, 0, Number.MAX_SAFE_INTEGER);
      return String(number).padStart(Number(width), "0");
    }
    return safePathToken(supplied[tokenName], `${label}.${tokenName}`);
  });
  assert(!rendered.includes("{") && !rendered.includes("}"), `${label} contains an unresolved token.`);
  assert(!rendered.includes("\\") && !path.posix.isAbsolute(rendered), `${label} rendered an unsafe path.`);
  const normalized = path.posix.normalize(rendered);
  assert(normalized === rendered && !normalized.startsWith("../") && normalized !== ".", `${label} rendered outside its governed root.`);
  return rendered;
}

function allSubjects(project) {
  return new Set(Object.values(project.subjectGroups).flat());
}

export function resolveGameArtAssetType(project, requestedAssetTypeId) {
  const requested = id(requestedAssetTypeId, "assetTypeId");
  const resolvedAssetTypeId = project.assetTypeAliases[requested] ?? requested;
  const assetType = project.assetTypes[resolvedAssetTypeId];
  assert(assetType, `project ${project.projectId} does not support asset type ${requested}.`);
  return freeze({ requestedAssetTypeId: requested, resolvedAssetTypeId, assetType });
}

function authoringScaleDescription(asset) {
  const scale = asset.authoringScale;
  if (scale.policy === "exact") return "exact native-size authoring";
  if (scale.uniform) return `${scale.policy} ${scale.x}x authoring`;
  return `${scale.policy} ${scale.x}x by ${scale.y}x authoring`;
}

function promptFor(project, asset, input, output) {
  const pivot = asset.pivot ? ` Pivot ${asset.pivot.x},${asset.pivot.y}.` : "";
  const ground = asset.groundLineY === null ? "" : ` Ground line ${asset.groundLineY}.`;
  const format = project.defaults.imageFormat.toUpperCase();
  return [
    `ORIGINAL GOVERNED GAME ART FOR ${project.title}.`,
    `PRODUCTION PROFILE: ${project.profileLabel} (${project.profileId}); game type ${project.gameType}; era ${project.era}; rendering model ${project.defaults.renderingModel}.`,
    `STYLE DIRECTION: ${project.styleDirection}`,
    `ASSET: ${asset.id}; kind ${asset.kind}; subject ${input.subjectId}; production group ${input.productionGroup}; unit ${input.unitId}.`,
    `CREATIVE INTENT: ${input.creativeIntent}`,
    `PROFILE RULES: ${asset.promptFragments.join("; ")}.`,
    `TECHNICAL LOCK: ${asset.nativeDimensions.width}x${asset.nativeDimensions.height} native ${format}; ${asset.authoringCanvas.width}x${asset.authoringCanvas.height} authoring canvas; ${authoringScaleDescription(asset)}; alpha ${asset.alpha}; ${project.defaults.textureFiltering} texture filtering.${pivot}${ground}`,
    `OUTPUT TARGETS: candidate ${output.working}; master ${output.master}.`,
    `QA AND REVIEW: ${asset.qaChecks.join("; ")}. Review preset ${asset.reviewPreset}. Failure vocabulary: ${asset.failureCodes.join("; ")}.`,
    "OUTPUT EXACTLY ONE SEPARATE ASSET. No contact sheet, sprite sheet, storyboard panel, multi-panel composition, generated labels, extra variants, automatic approval, promotion, repository mutation or publication.",
  ].join("\n\n");
}

function normalizeReferences(input) {
  const references = input === undefined ? {} : object(input, "referenceBindings");
  const normalized = {};
  for (const [key, value] of Object.entries(references)) {
    assert(/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key), `referenceBindings key ${key} is invalid.`);
    normalized[key] = string(value, `referenceBindings.${key}`, 1, 1600);
  }
  return freeze(normalized);
}

export async function compileGameArtProductionWorkOrder({
  projectId,
  resolvedProject,
  assetTypeId,
  unitId,
  subjectId,
  productionGroup,
  tokens = {},
  creativeIntent,
  referenceBindings,
} = {}) {
  const project = resolvedProject ?? await compileGameArtProductionProject(projectId);
  assert(project?.schema === GAME_ART_PRODUCTION_RESOLVED_PROJECT_SCHEMA, "resolvedProject is not a governed game-art production project.");
  const unit = safePathToken(unitId, "unitId");
  const subject = id(subjectId, "subjectId");
  assert(allSubjects(project).has(subject), `subjectId ${subject} is not declared by project ${project.projectId}.`);
  const group = id(productionGroup, "productionGroup");
  const intent = string(creativeIntent, "creativeIntent", 10, 6000);
  const resolved = resolveGameArtAssetType(project, assetTypeId);
  const pathTokens = {
    ...tokens,
    projectId: project.projectId,
    profileId: project.profileId,
    assetTypeId: resolved.resolvedAssetTypeId,
    unitId: unit,
    subjectId: subject,
    productionGroup: group,
  };
  const output = freeze({
    working: renderGameArtPathTemplate(resolved.assetType.pathTemplate, pathTokens, "asset working path"),
    master: renderGameArtPathTemplate(resolved.assetType.masterPathTemplate, pathTokens, "asset master path"),
  });
  assert(output.working.startsWith("working/") && output.master.startsWith("masters/"), "work-order outputs escaped their governed roots.");
  const body = {
    schema: GAME_ART_PRODUCTION_WORK_ORDER_SCHEMA,
    protocolVersion: GAME_ART_PRODUCTION_PROTOCOL_VERSION,
    projectId: project.projectId,
    title: project.title,
    profileId: project.profileId,
    profileSha256: project.profileSha256,
    projectBindingSha256: project.projectBindingSha256,
    resolvedProjectSha256: project.resolvedProjectSha256,
    requestedAssetTypeId: resolved.requestedAssetTypeId,
    assetTypeId: resolved.resolvedAssetTypeId,
    unitId: unit,
    subjectId: subject,
    productionGroup: group,
    creativeIntent: intent,
    assetContract: resolved.assetType,
    output,
    referenceBindings: normalizeReferences(referenceBindings),
    lifecycle: project.lifecycle,
    renderingContract: freeze({
      model: project.defaults.renderingModel,
      imageFormat: project.defaults.imageFormat,
      textureFiltering: project.defaults.textureFiltering,
      authoringScalePolicy: resolved.assetType.authoringScalePolicy,
    }),
    candidatePolicy: freeze({
      candidateFanout: project.defaults.candidateFanout,
      maximumRepairAttempts: project.defaults.maximumRepairAttempts,
      providerFallbackAllowed: project.defaults.providerFallbackAllowed,
      oneAssetPerOutput: project.defaults.oneAssetPerOutput,
    }),
    providerPrompt: "",
    authority: project.authority,
  };
  body.providerPrompt = promptFor(project, resolved.assetType, body, output);
  return freeze({ ...body, workOrderSha256: sha256(body) });
}

async function idsIn(directory, label) {
  const entries = await readdir(directory, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".v1.json"))
    .map((entry) => entry.name.slice(0, -".v1.json".length))
    .sort();
  assert(ids.length >= 1, `${label} contains no config files.`);
  ids.forEach((entry) => id(entry, `${label} file id`));
  return ids;
}

export async function verifyGameArtProductionProfiles() {
  const profileIds = await idsIn(PROFILE_ROOT, "game-art profile directory");
  const projectIds = await idsIn(PROJECT_ROOT, "game-art project directory");
  const profiles = await Promise.all(profileIds.map(loadGameArtProductionProfile));
  const projects = await Promise.all(projectIds.map(compileGameArtProductionProject));
  const checks = freeze([
    freeze({ id: "multiple-game-types", passed: new Set(profiles.map((profile) => profile.gameType)).size >= 3 }),
    freeze({ id: "multiple-rendering-models", passed: new Set(profiles.map((profile) => profile.defaults.renderingModel)).size >= 2 }),
    freeze({ id: "profile-controlled-filtering", passed: profiles.some((profile) => profile.defaults.textureFiltering === "nearest") && profiles.some((profile) => profile.defaults.textureFiltering === "linear") }),
    freeze({ id: "multiple-project-bindings", passed: projects.length >= 3 }),
    freeze({ id: "all-projects-profile-bound", passed: projects.every((project) => profileIds.includes(project.profileId)) }),
    freeze({ id: "all-profiles-data-driven", passed: profiles.every((profile) => Object.keys(profile.assetTypes).length >= 4) }),
    freeze({ id: "single-candidate-default", passed: profiles.every((profile) => profile.defaults.candidateFanout === 1) }),
    freeze({ id: "human-gated-lifecycle", passed: profiles.every((profile) => profile.lifecycle.filter((state) => state.requiresHuman).length >= 2) }),
    freeze({ id: "no-write-authority", passed: projects.every((project) => FORBIDDEN_AUTHORITY_KEYS.every((key) => project.authority[key] === false)) }),
  ]);
  const failed = freeze(checks.filter((check) => !check.passed));
  return freeze({
    schema: "evavo.game-art-production-profile-verification.v1",
    protocolVersion: GAME_ART_PRODUCTION_PROTOCOL_VERSION,
    status: failed.length ? "failed" : "passed",
    profileCount: profiles.length,
    projectCount: projects.length,
    profiles: freeze(profiles.map((profile) => freeze({
      profileId: profile.profileId,
      gameType: profile.gameType,
      era: profile.era,
      renderingModel: profile.defaults.renderingModel,
      textureFiltering: profile.defaults.textureFiltering,
      authoringScalePolicy: profile.defaults.authoringScalePolicy,
      assetTypeCount: Object.keys(profile.assetTypes).length,
      profileSha256: profile.profileSha256,
    }))),
    projects: freeze(projects.map((project) => freeze({
      projectId: project.projectId,
      profileId: project.profileId,
      resolvedProjectSha256: project.resolvedProjectSha256,
    }))),
    checks,
    failed,
    authority: freeze({
      profileDiscovery: true,
      projectResolution: true,
      workOrderCompilation: true,
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
