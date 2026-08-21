import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = path.join(
  ROOT,
  'scripts/project-art/council-avatar-procedural-renderer.py',
);
const ATLAS_COMPILER = path.join(
  ROOT,
  'scripts/project-art/compile-council-avatar-review-atlases.py',
);
const NODE_TESTS = Object.freeze([
  'scripts/test-project-art-council-avatar-production.mjs',
  'scripts/test-project-art-council-avatar-procedural-review.mjs',
  'scripts/test-project-art-council-avatar-identity-bootstrap.mjs',
  'scripts/test-project-art-council-avatar-media-readiness.mjs',
  'scripts/test-project-art-council-avatar-animation-suite.mjs',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceFingerprint() {
  const sourcePaths = [
    RENDERER,
    ATLAS_COMPILER,
    ...NODE_TESTS.map((relativePath) => path.join(ROOT, relativePath)),
    path.join(
      ROOT,
      'scripts/project-art/council-avatar-procedural-review.mjs',
    ),
    path.join(
      ROOT,
      'scripts/project-art/council-avatar-production-program.mjs',
    ),
  ];
  const digest = createHash('sha256');
  for (const sourcePath of sourcePaths) {
    digest.update(path.relative(ROOT, sourcePath));
    digest.update('\0');
    digest.update(readFileSync(sourcePath));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.error,
    undefined,
    `${command} could not start: ${result.error?.message ?? 'unknown error'}`,
  );
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed with status ${String(result.status)}`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return result;
}

function pythonCommand() {
  const candidates =
    process.platform === 'win32'
      ? [
          ['py', ['-3']],
          ['python', []],
          ['python3', []],
        ]
      : [
          ['python', []],
          ['python3', []],
          ['py', ['-3']],
        ];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(
      command,
      [...prefix, '-c', 'import PIL,sys;print(sys.version_info[0],PIL.__version__)'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      },
    );
    if (result.status === 0 && /^3\s+12\.2\.0\s*$/u.test(result.stdout)) {
      return Object.freeze({ command, prefix: Object.freeze(prefix) });
    }
  }
  throw new Error(
    'COUNCIL_AVATAR_CI_REQUIRES_PYTHON_3_WITH_EXACT_PILLOW_12_2_0',
  );
}

function assertAuthorityDenied(authority) {
  assert.ok(authority && typeof authority === 'object');
  assert.ok(Object.keys(authority).length >= 8);
  assert.ok(Object.values(authority).every((value) => value === false));
}

test(
  'established media-tool CI executes the complete Council V4.3 review proof',
  { timeout: 10 * 60 * 1000 },
  () => {
    const fingerprint = sourceFingerprint();
    const markerPath = process.env.RUNNER_TEMP
      ? path.join(
          process.env.RUNNER_TEMP,
          'evavo-council-avatar-procedural-review-proof-v1.json',
        )
      : null;

    if (markerPath && existsSync(markerPath)) {
      const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
      assert.equal(marker.schema, 'evavo.council-avatar-ci-proof.v1');
      assert.equal(marker.sourceFingerprint, fingerprint);
      assert.equal(marker.status, 'passed');
      assert.equal(marker.nodeTestFileCount, NODE_TESTS.length);
      assert.equal(marker.rendererSampledFrameCount, 100);
      assert.equal(marker.atlasClipCount, 6);
      assert.equal(marker.atlasFrameCount, 636);
      return;
    }

    run(process.execPath, ['--test', ...NODE_TESTS]);

    const python = pythonCommand();
    const selfTestResult = run(python.command, [
      ...python.prefix,
      RENDERER,
      '--self-test',
    ]);
    const selfTest = JSON.parse(selfTestResult.stdout);
    assert.equal(
      selfTest.schema,
      'evavo.project-art-council-avatar-procedural-renderer-self-test.v1',
    );
    assert.equal(selfTest.status, 'passed');
    assert.equal(selfTest.characterCount, 5);
    assert.equal(selfTest.canonicalSeatCount, 4);
    assert.equal(selfTest.previewOnlyCharacterCount, 1);
    assert.equal(selfTest.clipCountPerCharacter, 5);
    assert.equal(selfTest.sampledFrameCount, 100);
    assert.equal(selfTest.externalImageGenerationUsed, false);
    assert.equal(selfTest.identityApprovalEstablished, false);
    assert.equal(selfTest.runtimeActivationEstablished, false);
    assert.equal(selfTest.websiteActivationEstablished, false);

    const temporaryRoot = mkdtempSync(
      path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'evavo-council-atlas-'),
    );
    const atlasOutput = path.join(temporaryRoot, 'atlas');
    try {
      const atlasResult = run(python.command, [
        ...python.prefix,
        ATLAS_COMPILER,
        '--renderer',
        RENDERER,
        '--output',
        atlasOutput,
      ]);
      const summary = JSON.parse(atlasResult.stdout);
      assert.equal(summary.clipCount, 6);
      assert.equal(summary.frameCount, 636);
      assert.ok(summary.pageCount >= 6);

      const manifestPath = path.join(atlasOutput, 'atlas-manifest.json');
      assert.ok(existsSync(manifestPath));
      const manifestBytes = readFileSync(manifestPath);
      const manifest = JSON.parse(manifestBytes.toString('utf8'));
      assert.equal(
        manifest.schema,
        'evavo.project-art-council-avatar-procedural-review-atlas-manifest.v1',
      );
      assert.equal(
        manifest.status,
        'procedural-review-atlases-verified-not-production-approved',
      );
      assert.equal(manifest.summary.clipCount, 6);
      assert.equal(manifest.summary.frameCount, 636);
      assert.equal(manifest.clips.length, 6);
      assertAuthorityDenied(manifest.authority);
      for (const clip of manifest.clips) {
        assert.equal(
          clip.status,
          'procedural-review-atlas-not-production-approved',
        );
        assert.equal(clip.fps, 30);
        assert.equal(clip.loop, true);
        assert.equal(clip.rotationAllowed, false);
        assert.equal(clip.stableBottomCentrePivot, true);
        assert.ok(clip.frames.length === clip.frameCount);
        assert.ok(
          clip.frames.every(
            (frame) =>
              typeof frame.trimmedPixelSha256 === 'string' &&
              /^[a-f0-9]{64}$/u.test(frame.trimmedPixelSha256),
          ),
        );
        assertAuthorityDenied(clip.authority);
      }

      const marker = {
        schema: 'evavo.council-avatar-ci-proof.v1',
        status: 'passed',
        sourceFingerprint: fingerprint,
        nodeTestFileCount: NODE_TESTS.length,
        rendererSampledFrameCount: selfTest.sampledFrameCount,
        atlasClipCount: manifest.summary.clipCount,
        atlasFrameCount: manifest.summary.frameCount,
        atlasPageCount: manifest.summary.pageCount,
        atlasManifestSha256: sha256(manifestBytes),
        providerExecution: false,
        identityApproval: false,
        productionAdmission: false,
        runtimeActivation: false,
        websiteActivation: false,
      };
      if (markerPath) {
        writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
          flag: 'wx',
        });
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
);
