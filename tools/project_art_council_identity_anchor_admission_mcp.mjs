#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline';

import {
  compileCouncilIdentityAnchorAdmissionPlan,
  councilIdentityAnchorAdmissionCapabilities,
  createCouncilIdentityAnchorAdmissionReviewTemplate,
} from '../scripts/project-art/council-identity-anchor-admission.mjs';

const SERVER_NAME = 'evavo-project-art-council-identity-anchor-admission';
const SERVER_VERSION = '1.0.0';
const MAXIMUM_MESSAGE_BYTES = 64 * 1024;

function text(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

function tools() {
  return [
    {
      name: 'evavo_art_council_identity_anchor_admission_capabilities',
      description:
        'Return bounded V4.5 capabilities for compiling exactly eight Council identity anchor provider admissions after named-human review. No provider authorization or execution is performed.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_admission_plan',
      description:
        'Compile the deterministic read-only eight-anchor admission plan bound to the current Veyra and Moro Pell candidate campaign.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_admission_review_template',
      description:
        'Return the exact named-human review template required before eight anchor provider admissions may be compiled. This template grants no provider authorization, execution, approval or activation authority.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

function call(params) {
  if (
    params?.name ===
    'evavo_art_council_identity_anchor_admission_capabilities'
  ) {
    return {
      content: text(councilIdentityAnchorAdmissionCapabilities()),
      isError: false,
    };
  }
  if (params?.name === 'evavo_art_council_identity_anchor_admission_plan') {
    return {
      content: text(compileCouncilIdentityAnchorAdmissionPlan()),
      isError: false,
    };
  }
  if (
    params?.name ===
    'evavo_art_council_identity_anchor_admission_review_template'
  ) {
    return {
      content: text(createCouncilIdentityAnchorAdmissionReviewTemplate()),
      isError: false,
    };
  }
  throw new Error(`Unknown tool: ${String(params?.name ?? '')}`);
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function reject(id, error) {
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

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  if (Buffer.byteLength(line, 'utf8') > MAXIMUM_MESSAGE_BYTES) {
    reject(null, new Error('MCP message exceeds bounded input size.'));
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      throw new Error('Invalid JSON-RPC request.');
    }
    if (message.method === 'initialize') {
      respond(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    }
    if (message.method === 'notifications/initialized') return;
    if (message.method === 'ping') {
      respond(message.id, {});
      return;
    }
    if (message.method === 'tools/list') {
      respond(message.id, { tools: tools() });
      return;
    }
    if (message.method === 'tools/call') {
      respond(message.id, call(message.params));
      return;
    }
    throw new Error(`Unsupported method: ${message.method}`);
  } catch (error) {
    reject(message?.id ?? null, error);
  }
});
