import {
  assert,
  compileRuntimeMapping,
  consecutiveClipGroups,
  deepFreeze,
  framePhase,
  sameNumberSet,
  unitsForFamily,
} from "./common.mjs";

export function compileFramePlan(game, frameContract, contract) {
  const units = unitsForFamily(game, "frame-animation")
    .filter((unit) => unit.subjectId === frameContract.id);
  assert(
    units.length === contract.inventory.frameAnimationImagesPerFrame,
    `${frameContract.id} must compile to exactly ${contract.inventory.frameAnimationImagesPerFrame} authored source cels; observed ${units.length}.`,
  );

  const groups = consecutiveClipGroups(units);
  assert(
    groups.length === contract.clipBindings.length,
    `${frameContract.id} must expose exactly ${contract.clipBindings.length} consecutive source clips; observed ${groups.length}.`,
  );

  const clips = [];
  const cells = [];
  let sourceIndex = 0;
  for (const binding of contract.clipBindings) {
    const group = groups[binding.sourceClipOrdinal];
    assert(group, `${frameContract.id} is missing source clip ordinal ${binding.sourceClipOrdinal}.`);
    assert(
      group.units.length === binding.expectedFrames,
      `${frameContract.id}.${group.clipId} must contain ${binding.expectedFrames} source cels; observed ${group.units.length}.`,
    );
    const clipPhases = new Set();
    const sourceStartIndex = sourceIndex;
    for (const [localIndex, unit] of group.units.entries()) {
      assert(unit.kind === "animation-frame", `${frameContract.id} source cel ${sourceIndex} is not an animation-frame unit.`);
      assert(unit.frameIndex === localIndex, `${frameContract.id}.${group.clipId} source frame order drifted at ${localIndex}.`);
      assert(unit.framesInClip === binding.expectedFrames, `${frameContract.id}.${group.clipId} framesInClip drifted.`);
      assert(
        unit.dimensions?.width === contract.project.nativeCell.width
          && unit.dimensions?.height === contract.project.nativeCell.height,
        `${frameContract.id} source cel ${sourceIndex} has the wrong native cell dimensions.`,
      );
      assert(
        unit.pivot?.x === contract.project.origin.x && unit.pivot?.y === contract.project.origin.y,
        `${frameContract.id} source cel ${sourceIndex} has the wrong pivot.`,
      );

      const phase = framePhase(unit, contract.phaseGrammar);
      clipPhases.add(phase);
      const previous = localIndex > 0 ? group.units[localIndex - 1] : undefined;
      const next = localIndex + 1 < group.units.length ? group.units[localIndex + 1] : undefined;
      const currentRuntimeSlots = binding.currentRuntimeSlots.length
        ? [binding.currentRuntimeSlots[localIndex]]
        : [];
      const plannedRuntimeSlots = [binding.plannedRuntimeSlots[localIndex]];
      const currentSharedBoundary = currentRuntimeSlots.some((slot) => contract.atlas.sharedBoundarySlots.includes(slot));
      const plannedUtilitySemantic = contract.plannedAtlasV2.utilitySlots[String(plannedRuntimeSlots[0])] ?? null;
      const groundContactExpected = !/(jump|air|fall|knockdown|thrown)/i.test(`${unit.clipId} ${unit.pose}`);
      cells.push(deepFreeze({
        sourceIndex,
        sourceClipOrdinal: binding.sourceClipOrdinal,
        clipSemantic: binding.semantic,
        unitId: unit.id,
        clipId: unit.clipId,
        frameIndex: unit.frameIndex,
        frameNumber: unit.frameNumber,
        framesInClip: unit.framesInClip,
        phase,
        heroImpact: unit.framesInClip === contract.phaseGrammar.bankFrameCount
          && unit.frameIndex === contract.phaseGrammar.heroImpactFrameIndex,
        pose: unit.pose,
        direction: unit.direction,
        duration: deepFreeze({ fps: unit.fps, loop: unit.loop }),
        dimensions: unit.dimensions,
        authoringCanvas: unit.authoringCanvas,
        alpha: unit.alpha,
        pivot: unit.pivot,
        targetPath: unit.targetPath,
        continuityKey: unit.continuityKey,
        currentRuntimeSlots: deepFreeze(currentRuntimeSlots),
        plannedRuntimeSlots: deepFreeze(plannedRuntimeSlots),
        currentRuntimeSlot: currentRuntimeSlots[0] ?? null,
        plannedRuntimeSlot: plannedRuntimeSlots[0],
        neighbourConditioning: deepFreeze({
          previousUnitId: previous?.id ?? null,
          nextUnitId: next?.id ?? null,
          canonicalIdentity: `${frameContract.id}:gameplay-identity-master`,
          mechanicalLandmarkContract: `${frameContract.id}:mechanical-landmarks`,
          materialPalette: `${frameContract.id}:material-ramps`,
        }),
        review: deepFreeze({
          groundContactExpected,
          mirrorReviewRequired: frameContract.mirrorPolicy.requiredReview,
          currentSharedBoundary,
          plannedUtilitySemantic,
          bodyEffectSeparationRequired: true,
          humanApprovalRequired: true,
        }),
      }));
      sourceIndex += 1;
    }
    clips.push(deepFreeze({
      sourceClipOrdinal: binding.sourceClipOrdinal,
      semantic: binding.semantic,
      observedClipId: group.clipId,
      sourceStartIndex,
      sourceEndIndex: sourceIndex - 1,
      sourceFrames: binding.expectedFrames,
      currentRuntimeSlots: binding.currentRuntimeSlots,
      plannedRuntimeSlots: binding.plannedRuntimeSlots,
      fps: group.units[0]?.fps,
      loop: group.units[0]?.loop,
      phases: deepFreeze([...clipPhases]),
    }));
  }

  assert(sourceIndex === contract.atlas.slots, `${frameContract.id} authored source cels must cover indexes 0-${contract.atlas.slots - 1}.`);
  assert(cells.every((cell, index) => cell.sourceIndex === index), `${frameContract.id} source indexes must be contiguous.`);
  const currentMapping = compileRuntimeMapping(cells, "currentRuntimeSlots", contract.atlas.slots);
  const plannedMapping = compileRuntimeMapping(cells, "plannedRuntimeSlots", contract.atlas.slots);
  assert(
    sameNumberSet(currentMapping.collisions.map((collision) => collision.slot), contract.atlas.sharedBoundarySlots),
    `${frameContract.id} current runtime collisions must remain exactly ${contract.atlas.sharedBoundarySlots.join(", ")}.`,
  );
  assert(
    currentMapping.collisions.every((collision) => collision.sources.length === 2),
    `${frameContract.id} shared runtime slots must bind exactly two authored source cels.`,
  );
  assert(plannedMapping.mappedSlots === contract.atlas.slots, `${frameContract.id} planned runtime map must cover all slots.`);
  assert(plannedMapping.reservedSlots.length === 0, `${frameContract.id} planned runtime map cannot contain reserved slots.`);
  assert(plannedMapping.collisions.length === 0, `${frameContract.id} planned runtime map cannot contain collisions.`);

  return deepFreeze({
    id: frameContract.id,
    code: frameContract.code,
    epithet: frameContract.epithet,
    class: frameContract.class,
    pilot: frameContract.pilot,
    crewRequirement: frameContract.crewRequirement,
    targetHeightMeters: frameContract.targetHeightMeters,
    core: frameContract.core,
    motionIdentity: frameContract.motionIdentity,
    silhouetteLocks: frameContract.silhouetteLocks,
    materialRamps: frameContract.materialRamps,
    landmarks: frameContract.landmarks,
    hardpoints: frameContract.hardpoints,
    asymmetry: frameContract.asymmetry,
    mirrorPolicy: frameContract.mirrorPolicy,
    bodyEffectBoundary: frameContract.bodyEffectBoundary,
    motionRules: frameContract.motionRules,
    clips: deepFreeze(clips),
    cells: deepFreeze(cells),
    runtimeMappings: deepFreeze({
      current: currentMapping,
      plannedV2: plannedMapping,
    }),
    totals: deepFreeze({
      clips: clips.length,
      sourceCels: cells.length,
      heroImpactSourceCels: cells.filter((cell) => cell.heroImpact).length,
      currentMappedRuntimeSlots: currentMapping.mappedSlots,
      currentReservedRuntimeSlots: currentMapping.reservedSlots.length,
      currentSharedBoundarySlots: currentMapping.collisions.length,
      currentSharedBoundarySourceCels: cells.filter((cell) => cell.review.currentSharedBoundary).length,
      plannedMappedRuntimeSlots: plannedMapping.mappedSlots,
      plannedUtilitySourceCels: cells.filter((cell) => cell.phase === "planned-utility").length,
    }),
  });
}

