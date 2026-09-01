#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
const root=resolve(new URL("..",import.meta.url).pathname),files=[".mcp.animation-character-family-campaign-preflight-v1.json","contracts/animation-character-family-campaign-preflight-v1.schema.json","docs/ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PREFLIGHT_V1.md","examples/animation-character-family-campaign-adapters.example.json","scripts/check-animation-character-family-campaign-preflight-v1.mjs","scripts/test-animation-character-family-campaign-preflight-v1.mjs","tools/animation_character_family_campaign_preflight_v1.mjs"];
const sha=b=>`sha256:${createHash("sha256").update(b).digest("hex")}`;
for(const f of ["tools/animation_character_family_campaign_preflight_v1.mjs","scripts/test-animation-character-family-campaign-preflight-v1.mjs","scripts/check-animation-character-family-campaign-preflight-v1.mjs"]){const r=spawnSync(process.execPath,["--check",resolve(root,f)],{stdio:"inherit"});if(r.status!==0)process.exit(r.status??1);}
const r=spawnSync(process.execPath,["--test",resolve(root,"scripts/test-animation-character-family-campaign-preflight-v1.mjs")],{stdio:"inherit"});if(r.status!==0)process.exit(r.status??1);
const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(resolve(root,f)))])));
console.log(JSON.stringify({status:"ok",protocolVersion:"2026-09-01.1",files:files.length,hashes}));
