#!/usr/bin/env node

import readline from 'node:readline';
import {
  TRUSTED_COLOUR_REFERENCE_PROVENANCE,
  classifyExistingImageRequest,
  planExistingImageRestorationIntake,
} from './lib/existing_image_restoration_intake.mjs';

const SERVER_NAME = 'evavo-existing-image-restoration-intake';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2025-03-26';
const PROVIDER_ENV = 'EVAVO_REFERENCE_COLOUR_RESTORATION_PROVIDER';

const bindingSchema = Object.freeze({
  type: 'object',
  properties: {
    path: { type: 'string', minLength: 1 },
    sha256: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' },
    provenance: { type: 'string', minLength: 1 },
    referenceIsRealPhotograph: { type: 'boolean' },
    subjectMatchConfirmedByHuman: { type: 'boolean' },
  },
  required: ['path'],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: 'evavo_existing_image_restoration_intake_capabilities',
    description: 'Describe the fail-closed intake and routing contract for source-preserving restoration, cleanup, upscale assurance and real-reference portrait colour restoration.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: 'evavo_classify_existing_image_request',
    description: 'Classify an image request as colour restoration, restoration, cleanup, upscale, generative or unknown. Supports UK/US colourise/colorize spellings and explicit no-colour instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1 },
        sourcePresent: { type: 'boolean' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: 'evavo_plan_existing_image_restoration_intake',
    description: 'Create a non-executing, fail-closed route for an existing-image request. Colour restoration requires an immutable source plus a distinct real colour photograph with trusted provenance and human-confirmed same-subject match. No generative fallback, automatic creative approval, source overwrite or candidate selection is granted.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1 },
        source: bindingSchema,
        colourReference: bindingSchema,
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  }),
]);

function configuredProviderId() {
  return String(process.env[PROVIDER_ENV] ?? '').trim();
}

function capabilities() {
  return Object.freeze({
    contract: 'evavo.existing-image-restoration-intake.v1',
    serverVersion: SERVER_VERSION,
    modes: ['colour-restoration', 'restoration', 'cleanup', 'upscale', 'generative', 'unknown'],
    trustedColourReferenceProvenance: TRUSTED_COLOUR_REFERENCE_PROVENANCE,
    sourceMutationAllowed: false,
    generativeFallbackAllowed: false,
    automaticCreativeApprovalAllowed: false,
    humanFinalSelectionRequired: true,
    qaMayRejectCandidates: true,
    qaMaySelectWinner: false,
    referenceColourRestorationProviderConfigured: Boolean(configuredProviderId()),
  });
}

async function callTool(name, args) {
  if (name === 'evavo_existing_image_restoration_intake_capabilities') return capabilities();
  if (name === 'evavo_classify_existing_image_request') {
    return classifyExistingImageRequest(args?.prompt, { sourcePresent: args?.sourcePresent === true });
  }
  if (name === 'evavo_plan_existing_image_restoration_intake') {
    return planExistingImageRestorationIntake(args ?? {}, {
      referenceColourRestorationProviderId: configuredProviderId(),
    });
  }
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

const response = (id, result) => ({ jsonrpc: '2.0', id, result });
const toolResult = (payload, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
  isError,
});

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    let outgoing;
    if (message.method === 'initialize') {
      outgoing = response(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    } else if (message.method === 'notifications/initialized') outgoing = null;
    else if (message.method === 'tools/list') outgoing = response(message.id, { tools });
    else if (message.method === 'tools/call') {
      try {
        outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {})));
      } catch (error) {
        outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true));
      }
    } else {
      outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    }
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)))}\n`);
  }
}
