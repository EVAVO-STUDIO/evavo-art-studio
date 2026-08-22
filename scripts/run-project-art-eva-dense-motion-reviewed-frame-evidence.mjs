#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { sha256Document } from './project-art/avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
  EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_RECEIPT_SCHEMA,
  compileEvaDenseMotionReviewedFrameEvidence,
  persistEvaDenseMotionReviewedFrameEvidence,
} from './project-art/eva-dense-motion-reviewed-frame-evidence.mjs';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const REQUIRED = Object.freeze([
  '--program',
  '--mastering-campaign-receipt',
  '--review-intake-plan',
  '--review-intake-receipt',
  '--workspace-root',
  '--output-root',
  '--inspected-at',
]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED.length * 2) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ARGUMENT_INVALID');
  }
  const allowed = new Set(REQUIRED);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ARGUMENT_INVALID');
    }
    values.set(flag, value);
  }
  return values;
}

function realDirectory(raw, label) {
  const lexical = path.resolve(raw);
  const metadata = lstatSync(lexical);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(lexical) !== lexical
  ) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ROOT_INVALID', label);
  }
  return lexical;
}

function stableJson(raw, label) {
  const lexical = path.resolve(raw);
  const before = lstatSync(lexical);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_JSON_BYTES ||
    realpathSync(lexical) !== lexical
  ) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_INPUT_CHANGED', label);
    }
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_JSON_INVALID', label);
  }
}

function semanticEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedEvidenceRecords(program, compiled, workspaceRoot) {
  if (!Array.isArray(program?.production?.jobs) || program.production.jobs.length !== 10) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_PROGRAM_INVALID');
  }
  return program.production.jobs.flatMap((job, index) => {
    const frame = compiled.frames[index];
    if (
      frame?.technical?.ordinal !== job.ordinal ||
      frame?.creative?.ordinal !== job.ordinal
    ) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_FRAME_BINDING_INVALID');
    }
    return [
      {
        path: path.resolve(workspaceRoot, ...job.outputs.technicalInspection.split('/')),
        expected: frame.technical,
        label: `technical inspection ${job.ordinal}`,
      },
      {
        path: path.resolve(workspaceRoot, ...job.outputs.creativeApproval.split('/')),
        expected: frame.creative,
        label: `creative approval ${job.ordinal}`,
      },
    ];
  });
}

function evidencePersistenceState(program, compiled, workspaceRoot) {
  const records = expectedEvidenceRecords(program, compiled, workspaceRoot);
  const present = records.filter((record) => existsSync(record.path));
  if (present.length === 0) return 'absent';
  if (present.length !== records.length) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_PARTIAL_PERSISTENCE');
  }
  for (const record of records) {
    const existing = stableJson(record.path, record.label);
    if (!semanticEqual(existing, record.expected)) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_EXISTING_EVIDENCE_MISMATCH', record.label);
    }
  }
  return 'complete-identical';
}

function reconstructReceipt(compiled, persistenceState) {
  const body = {
    schema: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'succeeded-ten-reviewed-frame-evidence-persisted',
    familyId: compiled.familyId,
    programSha256: compiled.programSha256,
    masteringCampaignReceiptSha256: compiled.masteringCampaignReceiptSha256,
    reviewIntakePlanSha256: compiled.reviewIntakePlanSha256,
    reviewIntakeReceiptSha256: compiled.reviewIntakeReceiptSha256,
    inspectedAt: compiled.inspectedAt,
    frames: compiled.frames.map((frame) => ({
      ordinal: frame.technical.ordinal,
      frameId: frame.technical.frameId,
      finalFrameSha256: frame.technical.finalFrame.sha256,
      technicalInspectionSha256: frame.technical.technicalInspectionSha256,
      creativeApprovalSha256: frame.creative.creativeApprovalSha256,
      reviewer: frame.creative.reviewer,
      reviewDecisionSha256: frame.creative.reviewDecisionSha256,
    })),
    effects: {
      technicalInspectionsCreated: 10,
      humanCreativeApprovalLineageRecordsCreated: 10,
      humanDecisionsCreated: 0,
      automaticCreativeDecisionsMade: 0,
      imagesMutated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    },
    authority: compiled.authority,
  };
  return Object.freeze({
    ...body,
    receiptSha256: sha256Document(body),
    recovery: Object.freeze({
      mode: persistenceState === 'complete-identical' ? 'exact-readback' : 'new-persistence',
      existingEvidenceAcceptedOnlyWhenCompleteAndIdentical: true,
    }),
  });
}

function writeReceipt(outputRoot, receipt) {
  const target = path.join(outputRoot, 'reviewed-frame-evidence.receipt.json');
  if (existsSync(target)) {
    const existing = stableJson(target, 'reviewed-frame evidence receipt');
    if (!semanticEqual(existing, receipt)) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_RECEIPT_MISMATCH');
    }
    return Object.freeze({ path: target, reused: true });
  }
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(receipt, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return Object.freeze({ path: target, reused: false });
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = parseFlags(argv);
    const workspaceRoot = realDirectory(args.get('--workspace-root'), 'workspaceRoot');
    const outputRoot = realDirectory(args.get('--output-root'), 'outputRoot');
    const program = stableJson(args.get('--program'), 'ten-master program');
    const compiled = compileEvaDenseMotionReviewedFrameEvidence({
      tenMasterProgram: program,
      masteringCampaignReceipt: stableJson(
        args.get('--mastering-campaign-receipt'),
        'mastering campaign receipt',
      ),
      reviewIntakePlan: stableJson(args.get('--review-intake-plan'), 'review intake plan'),
      reviewIntakeReceipt: stableJson(
        args.get('--review-intake-receipt'),
        'review intake receipt',
      ),
      workspaceRoot,
      inspectedAt: args.get('--inspected-at'),
    });

    const persistenceState = evidencePersistenceState(program, compiled, workspaceRoot);
    let canonicalReceipt;
    if (persistenceState === 'absent') {
      canonicalReceipt = persistEvaDenseMotionReviewedFrameEvidence({
        tenMasterProgram: program,
        workspaceRoot,
        compiled,
      });
    } else {
      canonicalReceipt = reconstructReceipt(compiled, persistenceState);
      const { recovery, ...withoutRecovery } = canonicalReceipt;
      canonicalReceipt = Object.freeze(withoutRecovery);
    }
    const receipt = reconstructReceipt(compiled, persistenceState);
    if (canonicalReceipt.receiptSha256 !== receipt.receiptSha256) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_RECEIPT_RECONSTRUCTION_MISMATCH');
    }
    const receiptWrite = writeReceipt(outputRoot, receipt);
    process.stdout.write(
      `${JSON.stringify({
        status: receipt.status,
        familyId: receipt.familyId,
        frameCount: receipt.frames.length,
        receiptSha256: receipt.receiptSha256,
        receiptPath: receiptWrite.path,
        receiptReused: receiptWrite.reused,
        persistenceState,
        recovery: receipt.recovery,
        effects: receipt.effects,
        authority: receipt.authority,
      }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'error',
        code: error?.code ?? 'EVA_DENSE_REVIEWED_EVIDENCE_CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  process.exitCode = main();
}
