import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const server=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','tools','game_art_workstation_mcp.mjs');
function request(lines){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[server],{stdio:['pipe','pipe','pipe'],env:{...process.env,EVAVO_GAME_ART_WORKSTATION_ALLOW_WRITE:'false'}});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)));for(const line of lines)p.stdin.write(JSON.stringify(line)+'\n');p.stdin.end();});}

test('lists bounded game art tools and capabilities',async()=>{const r=await request([{jsonrpc:'2.0',id:1,method:'initialize',params:{}},{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'evavo_game_art_workstation_capabilities',arguments:{}}}]);assert.equal(r[0].result.serverInfo.name,'evavo-game-art-workstation');const names=r[1].result.tools.map(x=>x.name);assert.deepEqual(names,['evavo_game_art_workstation_capabilities','evavo_game_art_pixel_audit','evavo_game_art_raster_execute','evavo_game_art_sprite_build']);const cap=r[2].result.structuredContent;assert.equal(cap.repositoryMutation,false);assert.equal(cap.storageMutation,false);assert.equal(cap.automaticApproval,false);assert.ok(cap.rasterOperations.includes('alpha-threshold'));assert.ok(cap.spriteOutputs.includes('godot-spriteframes'));});
