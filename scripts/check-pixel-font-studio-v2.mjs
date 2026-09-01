#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, cp, lstat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  SERVER_NAME,
  SERVER_VERSION,
  callTool,
  handleRequest,
  policy,
  toolDefinitions,
} from "./pixel-font-studio-v2-mcp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.EVAVO_PIXEL_FONT_PYTHON || (process.platform === "win32" ? "python" : "python3");
const fontToolsRequirement = process.env.EVAVO_PIXEL_FONT_REQUIRE_FONTTOOLS?.trim();
assert.ok(
  fontToolsRequirement === undefined ||
    fontToolsRequirement === "" ||
    fontToolsRequirement === "0" ||
    fontToolsRequirement === "1",
  "EVAVO_PIXEL_FONT_REQUIRE_FONTTOOLS must be 0 or 1 when supplied",
);
const requireFontTools = fontToolsRequirement === "1";
const expectedFontToolsVersion = "4.63.0";
const tool = path.join(root, "tools", "pixel_font_studio_v2.py");
const family = path.join(
  root,
  "config",
  "pixel-font-families",
  "chess-lord-v2",
  "chess-lord.family.json",
);
const requestedOutput = process.env.EVAVO_PIXEL_FONT_CHECK_OUTPUT?.trim();
let temporary = false;
let workspace;
if (requestedOutput) {
  workspace = path.resolve(requestedOutput);
  await mkdir(path.dirname(workspace), { recursive: true });
  try {
    await lstat(workspace);
    throw new Error(`EVAVO_PIXEL_FONT_CHECK_OUTPUT must not already exist: ${workspace}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(workspace);
} else {
  workspace = await mkdtemp(path.join(os.tmpdir(), "evavo-pixel-font-v2-check-"));
  temporary = true;
}

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    shell: false,
    timeout: options.timeout ?? 300_000,
    maxBuffer: 64 * 1024 * 1024,
    input: options.input,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONHASHSEED: "0",
      PYTHONPYCACHEPREFIX: path.join(workspace, "pycache"),
      SOURCE_DATE_EPOCH: "1577836800",
      ...options.env,
    },
  });
}

function run(command, args, options = {}) {
  const result = execute(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
  );
  return result;
}

function runJson(args, options = {}) {
  const result = run(python, [tool, ...args], options);
  return JSON.parse(result.stdout);
}

async function readSourceJson(sourcePath) {
  const bytes = await readFile(sourcePath);
  const decoded = sourcePath.endsWith(".gz") ? gunzipSync(bytes) : bytes;
  return JSON.parse(decoded.toString("utf8"));
}

function expectFailure(args, pattern) {
  const result = execute(python, [tool, ...args]);
  assert.notEqual(result.status, 0, `Expected failure: ${args.join(" ")}`);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
}

function stage(label) {
  console.log(`[pixel-font-v2] ${label}`);
}

stage("checking source inventory and syntax");
const requiredFiles = [
  "tools/pixel_font_studio_v2.py",
  "tools/pixel_font_v2/__init__.py",
  "tools/pixel_font_v2/common.py",
  "tools/pixel_font_v2/schema.py",
  "tools/pixel_font_v2/formats.py",
  "tools/pixel_font_v2/build.py",
  "tools/pixel_font_v2/cli.py",
  "scripts/pixel-font-studio-v2-mcp.mjs",
  "scripts/check-pixel-font-studio-v2.mjs",
  "scripts/integrate-pixel-font-studio-v2.mjs",
  "config/pixel-font-studio.v2.json",
  "config/mcp.pixel-font-studio-v2.example.json",
  "config/pixel-font-families/chess-lord-v2/ChessLord_UI.face.json.gz",
  "config/pixel-font-families/chess-lord-v2/ChessLord_Text.face.json.gz",
  "config/pixel-font-families/chess-lord-v2/ChessLord_Herald.face.json.gz",
  "config/pixel-font-families/chess-lord-v2/chess-lord.family.json",
  "docs/PIXEL_FONT_STUDIO_V2.md",
  "docs/CHESS_LORD_PIXEL_FONT_FAMILY_V2.md",
  "requirements/pixel-font-studio-v2.txt",
  ".github/workflows/pixel-font-studio-v2.yml",
];
for (const relative of requiredFiles) {
  const target = path.join(root, relative);
  const state = await lstat(target);
  assert.equal(state.isFile(), true, `${relative} must be a regular file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0 && state.size < 32 * 1024 * 1024, `${relative} has invalid size`);
}

run(python, ["-m", "compileall", "-q", path.join(root, "tools", "pixel_font_v2"), tool]);
run(process.execPath, ["--check", path.join(root, "scripts", "pixel-font-studio-v2-mcp.mjs")]);
run(process.execPath, ["--check", path.join(root, "scripts", "integrate-pixel-font-studio-v2.mjs")]);
const packagePath = path.join(root, "package.json");
const reliabilityPath = path.join(root, "evavo.reliability.json");
try {
  const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(packageDocument.scripts?.["pixel-font:v2:check"], "node scripts/check-pixel-font-studio-v2.mjs");
  assert.match(packageDocument.scripts?.["pixel-font:check"] ?? "", /check-pixel-font-studio-v2/u);
  const reliability = JSON.parse(await readFile(reliabilityPath, "utf8"));
  assert.equal(reliability.pixelFontStudioV2?.toolVersion, "2.2.0");
  assert.equal(reliability.pixelFontStudioV2?.godotPolicy?.targetVersion, "4.6.2");
  assert.equal(Object.values(reliability.pixelFontStudioV2?.authority ?? {}).every((value) => value === false), true);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

stage("checking contract and catalog");
const contract = JSON.parse(await readFile(path.join(root, "config", "pixel-font-studio.v2.json"), "utf8"));
assert.equal(contract.contract, "evavo.pixel-font-studio.v2");
assert.equal(contract.toolVersion, "2.2.0");
assert.equal(contract.canonicalRuntime.externalFontBinaryUsed, false);
assert.equal(contract.optionalDerivatives.ttf.canonicalRuntime, false);
assert.equal(contract.optionalDerivatives.ttf.dependency, "fonttools==4.63.0");
assert.equal(contract.optionalDerivatives.ttf.embeddingFsType, 0);
assert.equal(Object.values(contract.requirements).every(Boolean), true);
assert.equal(Object.values(contract.authority).every((value) => value === false), true);
assert.equal(
  contract.godot.officialLinuxArchiveSha256,
  "30e6b6d141f0cd5bebd629ad1d0ef1324e60091bb20662d026b402ba58c59937",
);
assert.equal(contract.requirements.independentGodotEvidenceValidation, true);
assert.equal(contract.requirements.godotEvidenceHashRetention, true);
assert.deepEqual(contract.godot.evidenceViewport, [320, 200]);
assert.equal(contract.godot.independentPngEvidenceValidation, true);
assert.equal(contract.godot.opaqueBinaryEvidencePalette, true);
assert.equal(contract.godot.nonEmptyForegroundRequired, true);
assert.equal(contract.godot.evidenceHashesRequired, true);

const catalog = runJson(["catalog"]);
assert.equal(catalog.schema, "evavo.pixel-font-family-master.v2");
assert.equal(catalog.toolVersion, "2.2.0");
assert.ok(catalog.optionalDerivatives.some((item) => item.includes("TrueType")));
assert.ok(catalog.interchangeFormats.some((item) => item.includes("BDF")));
assert.ok(catalog.interchangeFormats.some((item) => item.includes("atlas JSON")));
assert.ok(catalog.interchangeFormats.some((item) => item.includes("grid")));
assert.equal(catalog.godot.targetVersion, "4.6.2");
assert.equal(catalog.godot.officialLinuxArchiveSha256, contract.godot.officialLinuxArchiveSha256);
assert.ok(catalog.supports.some((item) => item.includes("independent PNG evidence")));
assert.deepEqual(catalog.godot.evidenceViewport, contract.godot.evidenceViewport);
assert.equal(catalog.godot.independentPngEvidenceValidation, true);
assert.equal(catalog.godot.opaqueBinaryEvidencePalette, true);
assert.equal(catalog.godot.nonEmptyForegroundRequired, true);
assert.equal(catalog.godot.evidenceHashesRequired, true);

stage("auditing independent face masters");
const audit = runJson(["audit", "--family", family]);
assert.equal(audit.status, "passed");
assert.equal(audit.faces.length, 3);
for (const faceAudit of audit.faces) {
  assert.equal(faceAudit.glyphCount, 397);
  assert.equal(faceAudit.kerningPairCount, 30);
  assert.equal(faceAudit.duplicateGroups.length, 0);
  assert.equal(faceAudit.collisionChecks, 397 * 397);
  assert.equal(faceAudit.coverage["western-latin"].present, 325);
}

const uiFace = path.join(path.dirname(family), "ChessLord_UI.face.json.gz");
const g = runJson(["inspect", "--face", uiFace, "--codepoint", "U+0067"]);
const q = runJson(["inspect", "--face", uiFace, "--codepoint", "U+0071"]);
assert.notDeepEqual(g.glyph.bitmap, q.glyph.bitmap);
assert.equal(g.glyph.yOffset < 10, true);
assert.equal(q.glyph.height >= 7, true);

stage("checking deterministic sealed gzip masters");
const sealedFaceA = path.join(workspace, "sealed-face-a.json.gz");
const sealedFaceB = path.join(workspace, "sealed-face-b.json.gz");
const uiFaceDocument = await readSourceJson(uiFace);
const sealInput = `${JSON.stringify(uiFaceDocument)}\n`;
run(python, [tool, "seal-face", "--output", sealedFaceA], { input: sealInput });
run(python, [tool, "seal-face", "--output", sealedFaceB], { input: sealInput });
const sealedBytesA = await readFile(sealedFaceA);
const sealedBytesB = await readFile(sealedFaceB);
assert.deepEqual(sealedBytesA.subarray(0, 2), Buffer.from([0x1f, 0x8b]));
assert.deepEqual(sealedBytesA, sealedBytesB);
assert.equal(runJson(["audit", "--face", sealedFaceA]).status, "passed");

stage("checking optional fontTools backend");
const fontToolsProbe = execute(python, [
  "-c",
  "import fontTools; print(fontTools.__version__)",
]);
const observedFontToolsVersion =
  fontToolsProbe.status === 0 ? fontToolsProbe.stdout.trim() : null;
const fontToolsReady = observedFontToolsVersion === expectedFontToolsVersion;
if (requireFontTools && !fontToolsReady) {
  if (temporary) await rm(workspace, { recursive: true, force: true });
  throw new Error(
    `EVAVO_PIXEL_FONT_REQUIRE_FONTTOOLS=1 requires fontTools ${expectedFontToolsVersion}; observed ${observedFontToolsVersion ?? "unavailable"}.`,
  );
}

if (!fontToolsReady) {
  stage("skipping optional fontTools-backed build verification");
  const optionalBackendReport = {
    schema: "evavo.pixel-font-studio-v2-check.v1",
    toolVersion: "2.2.0",
    familyId: audit.familyId,
    faceCount: audit.faces.length,
    glyphsPerFace: audit.faces.map((item) => item.glyphCount),
    kerningPairsPerFace: audit.faces.map((item) => item.kerningPairCount),
    duplicateGroups: audit.faces.map((item) => item.duplicateGroups.length),
    pairCollisionChecks: audit.faces.map((item) => item.collisionChecks),
    optionalBackends: {
      fontTools: {
        required: false,
        status: "skipped",
        expectedVersion: expectedFontToolsVersion,
        observedVersion: observedFontToolsVersion,
        reason:
          observedFontToolsVersion === null
            ? "fontTools is not installed in this workflow"
            : "the installed fontTools version is not the pinned reproducible backend",
      },
    },
    status: "passed",
  };
  await writeFile(
    path.join(workspace, "check-report.json"),
    `${JSON.stringify(optionalBackendReport, null, 2)}\n`,
    "utf8",
  );
  console.log("EVAVO Pixel Font Studio v2 structural checks passed.");
  console.log(`- workspace: ${workspace}`);
  console.log("- source inventory, syntax, contract, catalog and independent face audits passed");
  console.log(
    `- optional TTF/build verification skipped because fontTools ${expectedFontToolsVersion} is unavailable in this workflow`,
  );
  console.log(
    "- the dedicated Pixel Font Studio v2 workflow requires the exact backend and still runs the complete build, reproducibility, MCP and Godot suite",
  );
  if (temporary) await rm(workspace, { recursive: true, force: true });
} else {
  stage("building and validating deterministic family A");
const buildA = path.join(workspace, "build-a");
const buildB = path.join(workspace, "build-b");
const buildC = path.join(workspace, "build-mcp");
const buildResult = runJson(["build", "--master", family, "--output", buildA]);
assert.equal(buildResult.schema, "evavo.pixel-font-family.v2");
assert.equal(buildResult.faces.length, 3);
assert.equal(buildResult.optionalDerivatives.includes("TrueType .ttf"), true);
assert.ok(buildResult.interchangeFormats.some((item) => item.includes("BDF")));

const validation = runJson(["validate", "--family", path.join(buildA, "pixel-font-family.json")]);
assert.equal(validation.status, "passed");
assert.equal(validation.faceCount, 3);
assert.equal(validation.systemFallback, false);
for (const face of validation.faces) {
  assert.equal(face.glyphCount, 397);
  assert.equal(face.kerningPairCount, 30);
  assert.equal(face.bdf.status, "passed");
  assert.equal(face.atlasJson.status, "passed");
  assert.equal(face.gridSheet.status, "passed");
  assert.equal(face.ttf.kerningPresent, true);
  assert.equal(face.ttf.embeddingFsType, 0);
  assert.deepEqual(face.ttf.missing, []);
  assert.deepEqual(face.ttf.unexpected, []);
}

// PNGs are binary evidence. On Windows, writing through a text-mode file
// descriptor expands LF bytes to CRLF and silently corrupts the PNG signature.
// Check the emitted bytes directly so the studio can never regress to producing
// atlases that validate in memory but fail in Godot and image editors.
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const face of buildResult.faces) {
  for (const filename of [`${face.faceId}.png`, `${face.faceId}.grid.png`]) {
    const relative = path.join("fonts", face.faceId, filename);
    const signature = (await readFile(path.join(buildA, relative))).subarray(0, 8);
    assert.deepEqual(signature, pngSignature, `${relative} must have an exact PNG signature`);
  }
}

stage("building family B and comparing exact bytes");
runJson(["build", "--master", family, "--output", buildB]);
const reproducibility = runJson(["compare", "--first", buildA, "--second", buildB]);
assert.equal(reproducibility.status, "passed");
assert.equal(reproducibility.fileCount, 52);
expectFailure(["build", "--master", family, "--output", buildA], /must not already exist/u);

stage("proving fail-closed master and output validation");
const invalidFamilyRoot = path.join(workspace, "invalid-family");
await cp(path.dirname(family), invalidFamilyRoot, { recursive: true });
const invalidFamilyPath = path.join(invalidFamilyRoot, "chess-lord.family.json");
const invalidFamily = JSON.parse(await readFile(invalidFamilyPath, "utf8"));
invalidFamily.godot.systemFallback = true;
await writeFile(invalidFamilyPath, `${JSON.stringify(invalidFamily, null, 2)}\n`, "utf8");
expectFailure(["audit", "--family", invalidFamilyPath], /systemFallback must be false/u);

const invalidFacePath = path.join(workspace, "invalid-face.json");
const invalidFace = await readSourceJson(uiFace);
const glyphByCodepoint = new Map(invalidFace.glyphs.map((glyph) => [glyph.codepoint, glyph]));
const sourceG = glyphByCodepoint.get("g".codePointAt(0));
const targetQ = glyphByCodepoint.get("q".codePointAt(0));
Object.assign(targetQ, {
  width: sourceG.width,
  height: sourceG.height,
  xOffset: sourceG.xOffset,
  yOffset: sourceG.yOffset,
  xAdvance: sourceG.xAdvance,
  bitmap: sourceG.bitmap,
});
await writeFile(invalidFacePath, `${JSON.stringify(invalidFace, null, 2)}\n`, "utf8");
expectFailure(["audit", "--face", invalidFacePath], /identical letter\/number glyphs|indistinguishable confusable forms/u);

const corruptRoot = path.join(workspace, "corrupt-build");
await cp(buildA, corruptRoot, { recursive: true });
const corruptFnt = path.join(corruptRoot, "fonts", "ChessLord_UI", "ChessLord_UI.fnt");
await writeFile(corruptFnt, `${await readFile(corruptFnt, "utf8")}# tampered\n`, "utf8");
expectFailure(["validate", "--family", path.join(corruptRoot, "pixel-font-family.json")], /identity mismatch/u);

stage("proving MCP read/write and allowed-root boundaries");
const rootSet = [root, workspace].join(path.delimiter);
const readOnly = policy({
  ...process.env,
  EVAVO_PIXEL_FONT_ALLOWED_ROOTS: rootSet,
  EVAVO_PIXEL_FONT_STUDIO_MODE: "read-only",
  EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES: "false",
  EVAVO_PIXEL_FONT_PYTHON: python,
});
const readTools = toolDefinitions(readOnly).map((item) => item.name);
assert.equal(readTools.includes("evavo_pixel_font_v2_build"), false);
assert.equal(readTools.includes("evavo_pixel_font_v2_validate"), true);
const initial = await handleRequest(
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { policy: readOnly },
);
assert.equal(initial.result.serverInfo.name, SERVER_NAME);
assert.equal(initial.result.serverInfo.version, SERVER_VERSION);
const mcpCatalog = await callTool("evavo_pixel_font_v2_catalog", {}, { policy: readOnly });
assert.equal(mcpCatalog.toolVersion, "2.2.0");
const mcpAudit = await callTool("evavo_pixel_font_v2_audit", { familyPath: family }, { policy: readOnly });
assert.equal(mcpAudit.status, "passed");
const mcpInspect = await callTool(
  "evavo_pixel_font_v2_inspect_glyph",
  { facePath: uiFace, codepoint: "U+0067" },
  { policy: readOnly },
);
assert.equal(mcpInspect.glyph.codepoint, 0x67);
const mcpValidate = await callTool(
  "evavo_pixel_font_v2_validate",
  { familyPath: path.join(buildA, "pixel-font-family.json") },
  { policy: readOnly },
);
assert.equal(mcpValidate.status, "passed");
const outsideAllowedRoots =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "win.ini")
    : "/etc/passwd";
await assert.rejects(
  callTool("evavo_pixel_font_v2_audit", { facePath: outsideAllowedRoots }, { policy: readOnly }),
  /outside EVAVO_PIXEL_FONT_ALLOWED_ROOTS/u,
);

const readWrite = policy({
  ...process.env,
  EVAVO_PIXEL_FONT_ALLOWED_ROOTS: rootSet,
  EVAVO_PIXEL_FONT_STUDIO_MODE: "read-write",
  EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES: "true",
  EVAVO_PIXEL_FONT_PYTHON: python,
});
assert.equal(toolDefinitions(readWrite).some((item) => item.name === "evavo_pixel_font_v2_build"), true);
const mcpBuild = await callTool(
  "evavo_pixel_font_v2_build",
  { masterPath: family, outputRoot: buildC, confirmWrite: true },
  { policy: readWrite },
);
assert.equal(mcpBuild.familyId, "chess-lord-90s");
const mcpCompare = await callTool(
  "evavo_pixel_font_v2_compare_builds",
  { firstRoot: buildA, secondRoot: buildC },
  { policy: readOnly },
);
assert.equal(mcpCompare.status, "passed");

stage("running optional native Godot verification");
let godot = null;
const godotExecutable = process.env.EVAVO_PIXEL_FONT_GODOT?.trim();
if (godotExecutable) {
  const evidence = path.join(workspace, "godot-evidence");
  const args = [
    "verify-godot",
    "--family",
    path.join(buildA, "pixel-font-family.json"),
    "--godot",
    godotExecutable,
    "--evidence",
    evidence,
  ];
  const binarySha = process.env.EVAVO_PIXEL_FONT_GODOT_SHA256?.trim();
  if (binarySha) args.push("--sha256", binarySha);
  godot = runJson(args, { timeout: 600_000 });
  assert.equal(godot.status, "passed");
  assert.equal(godot.observedVersion.startsWith("4.6.2"), true);
  assert.equal(godot.evidenceIndependentlyVerified, true);
  assert.equal(godot.preflightValidation.status, "passed");
  assert.equal(godot.preflightValidation.familyId, "chess-lord-90s");
  assert.equal(godot.preflightValidation.faceCount, 3);
  assert.match(godot.engineReportSha256, /^[0-9a-f]{64}$/u);
  assert.equal(godot.engineReport.status, "passed");
  assert.equal(godot.engineReport.nonBinaryPixelCount, 0);
  assert.equal(godot.renderProof.status, "passed");
  assert.equal(godot.renderProof.width, 320);
  assert.equal(godot.renderProof.height, 200);
  assert.equal(godot.renderProof.pixelCount, 320 * 200);
  assert.ok(godot.renderProof.foregroundPixelCount >= 64);
  assert.ok(godot.renderProof.backgroundPixelCount > 0);
  assert.equal(
    godot.renderProof.foregroundPixelCount + godot.renderProof.backgroundPixelCount,
    godot.renderProof.pixelCount,
  );
  assert.equal(godot.renderProof.unexpectedPixelCount, 0);
  assert.deepEqual(godot.renderProof.palette, ["#000000ff", "#ffffffff"]);
  assert.match(godot.renderProof.sha256, /^[0-9a-f]{64}$/u);
  expectFailure(
    [
      "verify-godot",
      "--family",
      path.join(corruptRoot, "pixel-font-family.json"),
      "--godot",
      godotExecutable,
      "--evidence",
      path.join(workspace, "corrupt-godot-evidence"),
    ],
    /identity mismatch/u,
  );
}

stage("writing final evidence report");
const report = {
  schema: "evavo.pixel-font-studio-v2-check.v1",
  toolVersion: "2.2.0",
  familyId: audit.familyId,
  faceCount: audit.faces.length,
  glyphsPerFace: audit.faces.map((item) => item.glyphCount),
  kerningPairsPerFace: audit.faces.map((item) => item.kerningPairCount),
  duplicateGroups: audit.faces.map((item) => item.duplicateGroups.length),
  pairCollisionChecks: audit.faces.map((item) => item.collisionChecks),
  reproducibility,
  validation,
  mcp: {
    server: SERVER_NAME,
    version: SERVER_VERSION,
    readOnlyToolCount: readTools.length,
    writeBoundaryVerified: true,
    allowedRootBoundaryVerified: true,
  },
  godot,
  status: "passed",
};
await writeFile(path.join(workspace, "check-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("EVAVO Pixel Font Studio v2 checks passed.");
console.log(`- workspace: ${workspace}`);
console.log("- 3 independent Chess Lord faces, 397 glyphs each, 30 kerning pairs each");
console.log("- zero unapproved duplicate groups and exhaustive ordered-pair collision QA passed");
console.log("- BMFont, packed/grid PNG atlases, BDF, atlas JSON, Godot resources, native specimens and TTF cmap/kerning validated");
console.log("- Godot render evidence is independently decoded, palette-checked, foreground-checked and SHA-256 retained");
console.log(`- deterministic tree: ${reproducibility.treeSha256}`);
console.log(`- actual Godot 4.6.2 verification: ${godot ? "passed" : "not configured for this run"}`);

if (temporary) {
  await rm(workspace, { recursive: true, force: true });
}
}
