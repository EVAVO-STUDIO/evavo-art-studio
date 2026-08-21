#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline';

import {
  compileCouncilAvatarProductionProgram,
  councilAvatarProductionCapabilities,
} from '../scripts/project-art/council-avatar-production-program.mjs';
import {
  compileCouncilAvatarProceduralReview,
  councilAvatarProceduralReviewCapabilities,
} from '../scripts/project-art/council-avatar-procedural-review.mjs';
import {
  compileCouncilIdentityCandidateCampaign,
  councilIdentityCandidateCampaignCapabilities,
} from '../scripts/project-art/council-identity-candidate-campaign.mjs';
import {
  compileCouncilIdentityAnchorAdmissionPlan,
  councilIdentityAnchorAdmissionCapabilities,
  createCouncilIdentityAnchorAdmissionReviewTemplate,
} from '../scripts/project-art/council-identity-anchor-admission.mjs';
import {
  compileCouncilIdentityAnchorAuthorizationPlan,
  councilIdentityAnchorAuthorizationCapabilities,
} from '../scripts/project-art/council-identity-anchor-authorization.mjs';
import { compileCouncilAvatarMediaReadiness } from '../scripts/project-art/council-avatar-media-readiness.mjs';

const SERVER_NAME = 'evavo-project-art-council-avatar-production';
const SERVER_VERSION = '1.1.0';
const MAXIMUM_MESSAGE_BYTES = 64 * 1024;

function text(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

function tools() {
  return [
    {
      name: 'evavo_art_council_avatar_production_capabilities',
      description:
        'Return the canonical four-seat Council avatar identity and authored-animation production standard.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_avatar_production_program',
      description:
        'Compile the deterministic plan-only Council avatar production program, including identity briefs, procedural previsualisation evidence and the shared animation standard.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_avatar_procedural_review_capabilities',
      description:
        'Return bounded capabilities for the deterministic code-authored Council motion and atlas review surface. It grants no identity approval, production admission, publication, Runtime activation or website activation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_avatar_procedural_review',
      description:
        'Compile the exact V4.3 procedural review contract for Top Hat Man, EVA, Veyra, Moro Pell and preview-only guest arbiter Nymm, including source hashes and local commands. This is previsualisation only and never an identity master.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_candidate_campaign_capabilities',
      description:
        'Return the V4.4 compile-only Council identity candidate campaign capabilities: two characters, eight anchor jobs, sixteen dependent continuity-view jobs and no provider admission, authorization, execution, approval, publication or activation authority.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_candidate_campaign',
      description:
        'Compile the exact repository-bound V4.4 24-job identity candidate campaign for Veyra and Moro Pell. All eight full-body-right anchors precede the sixteen same-set dependent views. This tool performs no provider call or approval.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_admission_capabilities',
      description:
        'Return the V4.5 compile-only capabilities for named-human review and compilation of exactly eight full-body-right provider admissions. No provider authorization or execution is granted.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_admission_plan',
      description:
        'Compile the exact repository-bound V4.5 plan for the eight Veyra and Moro Pell full-body-right anchor admissions. Dependent views, provider authorization and execution remain blocked.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_council_identity_anchor_admission_review_template',
      description:
        'Return the exact V4.5 named-human review template required before eight anchor provider admissions may be compiled. The template grants no provider authorization, execution, approval, publication or activation authority.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
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
    {
      name: 'evavo_art_council_avatar_media_readiness',
      description:
        'Return the deterministic read-only Council avatar media stage, exact blockers, available command surfaces and missing governed evidence for all four characters. This tool never executes providers, approves media, publishes assets or activates Runtime/website animation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

function call(params) {
  if (params?.name === 'evavo_art_council_avatar_production_capabilities') {
    return { content: text(councilAvatarProductionCapabilities()), isError: false };
  }
  if (params?.name === 'evavo_art_council_avatar_production_program') {
    return { content: text(compileCouncilAvatarProductionProgram()), isError: false };
  }
  if (
    params?.name === 'evavo_art_council_avatar_procedural_review_capabilities'
  ) {
    return {
      content: text(councilAvatarProceduralReviewCapabilities()),
      isError: false,
    };
  }
  if (params?.name === 'evavo_art_council_avatar_procedural_review') {
    return { content: text(compileCouncilAvatarProceduralReview()), isError: false };
  }
  if (
    params?.name ===
    'evavo_art_council_identity_candidate_campaign_capabilities'
  ) {
    return {
      content: text(councilIdentityCandidateCampaignCapabilities()),
      isError: false,
    };
  }
  if (params?.name === 'evavo_art_council_identity_candidate_campaign') {
    return {
      content: text(compileCouncilIdentityCandidateCampaign()),
      isError: false,
    };
  }
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
  if (params?.name === 'evavo_art_council_avatar_media_readiness') {
    return { content: text(compileCouncilAvatarMediaReadiness()), isError: false };
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
