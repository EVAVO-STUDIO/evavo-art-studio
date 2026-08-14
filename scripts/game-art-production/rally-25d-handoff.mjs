#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";

export const RALLY_ART_HANDOFF_SCHEMA = "evavo.rally-art-handoff.v1";
export const RALLY_ART_HANDOFF_PROTOCOL_VERSION = "2026-08-14.1";
export const RALLY_ART_PROJECT_ID = "isometric-rally-1990s";

const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const FAMILY_PLANS = Object.freeze({
  vehicle: Object.freeze({
    subjectGroup: "vehicles",
    deliverables: Object.freeze([
      Object.freeze({ alias: "vehicle-concept", group: "concept", suffix: "concept", role: "shape-language" }),
      Object.freeze({ alias: "vehicle-turnaround", group: "turnaround", suffix: "turnaround", role: "modeling-reference" }),
      Object.freeze({ alias: "vehicle-material", group: "materials", suffix: "materials", role: "uv-material-reference" }),
      Object.freeze({ alias: "vehicle-damage", group: "damage", suffix: "damage", role: "rig-damage-reference" }),
    ]),
    downstreamProfile: "rally-vehicle-rig-v1",
  }),
  environment: Object.freeze({
    subjectGroup: "environments",
    deliverables: Object.freeze([
      Object.freeze({ alias: "environment-key", group: "key-art", suffix: "key-art", role: "world-composition" }),
      Object.freeze({ alias: "terrain-material", group: "terrain", suffix: "terrain", role: "terrain-material-reference" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-environment-kit-v1",
  }),
  structure: Object.freeze({
    subjectGroup: "structures",
    deliverables: Object.freeze([
      Object.freeze({ alias: "structure-sheet", group: "modules", suffix: "modules", role: "modular-modeling-reference" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-modular-structure-v1",
  }),
  prop: Object.freeze({
    subjectGroup: "props",
    deliverables: Object.freeze([
      Object.freeze({ alias: "prop-turnaround", group: "turnaround", suffix: "turnaround", role: "prop-modeling-reference" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-prop-v1",
  }),
  character: Object.freeze({
    subjectGroup: "characters",
    deliverables: Object.freeze([
      Object.freeze({ alias: "character-sheet", group: "reference", suffix: "reference", role: "character-rig-reference" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-crowd-character-v1",
  }),
  fauna: Object.freeze({
    subjectGroup: "fauna",
    deliverables: Object.freeze([
      Object.freeze({ alias: "fauna-turnaround", group: "turnaround", suffix: "turnaround", role: "fauna-rig-reference" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-fauna-v1",
  }),
  vfx: Object.freeze({
    subjectGroup: "effects",
    deliverables: Object.freeze([
      Object.freeze({ alias: "vfx-shape", group: "shape", suffix: "shape", role: "effect-shape-timing" }),
      Object.freeze({ alias: "shader-lookdev", group: "lookdev", suffix: "lookdev", role: "runtime-shader-reference" }),
    ]),
    downstreamProfile: "rally-vfx-v1",
  }),
});

function assert(condition, message) {
  if (!condition) throw new Error(`RALLY_25D_ART_HANDOFF_INVALID: ${message}`);
}

function id(value, label) {
  assert(typeof value === "string" && value.trim() === value && ID_PATTERN.test(value), `${label} must be a lowercase kebab-case identifier.`);
  return value;
}

function text(value, label, minimum = 10, maximum = 6000) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a trimmed string.`);
  assert(value.length >= minimum && value.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  return value;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sorted(value), null, 2)}\n`).digest("hex");
}

function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object") Object.values(value).forEach(frozen);
  return Object.freeze(value);
}

function hasSubject(project, groupId, subjectId) {
  return Array.isArray(project.subjectGroups[groupId]) && project.subjectGroups[groupId].includes(subjectId);
}

export async function compileRally25DArtHandoff({
  projectId = RALLY_ART_PROJECT_ID,
  assetFamily,
  assetId,
  subjectId,
  creativeIntent,
  referenceBindings = {},
} = {}) {
  const familyId = id(assetFamily, "assetFamily");
  const family = FAMILY_PLANS[familyId];
  assert(family, `assetFamily ${familyId} is not supported.`);
  const asset = id(assetId, "assetId");
  const subject = id(subjectId, "subjectId");
  const intent = text(creativeIntent, "creativeIntent");
  assert(referenceBindings && typeof referenceBindings === "object" && !Array.isArray(referenceBindings), "referenceBindings must be an object.");

  const project = await compileGameArtProductionProject(projectId);
  assert(project.projectId === RALLY_ART_PROJECT_ID, `project ${project.projectId} is not the governed rally project.`);
  assert(project.profileId === "isometric-rally-1990s-25d", "rally production profile drifted.");
  assert(hasSubject(project, family.subjectGroup, subject), `subjectId ${subject} is not declared in ${family.subjectGroup}.`);

  const artOrders = [];
  for (const deliverable of family.deliverables) {
    const unitId = `${asset}-${deliverable.suffix}`;
    const order = await compileGameArtProductionWorkOrder({
      resolvedProject: project,
      assetTypeId: deliverable.alias,
      unitId,
      subjectId: subject,
      productionGroup: deliverable.group,
      creativeIntent: `${intent} Deliverable role: ${deliverable.role}.`,
      referenceBindings,
    });
    artOrders.push(frozen({
      role: deliverable.role,
      requestedAssetTypeId: order.requestedAssetTypeId,
      assetTypeId: order.assetTypeId,
      unitId: order.unitId,
      workOrderSha256: order.workOrderSha256,
      output: order.output,
      renderingContract: order.renderingContract,
      providerPrompt: order.providerPrompt,
      assetContract: order.assetContract,
    }));
  }

  const body = {
    schema: RALLY_ART_HANDOFF_SCHEMA,
    protocolVersion: RALLY_ART_HANDOFF_PROTOCOL_VERSION,
    projectId: project.projectId,
    profileId: project.profileId,
    sourceProductionProtocolVersion: project.protocolVersion,
    resolvedProjectSha256: project.resolvedProjectSha256,
    assetFamily: familyId,
    assetId: asset,
    subjectId: subject,
    creativeIntent: intent,
    artOrders: frozen(artOrders),
    downstream: frozen({
      repository: "EVAVO-STUDIO/evavo-3d-studio",
      compilerProfile: family.downstreamProfile,
      expectedSchema: "evavo.rally-3d-production-plan.v1",
      runtimeRepository: project.targetRepository,
      runtimeBundleSchema: "evavo.rally-runtime-asset-bundle.v1",
      exchangeFormat: "glb",
      engine: "Godot 4.6.2",
    }),
    authority: frozen({
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      downstreamRepositoryMutation: false,
      runtimeRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanApprovalRequired: true,
    }),
  };
  return frozen({ ...body, handoffSha256: sha256(body) });
}

function usage() {
  return "Usage: node scripts/game-art-production/rally-25d-handoff.mjs <family> <subject-id> <asset-id> <creative-intent>";
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [assetFamily, subjectId, assetId, creativeIntent] = process.argv.slice(2);
  if (!assetFamily || !subjectId || !assetId || !creativeIntent) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else {
    compileRally25DArtHandoff({ assetFamily, subjectId, assetId, creativeIntent })
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
