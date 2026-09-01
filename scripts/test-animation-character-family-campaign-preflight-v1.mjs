#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import readline from "node:readline";
import test from "node:test";
import { compileAnimationCharacterFamilyCampaignPreflight as compile, sha256, verifyAnimationCharacterFamilyCampaignPreflight as verify } from "../tools/animation_character_family_campaign_preflight_v1.mjs";

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"evavo-preflight-")),art=join(root,"art"),cel=join(root,"cel");
 await mkdir(join(art,"scripts"),{recursive:true});await mkdir(join(cel,"scripts"),{recursive:true});
 const ab=Buffer.from('#!/usr/bin/env node\nconsole.log("{}");\n'),cb=Buffer.from('#!/usr/bin/env node\nconsole.log("{}");\n');
 await writeFile(join(art,"scripts/art.mjs"),ab);await writeFile(join(cel,"scripts/cel.mjs"),cb);
 const manifest={schema:"evavo.animation-character-family-campaign-adapters.v1",protocolVersion:"2026-09-01.1",manifestId:"test.adapters",campaignId:"test.campaign",familyPlanDigest:`sha256:${"a".repeat(64)}`,adapters:[
 {adapterId:"test.art",ownerRole:"art-studio",taskKinds:["produce-clip","repair-clip","repair-transition","repair-family"],kind:"command",enabled:true,rootId:"art",workingDirectory:".",entrypoint:"scripts/art.mjs",command:["node","scripts/art.mjs"],timeoutMs:30000,maximumOutputBytes:1048576,environmentVariables:[],environmentPolicy:"optional",implementationSha256:sha256(ab)},
 {adapterId:"test.cel",ownerRole:"cel-animation-studio",taskKinds:["review-family"],kind:"command",enabled:true,rootId:"cel",workingDirectory:".",entrypoint:"scripts/cel.mjs",command:["node","scripts/cel.mjs"],timeoutMs:30000,maximumOutputBytes:1048576,environmentVariables:[],environmentPolicy:"optional",implementationSha256:sha256(cb)}]};
 return{root,art,cel,manifest};
}
const input=(x,id="test.report",role="coordinator",environment={})=>({reportId:id,role,manifest:x.manifest,repositoryRoots:{art:x.art,cel:x.cel},environment});

test("complete coordinator coverage is ready and verifiable",async()=>{const x=await fixture(),r=await compile(input(x));assert.equal(r.status,"ready");assert.equal(r.taskCoverage.length,5);assert.equal(r.taskCoverage.every(v=>v.status==="ready"),true);assert.equal(verify(r).status,"verified");});
test("missing Cel review capability blocks before campaign budget is spent",async()=>{const x=await fixture();x.manifest.adapters=x.manifest.adapters.slice(0,1);const r=await compile(input(x,"test.missing"));assert.equal(r.status,"blocked");assert.deepEqual(r.taskCoverage.filter(v=>v.status==="blocked").map(v=>v.taskKind),["review-family"]);});
test("required environment names fail closed without serialising values",async()=>{const x=await fixture();x.manifest.adapters[0].environmentVariables=["EVAVO_ANIMATION_EXECUTION_ENABLED"];x.manifest.adapters[0].environmentPolicy="required";const r=await compile(input(x,"test.env","art-studio"));assert.equal(r.status,"blocked");assert.deepEqual(r.adapterObservations[0].missingEnvironmentNames,["EVAVO_ANIMATION_EXECUTION_ENABLED"]);});
test("implementation drift blocks exact adapter",async()=>{const x=await fixture();x.manifest.adapters[0].implementationSha256=`sha256:${"b".repeat(64)}`;const r=await compile(input(x,"test.hash","art-studio"));assert.equal(r.status,"blocked");assert.equal(r.adapterObservations[0].findings.some(v=>v.code==="IMPLEMENTATION_DIGEST_MISMATCH"),true);});
test("task ownership contradictions are rejected",async()=>{const x=await fixture();x.manifest.adapters[0].ownerRole="cel-animation-studio";await assert.rejects(compile(input(x)),/TASK_OWNER_MISMATCH/u);});
test("shell wrappers are rejected",async()=>{const x=await fixture();x.manifest.adapters[0].command=["pwsh","-Command","node scripts/art.mjs"];await assert.rejects(compile(input(x)),/SHELL_COMMAND_FORBIDDEN/u);});
test("symlinked entrypoints are blocked",async t=>{if(process.platform==="win32"){t.skip();return;}const x=await fixture();await symlink(join(x.art,"scripts/art.mjs"),join(x.art,"scripts/link.mjs"));x.manifest.adapters[0].entrypoint="scripts/link.mjs";x.manifest.adapters[0].command=["node","scripts/link.mjs"];delete x.manifest.adapters[0].implementationSha256;const r=await compile(input(x,"test.link","art-studio"));assert.equal(r.status,"blocked");});
test("credential-bearing command values are rejected",async()=>{const x=await fixture();x.manifest.adapters[0].command.push("Bearer abcdefghijklmnopqrstuvwxyz");await assert.rejects(compile(input(x)),/CREDENTIAL_VALUE_FORBIDDEN/u);});
test("tampered reports fail verification",async()=>{const x=await fixture(),r=await compile(input(x));const changed=structuredClone(r);changed.status="blocked";assert.throws(()=>verify(changed),/DIGEST_MISMATCH/u);});

class Client{constructor(enabled){this.child=spawn(process.execPath,[new URL("../tools/animation_character_family_campaign_preflight_v1.mjs",import.meta.url).pathname,"mcp"],{env:{...process.env,EVAVO_ANIMATION_CHARACTER_FAMILY_PREFLIGHT_READ_ENABLED:enabled?"enabled":"disabled"},stdio:["pipe","pipe","pipe"]});this.id=1;this.pending=new Map();readline.createInterface({input:this.child.stdout,crlfDelay:Infinity}).on("line",line=>{const m=JSON.parse(line),fn=this.pending.get(m.id);if(fn){this.pending.delete(m.id);fn(m);}});}call(method,params={}){const id=this.id++;const p=new Promise(r=>this.pending.set(id,r));this.child.stdin.write(`${JSON.stringify({jsonrpc:"2.0",id,method,params})}\n`);return p;}async close(){this.child.stdin.end();if(this.child.exitCode===null)await once(this.child,"exit");}}
async function tools(enabled){const c=new Client(enabled);await c.call("initialize",{protocolVersion:"2025-06-18"});const r=await c.call("tools/list");await c.close();return r.result.tools.map(v=>v.name);}
test("MCP hides local path reads by default",async()=>{assert.equal((await tools(false)).includes("inspect_animation_character_family_campaign_adapters_v1"),false);});
test("MCP exposes inspection only after explicit enablement",async()=>{assert.equal((await tools(true)).includes("inspect_animation_character_family_campaign_adapters_v1"),true);});
