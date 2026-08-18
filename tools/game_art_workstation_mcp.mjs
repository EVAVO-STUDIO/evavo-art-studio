#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bool=(n,d=false)=>{const v=process.env[n];if(v==null||v==='')return d;if(/^(1|true|yes|on)$/i.test(v))return true;if(/^(0|false|no|off)$/i.test(v))return false;throw new Error(`${n} must be boolean`)};
const delimiter=process.platform==='win32'?';':':';
const roots=[root,...String(process.env.EVAVO_GAME_ART_WORKSTATION_ROOTS||'').split(delimiter).filter(Boolean).map(x=>path.resolve(x))];
const writeEnabled=bool('EVAVO_GAME_ART_WORKSTATION_ALLOW_WRITE',false);
const SHA=/^[0-9a-f]{64}$/u;
const inside=(r,p)=>{const x=path.relative(r,p);return x===''||(!x.startsWith(`..${path.sep}`)&&x!=='..'&&!path.isAbsolute(x));};
function confined(v,label){if(typeof v!=='string'||!v.trim())throw new Error(`${label} required`);const p=path.resolve(v);if(!roots.some(r=>inside(r,p)))throw new Error(`${label} outside allowed roots`);return p;}
function exactSha(v,label){const value=String(v||'').trim().toLowerCase();if(!SHA.test(value))throw new Error(`${label} must be lowercase SHA-256`);return value;}
function python(){for(const c of process.platform==='win32'?[['py',['-3']],['python',[]],['python3',[]]]:[['python3',[]],['python',[]],['py',['-3']]]){const r=spawnSync(c[0],[...c[1],'-c','import sys; print(sys.version_info.major)'],{encoding:'utf8',shell:false,windowsHide:true});if(r.status===0)return c;}throw new Error('Python 3 unavailable');}
function runPy(script,args){const [exe,prefix]=python();const r=spawnSync(exe,[...prefix,path.join(root,'tools',script),...args],{cwd:root,encoding:'utf8',shell:false,windowsHide:true,timeout:60*60*1000,maxBuffer:16*1024*1024});if(r.error||r.status!==0)throw new Error([r.error?.message,r.stderr,r.stdout].filter(Boolean).join('\n').slice(-8000));const text=(r.stdout||'').trim();return text?JSON.parse(text.split(/\r?\n/).at(-1)):{};}
const pathField={type:'string',minLength:1,maxLength:32768}; const shaField={type:'string',pattern:'^[0-9a-f]{64}$',minLength:64,maxLength:64}; const obj=(p,r=[])=>({type:'object',additionalProperties:false,properties:p,required:r});
const exactPlanSchema=obj({workspaceRoot:pathField,planPath:pathField,planSha256:shaField,outputRoot:pathField},['workspaceRoot','planPath','planSha256','outputRoot']);
const tools=[
{name:'evavo_game_art_workstation_capabilities',description:'Describe deterministic raster, sheet-segmentation, preview, sprite and pixel-audit workstation capabilities without mutation.',inputSchema:obj({})},
{name:'evavo_game_art_pixel_audit',description:'Audit one exact PNG for pixel-art production blockers. No approval or mutation.',inputSchema:obj({inputPath:pathField,role:{type:'string'},maxColors:{type:'integer',minimum:2,maximum:65536},maxPartialAlphaRatio:{type:'number',minimum:0,maximum:1}},['inputPath'])},
{name:'evavo_game_art_raster_execute',description:'Execute one create-only deterministic Photoshop-style raster plan inside an allowed workspace, bound to the exact plan SHA-256.',inputSchema:obj({workspaceRoot:pathField,planPath:pathField,planSha256:shaField,receiptPath:pathField},['workspaceRoot','planPath','planSha256','receiptPath'])},
{name:'evavo_game_art_sheet_segment',description:'Split one generated/reference sheet into create-only frame candidates by bounded alpha components or authored rectangles.',inputSchema:exactPlanSchema},
{name:'evavo_game_art_animation_preview',description:'Render review-only nearest-neighbour animation GIF and frame strip from exact candidate frames.',inputSchema:exactPlanSchema},
{name:'evavo_game_art_sprite_build',description:'Build one create-only sprite atlas, manifest and Godot SpriteFrames package from reviewed frames, bound to the exact plan SHA-256.',inputSchema:exactPlanSchema},
];
function requireWrite(){if(!writeEnabled)throw new Error('Workstation writes disabled; set EVAVO_GAME_ART_WORKSTATION_ALLOW_WRITE=true on trusted local deployment.');}
function summary(x){return {...x,bytesFlowThroughMcp:false,providerExecution:false,automaticApproval:false,repositoryMutation:false,storageMutation:false,publication:false,forcePush:false};}
function exactPlanArgs(a){return ['--workspace-root',confined(a.workspaceRoot,'workspaceRoot'),'--plan',confined(a.planPath,'planPath'),'--plan-sha256',exactSha(a.planSha256,'planSha256'),'--output-root',confined(a.outputRoot,'outputRoot')];}
function call(name,a){
if(name==='evavo_game_art_workstation_capabilities')return summary({schema:'evavo.game-art-workstation-capabilities.v3',rasterOperations:['crop','trim-alpha','resize','scale-integer','flip','rotate-90','canvas','alpha-threshold','mask-alpha','composite','erase-colour','replace-colour','levels','brightness','contrast','saturation','sharpen','palette-quantize','pixelate','outline'],sheetSegmentation:['alpha-components','authored-rectangles'],reviewOutputs:['animation-gif','frame-strip'],spriteOutputs:['png-atlas','manifest','godot-spriteframes'],pixelAudit:true,exactPlanShaRequiredForWrites:true});
if(name==='evavo_game_art_pixel_audit'){const args=['--input',confined(a.inputPath,'inputPath'),'--role',String(a.role||'production-sprite'),'--max-colors',String(a.maxColors??256),'--max-partial-alpha-ratio',String(a.maxPartialAlphaRatio??0),'--require-alpha','--json'];const r=spawnSync(process.execPath,[path.join(root,'scripts','audit-pixel-art-candidate.mjs'),...args],{cwd:root,encoding:'utf8',shell:false,windowsHide:true,timeout:300000,maxBuffer:8*1024*1024});if(![0,2].includes(r.status))throw new Error((r.stderr||r.stdout||'audit failed').slice(-8000));return summary(JSON.parse(r.stdout));}
requireWrite();
if(name==='evavo_game_art_raster_execute')return summary(runPy('image_workstation.py',['--workspace-root',confined(a.workspaceRoot,'workspaceRoot'),'--plan',confined(a.planPath,'planPath'),'--plan-sha256',exactSha(a.planSha256,'planSha256'),'--receipt',confined(a.receiptPath,'receiptPath')]));
if(name==='evavo_game_art_sheet_segment')return summary(runPy('sprite_sheet_segmenter.py',exactPlanArgs(a)));
if(name==='evavo_game_art_animation_preview')return summary(runPy('sprite_animation_preview.py',exactPlanArgs(a)));
if(name==='evavo_game_art_sprite_build')return summary(runPy('sprite_workstation.py',exactPlanArgs(a)));
throw new Error(`Unknown tool ${name}`);}
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const failReply=(id,e)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32000,message:String(e.message||e)}})+'\n');
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});for await(const line of rl){if(!line.trim())continue;let q;try{q=JSON.parse(line);if(q.method==='initialize')reply(q.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'evavo-game-art-workstation',version:'1.2.0'}});else if(q.method==='notifications/initialized'){}else if(q.method==='tools/list')reply(q.id,{tools});else if(q.method==='tools/call'){const r=call(q.params?.name,q.params?.arguments??{});reply(q.id,{content:[{type:'text',text:JSON.stringify(r,null,2)}],structuredContent:r,isError:false});}else failReply(q.id,new Error(`Unsupported method ${q.method}`));}catch(e){if(q?.id!==undefined)failReply(q.id,e)}}
