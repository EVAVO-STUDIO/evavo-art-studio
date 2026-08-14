import {
  ALLOWED_ASSET_OVERRIDE_KEYS,
  ALLOWED_PRODUCTION_DEFAULT_KEYS,
  FORBIDDEN_AUTHORITY_KEYS,
  GAME_ART_PRODUCTION_PROJECT_SCHEMA,
  GAME_ART_PRODUCTION_PROTOCOL_VERSION,
  GAME_ART_PRODUCTION_RESOLVED_PROJECT_SCHEMA,
  array,
  assert,
  assertKnownKeys,
  freeze,
  id,
  integer,
  jsonClone,
  object,
  safeTemplate,
  sha256,
  string,
  uniqueStrings,
  validateAuthority,
} from "./common.mjs";
import { validateAssetType, validateGameArtProductionProfile } from "./profile-validation.mjs";

function validateSubjectGroups(input, label) {
  const groups = object(input, label);
  assert(Object.keys(groups).length >= 1, `${label} must contain at least one group.`);
  const normalized = {};
  const allSubjects = [];
  for (const [groupId, values] of Object.entries(groups)) {
    id(groupId, `${label} key`);
    normalized[groupId] = freeze(uniqueStrings(values, `${label}.${groupId}`, { identifiers: true }));
    allSubjects.push(...normalized[groupId]);
  }
  assert(new Set(allSubjects).size === allSubjects.length, `${label} may not place one subject in multiple groups.`);
  return freeze(normalized);
}

function validateProjectAuthority(input, profileAuthority) {
  const authority = validateAuthority(input, "project.authority");
  for (const key of FORBIDDEN_AUTHORITY_KEYS) {
    assert(profileAuthority[key] === false && authority[key] === false, `project authority may not escalate ${key}.`);
  }
  return authority;
}

function validateAssetAliases(input, profile, label) {
  const aliases = object(input, label);
  assert(Object.keys(aliases).length >= 1, `${label} must contain at least one alias.`);
  const normalized = {};
  for (const [aliasId, profileAssetTypeId] of Object.entries(aliases)) {
    id(aliasId, `${label} key`);
    const target = id(profileAssetTypeId, `${label}.${aliasId}`);
    assert(profile.assetTypes[target], `${label}.${aliasId} references unknown asset type ${target}.`);
    normalized[aliasId] = target;
  }
  return freeze(normalized);
}

function mergeAssetType(base, override, reviewPresets, assetTypeId) {
  if (!override) return base;
  const raw = object(override, `project.assetTypeOverrides.${assetTypeId}`);
  assertKnownKeys(raw, ALLOWED_ASSET_OVERRIDE_KEYS, `project.assetTypeOverrides.${assetTypeId}`);
  const merged = {
    ...jsonClone(base),
    ...jsonClone(raw),
  };
  delete merged.id;
  delete merged.authoringScale;
  if (raw.promptFragments) merged.promptFragments = [...base.promptFragments, ...raw.promptFragments];
  return validateAssetType(assetTypeId, merged, reviewPresets, `resolved.assetTypes.${assetTypeId}`);
}

function validateProductionDefaults(input, profileDefaults) {
  const value = input === undefined ? {} : object(input, "project.productionDefaults");
  assertKnownKeys(value, ALLOWED_PRODUCTION_DEFAULT_KEYS, "project.productionDefaults");
  const result = {
    ...profileDefaults,
    batchSize: value.batchSize ?? profileDefaults.batchSize,
    candidateFanout: value.candidateFanout ?? profileDefaults.candidateFanout,
    maximumRepairAttempts: value.maximumRepairAttempts ?? profileDefaults.maximumRepairAttempts,
  };
  integer(result.batchSize, "resolved.defaults.batchSize", 1, profileDefaults.batchSize);
  integer(result.candidateFanout, "resolved.defaults.candidateFanout", 1, profileDefaults.candidateFanout);
  integer(result.maximumRepairAttempts, "resolved.defaults.maximumRepairAttempts", 1, profileDefaults.maximumRepairAttempts);
  return freeze(result);
}

function validateReferenceContract(input) {
  const value = object(input, "project.referenceContract");
  const roots = object(value.subjectRootTemplates, "project.referenceContract.subjectRootTemplates");
  const subjectRootTemplates = {};
  for (const [groupId, template] of Object.entries(roots)) {
    id(groupId, "project.referenceContract.subjectRootTemplates key");
    subjectRootTemplates[groupId] = safeTemplate(template, `project.referenceContract.subjectRootTemplates.${groupId}`, "working");
  }
  const styleRoot = string(value.styleRoot, "project.referenceContract.styleRoot", 1, 1000);
  safeTemplate(`${styleRoot}/{unitId}`, "project.referenceContract.styleRoot", "working");
  return freeze({
    styleRoot,
    subjectRootTemplates: freeze(subjectRootTemplates),
    continuityAuthority: string(value.continuityAuthority, "project.referenceContract.continuityAuthority", 10, 2000),
  });
}

export function validateGameArtProductionProjectBinding(input, profile) {
  const raw = object(input, "project");
  assert(raw.schema === GAME_ART_PRODUCTION_PROJECT_SCHEMA, `project.schema must equal ${GAME_ART_PRODUCTION_PROJECT_SCHEMA}.`);
  assert(raw.protocolVersion === GAME_ART_PRODUCTION_PROTOCOL_VERSION, "project.protocolVersion drifted.");
  const projectId = id(raw.projectId, "project.projectId");
  const profileId = id(raw.profileId, "project.profileId");
  assert(profile.profileId === profileId, `project ${projectId} requires profile ${profileId}, not ${profile.profileId}.`);
  const subjectGroups = validateSubjectGroups(raw.subjectGroups, "project.subjectGroups");
  const assetTypeAliases = validateAssetAliases(raw.assetTypeAliases, profile, "project.assetTypeAliases");
  const rawOverrides = raw.assetTypeOverrides === undefined ? {} : object(raw.assetTypeOverrides, "project.assetTypeOverrides");
  for (const assetTypeId of Object.keys(rawOverrides)) {
    assert(profile.assetTypes[assetTypeId], `project.assetTypeOverrides references unknown profile asset type ${assetTypeId}.`);
  }
  const authority = validateProjectAuthority(raw.authority, profile.authority);
  const body = {
    schema: GAME_ART_PRODUCTION_PROJECT_SCHEMA,
    protocolVersion: GAME_ART_PRODUCTION_PROTOCOL_VERSION,
    projectId,
    title: string(raw.title, "project.title", 2, 300),
    profileId,
    targetRepository: string(raw.targetRepository, "project.targetRepository", 3, 300),
    styleDirection: string(raw.styleDirection, "project.styleDirection", 20, 8000),
    subjectGroups,
    assetTypeAliases,
    productionDefaults: validateProductionDefaults(raw.productionDefaults, profile.defaults),
    assetTypeOverrides: freeze(jsonClone(rawOverrides)),
    referenceContract: validateReferenceContract(raw.referenceContract),
    metadata: freeze(jsonClone(raw.metadata ?? {})),
    authority,
  };
  return freeze({ ...body, projectBindingSha256: sha256(body) });
}

export function resolveGameArtProductionProject({ profile: profileInput, project: projectInput } = {}) {
  const profile = validateGameArtProductionProfile(profileInput);
  const project = validateGameArtProductionProjectBinding(projectInput, profile);
  const assetTypes = Object.fromEntries(Object.entries(profile.assetTypes).map(([assetTypeId, assetType]) => [
    assetTypeId,
    mergeAssetType(assetType, project.assetTypeOverrides[assetTypeId], profile.reviewPresets, assetTypeId),
  ]));
  const body = {
    schema: GAME_ART_PRODUCTION_RESOLVED_PROJECT_SCHEMA,
    protocolVersion: GAME_ART_PRODUCTION_PROTOCOL_VERSION,
    projectId: project.projectId,
    title: project.title,
    profileId: profile.profileId,
    profileLabel: profile.label,
    gameType: profile.gameType,
    era: profile.era,
    tags: profile.tags,
    targetRepository: project.targetRepository,
    styleDirection: project.styleDirection,
    profileSha256: profile.profileSha256,
    projectBindingSha256: project.projectBindingSha256,
    defaults: project.productionDefaults,
    lifecycle: profile.lifecycle,
    reviewPresets: profile.reviewPresets,
    assetTypes: freeze(assetTypes),
    assetTypeAliases: project.assetTypeAliases,
    subjectGroups: project.subjectGroups,
    referenceContract: project.referenceContract,
    metadata: project.metadata,
    authority: project.authority,
  };
  return freeze({ ...body, resolvedProjectSha256: sha256(body) });
}
