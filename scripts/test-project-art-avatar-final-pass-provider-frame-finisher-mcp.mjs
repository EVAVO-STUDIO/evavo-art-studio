#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  encodeAvatarProviderFramePng,
  inspectAvatarProviderFramePng,
  sha256FrameFinisherDocument,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  CAPABILITIES_TOOL,
  FINISH_TOOL,
  REVIEW_TOOL,
  handleToolCall,
  toolDefinitions,
} from '../tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs';

function sealed(body, field) {
  return { ...body, [field]: sha256FrameFinisherDocument(body) };
}

function json(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'avatar-frame-finisher-mcp-'));
  const relative = 'scratch/eva/frame/candidate-01.png';
  const candidatePath = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(candidatePath), { recursive: true });
  const pixels = Buffer.alloc(3 * 3 * 4);
  for (let index = 0; index < 9; index += 1) {
    const offset = index * 4;
    if ([1, 3, 4, 5, 7].includes(index)) {
      pixels[offset] = 50;
      pixels[offset + 1] = 100;
      pixels[offset + 2] = 150;
      pixels[offset + 3] = 255;
    } else {
      pixels[offset] = 42;
      pixels[offset + 1] = 22;
      pixels[offset + 2] = 11;
      pixels[offset + 3] = 0;
    }
  }
  const png = encodeAvatarProviderFramePng(3, 3, pixels);
  const inspected = inspectAvatarProviderFramePng(png, 3, 3);
  writeFileSync(candidatePath, png);
  const requestBody = {
    schema: 'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1',
    protocolVersion: '2026-08-13.2',
    requestId: 'avatar-finisher:0123456789abcdef0123456789abcdef01234567',
    materializationId: 'avatar-candidate-materialization:0123456789abcdef0123456789abcdef01234567',
    createdAt: '2026-08-13T09:00:00.000Z',
    sourceCommit: 'e77aba8a7f78c5345b234e9803872723bad8ae43',
    sessionId: 'session',
    characterId: 'eva',
    jobId: 'job',
    frameId: 'frame',
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'key-pose',
    sourceCandidate: {
      path: relative,
      sha256: inspected.sha256,
      bytes: png.length,
      width: 3,
      height: 3,
    },
    reviewedTargetPath: 'reviewed/eva/frame.png',
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
  };
  const request = sealed(requestBody, 'finisherRequestSha256');
  const receiptBody = {
    schema: 'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1',
    protocolVersion: '2026-08-13.2',
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId: request.materializationId,
    output: {
      path: relative,
      reviewedTargetPath: request.reviewedTargetPath,
      sha256: inspected.sha256,
      bytes: png.length,
      width: 3,
      height: 3,
      createOnly: true,
      unapproved: true,
    },
    finisherHandoff: {
      finisherRequestSha256: request.finisherRequestSha256,
    },
  };
  const receipt = sealed(receiptBody, 'materializationSha256');
  const receiptPath = path.join(root, 'records/materialization.json');
  const requestPath = path.join(root, 'records/request.json');
  json(receiptPath, receipt);
  json(requestPath, request);
  return { root, receiptPath, requestPath };
}

test('MCP exposes three bounded path-only tools', () => {
  assert.deepEqual(toolDefinitions().map((entry) => entry.name), [
    CAPABILITIES_TOOL,
    FINISH_TOOL,
    REVIEW_TOOL,
  ]);
  const result = handleToolCall({ name: CAPABILITIES_TOOL, arguments: {} }, {});
  const capabilities = JSON.parse(result.content[0].text);
  assert.equal(capabilities.imageBytesThroughMcp, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.runtimeActivation, false);
});

test('MCP finish remains write-gated', () => {
  const source = fixture();
  assert.throws(
    () => handleToolCall({
      name: FINISH_TOOL,
      arguments: {
        workspaceRoot: source.root,
        materializationReceiptPath: source.receiptPath,
        finisherRequestPath: source.requestPath,
      },
    }, {
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS: source.root,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE: 'false',
    }),
    /ALLOW_WRITE/u,
  );
});

test('write-enabled MCP finishes one exact candidate without byte transport', () => {
  const source = fixture();
  const result = handleToolCall({
    name: FINISH_TOOL,
    arguments: {
      workspaceRoot: source.root,
      materializationReceiptPath: source.receiptPath,
      finisherRequestPath: source.requestPath,
      finishedAt: '2026-08-13T09:01:00.000Z',
    },
  }, {
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS: source.root,
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE: 'true',
  });
  const output = JSON.parse(result.content[0].text);
  assert.equal(output.status, 'frame-finished-awaiting-human-review');
  assert.equal(output.visiblePixelMutation, false);
  assert.equal(output.alphaMutation, false);
  assert.equal(output.runtimeActivation, false);
  assert.equal('imageBytes' in output, false);
});

test('record and workspace root escape attempts are rejected', () => {
  const source = fixture();
  const other = mkdtempSync(path.join(os.tmpdir(), 'avatar-frame-finisher-outside-'));
  assert.throws(
    () => handleToolCall({
      name: FINISH_TOOL,
      arguments: {
        workspaceRoot: other,
        materializationReceiptPath: source.receiptPath,
        finisherRequestPath: source.requestPath,
      },
    }, {
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS: source.root,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE: 'true',
    }),
    /outside/u,
  );
});

console.log('Project Art avatar provider frame-finisher MCP regressions passed.');
