import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BRASS_ART_REVIEW_PROFILE,
  BRASS_ART_REVIEW_TOOL_NAMES,
  reviewAllowedRoots,
  reviewCapabilityDocument,
} from "../dist/review.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../src/review.ts");
const source = fs.readFileSync(sourcePath, "utf8");

function temporaryRoots() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "evavo-brass-art-review-mcp-"),
  );
  const game = path.join(root, "Brass_Brine");
  const evidence = path.join(root, "evidence");
  fs.mkdirSync(game);
  fs.mkdirSync(evidence);
  return {
    root,
    game,
    evidence,
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("review roots are explicit, canonical and duplicate-free", () => {
  assert.throws(
    () => reviewAllowedRoots(""),
    /must declare at least one explicit root/iu,
  );
  const current = temporaryRoots();
  try {
    const roots = reviewAllowedRoots(
      [current.game, current.evidence, current.game].join(path.delimiter),
    );
    assert.deepEqual(roots, [current.game, current.evidence]);
  } finally {
    current.dispose();
  }
});

test("review profile exposes exactly six non-writing tools", () => {
  const current = temporaryRoots();
  try {
    const value = reviewCapabilityDocument(
      [current.game, current.evidence].join(path.delimiter),
    );
    assert.equal(value.profile, BRASS_ART_REVIEW_PROFILE);
    assert.deepEqual(value.tools, BRASS_ART_REVIEW_TOOL_NAMES);
    assert.deepEqual(BRASS_ART_REVIEW_TOOL_NAMES, [
      "art_review_capabilities",
      "validate_art_brief",
      "compile_art_production_plan",
      "inspect_art_repository",
      "inspect_sprite_frame_quality",
      "inspect_sprite_sequence_quality",
    ]);
    for (const key of [
      "writesEnabled",
      "providerExecutionAllowed",
      "runtimeJobSubmissionAllowed",
      "runtimeJobControlAllowed",
      "artifactMutationAllowed",
      "targetRepositoryMutationAllowed",
      "deletionAuthority",
      "promotionAuthority",
      "publicationAuthority",
      "arbitraryShellAllowed",
      "arbitraryGitArgumentsAllowed",
    ]) {
      assert.equal(value[key], false, key);
    }
  } finally {
    current.dispose();
  }
});

test("review source registers only the governed inspection and planning inventory", () => {
  const registered = [
    ...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/gu),
  ].map((match) => match[1]);
  assert.deepEqual(registered, [...BRASS_ART_REVIEW_TOOL_NAMES]);
  for (const required of [
    "EVAVO_ART_REVIEW_ALLOWED_ROOTS",
    "assertPathWithinAllowedRoots",
    "inspectRepository",
    "analyseDecodedSpriteFrame",
    "analyseSpriteSequenceManifestFile",
    "createProductionPlan",
    "reviewAllowedRoots();",
  ]) {
    assert.equal(source.includes(required), true, required);
  }
});

test("review source imports no provider, runtime, artifact or write implementation", () => {
  for (const forbidden of [
    "registerRuntimeTools",
    "registerProviderTools",
    "registerBookArtTools",
    "registerSelectionTools",
    "registerSpriteFamilyTools",
    "buildSpriteAtlasPackage",
    "writeGodotSpriteFramesImporter",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "EVAVO_ART_ARTIFACT_ROOT",
    "node:child_process",
    "git push",
    "git commit",
    "shell: true",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("symlinked review roots fail closed", () => {
  const current = temporaryRoots();
  const link = path.join(current.root, "linked-game");
  try {
    try {
      fs.symlinkSync(current.game, link, "dir");
    } catch (error) {
      current.dispose();
      if (error && typeof error === "object" && "code" in error) {
        test.skip(`symlinks unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(
      () => reviewAllowedRoots(link),
      /non-symlink directory/iu,
    );
  } finally {
    if (fs.existsSync(current.root)) current.dispose();
  }
});
