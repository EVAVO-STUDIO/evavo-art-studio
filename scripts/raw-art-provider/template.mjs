import {
  HEX40,
  SCHEMAS,
  directionRole,
  fail,
  normalizeRole,
  operationFor,
  validateBridge,
  validateDirection,
  validateProviderMap,
  validateQueue,
  validateStyleBank,
} from './shared.mjs';

export function buildBindingsTemplate(records, gameHead) {
  if (!HEX40.test(gameHead)) fail('game head must be an exact lowercase 40-character Git SHA');
  const queue = validateQueue(records.queue);
  validateBridge(records.bridge, queue);
  const providerMap = validateProviderMap(records.providerMap);
  validateDirection(records.direction);
  const styleBank = validateStyleBank(records.styleBank);
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

  const bindings = queue.entries
    .filter((entry) => entry.state === 'provider-required')
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .map((entry) => {
      const semanticRole = normalizeRole(entry.semanticRole);
      const mapping = providerMap.roleMappings[semanticRole];
      const operation = operationFor(entry);
      const continuity = mapping?.continuityByOperation?.[operation] ?? 'independent';
      const requiresIdentity =
        mapping &&
        ['sprite-frame', 'sprite-layer'].includes(mapping.assetKind) &&
        !['independent', 'identity-master'].includes(continuity);
      return {
        sourcePath: entry.sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        operation,
        requirements: [
          'creativeIntent',
          'subject',
          'approved style artifact',
          ...(['edit', 'inpaint'].includes(operation) ? ['baseImageArtifactId'] : []),
          ...(operation === 'inpaint' ? ['maskArtifactId'] : []),
          ...(requiresIdentity ? ['canonicalIdentityArtifactId'] : []),
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
        continuityPhase: continuity,
        mustHave: entry.approvedTraits ?? [],
        mustAvoid: [...(entry.defects ?? []), ...(entry.negativeConstraints ?? [])],
        identityLocks:
          records.direction.value.roleProfiles?.[directionRole(semanticRole)]
            ?.requiredIdentityAnchors ?? [],
        quality: mapping?.defaultQuality ?? 'high',
        candidateCount: mapping?.defaultCandidateCount ?? 4,
        references: [],
      };
    });

  return Object.freeze({
    schema: SCHEMAS.bindingsTemplate,
    targetSchema: SCHEMAS.bindings,
    status: 'draft-requires-artifact-materialisation-and-creative-briefs',
    gameHead,
    queueSha256: queue.queueSha256,
    styleBankSha256: styleBank.bankSha256,
    inputFileSha256s: {
      queue: records.queue.fileSha256,
      bridge: records.bridge.fileSha256,
      providerMap: records.providerMap.fileSha256,
      direction: records.direction.fileSha256,
      styleBank: records.styleBank.fileSha256,
    },
    styleReferenceArtifacts,
    bindings,
    instructions: [
      `Change schema to ${SCHEMAS.bindings} and status to ready only after all placeholders are replaced.`,
      'Filenames are not creative briefs, identities or historical evidence.',
      'Provider execution and runtime submission remain separate explicit actions.',
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
