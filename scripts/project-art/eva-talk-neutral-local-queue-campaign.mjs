import {
  EVA_TALK_NEUTRAL_CANVAS,
  EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_CAMPAIGN_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
  EVA_TALK_NEUTRAL_LOCAL_PACKET_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT,
  SHA256,
  assert,
  assertClosedAuthority,
  canonicalEvaTalkNeutralLocalQueueJson,
  canonicalRelativePath,
  deepFreeze,
  exactKeys,
  identifier,
  sha256EvaTalkNeutralLocalQueueDocument,
  snapshot,
  stableJson,
  timestamp,
  safeInteger,
} from './eva-talk-neutral-local-queue-common.mjs';

export function parseEvaTalkNeutralLocalCampaign(input) {
  const value = snapshot(input, 'campaign');
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'campaignId',
      'createdAt',
      'characterId',
      'clipId',
      'sourcePlan',
      'candidateProgram',
      'canvas',
      'references',
      'promptContract',
      'reviewBoundary',
      'authority',
      'campaignSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_CAMPAIGN_KEYS_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_CAMPAIGN_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.characterId === 'eva-female' &&
      value.clipId === 'talk-neutral',
    'EVA_TALK_NEUTRAL_QUEUE_CAMPAIGN_INVALID',
  );
  identifier(value.campaignId, 'campaignId');
  timestamp(value.createdAt, 'createdAt');
  exactKeys(
    value.sourcePlan,
    ['schema', 'repository', 'path', 'clipId', 'targetFrameCount'],
    'EVA_TALK_NEUTRAL_QUEUE_SOURCE_PLAN_INVALID',
  );
  assert(
    value.sourcePlan.schema === 'evavo.project-art-avatar-animation-suite-plan.v3' &&
      value.sourcePlan.repository === 'EVAVO-STUDIO/evavo-art-studio' &&
      value.sourcePlan.path === 'scripts/project-art/avatar-animation-suite.mjs' &&
      value.sourcePlan.clipId === 'talk-neutral' &&
      value.sourcePlan.targetFrameCount === EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_SOURCE_PLAN_INVALID',
  );
  exactKeys(
    value.candidateProgram,
    ['batchCount', 'imagesPerBatch', 'candidateCount', 'selectionTargetFrameCount'],
    'EVA_TALK_NEUTRAL_QUEUE_CANDIDATE_PROGRAM_INVALID',
  );
  assert(
    value.candidateProgram.batchCount === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT &&
      value.candidateProgram.imagesPerBatch === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH &&
      value.candidateProgram.candidateCount === EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT &&
      value.candidateProgram.selectionTargetFrameCount === EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_CANDIDATE_PROGRAM_INVALID',
  );
  exactKeys(value.canvas, ['width', 'height', 'format', 'alpha'], 'EVA_TALK_NEUTRAL_QUEUE_CANVAS_INVALID');
  assert(
    value.canvas.width === EVA_TALK_NEUTRAL_CANVAS.width &&
      value.canvas.height === EVA_TALK_NEUTRAL_CANVAS.height &&
      value.canvas.format === 'png' &&
      value.canvas.alpha === 'rgba8-straight',
    'EVA_TALK_NEUTRAL_QUEUE_CANVAS_INVALID',
  );
  exactKeys(
    value.references,
    [
      'canonicalIdentityRequired',
      'animationIdentityMasterRequired',
      'previousApprovedFrameRequiredAfterFirstSlot',
      'contactSheetAsSourceForbidden',
      'sourceBytesEmbeddedInQueue',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_REFERENCES_INVALID',
  );
  assert(
    value.references.canonicalIdentityRequired === true &&
      value.references.animationIdentityMasterRequired === true &&
      value.references.previousApprovedFrameRequiredAfterFirstSlot === true &&
      value.references.contactSheetAsSourceForbidden === true &&
      value.references.sourceBytesEmbeddedInQueue === false,
    'EVA_TALK_NEUTRAL_QUEUE_REFERENCES_INVALID',
  );
  exactKeys(
    value.promptContract,
    [
      'oneImagePerSlot',
      'contactSheetForbidden',
      'spriteSheetForbidden',
      'nativeTransparencyPreferred',
      'paintedCheckerboardForbidden',
      'cameraLocked',
      'cropLocked',
      'scaleLocked',
      'floorPositionLocked',
      'identityLocked',
      'anatomyLocked',
      'independentFrameRedesignForbidden',
      'localWorkerOnly',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_PROMPT_CONTRACT_INVALID',
  );
  assert(
    Object.entries(value.promptContract).every(([, setting]) => setting === true),
    'EVA_TALK_NEUTRAL_QUEUE_PROMPT_CONTRACT_INVALID',
  );
  exactKeys(
    value.reviewBoundary,
    [
      'outputsRemainUnapprovedCandidates',
      'semanticOrderingRequiresSeparateReview',
      'continuityReviewRequired',
      'alphaMasteringRequired',
      'technicalInspectionRequired',
      'creativeApprovalRequired',
      'runtimeReceiptRequired',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_REVIEW_BOUNDARY_INVALID',
  );
  assert(
    Object.values(value.reviewBoundary).every((setting) => setting === true),
    'EVA_TALK_NEUTRAL_QUEUE_REVIEW_BOUNDARY_INVALID',
  );
  assertClosedAuthority(value.authority);
  assert(typeof value.campaignSha256 === 'string' && SHA256.test(value.campaignSha256), 'EVA_TALK_NEUTRAL_QUEUE_CAMPAIGN_HASH_INVALID');
  const body = { ...value };
  delete body.campaignSha256;
  assert(
    sha256EvaTalkNeutralLocalQueueDocument(body) === value.campaignSha256,
    'EVA_TALK_NEUTRAL_QUEUE_CAMPAIGN_HASH_INVALID',
  );
  return deepFreeze(value);
}

export function loadEvaTalkNeutralLocalCampaign(campaignPath) {
  const input = stableJson(campaignPath, 'campaign');
  return parseEvaTalkNeutralLocalCampaign(input.value);
}

function packetForBatch(campaign, batchOrdinal) {
  const jobId = `eva-talk-neutral-batch-${String(batchOrdinal).padStart(2, '0')}`;
  const firstCandidateOrdinal =
    (batchOrdinal - 1) * EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH + 1;
  const slots = Object.freeze(
    Array.from({ length: EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH }, (_, index) => {
      const candidateOrdinal = firstCandidateOrdinal + index;
      return Object.freeze({
        slotOrdinal: index + 1,
        candidateOrdinal,
        candidateId: `eva-talk-neutral-candidate-${String(candidateOrdinal).padStart(3, '0')}`,
        outputRelativePath: `outputs/eva-talk-neutral-candidate-${String(candidateOrdinal).padStart(3, '0')}.png`,
        semanticState: 'unassigned-review-candidate',
        sourceOrderingAuthority: false,
      });
    }),
  );
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_PACKET_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    campaignId: campaign.campaignId,
    campaignSha256: campaign.campaignSha256,
    jobId,
    batchOrdinal,
    batchCount: EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
    imagesPerBatch: EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    characterId: campaign.characterId,
    clipId: campaign.clipId,
    targetCanvas: campaign.canvas,
    slots,
    references: campaign.references,
    promptContract: campaign.promptContract,
    reviewBoundary: campaign.reviewBoundary,
    workerContract: Object.freeze({
      localFilesystemOnly: true,
      packetReadOnly: true,
      writeOnlyInsideClaimDirectory: true,
      outputManifestRequired: true,
      completionReceiptWrittenByQueue: true,
      failureReceiptWrittenByQueue: true,
      providerCredentialsIncluded: false,
      networkExecutionAuthorized: false,
    }),
    authority: campaign.authority,
  };
  return deepFreeze({
    ...body,
    packetSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
}

export function compileEvaTalkNeutralLocalPackets(campaignInput) {
  const campaign = parseEvaTalkNeutralLocalCampaign(campaignInput);
  const packets = Object.freeze(
    Array.from({ length: EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT }, (_, index) =>
      packetForBatch(campaign, index + 1),
    ),
  );
  assert(
    new Set(packets.map((packet) => packet.jobId)).size === packets.length &&
      new Set(packets.map((packet) => packet.packetSha256)).size === packets.length &&
      packets.flatMap((packet) => packet.slots).length ===
        EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_PACKET_SET_INVALID',
  );
  return packets;
}

export function verifyEvaTalkNeutralLocalPacket(input, campaign = null) {
  const value = snapshot(input, 'packet');
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'campaignId',
      'campaignSha256',
      'jobId',
      'batchOrdinal',
      'batchCount',
      'imagesPerBatch',
      'characterId',
      'clipId',
      'targetCanvas',
      'slots',
      'references',
      'promptContract',
      'reviewBoundary',
      'workerContract',
      'authority',
      'packetSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_PACKET_KEYS_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_PACKET_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.characterId === 'eva-female' &&
      value.clipId === 'talk-neutral' &&
      value.batchCount === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT &&
      value.imagesPerBatch === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    'EVA_TALK_NEUTRAL_QUEUE_PACKET_INVALID',
  );
  safeInteger(value.batchOrdinal, 'batchOrdinal', 1, EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT);
  assert(
    value.jobId === `eva-talk-neutral-batch-${String(value.batchOrdinal).padStart(2, '0')}`,
    'EVA_TALK_NEUTRAL_QUEUE_PACKET_INVALID',
  );
  assert(Array.isArray(value.slots) && value.slots.length === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH, 'EVA_TALK_NEUTRAL_QUEUE_PACKET_SLOTS_INVALID');
  const firstCandidateOrdinal =
    (value.batchOrdinal - 1) * EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH + 1;
  value.slots.forEach((slot, index) => {
    exactKeys(
      slot,
      [
        'slotOrdinal',
        'candidateOrdinal',
        'candidateId',
        'outputRelativePath',
        'semanticState',
        'sourceOrderingAuthority',
      ],
      'EVA_TALK_NEUTRAL_QUEUE_PACKET_SLOT_INVALID',
    );
    const candidateOrdinal = firstCandidateOrdinal + index;
    assert(
      slot.slotOrdinal === index + 1 &&
        slot.candidateOrdinal === candidateOrdinal &&
        slot.candidateId ===
          `eva-talk-neutral-candidate-${String(candidateOrdinal).padStart(3, '0')}` &&
        slot.outputRelativePath === `outputs/${slot.candidateId}.png` &&
        slot.semanticState === 'unassigned-review-candidate' &&
        slot.sourceOrderingAuthority === false,
      'EVA_TALK_NEUTRAL_QUEUE_PACKET_SLOT_INVALID',
    );
    canonicalRelativePath(slot.outputRelativePath, 'slot.outputRelativePath');
  });
  assertClosedAuthority(value.authority);
  assert(typeof value.packetSha256 === 'string' && SHA256.test(value.packetSha256), 'EVA_TALK_NEUTRAL_QUEUE_PACKET_HASH_INVALID');
  const body = { ...value };
  delete body.packetSha256;
  assert(
    sha256EvaTalkNeutralLocalQueueDocument(body) === value.packetSha256,
    'EVA_TALK_NEUTRAL_QUEUE_PACKET_HASH_INVALID',
  );
  if (campaign) {
    assert(
      value.campaignId === campaign.campaignId &&
        value.campaignSha256 === campaign.campaignSha256,
      'EVA_TALK_NEUTRAL_QUEUE_PACKET_CAMPAIGN_MISMATCH',
    );
    const expected = packetForBatch(campaign, value.batchOrdinal);
    assert(
      canonicalEvaTalkNeutralLocalQueueJson(value) ===
        canonicalEvaTalkNeutralLocalQueueJson(expected),
      'EVA_TALK_NEUTRAL_QUEUE_PACKET_CONTENT_DRIFT',
    );
  }
  return deepFreeze(value);
}
