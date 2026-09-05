import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  compileTopHatV3ProviderPlan,
  inspectTopHatV3ProviderPlan,
} from './project-art/top-hat-v3-animation-provider-plan.mjs';
import {
  TOP_HAT_V3_CLIPS,
  assertTopHatV3GenerationPlanContract,
} from './project-art/top-hat-v3-suite-contract.mjs';

// Contract fixtures only. These strings are not image artifacts or human approvals.
const MASTER_SHA = '92cb290246a7629024dcb7768f4119f6a139d9c9f59e3d0545563e1f5b35575a';
const ROOT = 'assets/top-hat-man/production-v3';
const SLOTS = ['blink-closed', 'listening-attentive', 'thinking-reflective',
  'speech-neutral', 'presentation-open', 'presentation-emphasis'];
const PRIORITY = ['idle-breathe', 'blink-single', 'idle-glance', 'attention', 'nod',
  'listening', 'thinking', 'talk-in', 'talk-neutral', 'talk-soft', 'talk-engaged',
  'talk-out', 'talk-emphasis', 'talk-happy', 'talk-concerned', 'pleased', 'concerned',
  'error', 'wave', 'hat-tip', 'idle-primary', 'idle-weight-shift', 'blink-double',
  'sleep', 'wake'];
const sha = (text) => createHash('sha256').update(text).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
  return value;
}
function seal(plan) {
  delete plan.planSha256;
  plan.planSha256 = sha(`${JSON.stringify(canonical(plan))}\n`);
  return plan;
}
const bodyPhase = (plan) => plan.phases.find((phase) => phase.id === 'body-clips');
const allJobs = (plan) => [
  ...plan.phases.find((phase) => phase.id === 'foundation').jobs,
  ...plan.phases.find((phase) => phase.id === 'registered-layers').jobs,
  ...bodyPhase(plan).clips.flatMap((clip) => clip.waves.flatMap((wave) => wave.jobs)),
];
const allRequests = (plan) => [
  ...plan.foundation, ...plan.registeredLayers,
  ...plan.clips.flatMap((clip) => clip.waves.flatMap((wave) => wave.jobs)),
];
function clipFixture(clip) {
  const frameId = (n) => `top-hat-man-${clip.id}-${String(n + 1).padStart(3, '0')}`;
  let previous = [];
  let pending = Array.from({ length: clip.frames }, (_, n) => n);
  const waves = [];
  while (pending.length) {
    const ordinals = waves.length === 0 ? [0, clip.frames - 1] : previous
      .slice(0, -1).flatMap((n, i) => previous[i + 1] - n > 1
        ? [Math.floor((n + previous[i + 1]) / 2)] : []);
    assert.ok(ordinals.length > 0);
    const waveIndex = waves.length;
    const jobs = ordinals.map((ordinal) => ({
      jobId: frameId(ordinal), ordinal,
      phase: Number((ordinal / (clip.frames - 1)).toFixed(6)),
      role: waveIndex === 0 ? ordinal === 0 ? 'opening-anchor' : 'closing-anchor'
        : 'continuity-inbetween',
      leftApprovedAnchorJobId: waveIndex === 0 ? null
        : frameId(previous.filter((n) => n < ordinal).at(-1)),
      rightApprovedAnchorJobId: waveIndex === 0 ? null
        : frameId(previous.find((n) => n > ordinal)),
      canonicalIdentityRequired: true, animationIdentityMasterRequired: true,
      requirePreviousApprovedReference: waveIndex > 0,
      requireNextApprovedReference: waveIndex > 0,
      targetPath: `${ROOT}/body/${clip.id}/${String(ordinal + 1).padStart(3, '0')}.png`,
    }));
    waves.push({ waveIndex, mode: waveIndex === 0 ? 'clip-anchor' : 'bounded-inbetween',
      parallelSafeWithinWave: true, jobs });
    previous = [...previous, ...ordinals].sort((a, b) => a - b);
    pending = pending.filter((n) => !ordinals.includes(n));
  }
  return { clipId: clip.id, targetFrames: clip.frames, fps: clip.fps,
    loopMode: clip.loopMode, waves };
}
function fixture() {
  const foundation = SLOTS.map((poseSlotId) => ({
    jobId: `top-hat-man-foundation-${poseSlotId}`, poseSlotId,
    purpose: `Contract fixture: ${poseSlotId}`,
    performance: `Restrained ${poseSlotId} performance.`,
    targetPath: `${ROOT}/foundation/${poseSlotId}.png`,
  }));
  const layers = [['closed', 1], ['slight', 2], ['medium', 2], ['wide', 2],
    ['round', 2], ['teeth', 2]].flatMap(([pose, count]) =>
    Array.from({ length: count }, (_, n) => ({
      jobId: `top-hat-man-mouth-${pose}-${n + 1}`, layer: 'mouth', pose,
      energy: count === 1 ? 'neutral' : n === 0 ? 'relaxed' : 'energetic',
      targetPath: `${ROOT}/layers/mouth-${pose}-${n + 1}.png`,
    })),
  );
  layers.push(...['open', 'soft', 'half', 'closed', 'glance-left', 'glance-right']
    .map((pose) => ({ jobId: `top-hat-man-eyes-${pose}`, layer: 'eyes', pose,
      energy: null, targetPath: `${ROOT}/layers/eyes-${pose}.png` })));
  const generationPlan = seal({
    schema: 'evavo_top_hat_v3_generation_plan_v1', characterId: 'top-hat-man',
    targetRoot: ROOT,
    identity: {
      animationIdentityMaster: { asset: { sha256: MASTER_SHA, width: 1024, height: 1536 } },
      existingCharacterOnly: true, replacementCharacterAllowed: false,
      identityRedesignAllowed: false,
    },
    strategy: { name: 'continuity-first-coarse-to-fine', foundationBeforeBody: true,
      clipAnchorsBeforeInbetweens: true, adjacentApprovedReferencesRequiredForInbetweens: true,
      independentFlatFrameGenerationForbidden: true },
    phases: [{ id: 'foundation', jobs: foundation },
      { id: 'registered-layers', jobs: layers },
      { id: 'body-clips', clips: TOP_HAT_V3_CLIPS.map(clipFixture)
        .sort((a, b) => PRIORITY.indexOf(a.clipId) - PRIORITY.indexOf(b.clipId)) }],
    counts: { foundationPoses: 6, registeredLayers: 17, clips: 25,
      bodyFrames: 732, totalArtwork: 755 },
    authority: { providerExecution: false, automaticApproval: false,
      automaticPromotion: false, runtimeActivation: false, publication: false },
  });
  function binding(key, sourceJobId = null, digest = sha(key)) {
    return { artifactId: `artifact_${sha(`fixture-only:${key}`)}`, sha256: digest,
      role: 'test-fixture', approved: true, sourceJobId };
  }
  const bindings = {
    'identity:canonical': binding('canonical'),
    'identity:animation-master': binding('animation-master', null, MASTER_SHA),
    'layer:face-context': binding('face-context'),
  };
  for (const job of allJobs(generationPlan)) bindings[`job:${job.jobId}`] = binding(job.jobId, job.jobId);
  return { generationPlan, bindings, options: { allowedAdapterIds: ['fixture-adapter'] } };
}

// These bounds mirror packages/providers/src/validation.ts; the optional test
// below also runs the real provider validator when its package has been built.
function assertProviderFieldBounds(request) {
  for (const key of ['assetId', 'candidateFamilyId', 'frameId', 'layerId']) {
    if (request[key] === undefined) continue;
    assert.match(request[key], /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, key);
  }
  assert.ok(Number.isInteger(request.candidateCount));
  assert.ok(request.candidateCount >= 1 && request.candidateCount <= 8);
  if (request.seed !== undefined) {
    assert.ok(Number.isInteger(request.seed));
    assert.ok(request.seed >= 0 && request.seed <= 4_294_967_295);
  }
}

test('suite validation accepts the runtime priority order, including hat-tip away from the end', () => {
  const { generationPlan } = fixture();
  assert.equal(bodyPhase(generationPlan).clips[0].clipId, 'idle-breathe');
  assert.notEqual(bodyPhase(generationPlan).clips.at(-1).clipId, 'hat-tip');
  assert.equal(assertTopHatV3GenerationPlanContract(generationPlan).bodyFrameCount, 732);
});
test('suite accepts canonical catalogue order too', () => {
  const { generationPlan } = fixture();
  bodyPhase(generationPlan).clips.sort((a, b) =>
    TOP_HAT_V3_CLIPS.findIndex((x) => x.id === a.clipId) - TOP_HAT_V3_CLIPS.findIndex((x) => x.id === b.clipId));
  assert.equal(assertTopHatV3GenerationPlanContract(seal(generationPlan)).clipCount, 25);
});
test('suite rejects a duplicate clip even when total clip count is unchanged', () => {
  const { generationPlan } = fixture();
  const clips = bodyPhase(generationPlan).clips;
  clips[1] = structuredClone(clips[0]);
  assert.throws(() => assertTopHatV3GenerationPlanContract(seal(generationPlan)));
});
test('all 755 requests fit actual provider field bounds and have unique family IDs', () => {
  const result = compileTopHatV3ProviderPlan(fixture());
  const requests = allRequests(result);
  assert.equal(requests.length, 755);
  assert.equal(inspectTopHatV3ProviderPlan(result).readyJobs, 755);
  for (const { request } of requests) assertProviderFieldBounds(request);
  assert.equal(new Set(requests.map(({ request }) => request.candidateFamilyId)).size, 755);
});
test('compilation is deterministic without mutating caller inputs', () => {
  const input = fixture();
  const before = structuredClone(input);
  const first = compileTopHatV3ProviderPlan(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, compileTopHatV3ProviderPlan(input));
});
test('full source plan hash and job identity remain in compact-ID requests', () => {
  const input = fixture();
  const result = compileTopHatV3ProviderPlan(input);
  for (const entry of allRequests(result)) {
    assert.equal(entry.request.metadata.generationPlanSha256, input.generationPlan.planSha256);
    assert.equal(entry.request.metadata.jobId, entry.jobId);
  }
});
test('changed content with an unchanged source plan hash is rejected', () => {
  const input = fixture();
  input.generationPlan.phases[0].jobs[0].performance = 'Tampered instruction';
  assert.throws(() => compileTopHatV3ProviderPlan(input), /GENERATION_PLAN_HASH/u);
});
test('direct compiler rejects changed clip cadence even after the plan is rehashed', () => {
  const input = fixture();
  bodyPhase(input.generationPlan).clips[0].fps = 12;
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /CLIP_MISMATCH/u);
});
test('direct compiler rejects missing signature clip rather than trusting summary counts', () => {
  const input = fixture();
  bodyPhase(input.generationPlan).clips = bodyPhase(input.generationPlan).clips.filter((x) => x.clipId !== 'hat-tip');
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /CLIP_COUNT/u);
});
test('forged replacement master cannot be selected even when bindings claim approval', () => {
  const input = fixture();
  input.bindings['identity:animation-master'].sha256 = sha('wrong-image');
  assert.throws(() => compileTopHatV3ProviderPlan(input), /MASTER.*MISMATCH/u);
});
test('replacing the master in both the plan and bindings still fails its canonical pin', () => {
  const input = fixture();
  input.generationPlan.identity.animationIdentityMaster.asset.sha256 = sha('wrong-image');
  input.bindings['identity:animation-master'].sha256 = sha('wrong-image');
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /MASTER.*MISMATCH/u);
});
test('missing master remains blocked, never substituted with text-to-image', () => {
  const input = fixture();
  delete input.bindings['identity:animation-master'];
  const result = compileTopHatV3ProviderPlan(input);
  assert.equal(result.counts.ready, 0);
  assert.ok(allRequests(result).every((entry) => entry.request === null));
});
test('presentation-emphasis waits for the approved presentation-open pose', () => {
  const input = fixture();
  delete input.bindings['job:top-hat-man-foundation-presentation-open'];
  const result = compileTopHatV3ProviderPlan(input);
  const emphasis = result.foundation.find((job) => job.jobId.endsWith('presentation-emphasis'));
  assert.equal(emphasis.request, null);
  assert.ok(emphasis.blockers.some((x) => x.includes('presentation-open')));
  assert.equal(result.foundation.filter((job) => job.request !== null).length, 5);
});
test('presentation-emphasis consumes the exact approved open-hand reference', () => {
  const input = fixture();
  const request = compileTopHatV3ProviderPlan(input).foundation
    .find((job) => job.jobId.endsWith('presentation-emphasis')).request;
  assert.ok(request.references.some((ref) => ref.required &&
    ref.artifactId === input.bindings['job:top-hat-man-foundation-presentation-open'].artifactId));
});
test('in-between binding cannot impersonate a different source job', () => {
  const input = fixture();
  const clip = bodyPhase(input.generationPlan).clips[0];
  const middle = clip.waves[1].jobs[0];
  input.bindings[`job:${middle.leftApprovedAnchorJobId}`].sourceJobId = 'different-job';
  const row = allRequests(compileTopHatV3ProviderPlan(input)).find((entry) => entry.jobId === middle.jobId);
  assert.equal(row.request, null);
});
test('in-betweens retain two required temporal image references', () => {
  for (const { request } of allRequests(compileTopHatV3ProviderPlan(fixture()))) {
    if (request.continuityPhase !== 'in-between') continue;
    assert.equal(request.references.filter((x) => x.role === 'previous-key-pose' && x.required).length, 1);
    assert.equal(request.references.filter((x) => x.role === 'next-key-pose' && x.required).length, 1);
  }
});
test('same-wave temporal dependencies are rejected before scheduling', () => {
  const input = fixture();
  const clip = bodyPhase(input.generationPlan).clips[0];
  clip.waves[1].jobs[0].leftApprovedAnchorJobId = clip.waves[1].jobs[0].jobId;
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /BRACKET/u);
});
test('duplicate frame destinations cannot overwrite separate production slots', () => {
  const input = fixture();
  const [first, second] = allJobs(input.generationPlan);
  second.targetPath = first.targetPath;
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /TARGET/u);
});
test('unsafe target paths fail before provider work', () => {
  const input = fixture();
  input.generationPlan.phases[0].jobs[0].targetPath = `${ROOT}/../../outside.png`;
  seal(input.generationPlan);
  assert.throws(() => compileTopHatV3ProviderPlan(input), /TARGET/u);
});
test('isolated mouth and eye layers never demand a full body in their style', () => {
  for (const { request } of compileTopHatV3ProviderPlan(fixture()).registeredLayers) {
    const mustHave = request.style.mustHave.join(' ');
    assert.doesNotMatch(mustHave, /full-body anatomy|same tuxedo|complete hat/iu);
    assert.match(mustHave, /isolated.*layer/iu);
    assert.match(request.style.compositionRules.join(' '), /transparent/iu);
  }
});
test('relaxed and energetic mouth variants carry different explicit acting instructions', () => {
  const rows = compileTopHatV3ProviderPlan(fixture()).registeredLayers;
  const a = rows.find((entry) => entry.jobId === 'top-hat-man-mouth-wide-1').request;
  const b = rows.find((entry) => entry.jobId === 'top-hat-man-mouth-wide-2').request;
  assert.match(a.creativeIntent, /relaxed/u);
  assert.match(b.creativeIntent, /energetic/u);
  assert.notEqual(a.shot.action, b.shot.action);
});
for (const candidateCount of [0, 9, 1.5, '3', NaN]) {
  test(`direct compiler rejects invalid candidate count ${String(candidateCount)}`, () => {
    const input = fixture();
    input.options.foundationCandidateCount = candidateCount;
    assert.throws(() => compileTopHatV3ProviderPlan(input), /OPTION/u);
  });
}
for (const seed of [-1, 4_294_967_296, 0.5, '4', NaN]) {
  test(`direct compiler rejects invalid seed ${String(seed)}`, () => {
    const input = fixture();
    input.options.seed = seed;
    assert.throws(() => compileTopHatV3ProviderPlan(input), /OPTION/u);
  });
}
test('seed zero is retained and highest uint32 seed wraps frame offsets safely', () => {
  for (const seed of [0, 4_294_967_295]) {
    const input = fixture(); input.options.seed = seed;
    const result = compileTopHatV3ProviderPlan(input);
    assert.equal(result.foundation[0].request.seed, seed);
    for (const { request } of allRequests(result)) assertProviderFieldBounds(request);
  }
});
test('adapter allowlist and preferred adapter are checked at the direct API boundary', () => {
  for (const options of [{ allowedAdapterIds: [] }, { allowedAdapterIds: ['bad adapter'] },
    { allowedAdapterIds: ['a'], preferredAdapterId: 'b' }]) {
    const input = fixture(); input.options = options;
    assert.throws(() => compileTopHatV3ProviderPlan(input), /ADAPTER|OPTION/u);
  }
});
test('invalid options fail even when all references are absent', () => {
  const input = fixture(); input.bindings = {}; input.options.seed = -1;
  assert.throws(() => compileTopHatV3ProviderPlan(input), /OPTION/u);
});
test('all requests preserve no-fallback, no-promotion and no-runtime-activation policy', () => {
  const result = compileTopHatV3ProviderPlan(fixture());
  for (const { request } of allRequests(result)) {
    assert.equal(request.selection.allowFallback, false);
    assert.equal(request.metadata.automaticPromotion, false);
    assert.equal(request.metadata.runtimeActivation, false);
    assert.equal(request.target.width, 1024);
    assert.equal(request.target.height, 1536);
  }
});
const builtProvider = new URL('../packages/providers/dist/index.js', import.meta.url);
test('built provider accepts every produced request', {
  skip: existsSync(builtProvider) ? false : 'Provider package is not built in this checkout; no provider integration result is claimed.',
}, async () => {
  const { validateProviderCandidateRequest } = await import(builtProvider.href);
  for (const { request } of allRequests(compileTopHatV3ProviderPlan(fixture()))) {
    assert.doesNotThrow(() => validateProviderCandidateRequest(request));
  }
});

function withCliFixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'top-hat-contract-test-'));
  try {
    const input = fixture();
    const plan = path.join(root, 'plan.json');
    const bindings = path.join(root, 'bindings.json');
    const output = path.join(root, 'provider.json');
    writeFileSync(plan, JSON.stringify(input.generationPlan));
    writeFileSync(bindings, JSON.stringify(input.bindings));
    const cli = fileURLToPath(new URL('./compile-top-hat-v3-provider-plan.mjs', import.meta.url));
    const invoke = (extra = []) => spawnSync(process.execPath, [cli,
      '--generation-plan', plan, '--bindings', bindings,
      '--output', output, '--allowed-adapter', 'fixture-adapter', ...extra],
    { encoding: 'utf8', timeout: 15_000 });
    run({ invoke, output });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('CLI compiles a priority-ordered 755-job fixture without provider execution', () => {
  withCliFixture(({ invoke, output }) => {
    const result = invoke();
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.totalJobs, 755);
    assert.equal(summary.signatureClipFrames, 28);
    assert.equal(summary.executionPerformed, false);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).counts.total, 755);
  });
});
test('CLI preserves an existing plan rather than overwriting it', () => {
  withCliFixture(({ invoke, output }) => {
    writeFileSync(output, 'original');
    assert.notEqual(invoke().status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'original');
  });
});
for (const flags of [['--seed', 'invalid'], ['--seed'], ['--seed', '1', '--seed', '2'],
  ['--foundation-candidates', '9']]) {
  test(`CLI rejects malformed options: ${flags.join(' ')}`, () => {
    withCliFixture(({ invoke, output }) => {
      const result = invoke(flags);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(output), false);
    });
  });
}

export { fixture as createTopHatV3ContractTestFixture, seal as sealTopHatV3ContractTestPlan };
