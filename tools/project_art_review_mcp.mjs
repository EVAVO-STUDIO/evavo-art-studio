#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  ProjectArtReviewError,
  buildProjectArtReviewBundleFile,
  compileProjectArtReviewFile,
  finalizeProjectArtReviewFiles,
  projectArtReviewCapabilities,
} from '../scripts/project-art/review-studio.mjs';

const artStudioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function booleanEnvironment(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function configuredRoots() {
  const raw = process.env.EVAVO_ART_REVIEW_ROOTS;
  if (!raw) return [artStudioRoot];
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const roots = raw.split(delimiter).map((entry) => entry.trim()).filter(Boolean).map((entry) => path.resolve(entry));
  if (roots.length < 1) throw new Error('EVAVO_ART_REVIEW_ROOTS is empty.');
  return [...new Set([artStudioRoot, ...roots])];
}

const allowedRoots = configuredRoots();
const writeEnabled = booleanEnvironment('EVAVO_ART_REVIEW_MCP_ALLOW_WRITE', false);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function confined(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required.`);
  const candidate = path.resolve(value);
  if (!allowedRoots.some((root) => inside(root, candidate))) {
    throw new Error(`${label} is outside EVAVO_ART_REVIEW_ROOTS.`);
  }
  return candidate;
}

function requireWrite() {
  if (!writeEnabled) {
    throw new Error(
      'Review writes are disabled. Set EVAVO_ART_REVIEW_MCP_ALLOW_WRITE=true on the trusted local MCP deployment.',
    );
  }
}

const pathField = { type: 'string', minLength: 1, maxLength: 32768 };
const objectSchema = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});

const tools = Object.freeze([
  {
    name: 'evavo_art_review_capabilities',
    description:
      'Describe the offline, source-bound project-art review studio. This tool performs no read or write outside configuration metadata.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'evavo_art_compile_review',
    description:
      'Compile exact local image paths into a self-hashed review plan. Image bytes remain outside MCP. Requires the explicit review write gate.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        requestPath: pathField,
        planPath: pathField,
        compiledAt: { type: 'string', minLength: 24, maxLength: 64 },
      },
      ['workspaceRoot', 'requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_build_review',
    description:
      'Build a create-only offline review bundle for grid, split, overlay, difference, flicker and animation inspection. Requires the explicit review write gate.',
    inputSchema: objectSchema(
      {
        planPath: pathField,
        outputRoot: pathField,
      },
      ['planPath', 'outputRoot'],
    ),
  },
  {
    name: 'evavo_art_finalize_review',
    description:
      'Validate an exported review draft against the exact plan and create sealed decisions plus a receipt. This does not approve, promote, mutate a repository, deploy or publish.',
    inputSchema: objectSchema(
      {
        planPath: pathField,
        decisionsPath: pathField,
        outputRoot: pathField,
      },
      ['planPath', 'decisionsPath', 'outputRoot'],
    ),
  },
]);

function summary(value) {
  return {
    ...value,
    bytesFlowThroughMcp: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    publication: false,
  };
}

async function callTool(name, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool arguments must be an object.');
  }
  if (name === 'evavo_art_review_capabilities') {
    return summary(projectArtReviewCapabilities());
  }
  requireWrite();
  if (name === 'evavo_art_compile_review') {
    const plan = await compileProjectArtReviewFile(
      confined(input.requestPath, 'requestPath'),
      confined(input.planPath, 'planPath'),
      {
        workspaceRoot: confined(input.workspaceRoot, 'workspaceRoot'),
        ...(input.compiledAt ? { compiledAt: String(input.compiledAt) } : {}),
      },
    );
    return summary({
      schema: plan.schema,
      reviewId: plan.reviewId,
      projectId: plan.projectId,
      groupCount: plan.groups.length,
      itemCount: plan.sourceSummary.itemCount,
      planSha256: plan.planSha256,
    });
  }
  if (name === 'evavo_art_build_review') {
    const result = await buildProjectArtReviewBundleFile(
      confined(input.planPath, 'planPath'),
      confined(input.outputRoot, 'outputRoot'),
    );
    return summary({
      schema: result.manifest.schema,
      reviewId: result.manifest.reviewId,
      manifestSha256: result.manifest.manifestSha256,
      receiptSha256: result.receipt.receiptSha256,
      outputRoot: result.outputRoot,
      offline: true,
    });
  }
  if (name === 'evavo_art_finalize_review') {
    const result = await finalizeProjectArtReviewFiles(
      confined(input.planPath, 'planPath'),
      confined(input.decisionsPath, 'decisionsPath'),
      confined(input.outputRoot, 'outputRoot'),
    );
    return summary({
      schema: result.receipt.schema,
      reviewId: result.receipt.reviewId,
      decisionSha256: result.decisions.decisionSha256,
      receiptSha256: result.receipt.receiptSha256,
      dispositionCounts: result.receipt.dispositionCounts,
      outputRoot: result.outputRoot,
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
      data: error instanceof ProjectArtReviewError ? { code: error.code } : undefined,
    },
  })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.method === 'initialize') {
      response(request.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'evavo-project-art-review', version: '1.0.0' },
      });
    } else if (request.method === 'notifications/initialized') {
      // Notification: no response.
    } else if (request.method === 'tools/list') {
      response(request.id, { tools });
    } else if (request.method === 'tools/call') {
      const result = await callTool(request.params?.name, request.params?.arguments ?? {});
      response(request.id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: false,
      });
    } else {
      errorResponse(request.id, new Error(`Unsupported method: ${request.method}`));
    }
  } catch (error) {
    if (request?.id !== undefined) errorResponse(request.id, error);
  }
}
