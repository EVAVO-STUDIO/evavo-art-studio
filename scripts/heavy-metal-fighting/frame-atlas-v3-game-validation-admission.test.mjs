import assert from "node:assert/strict";
import test from "node:test";

import {
  admitHmfAtlasV3GameValidationReceipt,
  HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_SCHEMA,
  REQUIRED_GAME_VALIDATION_SUITES,
  verifyHmfAtlasV3GameValidationAdmission,
} from "./frame-atlas-v3-game-validation-admission.mjs";
import { hashBytes } from "./frame-body-named-human-approval-common.mjs";

const HEAD = "723b6b6954e67c08ed337fad62c5ef2e10536234";

function timestamp(second) {
  return `2026-08-14T10:00:${String(second).padStart(2, "0")}.0000000Z`;
}

function receipt() {
  return {
    schema: "steel-dominion.hmf-atlas-v3-local-validation.v1",
    status: "passed",
    repository: "EVAVO-STUDIO/steel-dominion",
    public_title: "HEAVY METAL FIGHTING",
    branch: "codex/hmf-atlas-v3-runtime-cutover-20260812",
    head: HEAD,
    godot_exe: "C:\\Godot_v4.6.2-stable_win64\\Godot_v4.6.2-stable_win64.exe",
    godot_version: "4.6.2.stable.official.abcdef",
    started_at_utc: timestamp(0),
    completed_at_utc: timestamp(12),
    duration_seconds: 12,
    suite_count: 6,
    completed_suite_count: 6,
    suites: REQUIRED_GAME_VALIDATION_SUITES.map((suite, index) => ({
      id: suite.id,
      runner: suite.runner,
      status: "passed",
      started_at_utc: timestamp(index * 2),
      completed_at_utc: timestamp(index * 2 + 1),
      duration_seconds: 1,
      error: null,
    })),
    source_tree_clean_before: true,
    source_tree_clean_after: true,
    github_actions_required: false,
    image_generation: false,
    error: null,
  };
}

function bytes(value = receipt(), bom = true) {
  const encoded = Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`, "utf8");
  return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]) : encoded;
}

function admit(value = receipt(), expectedGameHead = HEAD, bom = true) {
  return admitHmfAtlasV3GameValidationReceipt({
    receiptBytes: bytes(value, bom),
    expectedGameHead,
  });
}

test("exact six-suite Godot 4.6.2 receipt becomes deterministic self-hashed read-only admission", () => {
  const source = bytes();
  const admission = admitHmfAtlasV3GameValidationReceipt({ receiptBytes: source, expectedGameHead: HEAD });
  assert.equal(admission.schema, HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_SCHEMA);
  assert.equal(admission.validatedGameHead, HEAD);
  assert.equal(admission.suites.length, 6);
  assert.equal(admission.sourceReceipt.byteSha256, hashBytes(source));
  assert.equal(admission.authority.sourceReceiptRead, true);
  assert.equal(admission.authority.validationEvidenceAdmission, true);
  assert.equal(admission.authority.gameRepositoryRead, false);
  assert.equal(admission.authority.gameRepositoryMutation, false);
  assert.equal(admission.authority.runtimeActivation, false);
  assert.equal(admission.authority.gitMutation, false);
  assert.equal(admission.authority.deployment, false);
  assert.equal(admission.authority.publication, false);
  assert.equal(admission.authority.forcePush, false);
  assert.deepEqual(verifyHmfAtlasV3GameValidationAdmission(admission, HEAD), admission);
  assert.deepEqual(admitHmfAtlasV3GameValidationReceipt({ receiptBytes: source, expectedGameHead: HEAD }), admission);
});

test("receipt head must exactly match the externally expected steel-dominion commit", () => {
  assert.throws(
    () => admit(receipt(), "319989713c671670b1ae997ffb4e8386bdeb7c7e"),
    /head does not match expectedGameHead/,
  );
});

test("receipt and suite objects use closed exact field contracts", () => {
  const topLevel = receipt();
  topLevel.releaseAuthorized = true;
  assert.throws(() => admit(topLevel), /fields must be exactly/);

  const suite = receipt();
  suite.suites[0].publication = true;
  assert.throws(() => admit(suite), /fields must be exactly/);
});

test("suite identity, order, success and clean-tree evidence cannot drift", () => {
  const reordered = receipt();
  [reordered.suites[0], reordered.suites[1]] = [reordered.suites[1], reordered.suites[0]];
  assert.throws(() => admit(reordered), /suite 0 identity drifted/);

  const failed = receipt();
  failed.suites[3].status = "failed";
  failed.suites[3].error = "boom";
  assert.throws(() => admit(failed), /did not pass cleanly/);

  const dirty = receipt();
  dirty.source_tree_clean_after = false;
  assert.throws(() => admit(dirty), /clean source tree after execution/);
});

test("receipt must prove exact Godot 4.6.2 and remain Actions-independent", () => {
  const wrongGodot = receipt();
  wrongGodot.godot_version = "4.6.3.stable.official.abcdef";
  assert.throws(() => admit(wrongGodot), /must prove Godot 4\.6\.2/);

  const actionsRequired = receipt();
  actionsRequired.github_actions_required = true;
  assert.throws(() => admit(actionsRequired), /independent of GitHub Actions/);

  const generated = receipt();
  generated.image_generation = true;
  assert.throws(() => admit(generated), /may not claim image generation/);
});

test("validation and suite timestamp windows are chronological and duration-bound", () => {
  const invalidWindow = receipt();
  invalidWindow.completed_at_utc = "2026-08-14T09:59:59.0000000Z";
  assert.throws(() => admit(invalidWindow), /completed before it started/);

  const invalidDuration = receipt();
  invalidDuration.suites[0].duration_seconds = 7;
  assert.throws(() => admit(invalidDuration), /does not match its timestamp window/);

  const escaped = receipt();
  escaped.suites[5].completed_at_utc = timestamp(13);
  escaped.suites[5].duration_seconds = 3;
  assert.throws(() => admit(escaped), /escaped the overall validation window/);
});

test("admission input rejects accessors without invocation and rejects proxies", () => {
  let invoked = false;
  const accessor = { expectedGameHead: HEAD };
  Object.defineProperty(accessor, "receiptBytes", {
    enumerable: true,
    get() {
      invoked = true;
      return bytes();
    },
  });
  assert.throws(() => admitHmfAtlasV3GameValidationReceipt(accessor), /may not be an accessor/);
  assert.equal(invoked, false);

  const proxy = new Proxy({ receiptBytes: bytes(), expectedGameHead: HEAD }, {});
  assert.throws(() => admitHmfAtlasV3GameValidationReceipt(proxy), /may not be a Proxy/);
});

test("receipt bytes are privately owned and bounded", () => {
  const source = bytes();
  const expectedDigest = hashBytes(source);
  const admission = admitHmfAtlasV3GameValidationReceipt({ receiptBytes: source, expectedGameHead: HEAD });
  source.fill(0);
  assert.equal(admission.sourceReceipt.byteSha256, expectedDigest);

  const oversized = Buffer.alloc(1024 * 1024 + 1, 0x20);
  assert.throws(
    () => admitHmfAtlasV3GameValidationReceipt({ receiptBytes: oversized, expectedGameHead: HEAD }),
    /exceeds the admitted byte bounds/,
  );
});

test("self-hashed admission rejects retained-hash authority or head mutation", () => {
  const admission = admit();
  const authorityDrift = structuredClone(admission);
  authorityDrift.authority.gameRepositoryMutation = true;
  assert.throws(
    () => verifyHmfAtlasV3GameValidationAdmission(authorityDrift, HEAD),
    /admissionSha256 does not match canonical content/,
  );

  const headDrift = structuredClone(admission);
  headDrift.validatedGameHead = "319989713c671670b1ae997ffb4e8386bdeb7c7e";
  assert.throws(
    () => verifyHmfAtlasV3GameValidationAdmission(headDrift, HEAD),
    /admissionSha256 does not match canonical content/,
  );
});
