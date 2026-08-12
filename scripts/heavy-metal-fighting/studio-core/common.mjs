import { createHash } from "node:crypto";

export const HMF_STUDIO_PLAN_SCHEMA = "evavo.heavy-metal-fighting-art-studio-plan.v1";
export const HMF_STUDIO_PROTOCOL_VERSION = "2026-08-12.2";

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ART_STUDIO_INVALID: ${message}`);
}

export function assert(condition, message) {
  if (!condition) fail(message);
}

export function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObject(value[key])]),
  );
}

export function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sortObject(value), null, 2)}\n`).digest("hex");
}

export function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right);
}

export function sameNumberSet(left, right) {
  return JSON.stringify(sortedNumbers(left)) === JSON.stringify(sortedNumbers(right));
}

export function framePhase(unit, grammar) {
  if (/utility-v2|planned/i.test(unit.clipId ?? "")) return "planned-utility";
  if (/victory|defeat|result/i.test(unit.clipId ?? "")) return "result";
  if (unit.framesInClip === grammar.bankFrameCount) {
    if (grammar.startupFrameIndexes.includes(unit.frameIndex)) return "startup";
    if (grammar.activeFrameIndexes.includes(unit.frameIndex)) return "active";
    if (grammar.recoveryFrameIndexes.includes(unit.frameIndex)) return "recovery";
  }
  if (/idle|walk|ready|crouch|guard|jump|dash|neutral|movement|reaction|throw/i.test(unit.clipId ?? "")) return "state";
  return "pose";
}

function searchText(unit) {
  return [
    unit.id,
    unit.subjectId,
    unit.clipId,
    unit.itemId,
    unit.variantId,
    unit.pose,
    unit.fileName,
    unit.targetPath,
    unit.prompt,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function matchingUnits(units, requiredTerms, limit = 24) {
  const terms = requiredTerms.map((term) => term.toLowerCase());
  return units
    .filter((unit) => {
      const text = searchText(unit);
      return terms.some((term) => text.includes(term));
    })
    .slice(0, limit)
    .map((unit) => deepFreeze({
      id: unit.id,
      familyId: unit.familyId,
      subjectId: unit.subjectId ?? null,
      clipId: unit.clipId ?? null,
      itemId: unit.itemId ?? null,
      variantId: unit.variantId ?? null,
      targetPath: unit.targetPath,
      reviewPreset: unit.reviewPreset,
    }));
}

export function requirementSlotCollisions(requirements, key) {
  const slots = new Map();
  for (const requirement of requirements) {
    for (const slot of requirement[key]) {
      const semantics = slots.get(slot) ?? [];
      semantics.push(requirement.semantic);
      slots.set(slot, semantics);
    }
  }
  return [...slots.entries()]
    .filter(([, semantics]) => semantics.length > 1)
    .sort(([left], [right]) => left - right)
    .map(([slot, semantics]) => deepFreeze({ slot, semantics: deepFreeze(semantics) }));
}

export function normalizeCampaignPlan(plan) {
  assert(plan && typeof plan === "object", "campaign plan is required.");
  assert(plan.campaignId === "heavy-metal-fighting-launch-four", "campaignId must be heavy-metal-fighting-launch-four.");
  assert(typeof plan.planSha256 === "string" && /^[0-9a-f]{64}$/.test(plan.planSha256), "campaign plan must expose a lowercase planSha256.");
  assert(Array.isArray(plan.games), "campaign plan games must be an array.");
  const game = plan.games.find((candidate) => candidate.id === "heavy-metal-fighting");
  assert(game, "campaign plan is missing the heavy-metal-fighting game.");
  assert(Array.isArray(game.batches) && Array.isArray(game.families), "game campaign must expose families and batches.");
  return { plan, game };
}

export function unitsForFamily(game, familyId) {
  return game.batches
    .filter((batch) => batch.familyId === familyId)
    .flatMap((batch) => batch.units);
}

export function consecutiveClipGroups(units) {
  const groups = [];
  for (const unit of units) {
    const active = groups.at(-1);
    if (!active || active.clipId !== unit.clipId) {
      groups.push({ clipId: unit.clipId, units: [unit] });
    } else {
      active.units.push(unit);
    }
  }
  return groups;
}

export function compactCellBinding(cell) {
  return deepFreeze({
    sourceIndex: cell.sourceIndex,
    unitId: cell.unitId,
    sourceClipOrdinal: cell.sourceClipOrdinal,
    clipSemantic: cell.clipSemantic,
    clipId: cell.clipId,
    frameIndex: cell.frameIndex,
    phase: cell.phase,
    heroImpact: cell.heroImpact,
    pose: cell.pose,
  });
}

export function compileRuntimeMapping(cells, key, atlasSlots) {
  const bySlot = new Map();
  for (const cell of cells) {
    for (const slot of cell[key]) {
      const sources = bySlot.get(slot) ?? [];
      sources.push(compactCellBinding(cell));
      bySlot.set(slot, sources);
    }
  }
  const slotBindings = [...bySlot.entries()]
    .sort(([left], [right]) => left - right)
    .map(([slot, sources]) => deepFreeze({
      slot,
      collision: sources.length > 1,
      sources: deepFreeze(sources),
    }));
  const mapped = new Set(bySlot.keys());
  const reservedSlots = Array.from({ length: atlasSlots }, (_, slot) => slot)
    .filter((slot) => !mapped.has(slot));
  const collisions = slotBindings
    .filter((binding) => binding.collision)
    .map((binding) => binding);
  return deepFreeze({
    mappedSlots: mapped.size,
    reservedSlots: deepFreeze(reservedSlots),
    collisions: deepFreeze(collisions),
    slotBindings: deepFreeze(slotBindings),
  });
}

export function runtimeBindingAt(mapping, slot) {
  return mapping.slotBindings.find((binding) => binding.slot === slot) ?? null;
}

