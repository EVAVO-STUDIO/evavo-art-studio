import {
  canonicalPath,
  digest,
  fail,
} from './avatar-final-pass-provider-common.mjs';

function reference(bindingKey, role, sourcePath, sourceSha256, note) {
  return Object.freeze({
    bindingKey,
    role,
    sourcePath: canonicalPath(sourcePath, `${bindingKey}.sourcePath`),
    sourceSha256: digest(sourceSha256, `${bindingKey}.sourceSha256`),
    required: true,
    note,
  });
}

export function requiredReferences(entry, plan) {
  const references = [];
  const prerequisiteBlockers = [];
  const identity = entry.identity;
  if (identity.pendingOutput || identity.expectedSha256 === null) {
    prerequisiteBlockers.push('identity-frame-final-output-required');
  } else {
    references.push(
      reference(
        'canonical-identity',
        'canonical-identity',
        identity.sourcePath,
        identity.expectedSha256,
        `Approved identity anchor ${entry.identityFrameId}.`,
      ),
    );
  }

  if (entry.upstream.kind === 'provider-redraw') {
    const defectMask = entry.artifactBindings.find(
      (binding) => binding.bindingKey === 'defect-mask',
    );
    if (!defectMask) {
      prerequisiteBlockers.push('defect-mask-artifact-required');
    } else {
      references.push(
        reference(
          'defect-mask',
          'edit-mask',
          defectMask.sourcePath,
          defectMask.sourceSha256,
          `Exact human-admitted defect mask for ${entry.upstream.frameId}.`,
        ),
      );
    }
    references.push(
      reference(
        'base-image',
        'base-image',
        entry.upstream.sourcePath,
        entry.upstream.sourceSha256,
        `Exact immutable source for ${entry.upstream.frameId}.`,
      ),
    );
  } else {
    const before = plan.descriptorsById.get(entry.upstream.beforeFrameId);
    const after = plan.descriptorsById.get(entry.upstream.afterFrameId);
    if (!before) fail('AVATAR_FINAL_PASS_PROVIDER_BEFORE_FRAME_UNKNOWN');
    if (!after) fail('AVATAR_FINAL_PASS_PROVIDER_AFTER_FRAME_UNKNOWN');
    if (before.pendingOutput || before.expectedSha256 === null) {
      prerequisiteBlockers.push('before-frame-final-output-required');
    } else {
      references.push(
        reference(
          'previous-key-pose',
          'previous-key-pose',
          before.sourcePath,
          before.expectedSha256,
          `Final reviewed previous key pose ${before.id}.`,
        ),
      );
    }
    if (after.pendingOutput || after.expectedSha256 === null) {
      prerequisiteBlockers.push('after-frame-final-output-required');
    } else {
      references.push(
        reference(
          'next-key-pose',
          'next-key-pose',
          after.sourcePath,
          after.expectedSha256,
          `Final reviewed next key pose ${after.id}.`,
        ),
      );
    }
  }
  return Object.freeze({
    references: Object.freeze(references),
    prerequisiteBlockers: Object.freeze(prerequisiteBlockers),
  });
}

export function admitBindings(entry, requirements) {
  const requiredByKey = new Map(
    requirements.references.map((item) => [item.bindingKey, item]),
  );
  const admittedByKey = new Map();
  for (const binding of entry.artifactBindings) {
    const required = requiredByKey.get(binding.bindingKey);
    if (!required) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_BINDING_NOT_REQUIRED',
        `${entry.jobId}.${binding.bindingKey} is not required.`,
      );
    }
    if (
      binding.sourcePath !== required.sourcePath ||
      binding.sourceSha256 !== required.sourceSha256
    ) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_BINDING_SOURCE_MISMATCH',
        `${entry.jobId}.${binding.bindingKey} does not match the exact required source.`,
      );
    }
    admittedByKey.set(binding.bindingKey, binding);
  }
  const missing = requirements.references
    .filter((required) => !admittedByKey.has(required.bindingKey))
    .map((required) => required.bindingKey);
  const admitted = requirements.references
    .filter((required) => admittedByKey.has(required.bindingKey))
    .map((required) => {
      const binding = admittedByKey.get(required.bindingKey);
      return Object.freeze({
        ...required,
        artifactId: binding.artifactId,
        evidenceSha256: binding.evidenceSha256,
        actorClass: binding.actorClass,
        actorId: binding.actorId,
        occurredAt: binding.occurredAt,
      });
    });
  return Object.freeze({
    admitted: Object.freeze(admitted),
    missing: Object.freeze(missing),
  });
}

export function prompt(entry, plan) {
  const sourceSpaceRepair =
    plan.sessionId === 'eva-source-repair-v1' &&
    entry.upstream.kind === 'provider-redraw';
  const lines = [
    `Create exactly one production candidate for ${plan.characterId} frame ${entry.upstream.frameId}.`,
    sourceSpaceRepair
      ? `Target canvas: ${plan.canvas.width} x ${plan.canvas.height} 8-bit RGBA PNG preserving the supplied source background and alpha semantics exactly outside the mask.`
      : `Target canvas: ${plan.canvas.width} x ${plan.canvas.height} RGBA PNG with true transparent alpha.`,
    `Preserve the exact canonical identity supplied as the canonical-identity reference.`,
  ];
  if (entry.upstream.kind === 'provider-redraw') {
    lines.push(
      `Edit the supplied base image; do not redesign or replace the pose.`,
      `Correct only these declared defects: ${entry.upstream.issues.join(', ')}.`,
      'Use a precise repair mask over only the declared defect region and the smallest necessary anatomical boundary.',
      'The defect-mask reference is the only authorized edit region; do not infer, expand or replace it.',
      'Use the provider\'s highest supported input-fidelity mode. Pixels outside the repair mask must remain invariant.',
    );
  } else {
    lines.push(
      `Generate one anatomy-preserving in-between between ${entry.upstream.beforeFrameId} and ${entry.upstream.afterFrameId}.`,
      `The new frame must read as a physically coherent intermediate pose, not a cross-fade or double exposure.`,
      `Preserve these declared constraints: ${entry.upstream.constraints.join(', ')}.`,
    );
  }
  if (entry.notes) lines.push(`Operator notes: ${entry.notes}`);
  lines.push(
    'Keep face, hair, clothing, proportions, palette, lighting, camera, outline treatment and canvas registration consistent.',
    'Hands, fingers, wrists, arms, anatomy, silhouette and transparent edges must be clean at native scale.',
    sourceSpaceRepair
      ? 'Return an 8-bit RGBA source-space candidate. Do not remove, repaint, reinterpret or normalize the supplied opaque background outside the mask; production alpha mastering is a separate downstream gate.'
      : 'Return actual RGBA transparency. A baked checkerboard, matte, halo or opaque background is a failed candidate.',
    sourceSpaceRepair
      ? 'Return one frame only: no contact sheet, no alternate, no text, no labels and no second character.'
      : 'Return one frame only: no contact sheet, no alternate, no text, no labels, no background and no second character.',
  );
  return lines.join('\n');
}
