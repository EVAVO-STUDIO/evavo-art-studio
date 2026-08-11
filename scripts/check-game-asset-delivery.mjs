#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  FALSE_AUTHORITY,
  APPROVAL_SCHEMA,
  CAMPAIGN_SCHEMA,
  REQUEST_SCHEMA,
  STYLE_SCHEMA,
  compileDelivery,
  prepareDeliveryRequest,
  validateDelivery,
} from "./game-asset-delivery/compiler.mjs";
import { encodeRgbaPng, hashObject, sha256 } from "./game-asset-delivery/common.mjs";

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function campaign() {
  const value = {
    schema: CAMPAIGN_SCHEMA,
    campaignId: "fixture-campaign",
    games: [],
    totals: { images: 2 },
    authority: { planningOnly: true, providerExecution: false, targetRepositoryMutation: false, publication: false },
  };
  value.planSha256 = hashObject(value);
  return value;
}

function styleProfile() {
  const value = {
    schema: STYLE_SCHEMA,
    minimumExemplars: 1,
    profiles: [
      {
        scopeId: "fixture-style",
        status: "approved",
        exemplarCount: 1,
        exemplars: [{ sourcePath: "fixture.png", sourceSha256: "1".repeat(64), decision: "keep" }],
        approvalEvidence: { creative: true, historical: true, provenance: true },
      },
    ],
    approvedProfiles: 1,
    provisionalProfiles: 0,
    sourceMutation: false,
    providerExecution: false,
    publication: false,
  };
  value.profileSha256 = hashObject(value);
  return value;
}

function approval({ gameHead, campaignSha256, styleSha256, items }) {
  const value = {
    schema: APPROVAL_SCHEMA,
    decision: "approved",
    humanDecision: true,
    agentSelfApproval: false,
    approver: { name: "Greg Parker", id: "greg-parker", role: "Creative Director" },
    rationale: "Approved as the exact coherent original EVAVO game-art delivery fixture.",
    gameHead,
    campaignPlanSha256: campaignSha256,
    styleProfileSha256: styleSha256,
    itemBindings: items,
    creative: true,
    historical: true,
    provenance: true,
    nativeComposition: false,
    publicationAuthority: false,
  };
  value.approvalSha256 = hashObject(value);
  value.runId = value.approvalSha256.slice(0, 20);
  return value;
}

function makeRgba(width, height, alpha = true) {
  const bytes = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    bytes[index * 4] = 230;
    bytes[index * 4 + 1] = 224;
    bytes[index * 4 + 2] = 194;
    bytes[index * 4 + 3] = alpha && index === 0 ? 0 : 255;
  }
  return bytes;
}

async function fixture(root, { approve = true, smooth = 0, missingFrame = false } = {}) {
  const sources = path.join(root, "sources");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(sources, { recursive: true }));
  const png1 = encodeRgbaPng(4, 4, makeRgba(4, 4, true));
  const png2 = encodeRgbaPng(4, 4, makeRgba(4, 4, true));
  const sprite1 = path.join(sources, "frame-000.png");
  const sprite2 = path.join(sources, "frame-001.png");
  await writeFile(sprite1, png1);
  await writeFile(sprite2, png2);
  const fntPath = path.join(sources, "ui.fnt");
  await writeFile(
    fntPath,
    [
      `info face="Fixture" size=8 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=${smooth} aa=1 padding=0,0,0,0 spacing=1,1`,
      'common lineHeight=8 base=7 scaleW=8 scaleH=8 pages=1 packed=0',
      'page id=0 file="ui.png"',
      'chars count=1',
      'char id=65 x=0 y=0 width=4 height=4 xoffset=0 yoffset=0 xadvance=5 page=0 chnl=15',
      '',
    ].join("\n"),
    "utf8",
  );
  const atlasPath = path.join(sources, "ui.png");
  const atlas = encodeRgbaPng(8, 8, makeRgba(8, 8, true));
  await writeFile(atlasPath, atlas);
  const campaignPath = await writeJson(path.join(root, "campaign.json"), campaign());
  const stylePath = await writeJson(path.join(root, "style.json"), styleProfile());
  const gameHead = "a".repeat(40);
  const baseItems = [
    {
      assetId: "hero-idle-000",
      kind: "animation-frame",
      role: "hero-animation",
      sourcePath: sprite1,
      targetPath: "assets/art/hero/frame-000.png",
      mediaType: "image/png",
      installationMode: "replace-or-create",
      expectedTargetSha256: null,
      expected: { sha256: sha256(png1), bytes: png1.length, width: 4, height: 4, hasAlpha: true },
      sequence: { clipId: "hero-idle", frameIndex: 0, frameCount: 2, fps: 8, loop: "linear" },
      tags: ["hero", "idle"],
    },
    ...(!missingFrame
      ? [
          {
            assetId: "hero-idle-001",
            kind: "animation-frame",
            role: "hero-animation",
            sourcePath: sprite2,
            targetPath: "assets/art/hero/frame-001.png",
            mediaType: "image/png",
            installationMode: "replace-or-create",
            expectedTargetSha256: null,
            expected: { sha256: sha256(png2), bytes: png2.length, width: 4, height: 4, hasAlpha: true },
            sequence: { clipId: "hero-idle", frameIndex: 1, frameCount: 2, fps: 8, loop: "linear" },
            tags: ["hero", "idle"],
          },
        ]
      : []),
    {
      assetId: "ui-font-descriptor",
      kind: "pixel-font-descriptor",
      role: "pixel-font",
      sourcePath: fntPath,
      targetPath: "assets/fonts/ui.fnt",
      mediaType: "text/plain",
      installationMode: "replace-or-create",
      expectedTargetSha256: null,
      expected: { sha256: sha256(await readFile(fntPath)), bytes: (await readFile(fntPath)).length },
      sequence: null,
      tags: ["font"],
    },
    {
      assetId: "ui-font-atlas",
      kind: "pixel-font-atlas",
      role: "pixel-font",
      sourcePath: atlasPath,
      targetPath: "assets/fonts/ui.png",
      mediaType: "image/png",
      installationMode: "replace-or-create",
      expectedTargetSha256: null,
      expected: { sha256: sha256(atlas), bytes: atlas.length, width: 8, height: 8, hasAlpha: true },
      sequence: null,
      tags: ["font"],
    },
  ];
  const draft = {
    schema: REQUEST_SCHEMA,
    projectId: "fixture-game",
    gameRepository: "EVAVO-STUDIO/FixtureGame",
    gameHead,
    campaignPlanPath: campaignPath,
    styleProfilePath: stylePath,
    approvalPath: null,
    allowedSourceRoots: [sources],
    requiredRoles: ["hero-animation", "pixel-font"],
    items: baseItems,
    authority: { ...FALSE_AUTHORITY },
  };
  const preparedWithoutApproval = prepareDeliveryRequest(draft);
  const bindings = preparedWithoutApproval.items.map((item) => ({
    assetId: item.assetId,
    targetPath: item.targetPath,
    sha256: item.expected.sha256,
    bytes: item.expected.bytes,
  }));
  let approvalPath = null;
  if (approve) {
    approvalPath = await writeJson(
      path.join(root, "approval.json"),
      approval({
        gameHead,
        campaignSha256: campaign().planSha256,
        styleSha256: styleProfile().profileSha256,
        items: bindings,
      }),
    );
  }
  const request = prepareDeliveryRequest({ ...draft, approvalPath });
  const requestPath = await writeJson(path.join(root, "request.json"), request);
  return { requestPath, sources, sprite1 };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test("approved delivery compiles and validates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-approved-"));
  try {
    const { requestPath } = await fixture(root);
    const bundlePath = path.join(root, "bundle.json");
    const bundle = await compileDelivery({ requestPath, outputPath: bundlePath });
    assert.equal(bundle.status, "approved");
    assert.equal(bundle.items.length, 4);
    assert.equal((await validateDelivery({ bundlePath })).status, "passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing approval remains review-required", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-review-"));
  try {
    const { requestPath } = await fixture(root, { approve: false });
    const bundle = await compileDelivery({ requestPath, outputPath: path.join(root, "bundle.json") });
    assert.equal(bundle.status, "review-required");
    assert.equal(bundle.creativeApproval, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changed source bytes fail closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-tamper-"));
  try {
    const { requestPath, sprite1 } = await fixture(root);
    await writeFile(sprite1, Buffer.from("changed"));
    await assert.rejects(() => compileDelivery({ requestPath, outputPath: path.join(root, "bundle.json") }), /identity changed/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("target path escape is rejected", async () => {
  assert.throws(
    () =>
      prepareDeliveryRequest({
        schema: REQUEST_SCHEMA,
        projectId: "fixture",
        gameRepository: "EVAVO-STUDIO/Fixture",
        gameHead: "a".repeat(40),
        campaignPlanPath: "/tmp/campaign.json",
        styleProfilePath: "/tmp/style.json",
        approvalPath: null,
        allowedSourceRoots: ["/tmp"],
        requiredRoles: ["body"],
        items: [
          {
            assetId: "bad",
            kind: "sprite",
            role: "body",
            sourcePath: "/tmp/a.png",
            targetPath: "../escape.png",
            mediaType: "image/png",
            expected: { sha256: "a".repeat(64), bytes: 1 },
          },
        ],
        authority: { ...FALSE_AUTHORITY },
      }),
    /canonical|escape/u,
  );
});

test("incomplete animation sequence is rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-sequence-"));
  try {
    const { requestPath } = await fixture(root, { missingFrame: true, approve: false });
    await assert.rejects(() => compileDelivery({ requestPath, outputPath: path.join(root, "bundle.json") }), /incomplete/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("smoothed BMFont is rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-font-"));
  try {
    const { requestPath } = await fixture(root, { smooth: 1, approve: false });
    await assert.rejects(() => compileDelivery({ requestPath, outputPath: path.join(root, "bundle.json") }), /smooth=0/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("create-only bundle output cannot be overwritten", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-create-only-"));
  try {
    const { requestPath } = await fixture(root, { approve: false });
    const bundlePath = path.join(root, "bundle.json");
    await compileDelivery({ requestPath, outputPath: bundlePath });
    await assert.rejects(() => compileDelivery({ requestPath, outputPath: bundlePath }), /already exists/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundle self-hash tampering is rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-hash-"));
  try {
    const { requestPath } = await fixture(root, { approve: false });
    const bundlePath = path.join(root, "bundle.json");
    await compileDelivery({ requestPath, outputPath: bundlePath });
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.summary.itemCount += 1;
    await writeJson(path.join(root, "tampered.json"), bundle);
    await assert.rejects(() => validateDelivery({ bundlePath: path.join(root, "tampered.json") }), /bundleSha256/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok ${passed + 1} - ${name}\n${error?.stack ?? error}\n`);
    process.exitCode = 1;
    break;
  }
}
if (passed === tests.length) {
  process.stdout.write(`1..${tests.length}\nArt Studio game-asset delivery checks passed (${passed}/${tests.length}).\n`);
}
