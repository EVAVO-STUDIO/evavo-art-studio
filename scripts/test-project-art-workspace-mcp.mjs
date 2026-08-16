#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'tools', 'project_art_workspace_mcp.mjs');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-workspace-mcp-'));
const outside = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-workspace-mcp-outside-'));
const workspace = path.join(temporary, 'project');
const external = path.join(temporary, 'external-art');
const fixedTime = '2026-08-10T01:00:00.000Z';
const png8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAIUlEQVR42mNgoBQwwhj/GRj+o0kwMjAwMDARMoFyBZQDAHvVAghIZGrmAAAAAElFTkSuQmCC',
  'base64',
);

function pythonExecutable() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []], ['py', ['-3']]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, '-c', 'import PIL; print(PIL.__version__)'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0) return command;
  }
  return null;
}

function rpc(toolName, argumentsValue, { write = false, python = null } = {}) {
  const requests = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: argumentsValue } },
  ];
  const result = spawnSync(process.execPath, [server], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    input: `${requests.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    env: {
      ...process.env,
      EVAVO_ART_WORKSPACE_ROOTS: temporary,
      EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE: write ? 'true' : 'false',
      ...(python ? { EVAVO_ART_WORKSPACE_PYTHON: python } : {}),
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const messages = result.stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  return {
    initialize: messages.find((entry) => entry.id === 1),
    list: messages.find((entry) => entry.id === 2),
    call: messages.find((entry) => entry.id === 3),
  };
}

function structured(response) {
  assert.ok(response.call?.result?.structuredContent, JSON.stringify(response.call));
  return response.call.result.structuredContent;
}

try {
  await mkdir(path.join(workspace, 'art'), { recursive: true });
  await mkdir(path.join(workspace, 'scenes'), { recursive: true });
  await mkdir(external, { recursive: true });
  await writeFile(path.join(workspace, 'project.godot'), '[application]\nrun/main_scene="res://scenes/main.tscn"\n');
  await writeFile(
    path.join(workspace, 'scenes', 'main.tscn'),
    '[gd_scene load_steps=2 format=3]\n[ext_resource type="Texture2D" path="res://art/hero.png" id="1"]\n',
  );
  await writeFile(path.join(workspace, 'art', 'hero.png'), png8);
  await writeFile(path.join(external, 'hero-reference.png'), png8);

  const capabilitiesResponse = rpc('evavo_art_workspace_capabilities', {});
  assert.equal(capabilitiesResponse.initialize.result.serverInfo.version, '2.0.0');
  const toolNames = capabilitiesResponse.list.result.tools.map((tool) => tool.name);
  assert.deepEqual(toolNames, [
    'evavo_art_workspace_capabilities',
    'evavo_art_compile_project_intelligence',
    'evavo_art_compile_sandbox',
    'evavo_art_run_sandbox',
    'evavo_art_compile_reference_plan',
    'evavo_art_stage_reference_artifacts',
    'evavo_art_compile_intake',
    'evavo_art_run_intake',
    'evavo_art_compile_atlas',
    'evavo_art_run_atlas',
    'evavo_art_compile_workspace_create',
    'evavo_art_run_workspace_create',
    'evavo_art_compile_workspace_snapshot',
    'evavo_art_run_workspace_snapshot',
    'evavo_art_prepare_storage_handoff',
  ]);
  const capabilities = structured(capabilitiesResponse);
  assert.equal(capabilities.summary.schema, 'evavo.project-art-workspace-capabilities.v1');
  assert.equal(capabilities.summary.writeEnabled, false);
  assert.equal(capabilities.summary.commandTimeoutMs, 600000);
  assert.ok(capabilities.summary.operations.includes('connected-matte-to-alpha'));
  assert.ok(capabilities.summary.operations.includes('defringe'));
  assert.ok(capabilities.summary.operations.includes('perspective-transform'));
  assert.ok(capabilities.summary.taskKinds.includes('image-master'));
  assert.ok(capabilities.summary.taskKinds.includes('motion-sequence'));
  assert.ok(capabilities.summary.workflow.includes('persistent-artist-workspace'));
  assert.ok(capabilities.summary.referenceOperations.includes('in-between-frame'));
  assert.equal(capabilities.summary.relatedServers.visualReview, 'tools/project_art_review_mcp.mjs');
  assert.equal(capabilities.bytesFlowThroughMcp, false);
  assert.equal(capabilities.credentialsForwardedToSubprocess, false);
  assert.equal(capabilities.rawCommandOutputReturned, false);
  assert.equal(capabilities.effects.repositoryMutation, false);

  const unknownArgument = rpc('evavo_art_workspace_capabilities', { unexpected: true });
  assert.match(unknownArgument.call.error.message, /unknown argument unexpected/u);
  const unknownTool = rpc('evavo_art_not_a_real_tool', {}, { write: true });
  assert.match(unknownTool.call.error.message, /Unknown tool/u);

  const requestPath = path.join(workspace, 'sandbox-request.json');
  const planPath = path.join(workspace, 'sandbox-plan.json');
  await writeFile(requestPath, `${JSON.stringify({
    schema: 'evavo.project-art-sandbox-request.v1',
    sandboxId: 'mcp-fixture-sandbox',
    projectId: 'mcp-fixture',
    purpose: 'Prove the callable workbench can execute a deterministic image operation without touching its source.',
    tasks: [{
      id: 'clean-hero',
      kind: 'image',
      source: 'art/hero.png',
      targetPath: 'clean/hero.png',
      operations: [{ op: 'inspect' }, { op: 'optimize' }],
      expected: { width: 8, height: 8 },
    }],
    authority: {
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      publication: false,
    },
  }, null, 2)}\n`);

  const gated = rpc('evavo_art_compile_sandbox', {
    workspaceRoot: workspace,
    requestPath,
    planPath,
    compiledAt: fixedTime,
  });
  assert.match(gated.call.error.message, /Workspace writes are disabled/u);
  await assert.rejects(access(planPath));

  const intelligencePath = path.join(workspace, 'project-art-intelligence.json');
  const intelligenceResponse = rpc('evavo_art_compile_project_intelligence', {
    projectRoot: workspace,
    artRoots: [{ id: 'raw', path: external }],
    outputPath: intelligencePath,
    projectId: 'mcp-fixture',
    generatedAt: fixedTime,
    maximumFiles: 1000,
  }, { write: true });
  const intelligence = structured(intelligenceResponse);
  assert.equal(intelligence.summary.status, 'passed');
  assert.equal(intelligence.summary.schema, 'evavo.project-art-intelligence.v1');
  assert.equal(intelligence.effects.workspaceWrite, true);
  assert.equal(intelligence.effects.providerExecution, false);
  await access(intelligencePath);

  const escaped = rpc('evavo_art_compile_project_intelligence', {
    projectRoot: workspace,
    outputPath: path.join(os.tmpdir(), 'evavo-mcp-escape.json'),
  }, { write: true });
  assert.match(escaped.call.error.message, /outside EVAVO_ART_WORKSPACE_ROOTS/u);

  const oversizedScan = rpc('evavo_art_compile_project_intelligence', {
    projectRoot: workspace,
    outputPath: path.join(workspace, 'oversized-scan.json'),
    maximumFiles: 1_000_001,
  }, { write: true });
  assert.match(oversizedScan.call.error.message, /between 1 and 1000000/u);

  if (process.platform !== 'win32') {
    const linkedOutside = path.join(temporary, 'linked-outside');
    await symlink(outside, linkedOutside, 'dir');
    const linkedRoot = rpc('evavo_art_compile_project_intelligence', {
      projectRoot: linkedOutside,
      outputPath: path.join(workspace, 'linked-root-scan.json'),
    }, { write: true });
    assert.match(linkedRoot.call.error.message, /symbolic-link component/u);
  }

  const python = pythonExecutable();
  const requirePillow = process.env.PROJECT_ART_REQUIRE_PILLOW === '1';
  if (requirePillow && !python) throw new Error('PROJECT_ART_REQUIRE_PILLOW=1 but no Python 3 executable with Pillow was found.');

  const compileSandboxResponse = rpc('evavo_art_compile_sandbox', {
    workspaceRoot: workspace,
    requestPath,
    planPath,
    compiledAt: fixedTime,
  }, { write: true, python });
  const compiledSandbox = structured(compileSandboxResponse);
  assert.equal(compiledSandbox.summary.status, 'passed');
  assert.equal(compiledSandbox.summary.schema, 'evavo.project-art-sandbox-plan.v1');
  assert.equal(compiledSandbox.summary.tasks, 1);
  await access(planPath);

  if (python) {
    const sourceBefore = await readFile(path.join(workspace, 'art', 'hero.png'));
    const outputRoot = path.join(workspace, 'sandbox-output');
    const runSandboxResponse = rpc('evavo_art_run_sandbox', {
      workspaceRoot: workspace,
      planPath,
      outputRoot,
    }, { write: true, python });
    const executedSandbox = structured(runSandboxResponse);
    assert.equal(executedSandbox.summary.status, 'passed');
    assert.equal(executedSandbox.effects.workspaceWrite, true);
    assert.equal(executedSandbox.effects.sourceMutation, false);
    await access(path.join(outputRoot, 'clean', 'hero.png'));
    await access(path.join(outputRoot, '_evavo', 'project-art-sandbox-receipt.json'));
    const sourceAfter = await readFile(path.join(workspace, 'art', 'hero.png'));
    assert.deepEqual(sourceAfter, sourceBefore);

    const replay = rpc('evavo_art_run_sandbox', {
      workspaceRoot: workspace,
      planPath,
      outputRoot,
    }, { write: true, python });
    assert.match(replay.call.error.message, /must not already exist/u);

    const intakeRequestPath = path.join(workspace, 'intake-request.json');
    const intakePlanPath = path.join(workspace, 'intake-plan.json');
    const intakeOutputRoot = path.join(workspace, 'intake-output');
    await writeFile(intakeRequestPath, `${JSON.stringify({
      schema: 'evavo.project-art-intake-request.v1',
      sessionId: 'mcp-intake-fixture',
      projectId: 'mcp-fixture',
      createdBy: 'project-art-workspace-mcp-test',
      allowedSourceRoots: [path.join(workspace, 'art')],
      sources: [{
        id: 'hero-source',
        sourcePath: path.join(workspace, 'art', 'hero.png'),
        origin: 'chat-upload',
        logicalPath: 'characters/hero/hero.png',
        role: 'sprite-frame',
      }],
    }, null, 2)}\n`);
    const compiledIntake = structured(rpc('evavo_art_compile_intake', {
      requestPath: intakeRequestPath,
      planPath: intakePlanPath,
      compiledAt: fixedTime,
    }, { write: true, python }));
    assert.equal(compiledIntake.summary.schema, 'evavo.project-art-intake-plan.v1');
    assert.equal(compiledIntake.summary.sourceCount, 1);
    const executedIntake = structured(rpc('evavo_art_run_intake', {
      planPath: intakePlanPath,
      outputRoot: intakeOutputRoot,
    }, { write: true, python }));
    assert.equal(executedIntake.summary.schema, 'evavo.project-art-intake-receipt.v1');
    assert.equal(executedIntake.effects.repositoryMutation, false);
    const workingFrame = path.join(intakeOutputRoot, 'working', 'characters', 'hero', 'hero.png');
    await access(workingFrame);

    const atlasRequestPath = path.join(workspace, 'atlas-request.json');
    const atlasPlanPath = path.join(workspace, 'atlas-plan.json');
    const atlasOutputRoot = path.join(workspace, 'atlas-output');
    await writeFile(atlasRequestPath, `${JSON.stringify({
      schema: 'evavo.project-art-atlas-request.v1',
      atlasId: 'mcp-hero-atlas',
      projectId: 'mcp-fixture',
      outputName: 'mcp-hero-atlas',
      allowedSourceRoots: [path.join(intakeOutputRoot, 'working')],
      frames: [{ id: 'hero/idle/01', sourcePath: workingFrame }],
      options: {
        trimAlpha: true,
        padding: 1,
        margin: 1,
        extrude: 1,
        powerOfTwo: true,
        maximumWidth: 64,
        maximumHeight: 64,
      },
    }, null, 2)}\n`);
    const compiledAtlas = structured(rpc('evavo_art_compile_atlas', {
      requestPath: atlasRequestPath,
      planPath: atlasPlanPath,
      compiledAt: fixedTime,
    }, { write: true, python }));
    assert.equal(compiledAtlas.summary.schema, 'evavo.project-art-atlas-plan.v1');
    assert.equal(compiledAtlas.summary.frameCount, 1);
    const executedAtlas = structured(rpc('evavo_art_run_atlas', {
      planPath: atlasPlanPath,
      outputRoot: atlasOutputRoot,
    }, { write: true, python }));
    assert.equal(executedAtlas.summary.schema, 'evavo.project-art-atlas-receipt.v1');
    assert.equal(executedAtlas.effects.repositoryMutation, false);
    await access(path.join(atlasOutputRoot, 'mcp-hero-atlas.png'));
  }

  const persistentCreateRequestPath = path.join(workspace, 'persistent-create-request.json');
  const persistentCreatePlanPath = path.join(workspace, 'persistent-create-plan.json');
  await writeFile(persistentCreateRequestPath, `${JSON.stringify({
    schema: 'evavo.persistent-artist-workspace-create-request.v1',
    workspaceId: 'mcp-persistent-artist-workspace',
    projectId: 'mcp-fixture',
    directoryName: 'mcp-persistent-artist-workspace',
    title: 'MCP persistent artist workspace fixture',
    createdBy: 'workspace-mcp-regression',
    storage: {
      enabled: true,
      vaultId: 'art',
      logicalPrefix: 'Projects/McpFixture/Art',
    },
  }, null, 2)}\n`);
  const persistentCompile = structured(rpc('evavo_art_compile_workspace_create', {
    parentRoot: temporary,
    requestPath: persistentCreateRequestPath,
    planPath: persistentCreatePlanPath,
    compiledAt: fixedTime,
  }, { write: true }));
  assert.equal(persistentCompile.summary.schema, 'evavo.persistent-artist-workspace-create-plan.v1');
  assert.equal(persistentCompile.effects.workspaceWrite, true);
  const persistentCreate = structured(rpc('evavo_art_run_workspace_create', {
    planPath: persistentCreatePlanPath,
  }, { write: true }));
  const persistentRoot = persistentCreate.summary.workspaceRoot;
  await access(path.join(persistentRoot, 'manifests', 'workspace.json'));
  await access(path.join(persistentRoot, 'versions'));
  await mkdir(path.join(persistentRoot, 'working', 'characters'), { recursive: true });
  const persistentWorkingFile = path.join(persistentRoot, 'working', 'characters', 'hero.png');
  await writeFile(persistentWorkingFile, png8);
  const persistentSnapshotRequestPath = path.join(workspace, 'persistent-snapshot-request.json');
  const persistentSnapshotPlanPath = path.join(workspace, 'persistent-snapshot-plan.json');
  await writeFile(persistentSnapshotRequestPath, `${JSON.stringify({
    schema: 'evavo.persistent-artist-workspace-snapshot-request.v1',
    workspaceId: 'mcp-persistent-artist-workspace',
    assetId: 'hero-working-frame',
    versionId: 'v001',
    sourcePath: 'working/characters/hero.png',
    role: 'sprite-frame-working-version',
    createdBy: 'workspace-mcp-regression',
  }, null, 2)}\n`);
  const persistentSnapshotCompile = structured(rpc('evavo_art_compile_workspace_snapshot', {
    workspaceRoot: persistentRoot,
    requestPath: persistentSnapshotRequestPath,
    planPath: persistentSnapshotPlanPath,
    compiledAt: fixedTime,
  }, { write: true }));
  assert.equal(persistentSnapshotCompile.summary.schema, 'evavo.persistent-artist-workspace-snapshot-plan.v1');
  const persistentSnapshot = structured(rpc('evavo_art_run_workspace_snapshot', {
    workspaceRoot: persistentRoot,
    planPath: persistentSnapshotPlanPath,
  }, { write: true }));
  await access(path.join(persistentRoot, ...persistentSnapshot.summary.versionPath.split('/')));
  const persistentHandoffRequestPath = path.join(workspace, 'persistent-handoff-request.json');
  const persistentHandoffOutputPath = path.join(persistentRoot, 'manifests', 'storage-handoffs', 'mcp-fixture-v1.json');
  await writeFile(persistentHandoffRequestPath, `${JSON.stringify({
    schema: 'evavo.persistent-artist-workspace-storage-handoff-request.v1',
    workspaceId: 'mcp-persistent-artist-workspace',
    handoffId: 'mcp-fixture-v1',
    vaultId: 'art',
    logicalPrefix: 'Projects/McpFixture/Art',
    items: [{
      assetId: 'hero-v001',
      path: persistentSnapshot.summary.versionPath,
      logicalPath: 'characters/hero/hero.png',
      title: 'Hero exact working version',
      role: 'sprite-frame-master-source',
    }],
  }, null, 2)}\n`);
  const persistentHandoff = structured(rpc('evavo_art_prepare_storage_handoff', {
    workspaceRoot: persistentRoot,
    requestPath: persistentHandoffRequestPath,
    outputPath: persistentHandoffOutputPath,
    compiledAt: fixedTime,
  }, { write: true }));
  assert.equal(persistentHandoff.summary.schema, 'evavo.storage-art-ingest-request.v1');
  assert.equal(persistentHandoff.effects.storageWrite, false);
  await access(persistentHandoffOutputPath);

  const referenceRequestPath = path.join(workspace, 'reference-request.json');
  const referencePlanPath = path.join(workspace, 'reference-plan.json');
  await writeFile(referenceRequestPath, `${JSON.stringify({
    schema: 'evavo.reference-derived-image-request.v1',
    requestId: 'mcp-matching-ui-family',
    projectId: 'mcp-fixture',
    operation: 'match-family',
    assetKind: 'ui',
    assetId: 'inventory-slot-selected',
    candidateFamilyId: 'inventory-slot-family',
    creativeIntent: 'Create one original selected-state icon that exactly matches the retained family geometry, palette and line language.',
    negativeIntent: 'Do not copy third-party interface artwork or add readable generated text.',
    style: {
      styleName: 'Fixture UI family',
      intent: 'Retain the exact family proportions and limited palette.',
      mustHave: ['same silhouette language'],
      mustAvoid: ['antialiasing', 'glossy gradients'],
      identityLocks: [],
      palette: ['source-bound'],
      lineTreatment: ['hard pixel edges'],
      materials: [],
      cameraRules: [],
      compositionRules: ['same 8 by 8 canvas'],
      eraRules: [],
    },
    shot: {
      subject: 'Selected inventory slot icon',
      include: ['complete icon'],
      exclude: ['readable text'],
      separateAssets: [],
      framing: ['same canvas and padding'],
    },
    target: { width: 8, height: 8, transparency: 'required', outputFormat: 'png' },
    candidateCount: 2,
    references: [{
      referenceId: 'direction-master',
      role: 'direction-master',
      path: 'art/hero.png',
      required: true,
    }],
    selection: { allowedAdapterIds: ['openai-gpt-image'], allowFallback: false },
    authority: { providerExecution: false, candidateApproval: false },
  }, null, 2)}\n`);
  const referenceResponse = rpc('evavo_art_compile_reference_plan', {
    workspaceRoot: workspace,
    requestPath: referenceRequestPath,
    planPath: referencePlanPath,
    compiledAt: fixedTime,
  }, { write: true });
  const referencePlan = structured(referenceResponse);
  assert.equal(referencePlan.summary.status, 'passed');
  assert.equal(referencePlan.summary.schema, 'evavo.reference-derived-image-plan.v1');
  assert.equal(referencePlan.summary.providerCompilable, false);
  assert.equal(referencePlan.effects.providerExecution, false);
  await access(referencePlanPath);

  const artifactDist = path.join(root, 'packages', 'artifacts', 'dist', 'index.js');
  if (process.env.PROJECT_ART_REQUIRE_PROVIDER_VALIDATION === '1') {
    await access(artifactDist);
    const artifactRoot = path.join(temporary, 'artifacts');
    const bindingsPath = path.join(workspace, 'reference-bindings.json');
    const stagedResponse = rpc('evavo_art_stage_reference_artifacts', {
      workspaceRoot: workspace,
      planPath: referencePlanPath,
      artifactRoot,
      bindingsPath,
    }, { write: true });
    const staged = structured(stagedResponse);
    assert.equal(staged.summary.status, 'passed');
    assert.equal(staged.summary.schema, 'evavo.reference-derived-artifact-bindings.v1');
    assert.equal(staged.summary.bindings, 1);
    assert.equal(staged.effects.artifactWrite, true);
    assert.equal(staged.effects.providerExecution, false);

    const boundPlanPath = path.join(workspace, 'reference-plan-bound.json');
    const boundResponse = rpc('evavo_art_compile_reference_plan', {
      workspaceRoot: workspace,
      requestPath: referenceRequestPath,
      bindingsPath,
      planPath: boundPlanPath,
      compiledAt: fixedTime,
    }, { write: true });
    const bound = structured(boundResponse);
    assert.equal(bound.summary.providerCompilable, true);
    assert.equal(bound.summary.missingArtifactReferences, 0);
  }

  console.log('Project Art Workspace MCP regressions passed.');
  console.log('- read-only capabilities, root confinement and explicit write gate verified');
  console.log('- project intelligence, deterministic sandbox and source immutability verified');
  console.log('- exact intake and variable-size atlas MCP execution verified');
  console.log('- persistent workspace creation, append-only snapshots and EVAVO Storage handoff verified');
  console.log('- reference-derived planning and optional immutable artifact staging verified');
  console.log('- image bytes, provider calls, repository mutation, approval and publication remain outside MCP');
} finally {
  await rm(temporary, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
