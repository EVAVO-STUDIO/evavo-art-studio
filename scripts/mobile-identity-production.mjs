#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { runAuthorizedRawArtProviderWorkerCli } from './run-authorized-raw-art-provider-worker.mjs';

export const MOBILE_IDENTITY_SCHEMA = 'evavo.mobile-identity-production.v1';
export const MOBILE_IDENTITY_APPROVAL_SCHEMA = 'evavo.mobile-identity-raster-approval.v1';

const FORBIDDEN_MASTER_TYPES = new Set([
  'svg',
  'wordmark',
  'lettermark',
  'hand-authored-vector',
  'vector-concept',
]);
const ALLOWED_PROVIDER_FAMILIES = new Set(['openai-image', 'gpt-image', 'comfyui']);
const REVIEW_SIZES = Object.freeze([16, 24, 32, 48, 64, 128]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function text(value, label, maximum = 4000) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum, `${label} must be non-empty text`);
  return value.trim();
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function hashObject(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function safeRelative(value, label) {
  const candidate = text(value, label, 500).replaceAll('\\', '/');
  assert(!path.posix.isAbsolute(candidate) && !candidate.split('/').includes('..'), `${label} must be repository-relative`);
  return candidate;
}

export function compileMobileIdentityProductionBrief(input) {
  const brief = object(input, 'brief');
  const app = object(brief.app, 'app');
  const brand = object(brief.brand, 'brand');
  const device = object(brief.device, 'device');
  const delivery = object(brief.delivery, 'delivery');
  const candidateCount = Number(brief.candidateCount ?? 6);
  assert(Number.isInteger(candidateCount) && candidateCount >= 4 && candidateCount <= 12, 'candidateCount must be 4..12');

  const creativeMasterType = String(brief.creativeMasterType ?? 'raster-provider-generation');
  assert(!FORBIDDEN_MASTER_TYPES.has(creativeMasterType), 'mobile identity creative master cannot be SVG, wordmark, lettermark or hand-authored vector');
  assert(creativeMasterType === 'raster-provider-generation', 'mobile identity creative master must be raster-provider-generation');

  const providerPreference = Array.isArray(brief.providerPreference)
    ? brief.providerPreference.map((entry) => text(entry, 'providerPreference entry', 80))
    : ['gpt-image', 'comfyui'];
  assert(providerPreference.length > 0, 'at least one image-generation provider is required');
  for (const provider of providerPreference) {
    assert(ALLOWED_PROVIDER_FAMILIES.has(provider), `unsupported mobile identity provider family: ${provider}`);
  }

  const context = Object.freeze({
    app: {
      name: text(app.name, 'app.name', 120),
      purpose: text(app.purpose, 'app.purpose', 1200),
      productFamily: text(app.productFamily ?? app.name, 'app.productFamily', 120),
    },
    brand: {
      studio: text(brand.studio ?? 'EVAVO Studio', 'brand.studio', 120),
      palette: Array.isArray(brand.palette) ? brand.palette.map((entry) => text(entry, 'brand.palette entry', 32)) : ['#060608', '#F7F7F9', '#FF244E'],
      principles: Array.isArray(brand.principles) ? brand.principles.map((entry) => text(entry, 'brand.principles entry', 300)) : [],
    },
    device: {
      family: text(device.family, 'device.family', 160),
      vendorCompanion: text(device.vendorCompanion, 'device.vendorCompanion', 160),
      usage: text(device.usage, 'device.usage', 1000),
    },
  });

  const prompt = [
    `Create a premium app icon identity for ${context.app.name}.`,
    context.app.purpose,
    `Hardware context: ${context.device.family}; vendor companion: ${context.device.vendorCompanion}.`,
    `Brand palette: ${context.brand.palette.join(', ')}.`,
    'Create a distinctive symbol, not a wordmark, monogram, lettermark, logo text, UI screenshot or generic AI emblem.',
    'Do not use sparkle clusters, robot heads, brains, magic wands, generic neural-network nodes, generic glowing orbs, chat bubbles or stock AI gradients.',
    'The mark must remain recognizable at 16px and survive circle, squircle and Android adaptive masks.',
    'Use a restrained, crafted creative-technology aesthetic with strong silhouette and intentional negative space.',
    'No readable text. No tiny details. No decorative pseudo-technical noise.',
    'Produce a square 1024x1024 raster creative master with an opaque background and generous safe area.',
  ].join('\n');

  const compiled = {
    schema: MOBILE_IDENTITY_SCHEMA,
    status: 'generation-required',
    creativeMaster: {
      type: 'raster-provider-generation',
      vectorMayBeDerivativeOnly: true,
      svgMayBeCreativeMaster: false,
      wordmarkMayBeCreativeMaster: false,
      textAllowed: false,
    },
    candidateCount,
    providerPreference,
    context,
    contextSha256: hashObject(context),
    generation: {
      operation: 'generate',
      width: 1024,
      height: 1024,
      opaque: true,
      prompt,
      promptSha256: sha256(prompt),
      immutableCandidates: true,
      approvalRequiredBeforeDelivery: true,
    },
    review: {
      smallScalePixels: REVIEW_SIZES,
      masks: ['circle', 'squircle', 'android-adaptive'],
      rejectTextOrWordmark: true,
      rejectGenericAiCliches: true,
      requireStrongSilhouette: true,
      requireIosOpacity: true,
      requireAndroidSafeZone: true,
    },
    delivery: {
      ios1024: safeRelative(delivery.ios1024, 'delivery.ios1024'),
      androidAdaptiveForeground: safeRelative(delivery.androidAdaptiveForeground, 'delivery.androidAdaptiveForeground'),
      androidNotification: delivery.androidNotification ? safeRelative(delivery.androidNotification, 'delivery.androidNotification') : null,
    },
    authority: {
      providerExecutionGrantsApproval: false,
      rasterApprovalGrantsDeviceAuthority: false,
      vectorDerivativeGrantsCreativeApproval: false,
      targetRepositoryMutation: false,
      forcePush: false,
    },
  };
  return Object.freeze({ ...compiled, productionSha256: hashObject(compiled) });
}

export function validateMobileIdentityRasterApproval(input) {
  const approval = object(input, 'approval');
  assert(approval.schema === MOBILE_IDENTITY_APPROVAL_SCHEMA, 'unexpected mobile identity approval schema');
  assert(approval.approved === true, 'mobile identity raster candidate is not approved');
  assert(approval.sourceType === 'raster-provider-generation', 'approved mobile identity must originate from raster-provider-generation');
  assert(!FORBIDDEN_MASTER_TYPES.has(String(approval.sourceType)), 'forbidden creative master type');
  const providerFamily = text(approval.providerFamily, 'approval.providerFamily', 80);
  assert(ALLOWED_PROVIDER_FAMILIES.has(providerFamily), 'approval is not bound to an allowed image-generation provider family');
  assert(/^[a-f0-9]{64}$/u.test(String(approval.candidateSha256)), 'candidateSha256 must be SHA-256');
  assert(/^[a-f0-9]{64}$/u.test(String(approval.contextSha256)), 'contextSha256 must be SHA-256');
  assert(/^[a-f0-9]{64}$/u.test(String(approval.promptSha256)), 'promptSha256 must be SHA-256');
  assert(text(approval.generationReceiptId, 'approval.generationReceiptId', 256).length > 0, 'generation receipt is required');
  const review = object(approval.review, 'approval.review');
  for (const check of ['smallScale', 'circleMask', 'squircleMask', 'androidAdaptiveMask', 'noTextOrWordmark', 'nonGenericIdentity', 'strongSilhouette']) {
    assert(review[check] === true, `approval.review.${check} must be true`);
  }
  const authority = object(approval.authority, 'approval.authority');
  assert(authority.deviceAuthority === false && authority.protocolAuthority === false && authority.forcePush === false, 'approval authority boundary is invalid');
  return true;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeCreateOnly(file, value) {
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, 'wx');
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); } finally { await handle.close(); }
}

function args(argv) {
  const command = argv[0];
  const values = new Map();
  for (let i = 1; i < argv.length; i += 2) {
    assert(argv[i]?.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--'), 'arguments must be --name value pairs');
    values.set(argv[i], argv[i + 1]);
  }
  return { command, values };
}

export async function runMobileIdentityCli(argv = process.argv.slice(2)) {
  const { command, values } = args(argv);
  if (command === 'compile') {
    const input = await readJson(values.get('--brief'));
    const output = compileMobileIdentityProductionBrief(input);
    await writeCreateOnly(values.get('--output'), output);
    return { status: 'ok', schema: output.schema, output: path.resolve(values.get('--output')), productionSha256: output.productionSha256 };
  }
  if (command === 'validate-approval') {
    const approval = await readJson(values.get('--approval'));
    validateMobileIdentityRasterApproval(approval);
    return { status: 'ok', schema: MOBILE_IDENTITY_APPROVAL_SCHEMA, approved: true, candidateSha256: approval.candidateSha256 };
  }
  if (command === 'execute-authorized') {
    const forwarded = ['--authorization', values.get('--authorization'), '--worker-id', values.get('--worker-id') ?? 'mobile-identity-worker', '--command', values.get('--worker-command') ?? 'until-idle', '--receipt', values.get('--receipt')];
    if (values.get('--concurrency')) forwarded.push('--concurrency', values.get('--concurrency'));
    return runAuthorizedRawArtProviderWorkerCli(forwarded);
  }
  throw new Error('command must be compile, validate-approval or execute-authorized');
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (direct) {
  runMobileIdentityCli().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  });
}
