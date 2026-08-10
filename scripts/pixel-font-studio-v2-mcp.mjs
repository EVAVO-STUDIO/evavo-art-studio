#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const SERVER_NAME='evavo-pixel-font-studio-v2';
export const SERVER_VERSION='2.0.0';
const TOOL_PATH=fileURLToPath(new URL('../tools/pixel_font_studio_v2.py',import.meta.url));
const CATALOG='evavo_pixel_font_v2_catalog';
const BUILD='evavo_pixel_font_v2_build';
const VALIDATE='evavo_pixel_font_v2_validate';

function flag(v,name,fallback=false){
  if(v===undefined||v==='') return fallback;
  const n=String(v).trim().toLowerCase();
  if(['1','true','yes','on'].includes(n)) return true;
  if(['0','false','no','off'].includes(n)) return false;
  throw new Error(`${name} must be true or false.`);
}
function roots(env=process.env){
  return String(env.EVAVO_PIXEL_FONT_ALLOWED_ROOTS??'').split(path.delimiter).map(v=>v.trim()).filter(Boolean).map(v=>path.resolve(v));
}
function inside(p,r){const rel=path.relative(r,p);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));}
export function policy(env=process.env){
  const mode=String(env.EVAVO_PIXEL_FONT_STUDIO_MODE??'read-only').trim().toLowerCase();
  if(!['read-only','read-write'].includes(mode)) throw new Error('EVAVO_PIXEL_FONT_STUDIO_MODE must be read-only or read-write.');
  const writes=mode==='read-write'&&flag(env.EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES,'EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES');
  return Object.freeze({mode,writes,roots:Object.freeze(roots(env)),python:String(env.EVAVO_PIXEL_FONT_PYTHON??(process.platform==='win32'?'python':'python3'))});
}
async function bounded(value,current,label,{future=false}={}){
  if(typeof value!=='string'||!value.trim()) throw new Error(`${label} is required.`);
  const requested=path.resolve(value); let observed=requested;
  try { const s=await lstat(requested); if(s.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`); observed=await realpath(requested); }
  catch(error){ if(!future||error?.code!=='ENOENT') throw error; observed=path.join(await realpath(path.dirname(requested)),path.basename(requested)); }
  if(!current.roots.length||!current.roots.some(r=>inside(observed,r))) throw new Error(`${label} is outside EVAVO_PIXEL_FONT_ALLOWED_ROOTS.`);
  return requested;
}
function run(current,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(current.python,[TOOL_PATH,...args],{shell:false,windowsHide:true,env:{PATH:process.env.PATH??'',SYSTEMROOT:process.env.SYSTEMROOT??'',WINDIR:process.env.WINDIR??'',PYTHONUTF8:'1'}});
    let out='',err=''; const limit=2_000_000;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',c=>{out+=c;if(out.length>limit) child.kill();}); child.stderr.on('data',c=>{err+=c;if(err.length>limit) child.kill();});
    const timer=setTimeout(()=>child.kill(),120000);
    child.on('error',reject); child.on('close',code=>{clearTimeout(timer);if(code!==0) reject(new Error(err.trim()||`pixel-font v2 exited ${code}`));else {try{resolve(JSON.parse(out));}catch{reject(new Error('pixel-font v2 returned invalid JSON'));}}});
  });
}
const schema=(properties={},required=[])=>({type:'object',additionalProperties:false,properties,...(required.length?{required}:{})});
const fp={type:'string',minLength:1,maxLength:4096};
export function toolDefinitions(current=policy()){
  const tools=[{name:CATALOG,description:'Describe the authored-master v2 bitmap-font contract for independent pixel faces and Godot 4.6.2.',inputSchema:schema()},
    {name:VALIDATE,description:'Validate a v2 generated pixel-font family and exact output identities.',inputSchema:schema({familyPath:fp},['familyPath'])}];
  if(current.writes) tools.push({name:BUILD,description:'Build approved authored glyph-master JSON into deterministic BMFont + PNG + Godot resources. Requires confirmWrite=true.',inputSchema:schema({masterPath:fp,outputRoot:fp,confirmWrite:{type:'boolean',const:true}},['masterPath','outputRoot','confirmWrite'])});
  return tools;
}
export async function callTool(name,input={},ctx={}){
  const current=ctx.policy??policy(); if(!toolDefinitions(current).some(t=>t.name===name)) throw new Error(`Unknown or prohibited tool ${name}.`);
  if(name===CATALOG) return run(current,['catalog']);
  if(name===VALIDATE){const p=await bounded(input.familyPath,current,'familyPath');return run(current,['validate','--family',p]);}
  if(name===BUILD){if(!current.writes||input.confirmWrite!==true)throw new Error('Build requires read-write mode and confirmWrite=true.');const m=await bounded(input.masterPath,current,'masterPath');const o=await bounded(input.outputRoot,current,'outputRoot',{future:true});return run(current,['build','--master',m,'--output',o]);}
  throw new Error(`Unknown tool ${name}.`);
}
const response=(id,result)=>({jsonrpc:'2.0',id:id??null,result});
const content=v=>[{type:'text',text:JSON.stringify(v,null,2)}];
export async function handleRequest(req,ctx={}){
  if(!req||req.jsonrpc!=='2.0'||typeof req.method!=='string') throw new Error('Invalid JSON-RPC request.');
  const current=ctx.policy??policy();
  if(req.method==='initialize') return response(req.id,{protocolVersion:req.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:SERVER_NAME,version:SERVER_VERSION},instructions:'Edit explicit v2 glyph-master JSON. Builds are create-only and require bounded roots, write mode and per-call confirmation. Canonical runtime output is BMFont + PNG for Godot 4.6.2.'});
  if(req.method==='ping') return response(req.id,{}); if(req.method==='notifications/initialized') return null;
  if(req.method==='tools/list') return response(req.id,{tools:toolDefinitions(current)});
  if(req.method==='tools/call'){try{return response(req.id,{content:content(await callTool(req.params?.name,req.params?.arguments??{},{policy:current})),isError:false});}catch(e){return response(req.id,{content:content({error:e instanceof Error?e.message:String(e)}),isError:true});}}
  throw new Error(`Unsupported method ${req.method}.`);
}
export async function start(){const current=policy();const rl=createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});for await(const line of rl){if(!line.trim())continue;let req;try{req=JSON.parse(line);const r=await handleRequest(req,{policy:current});if(r)process.stdout.write(`${JSON.stringify(r)}\n`);}catch(e){process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id:req?.id??null,error:{code:-32000,message:e instanceof Error?e.message:String(e)}})}\n`);}}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) start().catch(e=>{process.stderr.write(`${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;});
