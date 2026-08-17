import { createHash } from 'node:crypto';

import {
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './top-hat-pose-slot-provider-package.mjs';

export const topHatPoseRuntimeFixtureOccurredAt =
  '2026-08-16T12:00:00.000Z';
export const topHatPoseRuntimeFixtureExpiresAt =
  '2026-08-16T18:00:00.000Z';
export const topHatPoseRuntimeFixtureCompiledAt =
  '2026-08-16T12:30:00.000Z';

const sha = (value) =>
  createHash('sha256').update(String(value), 'utf8').digest('hex');
const artifactId = (value) => `artifact_${sha(value)}`;

export function createReadyTopHatPoseSlotProviderRuntimeRequest() {
  const template =
    createProjectArtTopHatPoseSlotProviderPackageRequest();
  const selectionBySlot = {};
  const authorizationBySlot = {};
  const artifactBindingsBySlot = {};

  for (const [slotIndex, slot] of
    template.plan.productionSlots.entries()) {
    selectionBySlot[slot.slotId] = {
      preferredAdapterId: 'openai-image-edit',
      preferredModel: 'gpt-image-1.5',
      allowedAdapterIds: ['openai-image-edit'],
      allowFallback: false,
      requireSeed: true,
      seed: 187100 + slotIndex,
    };
    authorizationBySlot[slot.slotId] = {
      action: 'run-top-hat-pose-provider-once',
      actorClass: 'human',
      actorId: 'fixture-reviewer',
      slotId: slot.slotId,
      occurredAt: topHatPoseRuntimeFixtureOccurredAt,
      expiresAt: topHatPoseRuntimeFixtureExpiresAt,
      evidenceSha256: sha(`authorization:${slot.slotId}`),
      maximumProviderCalls: 1,
    };
    artifactBindingsBySlot[slot.slotId] = [
      ...template.plan.identityAnchors.map((anchor) => ({
        bindingKey: `anchor:${anchor.id}`,
        role:
          anchor.id === 'neutral'
            ? 'edit-source'
            : 'identity-anchor',
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
        artifactId: artifactId(
          `${slot.slotId}:anchor:${anchor.id}`,
        ),
        evidenceSha256: sha(
          `${slot.slotId}:anchor-evidence:${anchor.id}`,
        ),
        actorClass: 'human',
        actorId: 'fixture-reviewer',
        occurredAt: topHatPoseRuntimeFixtureOccurredAt,
      })),
      ...slot.sourceMapping.sourceClipIds.map((clipId) => ({
        bindingKey: `clip:${clipId}`,
        role: 'animation-clip-reference',
        sourcePath:
          `artifacts/top-hat-man/animation-suite/${clipId}.reference.json`,
        sourceSha256: sha(`${slot.slotId}:clip:${clipId}`),
        artifactId: artifactId(
          `${slot.slotId}:clip:${clipId}`,
        ),
        evidenceSha256: sha(
          `${slot.slotId}:clip-evidence:${clipId}`,
        ),
        actorClass: 'human',
        actorId: 'fixture-reviewer',
        occurredAt: topHatPoseRuntimeFixtureOccurredAt,
      })),
    ];
  }

  return createProjectArtTopHatPoseSlotProviderPackageRequest({
    requestId:
      'top-hat-pose-runtime-adapter-authorized-v1',
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
  });
}
