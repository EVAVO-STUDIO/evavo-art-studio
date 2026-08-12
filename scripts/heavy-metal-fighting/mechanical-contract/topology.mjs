import {
  asArray,
  asInteger,
  asObject,
  asString,
  asTrue,
  assert,
  deepFreeze,
  normalizeStringArray,
  unique,
} from "./common.mjs";

function normalizeSlotArray(value, label, atlasSlots, minimum = 0) {
  const slots = unique(
    asArray(value, label, minimum)
      .map((slot, index) => asInteger(slot, `${label}[${index}]`)),
    label,
  );
  assert(slots.every((slot) => slot < atlasSlots), `${label} contains a slot outside 0-${atlasSlots - 1}.`);
  return deepFreeze(slots);
}

function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right);
}

function sameNumberSet(left, right) {
  return JSON.stringify(sortedNumbers(left)) === JSON.stringify(sortedNumbers(right));
}

export function normalizeClipBindings(value, atlas, plannedUtilitySlots) {
  const bindings = asArray(value, "clipBindings", 1).map((entry, index) => {
    const binding = asObject(entry, `clipBindings[${index}]`);
    const expectedFrames = asInteger(binding.expectedFrames, `clipBindings[${index}].expectedFrames`, 1);
    const currentRuntimeSlots = normalizeSlotArray(
      binding.currentRuntimeSlots,
      `clipBindings[${index}].currentRuntimeSlots`,
      atlas.slots,
      0,
    );
    const plannedRuntimeSlots = normalizeSlotArray(
      binding.plannedRuntimeSlots,
      `clipBindings[${index}].plannedRuntimeSlots`,
      atlas.slots,
      expectedFrames,
    );
    assert(
      currentRuntimeSlots.length === 0 || currentRuntimeSlots.length === expectedFrames,
      `clipBindings[${index}].currentRuntimeSlots must contain either zero or exactly ${expectedFrames} slots.`,
    );
    assert(
      plannedRuntimeSlots.length === expectedFrames,
      `clipBindings[${index}].plannedRuntimeSlots must contain exactly ${expectedFrames} slots.`,
    );
    return deepFreeze({
      sourceClipOrdinal: asInteger(binding.sourceClipOrdinal, `clipBindings[${index}].sourceClipOrdinal`),
      semantic: asString(binding.semantic, `clipBindings[${index}].semantic`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      expectedFrames,
      currentRuntimeSlots,
      plannedRuntimeSlots,
    });
  });

  unique(bindings.map((binding) => binding.sourceClipOrdinal), "clipBindings sourceClipOrdinal values");
  unique(bindings.map((binding) => binding.semantic), "clipBindings semantics");
  const ordinals = sortedNumbers(bindings.map((binding) => binding.sourceClipOrdinal));
  assert(
    ordinals.every((ordinal, index) => ordinal === index),
    "clipBindings sourceClipOrdinal values must be contiguous from zero.",
  );
  const ordered = [...bindings].sort((left, right) => left.sourceClipOrdinal - right.sourceClipOrdinal);
  assert(
    ordered.reduce((sum, binding) => sum + binding.expectedFrames, 0) === atlas.slots,
    `clipBindings must describe exactly ${atlas.slots} authored source cels.`,
  );

  const plannedOnly = ordered.filter((binding) => binding.currentRuntimeSlots.length === 0);
  assert(
    plannedOnly.length === 1 && plannedOnly[0].semantic === "utility-v2-planned",
    "utility-v2-planned must be the only source clip without current runtime slots.",
  );
  const declaredUtilitySlots = Object.keys(plannedUtilitySlots).map(Number);
  assert(
    sameNumberSet(plannedOnly[0].plannedRuntimeSlots, declaredUtilitySlots),
    "utility-v2-planned slots must exactly match plannedAtlasV2.utilitySlots.",
  );

  const currentSlotSources = new Map();
  for (const binding of ordered) {
    for (const [frameIndex, slot] of binding.currentRuntimeSlots.entries()) {
      const sources = currentSlotSources.get(slot) ?? [];
      sources.push(`${binding.semantic}:${frameIndex}`);
      currentSlotSources.set(slot, sources);
    }
  }
  const currentCollisions = [...currentSlotSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([slot]) => slot);
  assert(
    sameNumberSet(currentCollisions, atlas.sharedBoundarySlots),
    `current clip bindings must collide only at shared boundary slots ${atlas.sharedBoundarySlots.join(", ")}.`,
  );
  for (const slot of atlas.sharedBoundarySlots) {
    assert(currentSlotSources.get(slot)?.length === 2, `shared boundary slot ${slot} must bind exactly two authored source cels.`);
  }
  assert(
    [...currentSlotSources.values()].every((sources) => sources.length <= 2),
    "current runtime slots may bind no more than two authored source cels.",
  );

  const plannedSlotSources = new Map();
  for (const binding of ordered) {
    for (const [frameIndex, slot] of binding.plannedRuntimeSlots.entries()) {
      const sources = plannedSlotSources.get(slot) ?? [];
      sources.push(`${binding.semantic}:${frameIndex}`);
      plannedSlotSources.set(slot, sources);
    }
  }
  assert(plannedSlotSources.size === atlas.slots, `planned clip bindings must cover all ${atlas.slots} runtime slots.`);
  assert(
    [...plannedSlotSources.values()].every((sources) => sources.length === 1),
    "planned clip bindings must map one authored source cel to every runtime slot without collisions.",
  );
  assert(
    sortedNumbers(plannedSlotSources.keys()).every((slot, index) => slot === index),
    `planned clip bindings must cover the exact slot range 0-${atlas.slots - 1}.`,
  );

  return deepFreeze(ordered);
}

export function normalizeStyleProof(value, atlasSlots, clipBindings) {
  const proof = asObject(value, "styleProof");
  const bindingByOrdinal = new Map(clipBindings.map((binding) => [binding.sourceClipOrdinal, binding]));
  const requirements = asArray(proof.frameRequirements, "styleProof.frameRequirements", 1).map((entry, index) => {
    const label = `styleProof.frameRequirements[${index}]`;
    const requirement = asObject(entry, label);
    const sourceClipOrdinal = asInteger(requirement.sourceClipOrdinal, `${label}.sourceClipOrdinal`);
    const sourceFrameIndex = asInteger(requirement.sourceFrameIndex, `${label}.sourceFrameIndex`);
    const binding = bindingByOrdinal.get(sourceClipOrdinal);
    assert(binding, `${label} references unknown sourceClipOrdinal ${sourceClipOrdinal}.`);
    assert(sourceFrameIndex < binding.expectedFrames, `${label}.sourceFrameIndex exceeds ${binding.semantic}.`);
    const currentSlots = normalizeSlotArray(requirement.currentSlots, `${label}.currentSlots`, atlasSlots, 0);
    const plannedSlots = normalizeSlotArray(requirement.plannedSlots, `${label}.plannedSlots`, atlasSlots, 1);
    const expectedCurrentSlots = binding.currentRuntimeSlots.length
      ? [binding.currentRuntimeSlots[sourceFrameIndex]]
      : [];
    const expectedPlannedSlots = [binding.plannedRuntimeSlots[sourceFrameIndex]];
    assert(
      sameNumberSet(currentSlots, expectedCurrentSlots),
      `${label}.currentSlots does not match ${binding.semantic} source frame ${sourceFrameIndex}.`,
    );
    assert(
      sameNumberSet(plannedSlots, expectedPlannedSlots),
      `${label}.plannedSlots does not match ${binding.semantic} source frame ${sourceFrameIndex}.`,
    );
    return deepFreeze({
      semantic: asString(requirement.semantic, `${label}.semantic`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      sourceClipOrdinal,
      sourceFrameIndex,
      currentSlots,
      plannedSlots,
    });
  });
  unique(requirements.map((requirement) => requirement.semantic), "styleProof semantic requirements");
  unique(
    requirements.map((requirement) => `${requirement.sourceClipOrdinal}:${requirement.sourceFrameIndex}`),
    "styleProof source cel selectors",
  );
  return deepFreeze({
    id: asString(proof.id, "styleProof.id", /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    approvalRequiredBeforeExpansion: asTrue(proof.approvalRequiredBeforeExpansion, "styleProof.approvalRequiredBeforeExpansion"),
    pilotId: asString(proof.pilotId, "styleProof.pilotId"),
    frameId: asString(proof.frameId, "styleProof.frameId"),
    arenaId: asString(proof.arenaId, "styleProof.arenaId"),
    environmentId: asString(proof.environmentId, "styleProof.environmentId"),
    titleId: asString(proof.titleId, "styleProof.titleId"),
    pilotStates: normalizeStringArray(proof.pilotStates, "styleProof.pilotStates", 4),
    frameRequirements: deepFreeze(requirements),
    reviewContexts: normalizeStringArray(proof.reviewContexts, "styleProof.reviewContexts", 5),
  });
}

