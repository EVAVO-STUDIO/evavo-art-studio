import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  link,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { validateTask } from './check-eva-dense-motion-workstation-task.mjs';
import {
  gitBlobSha1,
  inspectPngHeader,
  preflightEvaDenseMotionSources,
} from './project-art/eva-dense-motion-source-preflight.mjs';
import { pngCrc32 } from './project-art/png-structure-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const task = JSON.parse(
  fs.readFileSync(
    path.join(root, 'config/eva-dense-motion-workstation-task-v1.json'),
    'utf8',
  ),
);
const script = fs.readFileSync(
  path.join(root, 'scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1'),
  'utf8',
);
const preflight = fs.readFileSync(
  path.join(
    root,
    'scripts/project-art/eva-dense-motion-source-preflight.mjs',
  ),
  'utf8',
);
const materialization = fs.readFileSync(
  path.join(
    root,
    'scripts/project-art/eva-dense-motion-source-materialization.mjs',
  ),
  'utf8',
);
const v5 = JSON.parse(
  fs.readFileSync(
    path.join(root, 'config/automation-fabric-client-v5.json'),
    'utf8',
  ),
);
const clone = (value) => structuredClone(value);

function validate(
  taskInput = clone(task),
  scriptInput = script,
  v5Input = clone(v5),
  preflightInput = preflight,
  materializationInput = materialization,
) {
  return validateTask(
    taskInput,
    scriptInput,
    v5Input,
    preflightInput,
    materializationInput,
  );
}

test('accepts planner-bound task with ten-source preflight, materialization planning and ten-master planning', () => {
  const result = validate();
  assert.equal(result.ok, true);
  assert.equal(result.minimumLocalStorageVersion, '0.48.9');
  assert.equal(result.sourcePreflightRequired, true);
  assert.equal(result.pendingOrdinalCount, 7);
  assert.equal(result.sourceFrameCount, 10);
  assert.equal(result.sourceMaterializationPlanningAvailable, true);
  assert.equal(result.sourceMaterializationExecutionByValidationTask, false);
  assert.equal(result.tenMasterPlanningAvailable, true);
  assert.equal(result.requiredNewMasterCount, 10);
  assert.equal(result.fallbackRemasterCount, 3);
  assert.equal(result.tenMasterExecutionByTask, false);
});

test('rejects weakened source materialization coverage or authority', () => {
  const incomplete = clone(task);
  incomplete.sourceMaterialization.requiredSourceFrameCount = 7;
  assert.throws(() => validate(incomplete), /materialization coverage/u);

  const missingFallbackSources = clone(task);
  missingFallbackSources.sourceMaterialization.requiredOrdinals = [
    1, 2, 3, 7, 8, 9, 10,
  ];
  assert.throws(
    () => validate(missingFallbackSources),
    /materialization coverage/u,
  );

  const executable = clone(task);
  executable.sourceMaterialization.executionByValidationTask = true;
  assert.throws(() => validate(executable), /materialization authority/u);

  const candidateCreation = clone(task);
  candidateCreation.sourceMaterialization.candidateCreationAllowed = true;
  assert.throws(() => validate(candidateCreation), /materialization authority/u);

  const partialResume = clone(task);
  partialResume.sourceMaterialization.midFramePartialStateRejected = false;
  assert.throws(() => validate(partialResume), /safety policy/u);
});

test('rejects weakened ten-master workstation planning', () => {
  const incomplete = clone(task);
  incomplete.tenMasterPlanning.requiredNewMasterCount = 7;
  assert.throws(() => validate(incomplete), /ten-master final coverage/u);

  const executable = clone(task);
  executable.tenMasterPlanning.executionByThisTask = true;
  assert.throws(() => validate(executable), /ten-master planning authority/u);

  const legacyFinal = clone(task);
  legacyFinal.tenMasterPlanning.legacyFallbackMaySatisfyFinalMasterGate = true;
  assert.throws(() => validate(legacyFinal), /ten-master planning authority/u);
});

test('rejects execution without planner receipt', () => {
  const candidate = clone(task);
  candidate.worker.plannerReceiptRequired = false;
  assert.throws(() => validate(candidate), /Planner receipt/u);
});

test('rejects missing filesystem capability', () => {
  const candidate = clone(task);
  candidate.worker.requiredCapabilities = candidate.worker.requiredCapabilities.filter(
    (entry) => entry !== 'filesystem',
  );
  assert.throws(() => validate(candidate), /filesystem/u);
});

test('rejects weaker Local Storage floor', () => {
  const candidate = clone(task);
  candidate.minimumLocalStorageVersion = '0.48.8';
  assert.throws(() => validate(candidate), /0\.48\.9/u);
});

test('rejects v5 floor mismatch', () => {
  const candidate = clone(v5);
  candidate.minimumLocalStorageVersion = '0.48.8';
  assert.throws(
    () => validate(clone(task), script, candidate),
    /floor differs/u,
  );
});

test('rejects source repo or preflight drift', () => {
  const wrongRepo = clone(task);
  wrongRepo.sourceRepository = 'EVAVO-STUDIO/other';
  assert.throws(() => validate(wrongRepo), /source repository/u);

  const wrongPreflight = clone(task);
  wrongPreflight.sourcePreflightScript = 'scripts/other.mjs';
  assert.throws(() => validate(wrongPreflight), /preflight path/u);
});

test('rejects missing source identity or materialization enforcement', () => {
  const weakenedPreflight = preflight.replaceAll(
    'gitBlobSha1',
    'removedIdentityFunction',
  );
  assert.throws(
    () => validate(clone(task), script, clone(v5), weakenedPreflight),
    /gitBlobSha1/u,
  );

  const weakenedMaterialization = materialization.replaceAll(
    'allTenSourcesPreflightBeforeFirstWrite: true',
    'allTenSourcesPreflightBeforeFirstWrite: false',
  );
  assert.throws(
    () =>
      validate(
        clone(task),
        script,
        clone(v5),
        preflight,
        weakenedMaterialization,
      ),
    /allTenSourcesPreflightBeforeFirstWrite/u,
  );
});

test('rejects worker repository push, source-copy and provider authority', () => {
  for (const key of [
    'sourceCopyWrite',
    'repositoryPush',
    'publication',
    'forcePush',
    'candidateCreation',
    'candidatePromotion',
    'providerExecution',
    'cloudinaryUpload',
    'runtimeActivation',
  ]) {
    const candidate = clone(task);
    candidate.authority[key] = true;
    assert.throws(() => validate(candidate), new RegExp(key, 'u'));
  }
});

test('rejects unsafe PowerShell primitives', () => {
  for (const injected of [
    "\nInvoke-Expression 'whoami'\n",
    '\ngit push origin main\n',
    '\nRemove-Item -Recurse .git\n',
    '\nexecutionByValidationTask = $true\n',
    '\nexecutionByThisTask = $true\n',
  ]) {
    assert.throws(
      () => validate(clone(task), script + injected),
      /forbidden material/u,
    );
  }
});

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_FIXTURE_CACHE = new Map();

function pngChunk(type, dataInput = Buffer.alloc(0)) {
  const data = Buffer.from(dataInput);
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(
    pngCrc32(Buffer.concat([typeBytes, data])),
    8 + data.length,
  );
  return output;
}

function pngFixture({
  width = 1024,
  height = 1536,
  colorType = 6,
  marker = 0,
} = {}) {
  const cacheKey = `${width}:${height}:${colorType}:${marker}`;
  if (PNG_FIXTURE_CACHE.has(cacheKey)) {
    return Buffer.from(PNG_FIXTURE_CACHE.get(cacheKey));
  }
  const bytesPerPixel = { 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? 4;
  const rowBytes = width * bytesPerPixel;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  raw[1] = marker & 0xff;
  if (bytesPerPixel > 1) raw[2] = (marker * 17) & 0xff;
  if (bytesPerPixel > 2) raw[3] = (marker * 37) & 0xff;
  if (colorType === 4) raw[2] = 255;
  if (colorType === 6) raw[4] = 255;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const parts = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)];
  if (colorType === 3) {
    parts.push(pngChunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255])));
  }
  parts.push(pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND'));
  const value = Buffer.concat(parts);
  PNG_FIXTURE_CACHE.set(cacheKey, value);
  return Buffer.from(value);
}

async function sourceFixture() {
  const runtimeRoot = await mkdtemp(
    path.join(os.tmpdir(), 'eva-dense-preflight-'),
  );
  await mkdir(path.join(runtimeRoot, 'assets', 'eva-female'), {
    recursive: true,
  });
  const frames = [];
  for (const ordinal of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const relativePath = `assets/eva-female/frame-${ordinal}.png`;
    const bytes = pngFixture({
      colorType: ordinal % 2 === 0 ? 2 : 6,
      marker: ordinal,
    });
    await writeFile(path.join(runtimeRoot, relativePath), bytes);
    frames.push({
      ordinal,
      frameId: `eva-20260809-153620-frame-${String(ordinal).padStart(2, '0')}`,
      relativePath,
      sourceGitBlobSha1: gitBlobSha1(bytes),
    });
  }
  return { runtimeRoot, frames };
}

test('source preflight parses and reconstructs the production canvas', () => {
  const value = inspectPngHeader(pngFixture());
  assert.equal(value.width, 1024);
  assert.equal(value.height, 1536);
  assert.equal(value.alphaChannelDeclared, true);
  assert.equal(value.fullPngChunkStructureVerified, true);
  assert.equal(value.everyPngChunkCrcVerified, true);
  assert.equal(value.idatDecodeVerified, true);
  assert.equal(value.pixelReconstructionVerified, true);
});

test('source preflight verifies all ten required source frames read-only', async () => {
  const fixture = await sourceFixture();
  try {
    const result = await preflightEvaDenseMotionSources(fixture);
    assert.equal(result.sourceFrameCount, 10);
    assert.deepEqual(result.sourceOrdinals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(result.exactSourceIdentityVerified, true);
    assert.equal(result.exactCanvasVerified, true);
    assert.equal(result.fullPngStructureAndCrcVerified, true);
    assert.equal(result.idatDecodeVerified, true);
    assert.equal(result.scanlineReconstructionVerified, true);
    assert.equal(result.decodedPixelStatisticsRecorded, true);
    assert.equal(result.nonInterlacedVerified, true);
    assert.equal(result.noTrailingBytesVerified, true);
    assert.equal(result.allTenSourcesVerifiedBeforeMaterialization, true);
    assert.equal(result.authority.sourceMutation, false);
    assert.equal(result.authority.candidateCreation, false);
    assert.equal(result.authority.providerExecution, false);
    assert.equal(result.authority.publication, false);
    assert.equal(new Set(result.sourceFrames.map((frame) => frame.sha256)).size, 10);
  } finally {
    await rm(fixture.runtimeRoot, { recursive: true, force: true });
  }
});

test('source preflight rejects byte identity drift', async () => {
  const fixture = await sourceFixture();
  try {
    fixture.frames[0] = {
      ...fixture.frames[0],
      sourceGitBlobSha1: '0'.repeat(40),
    };
    await assert.rejects(
      () => preflightEvaDenseMotionSources(fixture),
      /EVA_DENSE_SOURCE_GIT_BLOB_MISMATCH: 1/u,
    );
  } finally {
    await rm(fixture.runtimeRoot, { recursive: true, force: true });
  }
});

test('source preflight rejects wrong canvas or palette encoding', () => {
  assert.throws(
    () => inspectPngHeader(pngFixture({ width: 512 })),
    /EVA_DENSE_SOURCE_PNG_ENCODING_INVALID/u,
  );
  assert.throws(
    () => inspectPngHeader(pngFixture({ colorType: 3 })),
    /EVA_DENSE_SOURCE_PNG_ENCODING_INVALID/u,
  );
});

test('source preflight rejects incomplete or reordered ten-frame sets', async () => {
  const fixture = await sourceFixture();
  try {
    await assert.rejects(
      () =>
        preflightEvaDenseMotionSources({
          runtimeRoot: fixture.runtimeRoot,
          frames: fixture.frames.slice(0, 9),
        }),
      /EVA_DENSE_SOURCE_FRAME_SET_INVALID/u,
    );
    const reordered = [...fixture.frames];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    await assert.rejects(
      () =>
        preflightEvaDenseMotionSources({
          runtimeRoot: fixture.runtimeRoot,
          frames: reordered,
        }),
      /EVA_DENSE_SOURCE_FRAME_ORDER_INVALID/u,
    );
  } finally {
    await rm(fixture.runtimeRoot, { recursive: true, force: true });
  }
});

test('source preflight rejects symlink and hardlink source substitution', async () => {
  const fixture = await sourceFixture();
  const firstPath = path.join(fixture.runtimeRoot, fixture.frames[0].relativePath);
  const secondPath = path.join(fixture.runtimeRoot, fixture.frames[1].relativePath);
  const external = path.join(fixture.runtimeRoot, 'external.png');
  try {
    await writeFile(external, pngFixture({ marker: 101 }));
    await unlink(firstPath);
    await symlink(external, firstPath);
    await assert.rejects(
      () => preflightEvaDenseMotionSources(fixture),
      /EVA_DENSE_SOURCE_FILE_UNSAFE|EVA_DENSE_SOURCE_PATH_ESCAPE/u,
    );

    await unlink(firstPath);
    const firstBytes = pngFixture({ marker: 1 });
    await writeFile(firstPath, firstBytes);
    fixture.frames[0] = {
      ...fixture.frames[0],
      sourceGitBlobSha1: gitBlobSha1(firstBytes),
    };
    await unlink(secondPath);
    await link(firstPath, secondPath);
    fixture.frames[1] = {
      ...fixture.frames[1],
      sourceGitBlobSha1: gitBlobSha1(firstBytes),
    };
    await assert.rejects(
      () => preflightEvaDenseMotionSources(fixture),
      /EVA_DENSE_SOURCE_FILE_UNSAFE/u,
    );
  } finally {
    await rm(fixture.runtimeRoot, { recursive: true, force: true });
  }
});
