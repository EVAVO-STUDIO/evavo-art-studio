#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=JSON.parse(fs.readFileSync(path.join(root,'config/game-art-production/profiles/games94-sports-arcade.v1.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'config/game-art-production/projects/games94.v1.json'),'utf8'));

assert.equal(profile.schema,'evavo.game-art-production-profile.v1');
assert.equal(profile.profileId,'games94-sports-arcade');
assert.equal(profile.gameType,'multi-event-sports-arcade');
assert.equal(profile.defaults.textureFiltering,'nearest');
assert.equal(profile.defaults.providerFallbackAllowed,false);
assert.equal(profile.authority.automaticApproval,false);
assert.equal(profile.authority.gitMutation,false);
assert.equal(profile.authority.publication,false);
assert.equal(profile.authority.namedHumanApprovalRequired,true);

const cel=profile.assetTypes['athlete-cel'];
assert.deepEqual(cel.nativeDimensions,{width:64,height:64});
assert.deepEqual(cel.pivot,{x:32,y:58});
assert.equal(cel.groundLineY,58);
assert.equal(cel.alpha,'transparent');
assert.ok(cel.qaChecks.includes('binary-alpha'));
assert.ok(cel.failureCodes.includes('antialiasing-detected'));
assert.ok(cel.failureCodes.includes('equipment-geometry-drift'));

const atlas=profile.assetTypes['athlete-atlas'];
assert.deepEqual(atlas.nativeDimensions,{width:512,height:512});
assert.ok(atlas.qaChecks.includes('64x64-cell-grid'));
assert.ok(atlas.qaChecks.includes('reserved-cell-transparency'));

assert.equal(project.schema,'evavo.game-art-production-project.v1');
assert.equal(project.projectId,'games94');
assert.equal(project.title,"GAMES '94");
assert.equal(project.profileId,profile.profileId);
assert.equal(project.targetRepository,'EVAVO-STUDIO/california-games');
assert.deepEqual(project.metadata.logicalCanvas,{width:640,height:360});
assert.deepEqual(project.metadata.integerReviewCanvas,{width:1280,height:720});
assert.equal(project.metadata.textureFiltering,'nearest');
assert.equal(project.metadata.fixedTickHz,60);

const slice=project.metadata.firstVerticalSlice;
assert.equal(slice.athleteId,'jax_mercer');
assert.equal(slice.eventId,'halfpipe_heat');
assert.equal(slice.venueId,'sunset_concrete');
assert.deepEqual(slice.atlas,{width:512,height:512,cellWidth:64,cellHeight:64,columns:8,rows:8,feetPivot:{x:32,y:58},reservedCells:[3,4,5,6,7]});
assert.deepEqual(slice.environmentLayers,['sky','distance','atmosphere','midground','crowd','play_surface','foreground','effects']);
assert.equal(slice.approvalRequiresAllAssets,true);

const identity=project.metadata.jaxIdentity;
assert.equal(identity.silhouette,'compact_power');
assert.equal(identity.accent,'#ff3cac');
assert.equal(identity.secondary,'#28e7ff');
assert.equal(identity.maximumAthleteColours,16);
assert.deepEqual(identity.standingBodyHeightPixels,{min:43,max:52});
assert.deepEqual(identity.headHeightPixels,{min:9,max:11});

for(const evidence of ['native-1x-contact-sheet','nearest-neighbour-2x-contact-sheet','black-white-grey-green-magenta-mattes','640x360-runtime-captures','1280x720-integer-captures','palette-report','frame-consistency-review','named-human-approval-receipt']) assert.ok(project.metadata.evidenceRequired.includes(evidence),`missing ${evidence}`);
for(const value of Object.values(project.authority)) assert.ok(value===false||value===true&&project.authority.namedHumanApprovalRequired===true);
assert.equal(project.authority.automaticApproval,false);
assert.equal(project.authority.gitMutation,false);
assert.equal(project.authority.publication,false);

console.log(JSON.stringify({contract:'evavo.games94-production-profile-check.v1',status:'passed',profileId:profile.profileId,projectId:project.projectId,firstVerticalSlice:'jax_mercer/halfpipe_heat',cell:'64x64',pivot:'32,58',atlas:'512x512',automaticApproval:false,gitMutation:false,forcePush:false},null,2));
