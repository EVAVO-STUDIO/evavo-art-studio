import crypto from 'node:crypto';
import path from 'node:path';

export const MOBILE_IDENTITY_SCHEMA = 'evavo.mobile-identity-production.v1';
export const MOBILE_IDENTITY_APPROVAL_SCHEMA = 'evavo.mobile-identity-raster-approval.v1';

const FORBIDDEN_MASTER_TYPES = new Set(['svg', 'wordmark', 'lettermark', 'hand-authored-vector', 'vector-concept']);
const ALLOWED_PROVIDER_FAMILIES = new Set(['openai-gpt-image', 'comfyui']);
const REVIEW_SIZES = Object.freeze([16, 24, 32, 48, 64, 128]);

function assert(condition, message) { if (!condition) throw new Error(message); }
function object(value, label) { assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`); return value; }
function text(value, label, maximum = 4000) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum, `${label} must be non-empty text`); return value.trim(); }
function sha256(value) { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)); return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function hashObject(value) { return sha256(JSON.stringify(canonical(value))); }
function safeRelative(value, label) { const candidate = text(value, label, 500).replaceAll('\\', '/'); assert(!path.posix.isAbsolute(candidate) && !candidate.split('/').includes('..'), `${label} must be repository-relative`); return candidate; }

export function compileMobileIdentityProductionBrief(input) {
  const brief = object(input, 'brief');
  const app = object(brief.app, 'app');
  const brand = object(brief.brand, 'brand');
  const device = object(brief.device, 'device');
  const delivery = object(brief.delivery, 'delivery');
  const candidateCount = Number(brief.candidateCount ?? 6);
  assert(Number.isInteger(candidateCount) && candidateCount >= 4 && candidateCount <= 8, 'candidateCount must be 4..8');
  const creativeMasterType = String(brief.creativeMasterType ?? 'raster-provider-generation');
  assert(!FORBIDDEN_MASTER_TYPES.has(creativeMasterType), 'mobile identity creative master cannot be SVG, wordmark, lettermark or hand-authored vector');
  assert(creativeMasterType === 'raster-provider-generation', 'mobile identity creative master must be raster-provider-generation');
  const providerPreference = Array.isArray(brief.providerPreference) ? brief.providerPreference.map((entry) => text(entry, 'providerPreference entry', 80)) : ['openai-gpt-image', 'comfyui'];
  assert(providerPreference.length > 0, 'at least one image-generation provider is required');
  for (const provider of providerPreference) assert(ALLOWED_PROVIDER_FAMILIES.has(provider), `unsupported mobile identity provider family: ${provider}`);
  const context = Object.freeze({
    app: { name: text(app.name, 'app.name', 120), purpose: text(app.purpose, 'app.purpose', 1200), productFamily: text(app.productFamily ?? app.name, 'app.productFamily', 120) },
    brand: { studio: text(brand.studio ?? 'EVAVO Studio', 'brand.studio', 120), palette: Array.isArray(brand.palette) ? brand.palette.map((entry) => text(entry, 'brand.palette entry', 32)) : ['#060608', '#F7F7F9', '#FF244E'], principles: Array.isArray(brand.principles) ? brand.principles.map((entry) => text(entry, 'brand.principles entry', 300)) : [] },
    device: { family: text(device.family, 'device.family', 160), vendorCompanion: text(device.vendorCompanion, 'device.vendorCompanion', 160), usage: text(device.usage, 'device.usage', 1000) },
  });
  const prompt = [
    `Create a premium app icon identity for ${context.app.name}.`, context.app.purpose,
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
    schema: MOBILE_IDENTITY_SCHEMA, status: 'generation-required',
    creativeMaster: { type: 'raster-provider-generation', vectorMayBeDerivativeOnly: true, svgMayBeCreativeMaster: false, wordmarkMayBeCreativeMaster: false, textAllowed: false },
    candidateCount, providerPreference, context, contextSha256: hashObject(context),
    generation: { operation: 'generate', width: 1024, height: 1024, opaque: true, preferredOpenAIModel: 'gpt-image-2', prompt, promptSha256: sha256(prompt), immutableCandidates: true, approvalRequiredBeforeDelivery: true },
    review: { smallScalePixels: REVIEW_SIZES, masks: ['circle', 'squircle', 'android-adaptive'], rejectTextOrWordmark: true, rejectGenericAiCliches: true, requireStrongSilhouette: true, requireIosOpacity: true, requireAndroidSafeZone: true },
    delivery: { ios1024: safeRelative(delivery.ios1024, 'delivery.ios1024'), androidAdaptiveForeground: safeRelative(delivery.androidAdaptiveForeground, 'delivery.androidAdaptiveForeground'), androidNotification: delivery.androidNotification ? safeRelative(delivery.androidNotification, 'delivery.androidNotification') : null },
    authority: { providerExecutionGrantsApproval: false, rasterApprovalGrantsDeviceAuthority: false, vectorDerivativeGrantsCreativeApproval: false, targetRepositoryMutation: false, forcePush: false },
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
  assert(providerFamily === 'openai-gpt-image' || providerFamily.startsWith('comfyui:'), 'approval is not bound to the real Art Studio OpenAI GPT Image or ComfyUI adapter');
  if (providerFamily === 'openai-gpt-image') assert(approval.providerModel === 'gpt-image-2' || approval.providerModel === 'gpt-image-2-2026-04-21', 'OpenAI mobile identity approval must use an admitted gpt-image-2 model');
  for (const [value, label] of [[approval.candidateSha256, 'candidateSha256'], [approval.contextSha256, 'contextSha256'], [approval.promptSha256, 'promptSha256']]) assert(/^[a-f0-9]{64}$/u.test(String(value)), `${label} must be SHA-256`);
  text(approval.generationReceiptId, 'approval.generationReceiptId', 256);
  const review = object(approval.review, 'approval.review');
  for (const check of ['smallScale', 'circleMask', 'squircleMask', 'androidAdaptiveMask', 'noTextOrWordmark', 'nonGenericIdentity', 'strongSilhouette']) assert(review[check] === true, `approval.review.${check} must be true`);
  const authority = object(approval.authority, 'approval.authority');
  assert(authority.deviceAuthority === false && authority.protocolAuthority === false && authority.forcePush === false, 'approval authority boundary is invalid');
  return true;
}
