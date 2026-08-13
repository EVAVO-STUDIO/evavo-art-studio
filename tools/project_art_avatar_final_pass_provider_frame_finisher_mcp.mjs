#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  avatarProviderFrameFinisherCapabilities,
  finishAvatarFinalPassProviderFrameFiles,
  reviewAvatarFinalPassProviderFrameFiles,
} from '../scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs';

export const SERVER_NAME =
  'evavo-project-art-avatar-final-pass-provider-frame-finisher';
export const SERVER_VERSION = '1.0.0';
export const CAPABILITIES_TOOL =
  'evavo_art_avatar_final_pass_provider_frame_finisher_capabilities';
export const FINISH_TOOL =
  'evavo_art_finish_avatar_final_pass_provider_candidate';
export const REVIEW_TOOL =
  'evavo_art_review_avatar_final_pass_provider_frame';
const MAXIMUM_MESSAGE_BYTES = 256 * 1024;

function roots(environment) {
  const raw =
    environment.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS ?? '';
  const values = raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (!values.length) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS must contain at least one existing directory.',
    );
  }
  return values;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function workspaceRoot(value, allowedRoots) {
  if (typeof value !== 'string' || !value) {
    throw new Error('workspaceRoot is required.');
  }
  const resolved = realpathSync(path.resolve(value));
  if (!allowedRoots.some((root) => isInside(root, resolved))) {
    throw new Error('workspaceRoot is outside the configured finisher roots.');
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('workspaceRoot must be a real directory.');
  }
  return resolved;
}

function existingFile(value, label, allowedRoots) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is required.`);
  }
  const resolved = realpathSync(path.resolve(value));
  if (!allowedRoots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} is outside the configured finisher roots.`);
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular file.`);
  }
  return resolved;
}

function textContent(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

export function toolDefinitions() {
  const pathProperty = { type: 'string', minLength: 1 };
  return Object.freeze([
    {
      name: CAPABILITIES_TOOL,
      description:
        'Return the bounded deterministic frame-finishing and named-human review capabilities. No image bytes flow through MCP.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: FINISH_TOOL,
      description:
        'Finish one exact materialized provider candidate by clearing only hidden RGB beneath fully transparent pixels, preserving visible pixels, alpha, canvas and registration, then publish a create-only report and human-review request.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'workspaceRoot',
          'materializationReceiptPath',
          'finisherRequestPath',
        ],
        properties: {
          workspaceRoot: pathProperty,
          materializationReceiptPath: pathProperty,
          finisherRequestPath: pathProperty,
          finishedAt: { type: 'string', minLength: 1 },
        },
      },
    },
    {
      name: REVIEW_TOOL,
      description:
        'Admit, repair-route or reject one exact finished frame from a named-human decision and exact native-scale, contact-sheet, identity, adjacent-frame and loop evidence. Sequence release and runtime activation remain unavailable.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'workspaceRoot',
          'frameFinisherReportPath',
          'frameReviewRequestPath',
          'frameReviewDecisionPath',
        ],
        properties: {
          workspaceRoot: pathProperty,
          frameFinisherReportPath: pathProperty,
          frameReviewRequestPath: pathProperty,
          frameReviewDecisionPath: pathProperty,
          reviewedAt: { type: 'string', minLength: 1 },
        },
      },
    },
  ]);
}

export function handleToolCall(params, environment = process.env) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === CAPABILITIES_TOOL) {
    return {
      content: textContent(avatarProviderFrameFinisherCapabilities()),
      isError: false,
    };
  }
  if (name !== FINISH_TOOL && name !== REVIEW_TOOL) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (
    environment
      .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE !==
    'true'
  ) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE must be true.',
    );
  }
  const allowedRoots = roots(environment);
  const root = workspaceRoot(args.workspaceRoot, allowedRoots);
  if (name === FINISH_TOOL) {
    const result = finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: root,
      materializationReceiptPath: existingFile(
        args.materializationReceiptPath,
        'materializationReceiptPath',
        allowedRoots,
      ),
      finisherRequestPath: existingFile(
        args.finisherRequestPath,
        'finisherRequestPath',
        allowedRoots,
      ),
      ...(args.finishedAt ? { finishedAt: args.finishedAt } : {}),
    });
    return {
      content: textContent({
        status: result.status,
        reused: result.reused,
        finishedFramePath: result.finishedFramePath,
        reportPath: result.reportPath,
        reviewRequestPath: result.reviewRequestPath,
        frameFinisherSha256: result.report.frameFinisherSha256,
        visiblePixelMutation: false,
        alphaMutation: false,
        creativeApproval: false,
        sequenceRelease: false,
        runtimeActivation: false,
      }),
      isError: false,
    };
  }
  const result = reviewAvatarFinalPassProviderFrameFiles({
    workspaceRoot: root,
    frameFinisherReportPath: existingFile(
      args.frameFinisherReportPath,
      'frameFinisherReportPath',
      allowedRoots,
    ),
    frameReviewRequestPath: existingFile(
      args.frameReviewRequestPath,
      'frameReviewRequestPath',
      allowedRoots,
    ),
    frameReviewDecisionPath: existingFile(
      args.frameReviewDecisionPath,
      'frameReviewDecisionPath',
      allowedRoots,
    ),
    ...(args.reviewedAt ? { reviewedAt: args.reviewedAt } : {}),
  });
  return {
    content: textContent({
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
    }),
    isError: false,
  };
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`,
  );
}

export function startServer() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > MAXIMUM_MESSAGE_BYTES) {
      errorResponse(null, new Error('MCP message exceeds the bounded input size.'));
      return;
    }
    let message;
    try {
      message = JSON.parse(line);
      if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        throw new Error('Invalid JSON-RPC request.');
      }
      if (message.method === 'initialize') {
        response(message.id, {
          protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
        return;
      }
      if (message.method === 'notifications/initialized') return;
      if (message.method === 'ping') {
        response(message.id, {});
        return;
      }
      if (message.method === 'tools/list') {
        response(message.id, { tools: toolDefinitions() });
        return;
      }
      if (message.method === 'tools/call') {
        response(message.id, handleToolCall(message.params));
        return;
      }
      throw new Error(`Unsupported method: ${message.method}`);
    } catch (error) {
      errorResponse(message?.id ?? null, error);
    }
  });
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) startServer();
