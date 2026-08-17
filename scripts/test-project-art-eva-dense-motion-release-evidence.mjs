import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runProjectArtEvaDenseMotionReleaseEvidenceCli } from './compile-project-art-eva-dense-motion-release-evidence.mjs';
import {
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_WORK_ORDER_INTERNALS,
  compileEvaDenseMotionWorkOrder,
  createEvaDenseMotionWorkOrderRequest,
  expectedEvaDenseMotionMasterPublicId,
  sha256EvaDenseMotionWorkOrderDocument,
} from './project-art/eva-dense-motion-work-order.mjs';
import {
  EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
  compileEvaDenseMotionReleaseEvidence,
  createEvaDenseMotionReleaseEvidenceRequest,
  evaDenseMotionReleaseEvidenceCapabilities,
  evaluateEvaDenseMotionReleaseEvidence,
  verifyEvaDenseMotionReleaseEvidence,
} from './project-art/eva-dense-motion-release-evidence.mjs';

const ASSEMBLED_AT = '2026-08-17T05:30:00.000Z';
const REVIEWED_AT = '2026-08-17T05:20:00.000Z';

function hex(label, length = 64) {
  let output = '';
  let counter = 0;
  while (output.length < length) {
    output += createHash('sha256')
      .update(`${label}:${counter}`, 'utf8')
      .digest('hex');
    counter += 1;
  }
  return output.slice(0, length);
}

function workOrder() {
  return compileEvaDenseMotionWorkOrder(
    createEvaDenseMotionWorkOrderRequest({
      workOrderId: 'eva-dense-motion-153620-release-001',
      actorId: 'evavo-art-studio-agent',
      createdAt: '2026-08-17T05:00:00.000Z',
      outputRoot: 'workspaces/eva-dense-motion/eva-20260809-153620',
    }),
  );
}

function masteredAsset(frame) {
  const finalReviewedSha256 = hex(`final-reviewed:${frame.ordinal}`);
  const publicId = expectedEvaDenseMotionMasterPublicId(frame.ordinal);
  const version = 1_900_000_000 + frame.ordinal;
  return {
    provider: 'cloudinary',
    cloudName: 'dntogqtey',
    assetId: hex(`dense-asset:${frame.ordinal}`, 32),
    publicId,
    version,
    bytes: 1_400_000 + frame.ordinal,
    width: 1024,
    height: 1536,
    format: 'png',
    etag: hex(`dense-etag:${frame.ordinal}`, 32),
    secureUrl:
      `https://res.cloudinary.com/dntogqtey/image/upload/` +
      `v${version}/${publicId}.png`,
    sha256: finalReviewedSha256,
    createOnly: true,
    overwrite: false,
    immutable: true,
  };
}

function frameEvidence(frame) {
  const asset = masteredAsset(frame);
  return {
    ordinal: frame.ordinal,
    frameId: frame.frameId,
    sourceGitBlobSha1: frame.sourceGitBlobSha1,
    evidence: {
      candidateAssuranceSha256: hex(`candidate:${frame.ordinal}`),
      alphaMasteringReceiptSha256: hex(`alpha:${frame.ordinal}`),
      frameFinisherReceiptSha256: hex(`finisher:${frame.ordinal}`),
      technicalInspectionSha256: hex(`technical:${frame.ordinal}`),
      creativeApprovalSha256: hex(`creative:${frame.ordinal}`),
      identityEvidenceSha256: hex(`identity:${frame.ordinal}`),
      finalReviewedSha256: asset.sha256,
    },
    masteredAsset: asset,
    alpha: {
      actualRgbaAlpha: true,
      hiddenRgbTransparentPixels: 0,
      checkerboardRejected: true,
      matteHaloRejected: true,
      edgeVisiblePixels: 0,
      alphaPlaneSha256: hex(`alpha-plane:${frame.ordinal}`),
    },
    review: {
      technicalPassed: true,
      creativeApproved: true,
      anatomyPassed: true,
      identityPassed: true,
      silhouetteRegistrationPassed: true,
      reviewedBy: `eva-frame-reviewer-${frame.ordinal}`,
      reviewedAt: REVIEWED_AT,
      reviewDecisionSha256: hex(`review:${frame.ordinal}`),
    },
  };
}

function request() {
  const order = workOrder();
  return createEvaDenseMotionReleaseEvidenceRequest({
    admissionId: 'eva-dense-motion-release-153620-001',
    actorId: 'evavo-release-evidence-agent',
    assembledAt: ASSEMBLED_AT,
    workOrder: order,
    frames: order.sourceFamily.frames.map(frameEvidence),
    continuity: order.continuity.edges.map((edge, index) => ({
      fromOrdinal: edge.fromOrdinal,
      toOrdinal: edge.toOrdinal,
      evidenceSha256: hex(`continuity:${index}`),
      faceRegistrationPassed: true,
      phashContinuityPassed: true,
      motionReviewPassed: true,
      reviewedBy: `eva-continuity-reviewer-${index + 1}`,
      reviewedAt: REVIEWED_AT,
    })),
    family: {
      sequencePackSha256: hex('sequence-pack'),
      releaseManifestSha256: hex('release-manifest'),
      browserPlaybackSha256: hex('browser-playback'),
      ownerApprovalSha256: hex('owner-approval'),
      creativeDirectorApprovalSha256: hex('creative-director-approval'),
      technicalDirectorApprovalSha256: hex('technical-director-approval'),
      runtimeRelease: {
        repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
        version: '0.37.0',
        commit: hex('runtime-commit', 40),
        tree: hex('runtime-tree', 40),
        admissionReceiptSchema:
          'evavo.avatar.eva-dense-motion-admission-receipt.v1',
        activationApproved: false,
        deploymentApproved: false,
      },
    },
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

function refingerprint(evidence) {
  const body = structuredClone(evidence);
  delete body.releaseEvidenceSha256;
  return {
    ...body,
    releaseEvidenceSha256: sha256EvaDenseMotionWorkOrderDocument(body),
  };
}

test('seals one exact ten-frame release-evidence package without activation authority', () => {
  const evidence = compileEvaDenseMotionReleaseEvidence(request());
  assert.equal(evidence.frames.length, 10);
  assert.equal(evidence.continuity.length, 10);
  assert.equal(evidence.continuity.at(-1).fromOrdinal, 10);
  assert.equal(evidence.continuity.at(-1).toOrdinal, 1);
  assert.equal(evidence.gates.allTenFrameEvidenceComplete, true);
  assert.equal(evidence.gates.allTenDenseMasterIdentitiesRequired, true);
  assert.equal(evidence.gates.activeFallbackAssetsCannotSatisfyDenseSlots, true);
  assert.equal(evidence.gates.finalToFirstLoopClosurePassed, true);
  assert.equal(evidence.readiness.releaseEvidenceComplete, true);
  assert.equal(evidence.readiness.runtimeReceiptAssemblyReady, true);
  assert.equal(evidence.readiness.publicationAllowed, false);
  assert.equal(evidence.readiness.deploymentAllowed, false);
  assert.equal(evidence.readiness.runtimeActivationAllowed, false);
  assert.ok(Object.values(evidence.authority).every((value) => value === false));
  assert.deepEqual(verifyEvaDenseMotionReleaseEvidence(evidence), evidence);
});

test('retains fallback provenance while requiring new dense identities for all ten frames', () => {
  const evidence = compileEvaDenseMotionReleaseEvidence(request());
  const current = EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.sourceFrames;
  for (const frame of evidence.frames) {
    const source = current[frame.ordinal - 1];
    assert.equal(
      frame.masteredAsset.publicId,
      expectedEvaDenseMotionMasterPublicId(frame.ordinal),
    );
    assert.equal(frame.masteredAsset.createOnly, true);
    assert.equal(frame.masteredAsset.overwrite, false);
    assert.equal(frame.masteredAsset.immutable, true);
    assert.match(frame.masteredAsset.secureUrl, /\/image\/upload\/v\d+\//u);
    if (source.currentMaster) {
      assert.notEqual(frame.masteredAsset.assetId, source.currentMaster.assetId);
      assert.notEqual(frame.masteredAsset.publicId, source.currentMaster.publicId);
      assert.notEqual(frame.masteredAsset.version, source.currentMaster.version);
      assert.notEqual(frame.masteredAsset.secureUrl, source.currentMaster.secureUrl);
      assert.equal(
        evidence.workOrder.sourceFamily.frames[frame.ordinal - 1].currentMaster
          .assetId,
        source.currentMaster.assetId,
      );
    }
  }
});

test('rejects reuse of active fallback assets as dense slots', () => {
  const reused = structuredClone(request());
  const source = EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.sourceFrames[3];
  const current = source.currentMaster;
  reused.frames[3].masteredAsset = {
    provider: current.provider,
    cloudName: current.cloudName,
    assetId: current.assetId,
    publicId: current.publicId,
    version: current.version,
    bytes: current.bytes,
    width: current.width,
    height: current.height,
    format: current.format,
    etag: current.etag,
    secureUrl: current.secureUrl,
    sha256: reused.frames[3].evidence.finalReviewedSha256,
    createOnly: true,
    overwrite: false,
    immutable: true,
  };
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(reused),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_ASSET_IDENTITY_INVALID/u,
  );
});

test('rejects partial, reordered, duplicate and mutable frame evidence', () => {
  const partial = structuredClone(request());
  partial.frames.pop();
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(partial),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_SET_INVALID/u,
  );

  const reordered = structuredClone(request());
  [reordered.frames[0], reordered.frames[1]] = [
    reordered.frames[1],
    reordered.frames[0],
  ];
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(reordered),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_IDENTITY_INVALID/u,
  );

  const duplicate = structuredClone(request());
  duplicate.frames[1].masteredAsset.assetId =
    duplicate.frames[0].masteredAsset.assetId;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(duplicate),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_DUPLICATE_MASTER/u,
  );

  const mutable = structuredClone(request());
  mutable.frames[0].masteredAsset.overwrite = true;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(mutable),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_ASSET_INVALID/u,
  );
});

test('rejects alpha, review, continuity, runtime and authority drift', () => {
  const alpha = structuredClone(request());
  alpha.frames[0].alpha.hiddenRgbTransparentPixels = 1;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(alpha),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_ALPHA_INVALID/u,
  );

  const review = structuredClone(request());
  review.frames[0].review.creativeApproved = false;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(review),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_REVIEW_INVALID/u,
  );

  const continuity = structuredClone(request());
  continuity.continuity[9].toOrdinal = 2;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(continuity),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTINUITY_INVALID/u,
  );

  const runtime = structuredClone(request());
  runtime.family.runtimeRelease.version = '0.36.9';
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(runtime),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_RUNTIME_VERSION_TOO_OLD/u,
  );

  const activation = structuredClone(request());
  activation.family.runtimeRelease.activationApproved = true;
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(activation),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_RUNTIME_RELEASE_INVALID/u,
  );

  const authority = structuredClone(request());
  authority.authority = { ...authority.authority, publication: true };
  assert.throws(
    () => compileEvaDenseMotionReleaseEvidence(authority),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_AUTHORITY_INVALID/u,
  );
});

test('rejects rehashed semantic drift and evaluates invalid evidence as blocked', () => {
  const evidence = compileEvaDenseMotionReleaseEvidence(request());
  const changed = structuredClone(evidence);
  changed.readiness.runtimeActivationAllowed = true;
  const rehashed = refingerprint(changed);
  assert.throws(
    () => verifyEvaDenseMotionReleaseEvidence(rehashed),
    /EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTENT_DRIFT/u,
  );
  const status = evaluateEvaDenseMotionReleaseEvidence(rehashed);
  assert.equal(status.releaseEvidenceComplete, false);
  assert.equal(status.runtimeReceiptAssemblyReady, false);
  assert.equal(status.publicationAllowed, false);
  assert.equal(status.deploymentAllowed, false);
  assert.equal(status.runtimeActivationAllowed, false);
});

test('CLI writes one permission-restricted create-only evidence package', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-release-'));
  try {
    const requestPath = path.join(directory, 'request.json');
    const outputPath = path.join(directory, 'release-evidence.json');
    writeFileSync(requestPath, `${JSON.stringify(request(), null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    const summary = runProjectArtEvaDenseMotionReleaseEvidenceCli([
      '--request',
      requestPath,
      '--output',
      outputPath,
    ]);
    assert.equal(summary.frameCount, 10);
    assert.equal(summary.continuityEdgeCount, 10);
    assert.equal(summary.releaseEvidenceComplete, true);
    assert.equal(summary.runtimeReceiptAssemblyReady, true);
    assert.equal(summary.providerExecution, false);
    assert.equal(summary.cloudinaryUpload, false);
    assert.equal(summary.publicationAllowed, false);
    assert.equal(summary.deploymentAllowed, false);
    assert.equal(summary.runtimeActivationAllowed, false);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    verifyEvaDenseMotionReleaseEvidence(
      JSON.parse(readFileSync(outputPath, 'utf8')),
    );
    const before = readFileSync(outputPath, 'utf8');
    assert.throws(
      () =>
        runProjectArtEvaDenseMotionReleaseEvidenceCli([
          '--request',
          requestPath,
          '--output',
          outputPath,
        ]),
      /EEXIST/u,
    );
    assert.equal(readFileSync(outputPath, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('capabilities expose Runtime-compatible dense identities without activation', () => {
  const capabilities = evaDenseMotionReleaseEvidenceCapabilities();
  assert.equal(
    capabilities.requestSchema,
    EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
  );
  assert.equal(capabilities.exactTenFrameSetRequired, true);
  assert.equal(capabilities.allTenDenseMasterIdentitiesRequired, true);
  assert.equal(capabilities.activeFallbackAssetsCannotSatisfyDenseSlots, true);
  assert.equal(capabilities.allTenContinuityEdgesRequired, true);
  assert.equal(capabilities.runtimeReceiptAssemblySupported, true);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.deployment, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.ok(Object.values(capabilities.authority).every((value) => value === false));
});
