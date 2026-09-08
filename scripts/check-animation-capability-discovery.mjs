#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');
const capabilities = JSON.parse(read('evavo.capabilities.json'));
const byId = new Map(capabilities.capabilities.map(item => [item.id, item]));
const ids = [
  'art.animation.pipeline',
  'art.animation.frame-ledger',
  'art.animation.delivery',
  'art.animation.character-family-preflight',
  'art.animation.execution-supervisor',
];
for (const id of ids) assert.ok(byId.has(id), `Missing animation capability ${id}`);

for (const path of [
  'docs/ANIMATION_CONTROL_PLANE.md',
  'tools/animation_pipeline_control_plane_v1_1_mcp.mjs',
  'tools/animation_production_profile_canonical_v1_mcp.mjs',
  'tools/animation_frame_work_ledger_v1_mcp.mjs',
  'tools/animation_sequence_delivery_canonical_v1_mcp.mjs',
  'tools/animation_character_family_campaign_preflight_v1.mjs',
  'scripts/start-animation-execution-supervisor-mcp-v1.mjs',
  '.mcp.animation-pipeline-v1.json',
  '.mcp.animation-production-canonical-v1.json',
  '.mcp.animation-frame-ledger-v1.json',
  '.mcp.animation-character-family-campaign-preflight-v1.json',
  '.mcp.animation-execution-supervisor-v1.json',
]) assert.equal(existsSync(join(root, path)), true, `Missing animation discovery surface ${path}`);

const pipeline = read('tools/animation_pipeline_control_plane_v1_1_mcp.mjs');
for (const marker of [
  'providerExecution: false',
  'automaticCreativeApproval: false',
  'artifactPromotion: false',
  'targetRepositoryMutation: false',
  'runtimeActivation: false',
  'publication: false',
  'camera-aware-production-profile',
  'independent-moving-sequence-review',
  'native-runtime-acceptance-where-required',
]) assert.ok(pipeline.includes(marker), `Animation pipeline invariant missing: ${marker}`);

const ledger = read('tools/animation_frame_work_ledger_v1_mcp.mjs');
for (const marker of [
  'providerExecution: false',
  'automaticCreativeApproval: false',
  'artifactPromotion: false',
  'A same-revision batch is applied atomically',
  'Only Cel Animation Studio records independent review decisions',
]) assert.ok(ledger.includes(marker), `Animation frame-ledger invariant missing: ${marker}`);

const delivery = read('tools/animation_sequence_delivery_canonical_v1_mcp.mjs');
for (const marker of [
  'exact PNG bindings',
  'separate named creative approval',
  'path-free Godot, Cel and Video delivery plans',
  'disabled interpolation by default',
]) assert.ok(delivery.includes(marker), `Animation delivery invariant missing: ${marker}`);

const preflight = read('tools/animation_character_family_campaign_preflight_v1.mjs');
for (const marker of [
  'executesAdapters:false',
  'ANIMATION_FAMILY_PREFLIGHT_SHELL_COMMAND_FORBIDDEN',
  'ANIMATION_FAMILY_PREFLIGHT_IMPLEMENTATION_DIGEST_MISMATCH',
  'ANIMATION_FAMILY_PREFLIGHT_CREDENTIAL_KEY_FORBIDDEN',
]) assert.ok(preflight.includes(marker), `Animation family-preflight invariant missing: ${marker}`);

const supervisor = read('scripts/start-animation-execution-supervisor-mcp-v1.mjs');
for (const marker of [
  '--enable-execution',
  '--enable-approval-write',
  'EVAVO_ART_COMFYUI_ALLOW_REMOTE = "false"',
  'EVAVO_ANIMATION_EXECUTION_WORKSPACE_ROOT',
]) assert.ok(supervisor.includes(marker), `Animation execution-supervisor invariant missing: ${marker}`);

assert.ok(capabilities.brain.topics.includes('event-sourced frame work ledgers and candidate-receipt integrity'));
assert.ok(capabilities.brain.topics.includes('separately gated animation execution supervision'));
console.log('Art Studio animation capability discovery and negative-authority invariants are consistent.');
