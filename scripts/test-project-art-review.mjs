#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  REVIEW_DRAFT_SCHEMA,
  canonicalJson,
  REVIEW_PLAN_SCHEMA,
  ProjectArtReviewError,
  buildProjectArtReviewBundle,
  buildProjectArtReviewBundleFile,
  compileProjectArtReview,
  compileProjectArtReviewFile,
  finalizeProjectArtReviewFiles,
} from './project-art/review-studio.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-review-'));
const expectCode = async (operation, code) => {
  await assert.rejects(operation, (error) => {
    assert.equal(error instanceof ProjectArtReviewError, true);
    assert.equal(error.code, code);
    return true;
  });
};
const svg = (fill, x = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="transparent"/><rect x="${x}" y="2" width="8" height="10" fill="${fill}"/></svg>\n`;

try {
  await mkdir(path.join(temporary, 'art', 'frames'), { recursive: true });
  await writeFile(path.join(temporary, 'art', 'baseline.svg'), svg('#ff244e'));
  await writeFile(path.join(temporary, 'art', 'candidate.svg'), svg('#ffffff'));
  await writeFile(path.join(temporary, 'art', 'frames', 'frame-00.svg'), svg('#ff244e', 1));
  await writeFile(path.join(temporary, 'art', 'frames', 'frame-01.svg'), svg('#ff244e', 3));

  const request = {
    schema: 'evavo.project-art-review-request.v1',
    reviewId: 'fixture-review-001',
    projectId: 'fixture-game',
    title: 'Fixture visual review',
    purpose: 'Compare a candidate and inspect an exact animation sequence.',
    ui: {
      defaultBackground: 'checker',
      defaultFit: 'contain',
      defaultMode: 'grid',
      showPixelGrid: true,
      allowLinearSampling: true,
    },
    groups: [
      {
        id: 'comparison',
        kind: 'comparison',
        title: 'Before and after',
        requiredGates: ['technical', 'styleConsistency', 'composition', 'runtimeReadiness'],
        items: [
          { id: 'baseline', role: 'baseline', label: 'Baseline', source: 'art/baseline.svg' },
          { id: 'candidate', role: 'candidate', label: 'Candidate', source: 'art/candidate.svg' },
        ],
      },
      {
        id: 'walk-cycle',
        kind: 'animation',
        title: 'Walk cycle',
        playback: { frameDurationMs: 80, loop: true },
        items: [
          { id: 'frame-00', role: 'frame', label: 'Frame 00', source: 'art/frames/frame-00.svg', frameIndex: 0 },
          { id: 'frame-01', role: 'frame', label: 'Frame 01', source: 'art/frames/frame-01.svg', frameIndex: 1 },
        ],
      },
    ],
  };
  const requestPath = path.join(temporary, 'request.json');
  const planPath = path.join(temporary, 'plan.json');
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  const plan = await compileProjectArtReviewFile(requestPath, planPath, {
    workspaceRoot: temporary,
    compiledAt: '2026-08-09T12:00:00.000Z',
  });
  assert.equal(plan.schema, REVIEW_PLAN_SCHEMA);
  assert.equal(plan.sourceSummary.itemCount, 4);
  assert.equal(plan.groups[1].items[0].frameIndex, 0);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.values(plan.authority).every((value) => value === false), true);

  const bundle = await buildProjectArtReviewBundleFile(planPath, 'review/bundle');
  assert.equal(bundle.manifest.networkAccessRequired, false);
  assert.equal(bundle.manifest.externalAssetsRequired, false);
  assert.equal(bundle.receipt.approvalPerformed, false);
  const html = await readFile(path.join(bundle.outputRoot, 'index.html'), 'utf8');
  const app = await readFile(path.join(bundle.outputRoot, 'app.js'), 'utf8');
  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /connect-src 'none'/u);
  assert.equal(/https?:\/\//u.test(app), false);
  assert.equal(/fetch\s*\(/u.test(app), false);
  for (const group of plan.groups) {
    for (const item of group.items) {
      const source = await readFile(path.join(temporary, item.source));
      const retained = await readFile(path.join(bundle.outputRoot, item.assetPath));
      assert.deepEqual(retained, source);
    }
  }

  const draftPath = path.join(bundle.outputRoot, 'decision-template.json');
  const draft = JSON.parse(await readFile(draftPath, 'utf8'));
  assert.equal(draft.schema, REVIEW_DRAFT_SCHEMA);
  draft.reviewer = {
    mode: 'hybrid',
    id: 'fixture-reviewer',
    reviewedAt: '2026-08-09T12:05:00.000Z',
    reason: 'Functional fixture review.',
  };
  for (const decision of draft.decisions) {
    for (const gate of Object.keys(decision.gates)) decision.gates[gate] = 'not-applicable';
    const required = plan.groups.find((group) => group.id === decision.groupId).requiredGates;
    for (const gate of required) decision.gates[gate] = 'pass';
    decision.disposition = 'reference-only';
  }
  const baseline = draft.decisions.find((decision) => decision.itemId === 'baseline');
  baseline.disposition = 'keep';
  const candidate = draft.decisions.find((decision) => decision.itemId === 'candidate');
  candidate.disposition = 'edit';
  candidate.gates.technical = 'fail';
  candidate.gates.composition = 'fail';
  candidate.defects = ['Transparent edge requires cleanup.'];
  candidate.requiredChanges = ['Remove the contaminated matte while preserving the silhouette.'];
  candidate.preserve = ['Overall pose and proportions.'];
  const decisionsPath = path.join(temporary, 'review-draft.json');
  await writeFile(decisionsPath, `${JSON.stringify(draft, null, 2)}\n`);
  const finalized = await finalizeProjectArtReviewFiles(planPath, decisionsPath, 'review/final');
  assert.equal(finalized.receipt.dispositionCounts.keep, 1);
  assert.equal(finalized.receipt.dispositionCounts.edit, 1);
  assert.equal(finalized.receipt.authority.candidateApproval, false);
  assert.equal(finalized.decisions.independentApprovalPerformed, false);
  assert.match(finalized.decisions.decisionSha256, /^[a-f0-9]{64}$/u);
  assert.match(finalized.receipt.receiptSha256, /^[a-f0-9]{64}$/u);

  await expectCode(
    () => buildProjectArtReviewBundleFile(planPath, 'review/bundle'),
    'PROJECT_ART_REVIEW_CREATE_ONLY',
  );
  await expectCode(
    () => finalizeProjectArtReviewFiles(planPath, decisionsPath, 'review/final'),
    'PROJECT_ART_REVIEW_CREATE_ONLY',
  );

  const duplicate = structuredClone(request);
  duplicate.groups[1].items[0].id = 'baseline';
  await expectCode(
    () => compileProjectArtReview(duplicate, {
      workspaceRoot: temporary,
      compiledAt: '2026-08-09T12:06:00.000Z',
    }),
    'PROJECT_ART_REVIEW_ITEM_DUPLICATE',
  );

  const staleRequest = structuredClone(request);
  staleRequest.reviewId = 'fixture-review-stale';
  const stalePlanPath = path.join(temporary, 'stale-plan.json');
  await writeFile(path.join(temporary, 'stale-request.json'), `${JSON.stringify(staleRequest, null, 2)}\n`);
  await compileProjectArtReviewFile(path.join(temporary, 'stale-request.json'), stalePlanPath, {
    workspaceRoot: temporary,
    compiledAt: '2026-08-09T12:07:00.000Z',
  });
  await writeFile(path.join(temporary, 'art', 'candidate.svg'), svg('#000000'));
  await expectCode(
    () => buildProjectArtReviewBundleFile(stalePlanPath, 'review/stale'),
    'PROJECT_ART_REVIEW_SOURCE_CHANGED',
  );
  await writeFile(path.join(temporary, 'art', 'candidate.svg'), svg('#ffffff'));

  const missing = structuredClone(draft);
  missing.decisions.pop();
  await writeFile(path.join(temporary, 'missing.json'), `${JSON.stringify(missing, null, 2)}\n`);
  await expectCode(
    () => finalizeProjectArtReviewFiles(planPath, path.join(temporary, 'missing.json'), 'review/missing-final'),
    'PROJECT_ART_REVIEW_DECISION_SET_INVALID',
  );

  const invalidKeep = structuredClone(draft);
  const invalidKeepDecision = invalidKeep.decisions.find((decision) => decision.itemId === 'baseline');
  invalidKeepDecision.gates.technical = 'fail';
  invalidKeepDecision.defects = ['Failure hidden behind keep.'];
  await writeFile(path.join(temporary, 'invalid-keep.json'), `${JSON.stringify(invalidKeep, null, 2)}\n`);
  await expectCode(
    () => finalizeProjectArtReviewFiles(planPath, path.join(temporary, 'invalid-keep.json'), 'review/invalid-keep-final'),
    'PROJECT_ART_REVIEW_KEEP_INVALID',
  );

  const invalidRepair = structuredClone(draft);
  const invalidRepairDecision = invalidRepair.decisions.find((decision) => decision.itemId === 'candidate');
  invalidRepairDecision.defects = [];
  await writeFile(path.join(temporary, 'invalid-repair.json'), `${JSON.stringify(invalidRepair, null, 2)}\n`);
  await expectCode(
    () => finalizeProjectArtReviewFiles(planPath, path.join(temporary, 'invalid-repair.json'), 'review/invalid-repair-final'),
    'PROJECT_ART_REVIEW_REPAIR_INVALID',
  );

  const forgedPlan = structuredClone(plan);
  forgedPlan.title = 'Changed after self-hash';
  await expectCode(
    () => buildProjectArtReviewBundle(forgedPlan, 'review/forged'),
    'PROJECT_ART_REVIEW_HASH_MISMATCH',
  );

  const rehashedAuthority = structuredClone(plan);
  rehashedAuthority.authority.candidateApproval = true;
  delete rehashedAuthority.planSha256;
  rehashedAuthority.planSha256 = createHash('sha256')
    .update(canonicalJson(rehashedAuthority))
    .digest('hex');
  await expectCode(
    () => buildProjectArtReviewBundle(rehashedAuthority, 'review/rehashed-authority'),
    'PROJECT_ART_REVIEW_PLAN_AUTHORITY_INVALID',
  );

  if (process.platform !== 'win32') {
    await symlink(path.join(temporary, 'art', 'baseline.svg'), path.join(temporary, 'art', 'linked.svg'));
    const linked = structuredClone(request);
    linked.reviewId = 'fixture-review-linked';
    linked.groups = [{
      id: 'linked',
      kind: 'general',
      title: 'Linked source',
      items: [{ id: 'linked-item', role: 'other', source: 'art/linked.svg' }],
    }];
    await expectCode(
      () => compileProjectArtReview(linked, {
        workspaceRoot: temporary,
        compiledAt: '2026-08-09T12:08:00.000Z',
      }),
      'PROJECT_ART_REVIEW_PATH_SYMLINK',
    );
  }

  console.log('Project Art Review Studio regressions passed.');
  console.log('- exact source identities, offline bundle bytes and create-only atomic outputs verified');
  console.log('- comparison, animation, draft export and sealed review receipts verified');
  console.log('- tampering, symlinks, duplicate identities, incomplete decisions and hidden repair intent fail closed');
  console.log('- approval, promotion, repository mutation and publication authority remain false');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
