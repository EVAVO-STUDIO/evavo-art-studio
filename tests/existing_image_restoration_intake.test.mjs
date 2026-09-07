import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyExistingImageRequest,
  planExistingImageRestorationIntake,
} from '../tools/lib/existing_image_restoration_intake.mjs';

const digest = 'a'.repeat(64);
const source = Object.freeze({ path: 'C:\\fixtures\\synthetic-bw-source.png', sha256: digest });
const realReference = Object.freeze({
  path: 'C:\\fixtures\\synthetic-colour-reference.png',
  sha256: 'b'.repeat(64),
  provenance: 'user-provided-original',
  referenceIsRealPhotograph: true,
  subjectMatchConfirmedByHuman: true,
});

for (const phrase of ['colourise', 'colorise', 'colourize', 'colorize']) {
  test(`recognises ${phrase}`, () => {
    assert.equal(classifyExistingImageRequest(`${phrase} this B&W portrait`).intent, 'colour-restoration');
  });
}

test('does not mistake colourful portrait generation for colour restoration', () => {
  assert.equal(classifyExistingImageRequest('Create a colourful portrait of a traveller').intent, 'generative');
});

test('explicit no-colour restoration remains ordinary restoration', () => {
  const result = classifyExistingImageRequest('Restore scratches on this old black-and-white photo but do not add colour');
  assert.equal(result.intent, 'restoration');
  assert.equal(result.signals.explicitNoColour, true);
  assert.equal(result.signals.colourRestoration, false);
});

test('colour restoration without source fails closed', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Colourise this B&W portrait using this real photo as reference',
    colourReference: realReference,
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.reasonCode, 'missing_source_asset');
  assert.equal(plan.allowGenerativeFallback, false);
});

test('colour restoration without real reference fails closed', () => {
  const plan = planExistingImageRestorationIntake({ prompt: 'Colorize this grayscale portrait', source });
  assert.equal(plan.reasonCode, 'missing_real_colour_reference');
  assert.equal(plan.providerExecutionEligible, false);
});

test('colour reference must be confirmed as a real photograph', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Colourise this portrait',
    source,
    colourReference: { ...realReference, referenceIsRealPhotograph: false },
  });
  assert.equal(plan.reasonCode, 'real_photograph_reference_not_confirmed');
});

test('colour reference provenance must be trusted', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Colorize this portrait',
    source,
    colourReference: { ...realReference, provenance: 'ai-generated' },
  });
  assert.equal(plan.reasonCode, 'unverified_colour_reference');
});

test('same-subject match requires human confirmation', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Restore colour to this portrait',
    source,
    colourReference: { ...realReference, subjectMatchConfirmedByHuman: false },
  });
  assert.equal(plan.reasonCode, 'subject_match_not_confirmed');
});

test('valid real-reference colour request stays blocked if no provider is configured', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Colourise this B&W portrait using this real photo as reference',
    source,
    colourReference: realReference,
  });
  assert.equal(plan.route, 'existing-image-reference-colour-restoration');
  assert.equal(plan.status, 'provider-unavailable');
  assert.equal(plan.reasonCode, 'reference_colour_provider_unavailable');
  assert.equal(plan.providerExecutionEligible, false);
  assert.equal(plan.allowGenerativeFallback, false);
});

test('configured reference-colour provider only becomes eligible after every gate passes', () => {
  const plan = planExistingImageRestorationIntake({
    prompt: 'Colorize this grayscale portrait from the real colour reference',
    source,
    colourReference: realReference,
  }, { referenceColourRestorationProviderId: 'bounded-reference-colour-v1' });
  assert.equal(plan.status, 'ready-for-provider');
  assert.equal(plan.providerExecutionEligible, true);
  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.providerId, 'bounded-reference-colour-v1');
  assert.equal(plan.humanFinalSelectionRequired, true);
  assert.equal(plan.qaMaySelectWinner, false);
});

test('cleanup routes into the existing preservation-first finishing plan', () => {
  const plan = planExistingImageRestorationIntake({ prompt: 'Clean up the white halo on this PNG', source });
  assert.equal(plan.intent, 'cleanup');
  assert.equal(plan.route, 'existing-image-finishing-plan');
  assert.equal(plan.nextTool, 'evavo_plan_existing_image_finishing');
  assert.equal(plan.sourceMutationAllowed, false);
});

test('upscale route requires an external candidate and only grants assurance', () => {
  const plan = planExistingImageRestorationIntake({ prompt: 'Upscale this existing image to a higher resolution', source });
  assert.equal(plan.intent, 'upscale');
  assert.equal(plan.status, 'candidate-required');
  assert.equal(plan.nextTool, 'evavo_compare_existing_image_edit');
  assert.equal(plan.providerExecutionEligible, false);
});

test('all existing-image plans deny creative auto-approval, publication and generative fallback', () => {
  for (const prompt of [
    'Clean up this existing image',
    'Restore scratches on this old photo',
    'Upscale this existing image',
  ]) {
    const plan = planExistingImageRestorationIntake({ prompt, source });
    assert.equal(plan.allowGenerativeFallback, false);
    assert.equal(plan.sourceMutationAllowed, false);
    assert.equal(plan.automaticCreativeApprovalAllowed, false);
    assert.equal(plan.publicationAllowed, false);
    assert.equal(plan.humanFinalSelectionRequired, true);
    assert.equal(plan.qaMaySelectWinner, false);
  }
});
