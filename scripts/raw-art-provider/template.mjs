import {
  HEX40,
  SCHEMAS,
  classifyProviderEntries,
  directionRole,
  fail,
  normalizeRole,
  operationFor,
  validateBridge,
  validateCampaign,
  validateDirection,
  validateProviderMap,
  validateQueue,
  validateStyleBank,
} from './shared.mjs';

const detailLimit = (values, maximum = 250) => ({
  total: values.length,
  details: values.slice(0, maximum),
  detailsTruncated: values.length > maximum,
});

export function buildBindingsTemplate(records, gameHead) {
  if (!HEX40.test(gameHead)) {
    fail('game head must be an exact lowercase 40-character Git SHA');
  }
  const queue = validateQueue(records.queue);
  validateBridge(records.bridge, queue);
  const providerMap = validateProviderMap(records.providerMap);
  const direction = validateDirection(records.direction);
  const styleBank = validateStyleBank(records.styleBank);
  const campaign = validateCampaign(records.campaign);
  const classified = classifyProviderEntries(queue, campaign);
  const firstRoleReference = new Set();

  const styleReferenceArtifacts = styleBank.value.references.map((reference) => {
    const semanticRole = normalizeRole(reference.semanticRole);
    const first = !firstRoleReference.has(semanticRole);
    firstRoleReference.add(semanticRole);
    return {
      sourcePath: reference.sourcePath,
      sourceSha256: reference.sourceSha256,
      semanticRole,
      artifactId: '<replace-with-artifact_sha256>',
      providerRole: first ? 'direction-master' : 'line-reference',
      strength: 1,
      required: true,
    };
  });

  const bindings = classified.eligible.map(({ entry, campaignItem }) => {
    const semanticRole = normalizeRole(entry.semanticRole);
    const mapping = providerMap.roleMappings[semanticRole];
    const operation = operationFor(entry);
    const continuity =
      mapping?.continuityByOperation?.[operation] ?? 'independent';
    const requiresIdentity =
      mapping &&
      ['sprite-frame', 'sprite-layer'].includes(mapping.assetKind) &&
      !['independent', 'identity-master'].includes(continuity);
    return {
      campaignItemId: campaignItem.itemId,
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      semanticRole,
      operation,
      requirements: [
        'creativeIntent',
        'subject',
        'approved style artifact',
        ...(['edit', 'inpaint'].includes(operation)
          ? ['baseImageArtifactId']
          : []),
        ...(operation === 'inpaint' ? ['maskArtifactId'] : []),
        ...(requiresIdentity ? ['canonicalIdentityArtifactId'] : []),
        ...(continuity === 'in-between'
          ? ['previousKeyPoseArtifactId', 'nextKeyPoseArtifactId']
          : []),
      ],
      creativeIntent: '<describe exact visual change>',
      subject: String(
        entry.assignment?.identityId ??
          entry.assignment?.sceneId ??
          entry.targetPath ??
          entry.sourcePath,
      ),
      ...(['edit', 'inpaint'].includes(operation)
        ? { baseImageArtifactId: '<replace-with-artifact_sha256>' }
        : {}),
      ...(operation === 'inpaint'
        ? { maskArtifactId: '<replace-with-artifact_sha256>' }
        : {}),
      ...(requiresIdentity
        ? { canonicalIdentityArtifactId: '<replace-with-artifact_sha256>' }
        : {}),
      ...(continuity === 'in-between'
        ? {
            previousKeyPoseArtifactId: '<replace-with-artifact_sha256>',
            nextKeyPoseArtifactId: '<replace-with-artifact_sha256>',
          }
        : {}),
      continuityPhase: continuity,
      mustHave: entry.approvedTraits ?? [],
      mustAvoid: [
        ...(entry.defects ?? []),
        ...(entry.negativeConstraints ?? []),
      ],
      identityLocks:
        direction.roleProfiles?.[directionRole(semanticRole)]
          ?.requiredIdentityAnchors ?? [],
      quality: mapping?.defaultQuality ?? 'high',
      candidateCount: mapping?.defaultCandidateCount ?? 4,
      references: [],
    };
  });

  const blocked = detailLimit(classified.blocked);
  const deferred = detailLimit(classified.deferred);
  return Object.freeze({
    schema: SCHEMAS.bindingsTemplate,
    targetSchema: SCHEMAS.bindings,
    status: 'draft-requires-artifact-materialisation-and-creative-briefs',
    gameHead,
    queueSha256: queue.queueSha256,
    campaignSha256: campaign.campaignSha256,
    campaignRunId: campaign.value.runId,
    technicalAdmissionSha256: campaign.technicalAdmissionSha256,
    styleBankSha256: styleBank.bankSha256,
    campaignNextBatchItemIds: [...campaign.value.nextBatch.itemIds],
    maximumOrdersAuthority: Math.min(
      providerMap.maximumOrdersPerBatch,
      campaign.value.nextBatch.maximumItems,
    ),
    inputFileSha256s: {
      queue: records.queue.fileSha256,
      campaign: records.campaign.fileSha256,
      bridge: records.bridge.fileSha256,
      providerMap: records.providerMap.fileSha256,
      direction: records.direction.fileSha256,
      styleBank: records.styleBank.fileSha256,
    },
    counts: {
      providerRequiredTotal: classified.providerRequiredTotal,
      campaignNextBatchEligible: bindings.length,
      blocked: blocked.total,
      deferred: deferred.total,
    },
    styleReferenceArtifacts,
    bindings,
    blocked,
    deferred,
    instructions: [
      'Materialise source, mask, identity, key-pose and approved style files through store_artifact_file.',
      'Replace every placeholder with an immutable artifact_<sha256> identifier and write an exact creative intent.',
      'Run the finalize command; do not change the schema or status manually.',
      'Provider execution and runtime submission remain separate explicit actions after request validation and compilation.',
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
  });
}
