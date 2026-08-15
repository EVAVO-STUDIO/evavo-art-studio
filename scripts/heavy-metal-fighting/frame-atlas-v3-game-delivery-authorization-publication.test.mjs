import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
} from "./frame-atlas-v3-game-delivery-authorization.mjs";
import {
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_SCHEMA,
  publishHmfAtlasV3GameDeliveryAuthorizationFile,
} from "./frame-atlas-v3-game-delivery-authorization-publication.mjs";
import { hashValue } from "./frame-body-named-human-approval-common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(HERE, "..", "heavy-metal-fighting-frame-atlas-v3.mjs");
const HEAD = "319989713c671670b1ae997ffb4e8386bdeb7c7e";
const FRAMES = ["bastion", "viper", "citadel", "mirage"];

function withTemp(prefix, callback) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  return Promise.resolve(callback(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}
function authorization() {
  const body = {
    schema: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
    protocolVersion: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    gameRepository: "EVAVO-STUDIO/steel-dominion",
    gameHead: HEAD,
    gameValidationAdmissionSha256: hashValue("game-validation-admission"),
    atlasBuilds: FRAMES.map((frameId) => ({
      frameId,
      planSha256: hashValue(`plan-${frameId}`),
      buildReceiptSha256: hashValue(`receipt-${frameId}`),
      buildVerificationSha256: hashValue(`verification-${frameId}`),
      imageSha256: hashValue(`image-${frameId}`),
      targetImagePath: `res://assets/fighters/final-v3/${frameId}.png`,
      styleProofExecutionSha256: hashValue(`style-proof-${frameId}`),
    })),
    humanAuthorization: {
      actorClass: "human",
      actorId: "greg-parker",
      occurredAt: "2026-08-15T04:00:00.000Z",
      decision: "authorized",
      rationale: "Authorize exact reviewed atlas delivery evidence only.",
      evidenceSha256: hashValue("publication-test-human-evidence"),
    },
    checks: {
      exactGameValidationAdmission: true,
      exactValidatedGameHead: true,
      allFourFrameBuildsPresent: true,
      allFourExactPixelVerificationsPassed: true,
      allBuildReceiptSelfHashesValid: true,
      allBuildEvidenceCrossBound: true,
      canonicalGameTargetPaths: true,
      namedHumanDeliveryAuthorization: true,
      authorizationAfterReviewedEvidence: true,
      runtimeActivationRemainsSeparate: true,
    },
    authority: {
      evidenceAdmission: true,
      callerSuppliedAtlasByteRead: true,
      callerSuppliedSourceByteRead: true,
      imageInspection: true,
      namedHumanDeliveryAuthorization: true,
      gameRepositoryRead: false,
      gameRepositoryMutation: false,
      runtimeActivation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      forcePush: false,
    },
  };
  return { ...body, authorizationSha256: hashValue(body) };
}
function rehashAuthorization(value) {
  const body = structuredClone(value);
  delete body.authorizationSha256;
  return { ...body, authorizationSha256: hashValue(body) };
}

test("create-only publication writes exact self-hashed authorization bytes and returns readback receipt", async () => {
  await withTemp("hmf-auth-publication-", async (root) => {
    const output = path.join(root, "hmf-atlas-v3-delivery.authorization.json");
    const source = authorization();
    const receipt = await publishHmfAtlasV3GameDeliveryAuthorizationFile({
      authorization: source,
      outputPath: output,
    });
    const expected = `${JSON.stringify(source, null, 2)}\n`;
    assert.equal(readFileSync(output, "utf8"), expected);
    assert.equal(receipt.schema, HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PUBLICATION_SCHEMA);
    assert.equal(receipt.gameHead, HEAD);
    assert.equal(receipt.authorizationSha256, source.authorizationSha256);
    assert.equal(receipt.output.path, path.resolve(output));
    assert.equal(receipt.output.bytes, Buffer.byteLength(expected));
    assert.match(receipt.output.sha256, /^[0-9a-f]{64}$/u);
    assert.match(receipt.publicationReceiptSha256, /^[0-9a-f]{64}$/u);
    assert.equal(receipt.checks.closedAuthorizationContract, true);
    assert.equal(receipt.authority.localAuthorizationEvidenceWrite, true);
    assert.equal(receipt.authority.gameRepositoryMutation, false);
    assert.equal(receipt.authority.runtimeActivation, false);
    assert.equal(receipt.authority.gitMutation, false);
    assert.equal(receipt.authority.externalPublication, false);
    assert.deepEqual(readdirSync(root), ["hmf-atlas-v3-delivery.authorization.json"]);
  });
});

test("existing authorization output is preserved and never replaced", async () => {
  await withTemp("hmf-auth-publication-existing-", async (root) => {
    const output = path.join(root, "existing.authorization.json");
    writeFileSync(output, "keep-me\n");
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile({
        authorization: authorization(),
        outputPath: output,
      }),
      /already exists and will not be replaced/,
    );
    assert.equal(readFileSync(output, "utf8"), "keep-me\n");
    assert.deepEqual(readdirSync(root), ["existing.authorization.json"]);
  });
});

test("publication rejects a symbolic output parent", { skip: process.platform === "win32" }, async () => {
  await withTemp("hmf-auth-publication-symlink-", async (root) => {
    const real = path.join(root, "real");
    const linked = path.join(root, "linked");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(real);
    symlinkSync(real, linked, "dir");
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile({
        authorization: authorization(),
        outputPath: path.join(linked, "delivery.authorization.json"),
      }),
      /symbolic link or junction/,
    );
    assert.deepEqual(readdirSync(real), []);
  });
});

test("publication rejects authorization content whose retained self-hash was not recomputed", async () => {
  await withTemp("hmf-auth-publication-hash-", async (root) => {
    const source = authorization();
    source.gameHead = "723b6b6954e67c08ed337fad62c5ef2e10536234";
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile({
        authorization: source,
        outputPath: path.join(root, "delivery.authorization.json"),
      }),
      /authorizationSha256 does not match canonical content/,
    );
    assert.deepEqual(readdirSync(root), []);
  });
});

test("publication rejects correctly rehashed extra claims and authority escalation", async () => {
  await withTemp("hmf-auth-publication-closed-", async (root) => {
    const extraClaim = authorization();
    extraClaim.targetRepositoryWriteAuthorized = true;
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile({
        authorization: rehashAuthorization(extraClaim),
        outputPath: path.join(root, "extra.authorization.json"),
      }),
      /fields must be exactly/,
    );

    const escalation = authorization();
    escalation.authority.gameRepositoryMutation = true;
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile({
        authorization: rehashAuthorization(escalation),
        outputPath: path.join(root, "escalated.authorization.json"),
      }),
      /gained forbidden authority: gameRepositoryMutation/,
    );
    assert.deepEqual(readdirSync(root), []);
  });
});

test("publication input rejects accessors without invocation and rejects Proxy objects", async () => {
  await withTemp("hmf-auth-publication-hostile-", async (root) => {
    let invoked = false;
    const accessor = {
      authorization: authorization(),
    };
    Object.defineProperty(accessor, "outputPath", {
      enumerable: true,
      get() {
        invoked = true;
        return path.join(root, "accessor.authorization.json");
      },
    });
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile(accessor),
      /outputPath may not be an accessor/,
    );
    assert.equal(invoked, false);

    const proxy = new Proxy(
      {
        authorization: authorization(),
        outputPath: path.join(root, "proxy.authorization.json"),
      },
      {},
    );
    await assert.rejects(
      publishHmfAtlasV3GameDeliveryAuthorizationFile(proxy),
      /publication input may not be a Proxy/,
    );
    assert.deepEqual(readdirSync(root), []);
  });
});

test("origin-bound publication wrapper recompiles and re-verifies the exact authorization before writing", () => {
  const source = readFileSync(
    path.join(HERE, "frame-atlas-v3-game-delivery-authorization-publication.mjs"),
    "utf8",
  );
  assert.match(source, /loadHmfAtlasV3GameDeliveryAuthorizationCliInput\(requestPath\)/u);
  assert.match(source, /compileHmfAtlasV3GameDeliveryAuthorization\(input\)/u);
  assert.match(source, /verifyHmfAtlasV3GameDeliveryAuthorization\(\{ \.\.\.input, authorization \}\)/u);
  assert.match(source, /publishHmfAtlasV3GameDeliveryAuthorizationFile\(\{\s*authorization: verified,\s*outputPath,/u);
});

test("stable CLI enters the create-only publication path only when explicit --output is supplied", () => {
  const source = readFileSync(CLI_PATH, "utf8");
  assert.match(
    source,
    /authorize-game-delivery --request <delivery-authorization-request\.json> --output <new-authorization\.json>/u,
  );
  assert.match(source, /const outputPath = option\(argv\.slice\(1\), "--output"\)/u);
  assert.match(
    source,
    /if \(outputPath\) \{\s*return compileVerifyAndPublishHmfAtlasV3GameDeliveryAuthorizationFromRequestFile/u,
  );
  assert.match(
    source,
    /return compileHmfAtlasV3GameDeliveryAuthorizationFromRequestFile\(requestPath\);/u,
  );
});
