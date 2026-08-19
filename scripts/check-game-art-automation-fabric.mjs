#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const suite=JSON.parse(fs.readFileSync(path.join(root,'config','artist-workspace-agent-suite.v7.json'),'utf8'));
const tasks=JSON.parse(fs.readFileSync(path.join(root,'evavo.tasks.json'),'utf8'));
const mcpSource=fs.readFileSync(path.join(root,'tools','game_art_workstation_mcp.mjs'),'utf8');
const mcpTest=fs.readFileSync(path.join(root,'scripts','test-game-art-workstation-mcp.mjs'),'utf8');

assert.equal(suite.schema,'evavo.artist-workspace-agent-suite.v1');
assert.equal(suite.version,7);
assert.equal(suite.minimumLocalStorageVersion,'0.48.9');
assert.equal(suite.minimumLocalComputeVersion,'0.14.3');
assert.deepEqual(suite.executionRoots,['C:\\GitRepos','%USERPROFILE%\\Downloads','resolved-beestation-root','approved-discovered-external-roots']);
assert.equal(suite.executionRoots.includes('C:\\Downloads'),false);

const serverIds=new Set(suite.servers.map(x=>x.id));
for(const id of ['evavo-project-art-workspace','evavo-project-art-workspace-ingest','evavo-game-art-workstation']) assert.ok(serverIds.has(id),`missing ${id}`);
for(const server of suite.servers){assert.equal(server.defaultWriteEnabled,false,`${server.id} default write must be false`);assert.ok(typeof server.entrypoint==='string'&&server.entrypoint.length>0);}

const requiredTasks=suite.workstationTasks;
assert.deepEqual(requiredTasks,{
  pixelAudit:'pixel-art-candidate-audit',
  rasterEdit:'game-art-raster-edit',
  sheetSegment:'game-art-sheet-segment',
  animationPreview:'game-art-animation-preview',
  spriteBuild:'game-art-sprite-build'
});
for(const taskId of Object.values(requiredTasks)) assert.ok(tasks.tasks?.[taskId],`missing worker task ${taskId}`);
for(const taskId of [requiredTasks.rasterEdit,requiredTasks.sheetSegment,requiredTasks.animationPreview,requiredTasks.spriteBuild]){
  const task=tasks.tasks[taskId];
  assert.equal(task.runtime,'python-script',`${taskId} must remain a Python task`);
  assert.equal(task.pythonEnvironment,'image-finishing',`${taskId} must use managed image-finishing Python`);
  assert.equal(task.network,'disabled',`${taskId} network must be disabled`);
  assert.ok(task.arguments.includes('{{planSha256}}'),`${taskId} must bind exact plan SHA`);
  assert.equal(task.parameterSchema?.properties?.planSha256?.pattern,'^[0-9a-f]{64}$',`${taskId} plan hash schema drift`);
}

assert.match(mcpSource,/serverInfo:\{name:'evavo-game-art-workstation',version:'1\.2\.0'\}/u);
for(const toolName of ['evavo_game_art_pixel_audit','evavo_game_art_raster_execute','evavo_game_art_sheet_segment','evavo_game_art_animation_preview','evavo_game_art_sprite_build']) assert.ok(mcpSource.includes(`name:'${toolName}'`),`MCP missing ${toolName}`);
assert.match(mcpSource,/exactPlanShaRequiredForWrites:true/u);
assert.match(mcpSource,/sheetSegmentation:\['alpha-components','authored-rectangles'\]/u);
assert.match(mcpSource,/reviewOutputs:\['animation-gif','frame-strip'\]/u);
assert.match(mcpTest,/version,'1\.2\.0'/u);

const collaborators=Object.fromEntries(suite.externalCollaborators.map(x=>[x.repository,x]));
assert.equal(collaborators['EVAVO-STUDIO/evavo-video-studio'].exactPlanShaRequired,true);
assert.equal(collaborators['EVAVO-STUDIO/evavo-video-studio'].sourceHashRequired,true);
assert.equal(collaborators['EVAVO-STUDIO/evavo-video-studio'].outputPathBoundSeparately,true);
const localStorage=collaborators['EVAVO-STUDIO/evavo-local-storage'];
assert.equal(localStorage.minimumVersion,'0.48.9');
assert.equal(localStorage.parameterizedTaskPlanAction,'storage.compute_parameterized_task_plan');
assert.equal(localStorage.parameterizedTaskSubmitAction,'storage.compute_parameterized_task_submit');
assert.equal(localStorage.logicalUrisOnly,true);
const localCompute=collaborators['EVAVO-STUDIO/evavo-local-compute'];
assert.equal(localCompute.minimumVersion,'0.14.3');
assert.equal(localCompute.managedPythonEnvironment,'image-finishing');
assert.equal(localCompute.manifestDigestRequired,true);
assert.equal(localCompute.parameterDocumentDigestRequired,true);
assert.equal(localCompute.exactRepositoryRevisionSupported,true);
assert.equal(localCompute.inlineShell,false);

for(const key of ['technicalPassEqualsCreativeApproval','automaticApproval','sourceOverwrite','sourceDeletion','workerGitPublication','artStudioGitPublication','videoStudioGitPublication','forcePush']) assert.equal(suite.rules[key],false,`${key} must remain false`);
assert.equal(suite.rules.exactPlanShaRequiredForEffectingWorkstationTasks,true);
assert.equal(suite.rules.sourceShaRequired,true);
assert.equal(suite.rules.createOnlyOutputs,true);
assert.equal(suite.rules.generatedContactSheetIsProductionAtlas,false);
assert.equal(suite.rules.parameterizedWorkerBridgeRequired,true);
assert.equal(suite.rules.managedImageFinishingPythonRequired,true);
for(const [key,value] of Object.entries(suite.authority)) assert.equal(value,false,`authority.${key} must remain false`);

const flowIds=new Set(suite.flows.map(x=>x.id));
for(const id of ['generated-sheet-to-reviewable-frames','reviewed-frames-to-godot-sprite-package','video-derived-motion-to-game-art','approved-game-art-release','closed-loop-repair']) assert.ok(flowIds.has(id),`missing flow ${id}`);

console.log(JSON.stringify({contract:'evavo.game-art-automation-fabric-check.v4',status:'passed',suiteVersion:7,mcpVersion:'1.2.0',serverCount:suite.servers.length,workerTaskCount:Object.keys(requiredTasks).length,minimumLocalStorageVersion:suite.minimumLocalStorageVersion,minimumLocalComputeVersion:suite.minimumLocalComputeVersion,managedPythonEnvironment:'image-finishing',parameterizedWorkerBridge:true,forcePush:false,automaticApproval:false},null,2));
