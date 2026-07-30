import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  compareSelectionImages,
  decodeSelectionImage,
  type SelectionImageFeatures,
} from "@evavo/art-selection";

import {
  compareCompositeParity,
  renderIdentityComposite,
  renderSpriteComposite,
  type LayerRenderEvidence,
  type RenderedSpriteComposite,
  type ResolvedSpriteLayer,
} from "./composite.js";
import {
  SPRITE_FAMILY_PROTOCOL_VERSION,
  SpriteFamilyError,
  type NormalizedSpriteFamilyFrame,
  type NormalizedSpriteFamilyLayerDefinition,
  type NormalizedSpriteFamilyManifest,
  type SpriteFamilyComparisonEvidence,
  type SpriteFamilyConsistencyEvidence,
  type SpriteFamilyExecutionOptions,
  type SpriteFamilyFrameEvidence,
  type SpriteFamilyGateResult,
  type SpriteFamilyRunResult,
  type SpriteLayerEvidence,
} from "./types.js";
import {
  spriteFamilyManifestSha256,
  validateSpriteFamilyManifest,
} from "./validation.js";

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);
const MAXIMUM_LINEAGE_DEPTH = 24;

interface PreparedFrame {
  readonly frame: NormalizedSpriteFamilyFrame;
  readonly layers: readonly (ResolvedSpriteLayer & {
    readonly artifact: StoredArtifact;
    readonly lineage: ReadonlySet<ArtifactId>;
  })[];
  readonly fullComposite: RenderedSpriteComposite;
  readonly identityComposite: RenderedSpriteComposite;
  readonly fullFeatures: SelectionImageFeatures;
  readonly identityFeatures: SelectionImageFeatures;
  readonly declaredComposite?: Readonly<{
    artifact: StoredArtifact;
    features: SelectionImageFeatures;
  }>;
  readonly baseLayerGates: Readonly<Record<string, readonly SpriteFamilyGateResult[]>>;
  readonly frameGates: readonly SpriteFamilyGateResult[];
}

function gate(
  id: string,
  passed: boolean,
  blocking: boolean,
  passMessage: string,
  failMessage: string,
  evidence: unknown,
  warning = false,
): SpriteFamilyGateResult {
  return {
    id,
    status: passed ? "pass" : warning ? "warning" : "fail",
    blocking,
    message: passed ? passMessage : failMessage,
    evidence: normalizeJson(evidence),
  };
}

function failed(gates: readonly SpriteFamilyGateResult[]): boolean {
  return gates.some((entry) => entry.blocking && entry.status === "fail");
}

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_CLOCK_INVALID",
      "Sprite family verification clock returned an invalid date.",
    );
  }
  return value.toISOString();
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function collectLineage(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
): Promise<ReadonlySet<ArtifactId>> {
  const lineage = new Set<ArtifactId>();
  const queue = artifact.sourceArtifacts.map((artifactId) => ({
    artifactId,
    depth: 1,
  }));
  while (queue.length) {
    const next = queue.shift()!;
    if (lineage.has(next.artifactId)) continue;
    lineage.add(next.artifactId);
    if (next.depth >= MAXIMUM_LINEAGE_DEPTH) continue;
    const source = await verifiedArtifact(
      artifacts,
      next.artifactId,
      "layer lineage",
    );
    for (const sourceArtifactId of source.sourceArtifacts) {
      queue.push({ artifactId: sourceArtifactId, depth: next.depth + 1 });
    }
  }
  return lineage;
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(values.length, limit) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        result[index] = await operation(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return result;
}

function layerQualityPass(artifact: StoredArtifact): boolean {
  return (
    artifact.labels.qualityState === "passed" ||
    artifact.labels.approvalState === "approved" ||
    artifact.labels.approvalState === "selected"
  );
}

async function resolveLayer(
  artifacts: ArtifactStore,
  frame: NormalizedSpriteFamilyFrame,
  definition: NormalizedSpriteFamilyLayerDefinition,
  manifest: NormalizedSpriteFamilyManifest,
): Promise<
  ResolvedSpriteLayer & {
    readonly artifact: StoredArtifact;
    readonly lineage: ReadonlySet<ArtifactId>;
    readonly gates: readonly SpriteFamilyGateResult[];
  }
> {
  const instance = frame.layers.find((entry) => entry.layerId === definition.id);
  if (!instance) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_REQUIRED_LAYER_MISSING",
      `${frame.id} is missing required resolved layer ${definition.id}.`,
    );
  }
  const artifact = await verifiedArtifact(
    artifacts,
    instance.artifactId,
    `${frame.id}.${definition.id}`,
  );
  if (!IMAGE_MEDIA_TYPES.has(artifact.mediaType)) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_LAYER_MEDIA_INVALID",
      `${frame.id}.${definition.id} must contain PNG, WebP or JPEG image bytes.`,
    );
  }
  const bytes = await artifacts.read(artifact.artifactId);
  const features = await decodeSelectionImage(bytes, {
    alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
    maximumInputBytes: manifest.policy.maximumInputBytes,
    maximumPixels: manifest.policy.maximumPixels,
  });
  if (features.encodedSha256 !== artifact.contentSha256) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_LAYER_HASH_MISMATCH",
      `${frame.id}.${definition.id} decoded bytes differ from the artifact descriptor.`,
    );
  }
  const lineage = await collectLineage(artifacts, artifact);
  const visibleMinX = features.bounds.minX + instance.offset.x;
  const visibleMinY = features.bounds.minY + instance.offset.y;
  const visibleMaxX = features.bounds.maxX + instance.offset.x;
  const visibleMaxY = features.bounds.maxY + instance.offset.y;
  const withinCanvas =
    visibleMinX >= 0 &&
    visibleMinY >= 0 &&
    visibleMaxX < manifest.canvas.width &&
    visibleMaxY < manifest.canvas.height;
  const requiresAlpha =
    definition.contributesToComposite || definition.contributesToIdentity;
  const gates = [
    gate(
      "layer-content-hash",
      features.encodedSha256 === artifact.contentSha256,
      true,
      "Layer bytes match the immutable artifact descriptor.",
      "Layer bytes differ from the immutable artifact descriptor.",
      {
        artifactId: artifact.artifactId,
        expected: artifact.contentSha256,
        actual: features.encodedSha256,
      },
    ),
    gate(
      "layer-alpha-source",
      !requiresAlpha || features.sourceHasAlpha,
      requiresAlpha,
      "Layer retains a real source alpha channel for compositing.",
      "A colour or identity layer lacks a source alpha channel.",
      {
        artifactId: artifact.artifactId,
        sourceHasAlpha: features.sourceHasAlpha,
        role: definition.role,
      },
    ),
    gate(
      "layer-canvas-bounds",
      withinCanvas,
      true,
      "Visible layer bounds remain inside the declared family canvas.",
      "Visible layer pixels escape the declared family canvas.",
      {
        visibleBounds: {
          minX: visibleMinX,
          minY: visibleMinY,
          maxX: visibleMaxX,
          maxY: visibleMaxY,
        },
        canvas: manifest.canvas,
      },
    ),
    gate(
      "layer-quality-state",
      !manifest.policy.requireQualityPassed || layerQualityPass(artifact),
      manifest.policy.requireQualityPassed,
      "Layer carries approved or quality-passed evidence.",
      "Layer lacks the required approved or quality-passed state.",
      {
        approvalState: artifact.labels.approvalState ?? null,
        qualityState: artifact.labels.qualityState ?? null,
      },
    ),
  ];
  return {
    definition,
    instance,
    features,
    descriptorSha256: artifact.descriptorSha256,
    contentSha256: artifact.contentSha256,
    artifact,
    lineage,
    gates,
  };
}

function referenceLineageGate(
  frame: PreparedFrame,
  reference: PreparedFrame,
  definition: NormalizedSpriteFamilyLayerDefinition,
  required: boolean,
): SpriteFamilyGateResult {
  const layer = frame.layers.find((entry) => entry.definition.id === definition.id);
  const referenceLayer = reference.layers.find(
    (entry) => entry.definition.id === definition.id,
  );
  if (!layer || !referenceLayer || !definition.contributesToIdentity) {
    return gate(
      "identity-reference-lineage",
      true,
      false,
      "Layer is outside identity lineage comparison.",
      "Layer is outside identity lineage comparison.",
      { layerId: definition.id, skipped: true },
    );
  }
  const linked =
    layer.artifact.artifactId === referenceLayer.artifact.artifactId ||
    layer.lineage.has(referenceLayer.artifact.artifactId);
  return gate(
    "identity-reference-lineage",
    !required || linked,
    required,
    "Identity layer descends from or reuses the reference layer artifact.",
    "Identity layer has no immutable lineage to the reference layer artifact.",
    {
      layerId: definition.id,
      artifactId: layer.artifact.artifactId,
      referenceArtifactId: referenceLayer.artifact.artifactId,
      linked,
    },
  );
}

async function prepareFrame(
  artifacts: ArtifactStore,
  frame: NormalizedSpriteFamilyFrame,
  manifest: NormalizedSpriteFamilyManifest,
): Promise<PreparedFrame> {
  const definitions = new Map(
    manifest.layerDefinitions.map((entry) => [entry.id, entry]),
  );
  const layers = await mapLimit(
    frame.layers,
    manifest.policy.decodeConcurrency,
    async (instance) => {
      const definition = definitions.get(instance.layerId);
      if (!definition) {
        throw new SpriteFamilyError(
          "SPRITE_FAMILY_LAYER_DEFINITION_MISSING",
          `${frame.id}.${instance.layerId} has no layer definition.`,
        );
      }
      return resolveLayer(artifacts, frame, definition, manifest);
    },
  );
  const fullComposite = await renderSpriteComposite(
    manifest.canvas,
    layers,
    manifest.policy.alphaVisibleThreshold,
  );
  const identityComposite = await renderIdentityComposite(
    manifest.canvas,
    layers,
    manifest.policy.alphaVisibleThreshold,
  );
  const [fullFeatures, identityFeatures] = await Promise.all([
    decodeSelectionImage(fullComposite.png, {
      alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
      maximumInputBytes: manifest.policy.maximumInputBytes,
      maximumPixels: manifest.policy.maximumPixels,
    }),
    decodeSelectionImage(identityComposite.png, {
      alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
      maximumInputBytes: manifest.policy.maximumInputBytes,
      maximumPixels: manifest.policy.maximumPixels,
    }),
  ]);
  let declaredComposite:
    | Readonly<{ artifact: StoredArtifact; features: SelectionImageFeatures }>
    | undefined;
  if (frame.declaredCompositeArtifactId) {
    const artifact = await verifiedArtifact(
      artifacts,
      frame.declaredCompositeArtifactId,
      `${frame.id}.declaredComposite`,
    );
    if (!IMAGE_MEDIA_TYPES.has(artifact.mediaType)) {
      throw new SpriteFamilyError(
        "SPRITE_FAMILY_DECLARED_COMPOSITE_MEDIA_INVALID",
        `${frame.id} declared composite must contain an image.`,
      );
    }
    const features = await decodeSelectionImage(
      await artifacts.read(artifact.artifactId),
      {
        alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
        maximumInputBytes: manifest.policy.maximumInputBytes,
        maximumPixels: manifest.policy.maximumPixels,
      },
    );
    if (features.encodedSha256 !== artifact.contentSha256) {
      throw new SpriteFamilyError(
        "SPRITE_FAMILY_DECLARED_COMPOSITE_HASH_MISMATCH",
        `${frame.id} declared composite differs from its descriptor hash.`,
      );
    }
    declaredComposite = { artifact, features };
  }
  const baseLayerGates = Object.fromEntries(
    layers.map((entry) => [entry.definition.id, entry.gates]),
  );
  const frameGates: SpriteFamilyGateResult[] = [
    gate(
      "composite-canvas",
      fullFeatures.width === manifest.canvas.width &&
        fullFeatures.height === manifest.canvas.height,
      true,
      "Generated composite matches the family canvas.",
      "Generated composite does not match the family canvas.",
      {
        generated: { width: fullFeatures.width, height: fullFeatures.height },
        canvas: manifest.canvas,
      },
    ),
    gate(
      "declared-composite-present",
      !manifest.policy.requireDeclaredComposite || declaredComposite !== undefined,
      manifest.policy.requireDeclaredComposite,
      "A declared composite is available for source parity.",
      "The family policy requires a declared composite for source parity.",
      {
        declaredCompositeArtifactId: frame.declaredCompositeArtifactId ?? null,
      },
    ),
  ];
  return {
    frame,
    layers,
    fullComposite,
    identityComposite,
    fullFeatures,
    identityFeatures,
    ...(declaredComposite ? { declaredComposite } : {}),
    baseLayerGates,
    frameGates,
  };
}

function comparisonEvidence(
  target: PreparedFrame,
  reference: PreparedFrame,
  relation: SpriteFamilyComparisonEvidence["relation"],
  manifest: NormalizedSpriteFamilyManifest,
): SpriteFamilyComparisonEvidence {
  const comparison = compareSelectionImages(
    target.identityFeatures,
    reference.identityFeatures,
    {
      maximumTranslationPixels: manifest.policy.maximumTranslationPixels,
      maximumEdgeDistancePixels: manifest.policy.maximumEdgeDistancePixels,
    },
  );
  const visibleArea = comparison.metrics["visible-area-similarity"].score;
  const palette = comparison.metrics["palette-similarity"].score;
  const centroid = comparison.metrics["centroid-similarity"].score;
  const canonical = relation === "canonical";
  const loop = relation === "loop-closure";
  const visibleMinimum = canonical
    ? manifest.policy.minimumCanonicalVisibleAreaSimilarity
    : manifest.policy.minimumAdjacentVisibleAreaSimilarity;
  const paletteMinimum = canonical
    ? manifest.policy.minimumCanonicalPaletteSimilarity
    : manifest.policy.minimumAdjacentPaletteSimilarity;
  const centroidMinimum = canonical
    ? manifest.policy.minimumCanonicalCentroidSimilarity
    : manifest.policy.minimumAdjacentCentroidSimilarity;
  const loopAverage = (visibleArea + palette + centroid) / 3;
  const loopDeclared =
    target.frame.intentionalDuplicateOf === reference.frame.id ||
    reference.frame.intentionalDuplicateOf === target.frame.id;
  const gates = loop
    ? [
        gate(
          "loop-closure-similarity",
          loopAverage >= manifest.policy.minimumLoopClosureSimilarity,
          loopDeclared,
          "Loop endpoints retain the required family similarity.",
          "Loop endpoints drift beyond the declared family threshold.",
          {
            average: loopAverage,
            minimum: manifest.policy.minimumLoopClosureSimilarity,
            loopDeclared,
          },
          !loopDeclared,
        ),
      ]
    : [
        gate(
          `${relation}-visible-area`,
          visibleArea >= visibleMinimum,
          true,
          "Visible subject area remains within the family envelope.",
          "Visible subject area drifts beyond the family envelope.",
          { value: visibleArea, minimum: visibleMinimum },
        ),
        gate(
          `${relation}-palette`,
          palette >= paletteMinimum,
          true,
          "Palette distribution remains within the family envelope.",
          "Palette distribution drifts beyond the family envelope.",
          { value: palette, minimum: paletteMinimum },
        ),
        gate(
          `${relation}-centroid`,
          centroid >= centroidMinimum,
          true,
          "Identity centroid remains within the family envelope.",
          "Identity centroid drifts beyond the family envelope.",
          { value: centroid, minimum: centroidMinimum },
        ),
      ];
  return {
    targetFrameId: target.frame.id,
    relation,
    referenceFrameId: reference.frame.id,
    offsetX: comparison.alignment.offsetX,
    offsetY: comparison.alignment.offsetY,
    visibleAreaSimilarity: visibleArea,
    paletteSimilarity: palette,
    centroidSimilarity: centroid,
    silhouetteIou: comparison.metrics["silhouette-iou"].score,
    edgeSimilarity: comparison.metrics["edge-similarity"].score,
    gates,
  };
}

function registrationGate(
  current: Readonly<{ x: number; y: number }>,
  reference: Readonly<{ x: number; y: number }>,
  definition: NormalizedSpriteFamilyLayerDefinition,
): SpriteFamilyGateResult {
  const distance = Math.hypot(
    current.x - reference.x,
    current.y - reference.y,
  );
  return gate(
    "layer-registration",
    distance <= definition.registrationTolerancePixels,
    true,
    "Layer centroid remains registered to the family pivot.",
    "Layer centroid drifts relative to the family pivot.",
    {
      layerId: definition.id,
      current,
      reference,
      distance,
      tolerance: definition.registrationTolerancePixels,
    },
  );
}

function anchorGates(
  frame: PreparedFrame,
  reference: PreparedFrame,
  manifest: NormalizedSpriteFamilyManifest,
): readonly SpriteFamilyGateResult[] {
  const pivotDistance = Math.hypot(
    frame.frame.pivot.x - reference.frame.pivot.x,
    frame.frame.pivot.y - reference.frame.pivot.y,
  );
  const baselineComparable =
    frame.frame.baseline !== undefined && reference.frame.baseline !== undefined;
  const baselineDistance = baselineComparable
    ? Math.abs(frame.frame.baseline! - reference.frame.baseline!)
    : 0;
  const groundDistance =
    frame.frame.groundContact && frame.frame.baseline !== undefined
      ? Math.abs(frame.identityFeatures.bounds.maxY - frame.frame.baseline)
      : 0;
  return [
    gate(
      "pivot-stability",
      pivotDistance <= manifest.policy.pivotTolerancePixels,
      true,
      "Frame pivot remains within the family tolerance.",
      "Frame pivot drifts beyond the family tolerance.",
      {
        pivot: frame.frame.pivot,
        referencePivot: reference.frame.pivot,
        distance: pivotDistance,
        tolerance: manifest.policy.pivotTolerancePixels,
      },
    ),
    gate(
      "baseline-stability",
      baselineComparable
        ? baselineDistance <= manifest.policy.baselineTolerancePixels
        : frame.frame.baseline === reference.frame.baseline,
      true,
      "Frame baseline remains within the family tolerance.",
      "Frame baseline is missing or drifts beyond the family tolerance.",
      {
        baseline: frame.frame.baseline ?? null,
        referenceBaseline: reference.frame.baseline ?? null,
        distance: baselineDistance,
        tolerance: manifest.policy.baselineTolerancePixels,
      },
    ),
    gate(
      "ground-contact",
      !frame.frame.groundContact ||
        (frame.frame.baseline !== undefined &&
          groundDistance <= manifest.policy.groundContactTolerancePixels),
      frame.frame.groundContact,
      "Visible identity bounds meet the declared ground-contact baseline.",
      "Visible identity bounds do not meet the declared ground-contact baseline.",
      {
        groundContact: frame.frame.groundContact,
        visibleMaxY: frame.identityFeatures.bounds.maxY,
        baseline: frame.frame.baseline ?? null,
        distance: groundDistance,
        tolerance: manifest.policy.groundContactTolerancePixels,
      },
    ),
  ];
}

async function layerEvidenceFor(
  frame: PreparedFrame,
  reference: PreparedFrame,
  manifest: NormalizedSpriteFamilyManifest,
): Promise<readonly SpriteLayerEvidence[]> {
  const renderById = new Map(
    frame.fullComposite.layerEvidence.map((entry) => [entry.layerId, entry]),
  );
  const referenceRenderById = new Map(
    reference.fullComposite.layerEvidence.map((entry) => [entry.layerId, entry]),
  );
  const result: SpriteLayerEvidence[] = [];
  for (const layer of frame.layers) {
    const render = renderById.get(layer.definition.id) ?? {
      layerId: layer.definition.id,
      visiblePixels: layer.features.visiblePixels,
      clippedVisiblePixels: 0,
      contributionPixels: 0,
      occludedPixels: 0,
      contributionFraction: 0,
      centroid: {
        x: layer.features.centroid.x + layer.instance.offset.x,
        y: layer.features.centroid.y + layer.instance.offset.y,
      },
    } satisfies LayerRenderEvidence;
    const relative = {
      x: render.centroid.x - frame.frame.pivot.x,
      y: render.centroid.y - frame.frame.pivot.y,
    };
    const referenceRender = referenceRenderById.get(layer.definition.id);
    const referenceRelative = referenceRender
      ? {
          x: referenceRender.centroid.x - reference.frame.pivot.x,
          y: referenceRender.centroid.y - reference.frame.pivot.y,
        }
      : relative;
    const contributionPass =
      !layer.definition.contributesToComposite ||
      render.contributionFraction >= layer.definition.minimumVisibleFraction;
    const separatePass =
      !layer.definition.mustRemainSeparate || render.contributionPixels > 0;
    const gates = [
      ...(frame.baseLayerGates[layer.definition.id] ?? []),
      gate(
        "layer-not-clipped",
        render.clippedVisiblePixels === 0,
        true,
        "Layer has no visible pixels clipped by the family canvas.",
        "Layer loses visible pixels outside the family canvas.",
        {
          clippedVisiblePixels: render.clippedVisiblePixels,
          visiblePixels: render.visiblePixels,
        },
      ),
      gate(
        "layer-visible-contribution",
        contributionPass,
        layer.definition.contributesToComposite,
        "Layer contributes the required visible fraction after occlusion.",
        "Layer is fully or excessively hidden after compositing.",
        {
          contributionPixels: render.contributionPixels,
          visiblePixels: render.visiblePixels,
          contributionFraction: render.contributionFraction,
          minimumVisibleFraction: layer.definition.minimumVisibleFraction,
        },
      ),
      gate(
        "separate-layer-contribution",
        separatePass,
        layer.definition.mustRemainSeparate,
        "Required separate layer changes the rendered composite.",
        "Required separate layer makes no visible composite contribution.",
        {
          mustRemainSeparate: layer.definition.mustRemainSeparate,
          contributionPixels: render.contributionPixels,
        },
      ),
      registrationGate(relative, referenceRelative, layer.definition),
      referenceLineageGate(
        frame,
        reference,
        layer.definition,
        manifest.policy.requireReferenceLineage,
      ),
    ];
    result.push({
      layerId: layer.definition.id,
      role: layer.definition.role,
      artifactId: layer.artifact.artifactId,
      descriptorSha256: layer.artifact.descriptorSha256,
      contentSha256: layer.artifact.contentSha256,
      width: layer.features.width,
      height: layer.features.height,
      offset: layer.instance.offset,
      opacity: layer.instance.opacity,
      visiblePixels: render.visiblePixels,
      visibleFraction:
        layer.features.width * layer.features.height > 0
          ? render.visiblePixels /
            (layer.features.width * layer.features.height)
          : 0,
      compositeContributionPixels: render.contributionPixels,
      compositeContributionFraction: render.contributionFraction,
      occludedPixels: render.occludedPixels,
      occludedFraction:
        render.visiblePixels > 0
          ? render.occludedPixels / render.visiblePixels
          : 0,
      centroid: render.centroid,
      centroidRelativeToPivot: relative,
      gates,
    });
  }
  return result.sort((left, right) => left.layerId.localeCompare(right.layerId));
}

function frameGroups(
  frames: readonly PreparedFrame[],
): ReadonlyMap<string, readonly PreparedFrame[]> {
  const groups = new Map<string, PreparedFrame[]>();
  for (const frame of frames) {
    const key = `${frame.frame.animation}\0${frame.frame.direction}`;
    const group = groups.get(key) ?? [];
    group.push(frame);
    groups.set(key, group);
  }
  for (const [key, values] of groups) {
    groups.set(
      key,
      [...values].sort(
        (left, right) => left.frame.frameIndex - right.frame.frameIndex,
      ),
    );
  }
  return groups;
}

export async function verifySpriteFamily(
  input: unknown,
  options: SpriteFamilyExecutionOptions,
): Promise<SpriteFamilyRunResult> {
  const manifest = validateSpriteFamilyManifest(input);
  const now = options.now ?? (() => new Date());
  const prepared = await mapLimit(
    manifest.frames,
    manifest.policy.decodeConcurrency,
    (frame) => prepareFrame(options.artifacts, frame, manifest),
  );
  const byFrame = new Map(prepared.map((entry) => [entry.frame.id, entry]));
  const reference = byFrame.get(manifest.policy.identityReferenceFrameId);
  if (!reference) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_IDENTITY_REFERENCE_MISSING",
      "Identity reference frame could not be prepared.",
    );
  }
  const groups = frameGroups(prepared);
  const comparisonsByFrame = new Map<string, SpriteFamilyComparisonEvidence[]>();
  for (const frame of prepared) {
    const values = comparisonsByFrame.get(frame.frame.id) ?? [];
    values.push(comparisonEvidence(frame, reference, "canonical", manifest));
    comparisonsByFrame.set(frame.frame.id, values);
  }
  for (const group of groups.values()) {
    for (let index = 1; index < group.length; index += 1) {
      const target = group[index]!;
      const previous = group[index - 1]!;
      comparisonsByFrame
        .get(target.frame.id)!
        .push(comparisonEvidence(target, previous, "adjacent", manifest));
    }
    if (group.length > 1) {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      comparisonsByFrame
        .get(last.frame.id)!
        .push(comparisonEvidence(last, first, "loop-closure", manifest));
    }
  }

  const duplicateMap = new Map<string, string[]>();
  for (const frame of prepared) {
    const values = duplicateMap.get(frame.fullFeatures.rawRgbaSha256) ?? [];
    values.push(frame.frame.id);
    duplicateMap.set(frame.fullFeatures.rawRgbaSha256, values);
  }
  const familyGates: SpriteFamilyGateResult[] = [];
  for (const frameIds of duplicateMap.values()) {
    if (frameIds.length < 2) continue;
    const declared = frameIds.every((frameId, index) => {
      if (index === 0) return true;
      const frame = byFrame.get(frameId)!.frame;
      return (
        frame.intentionalDuplicateOf !== undefined &&
        frameIds.includes(frame.intentionalDuplicateOf)
      );
    });
    familyGates.push(
      gate(
        `duplicate-composite:${frameIds.join(",")}`,
        declared,
        true,
        "Repeated composite pixels are declared as intentional holds or linked frames.",
        "Undeclared duplicate composite frames were detected.",
        { frameIds, declared },
      ),
    );
  }

  const intermediate: Array<{
    prepared: PreparedFrame;
    layerEvidence: readonly SpriteLayerEvidence[];
    parity: ReturnType<typeof compareCompositeParity>;
    gates: readonly SpriteFamilyGateResult[];
    comparisons: readonly SpriteFamilyComparisonEvidence[];
    passed: boolean;
  }> = [];
  for (const frame of prepared) {
    const layerEvidence = await layerEvidenceFor(frame, reference, manifest);
    const parity = compareCompositeParity(
      frame.fullComposite.rgba,
      frame.declaredComposite?.features.rgba,
      frame.declaredComposite?.artifact.artifactId,
      frame.fullComposite.sha256,
      frame.declaredComposite?.artifact.contentSha256,
      manifest.policy.compositeChannelTolerance,
    );
    const parityPass =
      frame.declaredComposite === undefined
        ? !manifest.policy.requireDeclaredComposite
        : frame.declaredComposite.features.width === manifest.canvas.width &&
          frame.declaredComposite.features.height === manifest.canvas.height &&
          parity.meanAbsoluteError <= manifest.policy.maximumCompositeMeanError &&
          parity.mismatchFraction <=
            manifest.policy.maximumCompositeMismatchFraction;
    const comparisons = comparisonsByFrame.get(frame.frame.id) ?? [];
    const gates = [
      ...frame.frameGates,
      ...anchorGates(frame, reference, manifest),
      gate(
        "composite-source-parity",
        parityPass,
        manifest.policy.requireDeclaredComposite,
        "Reconstructed layers match the declared composite within tolerance.",
        "Reconstructed layers differ from the declared composite beyond tolerance.",
        {
          ...parity,
          maximumMeanError: manifest.policy.maximumCompositeMeanError,
          maximumMismatchFraction:
            manifest.policy.maximumCompositeMismatchFraction,
        },
      ),
      ...comparisons.flatMap((entry) => entry.gates),
    ];
    const passed =
      !failed(gates) &&
      !layerEvidence.some((entry) => failed(entry.gates));
    intermediate.push({
      prepared: frame,
      layerEvidence,
      parity,
      gates,
      comparisons,
      passed,
    });
  }
  const overallPassed =
    !failed(familyGates) && intermediate.every((entry) => entry.passed);
  const generatedCompositeArtifacts: ArtifactId[] = [];
  const frameEvidence: SpriteFamilyFrameEvidence[] = [];
  for (const entry of intermediate) {
    const sourceArtifacts = entry.prepared.layers.map(
      (layer) => layer.artifact.artifactId,
    );
    if (entry.prepared.declaredComposite) {
      sourceArtifacts.push(entry.prepared.declaredComposite.artifact.artifactId);
    }
    const stored = await options.artifacts.put(entry.prepared.fullComposite.png, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${manifest.familyId}.${entry.prepared.frame.id}.layered.png`,
      sourceArtifacts: [...new Set(sourceArtifacts)].sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "layered-frame-composite",
        approvalState: "unapproved",
        qualityState: entry.passed ? "passed" : "rejected",
        finalDeliverable: "false",
        familyId: manifest.familyId,
        frameId: entry.prepared.frame.id,
        animation: entry.prepared.frame.animation,
        direction: entry.prepared.frame.direction,
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
        manifestSha256: spriteFamilyManifestSha256(manifest),
        generatedCompositeSha256: entry.prepared.fullComposite.sha256,
        identityCompositeSha256: entry.prepared.identityComposite.sha256,
        frameIndex: entry.prepared.frame.frameIndex,
        globalFrameIndex: entry.prepared.frame.globalFrameIndex,
        pivot: entry.prepared.frame.pivot,
        baseline: entry.prepared.frame.baseline ?? null,
        passed: entry.passed,
      }),
    });
    generatedCompositeArtifacts.push(stored.artifactId);
    frameEvidence.push({
      frameId: entry.prepared.frame.id,
      animation: entry.prepared.frame.animation,
      direction: entry.prepared.frame.direction,
      frameIndex: entry.prepared.frame.frameIndex,
      globalFrameIndex: entry.prepared.frame.globalFrameIndex,
      pivot: entry.prepared.frame.pivot,
      ...(entry.prepared.frame.baseline === undefined
        ? {}
        : { baseline: entry.prepared.frame.baseline }),
      groundContact: entry.prepared.frame.groundContact,
      generatedCompositeArtifactId: stored.artifactId,
      generatedCompositeSha256: entry.prepared.fullComposite.sha256,
      identityCompositeSha256: entry.prepared.identityComposite.sha256,
      layers: entry.layerEvidence,
      parity: entry.parity,
      comparisons: entry.comparisons,
      gates: entry.gates,
      passed: entry.passed,
    });
  }
  const sourceArtifactIds = [
    ...new Set(
      prepared.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifact.artifactId),
        ...(frame.declaredComposite
          ? [frame.declaredComposite.artifact.artifactId]
          : []),
      ]),
    ),
  ].sort() as readonly ArtifactId[];
  const evidence: SpriteFamilyConsistencyEvidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: manifest.familyId,
    manifestSha256: spriteFamilyManifestSha256(manifest),
    passed: overallPassed,
    completedAt: nowIso(now),
    canvas: manifest.canvas,
    layerDefinitions: manifest.layerDefinitions,
    frameEvidence,
    familyGates,
    generatedCompositeArtifactIds: generatedCompositeArtifacts,
    sourceArtifactIds,
    ...(manifest.metadata === undefined ? {} : { metadata: manifest.metadata }),
  };
  const evidenceArtifact = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${manifest.familyId}.sprite-family.evidence.json`,
      sourceArtifacts: [
        ...sourceArtifactIds,
        ...generatedCompositeArtifacts,
      ].sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        familyId: manifest.familyId,
        qualityState: overallPassed ? "passed" : "rejected",
        approvalState: "evidence-only",
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
        manifestSha256: evidence.manifestSha256,
        frameCount: frameEvidence.length,
        passedFrameCount: frameEvidence.filter((entry) => entry.passed).length,
        familyGateCount: familyGates.length,
      }),
    },
  );
  return {
    evidenceArtifactId: evidenceArtifact.artifactId,
    generatedCompositeArtifactIds: generatedCompositeArtifacts,
    evidence,
  };
}
