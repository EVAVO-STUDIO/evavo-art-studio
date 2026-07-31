import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("art-direction workbench compiles the real governed contract", async () => {
  const [component, route, page, example, css, packageJson, nextConfig] =
    await Promise.all([
      read("app/art-direction-workbench.tsx"),
      read("app/api/art-direction/route.ts"),
      read("app/page.tsx"),
      read("lib/defaultArtDirection.ts"),
      read("app/art-direction-workbench.module.css"),
      read("package.json"),
      read("next.config.ts"),
    ]);

  for (const token of [
    '"use client"',
    'fetch("/api/art-direction"',
    "compiledContract",
    "compiledJob",
    "immutableLocks",
    "prohibitedChanges",
    "qualityGates",
    "production.layers",
    "delivery.godot",
    "Contract JSON",
    "Job JSON",
  ]) {
    assert.ok(component.includes(token), `missing workbench invariant: ${token}`);
  }

  for (const token of [
    "isCrossSiteRequest(request)",
    "readBoundedJson(request, MAXIMUM_REQUEST_BYTES)",
    "compileArtDirectionContract(body)",
    "compileArtDirectionJob(body)",
    'executionBoundary:',
  ]) {
    assert.ok(route.includes(token), `missing route invariant: ${token}`);
  }

  for (const forbidden of [
    "OPENAI_API_KEY",
    "executeProviderCandidateRequest",
    "LocalArtifactStore",
    "updateReference(",
    "promoteSelectedCandidate",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !`${component}\n${route}`.includes(forbidden),
      `workbench contains execution shortcut: ${forbidden}`,
    );
  }

  assert.ok(page.includes("<ArtDirectionWorkbench"));
  assert.ok(page.includes('href="#art-direction"'));
  assert.ok(page.includes("listArtDirectionPresets()"));
  assert.ok(page.includes("listArtDirectionOutputProfiles()"));
  assert.ok(css.includes(".selectorRail"));
  assert.ok(css.includes(".layerTable"));
  assert.ok(css.includes(".gateList"));
  assert.ok(css.includes(".outputCards"));

  for (const token of [
    'presetId: "isometric-rpg-1997"',
    "tileWidthPixels: 64",
    "tileHeightPixels: 32",
    "directionCount: 8",
    'runtimeEquipmentSwaps: true',
    'role: "collision"',
    'treatment: "engine-sidecar"',
  ]) {
    assert.ok(example.includes(token), `missing example invariant: ${token}`);
  }

  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.dependencies["@evavo/art-direction"],
    "workspace:*",
  );
  assert.ok(nextConfig.includes('"@evavo/art-direction"'));
});

test("art-direction browser boundary is bounded and provider-free", async () => {
  const route = await read("app/api/art-direction/route.ts");
  assert.ok(route.includes("const MAXIMUM_REQUEST_BYTES = 1024 * 1024"));
  assert.ok(route.includes("ART_DIRECTION_CROSS_SITE_REJECTED"));
  assert.ok(route.includes("deterministic and provider-free"));
  assert.ok(!route.includes("process.env.OPENAI"));
  assert.ok(!route.includes("EVAVO_ART_WRITE_TOKEN"));
});
