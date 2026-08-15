import { AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA } from './avatar-final-pass-provider-constants.mjs';
import {
  sha256AvatarFinalPassProviderDocument,
  sha256Bytes,
} from './avatar-final-pass-provider-common.mjs';
import {
  admitBindings,
  prompt,
  requiredReferences,
} from './avatar-final-pass-provider-references.mjs';

function providerRequest(entry, plan, admissions, composedPrompt) {
  const sourceSpaceRepair =
    plan.sessionId === 'eva-source-repair-v1' &&
    entry.upstream.kind === 'provider-redraw';
  const mustAvoid = Object.freeze([
    'malformed hands or fingers',
    'broken wrists or duplicated limbs',
    'face identity drift',
    'anatomy drift',
    'wardrobe redesign',
    'pose replacement',
    'palette or lighting drift',
    'background contamination',
    'edge halo',
    'cropping or registration drift',
    'contact sheet or multiple candidates',
    'text or labels',
  ]);
  return Object.freeze({
    schemaVersion: '1.0',
    operation: entry.upstream.operation,
    assetKind: 'sprite-frame',
    continuityPhase: entry.upstream.continuityPhase,
    assetId: `${plan.characterId}:${entry.upstream.frameId}`,
    candidateFamilyId:
      `avatar-final-pass:${plan.sessionId}:${entry.upstream.frameId}`,
    creativeIntent: composedPrompt,
    negativeIntent: `Reject candidates with: ${mustAvoid.join('; ')}.`,
    style: Object.freeze({
      styleName: `${plan.characterId} canonical avatar production style`,
      intent:
        'Match the admitted canonical identity and neighbouring reviewed frames exactly.',
      mustHave: Object.freeze([
        'one coherent character frame',
        'clean hands and fingers',
        'stable face identity',
        'stable anatomy and silhouette',
        sourceSpaceRepair
          ? 'exact source-space background and alpha preservation outside the mask'
          : 'native transparent alpha',
        'exact canvas registration',
      ]),
      mustAvoid,
      identityLocks: Object.freeze([
        `character ${plan.characterId}`,
        `identity frame ${entry.identityFrameId}`,
      ]),
      palette: Object.freeze([]),
      lineTreatment: Object.freeze([
        'Match the canonical reference without smoothing, repainting or style drift.',
      ]),
      materials: Object.freeze([]),
      cameraRules: Object.freeze([
        'Preserve the exact existing camera and framing.',
      ]),
      compositionRules: Object.freeze([
        'Keep the full character inside the exact existing canvas and registration.',
      ]),
      eraRules: Object.freeze([]),
    }),
    shot: Object.freeze({
      subject: `${plan.characterId} frame ${entry.upstream.frameId}`,
      action:
        entry.upstream.kind === 'provider-redraw'
          ? `Repair only ${entry.upstream.issues.join(', ')}.`
          : `Create one coherent in-between from ${entry.upstream.beforeFrameId} to ${entry.upstream.afterFrameId}.`,
      direction: 'Match the admitted references exactly.',
      include: Object.freeze([
        ...(entry.upstream.kind === 'provider-redraw'
          ? entry.upstream.issues.map((issue) => `corrected ${issue}`)
          : entry.upstream.constraints.map((constraint) =>
              `preserved ${constraint}`,
            )),
      ]),
      exclude: mustAvoid,
      separateAssets: Object.freeze([]),
      framing: Object.freeze([
        sourceSpaceRepair
          ? 'One exact registered source-space character frame.'
          : 'One exact registered character frame on transparent alpha.',
      ]),
    }),
    target: Object.freeze({
      width: plan.canvas.width,
      height: plan.canvas.height,
      transparency: sourceSpaceRepair ? 'opaque' : 'required',
      outputFormat: 'png',
    }),
    sourceCanvas: plan.canvas,
    background: Object.freeze({
      strategy: sourceSpaceRepair ? 'opaque-source' : 'native-alpha',
    }),
    quality: 'high',
    candidateCount: 1,
    ...(entry.selection.seed === null ? {} : { seed: entry.selection.seed }),
    references: Object.freeze(
      admissions.admitted.map((admitted) =>
        Object.freeze({
          artifactId: admitted.artifactId,
          role: admitted.role === 'edit-mask' ? 'mask' : admitted.role,
          strength: 1,
          required: true,
          note: admitted.note,
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
      schema: AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA,
      planSha256: plan.planSha256,
      sourceCommit: plan.sourceCommit,
      sessionId: plan.sessionId,
      characterId: plan.characterId,
      jobId: entry.jobId,
      frameId: entry.upstream.frameId,
      upstreamJobSha256: entry.upstream.upstreamJobSha256,
      targetPath: entry.upstream.targetPath,
      candidateOutputPath: entry.candidateOutputPath,
      identityFrameId: entry.identityFrameId,
      authorizationEvidenceSha256: entry.authorization.evidenceSha256,
      approvals: Object.freeze({
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        loop: false,
        runtime: false,
        publication: false,
      }),
    }),
  });
}

export function compileJob(entry, plan) {
  const requirements = requiredReferences(entry, plan);
  const admissions = admitBindings(entry, requirements);
  const blockers = [...requirements.prerequisiteBlockers];
  if (entry.authorization === null) {
    blockers.push('human-provider-authorization-required');
  }
  for (const missing of admissions.missing) {
    blockers.push(`reference-artifact-required:${missing}`);
  }
  const composedPrompt = prompt(entry, plan);
  const promptSha256 = sha256Bytes(Buffer.from(composedPrompt, 'utf8'));
  const ready = blockers.length === 0;
  const requestInput = ready
    ? providerRequest(entry, plan, admissions, composedPrompt)
    : null;
  const body = {
    jobId: entry.jobId,
    frameId: entry.upstream.frameId,
    kind: entry.upstream.kind,
    operation: entry.upstream.operation,
    continuityPhase: entry.upstream.continuityPhase,
    status: ready ? 'ready-for-explicit-provider-submission' : 'blocked',
    blockers: Object.freeze(blockers),
    identityFrameId: entry.identityFrameId,
    targetPath: entry.upstream.targetPath,
    candidateOutputPath: entry.candidateOutputPath,
    upstreamJobSha256: entry.upstream.upstreamJobSha256,
    requiredReferences: requirements.references,
    admittedReferences: admissions.admitted,
    authorization: entry.authorization,
    composedPrompt,
    promptSha256,
    providerRequestInput: requestInput,
    providerRequestSha256: requestInput
      ? sha256AvatarFinalPassProviderDocument(requestInput)
      : null,
    candidateCount: 1,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetPublication: false,
  };
  return Object.freeze({
    ...body,
    jobEnvelopeSha256: sha256AvatarFinalPassProviderDocument(body),
  });
}
