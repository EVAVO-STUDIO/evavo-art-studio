#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileEvaAvatarAnimationProductionFiles,
  compileEvaAvatarRepairJob,
  evaAvatarProductionCapabilities,
  inspectEvaAvatarAnimationProductionStatus,
  reviewEvaAvatarClip,
  reviewEvaAvatarFrame,
  sealEvaAvatarSequenceRelease,
  writeEvaAvatarProviderAuthorization,
  writeJsonCreateOnly,
} from './project-art/eva-avatar-animation-production.mjs';

function parsePairs(values) {
  if (values.length % 2 !== 0) throw new Error('arguments must be --name value pairs');
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      typeof name !== 'string' ||
      !name.startsWith('--') ||
      typeof value !== 'string' ||
      value.startsWith('--') ||
      result.has(name)
    ) {
      throw new Error('arguments must be unique --name value pairs');
    }
    result.set(name, value);
  }
  return result;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function optional(values, name) {
  return values.get(name);
}

function commaList(value, label) {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) throw new Error(`${label} must not be empty`);
  return entries;
}

function notes(values) {
  const direct = optional(values, '--notes');
  const file = optional(values, '--notes-file');
  if (direct && file) throw new Error('use either --notes or --notes-file, not both');
  if (file) return readFileSync(path.resolve(file), 'utf8').trim();
  return direct ?? '';
}

function usage() {
  return [
    'EVA avatar animation production',
    '',
    'Commands:',
    '  capabilities',
    '  compile --profile <profile.json> --analysis-root <dir> --output <plan.json> [--compiled-at <ISO>]',
    '  status --plan <plan.json> --receipt-root <dir> [--output <status.json>]',
    '  authorize --plan <plan.json> --receipt-root <dir> --jobs <id,id> --actor-id <human> --authorized-at <ISO> --expires-at <ISO> --evidence-sha256 <sha> --allowed-adapters <id,id> --reason <text> --output <authorization.json>',
    '  review-frame --plan <plan.json> --receipt-root <dir> --frame-id <id> --finished <png> --actor-id <human> --reviewed-at <ISO> --evidence-sha256 <sha> --outcome <frame-admitted|repair-required|frame-rejected> --technical <pass|fail|not-applicable> --hands <...> --anatomy <...> --identity <...> --alpha <...> --registration <...> --continuity <...> --loop <...> (--notes <text> | --notes-file <file>)',
    '  repair-job --plan <plan.json> --receipt-root <dir> --frame-review <receipt.json> [--target <relative.png>] [--compiled-at <ISO>]',
    '  review-clip --plan <plan.json> --receipt-root <dir> --clip-qa <qa.json> --actor-id <human> --reviewed-at <ISO> --evidence-sha256 <sha> --outcome <clip-admitted|clip-repair-required> --continuity <pass|fail|not-applicable> --loop <...> --timing <...> (--notes <text> | --notes-file <file>)',
    '  seal --plan <plan.json> --receipt-root <dir> --art-approver-id <human> --animation-approver-id <human> --sealed-at <ISO> --art-evidence-sha256 <sha> --animation-evidence-sha256 <sha> (--notes <text> | --notes-file <file>)',
  ].join('\n');
}

export function runEvaAvatarAnimationProductionCli(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'capabilities';
  if (command === 'capabilities') {
    if (argv.length !== 1) throw new Error('capabilities takes no arguments');
    return evaAvatarProductionCapabilities();
  }
  const values = parsePairs(argv.slice(1));
  if (command === 'compile') {
    const result = compileEvaAvatarAnimationProductionFiles({
      profilePath: required(values, '--profile'),
      analysisRoot: required(values, '--analysis-root'),
      outputPath: required(values, '--output'),
      ...(optional(values, '--compiled-at')
        ? { compiledAt: optional(values, '--compiled-at') }
        : {}),
    });
    return {
      status: 'production-plan-compiled',
      schema: result.plan.schema,
      productionId: result.plan.productionId,
      planSha256: result.plan.planSha256,
      counts: result.plan.counts,
      output: result.output,
      providerExecution: false,
      productionReady: false,
      runtimeActivationAllowed: false,
    };
  }
  if (command === 'status') {
    const result = inspectEvaAvatarAnimationProductionStatus({
      planPath: required(values, '--plan'),
      receiptRoot: required(values, '--receipt-root'),
    });
    const output = optional(values, '--output');
    if (output) writeJsonCreateOnly(output, result);
    return { ...result, ...(output ? { output: path.resolve(output) } : {}) };
  }
  if (command === 'authorize') {
    const result = writeEvaAvatarProviderAuthorization(
      {
        planPath: required(values, '--plan'),
        receiptRoot: required(values, '--receipt-root'),
        jobIds: commaList(required(values, '--jobs'), '--jobs'),
        actorId: required(values, '--actor-id'),
        authorizedAt: required(values, '--authorized-at'),
        expiresAt: required(values, '--expires-at'),
        evidenceSha256: required(values, '--evidence-sha256'),
        allowedAdapterIds: commaList(
          required(values, '--allowed-adapters'),
          '--allowed-adapters',
        ),
        reason: required(values, '--reason'),
      },
      required(values, '--output'),
    );
    return {
      status: 'provider-run-authorized',
      authorizationId: result.authorization.authorizationId,
      authorizationSha256: result.authorization.authorizationSha256,
      jobs: result.authorization.jobs.length,
      expiresAt: result.authorization.expiresAt,
      output: result.output,
    };
  }
  if (command === 'review-frame') {
    const result = reviewEvaAvatarFrame({
      planPath: required(values, '--plan'),
      receiptRoot: required(values, '--receipt-root'),
      frameId: required(values, '--frame-id'),
      finishedPath: required(values, '--finished'),
      actorId: required(values, '--actor-id'),
      reviewedAt: required(values, '--reviewed-at'),
      evidenceSha256: required(values, '--evidence-sha256'),
      outcome: required(values, '--outcome'),
      gates: {
        technical: required(values, '--technical'),
        handsAndFingers: required(values, '--hands'),
        anatomy: required(values, '--anatomy'),
        faceIdentity: required(values, '--identity'),
        alphaAndBackground: required(values, '--alpha'),
        silhouetteAndRegistration: required(values, '--registration'),
        adjacentFrameContinuity: required(values, '--continuity'),
        loopClosure: required(values, '--loop'),
      },
      notes: notes(values),
    });
    return {
      status: result.receipt.outcome,
      frameId: result.receipt.frameId,
      frameReviewSha256: result.receipt.frameReviewSha256,
      dependentInbetweenEndpointAllowed:
        result.receipt.dependentInbetweenEndpointAllowed,
      output: result.output,
    };
  }
  if (command === 'repair-job') {
    const result = compileEvaAvatarRepairJob({
      planPath: required(values, '--plan'),
      receiptRoot: required(values, '--receipt-root'),
      frameReviewReceiptPath: required(values, '--frame-review'),
      ...(optional(values, '--target')
        ? { targetPath: optional(values, '--target') }
        : {}),
      ...(optional(values, '--compiled-at')
        ? { compiledAt: optional(values, '--compiled-at') }
        : {}),
    });
    return {
      status: 'bounded-provider-redraw-job-compiled',
      jobId: result.job.jobId,
      repairJobSha256: result.job.repairJobSha256,
      output: result.output,
      providerExecution: false,
    };
  }
  if (command === 'review-clip') {
    const result = reviewEvaAvatarClip({
      planPath: required(values, '--plan'),
      receiptRoot: required(values, '--receipt-root'),
      clipQaPath: required(values, '--clip-qa'),
      actorId: required(values, '--actor-id'),
      reviewedAt: required(values, '--reviewed-at'),
      evidenceSha256: required(values, '--evidence-sha256'),
      outcome: required(values, '--outcome'),
      transitionContinuity: required(values, '--continuity'),
      loopClosure: required(values, '--loop'),
      finalTiming: required(values, '--timing'),
      notes: notes(values),
    });
    return {
      status: result.receipt.outcome,
      clipId: result.receipt.clipId,
      clipReviewSha256: result.receipt.clipReviewSha256,
      sequenceReleaseEligible: result.receipt.sequenceReleaseEligible,
      output: result.output,
    };
  }
  if (command === 'seal') {
    const result = sealEvaAvatarSequenceRelease({
      planPath: required(values, '--plan'),
      receiptRoot: required(values, '--receipt-root'),
      artApproverId: required(values, '--art-approver-id'),
      animationApproverId: required(values, '--animation-approver-id'),
      sealedAt: required(values, '--sealed-at'),
      artEvidenceSha256: required(values, '--art-evidence-sha256'),
      animationEvidenceSha256: required(
        values,
        '--animation-evidence-sha256',
      ),
      notes: notes(values),
    });
    return {
      status: result.release.status,
      releaseSha256: result.release.releaseSha256,
      runtimeActivationAllowed: false,
      output: result.output,
    };
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runEvaAvatarAnimationProductionCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        ...(error?.code ? { code: error.code } : {}),
      })}\n`,
    );
    process.exitCode = 2;
  }
}
