#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { python, run } from "./project-art/intake-test-support.mjs";

const files = new Map([
  ["intake module", [
    "scripts/project-art/intake-contract.mjs",
    "scripts/project-art/intake-files.mjs",
    "scripts/project-art/intake.mjs",
  ]],
  ["intake executor", [
    "tools/project_art_intake_contract.py",
    "tools/project_art_intake_io.py",
    "tools/project_art_intake_storage.py",
    "tools/project_art_intake_execution.py",
    "tools/run_project_art_intake.py",
  ]],
  ["atlas module", [
    "scripts/project-art/atlas-contract.mjs",
    "scripts/project-art/atlas.mjs",
  ]],
  ["atlas executor", [
    "tools/project_art_atlas_alpha_bleed.py",
    "tools/project_art_atlas_contract.py",
    "tools/project_art_atlas_models.py",
    "tools/project_art_atlas_packing.py",
    "tools/project_art_atlas_output.py",
    "tools/project_art_atlas_execution.py",
    "tools/build_project_art_atlas.py",
  ]],
  ["workspace MCP", ["tools/project_art_workspace_mcp.mjs"]],
  ["regression policy", [
    "scripts/project-art/intake-test-support.mjs",
    "scripts/test-project-art-atlas-contract.mjs",
    "scripts/test_project_art_atlas_alpha_bleed.py",
    ".github/workflows/project-art-workbench.yml",
  ]],
  ["documentation", [
    "docs/PROJECT_ART_CHAT_INTAKE_AND_ATLASES.md",
    "docs/PROJECT_ART_ATLAS_ALPHA_SAFETY.md",
  ]],
]);
const sources = new Map();
for (const [label, paths] of files) {
  const content = [];
  for (const file of paths) {
    content.push(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  }
  sources.set(label, content.join("\n"));
}
const errors = [];
const required = new Map([
  ["intake module", [
    "evavo.project-art-intake-request.v1",
    "evavo.project-art-intake-plan.v1",
    "evavo.storage-art-ingest-request.v1",
    "bytesFlowThroughMcp: false",
    "repositoryMutation: false",
    "storageWrite: false",
  ]],
  ["intake executor", [
    "evavo.project-art-intake-receipt.v1",
    "Plan self hash mismatch",
    "contains a symbolic-link component",
    'storageWrite": False',
    'repositoryMutation": False',
    "os.replace",
  ]],
  ["atlas module", [
    "evavo.project-art-atlas-request.v1",
    "evavo.project-art-atlas-plan.v1",
    "texturepacker-json-hash",
    "godot-region-map",
    "transparentRgbBleed",
    "transparentRgbBleedRadius",
    "transparentRgbAlphaThreshold",
    "repositoryMutation: false",
  ]],
  ["atlas executor", [
    "evavo.project-art-atlas-receipt.v1",
    "evavo.project-art-transparent-rgb-bleed.v1",
    "Atlas placements overlap",
    "Texture Atlas JSON Hash",
    "evavo.project-art-godot-region-map.v1",
    "exactRgbaAtlasPaste",
    "strongerAlphaRgbPreserved",
    "os.replace",
  ]],
  ["workspace MCP", [
    "evavo_art_workspace_capabilities",
    "evavo_art_compile_project_intelligence",
    "evavo_art_compile_sandbox",
    "evavo_art_run_sandbox",
    "evavo_art_compile_reference_plan",
    "evavo_art_stage_reference_artifacts",
    "evavo_art_compile_intake",
    "evavo_art_run_intake",
    "evavo_art_compile_atlas",
    "evavo_art_run_atlas",
    "EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE",
    "bytesFlowThroughMcp: false",
    "credentialsForwardedToSubprocess: false",
    "rawCommandOutputReturned: false",
    "repositoryMutation: false",
    "shell: false",
  ]],
  ["regression policy", [
    "PROJECT_ART_REQUIRE_PILLOW",
    "No Python 3 executable with Pillow is available.",
    "regressions skipped: Pillow unavailable",
    "python-version: \"3.13.5\"",
    "PIL.__version__",
    "hidden RGB",
    "expectedSha256",
  ]],
  ["documentation", [
    "ChatGPT",
    "Claude",
    "EVAVO Storage",
    "sprite atlas",
    "transparent RGB bleed",
    "exact RGBA paste",
    "bytes never travel through MCP",
    "credential",
    "project-art:review:mcp",
  ]],
]);
for (const [label, tokens] of required) {
  const source = sources.get(label);
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} lost ${token}`);
  }
}
for (const source of sources.values()) {
  for (const forbidden of ["git push --force", "sourceMutation: true", "repositoryMutation: true", "bytesFlowThroughMcp: true"]) {
    if (source.includes(forbidden)) errors.push(`forbidden authority token: ${forbidden}`);
  }
}
for (const error of errors) console.error(`  - ${error}`);
if (errors.length) process.exit(1);

run(process.execPath, ["scripts/test-project-art-atlas-contract.mjs"]);
const py = python();
run(py.executable, [
  ...py.prefix,
  "-m",
  "unittest",
  "scripts/test_project_art_atlas_alpha_bleed.py",
]);
console.log("Project-art chat intake and atlas contract passed");
