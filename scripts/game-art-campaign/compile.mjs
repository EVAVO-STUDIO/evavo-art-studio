import path from "node:path";

import {
  asInteger,
  asString,
  assert,
  canonicalJson,
  freeze,
  safeFileSegment,
  sha256,
  unique,
} from "./common.mjs";
import {
  normalizeCampaignRequest,
  validateIntegerAuthoringScale,
  PLAN_SCHEMA,
  PROTOCOL_VERSION,
} from "./model.mjs";

function alphaInstruction(mode) {
  if (mode === "transparent") return "TRUE TRANSPARENT RGBA background; alpha exactly zero outside the silhouette; no matte, halo, checkerboard, shadow plate, or antialiased fringe.";
  if (mode === "opaque") return "FULLY OPAQUE image; fill every pixel intentionally; no accidental alpha holes.";
  return "MIXED ALPHA asset: opaque authored surfaces with true transparent exterior/corners exactly where the runtime contract requires.";
}

function technicalInstruction(game, authoringCanvas, nativeDimensions, alpha) {
  return [
    `Native runtime asset: ${nativeDimensions.width}x${nativeDimensions.height} pixels.`,
    `Provider authoring canvas: ${authoringCanvas.width}x${authoringCanvas.height}; preserve exact native pixel geometry for deterministic nearest-neighbour reduction.`,
    `Game logical canvas: ${game.technical.nativeCanvas.width}x${game.technical.nativeCanvas.height}; runtime canvas: ${game.technical.runtimeCanvas.width}x${game.technical.runtimeCanvas.height}.`,
    alphaInstruction(alpha),
    "Hard pixel edges, integer positions, fixed pixel density, no subpixel motion, no smoothed rotation, no blurred shadows.",
  ].join(" ");
}

function makePrompt({ game, family, subject, clip, direction, frameIndex, pose, item, variant, nativeDimensions, authoringCanvas, alpha }) {
  const parts = [
    `ORIGINAL EVAVO GAME ART FOR ${game.title}.`,
    `STYLE LOCK: ${game.style.lock}`,
    `FAMILY: ${family.label}. ${family.prompt}`,
  ];
  if (subject) parts.push(`SUBJECT: ${subject.label}. ${subject.prompt}`);
  if (item) parts.push(`ASSET: ${item.label}. ${item.prompt}`);
  if (variant) parts.push(`VARIANT: ${variant.label}. ${variant.prompt}`);
  if (clip) {
    parts.push(`ANIMATION: ${clip.label}; ${clip.frames} frames at ${clip.fps} FPS; loop mode ${clip.loop}. ${clip.prompt}`);
    parts.push(`FRAME ${frameIndex + 1} OF ${clip.frames}; direction ${direction}; exact pose: ${pose}`);
  }
  parts.push(`CONTINUITY: ${family.continuity} ${game.style.continuity}`);
  parts.push(`TECHNICAL: ${technicalInstruction(game, authoringCanvas, nativeDimensions, alpha)}`);
  parts.push(`ORIGINALITY: ${game.style.originality}`);
  parts.push(`DO NOT INCLUDE: ${game.style.negatives.join("; ")}.`);
  parts.push("Deliver only this one asset/frame as one separate image. Never make a grid, contact sheet, storyboard, labelled panel, or multi-frame sprite sheet.");
  return parts.join("\n\n");
}

function sequenceUnits(game, family) {
  const units = [];
  for (const subject of family.subjects) {
    for (const clip of family.clips) {
      const directions = clip.directions ?? family.directions;
      for (const direction of directions) {
        for (let frameIndex = 0; frameIndex < clip.frames; frameIndex += 1) {
          const frame = String(frameIndex + 1).padStart(3, "0");
          const fileName = `${game.id}__${family.id}__${subject.id}__${direction}__${clip.id}__f${frame}.png`;
          const targetPath = path.posix.join(game.outputRoot, family.runtimeRoot, fileName);
          const id = `${game.id}.${family.id}.${subject.id}.${direction}.${clip.id}.f${frame}`;
          units.push(freeze({
            id,
            gameId: game.id,
            familyId: family.id,
            phase: family.phase,
            kind: "animation-frame",
            subjectId: subject.id,
            clipId: clip.id,
            direction,
            frameIndex,
            frameNumber: frameIndex + 1,
            framesInClip: clip.frames,
            fps: clip.fps,
            loop: clip.loop,
            pose: clip.poses[frameIndex],
            dimensions: family.dimensions,
            authoringCanvas: family.authoringCanvas,
            alpha: family.alpha,
            pivot: family.pivot,
            ySortOrigin: family.ySortOrigin,
            fileName,
            targetPath,
            continuityKey: subject.continuityKey ?? `${game.id}:${family.id}:${subject.id}`,
            prompt: makePrompt({
              game, family, subject, clip, direction, frameIndex, pose: clip.poses[frameIndex],
              nativeDimensions: family.dimensions, authoringCanvas: family.authoringCanvas, alpha: family.alpha,
            }),
            reviewPreset: family.reviewPreset,
          }));
        }
      }
    }
  }
  return units;
}

function catalogueUnits(game, family) {
  const units = [];
  for (const item of family.items) {
    for (const variant of item.variants) {
      const nativeDimensions = item.dimensions ?? family.dimensions;
      const authoringCanvas = item.authoringCanvas ?? family.authoringCanvas;
      validateIntegerAuthoringScale(nativeDimensions, authoringCanvas, `${game.id}.${family.id}.${item.id}.authoringCanvas`);
      const alpha = item.alpha ?? family.alpha;
      const fileName = `${game.id}__${family.id}__${item.id}__${safeFileSegment(variant.id)}.png`;
      const targetPath = path.posix.join(game.outputRoot, family.runtimeRoot, fileName);
      units.push(freeze({
        id: `${game.id}.${family.id}.${item.id}.${variant.id}`,
        gameId: game.id,
        familyId: family.id,
        phase: family.phase,
        kind: "catalogue-asset",
        itemId: item.id,
        variantId: variant.id,
        dimensions: nativeDimensions,
        authoringCanvas,
        alpha,
        pivot: family.pivot,
        ySortOrigin: family.ySortOrigin,
        fileName,
        targetPath,
        continuityKey: `${game.id}:${family.id}:${item.id}`,
        prompt: makePrompt({ game, family, item, variant, nativeDimensions, authoringCanvas, alpha }),
        reviewPreset: family.reviewPreset,
      }));
    }
  }
  return units;
}

function batchFamily(game, family, units, batchSize, startingSequence) {
  const batches = [];
  for (let offset = 0; offset < units.length; offset += batchSize) {
    const selected = units.slice(offset, offset + batchSize);
    const familyBatch = Math.floor(offset / batchSize) + 1;
    const sequence = startingSequence + batches.length;
    const batchNumber = String(familyBatch).padStart(3, "0");
    batches.push(freeze({
      id: `${game.id}.${family.id}.batch-${batchNumber}`,
      sequence,
      gameId: game.id,
      familyId: family.id,
      familyBatch,
      phase: family.phase,
      requiredImages: selected.length,
      capacity: batchSize,
      partial: selected.length < batchSize,
      units: selected,
      providerInstruction: [
        `Generate ${selected.length} SEPARATE images for ${game.title}, batch ${batchNumber} of family ${family.label}.`,
        "Return one image per slot in the exact listed order. Do not combine slots into a grid, contact sheet, sprite sheet, storyboard, or labelled panel.",
        "Preserve continuity keys, native dimensions, transparency rules, silhouettes, pivots, camera, light direction, palette, and pixel density across the batch.",
        "Do not invent extra frames or omit a slot. Human review remains required; generation success is not approval or promotion.",
      ].join(" "),
    }));
  }
  return batches;
}

function compileGame(game, batchSize, sequenceStart) {
  const families = [];
  const allUnits = [];
  const allBatches = [];
  let batchSequence = sequenceStart;
  for (const family of game.families) {
    const units = family.kind === "sequence" ? sequenceUnits(game, family) : catalogueUnits(game, family);
    assert(units.length > 0, `${game.id}.${family.id} compiled to no units.`);
    unique(units.map((unit) => unit.id), `${game.id}.${family.id} unit ids`);
    unique(units.map((unit) => unit.targetPath), `${game.id}.${family.id} target paths`);
    const batches = batchFamily(game, family, units, batchSize, batchSequence);
    batchSequence += batches.length;
    families.push(freeze({
      id: family.id,
      label: family.label,
      kind: family.kind,
      phase: family.phase,
      priority: family.priority,
      images: units.length,
      batches: batches.length,
      partialBatches: batches.filter((batch) => batch.partial).length,
      firstBatchId: batches[0].id,
      lastBatchId: batches.at(-1).id,
      batchIds: batches.map((batch) => batch.id),
    }));
    allUnits.push(...units);
    allBatches.push(...batches);
  }
  const result = freeze({
    id: game.id,
    title: game.title,
    productionOrder: game.productionOrder,
    styleLock: game.style.lock,
    technical: game.technical,
    outputRoot: game.outputRoot,
    families,
    batches: allBatches,
    totals: freeze({
      families: families.length,
      images: allUnits.length,
      batches: allBatches.length,
      partialBatches: allBatches.filter((batch) => batch.partial).length,
      unusedBatchSlots: allBatches.reduce((sum, batch) => sum + batch.capacity - batch.requiredImages, 0),
    }),
  });
  if (game.expected) {
    assert(result.totals.images === game.expected.images, `${game.id} expected ${game.expected.images} images but compiled ${result.totals.images}.`);
    assert(result.totals.batches === game.expected.batches, `${game.id} expected ${game.expected.batches} batches but compiled ${result.totals.batches}.`);
  }
  return result;
}

export function compileCampaign(input) {
  const request = normalizeCampaignRequest(input);
  assert(Object.values(request.generationPolicy).every(Boolean), "Every generationPolicy protection must remain true.");
  const games = [];
  let sequence = 1;
  for (const game of request.games) {
    const compiled = compileGame(game, request.batchSize, sequence);
    games.push(compiled);
    sequence += compiled.totals.batches;
  }
  const allUnits = games.flatMap((game) => game.batches.flatMap((batch) => batch.units));
  const allBatches = games.flatMap((game) => game.batches);
  unique(allUnits.map((unit) => unit.id), "campaign unit ids");
  unique(allUnits.map((unit) => unit.targetPath), "campaign target paths");
  unique(allBatches.map((batch) => batch.id), "campaign batch ids");
  const requestSha256 = sha256(request);
  const planWithoutHash = {
    schema: PLAN_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    campaignId: request.campaignId,
    version: request.version,
    compiledAt: request.planningEpoch,
    requestSha256,
    sourceRepository: request.sourceRepository,
    targetRepository: request.targetRepository,
    batchPolicy: freeze({
      size: request.batchSize,
      boundary: "family-locked",
      lastBatchPolicy: request.lastBatchPolicy,
      crossGameMixing: false,
      crossFamilyMixing: false,
      paddingGeneration: false,
    }),
    generationPolicy: request.generationPolicy,
    games,
    fontPhase: freeze({
      startsAfterGameArtCampaign: true,
      families: request.fontFamilies,
      builds: request.fontFamilies.length,
      imageGenerationBatches: 0,
      deterministicPixelFontStudioRequired: true,
      nativeUiReflowReviewRequired: true,
    }),
    totals: freeze({
      games: games.length,
      families: games.reduce((sum, game) => sum + game.totals.families, 0),
      images: allUnits.length,
      batches: allBatches.length,
      partialBatches: allBatches.filter((batch) => batch.partial).length,
      unusedBatchSlots: allBatches.reduce((sum, batch) => sum + batch.capacity - batch.requiredImages, 0),
      fontFamilies: request.fontFamilies.length,
    }),
    authority: freeze({
      planningOnly: true,
      providerExecution: false,
      sourceImageMutation: false,
      targetRepositoryMutation: false,
      candidatePromotion: false,
      approval: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      forcePush: false,
    }),
    qualityGates: freeze([
      "one separate source image per required frame or asset",
      "native dimensions and authoring canvas declared",
      "true alpha or opaque policy declared per unit",
      "fixed continuity key and deterministic filename",
      "fixed pivot and Y-sort origin where required",
      "no grids, contact sheets, storyboards, labels, or baked generated text",
      "no reference bytes copied into authored candidates",
      "native-scale, 2x nearest, 1080p wrapper, dark/light matte, accessibility, and runtime scene review",
      "human approval before atlas assembly, Godot integration, promotion, commit, push, or publication",
    ]),
  };
  const planSha256 = sha256(planWithoutHash);
  const plan = freeze({ ...planWithoutHash, planSha256 });
  if (request.expected) {
    assert(plan.totals.images === request.expected.images, `Campaign expected ${request.expected.images} images but compiled ${plan.totals.images}.`);
    assert(plan.totals.batches === request.expected.batches, `Campaign expected ${request.expected.batches} batches but compiled ${plan.totals.batches}.`);
  }
  return plan;
}
