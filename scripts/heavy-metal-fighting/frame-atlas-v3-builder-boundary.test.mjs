import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,"../..");
const source=(p)=>readFile(path.join(ROOT,p),"utf8");
const PYTHON=process.platform==="win32"?"python":"python3";
const PYTHON_ENV={...process.env,PYTHONDONTWRITEBYTECODE:"1",PYTHONPYCACHEPREFIX:path.join(process.env.RUNNER_TEMP??process.env.TMPDIR??"/tmp","hmf-atlas-v3-builder-bytecode")};

test("atlas-v3 builder retains closed plan admission, exact source bytes and no-replace publication",async()=>{
 const [builder,common,contract,verifier]=await Promise.all([
  source("tools/build_heavy_metal_fighting_frame_atlas_v3.py"),
  source("scripts/heavy-metal-fighting/frame_atlas_v3_build_common.py"),
  source("scripts/heavy-metal-fighting/frame_atlas_v3_build_contract.py"),
  source("scripts/heavy-metal-fighting/verify_frame_atlas_v3_build.py"),
 ]);
 assert.match(builder,/admit_plan\(plan_input\)/);assert.match(builder,/stable_bytes\(Path\(s\["sourcePath"\]\)/);assert.match(builder,/verify_output\(plan,stage,True\)/);assert.match(builder,/rename_noreplace\(stage,output\)/);assert.match(builder,/published directory identity changed/);assert.doesNotMatch(builder,/os\.replace\(/);assert.doesNotMatch(builder,/\.resize\(/);assert.doesNotMatch(builder,/\.rotate\(/);
 assert.match(common,/WinDLL\("kernel32",use_last_error=True\)/);assert.match(common,/ctypes\.set_last_error\(0\)/);assert.match(common,/MoveFileExW/);assert.match(common,/renameat2/);assert.match(common,/renamex_np/);assert.match(common,/O_NOFOLLOW/);assert.match(common,/st_nlink!=1/);
 assert.match(contract,/plan requires 224 sources/);assert.match(contract,/plan requires 26 batch evidence records/);assert.match(contract,/path substitution/);assert.match(contract,/source receipt evidence disagrees/);assert.match(contract,/manifest semantics drifted/);assert.match(contract,/receipt semantics drifted/);assert.match(contract,/atlas cell .* differs from source/);assert.match(contract,/targetRepositoryMutation/);assert.match(verifier,/skip-source-pixel-recheck/);
});

test("atlas-v3 Python contract imports without the optional image runtime",()=>{
 const r=spawnSync(PYTHON,["-c","import sys; sys.path.insert(0, 'scripts/heavy-metal-fighting'); import frame_atlas_v3_build_common, frame_atlas_v3_build_contract"],{cwd:ROOT,encoding:"utf8",env:PYTHON_ENV});
 assert.equal(r.status,0,`stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test("atlas-v3 Python build boundary regressions pass",()=>{
 const r=spawnSync(PYTHON,["scripts/heavy-metal-fighting/frame_atlas_v3_build_contract_test.py"],{cwd:ROOT,encoding:"utf8",env:PYTHON_ENV});
 assert.equal(r.status,0,`stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);assert.match(`${r.stdout}\n${r.stderr}`,/Ran 9 tests/);assert.match(`${r.stdout}\n${r.stderr}`,/OK/);
});
