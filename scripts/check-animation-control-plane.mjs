#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { verifyAnimationPipelineV1 } from "../tools/animation_pipeline_doctor_v1.mjs";
import {
  assertHumanCelAnimationAuthorityIntegrity,
  compileHumanCelAnimationAuthority,
} from "../tools/human_cel_animation_authority_v1.mjs";

const ROOT = process.cwd();
const STALE_SEQUENCE_ENTRY = "tools/canonical_animation_sequence_delivery_v1_mcp.mjs";
const DANGEROUS_PIPELINE_FLAGS = Object.freeze([
  "EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED",
  "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL_ENABLED",
  "EVAVO_ANIMATION_ARTIFACT_PROMOTION_ENABLED",
  "EVAVO_ANIMATION_TARGET_REPOSITORY_MUTATION_ENABLED",
  "EVAVO_ANIMATION_GIT_COMMIT_ENABLED",
  "EVAVO_ANIMATION_GIT_PUSH_ENABLED",
  "EVAVO_ANIMATION_RUNTIME_ACTIVATION_ENABLED",
  "EVAVO_ANIMATION_PUBLICATION_ENABLED",
]);

const REQUIRED_FILES = Object.freeze([
  "tools/animation_pipeline_control_plane_v1_1_mcp.mjs",
  "tools/animation_pipeline_doctor_v1.mjs",
  "tools/animation_pipeline_doctor_v1_cli.mjs",
  "tools/animation_frame_work_ledger_v1_mcp.mjs",
  "tools/animation_sequence_delivery_canonical_v1_mcp.mjs",
  "tools/animation_character_family_campaign_preflight_v1.mjs",
  "tools/animation_execution_supervisor_v1_mcp.mjs",
  "tools/human_cel_animation_authority_v1.mjs",
  "tools/human_cel_animation_authority_v1_mcp.mjs",
  "scripts/start-animation-execution-supervisor-mcp-v1.mjs",
  ".mcp.animation-pipeline-v1.json",
  ".mcp.animation-frame-ledger-v1.json",
  ".mcp.animation-production-canonical-v1.json",
  ".mcp.animation-character-family-campaign-preflight-v1.json",
  ".mcp.animation-execution-supervisor-v1.json",
  ".mcp.human-cel-animation-authority-v1.json",
  "evavo.capabilities.json",
  "docs/ANIMATION_CONTROL_PLANE.md",
  "docs/human-cel-animation-authority-v1.md",
]);

const SYNTAX_FILES = Object.freeze([
  "tools/animation_pipeline_control_plane_v1_1_mcp.mjs",
  "tools/animation_pipeline_doctor_v1.mjs",
  "tools/animation_pipeline_doctor_v1_cli.mjs",
  "tools/animation_frame_work_ledger_v1_mcp.mjs",
  "tools/animation_sequence_delivery_canonical_v1_mcp.mjs",
  "tools/animation_character_family_campaign_preflight_v1.mjs",
  "tools/animation_execution_supervisor_v1_mcp.mjs",
  "tools/human_cel_animation_authority_v1.mjs",
  "tools/human_cel_animation_authority_v1_mcp.mjs",
  "scripts/start-animation-execution-supervisor-mcp-v1.mjs",
]);

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function safeAbsolute(path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) {
    fail("ANIMATION_CONTROL_CHECK_PATH_INVALID", String(path));
  }
  const absolute = resolve(ROOT, path);
  const rel = relative(ROOT, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    fail("ANIMATION_CONTROL_CHECK_PATH_OUTSIDE_REPOSITORY", path);
  }
  return absolute;
}

async function requireRegularFile(path) {
  const absolute = safeAbsolute(path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("ANIMATION_CONTROL_CHECK_REGULAR_FILE_REQUIRED", path);
  }
  return absolute;
}

async function readJson(path) {
  const absolute = await requireRegularFile(path);
  return JSON.parse(await readFile(absolute, "utf8"));
}

function exactServer(document, name, args) {
  const server = document?.mcpServers?.[name];
  assert.ok(server && typeof server === "object" && !Array.isArray(server), `${name} must be registered`);
  assert.equal(server.command, "node", `${name} must use node`);
  assert.deepEqual(server.args, args, `${name} must use the canonical entrypoint`);
  return server;
}

function assertDisabled(environment, names, label) {
  for (const name of names) {
    assert.equal(environment?.[name], "disabled", `${label}:${name} must be explicitly disabled`);
  }
}

function capability(document, id) {
  const value = document?.capabilities?.find((entry) => entry?.id === id);
  assert.ok(value, `Capability ${id} must be declared`);
  return value;
}

function assertEntrypoints(entry, required) {
  assert.ok(Array.isArray(entry.entrypoints), `${entry.id} entrypoints must be an array`);
  for (const item of required) {
    assert.ok(entry.entrypoints.includes(item), `${entry.id} must expose ${item}`);
  }
}

function syntaxCheck(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(
      "ANIMATION_CONTROL_CHECK_SYNTAX_FAILED",
      `${path}:${String(result.stderr || result.stdout || "node --check failed").trim()}`,
    );
  }
}

function humanCelSmokeAuthority() {
  const authority = compileHumanCelAnimationAuthority({
    id: "animation_control_human_cel_smoke",
    revision: 1,
    targets: ["cel-sequence"],
    subject: {
      subjectId: "subject",
      identityLockId: "subject_identity_v1",
      silhouetteAnchors: ["head silhouette", "shoulder silhouette"],
      costumeAnchors: ["collar construction"],
      anatomyRule: "Preserve approved proportions, joint count and contact construction.",
    },
    camera: {
      profileId: "camera_profile",
      motion: "locked",
      framing: "stable three-quarter medium shot with fixed horizon",
    },
    performance: {
      intent: "Held attentive acting with deliberate substitutions only.",
      weight: "Grounded balance with explicit contact.",
      tempo: "Cel timing with authored holds and selective movement.",
      continuityAnchors: ["head registration", "shoulder registration"],
    },
    style: {
      motionStyle: "limited-cel",
      lineTreatment: "economical cleanup with controlled contour hierarchy",
      shapeLanguage: ["specific silhouette", "restrained interior construction"],
      antiGenericTraits: ["stable identity", "authored holds", "source-based lighting"],
      exclusions: ["pseudo-text", "random line boil", "generic rim light"],
    },
  });
  assert.equal(assertHumanCelAnimationAuthorityIntegrity(authority), true);
  assert.equal(authority.authority.mode, "human-cel-authored");
  assert.equal(authority.handoff.targetRepository, "EVAVO-STUDIO/cel-animation-studio");
  assert.equal(authority.handoff.minimumPackageVersion, "0.33.0");
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelQualityGate"));
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelFinishReview"));
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelCinematographyReview"));
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelEnvironmentReview"));
  return authority;
}

async function main() {
  for (const path of REQUIRED_FILES) await requireRegularFile(path);
  for (const path of SYNTAX_FILES) syntaxCheck(path);

  const doctor = await verifyAnimationPipelineV1({ role: "art-studio", root: ROOT });
  assert.notEqual(doctor.status, "blocked", "Animation pipeline doctor must not be blocked");

  const pipelineConfig = await readJson(".mcp.animation-pipeline-v1.json");
  const pipeline = exactServer(
    pipelineConfig,
    "evavo-animation-pipeline-v1",
    ["tools/animation_pipeline_control_plane_v1_1_mcp.mjs"],
  );
  assert.equal(pipeline.env?.EVAVO_ANIMATION_PIPELINE_ROLE, "art-studio");
  assertDisabled(pipeline.env, DANGEROUS_PIPELINE_FLAGS, "animation-pipeline");

  const ledgerConfig = await readJson(".mcp.animation-frame-ledger-v1.json");
  const ledger = exactServer(
    ledgerConfig,
    "evavo-animation-frame-ledger-v1",
    ["tools/animation_frame_work_ledger_v1_mcp.mjs"],
  );
  assert.equal(ledger.env?.EVAVO_ANIMATION_FRAME_LEDGER_ROLE, "art-studio");
  assertDisabled(ledger.env, DANGEROUS_PIPELINE_FLAGS, "animation-frame-ledger");

  const canonicalConfig = await readJson(".mcp.animation-production-canonical-v1.json");
  const profile = exactServer(
    canonicalConfig,
    "evavo-animation-production-profile",
    ["tools/animation_production_profile_canonical_v1_mcp.mjs"],
  );
  assertDisabled(profile.env, [
    "EVAVO_ANIMATION_PROVIDER_EXECUTION",
    "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL",
    "EVAVO_ANIMATION_ARTIFACT_PROMOTION",
    "EVAVO_ANIMATION_RUNTIME_ACTIVATION",
    "EVAVO_ANIMATION_REPOSITORY_MUTATION",
    "EVAVO_ANIMATION_PUBLICATION",
  ], "animation-production-profile");
  const delivery = exactServer(
    canonicalConfig,
    "evavo-animation-sequence-delivery",
    ["tools/animation_sequence_delivery_canonical_v1_mcp.mjs"],
  );
  assertDisabled(delivery.env, [
    "EVAVO_ANIMATION_MEDIA_RESOLUTION",
    "EVAVO_ANIMATION_TRANSCODING",
    "EVAVO_ANIMATION_INTERPOLATION",
    "EVAVO_ANIMATION_RUNTIME_ACTIVATION",
    "EVAVO_ANIMATION_REPOSITORY_MUTATION",
    "EVAVO_ANIMATION_PUBLICATION",
  ], "animation-sequence-delivery");

  const campaignConfig = await readJson(".mcp.animation-character-family-campaign-preflight-v1.json");
  const campaign = exactServer(
    campaignConfig,
    "evavo-animation-character-family-campaign-preflight-v1",
    ["tools/animation_character_family_campaign_preflight_v1.mjs", "mcp"],
  );
  assert.equal(
    campaign.env?.EVAVO_ANIMATION_CHARACTER_FAMILY_PREFLIGHT_READ_ENABLED,
    "disabled",
    "Character-family preflight must not gain ambient repository-read authority",
  );

  const supervisorConfig = await readJson(".mcp.animation-execution-supervisor-v1.json");
  const supervisor = exactServer(
    supervisorConfig,
    "evavo-animation-execution-supervisor-v1",
    ["scripts/start-animation-execution-supervisor-mcp-v1.mjs"],
  );
  assert.equal(supervisor.env?.EVAVO_ANIMATION_EXECUTION_ENABLED, "disabled");
  assert.equal(supervisor.env?.EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED, "disabled");

  const humanCelConfig = await readJson(".mcp.human-cel-animation-authority-v1.json");
  const humanCel = exactServer(
    humanCelConfig,
    "evavo-human-cel-animation-authority-v1",
    ["tools/human_cel_animation_authority_v1_mcp.mjs"],
  );
  assertDisabled(humanCel.env, [
    "EVAVO_HUMAN_CEL_PROVIDER_EXECUTION",
    "EVAVO_HUMAN_CEL_CREATIVE_APPROVAL",
    "EVAVO_HUMAN_CEL_REPOSITORY_MUTATION",
    "EVAVO_HUMAN_CEL_PUBLICATION",
  ], "human-cel-animation-authority");
  const humanCelAuthority = humanCelSmokeAuthority();

  const capabilities = await readJson("evavo.capabilities.json");
  assertEntrypoints(capability(capabilities, "art.animation.pipeline"), [
    "node tools/animation_pipeline_control_plane_v1_1_mcp.mjs",
    ".mcp.animation-pipeline-v1.json",
  ]);
  assertEntrypoints(capability(capabilities, "art.animation.frame-ledger"), [
    "node tools/animation_frame_work_ledger_v1_mcp.mjs",
    ".mcp.animation-frame-ledger-v1.json",
  ]);
  assertEntrypoints(capability(capabilities, "art.animation.delivery"), [
    "node tools/animation_sequence_delivery_canonical_v1_mcp.mjs",
    ".mcp.animation-production-canonical-v1.json",
  ]);
  assertEntrypoints(capability(capabilities, "art.animation.character-family-preflight"), [
    "node tools/animation_character_family_campaign_preflight_v1.mjs verify",
    ".mcp.animation-character-family-campaign-preflight-v1.json",
  ]);
  assertEntrypoints(capability(capabilities, "art.animation.execution-supervisor"), [
    "node scripts/start-animation-execution-supervisor-mcp-v1.mjs",
    ".mcp.animation-execution-supervisor-v1.json",
  ]);
  assertEntrypoints(capability(capabilities, "art.animation.human-cel-authority"), [
    "node tools/human_cel_animation_authority_v1_mcp.mjs",
    ".mcp.human-cel-animation-authority-v1.json",
    "docs/human-cel-animation-authority-v1.md",
  ]);

  const capabilityText = JSON.stringify(capabilities);
  assert.equal(
    capabilityText.includes(STALE_SEQUENCE_ENTRY),
    false,
    `Capability registry must not reference stale entrypoint ${STALE_SEQUENCE_ENTRY}`,
  );

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    check: "animation-control",
    doctorStatus: doctor.status,
    humanCelAuthority: {
      authorityId: humanCelAuthority.authorityId,
      contentDigest: humanCelAuthority.contentDigest,
      coreMinimumVersion: humanCelAuthority.handoff.minimumPackageVersion,
      strict: true,
    },
    verifiedCapabilities: [
      "art.animation.pipeline",
      "art.animation.frame-ledger",
      "art.animation.delivery",
      "art.animation.character-family-preflight",
      "art.animation.execution-supervisor",
      "art.animation.human-cel-authority",
    ],
    authority: {
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      runtimeActivation: false,
      publication: false,
    },
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "error",
    check: "animation-control",
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
