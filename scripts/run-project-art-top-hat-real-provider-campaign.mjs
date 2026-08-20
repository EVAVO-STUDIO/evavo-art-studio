#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  inspectAvatarProviderCandidatePng,
} from './project-art/avatar-final-pass-provider-candidate-png.mjs';
import {
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './project-art/top-hat-pose-slot-provider-package.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  TOP_HAT_ADMITTED_BODY_ANCHORS,
} from './project-art/top-hat-pose-slot-production.mjs';
import {
  runTopHatPoseBankProviderCampaign,
} from './run-project-art-top-hat-pose-bank-provider-campaign.mjs';

const AUTHORIZATION_SCHEMA =
  'evavo.project-art-top-hat-real-provider-human-authorization.v1';
const PREPARATION_SCHEMA =
  'evavo.project-art-top-hat-real-provider-preparation.v1';
const EXPORT_SCHEMA =
  'evavo.project-art-top-hat-real-provider-candidate-export.v1';
const ADAPTER_ID = 'openai-gpt-image';
const DEFAULT_MODEL = 'gpt-image-1';
const AUTHORIZATION_WINDOW_MS = 2 * 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/u;

const CLIP_ANCHOR = Object.freeze({
  'blink-single': 'neutral',
  'blink-double': 'exhale',
  attention: 'inhale',
  listening: 'neutral',
  thinking: 'exhale',
  'talk-in': 'neutral',
  'talk-neutral': 'inhale',
  'talk-out': 'exhale',
  'talk-engaged': 'inhale',
  wave: 'neutral',
  'talk-emphasis': 'exhale',
  nod: 'neutral',
});

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Document(value) {
  const canonical = JSON.stringify(value, Object.keys(value).sort());
  return sha256Bytes(Buffer.from(canonical, 'utf8'));
}

function exactFile(file, label, maximumBytes = 8 * 1024 * 1024) {
  const absolute = path.resolve(file);
  const metadata = lstatSync(absolute);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.size < 2 ||
    metadata.size > maximumBytes ||
    realpathSync(absolute) !== absolute
  ) {
    fail('TOP_HAT_REAL_PROVIDER_INPUT_INVALID', `${label} is not one stable ordinary file.`);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (metadata[key] !== after[key]) {
      fail('TOP_HAT_REAL_PROVIDER_INPUT_CHANGED', `${label} changed while being read.`);
    }
  }
  return Object.freeze({ absolute, bytes, sha256: sha256Bytes(bytes) });
}

function exactJson(file, label) {
  const input = exactFile(file, label);
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.bytes));
  } catch {
    fail('TOP_HAT_REAL_PROVIDER_JSON_INVALID', `${label} is not valid UTF-8 JSON.`);
  }
  return Object.freeze({ ...input, value });
}

function authorizationRecord(file) {
  const input = exactJson(file, 'authorization record');
  const value = input.value;
  if (
    value?.schema !== AUTHORIZATION_SCHEMA ||
    value.actorClass !== 'human' ||
    typeof value.actorId !== 'string' ||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(value.actorId) ||
    typeof value.authorizedAt !== 'string' ||
    new Date(value.authorizedAt).toISOString() !== value.authorizedAt ||
    typeof value.statement !== 'string' ||
    value.statement.length < 20 ||
    value.maximumProviderCalls !== 6 ||
    value.providerAdapterId !== ADAPTER_ID ||
    typeof value.model !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.model) ||
    value.candidateApprovalGranted !== false ||
    value.publicationGranted !== false ||
    value.runtimeActivationGranted !== false
  ) {
    fail('TOP_HAT_REAL_PROVIDER_AUTHORIZATION_INVALID');
  }
  return Object.freeze({ ...input, value: Object.freeze({ ...value }) });
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || !['prepare', 'run'].includes(argv[0])) {
    fail('TOP_HAT_REAL_PROVIDER_CLI_INVALID', 'First argument must be prepare or run.');
  }
  const values = new Map();
  const rest = argv.slice(1);
  if (rest.length !== 4 || rest.length % 2 !== 0) {
    fail('TOP_HAT_REAL_PROVIDER_CLI_INVALID');
  }
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      !['--authorization-record', '--work-root'].includes(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      !value ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('TOP_HAT_REAL_PROVIDER_CLI_INVALID');
    }
    values.set(flag, value);
  }
  return Object.freeze({
    command: argv[0],
    authorizationRecord: path.resolve(values.get('--authorization-record')),
    workRoot: path.resolve(values.get('--work-root')),
  });
}

function createWorkRoot(target) {
  const parent = path.dirname(target);
  const parentState = lstatSync(parent);
  if (!parentState.isDirectory() || parentState.isSymbolicLink()) {
    fail('TOP_HAT_REAL_PROVIDER_WORK_ROOT_INVALID');
  }
  try {
    lstatSync(target);
    fail('TOP_HAT_REAL_PROVIDER_WORK_ROOT_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  mkdirSync(target, { mode: 0o700 });
  for (const child of ['artifacts', 'runtime', 'campaign', 'export']) {
    mkdirSync(path.join(target, child), { mode: 0o700 });
  }
  return target;
}

function writeJsonCreateOnly(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function writeBytesCreateOnly(file, bytes) {
  writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
}

function evidenceDigest(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

async function storeSource(store, bytes, source, labels, metadata) {
  return store.put(bytes, {
    mediaType: 'image/png',
    storageClass: 'source',
    fileName: path.basename(source.path),
    labels,
    metadata,
  });
}

async function prepare({ authorization, workRoot, preparedAt }) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const artifactRoot = path.join(workRoot, 'artifacts');
  const runtimeRoot = path.join(workRoot, 'runtime');
  const campaignRoot = path.join(workRoot, 'campaign', 'provider-execution');
  const exportRoot = path.join(workRoot, 'export');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const template = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const anchorById = new Map();

  for (const anchor of TOP_HAT_ADMITTED_BODY_ANCHORS) {
    const source = exactFile(path.join(repositoryRoot, anchor.path), `anchor ${anchor.id}`, 32 * 1024 * 1024);
    if (source.sha256 !== anchor.sha256 || source.bytes.length !== anchor.bytes) {
      fail('TOP_HAT_REAL_PROVIDER_ANCHOR_IDENTITY_MISMATCH', anchor.id);
    }
    const stored = await storeSource(
      store,
      source.bytes,
      anchor,
      { artifactRole: 'top-hat-admitted-body-anchor', anchorId: anchor.id },
      {
        finalDeliverable: false,
        approvedProductionAnchor: true,
        sourceRepository: anchor.repository,
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
      },
    );
    anchorById.set(anchor.id, Object.freeze({ anchor, source, stored }));
  }

  const selectionBySlot = {};
  const authorizationBySlot = {};
  const artifactBindingsBySlot = {};
  const occurredAt = preparedAt;
  const expiresAt = new Date(Date.parse(preparedAt) + AUTHORIZATION_WINDOW_MS).toISOString();
  const model = authorization.value.model || DEFAULT_MODEL;

  for (const [slotIndex, slot] of template.plan.productionSlots.entries()) {
    selectionBySlot[slot.slotId] = {
      preferredAdapterId: ADAPTER_ID,
      preferredModel: model,
      allowedAdapterIds: [ADAPTER_ID],
      allowFallback: false,
      requireSeed: false,
      seed: null,
    };
    authorizationBySlot[slot.slotId] = {
      action: 'run-top-hat-pose-provider-once',
      actorClass: 'human',
      actorId: authorization.value.actorId,
      slotId: slot.slotId,
      occurredAt,
      expiresAt,
      evidenceSha256: evidenceDigest({
        authorizationRecordSha256: authorization.sha256,
        slotId: slot.slotId,
        occurredAt,
        expiresAt,
        maximumProviderCalls: 1,
      }),
      maximumProviderCalls: 1,
    };

    const bindings = [];
    for (const anchor of template.plan.identityAnchors) {
      const admitted = anchorById.get(anchor.id);
      const bindingKey = `anchor:${anchor.id}`;
      bindings.push({
        bindingKey,
        role: anchor.id === 'neutral' ? 'edit-source' : 'identity-anchor',
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
        artifactId: admitted.stored.artifactId,
        evidenceSha256: evidenceDigest({
          authorizationRecordSha256: authorization.sha256,
          slotId: slot.slotId,
          bindingKey,
          artifactId: admitted.stored.artifactId,
          sourceSha256: anchor.sha256,
        }),
        actorClass: 'human',
        actorId: authorization.value.actorId,
        occurredAt,
      });
    }
    for (const sourceClipId of slot.sourceMapping.sourceClipIds) {
      const selectedAnchorId = CLIP_ANCHOR[sourceClipId];
      const admitted = anchorById.get(selectedAnchorId);
      if (!admitted) fail('TOP_HAT_REAL_PROVIDER_CLIP_REFERENCE_MISSING', sourceClipId);
      const bindingKey = `clip:${sourceClipId}`;
      const stored = await storeSource(
        store,
        admitted.source.bytes,
        admitted.anchor,
        {
          artifactRole: 'top-hat-continuity-reference',
          slotId: slot.slotId,
          sourceClipId,
        },
        {
          finalDeliverable: false,
          sourceClipId,
          continuityProxyAnchorId: selectedAnchorId,
          sourcePath: admitted.anchor.path,
          sourceSha256: admitted.anchor.sha256,
        },
      );
      bindings.push({
        bindingKey,
        role: 'animation-clip-reference',
        sourcePath: admitted.anchor.path,
        sourceSha256: admitted.anchor.sha256,
        artifactId: stored.artifactId,
        evidenceSha256: evidenceDigest({
          authorizationRecordSha256: authorization.sha256,
          slotId: slot.slotId,
          bindingKey,
          artifactId: stored.artifactId,
          sourceClipId,
        }),
        actorClass: 'human',
        actorId: authorization.value.actorId,
        occurredAt,
      });
    }
    artifactBindingsBySlot[slot.slotId] = bindings;
  }

  const request = createProjectArtTopHatPoseSlotProviderPackageRequest({
    requestId: `top-hat-real-provider-${sha256Bytes(Buffer.from(preparedAt)).slice(0, 20)}`,
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
    notesBySlot: Object.fromEntries(
      template.plan.productionSlots.map((slot) => [
        slot.slotId,
        'Real provider candidate only. Human review, repair, admission, publication and Runtime activation remain separate.',
      ]),
    ),
  });
  const adapter = compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
    request,
    compiledAt: preparedAt,
  });
  const adapterPath = path.join(workRoot, 'top-hat-real-provider-adapter.json');
  writeJsonCreateOnly(adapterPath, adapter);
  const adapterFileSha256 = sha256Bytes(readFileSync(adapterPath));
  const preparation = Object.freeze({
    schema: PREPARATION_SCHEMA,
    status: 'ready-for-six-real-provider-calls',
    preparedAt,
    authorizationRecordSha256: authorization.sha256,
    actorId: authorization.value.actorId,
    model,
    adapterId: ADAPTER_ID,
    adapterPath,
    adapterFileSha256,
    adapterSha256: adapter.adapterSha256,
    artifactRoot,
    runtimeRoot,
    campaignRoot,
    exportRoot,
    counts: Object.freeze({
      slots: template.plan.productionSlots.length,
      admittedAnchors: anchorById.size,
      maximumProviderCalls: 6,
      candidatesPerSlot: 1,
    }),
    authority: Object.freeze({
      candidateApproval: false,
      candidatePromotion: false,
      poseSlotFilling: false,
      publication: false,
      runtimeActivation: false,
      gitMutation: false,
    }),
  });
  writeJsonCreateOnly(path.join(workRoot, 'preparation.json'), preparation);
  return Object.freeze({ preparation, adapter, store });
}

async function exportCandidates({ preparation, store, campaignResult }) {
  if (campaignResult.status !== 'succeeded') {
    fail('TOP_HAT_REAL_PROVIDER_CAMPAIGN_FAILED', JSON.stringify(campaignResult.failure));
  }
  const campaignReceipt = JSON.parse(readFileSync(campaignResult.campaignReceiptPath, 'utf8'));
  const candidates = [];
  for (const slot of campaignReceipt.slots) {
    const candidateBytes = await store.read(slot.candidateArtifactId);
    const candidateDescriptor = await store.get(slot.candidateArtifactId);
    const evidenceBytes = await store.read(slot.evidenceArtifactId);
    const inspection = inspectAvatarProviderCandidatePng(
      candidateBytes,
      1024,
      1536,
      { requireTransparentPixels: true },
    );
    const candidatePath = path.join(preparation.exportRoot, `${slot.slotId}.candidate.png`);
    const evidencePath = path.join(preparation.exportRoot, `${slot.slotId}.provider-evidence.json`);
    writeBytesCreateOnly(candidatePath, candidateBytes);
    writeBytesCreateOnly(evidencePath, evidenceBytes);
    candidates.push(Object.freeze({
      slotId: slot.slotId,
      candidateArtifactId: slot.candidateArtifactId,
      evidenceArtifactId: slot.evidenceArtifactId,
      candidatePath,
      evidencePath,
      mediaType: candidateDescriptor.mediaType,
      bytes: candidateBytes.length,
      sha256: inspection.sha256,
      width: inspection.width,
      height: inspection.height,
      transparentPixels: inspection.transparentPixels,
      partialAlphaPixels: inspection.partialAlphaPixels,
      hiddenRgbTransparentPixels: inspection.hiddenRgbTransparentPixels,
      edgeVisiblePixels: inspection.edgeVisiblePixels,
      approvalState: 'unapproved-awaiting-frame-review',
    }));
  }
  const body = {
    schema: EXPORT_SCHEMA,
    status: 'six-unapproved-candidates-exported-for-review',
    completedAt: new Date().toISOString(),
    campaignExecutionSha256: campaignResult.campaignExecutionSha256,
    candidates: Object.freeze(candidates),
    counts: Object.freeze({ candidates: candidates.length, approved: 0 }),
    candidateApprovalPerformed: false,
    poseSlotsFilled: false,
    publicationPerformed: false,
    runtimeActivationPerformed: false,
  };
  const manifest = Object.freeze({
    ...body,
    manifestSha256: sha256Bytes(Buffer.from(JSON.stringify(body), 'utf8')),
  });
  writeJsonCreateOnly(path.join(preparation.exportRoot, 'candidate-export.json'), manifest);
  return manifest;
}

export async function runTopHatRealProviderCampaign(argv, environment = process.env) {
  const input = parseArguments(argv);
  const authorization = authorizationRecord(input.authorizationRecord);
  const workRoot = createWorkRoot(input.workRoot);
  const preparedAt = new Date().toISOString();
  const prepared = await prepare({ authorization, workRoot, preparedAt });
  if (input.command === 'prepare') {
    return Object.freeze({
      status: prepared.preparation.status,
      workRoot,
      preparation: prepared.preparation,
      providerExecutionPerformed: false,
    });
  }
  if (!environment.OPENAI_API_KEY?.trim()) {
    fail('TOP_HAT_REAL_PROVIDER_OPENAI_API_KEY_MISSING');
  }
  const campaignResult = await runTopHatPoseBankProviderCampaign(
    [
      '--adapter', prepared.preparation.adapterPath,
      '--expected-adapter-file-sha256', prepared.preparation.adapterFileSha256,
      '--runtime-root', prepared.preparation.runtimeRoot,
      '--artifact-root', prepared.preparation.artifactRoot,
      '--output-root', prepared.preparation.campaignRoot,
      '--worker-prefix', 'top-hat-real-provider',
    ],
    environment,
    { build: false },
  );
  const exportManifest = await exportCandidates({
    preparation: prepared.preparation,
    store: prepared.store,
    campaignResult,
  });
  return Object.freeze({
    status: 'succeeded-awaiting-human-frame-review',
    workRoot,
    campaignResult,
    exportManifest,
    candidateApprovalPerformed: false,
    publicationPerformed: false,
    runtimeActivationPerformed: false,
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    const result = await runTopHatRealProviderCampaign(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'error',
      code: error?.code ?? 'TOP_HAT_REAL_PROVIDER_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
