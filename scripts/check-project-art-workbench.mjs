#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativeFiles = [
  'scripts/project-art/common.mjs',
  'scripts/project-art/intelligence.mjs',
  'scripts/project-art/sandbox.mjs',
  'scripts/project-art/reference-derived.mjs',
  'scripts/project-art/persistent-workspace.mjs',
  'scripts/project-art/avatar-animation-suite.mjs',
  'scripts/compile-project-art-intelligence.mjs',
  'scripts/compile-project-art-sandbox.mjs',
  'scripts/compile-reference-derived-image-plan.mjs',
  'scripts/stage-reference-derived-artifacts.mjs',
  'scripts/compile-project-art-loop-closure.mjs',
  'scripts/check-project-art-loop-closure.mjs',
  'scripts/test-project-art-loop-closure.mjs',
  'scripts/check-project-art-workbench.mjs',
  'scripts/test-project-art-workbench.mjs',
  'scripts/test-project-art-workspace-mcp.mjs',
  'scripts/persistent-artist-workspace.mjs',
  'scripts/check-persistent-artist-workspace.mjs',
  'scripts/test-persistent-artist-workspace.mjs',
  'scripts/check-project-art-mastering-and-motion.mjs',
  'scripts/test-project-art-mastering-and-motion.mjs',
  'scripts/compile-project-art-avatar-animation-suite.mjs',
  'scripts/test-project-art-avatar-animation-suite.mjs',
  'tools/run_project_art_sandbox.py',
  'tools/run_project_art_loop_closure.py',
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_avatar_animation_suite_mcp.mjs',
  'config/project-art-operations.v1.json',
  'config/mcp.project-art-workspace.windows.example.json',
  'docs/PROJECT_ART_WORKBENCH.md',
  'docs/PERSISTENT_ARTIST_WORKSPACE.md',
  'docs/PROJECT_ART_MASTERING_AND_MOTION.md',
  'docs/PROJECT_ART_AVATAR_ANIMATION_SUITE.md',
  'docs/PROJECT_ART_LOOP_CLOSURE.md',
  'docs/PROJECT_ART_CHAT_INTAKE_AND_ATLASES.md',
  'docs/TRANSPARENCY_PRODUCTION_STANDARD.md',
  'docs/ARTIST_AUTOMATION_CAPABILITY_MAP.md',
  '.github/workflows/project-art-workbench.yml',
  'package.json',
];
const contents = new Map();
for (const relative of relativeFiles) {
  contents.set(relative, await readFile(path.join(root, relative), 'utf8'));
}

const registry = JSON.parse(contents.get('config/project-art-operations.v1.json'));
assert.equal(registry.schema, 'evavo.project-art-operations.v1');
assert.equal(registry.maximumDecodedPixels, 220_000_000);
assert.equal(registry.maximumTotalSourceBytes, 17_179_869_184);
assert.equal(registry.maximumOutputFiles, 20_000);
assert.equal(registry.maximumOutputBytes, 2_147_483_648);
assert.equal(registry.maximumTotalOutputBytes, 17_179_869_184);
assert.equal(registry.rules.sourceOverwriteAllowed, false);
assert.equal(registry.rules.wholeRunAtomicPublication, true);
assert.equal(registry.rules.providerExecution, false);
assert.equal(registry.rules.candidateApproval, false);
assert.equal(registry.rules.candidatePromotion, false);
assert.equal(registry.rules.targetRepositoryMutation, false);
assert.equal(registry.rules.forcePush, false);
const expectedOperations = [
  'inspect',
  'trim-alpha',
  'crop',
  'pad-canvas',
  'resize',
  'pixel-resize',
  'flip-horizontal',
  'flip-vertical',
  'rotate-90',
  'rotate-180',
  'rotate-270',
  'translate',
  'colour-replace',
  'brightness',
  'contrast',
  'saturation',
  'sharpness',
  'gaussian-blur',
  'unsharp-mask',
  'alpha-erode',
  'alpha-dilate',
  'alpha-threshold',
  'connected-matte-to-alpha',
  'edge-decontaminate',
  'hidden-rgb-rebuild',
  'palette-normalize',
  'quantize',
  'autocontrast',
  'levels',
  'outline',
  'rotate',
  'affine-transform',
  'perspective-transform',
  'grayscale',
  'invert',
  'posterize',
  'threshold',
  'gamma',
  'hue-shift',
  'curves',
  'channel-mixer',
  'box-blur',
  'median-filter',
  'motion-blur',
  'emboss',
  'find-edges',
  'edge-enhance',
  'alpha-feather',
  'defringe',
  'drop-shadow',
  'outer-glow',
  'rim-light',
  'normal-map-from-height',
  'convert',
  'optimize',
];
assert.deepEqual(registry.operations.map((operation) => operation.id), expectedOperations);
assert.deepEqual(registry.taskKinds, ['image', 'video-frame-extract', 'slice-sheet', 'assemble-sheet', 'sequence-review', 'image-composite', 'image-compare', 'image-master', 'motion-sequence']);

const sourceAssertions = {
  'scripts/project-art/avatar-animation-suite.mjs': [
    'evavo.project-art-avatar-animation-suite-request.v1',
    'evavo.project-art-avatar-animation-suite-plan.v1',
    'paintedGridNeverAcceptedAsAlpha: true',
    'borderConnectedSegmentationOnly: true',
    'edgeColourUnmixingRequired: true',
    'multipleIdleVariants: 4',
    'multipleTalkVariants: 6',
    'productionReady: false',
    'runtimeActivationAllowed: false',
  ],
  'scripts/project-art/intelligence.mjs': [
    'evavo.project-art-intelligence.v1',
    'evavo.project-art-queue-seed.v1',
    'engine-index-required',
    'requiresFreshExecutionAuthorization: true',
    'providerExecution: false',
    'targetRepositoryMutation: false',
  ],
  'scripts/project-art/sandbox.mjs': [
    'evavo.project-art-sandbox-request.v1',
    'evavo.project-art-sandbox-plan.v1',
    'wholeRunAtomicPublication: true',
    'sourceHashesRevalidatedBeforeExecution: true',
    'sourceHashesRevalidatedAfterExecution: true',
    'providerExecution: false',
    'candidateApproval: false',
    'maximumDecodedPixels: boundedInteger',
    'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
    'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
    'PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT',
    'PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT',
    'plannedMaximumOutputFiles',
    'PROJECT_ART_SANDBOX_SOURCE_IDENTITY_CHANGED',
    'const MAXIMUM_TASKS = 2_000',
    'const MAXIMUM_EXTERNAL_SOURCES = 10_000',
    'const MAXIMUM_TOTAL_SOURCE_BYTES = 16 * 1024 * 1024 * 1024',
    'const MAXIMUM_OUTPUT_FILES = 20_000',
    'const MAXIMUM_TOTAL_OUTPUT_BYTES = 16 * 1024 * 1024 * 1024',
    'assertBoundTaskPixelBudgets',
    'MAXIMUM_IMAGE_DIMENSION',
    "kind: 'image-master'",
    "kind: 'motion-sequence'",
    "kind: 'video-frame-extract'",
    'normalizeMasterTask',
    'normalizeMotionTask',
    'normalizeVideoFrameTask',
    'operationWorkingSetMultiplier',
    'imageOperationDimensions',
    'maximumUniqueColours',
    'motionBlurSamples',
  ],
  'scripts/project-art/persistent-workspace.mjs': [
    'evavo.persistent-artist-workspace-create-request.v1',
    'evavo.persistent-artist-workspace-manifest.v1',
    'evavo.persistent-artist-workspace-snapshot-plan.v1',
    'evavo.storage-art-ingest-request.v1',
    'appendOnlyVersions: true',
    'PERSISTENT_ARTIST_WORKSPACE_REQUEST_BYTES_MISMATCH',
    'PERSISTENT_ARTIST_WORKSPACE_SOURCE_IDENTITY_CHANGED',
    'storageWrite: false',
    'repositoryMutation: false',
    'bytesFlowThroughMcp: false',
  ],
  'scripts/persistent-artist-workspace.mjs': [
    'evavo.persistent-artist-workspace-capabilities.v1',
    'compile-create',
    'run-create',
    'compile-snapshot',
    'run-snapshot',
    'storage-handoff',
  ],
  'scripts/check-persistent-artist-workspace.mjs': [
    'Persistent Artist Workspace guard passed.',
    'project-art:workspace:persistent:check',
    'EVAVO Storage handoffs remain exact and independently authorised',
  ],
  'scripts/test-persistent-artist-workspace.mjs': [
    'Persistent Artist Workspace regressions passed.',
    'append-only exact snapshots',
    'evavo.storage-art-ingest-request.v1',
  ],
  'scripts/check-project-art-mastering-and-motion.mjs': [
    'Project Art mastering and motion guard passed.',
    'evavo.project-art-mastering-report.v1',
    'evavo.project-art-motion-sequence.v1',
    'project-art:mastering:check',
  ],
  'scripts/test-project-art-mastering-and-motion.mjs': [
    'Project Art mastering and motion regressions passed.',
    'PROJECT_ART_MASTERING_PROFILE_FAILED',
    'correctly rehashed operation-type, output-count or video-bound attacks fail closed',
  ],
  'scripts/project-art/reference-derived.mjs': [
    'evavo.reference-derived-image-request.v1',
    'evavo.reference-derived-image-plan.v1',
    'in-between-frame',
    'previous-key-pose',
    'next-key-pose',
    'requiresFreshAdmission: true',
    'requiresFreshExecutionAuthorization: true',
    'independentApprovalPerformed: false',
    'providerExecution: false',
  ],
  'scripts/compile-project-art-loop-closure.mjs': [
    'evavo.project-art-loop-closure-request.v1',
    'evavo.project-art-loop-closure-plan.v1',
    'fromFrameIndex: frames.length - 1',
    'toFrameIndex: 0',
    'identicalClosureAccepted: true',
    'sourceHashesRevalidatedBeforeExecution: true',
    'sourceHashesRevalidatedAfterExecution: true',
    'wholeRunAtomicPublication: true',
    'providerExecution',
    'targetRepositoryMutation',
  ],
  'scripts/check-project-art-loop-closure.mjs': [
    'Project Art loop-closure guard passed.',
    'project-art:loop:compile',
    'project-art:loop:run',
    'project-art:loop:check',
    'pnpm run project-art:loop:check',
  ],
  'scripts/test-project-art-loop-closure.mjs': [
    'Project Art loop-closure tests passed.',
    'identical first/last closure is accepted',
    'loop-closure-excessive-frame-change',
    'loop-closure-centroid-shift-exceeded',
    'PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH',
    'PROJECT_ART_LOOP_CLOSURE_LIMIT_DRIFT',
  ],
  'tools/run_project_art_loop_closure.py': [
    'evavo.project-art-loop-closure-review.v1',
    'evavo.project-art-loop-closure-receipt.v1',
    'loop-closure-excessive-frame-change',
    'loop-closure-mean-channel-delta-exceeded',
    'loop-closure-alpha-change-exceeded',
    'loop-closure-centroid-shift-exceeded',
    'identicalClosureAccepted',
    'difference.png',
    'overlay.png',
    'onion-skin.png',
    'os.replace(staging, output)',
    'creativeApprovalPerformed',
    'runtimeApprovalPerformed',
  ],
  'tools/project_art_workspace_mcp.mjs': [
    'evavo.project-art-workspace-capabilities.v1',
    'evavo_art_workspace_capabilities',
    'evavo_art_compile_project_intelligence',
    'evavo_art_compile_sandbox',
    'evavo_art_run_sandbox',
    'evavo_art_compile_reference_plan',
    'evavo_art_stage_reference_artifacts',
    'evavo_art_compile_workspace_create',
    'evavo_art_run_workspace_create',
    'evavo_art_compile_workspace_snapshot',
    'evavo_art_run_workspace_snapshot',
    'evavo_art_prepare_storage_handoff',
    'persistent-artist-workspace',
    'professional-mastering',
    'keyframed-motion-sequence',
    'evavo-storage-handoff',
    'EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE',
    'EVAVO_ART_WORKSPACE_MCP_TIMEOUT_MS',
    'bytesFlowThroughMcp: false',
    'credentialsForwardedToSubprocess: false',
    'rawCommandOutputReturned: false',
    'repositoryMutation: false',
    'providerExecution: false',
    'contains a symbolic-link component',
    'shell: false',
  ],
  'config/mcp.project-art-workspace.windows.example.json': [
    'EVAVO_ART_WORKSPACE_ROOTS',
    'EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE',
    'EVAVO_ART_WORKSPACE_PYTHON',
    'EVAVO_ART_WORKSPACE_MCP_TIMEOUT_MS',
    'EVAVO_ART_FFMPEG_BIN',
    'EVAVO_ART_FFPROBE_BIN',
  ],
  'tools/run_project_art_sandbox.py': [
    'evavo.project-art-sandbox-receipt.v1',
    'wholeRunAtomicPublication',
    'sourceMutation": False',
    'providerExecution": False',
    'candidateApproval": False',
    'targetRepositoryMutation": False',
    'os.replace(staging, output_root)',
    'maximum_decoded_pixels',
    'require_pixel_budget',
    'require_active_pixel_budget',
    'preflight_image_set',
    'maximum_total_source_bytes',
    'maximum_output_files',
    'maximum_total_output_bytes',
    'bound_external_source_bytes',
    'planned_output_files',
    'MAXIMUM_TASKS = 2_000',
    'MAXIMUM_EXTERNAL_SOURCES = 10_000',
    'MAXIMUM_TOTAL_SOURCE_BYTES = 16 * 1024 * 1024 * 1024',
    'MAXIMUM_OUTPUT_FILES = 20_000',
    'MAXIMUM_TOTAL_OUTPUT_BYTES = 16 * 1024 * 1024 * 1024',
    'PROJECT_ART_SANDBOX_OUTPUT_BYTES_LIMIT',
    'PROJECT_ART_SANDBOX_TOTAL_OUTPUT_BYTES_LIMIT',
    'MASTERING_REPORT_SCHEMA = "evavo.project-art-mastering-report.v1"',
    'MOTION_MANIFEST_SCHEMA = "evavo.project-art-motion-sequence.v1"',
    'PROJECT_ART_MASTERING_PROFILE_FAILED',
    'execute_master_task',
    'execute_motion_task',
    'drop-shadow target',
    'outer-glow target',
    'VIDEO_FRAME_MANIFEST_SCHEMA = "evavo.project-art-video-frame-extraction.v1"',
    'execute_video_frame_task',
    'shell=False',
    'timeout=timeout_seconds',
  ],
  'docs/PROJECT_ART_WORKBENCH.md': [
    'Project intelligence',
    'Atomic sandbox image work',
    'Sprite-sheet and animation work',
    'Similar images and matching animation frames',
    'Exact authority boundary',
    'Callable agent workbench',
    'evavo_art_run_sandbox',
    'credential-redacted environment',
    'non-symbolic',
    'project_art_review_mcp.mjs',
    'decoded-image boundary',
    'active decoded-image working set',
    'aggregate source-byte boundary',
    'create-only output-file and output-byte budgets',
  ],
  'docs/PERSISTENT_ARTIST_WORKSPACE.md': [
    '# Persistent Artist Workspace',
    'immutable originals',
    'append-only versions',
    'masters/',
    'exports/',
    'EVAVO Storage',
    'ChatGPT',
    'Claude',
    'technical pass is not creative approval',
  ],
  'docs/PROJECT_ART_MASTERING_AND_MOTION.md': [
    '# Project Art mastering and motion',
    'image-master',
    'motion-sequence',
    'edge-decontaminate',
    'defringe',
    'drop-shadow',
    'outer-glow',
    'technical pass is not creative approval',
    'EVAVO Storage',
    'No arbitrary shell',
  ],
  'docs/TRANSPARENCY_PRODUCTION_STANDARD.md': [
    '# Transparency production standard',
    'Ambiguous natural-background recovery',
    'soft mask candidate',
    'SAM 2',
    'BiRefNet',
    'hostile solid plates',
  ],
  'docs/ARTIST_AUTOMATION_CAPABILITY_MAP.md': [
    '# Artist automation capability map',
    'image-composite.sourceRect',
    'video-frame-extract',
    'evavo-3d-studio',
    'TileSetAtlasSource',
    'Fully automatic mechanical stages',
  ],
  'docs/PROJECT_ART_LOOP_CLOSURE.md': [
    '# Project Art loop-closure review',
    'final frame back to frame zero',
    'Exact identical endpoints are valid',
    'maximumChangedFraction',
    'maximumMeanChannelDelta',
    'maximumAlphaChangedFraction',
    'maximumCentroidShiftPixels',
    'No creative approval',
    'No source, provider, repository, Git, deployment or publication authority',
  ],
  '.github/workflows/project-art-workbench.yml': [
    'PROJECT_ART_REQUIRE_PILLOW: "1"',
    'PROJECT_ART_REQUIRE_PROVIDER_VALIDATION: "1"',
    'Verify persistent Artist Workspace contracts and regressions',
    'Run professional mastering and keyframed motion adversary',
    'pnpm run project-art:workspace:persistent:check',
    'pnpm run project-art:mastering:check',
    'Run callable project-art workspace MCP regressions',
    'credentialsForwardedToSubprocess: false',
    'pnpm run build:domain',
    'pnpm check',
    'git diff --exit-code',
  ],
};
for (const [relative, tokens] of Object.entries(sourceAssertions)) {
  const source = contents.get(relative);
  for (const token of tokens) {
    assert.ok(source.includes(token), `${relative} is missing permanent token: ${token}`);
  }
}

for (const relative of [
  'scripts/project-art/intelligence.mjs',
  'scripts/project-art/sandbox.mjs',
  'scripts/project-art/reference-derived.mjs',
  'scripts/project-art/persistent-workspace.mjs',
  'scripts/project-art/avatar-animation-suite.mjs',
  'scripts/compile-project-art-loop-closure.mjs',
]) {
  const source = contents.get(relative);
  for (const forbidden of [
    'candidateApproval: true',
    'candidatePromotion: true',
    'targetRepositoryMutation: true',
    'publication: true',
    'deployment: true',
    'forcePush: true',
  ]) {
    assert.ok(!source.includes(forbidden), `${relative} contains forbidden authority: ${forbidden}`);
  }
}
for (const relative of [
  'tools/run_project_art_sandbox.py',
  'tools/run_project_art_loop_closure.py',
]) {
  assert.ok(!contents.get(relative).includes('git push'), `${relative} contains git push`);
}
assert.equal(
  contents.get('tools/run_project_art_sandbox.py').split('subprocess.run(').length - 1,
  1,
  'the sandbox runtime must have one controlled media subprocess boundary',
);
for (const forbidden of ['shell=True', 'os.system(', 'subprocess.Popen(', 'subprocess.call(', 'subprocess.check_output(']) {
  assert.ok(!contents.get('tools/run_project_art_sandbox.py').includes(forbidden), `sandbox runtime contains unsafe process token: ${forbidden}`);
}
assert.ok(!contents.get('tools/run_project_art_loop_closure.py').includes('subprocess'), 'loop-closure runtime must not execute processes');
for (const relative of [
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_avatar_animation_suite_mcp.mjs',
]) {
  for (const forbidden of ['git push', 'candidateApproval: true', 'candidatePromotion: true', 'repositoryMutation: true', 'forcePush: true']) {
    assert.ok(!contents.get(relative).includes(forbidden), `${relative} contains forbidden token: ${forbidden}`);
  }
}

const packageJson = JSON.parse(contents.get('package.json'));
const expectedScripts = {
  'project-art:intelligence': 'node scripts/compile-project-art-intelligence.mjs',
  'project-art:sandbox:compile': 'node scripts/compile-project-art-sandbox.mjs',
  'project-art:sandbox:run': 'python tools/run_project_art_sandbox.py',
  'project-art:reference:compile': 'node scripts/compile-reference-derived-image-plan.mjs',
  'project-art:reference:stage': 'node scripts/stage-reference-derived-artifacts.mjs',
  'project-art:loop:compile': 'node scripts/compile-project-art-loop-closure.mjs',
  'project-art:loop:run': 'python tools/run_project_art_loop_closure.py',
  'project-art:loop:check': 'node scripts/check-project-art-loop-closure.mjs && node scripts/test-project-art-loop-closure.mjs',
  'project-art:avatar-animation:compile': 'node scripts/compile-project-art-avatar-animation-suite.mjs',
  'project-art:avatar-animation:mcp': 'node tools/project_art_avatar_animation_suite_mcp.mjs',
  'project-art:avatar-animation:check': 'node --test scripts/test-project-art-avatar-animation-suite.mjs',
  'project-art:workspace:mcp:check': 'node scripts/test-project-art-workspace-mcp.mjs',
  'project-art:workspace:persistent': 'node scripts/persistent-artist-workspace.mjs',
  'project-art:workspace:persistent:check': 'node scripts/check-persistent-artist-workspace.mjs && node scripts/test-persistent-artist-workspace.mjs',
  'project-art:eva-source-repair:check': 'node scripts/check-project-art-eva-source-repair-intake.mjs && node --test scripts/test-project-art-eva-source-repair-intake.mjs scripts/test-project-art-eva-source-repair-candidate-assurance.mjs',
  'project-art:eva-source-repair:assurance': 'node scripts/compile-project-art-eva-source-repair-candidate-assurance.mjs',
  'project-art:mastering:check': 'node scripts/check-project-art-mastering-and-motion.mjs && node scripts/test-project-art-mastering-and-motion.mjs',
  'project-art:check': 'node scripts/check-project-art-workbench.mjs && node scripts/test-project-art-workbench.mjs && pnpm run project-art:avatar-assurance:check && pnpm run project-art:avatar-animation:check && pnpm run project-art:eva-source-repair:check && pnpm run project-art:mastering:check && pnpm run project-art:workspace:persistent:check && pnpm run project-art:loop:check && pnpm run project-art:workspace:mcp:check',
};
for (const [name, command] of Object.entries(expectedScripts)) {
  assert.equal(packageJson.scripts[name], command, `package script ${name} changed`);
}
const projectArtCheck = packageJson.scripts['project-art:check'];
const orderedCommands = [
  'node scripts/test-project-art-workbench.mjs',
  'pnpm run project-art:avatar-animation:check',
  'pnpm run project-art:eva-source-repair:check',
  'pnpm run project-art:mastering:check',
  'pnpm run project-art:workspace:persistent:check',
  'pnpm run project-art:loop:check',
  'pnpm run project-art:workspace:mcp:check',
];
for (let index = 1; index < orderedCommands.length; index += 1) {
  assert.ok(
    projectArtCheck.indexOf(orderedCommands[index - 1]) < projectArtCheck.indexOf(orderedCommands[index]),
    `${orderedCommands[index - 1]} must run before ${orderedCommands[index]}`,
  );
}
assert.ok(packageJson.scripts.check.includes('pnpm run project-art:check'));

for (const relative of relativeFiles.filter((value) => value.endsWith('.mjs'))) {
  const checked = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(checked.status, 0, `${relative} failed node --check:\n${checked.stderr || checked.stdout}`);
}

const pythonCandidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python', []], ['python3', []], ['py', ['-3']]];
let python = null;
for (const [command, prefix] of pythonCandidates) {
  const result = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info[0])'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status === 0 && result.stdout.trim() === '3') {
    python = { command, prefix };
    break;
  }
}
assert.ok(python, 'Python 3 is required to syntax-check the project-art runtimes.');
const pycache = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-pycache-'));
try {
  for (const relative of [
    'tools/run_project_art_sandbox.py',
    'tools/run_project_art_loop_closure.py',
  ]) {
    const compiled = spawnSync(
      python.command,
      [...python.prefix, '-m', 'py_compile', path.join(root, relative)],
      {
        cwd: root,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        env: { ...process.env, PYTHONPYCACHEPREFIX: pycache },
      },
    );
    assert.equal(compiled.status, 0, `${relative} failed py_compile:\n${compiled.stderr || compiled.stdout}`);
  }
} finally {
  await rm(pycache, { recursive: true, force: true });
}

console.log('EVAVO project-art workbench contract check passed');
