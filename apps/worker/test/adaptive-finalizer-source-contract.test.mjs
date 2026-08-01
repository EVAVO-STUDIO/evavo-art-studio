import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const readRepository = (relativePath) =>
  readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");

test("worker registers adaptive finalization and envelope-backed family verification", async () => {
  const [index, handler, guard, family, packageSource, tsconfigSource] =
    await Promise.all([
      read("src/index.ts"),
      read("src/adaptive-finalizer-handlers.ts"),
      read("src/adaptive-finalizer-guarded-handlers.ts"),
      read("src/adaptive-sprite-family-handlers.ts"),
      read("package.json"),
      read("tsconfig.json"),
    ]);
  const packageJson = JSON.parse(packageSource);
  const tsconfig = JSON.parse(tsconfigSource);

  for (const token of [
    "createGuardedAdaptiveFinalizerHandlers()",
    "createAdaptiveSpriteFamilyHandlers()",
    "guardedAdaptiveFinalizerWorkerCapabilities()",
    '"media.adaptive-finalize"',
  ]) {
    assert.ok(index.includes(token), `missing worker registration: ${token}`);
  }
  for (const token of [
    '"art.candidate.finalize-adaptive"',
    '"candidate-hostile-background-proof"',
    '"candidate-finalization-repair-plan"',
    '"candidate-adaptive-finalization-evidence"',
    "qualityThresholdsRelaxed: false",
    "finalizeDecodedSpriteFrame(",
    "optimizeDeliveryImage(",
  ]) {
    assert.ok(handler.includes(token), `missing adaptive handler invariant: ${token}`);
  }
  for (const token of [
    'deliveryProfileId: "godot-sprite-lossless"',
    "normalizeSuccessfulLineage(",
    '"candidate-adaptive-finalization-envelope"',
    "finalizationEnvelopeArtifactId: envelope.artifactId",
    "sourceArtifacts: [sourceId, envelope.artifactId]",
    "provenanceNormalized: true",
    "return base(guardedContext(context, payload))",
  ]) {
    assert.ok(guard.includes(token), `missing guarded evidence path: ${token}`);
  }
  for (const token of [
    '"sprite-family-adaptive-proof-evidence"',
    '"candidate-hostile-background-proof"',
    '"candidate-adaptive-finalization-envelope"',
    "finalizationEnvelopeArtifactId",
    "ADAPTIVE_FAMILY_ENVELOPE_BODY_MISMATCH",
    "everyEnvelopeVerified: true",
    "MAXIMUM_LINEAGE_DEPTH = 10",
    "qualityThresholdsRelaxed: false",
  ]) {
    assert.ok(family.includes(token), `missing adaptive family invariant: ${token}`);
  }
  assert.equal(packageJson.dependencies["@evavo/art-finalizer"], "workspace:*");
  assert.ok(
    tsconfig.references.some((entry) => entry.path === "../../packages/finalizer"),
  );
});

test("adaptive finalization has no provider, promotion, shell, or threshold-bypass authority", async () => {
  const combined = [
    await read("src/adaptive-finalizer-handlers.ts"),
    await read("src/adaptive-finalizer-guarded-handlers.ts"),
    await read("src/adaptive-sprite-family-handlers.ts"),
  ].join("\n");
  for (const forbidden of [
    "OPENAI_API_KEY",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference(",
    "runtime.submit(",
    "child_process",
    "shell: true",
    "relaxThresholds",
    "acceptFailed",
    "skipValidation",
    "skipVerification",
  ]) {
    assert.ok(
      !combined.includes(forbidden),
      `adaptive finalization contains forbidden authority: ${forbidden}`,
    );
  }
});

test("repository build graph includes the finalizer package", async () => {
  const rootPackage = JSON.parse(await readRepository("package.json"));
  assert.match(rootPackage.scripts["build:domain"], /@evavo\/art-finalizer build/);
});
