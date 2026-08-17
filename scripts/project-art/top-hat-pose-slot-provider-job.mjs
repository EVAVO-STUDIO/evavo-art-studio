import {
  CHARACTER_ID,
  MUST_AVOID,
  TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA,
  sha256Bytes,
  sha256Document,
} from './top-hat-pose-slot-provider-foundation.mjs';
import { admitBindings, requiredReferences } from './top-hat-pose-slot-provider-validation.mjs';

export function composedPrompt(slot) {
  const handReview = slot.review.handAndFingerReviewRequired
    ? ' Hands, wrists and every visible finger must remain anatomically correct.'
    : '';
  return [
    `Create exactly one ${CHARACTER_ID} full-body registered key pose for Runtime slot ${slot.slotId}.`,
    slot.productionBrief.performance,
    'Match the three admitted identity and breathing anchors exactly.',
    'Preserve the 1024 x 1536 full canvas, pivot, baseline, silhouette, face, hat, coat, body proportions and lighting.',
    'The body master must be straight RGBA with real native alpha and no baked speech mouth shape.',
    'Registered mouth layers retain exclusive viseme and audio-timing ownership.',
    `Continuity context: ${slot.sourceMapping.continuityContext}.`,
    handReview,
  ]
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function providerRequestInput(entry, plan, admissions, prompt) {
  return Object.freeze({
    schemaVersion: '1.0',
    operation: 'edit',
    assetKind: 'sprite-frame',
    continuityPhase: 'semantic-key-pose',
    assetId: `${CHARACTER_ID}:${entry.slotId}`,
    candidateFamilyId:
      `top-hat-pose-slot:${plan.planSha256}:${entry.slotId}`,
    creativeIntent: prompt,
    negativeIntent: `Reject candidates with: ${MUST_AVOID.join('; ')}.`,
    style: Object.freeze({
      styleName: `${CHARACTER_ID} canonical avatar production style`,
      intent:
        'Match the admitted full-resolution identity anchors and governed animation-suite continuity exactly.',
      mustHave: Object.freeze([
        'one coherent full-body registered character pose',
        'stable face and character identity',
        'stable anatomy, silhouette, pivot and baseline',
        'stable top-hat and wardrobe geometry',
        'native straight-alpha transparency',
        'no baked mouth viseme',
        ...(entry.slot.review.handAndFingerReviewRequired
          ? ['correct wrists, hands and every visible finger']
          : []),
      ]),
      mustAvoid: MUST_AVOID,
      identityLocks: Object.freeze(
        plan.identityAnchors.map((anchor) =>
          `${anchor.id}:${anchor.sha256}`,
        ),
      ),
      palette: Object.freeze([]),
      lineTreatment: Object.freeze([
        'Match the canonical reference without repainting or style drift.',
      ]),
      materials: Object.freeze([]),
      cameraRules: Object.freeze([
        'Preserve the exact existing camera, full-canvas framing and perspective.',
      ]),
      compositionRules: Object.freeze([
        'Keep the entire silhouette inside the exact 1024 x 1536 registered canvas.',
      ]),
      eraRules: Object.freeze([]),
    }),
    shot: Object.freeze({
      subject: `${CHARACTER_ID} ${entry.slotId} pose`,
      action: entry.slot.productionBrief.performance,
      direction: 'Match admitted anchors and continuity references exactly.',
      include: Object.freeze([
        `key selector ${entry.slot.sourceMapping.keyPoseSelector}`,
        `continuity ${entry.slot.sourceMapping.continuityContext}`,
        'real straight-alpha output',
        'stable full-body registration',
      ]),
      exclude: MUST_AVOID,
      separateAssets: Object.freeze([]),
      framing: Object.freeze([
        'One exact registered full-body character pose on transparent alpha.',
      ]),
    }),
    target: Object.freeze({
      width: 1024,
      height: 1536,
      transparency: 'required',
      outputFormat: 'png',
      pixelFormat: 'rgba8-straight',
      alphaAssociation: 'straight',
      colourSpace: 'srgb',
      trimTransparentBorders: false,
      rotateAtlasRegions: false,
    }),
    sourceCanvas: Object.freeze({
      width: 1024,
      height: 1536,
      pixelFormat: 'rgba8-straight',
    }),
    background: Object.freeze({
      strategy: 'native-alpha',
      paintedCheckerboardAllowed: false,
      opaqueMatteAllowed: false,
      chromaSpillAllowed: false,
    }),
    quality: 'high',
    candidateCount: 1,
    ...(entry.selection.seed === null ? {} : { seed: entry.selection.seed }),
    references: Object.freeze(
      admissions.admitted.map((binding) =>
        Object.freeze({
          artifactId: binding.artifactId,
          role: binding.role,
          strength: 1,
          required: true,
          note:
            binding.sourceClipId === null
              ? `${binding.bindingKey} exact approved body anchor`
              : `${binding.bindingKey} continuity source from the pinned animation suite`,
        }),
      ),
    ),
    selection: Object.freeze({
      ...(entry.selection.preferredAdapterId
        ? { preferredAdapterId: entry.selection.preferredAdapterId }
        : {}),
      ...(entry.selection.preferredModel
        ? { preferredModel: entry.selection.preferredModel }
        : {}),
      allowedAdapterIds: entry.selection.allowedAdapterIds,
      allowFallback: false,
      requireSeed: entry.selection.requireSeed,
    }),
    metadata: Object.freeze({
      schema: TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA,
      productionPlanSchema: plan.schema,
      productionPlanSha256: plan.planSha256,
      runtimeCommit: plan.runtime.commit,
      runtimeTree: plan.runtime.tree,
      runtimePackageVersion: plan.runtime.packageVersion,
      poseBankSchema: plan.runtime.poseBankSchema,
      poseBankVersion: plan.runtime.poseBankVersion,
      artStudioSourceCommit: plan.artStudio.commit,
      artStudioSourceTree: plan.artStudio.tree,
      characterId: CHARACTER_ID,
      slotId: entry.slotId,
      requiredFor: entry.slot.requiredFor,
      targetPath: entry.slot.candidateOutputs.rgbaMasterPath,
      candidateEvidencePath: entry.slot.candidateOutputs.evidencePath,
      candidateManifestPath: entry.slot.candidateOutputs.candidateManifestPath,
      reviewContactSheetPath: entry.slot.candidateOutputs.reviewContactSheetPath,
      identityReferenceSetSha256: plan.identityReferenceSetSha256,
      authorizationEvidenceSha256: entry.authorization.evidenceSha256,
      bodyCadenceIndependentOfVisemes: true,
      registeredMouthLayerOwnsVisemes: true,
      alphaEncoding: Object.freeze({
        schema: 'evavo.project-art-alpha-encoding.v1',
        association: 'straight',
        premultiplied: false,
        colourSpace: 'srgb',
        transparentRgbPolicy: 'bounded-visible-rgb-bleed',
      }),
      approvals: Object.freeze({
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        alpha: false,
        runtime: false,
        release: false,
        publication: false,
      }),
    }),
  });
}

export function compileJob(entry, plan) {
  const requirements = requiredReferences(entry.slot, plan);
  const admissions = admitBindings(entry.artifactBindings, requirements);
  const blockers = [];
  if (entry.authorization === null) {
    blockers.push('human-provider-authorization-required');
  }
  if (entry.selection.allowedAdapterIds.length === 0) {
    blockers.push('allowed-provider-adapter-required');
  }
  if (entry.selection.requireSeed && entry.selection.seed === null) {
    blockers.push('deterministic-seed-required');
  }
  for (const missing of admissions.missing) {
    blockers.push(`reference-artifact-required:${missing}`);
  }
  const prompt = composedPrompt(entry.slot);
  const promptSha256 = sha256Bytes(Buffer.from(prompt, 'utf8'));
  const ready = blockers.length === 0;
  const requestInput = ready
    ? providerRequestInput(entry, plan, admissions, prompt)
    : null;
  const body = Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
    jobId: `top-hat-pose:${entry.slotId}`,
    characterId: CHARACTER_ID,
    slotId: entry.slotId,
    purpose: entry.slot.purpose,
    requiredFor: entry.slot.requiredFor,
    status: ready ? 'ready-for-explicit-provider-submission' : 'blocked',
    blockers: Object.freeze(blockers),
    sourceMapping: entry.slot.sourceMapping,
    candidateOutputPath: entry.candidateOutputPath,
    candidateEvidencePath: entry.slot.candidateOutputs.evidencePath,
    candidateManifestPath: entry.slot.candidateOutputs.candidateManifestPath,
    reviewContactSheetPath: entry.slot.candidateOutputs.reviewContactSheetPath,
    createOnly: true,
    overwriteExistingCandidate: false,
    requiredReferences: requirements,
    admittedReferences: admissions.admitted,
    authorization: entry.authorization,
    selection: entry.selection,
    notes: entry.notes,
    composedPrompt: prompt,
    promptSha256,
    providerRequestInput: requestInput,
    providerRequestSha256: requestInput ? sha256Document(requestInput) : null,
    candidateCount: 1,
    providerExecution: false,
    imageMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    runtimeActivation: false,
    publication: false,
  });
  return Object.freeze({
    ...body,
    jobEnvelopeSha256: sha256Document(body),
  });
}
