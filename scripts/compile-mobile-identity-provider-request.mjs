#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const PRODUCTION_SCHEMA = 'evavo.mobile-identity-production.v1';
const PROVIDER_REQUEST_SCHEMA = 'evavo.mobile-identity-provider-request.v1';
const OPENAI_ADAPTER = 'openai-gpt-image';
const OPENAI_MODELS = new Set(['gpt-image-2', 'gpt-image-2-2026-04-21']);

function fail(message) { throw new Error(message); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function text(value, label, max = 4000) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be non-empty text`); return value.trim(); }
function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function safeAdapter(value) { const id = text(value, 'adapter id', 160); if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(id)) fail('adapter id contains unsafe characters'); return id; }
function readJson(file) { const target = resolve(file); const stat = lstatSync(target); if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 * 1024) fail('input must be a regular JSON file <= 1 MiB'); return JSON.parse(readFileSync(target, 'utf8')); }

export function compileMobileIdentityProviderRequest(productionInput, routingInput = {}) {
  const production = object(productionInput, 'production');
  if (production.schema !== PRODUCTION_SCHEMA) fail(`production.schema must be ${PRODUCTION_SCHEMA}`);
  if (production.creativeMaster?.type !== 'raster-provider-generation') fail('creative master must be raster-provider-generation');
  if (production.generation?.operation !== 'generate') fail('mobile identity provider request must use generate');
  if (production.generation?.width !== 1024 || production.generation?.height !== 1024) fail('mobile identity creative master must be 1024x1024');
  if (production.generation?.opaque !== true) fail('mobile identity creative master must be opaque');
  if (!Number.isInteger(production.candidateCount) || production.candidateCount < 4 || production.candidateCount > 8) fail('candidateCount must be 4..8');

  const routing = routingInput && typeof routingInput === 'object' && !Array.isArray(routingInput) ? routingInput : {};
  const preferredAdapterId = safeAdapter(routing.preferredAdapterId ?? OPENAI_ADAPTER);
  const preferredModel = text(routing.preferredModel ?? production.generation.preferredOpenAIModel ?? 'gpt-image-2', 'preferred model', 120);
  const allowedAdapterIds = [preferredAdapterId];
  if (routing.comfyUiProfileId) allowedAdapterIds.push(safeAdapter(`comfyui:${routing.comfyUiProfileId}`));
  if (preferredAdapterId === OPENAI_ADAPTER && !OPENAI_MODELS.has(preferredModel)) fail('OpenAI mobile identity generation must use an admitted gpt-image-2 model');
  if (preferredAdapterId.startsWith('comfyui:') && preferredAdapterId.length === 'comfyui:'.length) fail('ComfyUI adapter must include a concrete profile id');
  if (preferredAdapterId === 'comfyui') fail('generic comfyui is not an executable adapter id');
  if (preferredAdapterId === 'gpt-image' || preferredAdapterId === 'openai-image') fail('generic image-provider aliases are not executable adapter ids');

  const context = object(production.context, 'production.context');
  const app = object(context.app, 'production.context.app');
  const brand = object(context.brand, 'production.context.brand');
  const device = object(context.device, 'production.context.device');
  const requestSeed = `${production.productionSha256}:${preferredAdapterId}:${preferredModel}`;
  const requestId = `mobile-identity-${sha256(requestSeed).slice(0, 24)}`;
  const assetId = `mobile-identity-${String(app.name ?? 'app').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'app'}`;
  const candidateFamilyId = `${assetId}-${production.contextSha256.slice(0, 12)}`;
  const palette = Array.isArray(brand.palette) ? brand.palette : [];
  const principles = Array.isArray(brand.principles) ? brand.principles : [];

  const providerRequest = {
    schemaVersion: '1.0',
    requestId,
    operation: 'generate',
    assetKind: 'ui',
    continuityPhase: 'identity-master',
    assetId,
    candidateFamilyId,
    creativeIntent: text(production.generation.prompt, 'production.generation.prompt'),
    negativeIntent: [
      'No readable text, wordmarks, monograms or lettermarks.',
      'No hand-authored SVG/vector-first substitute.',
      'No generic AI sparkle, robot, brain, neural-node, glowing-orb, chat-bubble or stock-gradient imagery.',
      'No tiny pseudo-technical ornament or fragile detail that disappears at launcher scale.',
    ].join(' '),
    style: {
      styleName: `${app.name} mobile identity`,
      intent: principles.length > 0 ? principles.join('; ') : 'crafted, premium, distinctive creative-technology identity',
      mustHave: ['strong silhouette', 'intentional negative space', 'launcher-scale legibility', 'distinctive smart-glasses product identity'],
      mustAvoid: ['wordmark', 'lettermark', 'generic AI emblem', 'stock app icon treatment', 'pseudo-technical noise'],
      identityLocks: [`app:${app.name}`, `device:${device.family}`, `vendor-companion:${device.vendorCompanion}`],
      palette,
      compositionRules: ['centered launcher-safe composition', 'survive circle and squircle masks', 'survive Android adaptive icon safe zone'],
    },
    shot: {
      subject: `${app.name} app identity for ${device.family}`,
      include: ['single coherent symbol', 'strong foreground/background separation'],
      exclude: ['text', 'wordmarks', 'UI screenshots', 'generic AI iconography'],
      framing: ['square 1:1 icon master', 'generous mask-safe margins'],
    },
    target: {
      width: 1024,
      height: 1024,
      transparency: 'opaque',
      outputFormat: 'png',
    },
    background: {
      strategy: 'opaque-source',
      matteColour: palette[0] ?? '#060608',
    },
    quality: 'high',
    candidateCount: production.candidateCount,
    references: [],
    selection: {
      preferredAdapterId,
      preferredModel,
      allowedAdapterIds,
      allowFallback: allowedAdapterIds.length > 1,
      requireSeed: false,
    },
    metadata: {
      workflow: 'mobile-identity',
      sourceProductionSha256: production.productionSha256,
      contextSha256: production.contextSha256,
      promptSha256: production.generation.promptSha256,
      creativeMasterType: 'raster-provider-generation',
      releaseEligible: false,
      approvalRequired: true,
    },
  };

  const result = {
    schema: PROVIDER_REQUEST_SCHEMA,
    status: 'provider-request-ready',
    sourceProductionSha256: production.productionSha256,
    providerRequest,
    providerRequestSha256: sha256(providerRequest),
    execution: {
      protocol: 'Art Studio provider candidate request v1.0',
      executionMode: 'durable-worker-only',
      nextStep: 'compile/submit through @evavo/art-providers and the authorized Art Studio provider worker',
    },
    authority: {
      generationEqualsApproval: false,
      providerMayPublishRuntimeMain: false,
      providerMayGrantDeviceAuthority: false,
      forcePush: false,
    },
  };
  return Object.freeze(result);
}

function parse(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) fail('arguments must be unique --name value pairs');
    values.set(name, value);
  }
  return values;
}

function main(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const production = readJson(values.get('--production'));
  const routing = values.get('--routing') ? readJson(values.get('--routing')) : {};
  const result = compileMobileIdentityProviderRequest(production, routing);
  const output = values.get('--output');
  if (!output) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return; }
  const target = resolve(output);
  if (!existsSync(dirname(target)) || existsSync(target)) fail('output parent must exist and output must be create-only');
  writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; }
}
