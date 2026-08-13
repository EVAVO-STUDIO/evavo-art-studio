#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  avatarProviderFrameFinisherCapabilities,
  finishAvatarFinalPassProviderFrameFiles,
  reviewAvatarFinalPassProviderFrameFiles,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';

function parsePairs(values) {
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

export function runAvatarProviderFrameFinisherCli(
  argv = process.argv.slice(2),
) {
  const command = argv[0];
  if (command === 'capabilities') {
    if (argv.length !== 1) throw new Error('capabilities takes no arguments');
    return avatarProviderFrameFinisherCapabilities();
  }
  const values = parsePairs(argv.slice(1));
  if (command === 'finish') {
    const result = finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: required(values, '--workspace-root'),
      materializationReceiptPath: required(values, '--materialization'),
      finisherRequestPath: required(values, '--finisher-request'),
      ...(values.get('--finished-at')
        ? { finishedAt: values.get('--finished-at') }
        : {}),
    });
    return {
      status: result.status,
      reused: result.reused,
      finishedFramePath: result.finishedFramePath,
      reportPath: result.reportPath,
      reviewRequestPath: result.reviewRequestPath,
      frameFinisherSha256: result.report.frameFinisherSha256,
      reviewRequestSha256: result.reviewRequest.reviewRequestSha256,
    };
  }
  if (command === 'review') {
    const result = reviewAvatarFinalPassProviderFrameFiles({
      workspaceRoot: required(values, '--workspace-root'),
      frameFinisherReportPath: required(values, '--finisher-report'),
      frameReviewRequestPath: required(values, '--review-request'),
      frameReviewDecisionPath: required(values, '--decision'),
      ...(values.get('--reviewed-at')
        ? { reviewedAt: values.get('--reviewed-at') }
        : {}),
    });
    return {
      status: result.status,
      reused: result.reused,
      outcomePath: result.outcomePath,
      reviewOutcomeSha256: result.outcome.reviewOutcomeSha256,
      finalFrameSha256: result.outcome.finalFrameSha256,
      dependentInbetweenEndpointAllowed:
        result.outcome.dependentInbetweenEndpointAllowed,
      sequenceDraftUseAllowed: result.outcome.sequenceDraftUseAllowed,
      sequenceReleaseAllowed: false,
      runtimeActivationAllowed: false,
    };
  }
  throw new Error('command must be capabilities, finish or review');
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runAvatarProviderFrameFinisherCli())}\n`,
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
