import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(root, "packages/core/src/book-studio-universal-readiness.ts");
const testPath = path.join(root, "packages/core/test/book-studio-universal-readiness.test.mjs");

function replaceExactly(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact anchor, found ${count}.`);
  return source.replace(before, after);
}

let core = await readFile(corePath, "utf8");
core = replaceExactly(
  core,
  `export interface BookCoverReadinessV1 {\n  creativeRouteTarget: number;\n  candidatesPerRoute: number;\n  candidateTarget: number;\n  manuscriptBoundBriefRequired: true;\n  textFreeArtworkRequired: boolean;\n  editableTypographyRequired: boolean;\n  seriesIdentityRequired: boolean;\n  immutablePromotionRequired: true;\n  exactBookUseBindingRequired: true;\n}`,
  `export interface BookCoverReadinessV1 {\n  creativeRouteTarget: number;\n  candidatesPerRoute: number;\n  candidateTarget: number;\n  manuscriptBoundBriefRequired: true;\n  textFreeArtworkRequired: boolean;\n  editableTypographyRequired: boolean;\n  seriesIdentityRequired: boolean;\n  immutablePromotionRequired: boolean;\n  exactBookUseBindingRequired: boolean;\n}`,
  "cover readiness type",
);
core = replaceExactly(
  core,
  `  const coverArtRequired = project.artPolicy.artStudioEnabled;`,
  `  const coverArtRequired =\n    project.artPolicy.artStudioEnabled &&\n    volume.coverPlan.textFreeGeneratedArtworkRequired;`,
  "per-volume cover authority",
);
core = replaceExactly(
  core,
  `      seriesIdentityRequired: volume.coverPlan.seriesIdentityRequired,\n      immutablePromotionRequired: true,\n      exactBookUseBindingRequired: true,`,
  `      seriesIdentityRequired: volume.coverPlan.seriesIdentityRequired,\n      immutablePromotionRequired: coverArtRequired,\n      exactBookUseBindingRequired: coverArtRequired,`,
  "cover promotion and binding flags",
);
core = replaceExactly(
  core,
  `  if (project.artPolicy.artStudioEnabled && project.artPolicy.generatedArtworkTextFreeRequired && !volume.coverPlan.textFreeGeneratedArtworkRequired) {\n    add(\n      "cover_text_free_policy_mismatch",\n      "blocker",\n      \`Volume \${volume.volumeId} cover plan conflicts with the project text-free generated artwork policy.\`,\n      "Keep generated cover artwork text-free and add title, author, series, spine, ISBN and barcode as editable Docs Suite layers.",\n    );\n  }`,
  `  if (generatedCoverRequired && !project.artPolicy.generatedArtworkTextFreeRequired) {\n    add(\n      "cover_text_free_policy_mismatch",\n      "blocker",\n      \`Volume \${volume.volumeId} requests generated cover artwork while the project does not require text-free generated pixels.\`,\n      "Require text-free generated cover artwork and add title, author, series, spine, ISBN and barcode as editable Docs Suite layers.",\n    );\n  }`,
  "generated-cover policy semantics",
);
await writeFile(corePath, core, "utf8");

let tests = await readFile(testPath, "utf8");
const title = "supports mixed generated-art and typography-only covers in one series";
if (!tests.includes(title)) {
  tests += `\n\ntest("${title}", async () => {\n  const input = project("fiction");\n  input.projectId = "mixed-cover-series";\n  input.projectKind = "series";\n  input.sourceAuthorityIds.push("source-authority-2");\n\n  const artVolume = input.volumes[0];\n  artVolume.illustrationPlan = {\n    mode: "none",\n    minimumCount: 0,\n    targetCount: 0,\n    maximumCount: 0,\n    fullPageTarget: 0,\n    smallOrInlineTarget: 0,\n    textWrapRequired: false,\n    reflowFallback: "not_applicable",\n    textFreeGeneratedArtworkRequired: true,\n    editableLabelsRequired: true,\n    sourceEvidenceRequired: true,\n  };\n\n  const typographyVolume = volume("fiction", "volume-2", 2, ["volume-1"]);\n  typographyVolume.coverPlan.textFreeGeneratedArtworkRequired = false;\n  typographyVolume.illustrationPlan = structuredClone(artVolume.illustrationPlan);\n  input.volumes.push(typographyVolume);\n\n  const result = await compileBookUniversalReadiness(input);\n  assert.equal(result.status, "ready_for_automation", result.findings.map((item) => item.message).join("\\n"));\n\n  const generated = result.volumes.find((item) => item.volumeId === "volume-1");\n  const typography = result.volumes.find((item) => item.volumeId === "volume-2");\n  assert.ok(generated);\n  assert.ok(typography);\n\n  assert.equal(generated.cover.immutablePromotionRequired, true);\n  assert.equal(generated.cover.exactBookUseBindingRequired, true);\n  assert.ok(generated.automationStages.some((stage) => stage.kind === "cover_candidate" && stage.owner === "art_studio"));\n  assert.ok(generated.automationStages.some((stage) => stage.kind === "cover_binding" && stage.owner === "docs_suite"));\n\n  assert.equal(typography.cover.immutablePromotionRequired, false);\n  assert.equal(typography.cover.exactBookUseBindingRequired, false);\n  assert.equal(typography.automationStages.some((stage) => stage.kind === "cover_candidate"), false);\n  assert.equal(typography.automationStages.some((stage) => stage.kind === "cover_promotion"), false);\n  assert.equal(typography.automationStages.some((stage) => stage.kind === "cover_binding"), false);\n  assert.ok(typography.automationStages.some((stage) =>\n    stage.kind === "cover_selection" &&\n    stage.owner === "human_or_external" &&\n    stage.gateIds.includes("typography_only_or_approved_external_art_route")\n  ));\n  assert.equal(result.totals.artworkUseBindingTarget, 1);\n});\n`;
  await writeFile(testPath, tests, "utf8");
}

console.log(JSON.stringify({ status: "PATCHED", mixedCoverMode: true }, null, 2));
