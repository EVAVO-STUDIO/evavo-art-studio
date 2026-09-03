#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { auditBatchPlan } from './local-generation-batch-audit-v2.mjs';
import { compileBatchPlan, LOCAL_GENERATION_BATCH_SCHEMA } from './local-generation-batch-v2.mjs';

function source({ mode = 'sequential-anchor', count = 3 } = {}) {
  return {
    schema: LOCAL_GENERATION_BATCH_SCHEMA,
    campaignId: `audit-${mode}-${count}`,
    contentClass: 'general',
    batch_size: count,
    generation_mode: mode,
    consistency_mode: 'strict',
    quality_profile: 'cinematic_stills',
    character: {
      id: 'audit-character',
      description: 'A recurring adult game character with a narrow angular face and unmistakable silhouette',
      face: 'narrow jaw, high cheekbones, distinct straight nose and heavy left brow',
      hair: 'short black swept-back hair with one loose temple strand',
      build: 'tall lean athletic proportions with long limbs',
      costume: 'structured charcoal field jacket, fitted black trousers and worn leather boots',
      palette: ['charcoal', 'black', 'oxide red'],
      signatureDetails: ['small diagonal scar through the left eyebrow'],
    },
    style: {
      name: 'audit-style',
      description: 'Specific authored game production art with restrained materials, natural anatomy and deliberate composition',
      medium: 'digital production illustration',
      lighting: 'one motivated practical key plus soft ambient bounce',
      mustHave: ['clean silhouette', 'credible material separation'],
      mustAvoid: ['plastic skin', 'generic AI look'],
    },
    continuity_locks: ['keep face geometry identical', 'keep costume construction stable'],
    negative: ['extra limbs', 'text artifacts'],
    shots: Array.from({ length: count }, (_, index) => ({
      id: `shot-${index + 1}`,
      description: `Specific production shot ${index + 1}`,
      pose: index === 0 ? 'neutral standing identity pose' : `distinct weight-shifted pose ${index + 1}`,
      camera: index === 0 ? 'eye-level three-quarter full figure' : `eye-level controlled angle ${index + 1}`,
      expression: index === 0 ? 'calm neutral focus' : `subtle focused expression ${index + 1}`,
      background: 'same restrained industrial room with a fixed steel doorway and wall lamp',
      framing: 'full figure with stable scale and clear margins',
    })),
  };
}

test('specific structured campaign passes prompt audit', () => {
  const audit = auditBatchPlan(compileBatchPlan(source()));
  assert.equal(audit.ok, true);
  assert.equal(audit.counts.errors, 0);
  assert.ok(audit.score >= 90);
});

test('generic AI filler is detected', () => {
  const manifest = source({ count: 1, mode: 'independent' });
  manifest.style.description = 'masterpiece best quality ultra detailed 8k award winning';
  const audit = auditBatchPlan(compileBatchPlan(manifest));
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((item) => item.code === 'generic-ai-filler'));
});

test('weak shot planning is warned before GPU execution', () => {
  const manifest = source({ count: 1, mode: 'independent' });
  manifest.shots[0] = { id: 'shot-1', description: 'A person standing' };
  const audit = auditBatchPlan(compileBatchPlan(manifest));
  assert.ok(audit.issues.some((item) => item.code === 'low-shot-specificity'));
});

test('variation mode permits intentionally identical prompts', () => {
  const manifest = source({ count: 2, mode: 'variation' });
  manifest.shots[1] = { ...manifest.shots[0], id: 'shot-2' };
  const audit = auditBatchPlan(compileBatchPlan(manifest));
  assert.equal(audit.issues.some((item) => item.code === 'duplicate-shot-prompt'), false);
});
