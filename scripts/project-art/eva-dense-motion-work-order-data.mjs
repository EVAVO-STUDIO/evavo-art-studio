export const EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-work-order-request.v1';
export const EVA_DENSE_MOTION_WORK_ORDER_SCHEMA =
  'evavo.project-art-eva-dense-motion-work-order.v1';
export const EVA_DENSE_MOTION_WORK_ORDER_STATUS_SCHEMA =
  'evavo.project-art-eva-dense-motion-work-order-status.v1';
export const EVA_DENSE_MOTION_WORK_ORDER_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-work-order-capabilities.v1';

export const EVA_DENSE_MOTION_FAMILY_ID = 'eva-20260809-153620';
export const EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT = 10;
export const EVA_DENSE_MOTION_ACTIVE_ORDINALS = Object.freeze([4, 5, 6]);
export const EVA_DENSE_MOTION_PENDING_ORDINALS = Object.freeze([
  1, 2, 3, 7, 8, 9, 10,
]);
export const EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION = '0.37.0';

export const CHARACTER_ID = 'eva-female';
export const CLOUD_NAME = 'dntogqtey';
export const CANVAS = Object.freeze({ width: 1024, height: 1536 });
export const SOURCE_TREE_SHA1 = 'fad3bc2276fced5c3d10301a0cc151562f4fa880';
export const SOURCE_CONTRACT_SHA256 =
  '2e5959849bcf891a0b44e4fc951128b5368a264d3745237872eff582ce10c849';
export const SOURCE_FAMILY_SHA256 =
  '7bcef71b34956703576ca008cc38046bd36c40a097235e19142b226e36b1ec15';
export const DEFAULT_OUTPUT_ROOT =
  'workspaces/eva-dense-motion/eva-20260809-153620';
export const SHA1 = /^[a-f0-9]{40}$/u;
export const SHA256 = /^[a-f0-9]{64}$/u;
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

export const RUNTIME = Object.freeze({
  repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
  commit: '8b973623e78b48159b9f22dda7198cbb0cd8c898',
  tree: '814ab02bde751c784db34f68b2c54e7e18d11ea8',
  packageVersion: '0.36.0',
  sourceFamilySchema: 'evavo.avatar.eva-dense-motion-source-family.v1',
  admissionReceiptSchema:
    'evavo.avatar.eva-dense-motion-admission-receipt.v1',
  sourceFamilySha256: SOURCE_FAMILY_SHA256,
  sourceContractSha256: SOURCE_CONTRACT_SHA256,
  minimumDenseRuntimeVersion: EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
});

export const ART_STUDIO_BASELINE = Object.freeze({
  repository: 'EVAVO-STUDIO/evavo-art-studio',
  commit: 'aeedc119a98a49f8f9500e3e3f47432969506105',
  tree: '30a450e543f8b3f9dc813b5fb8419f80f0ad5718',
  reusedBoundaries: Object.freeze([
    'scripts/project-art/avatar-final-pass-provider-candidate-png.mjs',
    'scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs',
    'scripts/project-art/avatar-sequence-common.mjs',
    'scripts/compile-project-art-avatar-sequence.mjs',
    'scripts/compile-project-art-loop-closure.mjs',
  ]),
  denseSpecificBoundaries: Object.freeze([
    'dense-frame-candidate-assurance-required',
    'dense-frame-alpha-mastering-required',
    'dense-family-runtime-receipt-assembly-required',
  ]),
  prohibitedSubstitutions: Object.freeze([
    'source-repair-mask-assurance-for-unmasked-dense-frame',
    'raw-source-runtime-delivery',
    'partial-family-promotion',
    'mutable-cloudinary-overwrite',
  ]),
});

export const EVA_DENSE_MOTION_CLOSED_AUTHORITY = Object.freeze({
  sourceMutation: false,
  sourceDeletion: false,
  providerExecution: false,
  imageMutation: false,
  creativeApproval: false,
  candidateApproval: false,
  candidatePromotion: false,
  assetOverwrite: false,
  cloudinaryUpload: false,
  sequenceRelease: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  deployment: false,
  publication: false,
  runtimeActivation: false,
  forcePush: false,
});

export const FRAME_RELEASE_GATES = Object.freeze({
  sourceMaterializedReadOnly: false,
  sourceIdentityVerified: false,
  sourceCanvasVerified: false,
  denseCandidateAssurancePassed: false,
  alphaMatteReviewed: false,
  actualRgbaAlphaPassed: false,
  hiddenRgbZeroedPassed: false,
  checkerboardRejected: false,
  matteHaloRejected: false,
  canvasEdgesClear: false,
  avatarFrameFinisherPassed: false,
  technicalInspectionPassed: false,
  creativeApprovalRecorded: false,
  immutableCloudinaryUploadVerified: false,
  identityEvidenceRecorded: false,
  runtimeFrameEvidenceComplete: false,
});

export const FAMILY_RELEASE_GATES = Object.freeze({
  allSevenPendingFramesMastered: false,
  allTenFrameEvidenceComplete: false,
  noDuplicateMasteredAssets: false,
  allAdjacentTransitionsReviewed: false,
  loopClosureReviewed: false,
  sequencePackRegenerated: false,
  releaseManifestRegenerated: false,
  browserPlaybackReverified: false,
  ownerApprovalRecorded: false,
  creativeDirectorApprovalRecorded: false,
  technicalDirectorApprovalRecorded: false,
  runtime037ReleasePrepared: false,
  runtimeActivationApproved: false,
});

export const REQUIRED_STAGES = Object.freeze([
  Object.freeze({
    stageId: 'materialize-read-only-source',
    evidenceField: 'sourceMaterializationSha256',
    implementation: 'existing-materialization-boundary',
    humanApprovalRequired: false,
  }),
  Object.freeze({
    stageId: 'inspect-source-canvas-and-encoding',
    evidenceField: 'sourceInspectionSha256',
    implementation: 'existing-png-inspection-boundary',
    humanApprovalRequired: false,
  }),
  Object.freeze({
    stageId: 'compile-dense-candidate-assurance',
    evidenceField: 'candidateAssuranceSha256',
    implementation: 'dense-specific-adapter-required',
    humanApprovalRequired: false,
  }),
  Object.freeze({
    stageId: 'author-and-review-alpha-matte',
    evidenceField: 'alphaMatteReviewSha256',
    implementation: 'dense-specific-adapter-required',
    humanApprovalRequired: true,
  }),
  Object.freeze({
    stageId: 'master-production-rgba-alpha',
    evidenceField: 'alphaMasteringReceiptSha256',
    implementation: 'dense-specific-adapter-required',
    humanApprovalRequired: true,
  }),
  Object.freeze({
    stageId: 'run-avatar-frame-finisher',
    evidenceField: 'frameFinisherReceiptSha256',
    implementation: 'existing-frame-finisher-boundary',
    humanApprovalRequired: false,
  }),
  Object.freeze({
    stageId: 'inspect-technical-frame-quality',
    evidenceField: 'technicalInspectionSha256',
    implementation: 'existing-project-art-review-boundary',
    humanApprovalRequired: false,
  }),
  Object.freeze({
    stageId: 'record-creative-identity-approval',
    evidenceField: 'creativeApprovalSha256',
    implementation: 'independent-human-review-required',
    humanApprovalRequired: true,
  }),
  Object.freeze({
    stageId: 'publish-immutable-cloudinary-master',
    evidenceField: 'masteredAsset',
    implementation: 'separately-authorized-provider-step',
    humanApprovalRequired: true,
  }),
  Object.freeze({
    stageId: 'record-runtime-frame-evidence',
    evidenceField: 'runtimeFrameEvidenceSha256',
    implementation: 'dense-runtime-receipt-adapter-required',
    humanApprovalRequired: false,
  }),
]);

export const RUNTIME_FRAME_EVIDENCE_FIELDS = Object.freeze([
  'alphaMasteringReceiptSha256',
  'candidateAssuranceSha256',
  'technicalInspectionSha256',
  'creativeApprovalSha256',
  'masteredAsset',
  'alpha',
  'identity',
]);

export const RAW_FRAMES = Object.freeze([
  Object.freeze([
    1,
    '03_36_20 PM (1)',
    '0565ca0bfc5fea7e8a83b4187a98e05efd89785b',
  ]),
  Object.freeze([
    2,
    '03_36_20 PM (2)',
    'e0db2df40658c98fdf01907a2386066ee4ec6605',
  ]),
  Object.freeze([
    3,
    '03_36_21 PM (3)',
    'e76f242fb92743056b2cc558093cdc931af1aaf7',
  ]),
  Object.freeze([
    4,
    '03_36_21 PM (4)',
    '98bab4007e9006856942dfff860a3cefbaa5abdf',
  ]),
  Object.freeze([
    5,
    '03_36_21 PM (5)',
    'e333296677c2a9bd13c2d8da52db871204099b19',
  ]),
  Object.freeze([
    6,
    '03_36_22 PM (6)',
    '512ce0828d56748f7832475bdd0a83b344c77ba7',
  ]),
  Object.freeze([
    7,
    '03_36_23 PM (7)',
    '30f04e522eb665cc40446226a7b3e19341aa5d86',
  ]),
  Object.freeze([
    8,
    '03_36_23 PM (8)',
    '5efe57baabd0f99521741087c78f35b1a3773d8f',
  ]),
  Object.freeze([
    9,
    '03_36_23 PM (9)',
    '0f73024a5214be4388c2807d051c78f0700d992a',
  ]),
  Object.freeze([
    10,
    '03_36_24 PM (10)',
    '09c7cf413665dad48671c4304413dc1c34e531a2',
  ]),
]);

export const ACTIVE_MASTER_BY_ORDINAL = Object.freeze({
  4: Object.freeze({
    rigFrameId: 'previous',
    sourceAssetId: 'fb635aae0c63a7fcdddd59f8831963d2',
    sourceVersion: 1786773737,
    provider: 'cloudinary',
    cloudName: CLOUD_NAME,
    assetId: 'e4d2d49cc15b82371410c290fce81c34',
    publicId:
      'evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-prev-v3',
    version: 1786925257,
    bytes: 1_513_753,
    width: CANVAS.width,
    height: CANVAS.height,
    format: 'png',
    etag: '8f84386280d95b55002e6f4b9ab825d9',
    secureUrl:
      'https://res.cloudinary.com/dntogqtey/image/upload/v1786925257/evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-prev-v3.png',
    faceRect: Object.freeze({ x: 385, y: 95, width: 230, height: 298 }),
    phash: 'cc473b643326ce33',
  }),
  5: Object.freeze({
    rigFrameId: 'middle',
    sourceAssetId: 'fe24a629b7c979e5b02c9afb759c8b04',
    sourceVersion: 1786773688,
    provider: 'cloudinary',
    cloudName: CLOUD_NAME,
    assetId: 'fb2386c215a1465860b62704f447dedf',
    publicId:
      'evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-mid-v3',
    version: 1786925270,
    bytes: 1_500_003,
    width: CANVAS.width,
    height: CANVAS.height,
    format: 'png',
    etag: '6c589e1b4015d5853a3d770ebadc6204',
    secureUrl:
      'https://res.cloudinary.com/dntogqtey/image/upload/v1786925270/evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-mid-v3.png',
    faceRect: Object.freeze({ x: 390, y: 101, width: 224, height: 288 }),
    phash: 'cecb39643326cc33',
  }),
  6: Object.freeze({
    rigFrameId: 'following',
    sourceAssetId: '25b3020037fd47908088b762ac675368',
    sourceVersion: 1786773763,
    provider: 'cloudinary',
    cloudName: CLOUD_NAME,
    assetId: 'f52a7af56eed431b498c5c2c09db3a6a',
    publicId:
      'evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-next-v3',
    version: 1786925286,
    bytes: 1_494_995,
    width: CANVAS.width,
    height: CANVAS.height,
    format: 'png',
    etag: 'de9cd259a30e4f07a02b5b3585efbbfd',
    secureUrl:
      'https://res.cloudinary.com/dntogqtey/image/upload/v1786925286/evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-next-v3.png',
    faceRect: Object.freeze({ x: 385, y: 95, width: 230, height: 298 }),
    phash: '8ccf2b643326ce33',
  }),
});
