import {
  assert,
} from './avatar-final-pass-provider-runtime-common.mjs';

function referenceNote(binding, mappedRole) {
  if (binding.sourceClipId !== null) {
    return `Top Hat continuity evidence ${binding.sourceClipId}; retained in provider metadata and not submitted as an unverified image reference.`;
  }
  return mappedRole === 'base-image'
    ? 'Exact admitted neutral Top Hat body used as the edit base image.'
    : `Exact admitted Top Hat ${binding.bindingKey.slice('anchor:'.length)} body identity anchor.`;
}

function mapBinding(binding) {
  if (binding.bindingKey === 'anchor:neutral') {
    return Object.freeze({
      bindingKey: 'base-image',
      role: 'base-image',
      sourcePath: binding.sourcePath,
      sourceSha256: binding.sourceSha256,
      required: true,
      note: referenceNote(binding, 'base-image'),
      artifactId: binding.artifactId,
      evidenceSha256: binding.evidenceSha256,
      actorClass: 'human',
      actorId: binding.actorId,
      occurredAt: binding.occurredAt,
    });
  }
  if (
    binding.bindingKey === 'anchor:inhale' ||
    binding.bindingKey === 'anchor:exhale'
  ) {
    const anchorId = binding.bindingKey.slice('anchor:'.length);
    return Object.freeze({
      bindingKey: `canonical-identity:${anchorId}`,
      role: 'canonical-identity',
      sourcePath: binding.sourcePath,
      sourceSha256: binding.sourceSha256,
      required: true,
      note: referenceNote(binding, 'canonical-identity'),
      artifactId: binding.artifactId,
      evidenceSha256: binding.evidenceSha256,
      actorClass: 'human',
      actorId: binding.actorId,
      occurredAt: binding.occurredAt,
    });
  }
  assert(
    binding.sourceClipId !== null,
    'TOP_HAT_PROVIDER_RUNTIME_REFERENCE_ROLE_INVALID',
    `Unsupported Top Hat reference binding ${binding.bindingKey}.`,
  );
  return Object.freeze({
    bindingKey: `continuity:${binding.sourceClipId}`,
    role: 'continuity-evidence',
    sourcePath: binding.sourcePath,
    sourceSha256: binding.sourceSha256,
    required: true,
    note: referenceNote(binding, 'continuity-evidence'),
    artifactId: binding.artifactId,
    evidenceSha256: binding.evidenceSha256,
    actorClass: 'human',
    actorId: binding.actorId,
    occurredAt: binding.occurredAt,
  });
}

function requiredReference(admitted) {
  const {
    artifactId: _artifactId,
    evidenceSha256: _evidenceSha256,
    actorClass: _actorClass,
    actorId: _actorId,
    occurredAt: _occurredAt,
    ...required
  } = admitted;
  return Object.freeze(required);
}

export function mapTopHatRuntimeReferences(sourceJob) {
  const admittedReferences = Object.freeze(
    sourceJob.admittedReferences.map(mapBinding),
  );
  return Object.freeze({
    admittedReferences,
    requiredReferences: Object.freeze(
      admittedReferences.map(requiredReference),
    ),
  });
}

function providerReferenceOrder(entry) {
  return entry.role === 'canonical-identity' ? 0 : 1;
}

export function topHatRuntimeProviderImageReferences(admittedReferences) {
  const imageReferences = admittedReferences.filter(
    (entry) =>
      entry.role === 'base-image' ||
      entry.role === 'canonical-identity',
  );
  assert(
    imageReferences.filter((entry) => entry.role === 'base-image')
      .length === 1 &&
      imageReferences.filter(
        (entry) => entry.role === 'canonical-identity',
      ).length === 2,
    'TOP_HAT_PROVIDER_RUNTIME_IMAGE_REFERENCES_INCOMPLETE',
  );
  return Object.freeze(
    imageReferences
      .map((entry) =>
        Object.freeze({
          artifactId: entry.artifactId,
          role: entry.role,
          strength: 1,
          required: true,
          note: entry.note,
        }),
      )
      .sort(
        (left, right) =>
          providerReferenceOrder(left) - providerReferenceOrder(right) ||
          left.artifactId.localeCompare(right.artifactId),
      ),
  );
}

export function topHatRuntimeContinuityEvidence(
  sourceJob,
  admittedReferences,
) {
  const byBinding = new Map(
    sourceJob.admittedReferences.map((entry) => [
      entry.bindingKey,
      entry,
    ]),
  );
  return Object.freeze(
    admittedReferences
      .filter((entry) => entry.role === 'continuity-evidence')
      .map((entry) => {
        const sourceClipId = entry.bindingKey.slice(
          'continuity:'.length,
        );
        const source = byBinding.get(`clip:${sourceClipId}`);
        assert(
          source && source.sourceClipId === sourceClipId,
          'TOP_HAT_PROVIDER_RUNTIME_CONTINUITY_EVIDENCE_INVALID',
        );
        return Object.freeze({
          sourceClipId,
          sourcePath: entry.sourcePath,
          sourceSha256: entry.sourceSha256,
          artifactId: entry.artifactId,
          evidenceSha256: entry.evidenceSha256,
          actorClass: 'human',
          actorId: entry.actorId,
          occurredAt: entry.occurredAt,
        });
      }),
  );
}
