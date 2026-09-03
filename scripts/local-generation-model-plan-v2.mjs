#!/usr/bin/env node
import { createHash } from 'node:crypto';

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u;
function fail(message) { throw new Error(message); }
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > 256 || !SAFE.test(value)) fail(`${label} is invalid`);
  return value;
}
function finite(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be between ${min} and ${max}`);
  return value;
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

export function normalizeModelPlan(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('model_plan must be an object');
  const modelProfile = value.modelProfile == null ? null : text(value.modelProfile, 'model_plan.modelProfile');
  const modelId = value.modelId == null ? null : text(value.modelId, 'model_plan.modelId');
  const rawLoras = value.loras ?? [];
  if (!Array.isArray(rawLoras) || rawLoras.length > 16) fail('model_plan.loras must contain at most 16 entries');
  const loras = rawLoras.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`model_plan.loras[${index}] must be an object`);
    return Object.freeze({
      id: text(raw.id, `model_plan.loras[${index}].id`),
      strengthModel: finite(raw.strengthModel ?? 1, `model_plan.loras[${index}].strengthModel`, -2, 2),
      strengthClip: finite(raw.strengthClip ?? raw.strengthModel ?? 1, `model_plan.loras[${index}].strengthClip`, -2, 2),
      required: raw.required !== false,
    });
  });
  if (new Set(loras.map((item) => item.id)).size !== loras.length) fail('model_plan.loras IDs must be unique');
  const normalized = Object.freeze({ modelProfile, modelId, loras: Object.freeze(loras) });
  return Object.freeze({ ...normalized, sha256: createHash('sha256').update(stable(normalized)).digest('hex') });
}

export function resolveQualityAdapterId({ baseAdapterId, qualityProfile, modelPlan }) {
  if (typeof baseAdapterId !== 'string' || !baseAdapterId.startsWith('comfyui:')) fail('baseAdapterId must be a comfyui: adapter');
  const plan = normalizeModelPlan(modelPlan ?? {});
  const base = plan.modelProfile ? `comfyui:${plan.modelProfile}` : baseAdapterId;
  if (!qualityProfile) return base;
  return `${base}-${qualityProfile}`;
}

export function assertModelPlanExecutable(modelPlan, providerProfile) {
  const plan = normalizeModelPlan(modelPlan ?? {});
  if (!providerProfile || typeof providerProfile !== 'object') fail('provider profile is required');
  if (plan.modelId && providerProfile.modelId !== plan.modelId) fail(`provider model ${providerProfile.modelId} does not match requested ${plan.modelId}`);
  if (plan.loras.length) {
    const declared = new Set((providerProfile.modelInventory ?? []).filter((item) => item.kind === 'lora').map((item) => item.id));
    const missing = plan.loras.filter((item) => item.required && !declared.has(item.id)).map((item) => item.id);
    if (missing.length) fail(`reviewed provider profile does not declare required LoRAs: ${missing.join(', ')}`);
    const loaderNodes = Object.values(providerProfile.workflow ?? {}).filter((node) => node?.class_type === 'LoraLoader' || node?.class_type === 'LoraLoaderModelOnly');
    if (!loaderNodes.length) fail('model plan contains LoRAs but reviewed workflow has no LoRA loader node');
  }
  return Object.freeze({ executable: true, modelPlan: plan, providerProfileId: providerProfile.profileId });
}
