import { createHash } from 'node:crypto';

export const TOP_HAT_V3_PROVIDER_PLAN_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-plan.v1';
export const TOP_HAT_V3_PROVIDER_REQUEST_METADATA_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-request.v1';
export const TOP_HAT_V3_GENERATION_PLAN_SCHEMA =
  'evavo_top_hat_v3_generation_plan_v1';

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const freeze = Object.freeze;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_PROVIDER_RECORD_INVALID', label);
  }
  return value;
}

function identifier(value, label) {
  const text = String(value ?? '');
  if (!SAFE_ID.test(text)) fail('TOP_HAT_V3_PROVIDER_ID_INVALID', label);
  return text;
}

function digest(value, label) {
  const text = String(value ?? '');
  if (!SHA256.test(text)) fail('TOP_HAT_V3_PROVIDER_SHA256_INVALID', label);
  return text;
}

function artifactId(value, label) {
  const text = String(value ?? '');
  if (!ARTIFACT_ID.test(text)) fail('TOP_HAT_V3_PROVIDER_ARTIFACT_ID_INVALID', label);
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256Document(value) {
  return createHash('sha256')
    .update(`${JSON.stringify(canonical(value))}\n`, 'utf8')
    .digest('hex');
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail('TOP_HAT_V3_PROVIDER_STRING_ARRAY_INVALID', label);
  }
  return freeze([...value]);
}

function generationPlan(value) {
  const plan = record(value, 'generationPlan');
  if (
    plan.schema !== TOP_HAT_V3_GENERATION_PLAN_SCHEMA ||
    plan.characterId !== 'top-hat-man' ||
    plan.targetRoot !== 'assets/top-hat-man/production-v3' ||
    plan.counts?.foundationPoses !== 6 ||
    plan.counts?.bodyFrames !== 732 ||
    plan.counts?.registeredLayers !== 17 ||
    plan.counts?.clips !== 25 ||
    plan.counts?.totalArtwork !== 755 ||
    plan.strategy?.foundationBeforeBody !== true ||
    plan.strategy?.clipAnchorsBeforeInbetweens !== true ||
    plan.strategy?.adjacentApprovedReferencesRequiredForInbetweens !== true ||
    plan.strategy?.independentFlatFrameGenerationForbidden !== true ||
    plan.authority?.providerExecution !== false ||
    !SHA256.test(plan.planSha256 ?? '')
  ) {
    fail('TOP_HAT_V3_PROVIDER_GENERATION_PLAN_INVALID');
  }
  return plan;
}

function normalizedBinding(value, label) {
  const row = record(value, label);
  return freeze({
    artifactId: artifactId(row.artifactId, `${label}.artifactId`),
    sha256: digest(row.sha256, `${label}.sha256`),
    role: String(row.role ?? ''),
    approved: row.approved === true,
    sourceJobId: row.sourceJobId == null ? null : identifier(row.sourceJobId, `${label}.sourceJobId`),
  });
}

function bindingMap(value = {}) {
  const input = record(value, 'bindings');
  return new Map(
    Object.entries(input).map(([key, entry]) => [key, normalizedBinding(entry, `bindings.${key}`)]),
  );
}

function requiredApprovedBinding(bindings, key, blockers) {
  const binding = bindings.get(key);
  if (!binding) {
    blockers.push(`reference-missing:${key}`);
    return null;
  }
  if (!binding.approved) {
    blockers.push(`reference-not-approved:${key}`);
    return null;
  }
  return binding;
}

function providerReference(binding, role, note, strength = 1) {
  return freeze({
    artifactId: binding.artifactId,
    role,
    strength,
    required: true,
    note,
  });
}

function baseStyle(identityLocks) {
  return freeze({
    styleName: 'top-hat-man canonical avatar production v3',
    intent:
      'Preserve the exact existing Top Hat Man identity while producing a registered high-resolution animation frame.',
    mustHave: freeze([
      'same exact face and moustache identity',
      'same exact top-hat crown brim band angle and scale',
      'same tuxedo wardrobe and colour relationships',
      'stable full-body anatomy and silhouette',
      '1024 x 1536 full-canvas bottom-centre registration',
      'real straight-alpha transparency',
      'clean transparent border with no trim',
    ]),
    mustAvoid: freeze([
      'replacement character',
      'face redesign',
      'hat redesign or geometry drift',
      'wardrobe redesign',
      'anatomy drift',
      'camera or framing drift',
      'baked background',
      'checkerboard transparency preview',
      'cast shadow',
      'rim light halo or glow',
      'chromatic aberration',
      'baked speech viseme in body animation',
    ]),
    identityLocks: freeze(identityLocks),
    palette: freeze([]),
    lineTreatment: freeze([
      'match the canonical source rendering exactly; do not reinterpret the illustration style',
    ]),
    materials: freeze([]),
    cameraRules: freeze([
      'preserve the exact canonical camera and full-body perspective',
    ]),
    compositionRules: freeze([
      'retain complete hat hands coat tails legs and shoes inside the 1024 x 1536 canvas',
      'preserve the bottom-centre pivot and foot baseline',
    ]),
    eraRules: freeze([]),
  });
}

function baseTarget() {
  return freeze({
    width: 1024,
    height: 1536,
    transparency: 'required',
    outputFormat: 'png',
  });
}

function baseSelection(options) {
  const allowedAdapterIds = stringArray(options.allowedAdapterIds ?? [], 'allowedAdapterIds');
  if (allowedAdapterIds.length === 0) {
    fail('TOP_HAT_V3_PROVIDER_ADAPTER_REQUIRED');
  }
  return freeze({
    ...(options.preferredAdapterId
      ? { preferredAdapterId: identifier(options.preferredAdapterId, 'preferredAdapterId') }
      : {}),
    ...(options.preferredModel
      ? { preferredModel: String(options.preferredModel) }
      : {}),
    allowedAdapterIds,
    allowFallback: false,
    requireSeed: Number.isSafeInteger(options.seed),
  });
}

function identityReferences(plan, bindings, blockers) {
  const canonical = requiredApprovedBinding(bindings, 'identity:canonical', blockers);
  const master = requiredApprovedBinding(bindings, 'identity:animation-master', blockers);
  const references = [];
  if (master) {
    references.push(
      providerReference(
        master,
        'base-image',
        'Exact approved Top Hat Man 1024 x 1536 animation identity master.',
      ),
    );
  }
  if (canonical) {
    references.push(
      providerReference(
        canonical,
        'canonical-identity',
        'Canonical Top Hat Man identity reference; face, moustache and hat identity are locked.',
      ),
    );
  }
  const identityLocks = [
    `generation-plan:${plan.planSha256}`,
    ...(canonical ? [`canonical:${canonical.sha256}`] : []),
    ...(master ? [`animation-master:${master.sha256}`] : []),
  ];
  return { references, identityLocks };
}

function foundationRequest(plan, job, bindings, options) {
  const blockers = [];
  const identity = identityReferences(plan, bindings, blockers);
  const request = blockers.length
    ? null
    : freeze({
        schemaVersion: '1.0',
        operation: 'edit',
        assetKind: 'sprite-frame',
        continuityPhase: 'key-pose',
        assetId: `top-hat-man:${job.jobId}`,
        candidateFamilyId: `top-hat-v3-foundation:${plan.planSha256}:${job.jobId}`,
        creativeIntent: [
          `Create the exact Top Hat Man foundation pose ${job.poseSlotId}.`,
          job.performance,
          'Use restrained character acting. Preserve exact identity, body proportions, hat geometry, wardrobe, baseline and camera.',
          'This is a body-animation foundation pose only; do not bake a speech viseme into the body.',
        ].join(' '),
        negativeIntent:
          'No identity drift, anatomy errors, hand errors, hat drift, costume drift, scenery, shadow, halo, checkerboard, crop, trim, or baked mouth viseme.',
        style: baseStyle(identity.identityLocks),
        shot: freeze({
          subject: `Top Hat Man ${job.poseSlotId}`,
          action: job.performance,
          direction: 'Identity-preserving registered foundation key pose.',
          include: freeze(['complete registered full body', 'exact top hat', 'real alpha']),
          exclude: freeze(['background', 'shadow', 'identity redesign']),
          separateAssets: freeze([]),
          framing: freeze(['full body, 1024 x 1536, bottom-centre registration']),
        }),
        target: baseTarget(),
        sourceCanvas: freeze({ width: 1024, height: 1536 }),
        background: freeze({ strategy: 'native-alpha' }),
        quality: 'high',
        candidateCount: options.foundationCandidateCount ?? 3,
        ...(Number.isSafeInteger(options.seed) ? { seed: options.seed } : {}),
        references: freeze(identity.references),
        selection: baseSelection(options),
        metadata: freeze({
          schema: TOP_HAT_V3_PROVIDER_REQUEST_METADATA_SCHEMA,
          characterId: 'top-hat-man',
          generationPlanSha256: plan.planSha256,
          productionPhase: 'foundation',
          jobId: job.jobId,
          poseSlotId: job.poseSlotId,
          targetPath: job.targetPath,
          approvalRequiredBeforeDependents: true,
          automaticPromotion: false,
          runtimeActivation: false,
        }),
      });
  return freeze({ jobId: job.jobId, kind: 'foundation-pose', blockers: freeze(blockers), request });
}

function bodyRequest(plan, clip, wave, job, bindings, options) {
  const blockers = [];
  const identity = identityReferences(plan, bindings, blockers);
  const references = [...identity.references];
  const anchorJobIds = [];

  if (job.role === 'continuity-inbetween') {
    if (job.leftApprovedAnchorJobId) {
      const left = requiredApprovedBinding(bindings, `job:${job.leftApprovedAnchorJobId}`, blockers);
      if (left) {
        references.push(providerReference(left, 'previous-key-pose', `Approved left temporal anchor ${job.leftApprovedAnchorJobId}.`));
        anchorJobIds.push(job.leftApprovedAnchorJobId);
      }
    }
    if (job.rightApprovedAnchorJobId) {
      const right = requiredApprovedBinding(bindings, `job:${job.rightApprovedAnchorJobId}`, blockers);
      if (right) {
        references.push(providerReference(right, 'next-key-pose', `Approved right temporal anchor ${job.rightApprovedAnchorJobId}.`));
        anchorJobIds.push(job.rightApprovedAnchorJobId);
      }
    }
    if (anchorJobIds.length < 2) blockers.push(`approved-temporal-bracket-required:${job.jobId}`);
  }

  const request = blockers.length
    ? null
    : freeze({
        schemaVersion: '1.0',
        operation: 'edit',
        assetKind: 'sprite-frame',
        continuityPhase: job.role === 'continuity-inbetween' ? 'in-between' : 'key-pose',
        assetId: `top-hat-man:${job.jobId}`,
        candidateFamilyId: `top-hat-v3-body:${plan.planSha256}:${job.jobId}`,
        frameId: job.jobId,
        creativeIntent: [
          `Create Top Hat Man ${clip.clipId} animation frame ${job.ordinal + 1} of ${clip.targetFrames}.`,
          `Authored cadence ${clip.fps} fps; normalized phase ${job.phase}.`,
          job.role === 'continuity-inbetween'
            ? 'Interpolate the restrained character performance between the supplied approved temporal anchors. Do not invent a new pose family.'
            : `Create the ${job.role} for this clip while preserving the exact animation identity master.`,
          'Keep the body performance independent from mouth-viseme timing.',
        ].join(' '),
        negativeIntent:
          'No identity drift, hat drift, anatomy drift, wardrobe drift, framing drift, independent redraw, baked mouth viseme, background, shadow, halo, crop or trim.',
        style: baseStyle(identity.identityLocks),
        shot: freeze({
          subject: `Top Hat Man ${clip.clipId}`,
          action: `${job.role} at phase ${job.phase}`,
          direction:
            job.role === 'continuity-inbetween'
              ? 'Stay strictly inside the motion interval defined by the approved previous and next key poses.'
              : 'Author a restrained clip anchor consistent with the canonical identity master.',
          include: freeze(['complete full body', 'exact identity', 'exact hat', 'registered alpha canvas']),
          exclude: freeze(['independent character redesign', 'background', 'baked viseme']),
          separateAssets: freeze([]),
          framing: freeze(['full body, 1024 x 1536, same baseline and pivot']),
        }),
        target: baseTarget(),
        sourceCanvas: freeze({ width: 1024, height: 1536 }),
        background: freeze({ strategy: 'native-alpha' }),
        quality: 'high',
        candidateCount:
          job.role === 'continuity-inbetween'
            ? options.inbetweenCandidateCount ?? 1
            : options.anchorCandidateCount ?? 2,
        ...(Number.isSafeInteger(options.seed) ? { seed: options.seed + job.ordinal } : {}),
        references: freeze(references),
        selection: baseSelection(options),
        metadata: freeze({
          schema: TOP_HAT_V3_PROVIDER_REQUEST_METADATA_SCHEMA,
          characterId: 'top-hat-man',
          generationPlanSha256: plan.planSha256,
          productionPhase: 'body-clips',
          clipId: clip.clipId,
          waveIndex: wave.waveIndex,
          waveMode: wave.mode,
          jobId: job.jobId,
          ordinal: job.ordinal,
          phase: job.phase,
          frameRole: job.role,
          targetPath: job.targetPath,
          approvedTemporalAnchorJobIds: freeze(anchorJobIds),
          approvalRequiredBeforeDependentWaves: true,
          independentFlatFrameGenerationForbidden: true,
          automaticPromotion: false,
          runtimeActivation: false,
        }),
      });

  return freeze({ jobId: job.jobId, kind: 'body-frame', blockers: freeze(blockers), request });
}

function layerRequest(plan, job, bindings, options) {
  const blockers = [];
  const identity = identityReferences(plan, bindings, blockers);
  const layerContext = requiredApprovedBinding(bindings, 'layer:face-context', blockers);
  const references = [...identity.references];
  if (layerContext) {
    references.push(providerReference(layerContext, 'layer-context', 'Approved registered face context for eye/mouth layer alignment.'));
  }
  const request = blockers.length
    ? null
    : freeze({
        schemaVersion: '1.0',
        operation: 'edit',
        assetKind: 'sprite-layer',
        continuityPhase: 'key-pose',
        assetId: `top-hat-man:${job.jobId}`,
        candidateFamilyId: `top-hat-v3-layer:${plan.planSha256}:${job.jobId}`,
        layerId: job.jobId,
        creativeIntent:
          `Create only the registered ${job.layer} layer ${job.pose ?? job.energy ?? job.jobId}. Preserve exact facial identity and registration. Do not move or repaint the full body.`,
        negativeIntent:
          'No body movement, face redesign, hat changes, unregistered crop, background, shadow, halo or full-character replacement.',
        style: baseStyle(identity.identityLocks),
        shot: freeze({
          subject: `Top Hat Man registered ${job.layer} layer`,
          action: String(job.pose ?? job.energy ?? 'registered pose'),
          direction: 'Registered face layer only; body registration may not change.',
          include: freeze(['exact face registration', 'real alpha']),
          exclude: freeze(['body redraw', 'hat redraw', 'background']),
          separateAssets: freeze([job.layer]),
          framing: freeze(['same 1024 x 1536 registration canvas']),
        }),
        target: baseTarget(),
        sourceCanvas: freeze({ width: 1024, height: 1536 }),
        background: freeze({ strategy: 'native-alpha' }),
        quality: 'high',
        candidateCount: options.layerCandidateCount ?? 2,
        ...(Number.isSafeInteger(options.seed) ? { seed: options.seed } : {}),
        references: freeze(references),
        selection: baseSelection(options),
        metadata: freeze({
          schema: TOP_HAT_V3_PROVIDER_REQUEST_METADATA_SCHEMA,
          characterId: 'top-hat-man',
          generationPlanSha256: plan.planSha256,
          productionPhase: 'registered-layers',
          jobId: job.jobId,
          layer: job.layer,
          pose: job.pose,
          energy: job.energy,
          targetPath: job.targetPath,
          fullBodyMutationForbidden: true,
          automaticPromotion: false,
          runtimeActivation: false,
        }),
      });
  return freeze({ jobId: job.jobId, kind: 'registered-layer', blockers: freeze(blockers), request });
}

export function compileTopHatV3ProviderPlan(input = {}) {
  const plan = generationPlan(input.generationPlan);
  const bindings = bindingMap(input.bindings ?? {});
  const options = record(input.options ?? {}, 'options');
  const foundationPhase = plan.phases.find((phase) => phase.id === 'foundation');
  const layersPhase = plan.phases.find((phase) => phase.id === 'registered-layers');
  const bodyPhase = plan.phases.find((phase) => phase.id === 'body-clips');
  if (!foundationPhase || !layersPhase || !bodyPhase) {
    fail('TOP_HAT_V3_PROVIDER_PHASES_MISSING');
  }

  const foundation = freeze(
    foundationPhase.jobs.map((job) => foundationRequest(plan, job, bindings, options)),
  );
  const registeredLayers = freeze(
    layersPhase.jobs.map((job) => layerRequest(plan, job, bindings, options)),
  );
  const clips = freeze(
    bodyPhase.clips.map((clip) =>
      freeze({
        clipId: clip.clipId,
        fps: clip.fps,
        loopMode: clip.loopMode,
        targetFrames: clip.targetFrames,
        waves: freeze(
          clip.waves.map((wave) =>
            freeze({
              waveIndex: wave.waveIndex,
              mode: wave.mode,
              parallelSafeWithinWave: wave.parallelSafeWithinWave === true,
              jobs: freeze(
                wave.jobs.map((job) => bodyRequest(plan, clip, wave, job, bindings, options)),
              ),
            }),
          ),
        ),
      }),
    ),
  );

  const all = [
    ...foundation,
    ...registeredLayers,
    ...clips.flatMap((clip) => clip.waves.flatMap((wave) => wave.jobs)),
  ];
  const ready = all.filter((entry) => entry.request !== null).length;
  const blocked = all.length - ready;
  const body = freeze({
    schema: TOP_HAT_V3_PROVIDER_PLAN_SCHEMA,
    characterId: 'top-hat-man',
    generationPlanSha256: plan.planSha256,
    strategy: plan.strategy.name,
    executionPolicy: freeze({
      localFirst: true,
      fallbackAcrossAdapters: false,
      dispatchFoundationBeforeBody: true,
      dispatchBodyWaveOnlyAfterPredecessorApprovals: true,
      rejectUnbracketedInbetweens: true,
      maximumProviderCallsPerRuntimeJob: 1,
      automaticApproval: false,
      automaticPromotion: false,
      runtimeActivation: false,
    }),
    foundation,
    registeredLayers,
    clips,
    counts: freeze({
      foundation: foundation.length,
      registeredLayers: registeredLayers.length,
      bodyFrames: clips.reduce((sum, clip) => sum + clip.targetFrames, 0),
      total: all.length,
      ready,
      blocked,
    }),
  });
  return freeze({ ...body, providerPlanSha256: sha256Document(body) });
}

export function inspectTopHatV3ProviderPlan(value) {
  const plan = record(value, 'providerPlan');
  if (
    plan.schema !== TOP_HAT_V3_PROVIDER_PLAN_SCHEMA ||
    plan.characterId !== 'top-hat-man' ||
    plan.strategy !== 'continuity-first-coarse-to-fine' ||
    plan.counts?.foundation !== 6 ||
    plan.counts?.registeredLayers !== 17 ||
    plan.counts?.bodyFrames !== 732 ||
    plan.counts?.total !== 755 ||
    plan.executionPolicy?.localFirst !== true ||
    plan.executionPolicy?.rejectUnbracketedInbetweens !== true ||
    plan.executionPolicy?.automaticApproval !== false ||
    plan.executionPolicy?.runtimeActivation !== false ||
    !SHA256.test(plan.providerPlanSha256 ?? '')
  ) {
    fail('TOP_HAT_V3_PROVIDER_PLAN_INVALID');
  }
  const { providerPlanSha256, ...body } = plan;
  if (sha256Document(body) !== providerPlanSha256) {
    fail('TOP_HAT_V3_PROVIDER_PLAN_HASH_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-provider-plan-readiness.v1',
    characterId: 'top-hat-man',
    generationPlanSha256: plan.generationPlanSha256,
    providerPlanSha256,
    foundationJobs: 6,
    registeredLayerJobs: 17,
    bodyFrameJobs: 732,
    totalJobs: 755,
    readyJobs: plan.counts.ready,
    blockedJobs: plan.counts.blocked,
    localFirst: true,
    continuityFirst: true,
    executionPerformed: false,
    approvalPerformed: false,
    runtimeActivationPerformed: false,
  });
}
