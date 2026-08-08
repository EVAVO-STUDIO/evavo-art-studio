import {
  ARTIFACT_ID,
  SCHEMAS,
  assertFalseAuthority,
  classifyProviderEntries,
  fail,
  hashObject,
  isObject,
  normalizeRole,
  operationFor,
  sourceIdentity,
  validateBridge,
  validateCampaign,
  validateDirection,
  validateProviderMap,
  validateQueue,
  validateStyleBank,
} from './shared.mjs';

function containsPlaceholder(value) {
  if (typeof value === 'string') {
    return /<[^>]+>/u.test(value) || value.includes('replace-with-');
  }
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isObject(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

function validateTemplateIdentity(template, records, queue, campaign, styleBank) {
  if (
    template.schema !== SCHEMAS.bindingsTemplate ||
    template.targetSchema !== SCHEMAS.bindings ||
    template.queueSha256 !== queue.queueSha256 ||
    template.campaignSha256 !== campaign.campaignSha256 ||
    template.technicalAdmissionSha256 !== campaign.technicalAdmissionSha256 ||
    template.styleBankSha256 !== styleBank.bankSha256 ||
    !isObject(template.inputFileSha256s) ||
    template.inputFileSha256s.queue !== records.queue.fileSha256 ||
    template.inputFileSha256s.campaign !== records.campaign.fileSha256 ||
    template.inputFileSha256s.bridge !== records.bridge.fileSha256 ||
    template.inputFileSha256s.providerMap !== records.providerMap.fileSha256 ||
    template.inputFileSha256s.direction !== records.direction.fileSha256 ||
    template.inputFileSha256s.styleBank !== records.styleBank.fileSha256 ||
    !Array.isArray(template.styleReferenceArtifacts) ||
    !Array.isArray(template.bindings)
  ) {
    fail('completed template is stale or has an unexpected identity');
  }
  assertFalseAuthority(template.authority, 'completed template');
}

function validateArtifactIdentifiers(value, path = 'template') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateArtifactIdentifiers(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith('ArtifactId') || key === 'artifactId') {
      if (!ARTIFACT_ID.test(entry ?? '')) {
        fail(`${path}.${key} must use artifact_<sha256> format`);
      }
    }
    validateArtifactIdentifiers(entry, `${path}.${key}`);
  }
}

export function finalizeBindingsTemplate(records, completedTemplate) {
  const queue = validateQueue(records.queue);
  validateBridge(records.bridge, queue);
  const providerMap = validateProviderMap(records.providerMap);
  validateDirection(records.direction);
  const styleBank = validateStyleBank(records.styleBank);
  const campaign = validateCampaign(records.campaign);
  const template = completedTemplate.value;
  validateTemplateIdentity(template, records, queue, campaign, styleBank);
  if (
    containsPlaceholder(template.styleReferenceArtifacts) ||
    containsPlaceholder(template.bindings)
  ) {
    fail('completed template still contains placeholders');
  }
  validateArtifactIdentifiers({
    styleReferenceArtifacts: template.styleReferenceArtifacts,
    bindings: template.bindings,
  });

  const classified = classifyProviderEntries(queue, campaign);
  const eligibleIdentities = new Map(
    classified.eligible.map(({ entry, campaignItem }) => [
      sourceIdentity(entry.sourcePath, entry.sourceSha256),
      { entry, campaignItem },
    ]),
  );
  const boundIdentities = new Set();
  for (const binding of template.bindings) {
    if (!isObject(binding)) fail('completed template binding is invalid');
    const identity = sourceIdentity(binding.sourcePath, binding.sourceSha256);
    const eligible = eligibleIdentities.get(identity);
    if (!eligible || eligible.campaignItem.itemId !== binding.campaignItemId) {
      fail('completed template contains a binding outside campaign nextBatch authority');
    }
    if (boundIdentities.has(identity)) fail('completed template duplicates a source binding');
    boundIdentities.add(identity);
  }

  const roleArtifacts = new Set(
    template.styleReferenceArtifacts.map((entry) =>
      normalizeRole(entry.semanticRole),
    ),
  );
  const bindingByIdentity = new Map(
    template.bindings.map((binding) => [
      sourceIdentity(binding.sourcePath, binding.sourceSha256),
      binding,
    ]),
  );
  const complete = classified.eligible.every(({ entry }) => {
    const identity = sourceIdentity(entry.sourcePath, entry.sourceSha256);
    const binding = bindingByIdentity.get(identity);
    const semanticRole = normalizeRole(entry.semanticRole);
    const mapping = providerMap.roleMappings[semanticRole];
    const operation = operationFor(entry);
    const continuity =
      binding?.continuityPhase ??
      mapping?.continuityByOperation?.[operation] ??
      'independent';
    const requiresIdentity =
      mapping &&
      ['sprite-frame', 'sprite-layer'].includes(mapping.assetKind) &&
      !['independent', 'identity-master'].includes(continuity);
    return Boolean(
      binding &&
        roleArtifacts.has(semanticRole) &&
        typeof binding.creativeIntent === 'string' &&
        binding.creativeIntent.trim() &&
        typeof binding.subject === 'string' &&
        binding.subject.trim() &&
        (!['edit', 'inpaint'].includes(operation) ||
          ARTIFACT_ID.test(binding.baseImageArtifactId ?? '')) &&
        (operation !== 'inpaint' ||
          ARTIFACT_ID.test(binding.maskArtifactId ?? '')) &&
        (!requiresIdentity ||
          ARTIFACT_ID.test(binding.canonicalIdentityArtifactId ?? '')) &&
        (continuity !== 'in-between' ||
          (ARTIFACT_ID.test(binding.previousKeyPoseArtifactId ?? '') &&
            ARTIFACT_ID.test(binding.nextKeyPoseArtifactId ?? ''))),
    );
  });

  const finalized = {
    schema: SCHEMAS.bindings,
    status: complete ? 'ready' : 'partially-ready',
    gameHead: template.gameHead,
    queueSha256: queue.queueSha256,
    campaignSha256: campaign.campaignSha256,
    campaignRunId: campaign.value.runId,
    technicalAdmissionSha256: campaign.technicalAdmissionSha256,
    styleBankSha256: styleBank.bankSha256,
    inputFileSha256s: { ...template.inputFileSha256s },
    sourceTemplate: {
      path: completedTemplate.path,
      fileSha256: completedTemplate.fileSha256,
    },
    styleReferenceArtifacts: template.styleReferenceArtifacts,
    bindings: template.bindings,
    completeness: {
      campaignNextBatchEligible: classified.eligible.length,
      boundEligibleSources: boundIdentities.size,
      eligibleRolesWithStyleArtifacts: [
        ...new Set(
          classified.eligible
            .map(({ entry }) => normalizeRole(entry.semanticRole))
            .filter((role) => roleArtifacts.has(role)),
        ),
      ].sort(),
    },
    authority: { ...template.authority },
  };
  finalized.bindingsSha256 = hashObject(finalized);
  finalized.runId = finalized.bindingsSha256.slice(0, 20);
  return Object.freeze(finalized);
}
