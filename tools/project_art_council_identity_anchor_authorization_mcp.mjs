#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline';

import {
  compileCouncilIdentityAnchorAuthorizationPlan,
  councilIdentityAnchorAuthorizationCapabilities,
} from '../scripts/project-art/council-identity-anchor-authorization.mjs';

const SERVER_NAME = 'evavo-project-art-council-identity-anchor-authorization';
const SERVER_VERSION = '1.0.0';
const MAXIMUM_MESSAGE_BYTES = 64 * 1024;

function text(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

function tools() {
  return [
    {
      name: 'evavo_art_council_identity_anchor_authorization_capabilities',
      description:
        'Return the V4.6 compile-only capabilities for eight separate, time-bounded, one-shot Council anchor provider authorizations. This grants no provider execution, candidate approval, publication or activation authority.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_authorization_plan',
      description:
        'Compile the deterministic V4.6 plan for binding the exact V4.5 eight-admission bundle to a named-human authorization review. This tool performs no authorization mutation and no provider call.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

function call(params) {
  if (
    params?.name ===
    'evavo_art_council_identity_anchor_authorization_capabilities'
  ) {
    return {
      content: text(councilIdentityAnchorAuthorizationCapabilities()),
      isError: false,
    };
  }
  if (
    params?.name === 'evavo_art_council_identity_anchor_authorization_plan'
  ) {
    return {
      content: text(compileCouncilIdentityAnchorAuthorizationPlan()),
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
