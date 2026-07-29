import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("frame QA route uses the shared decoded-pixel kernel and fails closed", async () => {
  const route = `${await read("app/api/quality/sprite-frame/route.ts")}\n${await read("app/api/quality/route-utils.ts")}`;
  for (const token of [
    'runtime = "nodejs"',
    'dynamic = "force-dynamic"',
    "readBoundedJson",
    "strictBase64",
    "decodeSpriteFrame",
    "analyseDecodedSpriteFrame",
    "FRAME_MAXIMUM_SOURCE_BYTES",
    "FRAME_MAXIMUM_PIXELS",
    "isCrossSiteRequest",
    "browserQaEnabled",
    "cache-control",
  ]) assert.ok(route.includes(token), `missing frame route token: ${token}`);
  for (const forbidden of ["NEXT_PUBLIC_", "localStorage", "dangerouslySetInnerHTML", "provider.generate"]) {
    assert.ok(!route.includes(forbidden), `forbidden frame route shortcut: ${forbidden}`);
  }
});

test("sequence QA route bounds frames, bytes, pixels and decode concurrency", async () => {
  const route = await read("app/api/quality/sprite-sequence/route.ts");
  for (const token of [
    "SEQUENCE_MAXIMUM_FRAMES",
    "SEQUENCE_MAXIMUM_FRAME_BYTES",
    "SEQUENCE_MAXIMUM_TOTAL_IMAGE_BYTES",
    "validateSpriteSequenceManifest",
    "FRAME_COUNT_MISMATCH",
    "FRAME_DUPLICATE_ID",
    "FRAME_UNDECLARED",
    "Math.min(4, jobs.length)",
    "analyseSpriteSequence",
  ]) assert.ok(route.includes(token), `missing sequence route token: ${token}`);
});

test("frame workbench exposes hostile mattes, overlays and evidence export", async () => {
  const component = await read("app/sprite-quality-workbench.tsx");
  for (const token of [
    'id="frame-qa"',
    "Black proof",
    "White proof",
    "Grey proof",
    "Green proof",
    "Magenta proof",
    "paddingGuide",
    "boundsGuide",
    'fetch("/api/quality/sprite-frame"',
    "Download evidence JSON",
    "The browser preview is never treated as proof",
  ]) assert.ok(component.includes(token), `missing frame workbench token: ${token}`);
  assert.ok(!component.includes("report: { passed: true"), "frame QA must not fabricate a browser-side pass");
});

test("sequence workbench keeps exact manifests and deliberate duplicate declarations", async () => {
  const component = await read("app/sprite-sequence-workbench.tsx");
  for (const token of [
    'id="sequence-qa"',
    "MAXIMUM_FRAMES = 32",
    "naturalCompare",
    "durationMs",
    "expectedPivot",
    "expectedBaseline",
    "groundContactTolerance",
    "intentionalDuplicateOf",
    'fetch("/api/quality/sprite-sequence"',
    "Failed frame evidence",
  ]) assert.ok(component.includes(token), `missing sequence workbench token: ${token}`);
});

test("web configuration includes the shared quality package and keeps Sharp server-side", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const nextConfig = await read("next.config.ts");
  const page = await read("app/page.tsx");
  assert.equal(packageJson.dependencies["@evavo/art-quality"], "workspace:*");
  assert.ok(nextConfig.includes('"@evavo/art-quality"'));
  assert.ok(nextConfig.includes('serverExternalPackages: ["sharp"]'));
  assert.ok(page.includes("<SpriteQualityWorkbench />"));
  assert.ok(page.includes("<SpriteSequenceWorkbench />"));
});
