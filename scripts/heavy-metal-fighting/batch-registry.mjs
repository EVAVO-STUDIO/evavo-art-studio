import { createHash } from "node:crypto";
import path from "node:path";

import { loadHmfArtProductionWorkspace } from "./art-production-workspace.mjs";
import { loadHeavyMetalFightingStudio } from "./studio-runtime.mjs";

export const HMF_PRODUCTION_BATCH_REGISTRY_SCHEMA = "evavo.heavy-metal-fighting-production-batch-registry.v1";
export const HMF_PRODUCTION_BATCH_REGISTRY_PROTOCOL_VERSION = "2026-08-12.1";

const SUPPORT_FAMILIES = Object.freeze([
  "title-and-shell",
  "pilot-portraits",
  "frame-construction",
  "frame-damage-overlays",
  "universal-combat-fx",
  "frame-specific-fx",
  "arena-layers",
  "service-bay-crew-upgrades",
  "pilot-service-animation",
  "opening-intro",
]);

const BODY_GROUPS = Object.freeze([
  { id: "neutral-locomotion", start: 0, end: 38 },
  { id: "defence-reactions", start: 39, end: 90 },
  { id: "throws", start: 91, end: 111 },
  { id: "normals", start: 112, end: 149 },
  { id: "specials-overdrive", start: 150, end: 191 },
  { id: "core-entrance-result", start: 192, end: 223 },
]);

const STYLE_PROOF_BODY_WINDOWS = Object.freeze([
  ["neutral-locomotion", 0],
  ["defence-reactions", 0],
  ["defence-reactions", 2],
  ["defence-reactions", 4],
  ["normals", 0],
  ["specials-overdrive", 0],
  ["specials-overdrive", 2],
  ["core-entrance-result", 2],
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_PRODUCTION_BATCH_REGISTRY_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}
function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sortObject(value), null, 2)}\n`).digest("hex");
}
function pad(value, width = 3) {
  return String(value).padStart(width, "0");
}
function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
function sourceHaystack(unit) {
  return [
    unit.id,
    unit.subjectId,
    unit.itemId,
    unit.clipId,
    unit.variantId,
    unit.fileName,
    unit.targetPath,
    unit.continuityKey,
  ].filter(Boolean).join(":").toLowerCase();
}
function inferSubject(unit, candidates, label) {
  if (unit.subjectId && candidates.includes(unit.subjectId)) return unit.subjectId;
  const haystack = sourceHaystack(unit);
  const matches = candidates.filter((candidate) => haystack.includes(candidate));
  assert(matches.length === 1, `${label} unit ${unit.id} must resolve exactly one subject; found ${matches.join(", ") || "none"}.`);
  return matches[0];
}
function inferFrameSpecificFxOwner(unit, allocation, frames) {
  if (unit.subjectId && frames.includes(unit.subjectId)) return unit.subjectId;
  const haystack = sourceHaystack(unit);
  const matches = [];
  for (const [frameId, moves] of Object.entries(allocation.perFrame ?? {})) {
    const moveIds = Object.keys(moves);
    if (haystack.includes(frameId) || moveIds.some((moveId) => haystack.includes(moveId))) matches.push(frameId);
  }
  assert(matches.length === 1, `frame-specific-fx unit ${unit.id} must resolve exactly one Frame; found ${matches.join(", ") || "none"}.`);
  return matches[0];
}
function titleWorkspaceDirectory(unit) {
  const id = `${unit.itemId ?? ""}:${unit.id}`.toLowerCase();
  if (id.includes("pilot-select") || id.includes("pilot-grid") || id.includes("pilot-focus") || id.includes("pilot-stat")) return "working/ui/pilot-select";
  if (id.includes("frame-select") || id.includes("frame-card") || id.includes("frame-silhouette") || id.includes("frame-stat") || id.includes("crew-core") || id.includes("compatibility")) return "working/ui/frame-select";
  if (id.includes("versus") || id.includes("arena-rules")) return "working/ui/versus";
  if (id.includes("hud-") || id.includes("timer-round") || id.includes("core-segment") || id.includes("guard-integrity") || id.includes("super-cut")) return "working/ui/hud";
  if (id.includes("round-result")) return "working/ui/results";
  if (id.includes("ending-credits")) return "working/ui/ending";
  if (id.includes("title") || id.includes("press-fire") || id.includes("broadcast-mark")) return "working/ui/title";
  return "working/ui/main-menu";
}
function arenaLayerDirectory(unit, arena) {
  const id = `${unit.itemId ?? ""}:${unit.clipId ?? ""}:${unit.id}`.toLowerCase();
  if (id.includes("far-")) return `working/arenas/${arena}/far`;
  if (id.includes("mid")) return `working/arenas/${arena}/mid`;
  if (id.includes("foreground")) return `working/arenas/${arena}/foreground`;
  if (id.includes("light")) return `working/arenas/${arena}/lighting`;
  if (id.includes("ambient")) return `working/arenas/${arena}/ambient`;
  if (id.includes("damage")) return `working/arenas/${arena}/damage`;
  if (id.includes("hazard")) return `working/arenas/${arena}/hazard`;
  return `working/arenas/${arena}/play-plane`;
}
function supportWorkspaceDirectory(unit, familyId, context) {
  if (familyId === "title-and-shell") return titleWorkspaceDirectory(unit);
  if (familyId === "pilot-portraits") return `working/pilots/${context.subjectId}/portraits`;
  if (familyId === "frame-construction") return `working/frames/${context.subjectId}/construction`;
  if (familyId === "frame-damage-overlays") return `working/frames/${context.subjectId}/damage`;
  if (familyId === "universal-combat-fx") return "working/fx/universal";
  if (familyId === "frame-specific-fx") return `working/fx/frame/${context.subjectId}`;
  if (familyId === "arena-layers") return arenaLayerDirectory(unit, context.subjectId);
  if (familyId === "service-bay-crew-upgrades") return "working/ui/service-bay";
  if (familyId === "pilot-service-animation") {
    const id = `${unit.clipId ?? ""}:${unit.itemId ?? ""}:${unit.id}`.toLowerCase();
    return id.includes("cockpit") || id.includes("capsule") ? `working/pilots/${context.subjectId}/cockpit` : `working/pilots/${context.subjectId}/service`;
  }
  if (familyId === "opening-intro") return "working/intro/cels";
  fail(`no workspace directory rule for support family ${familyId}.`);
}
function styleProofSupport(familyId, subjectId, batchOrdinal, units) {
  if (familyId === "title-and-shell") return true;
  if (familyId === "pilot-portraits" && subjectId === "branka-kovac") return true;
  if (familyId === "frame-construction" && subjectId === "bastion") return true;
  if (familyId === "arena-layers" && subjectId === "foundry-nine") return true;
  if (familyId === "pilot-service-animation" && subjectId === "branka-kovac") return true;
  if (familyId === "service-bay-crew-upgrades" && batchOrdinal <= 2) return true;
  if (familyId === "universal-combat-fx" && batchOrdinal === 1) return true;
  if (familyId === "frame-specific-fx" && subjectId === "bastion") {
    return units.some((unit) => sourceHaystack(unit).includes("kiln-verdict"));
  }
  return false;
}
function normalizedSupportUnit(unit, familyId, context, loaded) {
  const fileName = unit.fileName ?? `${unit.id.replaceAll(".", "__")}.png`;
  const workspaceDirectory = supportWorkspaceDirectory(unit, familyId, context);
  return freeze({
    id: `hmf.support.${unit.id}`,
    kind: "supporting-art",
    familyId,
    subjectId: context.subjectId,
    sourceUnitId: unit.id,
    sourceCampaignPlanSha256: loaded.campaignPlan.planSha256,
    sourcePromptSha256: typeof unit.prompt === "string" ? sha256(unit.prompt) : null,
    nativeDimensions: unit.dimensions ?? null,
    authoringCanvas: unit.authoringCanvas ?? null,
    alpha: unit.alpha ?? null,
    pivot: unit.pivot ?? null,
    continuityKey: unit.continuityKey ?? null,
    workspaceOutputPath: path.posix.join(workspaceDirectory, fileName),
    legacyTargetPath: unit.targetPath ?? null,
    reviewPreset: unit.reviewPreset ?? null,
  });
}
function bodyBankForSlot(census, slot) {
  const bank = census.bodyCelBanks.find((candidate) => slot >= candidate.start && slot <= candidate.end);
  assert(bank, `body slot ${slot} has no body-cel bank.`);
  return bank;
}
function makeBodyUnits(frameId, group, census) {
  const units = [];
  for (let slot = group.start; slot <= group.end; slot += 1) {
    const bank = bodyBankForSlot(census, slot);
    const fileName = `${frameId}-${bank.id}-c${pad(slot)}.png`;
    units.push(freeze({
      id: `hmf.frame-animation.${frameId}.slot-${pad(slot)}`,
      kind: "frame-body-cel",
      familyId: "frame-animation",
      subjectId: frameId,
      productionGroup: group.id,
      bodyBankId: bank.id,
      bodySlot: slot,
      bodyBankPurpose: bank.purpose,
      nativeDimensions: census.productionMasterV3.cell,
      authoringCanvas: census.project.authoringCanvas,
      alpha: "transparent",
      pivot: census.productionMasterV3.pivot,
      groundLineY: census.productionMasterV3.groundLineY,
      continuityKey: `heavy-metal-fighting:frame-animation:${frameId}`,
      workspaceOutputPath: `working/frames/${frameId}/sprites/${group.id}/${fileName}`,
      masterOutputPath: `masters/frames/${frameId}/sprites/${fileName}`,
      runtimeDelivery: freeze({
        mode: "deterministic-atlas-derivative-only",
        atlasSlotsPerFrame: census.productionMasterV3.slotsPerFrame,
        finalPromotionBlockedUntilGameAtlasV3Migration: census.productionMasterV3.migrationRequiredBeforeFinalPromotion,
      }),
      reviewPreset: "hmf-frame-body-native-v3",
    }));
  }
  return units;
}
function buildSupportDescriptors(studio, workspace) {
  const game = studio.campaignPlan.games.find((candidate) => candidate.id === workspace.layout.projectId);
  assert(game, `compiled campaign does not contain ${workspace.layout.projectId}.`);
  const legacyUnits = game.batches.flatMap((batch) => batch.units);
  const supportUnits = legacyUnits.filter((unit) => unit.familyId !== "frame-animation");
  assert(supportUnits.length === 677, `expected 677 legacy supporting units, found ${supportUnits.length}.`);
  const sourceByFamily = new Map(SUPPORT_FAMILIES.map((familyId) => [familyId, []]));
  for (const unit of supportUnits) {
    assert(sourceByFamily.has(unit.familyId), `unexpected supporting family ${unit.familyId}.`);
    sourceByFamily.get(unit.familyId).push(unit);
  }

  const descriptors = [];
  const pilots = workspace.layout.subjects.pilots;
  const frames = workspace.layout.subjects.frames;
  const arenas = workspace.layout.subjects.arenas;
  const allocation = studio.combatPresentationContract.assetAllocation;
  for (const family of workspace.batchPolicy.supportingFamilyPacking) {
    const familyId = family.family;
    const units = sourceByFamily.get(familyId) ?? [];
    assert(units.length === family.sourceImages, `${familyId} expected ${family.sourceImages} units but found ${units.length}.`);
    let groups = [];
    if (familyId === "pilot-portraits" || familyId === "pilot-service-animation") {
      groups = pilots.map((subjectId) => ({
        subjectId,
        units: units.filter((unit) => inferSubject(unit, pilots, familyId) === subjectId),
      }));
    } else if (familyId === "frame-construction" || familyId === "frame-damage-overlays") {
      groups = frames.map((subjectId) => ({
        subjectId,
        units: units.filter((unit) => inferSubject(unit, frames, familyId) === subjectId),
      }));
    } else if (familyId === "frame-specific-fx") {
      groups = frames.map((subjectId) => ({
        subjectId,
        units: units.filter((unit) => inferFrameSpecificFxOwner(unit, allocation[familyId], frames) === subjectId),
      }));
    } else if (familyId === "arena-layers") {
      groups = arenas.map((subjectId) => ({
        subjectId,
        units: units.filter((unit) => inferSubject(unit, arenas, familyId) === subjectId),
      }));
    } else {
      groups = [{ subjectId: null, units }];
    }
    let familyBatchOrdinal = 0;
    for (const group of groups) {
      assert(group.units.length > 0, `${familyId} scope ${group.subjectId ?? "project"} has no units.`);
      const chunks = chunk(group.units, workspace.batchPolicy.maximumImagesPerBatch);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        familyBatchOrdinal += 1;
        const selected = chunks[chunkIndex];
        descriptors.push({
          key: `support:${familyId}:${group.subjectId ?? "project"}:${chunkIndex + 1}`,
          familyId,
          subjectId: group.subjectId,
          productionGroup: familyId,
          familyBatchOrdinal,
          scopeBatchOrdinal: chunkIndex + 1,
          units: selected.map((unit) => normalizedSupportUnit(unit, familyId, group, studio)),
          styleProofCritical: styleProofSupport(familyId, group.subjectId, familyBatchOrdinal, selected),
          approvalPrerequisites: ["style-north-star-approved"],
          dependencyKeys: [],
          orderClass: "supporting",
        });
      }
    }
    const observedBatches = descriptors.filter((descriptor) => descriptor.familyId === familyId).length;
    assert(observedBatches === family.minimumBatches, `${familyId} compiled to ${observedBatches} batches instead of policy minimum ${family.minimumBatches}.`);
  }
  return descriptors;
}
function buildBodyDescriptors(workspace) {
  const descriptors = [];
  const census = workspace.census;
  for (const frameId of workspace.layout.subjects.frames) {
    for (const group of BODY_GROUPS) {
      const units = makeBodyUnits(frameId, group, census);
      const chunks = chunk(units, workspace.batchPolicy.maximumImagesPerBatch);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const styleProofCritical = frameId === "bastion" && STYLE_PROOF_BODY_WINDOWS.some(([groupId, ordinal]) => groupId === group.id && ordinal === chunkIndex);
        descriptors.push({
          key: `body:${frameId}:${group.id}:${chunkIndex + 1}`,
          familyId: "frame-animation",
          subjectId: frameId,
          productionGroup: group.id,
          familyBatchOrdinal: null,
          scopeBatchOrdinal: chunkIndex + 1,
          units: chunks[chunkIndex],
          styleProofCritical,
          approvalPrerequisites: [
            "style-north-star-approved",
            "frame-construction-approved",
            ...(styleProofCritical ? [] : ["style-proof-approved"]),
          ],
          dependencyKeys: [`support:frame-construction:${frameId}:1`],
          orderClass: "frame-body",
        });
      }
    }
  }
  return descriptors;
}
function descriptorRank(descriptor) {
  if (descriptor.styleProofCritical) {
    const proofFamilyRank = new Map([
      ["title-and-shell", 10],
      ["pilot-portraits", 20],
      ["frame-construction", 30],
      ["service-bay-crew-upgrades", 40],
      ["pilot-service-animation", 50],
      ["arena-layers", 60],
      ["universal-combat-fx", 70],
      ["frame-animation", 80],
      ["frame-specific-fx", 90],
    ]);
    return [0, proofFamilyRank.get(descriptor.familyId) ?? 99, descriptor.familyId, descriptor.subjectId ?? "", descriptor.productionGroup, descriptor.scopeBatchOrdinal];
  }
  const productionFamilyRank = new Map([
    ["frame-construction", 10],
    ["pilot-portraits", 20],
    ["frame-specific-fx", 30],
    ["frame-damage-overlays", 40],
    ["arena-layers", 50],
    ["pilot-service-animation", 60],
    ["frame-animation", 70],
    ["universal-combat-fx", 80],
    ["service-bay-crew-upgrades", 90],
    ["opening-intro", 100],
    ["title-and-shell", 110],
  ]);
  const subjectRank = new Map([
    ["bastion", 10], ["branka-kovac", 11],
    ["viper", 20], ["miho-tagawa", 21],
    ["citadel", 30], ["esi-quartey", 31],
    ["mirage", 40], ["parvaneh-razi", 41],
    ["foundry-nine", 50], ["reactor-spine", 51], ["orbital-dock", 52], ["ash-citadel", 53],
  ]);
  return [1, productionFamilyRank.get(descriptor.familyId) ?? 999, subjectRank.get(descriptor.subjectId) ?? 999, descriptor.familyId, descriptor.productionGroup, descriptor.scopeBatchOrdinal];
}
function compareRank(a, b) {
  const left = descriptorRank(a);
  const right = descriptorRank(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const av = left[index] ?? "";
    const bv = right[index] ?? "";
    if (typeof av === "number" && typeof bv === "number" && av !== bv) return av - bv;
    const compared = String(av).localeCompare(String(bv));
    if (compared !== 0) return compared;
  }
  return 0;
}
function assignBatchIds(descriptors, batchSize) {
  const ordered = [...descriptors].sort(compareRank);
  const idByKey = new Map();
  const batches = ordered.map((descriptor, index) => {
    const sequence = index + 1;
    const id = `hmf-b${pad(sequence, 4)}`;
    idByKey.set(descriptor.key, id);
    return { ...descriptor, id, sequence };
  });
  return batches.map((batch) => {
    const dependencies = batch.dependencyKeys.map((key) => {
      const id = idByKey.get(key);
      assert(id, `batch ${batch.id} dependency ${key} was not compiled.`);
      return id;
    });
    assert(dependencies.every((id) => Number(id.slice(5)) < batch.sequence), `batch ${batch.id} has a forward dependency.`);
    return freeze({
      id: batch.id,
      sequence: batch.sequence,
      familyId: batch.familyId,
      subjectId: batch.subjectId,
      productionGroup: batch.productionGroup,
      scopeBatchOrdinal: batch.scopeBatchOrdinal,
      requiredImages: batch.units.length,
      capacity: batchSize,
      partial: batch.units.length < batchSize,
      styleProofCritical: batch.styleProofCritical,
      productionWave: batch.styleProofCritical ? "style-proof" : "production",
      dependsOnBatchIds: dependencies,
      approvalPrerequisites: [...new Set(batch.approvalPrerequisites)],
      units: batch.units,
      authority: freeze({
        providerExecution: false,
        automaticApproval: false,
        automaticPromotion: false,
        targetRepositoryMutation: false,
        namedHumanApprovalRequired: true,
      }),
    });
  });
}
function verifyRegistryObject(registry) {
  const batches = registry.batches;
  const units = batches.flatMap((batch) => batch.units);
  const body = units.filter((unit) => unit.kind === "frame-body-cel");
  const support = units.filter((unit) => unit.kind === "supporting-art");
  const bodyBatches = batches.filter((batch) => batch.familyId === "frame-animation");
  const supportBatches = batches.filter((batch) => batch.familyId !== "frame-animation");
  const checks = [
    ["batch-count", batches.length === 179],
    ["unit-count", units.length === 1573],
    ["body-cels", body.length === 896],
    ["support-images", support.length === 677],
    ["body-batches", bodyBatches.length === 104],
    ["support-batches", supportBatches.length === 75],
    ["batch-capacity", batches.every((batch) => batch.requiredImages >= 1 && batch.requiredImages <= 10 && batch.capacity === 10)],
    ["batch-id-sequence", batches.every((batch, index) => batch.id === `hmf-b${pad(index + 1, 4)}` && batch.sequence === index + 1)],
    ["unique-unit-ids", new Set(units.map((unit) => unit.id)).size === units.length],
    ["unique-workspace-paths", new Set(units.map((unit) => unit.workspaceOutputPath)).size === units.length],
    ["working-output-root", units.every((unit) => unit.workspaceOutputPath.startsWith("working/"))],
    ["identity-containment", batches.every((batch) => !["pilot-portraits","frame-construction","frame-animation","frame-damage-overlays","frame-specific-fx","pilot-service-animation"].includes(batch.familyId) || batch.units.every((unit) => unit.subjectId === batch.subjectId))],
    ["body-slot-census", registry.subjects.frames.every((frameId) => {
      const slots = body.filter((unit) => unit.subjectId === frameId).map((unit) => unit.bodySlot).sort((a, b) => a - b);
      return slots.length === 224 && slots.every((slot, index) => slot === index);
    })],
    ["style-proof-wave", batches.some((batch) => batch.styleProofCritical && batch.familyId === "frame-animation" && batch.subjectId === "bastion") && batches.some((batch) => batch.styleProofCritical && batch.familyId === "pilot-portraits" && batch.subjectId === "branka-kovac")],
    ["post-proof-gate", batches.filter((batch) => batch.familyId === "frame-animation" && !batch.styleProofCritical).every((batch) => batch.approvalPrerequisites.includes("style-proof-approved"))],
    ["no-forward-dependencies", batches.every((batch) => batch.dependsOnBatchIds.every((id) => Number(id.slice(5)) < batch.sequence))],
    ["authority", batches.every((batch) => batch.authority.providerExecution === false && batch.authority.targetRepositoryMutation === false && batch.authority.namedHumanApprovalRequired === true)],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({
    schema: "evavo.heavy-metal-fighting-production-batch-registry-verification.v1",
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    checks,
    failed: checks.filter((check) => !check.passed),
  });
}

export async function buildHmfProductionBatchRegistry() {
  const [studio, workspace] = await Promise.all([
    loadHeavyMetalFightingStudio(),
    loadHmfArtProductionWorkspace(),
  ]);
  const authority = freeze({
    campaignPlanSha256: studio.campaignPlan.planSha256,
    studioPlanSha256: studio.studioPlan.studioPlanSha256,
    combatPresentationContractSha256: studio.combatPresentationContract.contractSha256,
    spriteProductionCensusSha256: studio.spriteProductionCensus.censusSha256,
    workspaceLayoutSha256: sha256(workspace.layout),
    styleAuthenticityContractSha256: sha256(workspace.style),
    batchProductionPolicySha256: sha256(workspace.batchPolicy),
  });
  const supportDescriptors = buildSupportDescriptors(studio, workspace);
  const bodyDescriptors = buildBodyDescriptors(workspace);
  const batches = assignBatchIds([...supportDescriptors, ...bodyDescriptors], workspace.batchPolicy.maximumImagesPerBatch);
  const withoutHash = {
    schema: HMF_PRODUCTION_BATCH_REGISTRY_SCHEMA,
    protocolVersion: HMF_PRODUCTION_BATCH_REGISTRY_PROTOCOL_VERSION,
    projectId: workspace.layout.projectId,
    publicTitle: workspace.layout.publicTitle,
    authority,
    batchPolicy: freeze({
      maximumImagesPerBatch: workspace.batchPolicy.maximumImagesPerBatch,
      familyContainmentRequired: workspace.batchPolicy.familyContainmentRequired,
      identityContainmentRequiredFor: workspace.batchPolicy.identityContainmentRequiredFor,
      paddingForbidden: workspace.batchPolicy.paddingForbidden,
      contactSheetsForbidden: workspace.batchPolicy.contactSheetsForbidden,
      providerPackedAtlasesForbidden: workspace.batchPolicy.providerPackedAtlasesForbidden,
    }),
    subjects: workspace.layout.subjects,
    totals: freeze({
      batches: batches.length,
      sourceImages: batches.reduce((sum, batch) => sum + batch.requiredImages, 0),
      bodyAnimationBatches: batches.filter((batch) => batch.familyId === "frame-animation").length,
      bodyAnimationImages: batches.filter((batch) => batch.familyId === "frame-animation").reduce((sum, batch) => sum + batch.requiredImages, 0),
      supportingBatches: batches.filter((batch) => batch.familyId !== "frame-animation").length,
      supportingImages: batches.filter((batch) => batch.familyId !== "frame-animation").reduce((sum, batch) => sum + batch.requiredImages, 0),
      styleProofBatches: batches.filter((batch) => batch.styleProofCritical).length,
    }),
    batches,
    authorityBoundary: freeze({
      registryCompilationOnly: true,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      namedHumanApprovalRequired: true,
    }),
  };
  const registry = freeze({ ...withoutHash, registrySha256: sha256(withoutHash) });
  const verification = verifyRegistryObject(registry);
  assert(verification.status === "passed", `compiled registry failed verification: ${verification.failed.map((check) => check.id).join(", ")}.`);
  return registry;
}

export async function heavyMetalFightingProductionRegistrySummary() {
  const registry = await buildHmfProductionBatchRegistry();
  return freeze({
    schema: "evavo.heavy-metal-fighting-production-batch-registry-summary.v1",
    projectId: registry.projectId,
    registrySha256: registry.registrySha256,
    authority: registry.authority,
    totals: registry.totals,
    firstBatch: registry.batches[0],
    lastBatch: registry.batches.at(-1),
    styleProofBatchIds: registry.batches.filter((batch) => batch.styleProofCritical).map((batch) => batch.id),
    authorityBoundary: registry.authorityBoundary,
  });
}

export async function heavyMetalFightingProductionRegistryBatch(identifier) {
  const registry = await buildHmfProductionBatchRegistry();
  const normalized = String(identifier ?? "").trim().toLowerCase();
  const id = /^\d+$/.test(normalized) ? `hmf-b${pad(Number(normalized), 4)}` : normalized;
  const batch = registry.batches.find((candidate) => candidate.id === id);
  assert(batch, `unknown production batch ${identifier}; expected hmf-b0001 through hmf-b${pad(registry.batches.length, 4)}.`);
  return freeze({
    schema: "evavo.heavy-metal-fighting-production-batch-inspection.v1",
    projectId: registry.projectId,
    registrySha256: registry.registrySha256,
    batch,
  });
}

export async function heavyMetalFightingProductionRegistryUnit(unitId) {
  const registry = await buildHmfProductionBatchRegistry();
  const normalized = String(unitId ?? "").trim();
  for (const batch of registry.batches) {
    const unit = batch.units.find((candidate) => candidate.id === normalized);
    if (unit) return freeze({
      schema: "evavo.heavy-metal-fighting-production-unit-inspection.v1",
      projectId: registry.projectId,
      registrySha256: registry.registrySha256,
      batchId: batch.id,
      unit,
    });
  }
  fail(`unknown production unit ${unitId}.`);
}

export async function verifyHmfProductionBatchRegistry() {
  const registry = await buildHmfProductionBatchRegistry();
  const verification = verifyRegistryObject(registry);
  return freeze({
    ...verification,
    registrySha256: registry.registrySha256,
    totals: registry.totals,
  });
}
