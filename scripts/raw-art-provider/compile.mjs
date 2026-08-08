import {
  ARTIFACT_ID,
  SCHEMAS,
  boundedText,
  classifyProviderEntries,
  directionRole,
  fail,
  hashObject,
  isObject,
  limited,
  normalizeRole,
  operationFor,
  safeId,
  sha256,
  slug,
  sourceIdentity,
  stringList,
  transparencyFor,
  validateBindings,
  validateBridge,
  validateCampaign,
  validateDirection,
  validateProviderMap,
  validateQueue,
  validateStyleBank,
} from './shared.mjs';

const STYLE_REFERENCE_ROLES = Object.freeze([
  'direction-master',
  'palette-reference',
  'line-reference',
  'material-reference',
]);

function buildStyleReferences(semanticRole, styleBank, bindings, maximum) {
  const result = [];
  for (const reference of styleBank.byRole.get(semanticRole) ?? []) {
    for (const providerRole of STYLE_REFERENCE_ROLES) {
      const binding = bindings.styles.get(
        `${reference.sourceSha256}\0${providerRole}`,
      );
      if (binding) {
        result.push({
          artifactId: binding.artifactId,
          role: providerRole,
          strength: binding.strength ?? 1,
          required: binding.required !== false,
          note: `Approved ${semanticRole} style ${reference.sourcePath}`,
        });
      }
      if (result.length >= maximum) return result;
    }
  }
  return result;
}

function buildReferences(binding, styleReferences) {
  const result = [];
  const add = (artifactId, role, required = true, note) => {
    if (!artifactId) return;
    if (!ARTIFACT_ID.test(artifactId)) {
      fail(`${role} artifact is invalid`);
    }
    result.push({
      artifactId,
      role,
      strength: 1,
      required,
      ...(note ? { note } : {}),
    });
  };
  add(binding.baseImageArtifactId, 'base-image', true, 'Exact immutable source');
  add(binding.maskArtifactId, 'mask', true, 'Reviewed mask');
  add(
    binding.canonicalIdentityArtifactId,
    'canonical-identity',
    true,
    'Approved identity',
  );
  add(binding.previousKeyPoseArtifactId, 'previous-key-pose');
  add(binding.nextKeyPoseArtifactId, 'next-key-pose');
  for (const extra of binding.references ?? []) {
    if (
      !isObject(extra) ||
      !ARTIFACT_ID.test(extra.artifactId ?? '') ||
      !extra.role
    ) {
      fail('extra reference is invalid');
    }
    result.push({
      artifactId: extra.artifactId,
      role: extra.role,
      strength: extra.strength ?? 1,
      required: extra.required !== false,
      ...(extra.note ? { note: String(extra.note) } : {}),
    });
  }
  result.push(...styleReferences);
  return [
    ...new Map(
      result.map((entry) => [`${entry.role}\0${entry.artifactId}`, entry]),
    ).values(),
  ];
}

function assetIdentity(entry, binding) {
  const assignment = isObject(entry.assignment) ? entry.assignment : {};
  return safeId(
    binding.assetId ??
      assignment.identityId ??
      assignment.characterId ??
      assignment.shipId ??
      assignment.effectId ??
      assignment.iconId ??
      assignment.documentId ??
      assignment.sceneId ??
      slug(entry.targetPath),
    'assetId',
  );
}

function requestFor(
  entry,
  campaignItem,
  binding,
  mapping,
  direction,
  styleBank,
  bindings,
  records,
  campaign,
) {
  const semanticRole = normalizeRole(entry.semanticRole);
  const operation = operationFor(entry);
  const roleProfile =
    direction.roleProfiles[directionRole(semanticRole)] ?? {};
  const assignment = isObject(entry.assignment) ? entry.assignment : {};
  const styleReferences = buildStyleReferences(
    semanticRole,
    styleBank,
    bindings,
    Math.min(8, mapping.maximumStyleReferences ?? 4),
  );
  const continuityPhase =
    binding.continuityPhase ??
    mapping.continuityByOperation?.[operation] ??
    'independent';
  const references = buildReferences(binding, styleReferences);
  const requiredReferenceRoles = new Set(
    references
      .filter((reference) => reference.required !== false)
      .map((reference) => reference.role),
  );
  const reasons = [];
  if (styleReferences.length === 0) {
    reasons.push('approved-style-reference-artifact-missing');
  }
  if (!binding.creativeIntent) reasons.push('creative-intent-missing');
  if (!binding.subject) reasons.push('shot-subject-missing');
  if (
    binding.operation !== undefined &&
    binding.operation !== operation
  ) {
    reasons.push('artifact-binding-operation-mismatch');
  }
  if (
    binding.semanticRole !== undefined &&
    normalizeRole(binding.semanticRole) !== semanticRole
  ) {
    reasons.push('artifact-binding-role-mismatch');
  }
  if (['edit', 'inpaint'].includes(operation) && !binding.baseImageArtifactId) {
    reasons.push('base-image-artifact-missing');
  }
  if (operation === 'inpaint' && !binding.maskArtifactId) {
    reasons.push('inpaint-mask-artifact-missing');
  }
  if (
    ['sprite-frame', 'sprite-layer'].includes(mapping.assetKind) &&
    !['independent', 'identity-master'].includes(continuityPhase) &&
    !requiredReferenceRoles.has('canonical-identity')
  ) {
    reasons.push('canonical-identity-artifact-missing');
  }
  if (
    continuityPhase === 'in-between' &&
    (!requiredReferenceRoles.has('previous-key-pose') ||
      !requiredReferenceRoles.has('next-key-pose'))
  ) {
    reasons.push('neighbouring-key-pose-artifacts-missing');
  }
  if (
    !isObject(entry.targetCanvas) ||
    !Number.isSafeInteger(entry.targetCanvas.width) ||
    !Number.isSafeInteger(entry.targetCanvas.height) ||
    entry.targetCanvas.width < 1 ||
    entry.targetCanvas.height < 1 ||
    !isObject(entry.dimensions) ||
    !Number.isSafeInteger(entry.dimensions.width) ||
    !Number.isSafeInteger(entry.dimensions.height) ||
    entry.dimensions.width < 1 ||
    entry.dimensions.height < 1
  ) {
    reasons.push('queue-canvas-evidence-invalid');
  }
  if (reasons.length > 0) return { reasons };

  const approvedTraits = limited(
    (styleBank.byRole.get(semanticRole) ?? []).flatMap(
      (reference) => reference.approvedTraits ?? [],
    ),
  );
  const visualPillars = direction.visualPillars
    .map((pillar) =>
      isObject(pillar) ? String(pillar.rule ?? '').trim() : '',
    )
    .filter(Boolean);
  const palette = Object.entries(direction.palette.base ?? {}).map(
    ([name, value]) => `${name} ${value}`,
  );
  const transparency = transparencyFor(entry, mapping);
  const candidateFamilyId = safeId(
    binding.candidateFamilyId ??
      `${slug(semanticRole)}:${slug(entry.targetPath)}`,
    'candidateFamilyId',
  );

  const request = {
    schemaVersion: '1.0',
    operation,
    assetKind: mapping.assetKind,
    continuityPhase,
    assetId: assetIdentity(entry, binding),
    candidateFamilyId,
    creativeIntent: boundedText(binding.creativeIntent, 'creativeIntent'),
    ...(binding.negativeIntent
      ? {
          negativeIntent: boundedText(
            binding.negativeIntent,
            'negativeIntent',
          ),
        }
      : {}),
    style: {
      styleName: `Brass & Brine 1871 ${semanticRole}`,
      intent: limited([...visualPillars, ...approvedTraits], 32).join(' '),
      mustHave: limited([
        ...approvedTraits,
        ...stringList(binding.mustHave),
      ]),
      mustAvoid: limited([
        ...stringList(direction.forbidden),
        ...stringList(roleProfile.forbidden),
        ...stringList(entry.defects),
        ...stringList(entry.negativeConstraints),
        ...stringList(binding.mustAvoid),
      ]),
      identityLocks: limited([
        ...stringList(roleProfile.requiredIdentityAnchors),
        ...stringList(binding.identityLocks),
      ]),
      palette: limited([...palette, ...stringList(binding.palette)]),
      lineTreatment: limited([
        'Controlled engraved linework, stipple, hatching and dither; reject photographic AI gradients.',
        ...stringList(binding.lineTreatment),
      ]),
      materials: limited([
        'Period materials must remain distinct and plausible.',
        ...stringList(binding.materials),
      ]),
      cameraRules: limited([
        roleProfile.camera ? `Primary camera: ${roleProfile.camera}` : '',
        ...stringList(binding.cameraRules),
      ]),
      compositionRules: limited([
        direction.cameraAndComposition.sceneFloorLane?.required
          ? 'Preserve the broad gameplay floor lane.'
          : '',
        direction.cameraAndComposition.interactionSafety?.textSafeAreaRequired
          ? 'Preserve text and interaction safe areas.'
          : '',
        ...stringList(binding.compositionRules),
      ]),
      eraRules: limited([
        `Historically plausible for ${direction.timeline.defaultReferenceYear}; no identifiable anachronisms.`,
        ...stringList(binding.eraRules),
      ]),
    },
    shot: {
      subject: boundedText(binding.subject, 'subject', 1, 2_048),
      ...(binding.action
        ? { action: boundedText(binding.action, 'action', 1, 2_048) }
        : {}),
      ...(binding.direction
        ? {
            direction: boundedText(
              binding.direction,
              'direction',
              1,
              256,
            ),
          }
        : {}),
      include: limited([
        ...stringList(binding.include),
        ...Object.entries(assignment).map(
          ([key, value]) => `${key}: ${String(value)}`,
        ),
      ]),
      exclude: stringList(binding.exclude),
      separateAssets: stringList(binding.separateAssets),
      framing: limited([
        ...stringList(binding.framing),
        roleProfile.camera ? `Use ${roleProfile.camera}.` : '',
      ]),
    },
    target: {
      width: entry.targetCanvas.width,
      height: entry.targetCanvas.height,
      transparency,
      outputFormat: 'png',
    },
    background: {
      strategy:
        mapping.backgroundStrategy ??
        (transparency === 'opaque' ? 'opaque-source' : 'native-alpha'),
      ...(mapping.backgroundStrategy === 'chroma-key'
        ? { matteColour: mapping.matteColour ?? '#00ff00' }
        : {}),
    },
    quality: binding.quality ?? mapping.defaultQuality ?? 'high',
    candidateCount:
      binding.candidateCount ?? mapping.defaultCandidateCount ?? 4,
    ...(binding.seed === undefined ? {} : { seed: binding.seed }),
    references,
    selection: {
      ...(binding.preferredAdapterId
        ? {
            preferredAdapterId: safeId(
              binding.preferredAdapterId,
              'preferredAdapterId',
            ),
          }
        : {}),
      ...(binding.preferredModel
        ? {
            preferredModel: safeId(
              binding.preferredModel,
              'preferredModel',
            ),
          }
        : {}),
      allowedAdapterIds: stringList(binding.allowedAdapterIds, 32).map(
        (value) => safeId(value, 'allowedAdapterId'),
      ),
      allowFallback: binding.allowFallback === true,
      requireSeed: binding.requireSeed === true,
    },
    metadata: {
      schema: SCHEMAS.requestMetadata,
      gameHead: bindings.value.gameHead,
      queueSha256: records.queue.value.queueSha256,
      campaignSha256: campaign.campaignSha256,
      campaignRunId: campaign.value.runId,
      campaignItemId: campaignItem.itemId,
      technicalAdmissionSha256: campaign.technicalAdmissionSha256,
      styleBankSha256: styleBank.bankSha256,
      bindingsSha256: bindings.bindingsSha256,
      artDirectionFileSha256: records.direction.fileSha256,
      bridgeFileSha256: records.bridge.fileSha256,
      providerMapFileSha256: records.providerMap.fileSha256,
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      sourceDimensions: {
        width: entry.dimensions.width,
        height: entry.dimensions.height,
      },
      providerCanvasPolicy: 'adapter-derived-from-target',
      masteringRequired: true,
      targetPath: entry.targetPath,
      semanticRole,
      decision: entry.decision,
      approvals: {
        creative: false,
        historical: false,
        provenance: false,
        nativeRuntime: false,
        browser: false,
        publication: false,
      },
    },
  };
  return { request, operation, semanticRole };
}

export function compileProviderRequestBatch(records, maximumOrders) {
  const queue = validateQueue(records.queue);
  validateBridge(records.bridge, queue);
  const providerMap = validateProviderMap(records.providerMap);
  const direction = validateDirection(records.direction);
  const styleBank = validateStyleBank(records.styleBank);
  const campaign = validateCampaign(records.campaign);
  const bindings = validateBindings(
    records.bindings,
    records,
    queue,
    campaign,
    styleBank,
  );
  const maximumAuthority = Math.min(
    providerMap.maximumOrdersPerBatch,
    campaign.value.nextBatch.maximumItems,
  );
  if (maximumOrders > maximumAuthority) {
    fail(
      `maximum orders ${maximumOrders} exceeds campaign/provider authority ${maximumAuthority}`,
    );
  }

  const classified = classifyProviderEntries(queue, campaign);
  const requests = [];
  const blocked = [...classified.blocked];
  const deferred = [...classified.deferred];
  const targets = new Set();

  for (const { entry, campaignItem } of classified.eligible) {
    const semanticRole = normalizeRole(entry.semanticRole);
    const mapping = providerMap.roleMappings[semanticRole];
    const binding = bindings.sources.get(
      sourceIdentity(entry.sourcePath, entry.sourceSha256),
    );
    const operation = operationFor(entry);
    const reasons = [];
    if (!mapping) reasons.push('game-owned-provider-role-mapping-missing');
    if (!binding) reasons.push('source-artifact-binding-missing');
    if (!entry.targetPath) reasons.push('target-path-missing');
    if (
      entry.targetPath &&
      targets.has(String(entry.targetPath).toLowerCase())
    ) {
      reasons.push('target-path-collision');
    }
    let compiled;
    if (mapping && binding) {
      try {
        compiled = requestFor(
          entry,
          campaignItem,
          binding,
          mapping,
          direction,
          styleBank,
          bindings,
          records,
          campaign,
        );
        reasons.push(...(compiled.reasons ?? []));
      } catch (error) {
        reasons.push(
          `request-compilation-rejected:${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (reasons.length > 0) {
      blocked.push({
        campaignItemId: campaignItem.itemId,
        sourcePath: entry.sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath ?? null,
        operation,
        reasons: [...new Set(reasons)].sort(),
      });
      continue;
    }
    if (requests.length >= maximumOrders) {
      deferred.push({
        campaignItemId: campaignItem.itemId,
        sourcePath: entry.sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath,
        operation,
        reason: 'bounded-request-batch-limit-reached',
      });
      continue;
    }
    targets.add(String(entry.targetPath).toLowerCase());
    requests.push({
      workOrderId: `raw-art-provider-${sha256(
        Buffer.from(
          `${campaign.campaignSha256}\0${campaignItem.itemId}\0${entry.targetPath}\0${operation}`,
          'utf8',
        ),
      ).slice(0, 24)}`,
      campaignItemId: campaignItem.itemId,
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      semanticRole,
      targetPath: entry.targetPath,
      operation,
      request: compiled.request,
    });
  }

  blocked.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  deferred.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const currentDeferred = deferred.filter(
    (entry) => entry.reason !== 'outside-campaign-next-batch',
  );
  const status =
    requests.length === 0
      ? blocked.length > 0
        ? 'blocked'
        : 'idle'
      : blocked.length > 0 || currentDeferred.length > 0
        ? 'partially-ready'
        : 'ready';
  const batch = {
    schema: SCHEMAS.requestBatch,
    status,
    gameHead: bindings.value.gameHead,
    queueSha256: queue.queueSha256,
    campaignSha256: campaign.campaignSha256,
    campaignRunId: campaign.value.runId,
    technicalAdmissionSha256: campaign.technicalAdmissionSha256,
    styleBankSha256: styleBank.bankSha256,
    bindingsSha256: bindings.bindingsSha256,
    campaignNextBatchItemIds: [...campaign.value.nextBatch.itemIds],
    inputBindings: {
      queue: {
        path: records.queue.path,
        fileSha256: records.queue.fileSha256,
        documentSha256: queue.queueSha256,
      },
      campaign: {
        path: records.campaign.path,
        fileSha256: records.campaign.fileSha256,
        documentSha256: campaign.campaignSha256,
      },
      bridge: {
        path: records.bridge.path,
        fileSha256: records.bridge.fileSha256,
      },
      providerMap: {
        path: records.providerMap.path,
        fileSha256: records.providerMap.fileSha256,
      },
      direction: {
        path: records.direction.path,
        fileSha256: records.direction.fileSha256,
      },
      styleBank: {
        path: records.styleBank.path,
        fileSha256: records.styleBank.fileSha256,
        documentSha256: styleBank.bankSha256,
      },
      artifactBindings: {
        path: records.bindings.path,
        fileSha256: records.bindings.fileSha256,
        documentSha256: bindings.bindingsSha256,
      },
    },
    maximumOrders,
    maximumOrdersAuthority: maximumAuthority,
    counts: {
      providerRequiredTotal: classified.providerRequiredTotal,
      campaignNextBatchEligible: classified.eligible.length,
      ready: requests.length,
      blocked: blocked.length,
      deferred: deferred.length,
      outsideCampaignNextBatch: deferred.filter(
        (entry) => entry.reason === 'outside-campaign-next-batch',
      ).length,
      campaignOrBatchDeferred: currentDeferred.length,
    },
    requests,
    blocked,
    deferred,
    nextActions: [
      'Validate every request through validate_provider_candidate_request.',
      'Compile deterministic prompts and runtime jobs through compile_provider_candidate_request.',
      'Submit runtime jobs only through a separate explicit submit_art_runtime_jobs call.',
      'Run the Art Studio worker separately; it stores immutable unapproved candidate and provider-evidence artifacts automatically.',
      'Evaluate and independently approve candidates before Development Studio publication.',
    ],
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      creativeApproval: false,
      historicalApproval: false,
      provenanceApproval: false,
      runtimeApproval: false,
      publication: false,
      forcePush: false,
    },
  };
  batch.batchSha256 = hashObject(batch);
  batch.runId = batch.batchSha256.slice(0, 20);
  return Object.freeze(batch);
}
