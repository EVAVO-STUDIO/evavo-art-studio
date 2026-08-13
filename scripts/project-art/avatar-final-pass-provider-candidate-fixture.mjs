import { deflateSync } from 'node:zlib';

import {
  AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  deepFreeze,
  sha256Bytes,
  sha256Document,
  sha256Text,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  pngCrc32,
} from './avatar-final-pass-provider-candidate-png.mjs';

function chunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

export function createRgbaPng({
  width = 4,
  height = 4,
  allOpaque = false,
  allTransparent = false,
  corruptCrc = false,
  apng = false,
} = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const visible = x >= 1 && x <= Math.max(1, width - 2) &&
        y >= 1 && y <= Math.max(1, height - 2);
      scanlines[offset] = visible ? 200 : 0;
      scanlines[offset + 1] = visible ? 100 : 0;
      scanlines[offset + 2] = visible ? 80 : 0;
      scanlines[offset + 3] = allTransparent
        ? 0
        : allOpaque
          ? 255
          : visible
            ? 255
            : 0;
    }
  }

  const chunks = [
    chunk('IHDR', ihdr),
    ...(apng ? [chunk('acTL', Buffer.alloc(8))] : []),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND'),
  ];
  const output = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks,
  ]);
  if (corruptCrc) output[output.byteLength - 5] ^= 0x01;
  return output;
}

function artifactId(seed) {
  return `artifact_${sha256Text(seed)}`;
}

function selfHashed(body, field) {
  return deepFreeze({
    ...body,
    [field]: sha256Document(body),
  });
}

function allFalse(keys) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

const DISPATCH_AUTHORITY_KEYS = [
  'runtimeContractCompilation',
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'explicitWriteEnabledRuntimeRequired',
];

const BINDING_AUTHORITY_KEYS = [
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
];

const OUTCOME_AUTHORITY_KEYS = [
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
];

export class FakeArtifactStore {
  constructor(entries = []) {
    this.descriptors = new Map();
    this.bytes = new Map();
    for (const entry of entries) {
      this.descriptors.set(entry.descriptor.artifactId, entry.descriptor);
      this.bytes.set(entry.descriptor.artifactId, Buffer.from(entry.bytes));
    }
  }

  async get(id) {
    return this.descriptors.get(id) ?? null;
  }

  async read(id) {
    if (!this.bytes.has(id)) throw new Error(`missing artifact ${id}`);
    return Buffer.from(this.bytes.get(id));
  }

  async verify(id) {
    const descriptor = this.descriptors.get(id);
    const bytes = this.bytes.get(id);
    if (!descriptor) {
      return {
        artifactId: id,
        exists: false,
        descriptorValid: false,
        contentValid: false,
        expectedContentSha256: '',
        expectedSizeBytes: 0,
      };
    }
    const actualContentSha256 = bytes ? sha256Bytes(bytes) : undefined;
    return {
      artifactId: id,
      exists: true,
      descriptorValid: true,
      contentValid:
        Boolean(bytes) &&
        actualContentSha256 === descriptor.contentSha256 &&
        bytes.byteLength === descriptor.sizeBytes,
      expectedContentSha256: descriptor.contentSha256,
      actualContentSha256,
      expectedSizeBytes: descriptor.sizeBytes,
      actualSizeBytes: bytes?.byteLength,
    };
  }
}

export function createAvatarProviderCandidateFixture({
  width = 4,
  height = 4,
  candidateBytes = createRgbaPng({ width, height }),
  requiresAlphaExtraction = false,
} = {}) {
  const jobId = 'repair-frame-001';
  const frameId = 'frame-001';
  const sessionId = 'eva-final-pass-001';
  const characterId = 'eva';
  const sourceCommit = '1'.repeat(40);
  const candidateOutputPath =
    `scratch/avatar-final-pass/${sessionId}/${frameId}/candidate-01.png`;
  const reviewedTargetPath = `reviewed/${characterId}/${frameId}.png`;
  const providerRequestId = `provider_${'2'.repeat(40)}`;

  const providerInput = {
    schemaVersion: '1.0',
    operation: 'edit',
    assetKind: 'sprite-frame',
    continuityPhase: 'final-pass-repair',
    assetId: `${characterId}:${frameId}`,
    candidateFamilyId: `avatar-final-pass:${sessionId}:${frameId}`,
    creativeIntent:
      'Repair the exact admitted avatar frame without identity or anatomy drift.',
    negativeIntent:
      'Reject malformed hands, identity drift, background contamination and extra candidates.',
    style: {
      styleName: 'EVA canonical avatar production style',
      intent: 'Match exact admitted identity and neighbouring frames.',
      mustHave: ['clean hands', 'stable identity', 'native alpha'],
      mustAvoid: ['malformed hands', 'identity drift'],
      identityLocks: ['character eva'],
      palette: [],
      lineTreatment: ['preserve exact style'],
      materials: [],
      cameraRules: ['preserve camera'],
      compositionRules: ['preserve registration'],
      eraRules: [],
    },
    shot: {
      subject: 'EVA frame 001',
      action: 'Repair only the blocking hand defect.',
      direction: 'Match references exactly.',
      include: ['corrected hands'],
      exclude: ['identity drift'],
      separateAssets: [],
      framing: ['one exact registered frame'],
    },
    target: {
      width,
      height,
      transparency: 'required',
      outputFormat: 'png',
    },
    sourceCanvas: { width, height },
    background: { strategy: 'native-alpha' },
    quality: 'high',
    candidateCount: 1,
    references: [],
    selection: {
      preferredAdapterId: 'fixture',
      preferredModel: 'fixture-image-v1',
      allowedAdapterIds: ['fixture'],
      allowFallback: false,
      requireSeed: false,
    },
    metadata: {
      schema: AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA,
      planSha256: '3'.repeat(64),
      sourceCommit,
      sessionId,
      characterId,
      jobId,
      frameId,
      upstreamJobSha256: '4'.repeat(64),
      targetPath: reviewedTargetPath,
      candidateOutputPath,
      identityFrameId: 'identity-frame',
      authorizationEvidenceSha256: '5'.repeat(64),
      approvals: {
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        loop: false,
        runtime: false,
        publication: false,
      },
    },
  };
  const providerRequestInputSha256 = sha256Document(providerInput);
  const normalizedRequest = {
    ...providerInput,
    requestId: providerRequestId,
    protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
  };
  const normalizedProviderRequestSha256 = sha256Document(normalizedRequest);
  const compiledPromptSha256 = sha256Text(providerInput.creativeIntent);

  const dispatchBody = {
    schema: AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    compiledAt: '2026-08-13T00:00:00.000Z',
    requestId: 'eva-provider-batch-001',
    jobId,
    frameId,
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'final-pass-repair',
    batchSha256: '6'.repeat(64),
    planSha256: '3'.repeat(64),
    sourceCommit,
    sessionId,
    characterId,
    jobEnvelopeSha256: '7'.repeat(64),
    providerRequestInputSha256,
    submissionIdempotencyKey: `avatar-provider-submit:${'8'.repeat(40)}`,
    providerCompiler: {
      package: '@evavo/art-providers',
      export: 'compileProviderCandidateRuntimeContract',
      input: providerInput,
      inputSha256: providerRequestInputSha256,
      validationRequired: true,
    },
    expectedRuntimeContract: {
      schemaVersion: '1.0',
      providerProtocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      executionMode: 'submit-runtime-job',
      queue: 'provider',
      kind: 'art.candidate.edit',
      maximumAttempts: 3,
      leaseDurationMs: 300000,
      timeoutMs: 1800000,
      candidateCount: 1,
      requiredCapabilities: [
        'provider.edit',
        'provider.reference-lock',
        'provider.candidate-store',
        'evidence.bundle',
      ],
      requiredCapabilityProfile: [
        'candidate-count',
        'custom-size',
        'edit',
        'native-alpha',
      ],
    },
    candidateAdmission: {
      candidateOutputPath,
      reviewedTargetPath,
      expectedMediaType: 'image/png',
      expectedWidth: width,
      expectedHeight: height,
      expectedCandidateArtifacts: 1,
      expectedEvidenceArtifacts: 1,
      createOnlyMaterializationRequired: true,
      frameFinisherRequired: true,
      independentReviewRequired: true,
      finalSha256RequiredBeforeSequenceUse: true,
    },
    permittedRuntimeOutcomes: [
      'candidate-run-result',
      'provider-failure',
    ],
    authority: {
      ...allFalse(DISPATCH_AUTHORITY_KEYS),
      explicitWriteEnabledRuntimeRequired: true,
    },
  };
  const dispatch = selfHashed(
    dispatchBody,
    'runtimeDispatchSha256',
  );

  const bindingBody = {
    schema: AVATAR_PROVIDER_RUNTIME_BINDING_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    jobId,
    frameId,
    operation: 'edit',
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerRequestInputSha256,
    normalizedProviderRequestId: providerRequestId,
    normalizedProviderRequestSha256,
    compiledPromptSha256,
    runtimeJob: {
      queue: 'provider',
      kind: 'art.candidate.edit',
      idempotencyKey: `provider:${providerRequestId}`,
      maximumAttempts: 3,
      leaseDurationMs: 300000,
      timeoutMs: 1800000,
      requiredCapabilities:
        dispatch.expectedRuntimeContract.requiredCapabilities,
      requiredCapabilityProfile:
        dispatch.expectedRuntimeContract.requiredCapabilityProfile,
      labels: {
        providerRequestId,
        candidateFamilyId: providerInput.candidateFamilyId,
        assetId: providerInput.assetId,
        continuityPhase: providerInput.continuityPhase,
      },
    },
    candidateOutputPath,
    authority: allFalse(BINDING_AUTHORITY_KEYS),
  };
  const binding = selfHashed(bindingBody, 'runtimeBindingSha256');

  const candidateArtifactId = artifactId('candidate');
  const evidenceArtifactId = artifactId('evidence');
  const candidateSha256 = sha256Bytes(candidateBytes);
  const adapterDescriptor = {
    id: 'fixture',
    version: '1.0.0',
    models: ['fixture-image-v1'],
    capabilities: [
      'candidate-count',
      'custom-size',
      'edit',
      'native-alpha',
    ],
    maximumCandidates: 1,
    maximumSourceImages: 8,
    maximumSourceBytes: 33554432,
    deterministicSeed: true,
  };
  const completedAt = '2026-08-13T00:01:00.000Z';
  const providerEvidence = {
    schemaVersion: '1.0',
    protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
    requestId: providerRequestId,
    requestSha256: normalizedProviderRequestSha256,
    compiledPromptSha256,
    compiledPrompt: providerInput.creativeIntent,
    request: normalizedRequest,
    routingInspection: {
      schemaVersion: '1.0',
      protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      requestId: providerRequestId,
      requestSha256: normalizedProviderRequestSha256,
      operation: 'edit',
      requiredCapabilities:
        dispatch.expectedRuntimeContract.requiredCapabilityProfile,
      fallbackAllowed: false,
      preferredAdapterId: 'fixture',
      allowedAdapterIds: ['fixture'],
      eligibleAdapterIds: ['fixture'],
      adapters: [],
      outcome: 'eligible',
      providerCallPerformedByInspection: false,
    },
    resolvedReferences: [],
    selection: {
      adapter: adapterDescriptor,
      model: 'fixture-image-v1',
      externalId: 'fixture-output-001',
    },
    attempts: [
      {
        adapterId: 'fixture',
        model: 'fixture-image-v1',
        startedAt: '2026-08-13T00:00:30.000Z',
        completedAt,
        outcome: 'succeeded',
        externalId: 'fixture-output-001',
      },
    ],
    candidateArtifacts: [candidateArtifactId],
    requiresAlphaExtraction,
    outcome: 'candidate-produced',
    completedAt,
  };
  const evidenceBytes = Buffer.from(
    `${JSON.stringify(providerEvidence, null, 2)}\n`,
    'utf8',
  );
  const evidenceSha256 = sha256Bytes(evidenceBytes);

  const candidateDescriptor = deepFreeze({
    schemaVersion: '1.0',
    protocolVersion: '2026-07-29.1',
    artifactId: candidateArtifactId,
    descriptorSha256: sha256Text('candidate-descriptor'),
    contentHash: `sha256:${candidateSha256}`,
    contentSha256: candidateSha256,
    sizeBytes: candidateBytes.byteLength,
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: 'eva-frame-001-candidate-01.png',
    sourceArtifacts: [],
    labels: {
      artifactRole: 'provider-candidate',
      approvalState: 'unapproved',
      providerAdapter: 'fixture',
      providerModel: 'fixture-image-v1',
      providerRequestId,
      candidateFamilyId: providerInput.candidateFamilyId,
      candidateIndex: '1',
      assetId: providerInput.assetId,
      continuityPhase: providerInput.continuityPhase,
    },
    metadata: {
      schemaVersion: '1.0',
      protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      finalDeliverable: false,
      requiresMastering: true,
      requiresBlockingQa: true,
      requestSha256: normalizedProviderRequestSha256,
      compiledPromptSha256,
      adapterVersion: '1.0.0',
      backgroundStrategy: 'native-alpha',
      transparencyTarget: 'required',
    },
    objectRelativePath: `objects/${candidateSha256}`,
    descriptorRelativePath: `descriptors/${candidateArtifactId}.json`,
  });
  const evidenceDescriptor = deepFreeze({
    schemaVersion: '1.0',
    protocolVersion: '2026-07-29.1',
    artifactId: evidenceArtifactId,
    descriptorSha256: sha256Text('evidence-descriptor'),
    contentHash: `sha256:${evidenceSha256}`,
    contentSha256: evidenceSha256,
    sizeBytes: evidenceBytes.byteLength,
    mediaType: 'application/json',
    storageClass: 'evidence',
    fileName: `${providerRequestId}.provider-evidence.json`,
    sourceArtifacts: [candidateArtifactId],
    labels: {
      artifactRole: 'provider-candidate-evidence',
      providerRequestId,
      candidateFamilyId: providerInput.candidateFamilyId,
      assetId: providerInput.assetId,
      outcome: 'candidate-produced',
    },
    metadata: {
      requestSha256: normalizedProviderRequestSha256,
      compiledPromptSha256,
      candidateCount: 1,
    },
    objectRelativePath: `objects/${evidenceSha256}`,
    descriptorRelativePath: `descriptors/${evidenceArtifactId}.json`,
  });

  const outcomeBody = {
    schema: AVATAR_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    completedAt,
    jobId,
    frameId,
    kind: 'provider-redraw',
    operation: 'edit',
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    result: {
      status: 'candidate-materialization-required',
      adapterId: 'fixture',
      model: 'fixture-image-v1',
      candidateCount: 1,
      candidateArtifactId,
      evidenceArtifactId,
      attempts: providerEvidence.attempts,
      requiresAlphaExtraction,
      materializationRequest: {
        sourceArtifactId: candidateArtifactId,
        targetPath: candidateOutputPath,
        reviewedTargetPath,
        expectedMediaType: 'image/png',
        expectedWidth: width,
        expectedHeight: height,
        createOnly: true,
        oneImageOnly: true,
        sourceArtifactSha256VerificationRequired: true,
        outputSha256Required: true,
      },
      requiredNextSteps: [
        'materialize-candidate-create-only',
        'rerun-avatar-frame-finisher',
        'independent-art-anatomy-identity-continuity-review',
        'bind-final-reviewed-sha256-before-sequence-use',
      ],
      approvals: {
        technical: false,
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        loop: false,
        runtime: false,
        publication: false,
      },
    },
    authority: allFalse(OUTCOME_AUTHORITY_KEYS),
  };
  const outcome = selfHashed(outcomeBody, 'runtimeOutcomeSha256');

  const store = new FakeArtifactStore([
    { descriptor: candidateDescriptor, bytes: candidateBytes },
    { descriptor: evidenceDescriptor, bytes: evidenceBytes },
  ]);
  return {
    dispatch,
    binding,
    outcome,
    store,
    candidateBytes: Buffer.from(candidateBytes),
    evidenceBytes,
    candidateDescriptor,
    evidenceDescriptor,
    providerEvidence,
    candidateArtifactId,
    evidenceArtifactId,
    width,
    height,
    candidateOutputPath,
    reviewedTargetPath,
    authorization: {
      action: 'materialize-unapproved-provider-candidate',
      actorClass: 'agent',
      actorId: 'fixture-agent',
      occurredAt: completedAt,
      evidenceSha256: sha256Text('fixture-materialization-authorization'),
    },
    materializedAt: '2026-08-13T00:02:00.000Z',
  };
}
