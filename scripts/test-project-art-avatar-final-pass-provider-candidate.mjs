#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectArtAvatarProviderCandidateError,
  materializeAvatarFinalPassProviderCandidate,
  sha256AvatarProviderCandidateDocument,
} from './project-art/avatar-final-pass-provider-candidate.mjs';
import {
  createAvatarProviderCandidateFixture,
  createRgbaPng,
} from './project-art/avatar-final-pass-provider-candidate-fixture.mjs';
import {
  sha256Bytes,
  sha256Text,
} from './project-art/avatar-final-pass-provider-candidate-common.mjs';

function workspace() {
  return mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-candidate-'));
}

async function withWorkspace(operation) {
  const root = workspace();
  try {
    return await operation(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectedError(code) {
  return (error) => {
    assert.equal(error instanceof ProjectArtAvatarProviderCandidateError, true);
    assert.equal(error.code, code);
    return true;
  };
}

function rehash(value, field) {
  const body = structuredClone(value);
  delete body[field];
  return {
    ...body,
    [field]: sha256AvatarProviderCandidateDocument(body),
  };
}

function replaceEvidence(fixture, evidence) {
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const sha256 = sha256Bytes(bytes);
  fixture.store.bytes.set(fixture.evidenceArtifactId, bytes);
  fixture.store.descriptors.set(fixture.evidenceArtifactId, {
    ...fixture.evidenceDescriptor,
    contentHash: `sha256:${sha256}`,
    contentSha256: sha256,
    sizeBytes: bytes.byteLength,
    descriptorSha256: sha256Text(`descriptor:${sha256}`),
  });
}

test('materializes one exact unapproved RGBA candidate and finisher handoff', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    const result = await materializeAvatarFinalPassProviderCandidate({
      dispatch: fixture.dispatch,
      binding: fixture.binding,
      outcome: fixture.outcome,
      artifactStore: fixture.store,
      workspaceRoot: root,
      authorization: fixture.authorization,
      materializedAt: fixture.materializedAt,
    });

    assert.equal(
      result.status,
      'candidate-materialized-awaiting-frame-finisher',
    );
    assert.equal(result.reused, false);
    assert.deepEqual(readFileSync(result.candidatePath), fixture.candidateBytes);
    assert.equal(
      result.receipt.output.sha256,
      sha256Bytes(fixture.candidateBytes),
    );
    assert.equal(result.receipt.output.unapproved, true);
    assert.equal(result.receipt.authority.candidateMaterialization, true);
    assert.equal(result.receipt.authority.candidateApproval, false);
    assert.equal(result.receipt.authority.candidatePromotion, false);
    assert.equal(result.receipt.authority.runtimeActivation, false);
    assert.equal(
      result.finisherRequest.finalSha256RequiredBeforeInbetweenOrSequenceUse,
      true,
    );
    assert.equal(result.finisherRequest.candidateApproval, false);
    assert.equal(result.finisherRequest.runtimeActivationAllowed, false);
    assert.ok(result.receipt.png.visiblePixels > 0);
    assert.ok(result.receipt.png.transparentPixels > 0);
    assert.equal(result.receipt.png.animated, false);
    for (const filePath of [
      result.candidatePath,
      result.receiptPath,
      result.finisherRequestPath,
    ]) {
      const metadata = lstatSync(filePath);
      assert.equal(metadata.isFile(), true);
      assert.equal(metadata.isSymbolicLink(), false);
      assert.equal(metadata.nlink, 1);
    }
  });
});

test('exact retry reuses a complete matching materialization bundle', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    const input = {
      dispatch: fixture.dispatch,
      binding: fixture.binding,
      outcome: fixture.outcome,
      artifactStore: fixture.store,
      workspaceRoot: root,
      authorization: fixture.authorization,
      materializedAt: fixture.materializedAt,
    };
    const first = await materializeAvatarFinalPassProviderCandidate(input);
    const second = await materializeAvatarFinalPassProviderCandidate(input);
    assert.equal(second.reused, true);
    assert.equal(second.materializationId, first.materializationId);
    assert.equal(
      second.receipt.materializationSha256,
      first.receipt.materializationSha256,
    );
    assert.equal(
      second.finisherRequest.finisherRequestSha256,
      first.finisherRequest.finisherRequestSha256,
    );
  });
});

test('opaque provider background is rejected before workspace publication', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture({
      candidateBytes: createRgbaPng({ allOpaque: true }),
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PNG_OPAQUE_BACKGROUND'),
    );
  });
});

test('fully transparent candidate is rejected', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture({
      candidateBytes: createRgbaPng({ allTransparent: true }),
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PNG_EMPTY_ALPHA'),
    );
  });
});

test('corrupt PNG CRC is rejected', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture({
      candidateBytes: createRgbaPng({ corruptCrc: true }),
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PNG_CRC_INVALID'),
    );
  });
});

test('animated PNG and canvas drift are rejected', async () => {
  await withWorkspace(async (root) => {
    const animated = createAvatarProviderCandidateFixture({
      candidateBytes: createRgbaPng({ apng: true }),
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: animated.dispatch,
        binding: animated.binding,
        outcome: animated.outcome,
        artifactStore: animated.store,
        workspaceRoot: root,
        authorization: animated.authorization,
        materializedAt: animated.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_APNG_FORBIDDEN'),
    );
  });

  await withWorkspace(async (root) => {
    const drifted = createAvatarProviderCandidateFixture({
      width: 4,
      height: 4,
      candidateBytes: createRgbaPng({ width: 5, height: 4 }),
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: drifted.dispatch,
        binding: drifted.binding,
        outcome: drifted.outcome,
        artifactStore: drifted.store,
        workspaceRoot: root,
        authorization: drifted.authorization,
        materializedAt: drifted.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PNG_DIMENSIONS_MISMATCH'),
    );
  });
});

test('approved or otherwise drifted candidate descriptor fails closed', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    fixture.store.descriptors.set(fixture.candidateArtifactId, {
      ...fixture.candidateDescriptor,
      labels: {
        ...fixture.candidateDescriptor.labels,
        approvalState: 'approved',
      },
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_ARTIFACT_BOUNDARY_INVALID'),
    );
  });
});

test('provider evidence substitution fails closed', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    replaceEvidence(fixture, {
      ...fixture.providerEvidence,
      candidateArtifacts: [`artifact_${'9'.repeat(64)}`],
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PROVIDER_EVIDENCE_INVALID'),
    );
  });
});

test('alpha extraction cannot be smuggled into native-alpha materialization', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture({
      requiresAlphaExtraction: true,
    });
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError(
        'AVATAR_PROVIDER_CANDIDATE_OUTCOME_NOT_MATERIALIZABLE',
      ),
    );
  });
});

test('tampered source hashes and partial output bundles fail closed', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    const tampered = structuredClone(fixture.outcome);
    tampered.result.materializationRequest.reviewedTargetPath =
      'reviewed/eva/other-frame.png';
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: tampered,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_SELF_HASH_MISMATCH'),
    );
  });

  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    const output = path.join(
      root,
      ...fixture.candidateOutputPath.split('/'),
    );
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, fixture.candidateBytes);
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: fixture.store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError('AVATAR_PROVIDER_CANDIDATE_PARTIAL_PUBLICATION'),
    );
  });
});

test('artifact drift immediately before publication is detected', async () => {
  await withWorkspace(async (root) => {
    const fixture = createAvatarProviderCandidateFixture();
    let verificationCount = 0;
    const store = {
      get: (...args) => fixture.store.get(...args),
      read: (...args) => fixture.store.read(...args),
      verify: async (...args) => {
        verificationCount += 1;
        const result = await fixture.store.verify(...args);
        if (verificationCount >= 3) {
          return { ...result, contentValid: false };
        }
        return result;
      },
    };
    await assert.rejects(
      materializeAvatarFinalPassProviderCandidate({
        dispatch: fixture.dispatch,
        binding: fixture.binding,
        outcome: fixture.outcome,
        artifactStore: store,
        workspaceRoot: root,
        authorization: fixture.authorization,
        materializedAt: fixture.materializedAt,
      }),
      expectedError(
        'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_CHANGED_BEFORE_PUBLICATION',
      ),
    );
  });
});

console.log('Project Art avatar provider candidate materialization regressions passed.');
