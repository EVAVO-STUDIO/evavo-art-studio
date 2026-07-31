import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("complete sprite planner workbench exposes the real deterministic compiler", async () => {
  const [component, route, page, example, css, packageJson, nextConfig] =
    await Promise.all([
      read("app/sprite-planner-workbench.tsx"),
      read("app/api/sprite-plan/route.ts"),
      read("app/page.tsx"),
      read("lib/defaultSpritePlan.ts"),
      read("app/sprite-planner-workbench.module.css"),
      read("package.json"),
      read("next.config.ts"),
    ]);

  for (const token of [
    '"use client"',
    'fetch("/api/sprite-plan"',
    "compiledPlan",
    "compiledJob",
    "plan.directions",
    "plan.clips",
    "plan.layers",
    "plan.variants.strategies",
    "plan.sheets",
    "plan.atlas",
    "plan.aseprite",
    "plan.godot",
    "Plan JSON",
    "Job JSON",
  ]) {
    assert.ok(component.includes(token), `missing sprite workbench invariant: ${token}`);
  }

  for (const token of [
    "isCrossSiteRequest(request)",
    "readBoundedJson(request, MAXIMUM_REQUEST_BYTES)",
    "compileSpriteProductionPlan(body)",
    "compileSpritePlanJob(body)",
    "SPRITE_PLAN_CROSS_SITE_REJECTED",
  ]) {
    assert.ok(route.includes(token), `missing sprite route invariant: ${token}`);
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
      `sprite planner workbench contains execution shortcut: ${forbidden}`,
    );
  }

  assert.ok(page.includes("<SpritePlannerWorkbench"));
  assert.ok(page.includes('href="#sprite-planner"'));
  assert.ok(page.includes("DEFAULT_SPRITE_PLAN_REQUEST"));
  assert.ok(css.includes(".directionGrid"));
  assert.ok(css.includes(".clipTable"));
  assert.ok(css.includes(".variantGrid"));
  assert.ok(css.includes(".deliveryGrid"));
  assert.ok(css.includes(".gates"));

  for (const token of [
    'role: "playable-character"',
    'gameplayProfile: "action-rpg"',
    'coverage: "complete"',
    'fidelity: "premium"',
    'allowDerivedMirrors: false',
    'id: "ship-rigging-swing"',
    "weaponVariants: 4",
    "teamColourVariants: 4",
    'sheetStrategy: "per-clip-layer-grid"',
  ]) {
    assert.ok(example.includes(token), `missing sprite example invariant: ${token}`);
  }

  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.dependencies["@evavo/art-sprite-planner"],
    "workspace:*",
  );
  assert.ok(nextConfig.includes('"@evavo/art-sprite-planner"'));
});

test("browser sprite planning boundary is bounded and provider-free", async () => {
  const route = await read("app/api/sprite-plan/route.ts");
  assert.ok(route.includes("const MAXIMUM_REQUEST_BYTES = 2 * 1024 * 1024"));
  assert.ok(route.includes("provider-free"));
  assert.ok(!route.includes("process.env.OPENAI"));
  assert.ok(!route.includes("EVAVO_ART_WRITE_TOKEN"));
});
