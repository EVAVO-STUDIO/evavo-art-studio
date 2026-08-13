import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  AUTHORIZATION_ACTION,
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
  CANDIDATE_MATERIALIZATION_AUTHORITY_KEYS,
  FINISHER_REQUEST_AUTHORITY_KEYS,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  MAXIMUM_CANDIDATE_BYTES,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  allFalseAuthority,
  artifactId,
  assert,
  boundedText,
  canonicalRelativePath,
  deepFreeze,
  digest,
  exactKeys,
  fail,
  isRecord,
  sameCanonical,
  sha256Bytes,
  sha256Document,
  sha256Text,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate-png.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './avatar-final-pass-provider-candidate-source.mjs';

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function parseAuthorization(input) {
  const authorization = snapshotJsonValue(
    input,
    'candidate materialization authorization',
  );
  exactKeys(
    authorization,
    ['action', 'actorClass', 'actorId', 'occurredAt', 'evidenceSha256'],
    'candidate materialization authorization',
  );
  assert(
    authorization.action === AUTHORIZATION_ACTION,
    'AVATAR_PROVIDER_CANDIDATE_AUTHORIZATION_ACTION_INVALID',
  );
  assert(
    authorization.actorClass === 'human' ||
      authorization.actorClass === 'agent',
    'AVATAR_PROVIDER_CANDIDATE_AUTHORIZATION_ACTOR_INVALID',
  );
  return deepFreeze({
    action: AUTHORIZATION_ACTION,
    actorClass: authorization.actorClass,
    actorId: boundedText(
      authorization.actorId,
      'candidate materialization authorization.actorId',
      1,
      256,
    ),
    occurredAt: timestamp(
      authorization.occurredAt,
      'candidate materialization authorization.occurredAt',
    ),
    evidenceSha256: digest(
      authorization.evidenceSha256,
      'candidate materialization authorization.evidenceSha256',
    ),
  });
}

function assertStore(store) {
  assert(
    store &&
      typeof store.get === 'function' &&
      typeof store.verify === 'function' &&
      typeof store.read === 'function',
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_STORE_INVALID',
    'Artifact store must expose get, verify and read.',
  );
  return store;
}

function descriptorMetadata(descriptor, label) {
  assert(
    isRecord(descriptor.metadata),
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_METADATA_INVALID',
    `${label} metadata must be an object.`,
  );
  return descriptor.metadata;
}

function descriptorLabels(descriptor, label) {
  assert(
    isRecord(descriptor.labels),
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_LABELS_INVALID',
    `${label} labels must be an object.`,
  );
  return descriptor.labels;
}

async function verifiedDescriptor(store, id, label) {
  const verification = await store.verify(id);
  assert(
    verification?.exists === true &&
      verification.descriptorValid === true &&
      verification.contentValid === true,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_VERIFICATION_FAILED',
    `${label} failed immutable descriptor or content verification.`,
  );
  const descriptor = await store.get(id);
  assert(
    isRecord(descriptor) && descriptor.artifactId === id,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_DESCRIPTOR_INVALID',
    `${label} descriptor was not found or changed identity.`,
  );
  assert(
    descriptor.contentSha256 === verification.expectedContentSha256 &&
      descriptor.sizeBytes === verification.expectedSizeBytes,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_DESCRIPTOR_INVALID',
    `${label} descriptor differs from verification evidence.`,
  );
  return descriptor;
}

function validateCandidateDescriptor(descriptor, source) {
  const labels = descriptorLabels(descriptor, 'candidate artifact');
  const metadata = descriptorMetadata(descriptor, 'candidate artifact');
  assert(
    descriptor.mediaType === 'image/png' &&
      descriptor.storageClass === 'intermediate' &&
      Number.isSafeInteger(descriptor.sizeBytes) &&
      descriptor.sizeBytes >= 57 &&
      descriptor.sizeBytes <= MAXIMUM_CANDIDATE_BYTES &&
      labels.artifactRole === 'provider-candidate' &&
      labels.approvalState === 'unapproved' &&
      labels.providerRequestId === source.providerRequestId &&
      labels.candidateFamilyId ===
        source.dispatch.providerCompiler.input.candidateFamilyId &&
      labels.assetId === source.dispatch.providerCompiler.input.assetId &&
      labels.continuityPhase === source.dispatch.continuityPhase &&
      labels.candidateIndex === '1' &&
      labels.providerAdapter === source.outcome.result.adapterId &&
      labels.providerModel === source.outcome.result.model &&
      metadata.finalDeliverable === false &&
      metadata.requiresMastering === true &&
      metadata.requiresBlockingQa === true &&
      metadata.requestSha256 === source.providerRequestSha256 &&
      metadata.compiledPromptSha256 === source.compiledPromptSha256 &&
      metadata.backgroundStrategy === 'native-alpha' &&
      metadata.transparencyTarget === 'required',
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_BOUNDARY_INVALID',
    'Candidate artifact crossed or drifted from the unapproved provider boundary.',
  );
  digest(descriptor.contentSha256, 'candidate artifact contentSha256');
  assert(
    descriptor.contentHash === `sha256:${descriptor.contentSha256}`,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_HASH_INVALID',
  );
}

function strictJsonBytes(bytes, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(
      'AVATAR_PROVIDER_CANDIDATE_EVIDENCE_UTF8_INVALID',
      `${label} is not valid UTF-8.`,
    );
  }
  assert(
    text.charCodeAt(0) !== 0xfeff,
    'AVATAR_PROVIDER_CANDIDATE_EVIDENCE_BOM_FORBIDDEN',
    `${label} contains a UTF-8 BOM.`,
  );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(
      'AVATAR_PROVIDER_CANDIDATE_EVIDENCE_JSON_INVALID',
      `${label} is not valid JSON.`,
    );
  }
  return snapshotJsonValue(value, label);
}

function validateEvidenceDescriptor(descriptor, source) {
  const labels = descriptorLabels(descriptor, 'provider evidence artifact');
  const metadata = descriptorMetadata(
    descriptor,
    'provider evidence artifact',
  );
  assert(
    descriptor.mediaType === 'application/json' &&
      descriptor.storageClass === 'evidence' &&
      labels.artifactRole === 'provider-candidate-evidence' &&
      labels.providerRequestId === source.providerRequestId &&
      labels.candidateFamilyId ===
        source.dispatch.providerCompiler.input.candidateFamilyId &&
      labels.assetId === source.dispatch.providerCompiler.input.assetId &&
      labels.outcome === 'candidate-produced' &&
      metadata.requestSha256 === source.providerRequestSha256 &&
      metadata.compiledPromptSha256 === source.compiledPromptSha256 &&
      metadata.candidateCount === 1 &&
      Array.isArray(descriptor.sourceArtifacts) &&
      descriptor.sourceArtifacts.includes(source.candidateArtifactId),
    'AVATAR_PROVIDER_CANDIDATE_EVIDENCE_DESCRIPTOR_INVALID',
    'Provider evidence descriptor does not bind the exact candidate.',
  );
}

function validateProviderEvidence(evidence, source) {
  assert(
    isRecord(evidence) &&
      evidence.schemaVersion === '1.0' &&
      evidence.protocolVersion === GENERIC_PROVIDER_PROTOCOL_VERSION &&
      evidence.requestId === source.providerRequestId &&
      evidence.requestSha256 === source.providerRequestSha256 &&
      evidence.compiledPromptSha256 === source.compiledPromptSha256 &&
      evidence.outcome === 'candidate-produced' &&
      evidence.requiresAlphaExtraction === false &&
      Array.isArray(evidence.candidateArtifacts) &&
      sameCanonical(evidence.candidateArtifacts, [
        source.candidateArtifactId,
      ]) &&
      isRecord(evidence.request) &&
      sha256Document(evidence.request) === source.providerRequestSha256,
    'AVATAR_PROVIDER_CANDIDATE_PROVIDER_EVIDENCE_INVALID',
    'Provider evidence does not bind the exact successful candidate.',
  );

  const routing = evidence.routingInspection;
  assert(
    isRecord(routing) &&
      routing.requestId === source.providerRequestId &&
      routing.requestSha256 === source.providerRequestSha256 &&
      routing.outcome === 'eligible' &&
      routing.fallbackAllowed === false &&
      routing.providerCallPerformedByInspection === false,
    'AVATAR_PROVIDER_CANDIDATE_ROUTING_EVIDENCE_INVALID',
  );

  assert(
    isRecord(evidence.selection) &&
      isRecord(evidence.selection.adapter) &&
      evidence.selection.adapter.id === source.outcome.result.adapterId &&
      evidence.selection.model === source.outcome.result.model,
    'AVATAR_PROVIDER_CANDIDATE_PROVIDER_SELECTION_INVALID',
  );
  assert(
    Array.isArray(evidence.attempts) &&
      evidence.attempts.length === 1 &&
      evidence.attempts[0]?.outcome === 'succeeded' &&
      evidence.attempts[0]?.adapterId === source.outcome.result.adapterId &&
      evidence.attempts[0]?.model === source.outcome.result.model,
    'AVATAR_PROVIDER_CANDIDATE_ATTEMPT_EVIDENCE_INVALID',
  );
  timestamp(
    evidence.attempts[0].startedAt,
    'provider evidence attempt.startedAt',
  );
  timestamp(
    evidence.attempts[0].completedAt,
    'provider evidence attempt.completedAt',
  );
  timestamp(evidence.completedAt, 'provider evidence.completedAt');
  assert(
    Date.parse(evidence.attempts[0].startedAt) <=
        Date.parse(evidence.attempts[0].completedAt) &&
      Date.parse(evidence.attempts[0].completedAt) <=
        Date.parse(evidence.completedAt),
    'AVATAR_PROVIDER_CANDIDATE_ATTEMPT_TIME_INVALID',
  );
}

function candidatePaths(candidateOutputPath) {
  const relative = canonicalRelativePath(
    candidateOutputPath,
    'candidate output path',
  );
  assert(
    relative.endsWith('.png'),
    'AVATAR_PROVIDER_CANDIDATE_PATH_INVALID',
    'Candidate output path must end in .png.',
  );
  const stem = relative.slice(0, -'.png'.length);
  return Object.freeze({
    candidate: relative,
    receipt: `${stem}.materialization.json`,
    finisherRequest: `${stem}.finisher-request.json`,
  });
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function realDirectory(value, label) {
  const absolute = realpathSync(path.resolve(value));
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'AVATAR_PROVIDER_CANDIDATE_ROOT_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
}

function ensureDirectoryChain(root, relativeDirectory) {
  if (!relativeDirectory || relativeDirectory === '.') return root;
  let current = root;
  for (const part of relativeDirectory.split('/')) {
    assert(
      part && part !== '.' && part !== '..',
      'AVATAR_PROVIDER_CANDIDATE_PATH_INVALID',
    );
    current = path.join(current, part);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
    }
    const metadata = lstatSync(current);
    assert(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      'AVATAR_PROVIDER_CANDIDATE_PATH_COMPONENT_INVALID',
      `Candidate output parent contains a non-directory or symbolic component: ${part}.`,
    );
    const resolved = realpathSync(current);
    assert(
      isInside(root, resolved),
      'AVATAR_PROVIDER_CANDIDATE_PATH_ESCAPE',
      'Candidate output parent escaped the workspace root.',
    );
  }
  return current;
}

function absoluteBundlePaths(workspaceRoot, relativePaths) {
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const parent = path.posix.dirname(relativePaths.candidate);
  const parentAbsolute = ensureDirectoryChain(root, parent);
  const values = Object.fromEntries(
    Object.entries(relativePaths).map(([key, relative]) => {
      assert(
        path.posix.dirname(relative) === parent,
        'AVATAR_PROVIDER_CANDIDATE_BUNDLE_PATH_INVALID',
        'Candidate, receipt and finisher request must share one directory.',
      );
      const absolute = path.join(parentAbsolute, path.posix.basename(relative));
      assert(
        isInside(root, absolute),
        'AVATAR_PROVIDER_CANDIDATE_PATH_ESCAPE',
      );
      return [key, absolute];
    }),
  );
  return Object.freeze({ root, parent: parentAbsolute, ...values });
}

function fileBuffer(value) {
  return Buffer.isBuffer(value)
    ? value
    : Buffer.from(value, 'utf8');
}

function writeStagedFile(filePath, bytes) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

function publishCreateOnlyBundle(absolutePaths, contents) {
  const finals = [
    absolutePaths.candidate,
    absolutePaths.receipt,
    absolutePaths.finisherRequest,
  ];
  const present = finals.map((entry) => existsSync(entry));
  assert(
    present.every((entry) => entry === false),
    'AVATAR_PROVIDER_CANDIDATE_OUTPUT_ALREADY_EXISTS',
    'Candidate bundle already exists or is partially published.',
  );

  const token = randomBytes(12).toString('hex');
  const staged = finals.map(
    (finalPath, index) =>
      path.join(
        absolutePaths.parent,
        `.${path.basename(finalPath)}.${token}.${index}.tmp`,
      ),
  );
  const payloads = [
    fileBuffer(contents.candidate),
    fileBuffer(contents.receipt),
    fileBuffer(contents.finisherRequest),
  ];
  const linked = [];
  try {
    for (let index = 0; index < staged.length; index += 1) {
      writeStagedFile(staged[index], payloads[index]);
    }
    for (let index = 0; index < staged.length; index += 1) {
      linkSync(staged[index], finals[index]);
      linked.push(finals[index]);
    }
    for (const temp of staged) safeUnlink(temp);
  } catch (error) {
    for (const finalPath of linked.reverse()) safeUnlink(finalPath);
    for (const temp of staged) safeUnlink(temp);
    throw error;
  }

  for (let index = 0; index < finals.length; index += 1) {
    const metadata = lstatSync(finals[index]);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1 &&
        metadata.size === payloads[index].byteLength,
      'AVATAR_PROVIDER_CANDIDATE_PUBLICATION_INVALID',
      `Published candidate bundle member is invalid: ${finals[index]}.`,
    );
  }
}

function materializationAuthority() {
  const trueKeys = new Set([
    'artifactRead',
    'evidenceRead',
    'candidateMaterialization',
    'receiptPersistence',
    'finisherRequestPersistence',
  ]);
  return Object.freeze(
    Object.fromEntries(
      CANDIDATE_MATERIALIZATION_AUTHORITY_KEYS.map((key) => [
        key,
        trueKeys.has(key),
      ]),
    ),
  );
}

function finisherAuthority() {
  return Object.freeze(
    Object.fromEntries(
      FINISHER_REQUEST_AUTHORITY_KEYS.map((key) => [key, false]),
    ),
  );
}

function materializationId(source) {
  return `avatar-candidate-materialization:${sha256Text(
    [
      source.dispatch.runtimeDispatchSha256,
      source.binding.runtimeBindingSha256,
      source.outcome.runtimeOutcomeSha256,
      source.candidateArtifactId,
      source.candidateOutputPath,
    ].join('\0'),
  ).slice(0, 40)}`;
}

function buildFinisherRequest({
  source,
  candidateDescriptor,
  evidenceDescriptor,
  png,
  relativePaths,
  id,
  materializedAt,
}) {
  const body = {
    schema: AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    requestId: `avatar-finisher:${sha256Text(
      `${id}\0${png.sha256}\0${source.reviewedTargetPath}`,
    ).slice(0, 40)}`,
    materializationId: id,
    createdAt: materializedAt,
    sourceCommit: source.dispatch.sourceCommit,
    sessionId: source.dispatch.sessionId,
    characterId: source.dispatch.characterId,
    jobId: source.dispatch.jobId,
    frameId: source.dispatch.frameId,
    kind: source.dispatch.kind,
    operation: source.dispatch.operation,
    continuityPhase: source.dispatch.continuityPhase,
    sourceCandidate: Object.freeze({
      path: relativePaths.candidate,
      sha256: png.sha256,
      bytes: png.byteLength,
      mediaType: 'image/png',
      width: png.width,
      height: png.height,
      visiblePixels: png.visiblePixels,
      transparentPixels: png.transparentPixels,
      partialAlphaPixels: png.partialAlphaPixels,
      hiddenRgbTransparentPixels: png.hiddenRgbTransparentPixels,
      edgeVisiblePixels: png.edgeVisiblePixels,
      visibleBounds: png.visibleBounds,
      artifactId: source.candidateArtifactId,
      artifactDescriptorSha256: candidateDescriptor.descriptorSha256,
      evidenceArtifactId: source.evidenceArtifactId,
      evidenceDescriptorSha256: evidenceDescriptor.descriptorSha256,
      runtimeOutcomeSha256: source.outcome.runtimeOutcomeSha256,
    }),
    reviewedTargetPath: source.reviewedTargetPath,
    requiredOperations: Object.freeze([
      'clear-hidden-rgb-under-fully-transparent-pixels',
      'preserve-canonical-canvas-and-registration',
      'run-avatar-frame-finisher',
      'run-native-scale-and-contact-sheet-inspection',
      'rerun-sequence-and-final-to-first-loop-closure-after-admission',
    ]),
    requiredReviewGates: Object.freeze([
      'technical',
      'hands-and-anatomy',
      'face-identity',
      'silhouette-and-registration',
      'adjacent-frame-continuity',
      'final-to-first-loop-closure-when-applicable',
    ]),
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: finisherAuthority(),
  };
  return deepFreeze({
    ...body,
    finisherRequestSha256: sha256Document(body),
  });
}

function buildReceipt({
  source,
  candidateDescriptor,
  evidenceDescriptor,
  providerEvidenceSha256,
  png,
  relativePaths,
  authorization,
  finisherRequest,
  id,
  materializedAt,
}) {
  const body = {
    schema: AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId: id,
    materializedAt,
    sourceCommit: source.dispatch.sourceCommit,
    source: Object.freeze({
      runtimeDispatchSha256: source.dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: source.binding.runtimeBindingSha256,
      runtimeOutcomeSha256: source.outcome.runtimeOutcomeSha256,
      providerRequestId: source.providerRequestId,
      providerRequestSha256: source.providerRequestSha256,
      compiledPromptSha256: source.compiledPromptSha256,
      candidateArtifactId: source.candidateArtifactId,
      candidateArtifactDescriptorSha256:
        candidateDescriptor.descriptorSha256,
      evidenceArtifactId: source.evidenceArtifactId,
      evidenceArtifactDescriptorSha256:
        evidenceDescriptor.descriptorSha256,
      providerEvidenceContentSha256: providerEvidenceSha256,
    }),
    output: Object.freeze({
      path: relativePaths.candidate,
      reviewedTargetPath: source.reviewedTargetPath,
      sha256: png.sha256,
      bytes: png.byteLength,
      mediaType: 'image/png',
      width: png.width,
      height: png.height,
      createOnly: true,
      unapproved: true,
    }),
    png,
    authorization,
    finisherHandoff: Object.freeze({
      path: relativePaths.finisherRequest,
      finisherRequestSha256: finisherRequest.finisherRequestSha256,
    }),
    requiredNextSteps: Object.freeze([
      'rerun-avatar-frame-finisher',
      'review-hands-anatomy-face-identity-and-continuity',
      'record-final-reviewed-frame-sha256',
      'rerun-animation-timing-and-loop-closure',
      'admit-frame-to-dependent-inbetween-or-sequence-only-after-review',
    ]),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    }),
    authority: materializationAuthority(),
  };
  return deepFreeze({
    ...body,
    materializationSha256: sha256Document(body),
  });
}

function parseExistingJson(filePath, hashField, schema, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    fail(
      'AVATAR_PROVIDER_CANDIDATE_EXISTING_BUNDLE_INVALID',
      `${label} is not valid JSON.`,
    );
  }
  const parsed = verifySelfHash(value, hashField, label);
  assert(
    parsed.schema === schema &&
      parsed.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    'AVATAR_PROVIDER_CANDIDATE_EXISTING_BUNDLE_INVALID',
    `${label} schema is invalid.`,
  );
  return parsed;
}

function reuseExistingBundle({
  absolutePaths,
  relativePaths,
  source,
  expectedId,
}) {
  const finals = [
    absolutePaths.candidate,
    absolutePaths.receipt,
    absolutePaths.finisherRequest,
  ];
  const present = finals.map((entry) => existsSync(entry));
  if (present.every((entry) => entry === false)) return null;
  assert(
    present.every((entry) => entry === true),
    'AVATAR_PROVIDER_CANDIDATE_PARTIAL_PUBLICATION',
    'Candidate bundle is partially published and requires operator inspection.',
  );

  const receipt = parseExistingJson(
    absolutePaths.receipt,
    'materializationSha256',
    AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
    'existing candidate materialization receipt',
  );
  const finisherRequest = parseExistingJson(
    absolutePaths.finisherRequest,
    'finisherRequestSha256',
    AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
    'existing candidate finisher request',
  );
  const candidateBytes = readFileSync(absolutePaths.candidate);
  const candidateSha256 = sha256Bytes(candidateBytes);
  assert(
    receipt.materializationId === expectedId &&
      receipt.source.runtimeDispatchSha256 ===
        source.dispatch.runtimeDispatchSha256 &&
      receipt.source.runtimeBindingSha256 ===
        source.binding.runtimeBindingSha256 &&
      receipt.source.runtimeOutcomeSha256 ===
        source.outcome.runtimeOutcomeSha256 &&
      receipt.source.candidateArtifactId === source.candidateArtifactId &&
      receipt.output.path === relativePaths.candidate &&
      receipt.output.reviewedTargetPath === source.reviewedTargetPath &&
      receipt.output.sha256 === candidateSha256 &&
      receipt.output.bytes === candidateBytes.byteLength &&
      receipt.finisherHandoff.path === relativePaths.finisherRequest &&
      receipt.finisherHandoff.finisherRequestSha256 ===
        finisherRequest.finisherRequestSha256 &&
      finisherRequest.materializationId === expectedId &&
      finisherRequest.sourceCandidate.sha256 === candidateSha256 &&
      finisherRequest.sourceCandidate.path === relativePaths.candidate &&
      finisherRequest.reviewedTargetPath === source.reviewedTargetPath,
    'AVATAR_PROVIDER_CANDIDATE_EXISTING_BUNDLE_MISMATCH',
    'Existing candidate bundle does not match the exact source chain.',
  );

  for (const finalPath of finals) {
    const metadata = lstatSync(finalPath);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1,
      'AVATAR_PROVIDER_CANDIDATE_EXISTING_BUNDLE_INVALID',
    );
  }
  return deepFreeze({
    status: receipt.status,
    reused: true,
    materializationId: expectedId,
    candidatePath: absolutePaths.candidate,
    receiptPath: absolutePaths.receipt,
    finisherRequestPath: absolutePaths.finisherRequest,
    receipt,
    finisherRequest,
  });
}

export async function materializeAvatarFinalPassProviderCandidate({
  dispatch,
  binding,
  outcome,
  artifactStore,
  workspaceRoot,
  authorization: authorizationInput,
  materializedAt = new Date().toISOString(),
}) {
  const source = parseAvatarProviderCandidateSourceChain({
    dispatch,
    binding,
    outcome,
  });
  const store = assertStore(artifactStore);
  const authorization = parseAuthorization(authorizationInput);
  timestamp(materializedAt, 'materializedAt');
  assert(
    Date.parse(materializedAt) >= Date.parse(authorization.occurredAt),
    'AVATAR_PROVIDER_CANDIDATE_AUTHORIZATION_TIME_INVALID',
    'Materialization may not precede its authorization evidence.',
  );

  const relativePaths = candidatePaths(source.candidateOutputPath);
  const absolutePaths = absoluteBundlePaths(workspaceRoot, relativePaths);
  const id = materializationId(source);
  const reused = reuseExistingBundle({
    absolutePaths,
    relativePaths,
    source,
    expectedId: id,
  });
  if (reused) return reused;

  const candidateDescriptor = await verifiedDescriptor(
    store,
    source.candidateArtifactId,
    'candidate artifact',
  );
  validateCandidateDescriptor(candidateDescriptor, source);
  const evidenceDescriptor = await verifiedDescriptor(
    store,
    source.evidenceArtifactId,
    'provider evidence artifact',
  );
  validateEvidenceDescriptor(evidenceDescriptor, source);

  const candidateBytes = Buffer.from(
    await store.read(source.candidateArtifactId),
  );
  assert(
    candidateBytes.byteLength === candidateDescriptor.sizeBytes &&
      sha256Bytes(candidateBytes) === candidateDescriptor.contentSha256,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_READ_MISMATCH',
  );
  const evidenceBytes = Buffer.from(
    await store.read(source.evidenceArtifactId),
  );
  assert(
    evidenceBytes.byteLength === evidenceDescriptor.sizeBytes &&
      sha256Bytes(evidenceBytes) === evidenceDescriptor.contentSha256,
    'AVATAR_PROVIDER_CANDIDATE_EVIDENCE_READ_MISMATCH',
  );
  const providerEvidence = strictJsonBytes(
    evidenceBytes,
    'provider evidence artifact',
  );
  validateProviderEvidence(providerEvidence, source);

  const png = inspectAvatarProviderCandidatePng(
    candidateBytes,
    source.expectedWidth,
    source.expectedHeight,
  );
  assert(
    png.sha256 === candidateDescriptor.contentSha256,
    'AVATAR_PROVIDER_CANDIDATE_PNG_HASH_MISMATCH',
  );

  const finisherRequest = buildFinisherRequest({
    source,
    candidateDescriptor,
    evidenceDescriptor,
    png,
    relativePaths,
    id,
    materializedAt,
  });
  const receipt = buildReceipt({
    source,
    candidateDescriptor,
    evidenceDescriptor,
    providerEvidenceSha256: sha256Bytes(evidenceBytes),
    png,
    relativePaths,
    authorization,
    finisherRequest,
    id,
    materializedAt,
  });

  const candidateReverification = await store.verify(
    source.candidateArtifactId,
  );
  const evidenceReverification = await store.verify(
    source.evidenceArtifactId,
  );
  assert(
    candidateReverification?.descriptorValid === true &&
      candidateReverification.contentValid === true &&
      candidateReverification.expectedContentSha256 === png.sha256 &&
      evidenceReverification?.descriptorValid === true &&
      evidenceReverification.contentValid === true &&
      evidenceReverification.expectedContentSha256 ===
        evidenceDescriptor.contentSha256,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_CHANGED_BEFORE_PUBLICATION',
  );

  publishCreateOnlyBundle(absolutePaths, {
    candidate: candidateBytes,
    receipt: `${JSON.stringify(receipt, null, 2)}\n`,
    finisherRequest: `${JSON.stringify(finisherRequest, null, 2)}\n`,
  });

  const publishedBytes = readFileSync(absolutePaths.candidate);
  assert(
    publishedBytes.byteLength === candidateBytes.byteLength &&
      sha256Bytes(publishedBytes) === png.sha256,
    'AVATAR_PROVIDER_CANDIDATE_PUBLICATION_HASH_MISMATCH',
  );

  return deepFreeze({
    status: receipt.status,
    reused: false,
    materializationId: id,
    candidatePath: absolutePaths.candidate,
    receiptPath: absolutePaths.receipt,
    finisherRequestPath: absolutePaths.finisherRequest,
    receipt,
    finisherRequest,
  });
}
