#!/usr/bin/env node

const GENERIC_AI_PHRASES = Object.freeze([
  'masterpiece',
  'best quality',
  'ultra detailed',
  'ultra-detailed',
  '8k',
  '16k',
  'award winning',
  'award-winning',
  'trending on artstation',
  'highly detailed',
  'insanely detailed',
  'professional photography',
  'perfect face',
  'perfect anatomy',
  'stunning',
  'epic composition',
]);

function issue(code, severity, message, shotId = null, details = null) {
  return Object.freeze({ code, severity, message, ...(shotId ? { shotId } : {}), ...(details ? { details } : {}) });
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function shotSpecificity(frame) {
  const shot = frame.shot ?? {};
  const fields = ['description', 'pose', 'camera', 'expression', 'outfitState', 'background', 'framing'];
  const populated = fields.filter((field) => typeof shot[field] === 'string' && shot[field].trim().length >= 4);
  return Object.freeze({ count: populated.length, fields: Object.freeze(populated) });
}

function genericPhrases(text) {
  const source = normalized(text);
  return Object.freeze(GENERIC_AI_PHRASES.filter((phrase) => source.includes(phrase)));
}

export function auditBatchPlan(plan, options = {}) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.frames)) throw new Error('auditBatchPlan requires a compiled V2 batch plan');
  const maxPromptChars = Number.isInteger(options.maxPromptChars) ? options.maxPromptChars : 9000;
  const minShotSpecificity = Number.isInteger(options.minShotSpecificity) ? options.minShotSpecificity : 3;
  const issues = [];
  const positiveHashOwners = new Map();
  const identityLayers = new Set();
  const styleLayers = new Set();
  const continuityLayers = new Set();

  for (const frame of plan.frames) {
    const prompt = frame.prompt?.positive ?? '';
    const negative = frame.prompt?.negative ?? '';
    const layers = frame.prompt?.positiveLayers ?? {};
    identityLayers.add(normalized(layers.identity));
    styleLayers.add(normalized(layers.style));
    continuityLayers.add(normalized(layers.continuity));

    const specificity = shotSpecificity(frame);
    if (specificity.count < minShotSpecificity) {
      issues.push(issue('low-shot-specificity', 'warning', `Shot has only ${specificity.count} concrete shot-direction fields; add pose/camera/expression/background/framing detail to reduce generic output.`, frame.id, specificity));
    }
    if (prompt.length > maxPromptChars) {
      issues.push(issue('prompt-too-long', 'error', `Positive prompt is ${prompt.length} characters; maximum audited length is ${maxPromptChars}.`, frame.id));
    }
    if (negative.length > maxPromptChars) {
      issues.push(issue('negative-prompt-too-long', 'error', `Negative prompt is ${negative.length} characters; maximum audited length is ${maxPromptChars}.`, frame.id));
    }
    const generic = genericPhrases(`${prompt} ${negative}`);
    if (generic.length) {
      issues.push(issue('generic-ai-filler', generic.length >= 3 ? 'error' : 'warning', `Prompt contains generic AI filler rather than project-specific direction: ${generic.join(', ')}.`, frame.id, { phrases: generic }));
    }
    const shotLayer = normalized(layers.shot);
    if (!shotLayer || shotLayer.length < 24) {
      issues.push(issue('weak-shot-layer', 'error', 'Shot layer is missing or too weak to distinguish this frame from the campaign-wide identity/style prompt.', frame.id));
    }
    const hash = frame.prompt?.promptSha256;
    if (hash) {
      const prior = positiveHashOwners.get(hash);
      if (prior && plan.mode !== 'variation') {
        issues.push(issue('duplicate-shot-prompt', 'warning', `Shot has the same assembled positive prompt as ${prior}; confirm this is intentional.`, frame.id, { duplicateOf: prior }));
      } else if (!prior) {
        positiveHashOwners.set(hash, frame.id);
      }
    }
  }

  if (plan.frames.length > 1 && plan.consistencyMode === 'strict') {
    if (identityLayers.size !== 1) issues.push(issue('identity-layer-drift', 'error', 'Strict-consistency campaign changed the identity prompt layer between shots.'));
    if (styleLayers.size !== 1) issues.push(issue('style-layer-drift', 'error', 'Strict-consistency campaign changed the style prompt layer between shots.'));
  }
  if (plan.frames.length > 1 && plan.mode !== 'variation' && positiveHashOwners.size === 1) {
    issues.push(issue('campaign-prompt-collapse', 'error', 'Every shot compiled to the same positive prompt; the shot plan is not meaningfully differentiating frames.'));
  }

  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  const score = Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5));
  return Object.freeze({
    schema: 'evavo.local-generation-batch-audit.v2',
    ok: errors.length === 0,
    score,
    campaignId: plan.campaignId,
    batchSize: plan.batchSize,
    generationMode: plan.mode,
    consistencyMode: plan.consistencyMode,
    qualityProfile: plan.qualityProfile,
    counts: Object.freeze({ errors: errors.length, warnings: warnings.length, issues: issues.length }),
    issues: Object.freeze(issues),
  });
}

export const GENERIC_AI_FILLER_PHRASES = GENERIC_AI_PHRASES;
