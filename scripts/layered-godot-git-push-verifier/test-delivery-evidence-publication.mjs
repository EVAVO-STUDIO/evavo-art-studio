import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDeliveryEvidenceBundle,
  publishDeliveryEvidenceBundle,
  validateDeliveryEvidenceBundle,
  validateDeliveryEvidencePublicationReceipt,
} from "../layered-godot-git-push-verifier.mjs";
import {
  REPOSITORY,
  assert,
  expectCode,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

const ENTRYPOINT = fileURLToPath(
  new URL("../layered-godot-git-push-verifier.mjs", import.meta.url),
);

async function evidenceRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "evavo-godot-evidence-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function deliveryFixture(t) {
  const { fx, receipt } = await pushedFixture(t);
  const verificationReceipt = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  const bundle = createDeliveryEvidenceBundle({
    commitReceipt: fx.receipt,
    pushReceipt: receipt,
    verificationReceipt,
    expectedRepository: REPOSITORY,
    workspaceRoot: fx.root,
  });
  return { fx, receipt, verificationReceipt, bundle };
}

function publicationInput(fx, bundle, outputPath) {
  return {
    bundle,
    expectedRepository: REPOSITORY,
    workspaceRoot: fx.root,
    outputPath,
  };
}

test("publishes exact UTF-8 delivery evidence with one create-only atomic handoff", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const root = await evidenceRoot(t);
  const outputPath = path.join(root, "layered-district.delivery-evidence.json");
  const receipt = await publishDeliveryEvidenceBundle(
    publicationInput(fx, bundle, outputPath),
  );

  assert.deepEqual(
    validateDeliveryEvidencePublicationReceipt(
      receipt,
      bundle,
      REPOSITORY,
      fx.root,
      outputPath,
    ),
    receipt,
  );
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(receipt.target.outputPath, path.resolve(outputPath));
  assert.equal(receipt.evidence.bundleSha256, bundle.bundleSha256);
  assert.equal(receipt.authority.deliveryEvidenceFileCreationPerformed, true);
  assert.equal(receipt.authority.existingDeliveryEvidenceReplacementPerformed, false);
  assert.equal(receipt.authority.gitPushPerformed, false);
  assert.equal(receipt.authority.artifactPublicationPerformed, false);

  const expected = `${JSON.stringify(bundle, null, 2)}\n`;
  assert.equal(await readFile(outputPath, "utf8"), expected);
  assert.equal((await lstat(outputPath, { bigint: true })).nlink, 1n);
  assert.deepEqual(
    (await readdir(root)).filter((entry) => entry.includes(".evavo-godot-stage-")),
    [],
  );
});

test("refuses to replace any existing output and preserves its exact bytes", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const root = await evidenceRoot(t);
  const outputPath = path.join(root, "delivery-evidence.json");
  const sentinel = Buffer.from("existing evidence must remain untouched\n", "utf8");
  await writeFile(outputPath, sentinel);

  await expectCode(
    publishDeliveryEvidenceBundle(publicationInput(fx, bundle, outputPath)),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
  );
  assert.deepEqual(await readFile(outputPath), sentinel);
  assert.deepEqual(
    (await readdir(root)).filter((entry) => entry.includes(".evavo-godot-stage-")),
    [],
  );
});

test("rejects symbolic output parents and symbolic output destinations", async (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic-directory creation is privilege-dependent on Windows");
    return;
  }

  const { fx, bundle } = await deliveryFixture(t);
  const root = await evidenceRoot(t);
  const realParent = path.join(root, "real");
  const symbolicParent = path.join(root, "symbolic");
  await mkdir(realParent);
  await symlink(realParent, symbolicParent, "dir");

  await expectCode(
    publishDeliveryEvidenceBundle(
      publicationInput(
        fx,
        bundle,
        path.join(symbolicParent, "delivery-evidence.json"),
      ),
    ),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_PATH_INVALID",
  );

  const sentinel = path.join(realParent, "sentinel.json");
  const symbolicOutput = path.join(realParent, "delivery-evidence.json");
  await writeFile(sentinel, "sentinel\n", "utf8");
  await symlink(sentinel, symbolicOutput, "file");
  await expectCode(
    publishDeliveryEvidenceBundle(
      publicationInput(fx, bundle, symbolicOutput),
    ),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
  );
  assert.equal(await readFile(sentinel, "utf8"), "sentinel\n");
});

test("rejects hostile publication inputs before filesystem work", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const root = await evidenceRoot(t);
  let invoked = 0;
  const hostile = {
    get bundle() {
      invoked += 1;
      return bundle;
    },
    expectedRepository: REPOSITORY,
    workspaceRoot: fx.root,
    outputPath: path.join(root, "delivery-evidence.json"),
  };

  await expectCode(
    publishDeliveryEvidenceBundle(hostile),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_INPUT_INVALID",
  );
  assert.equal(invoked, 0);
  assert.deepEqual(await readdir(root), []);

  await expectCode(
    publishDeliveryEvidenceBundle({
      ...publicationInput(
        fx,
        bundle,
        path.join(root, "delivery-evidence.txt"),
      ),
    }),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_INVALID",
  );
});

test("bundle CLI writes through the governed output boundary and never truncates it", async (t) => {
  const { fx, receipt, verificationReceipt } = await deliveryFixture(t);
  const root = await evidenceRoot(t);
  const commitPath = path.join(root, "commit.json");
  const pushPath = path.join(root, "push.json");
  const verificationPath = path.join(root, "verification.json");
  const outputPath = path.join(root, "delivery-evidence.json");
  await writeFile(commitPath, `${JSON.stringify(fx.receipt)}\n`, "utf8");
  await writeFile(pushPath, `${JSON.stringify(receipt)}\n`, "utf8");
  await writeFile(
    verificationPath,
    `${JSON.stringify(verificationReceipt)}\n`,
    "utf8",
  );

  const args = [
    ENTRYPOINT,
    "bundle",
    "--commit-receipt",
    commitPath,
    "--push-receipt",
    pushPath,
    "--verification-receipt",
    verificationPath,
    "--workspace",
    fx.root,
    "--repository",
    REPOSITORY,
    "--output",
    outputPath,
  ];
  const first = spawnSync(process.execPath, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 120_000,
  });
  assert.equal(first.status, 0, first.stderr);
  const publicationReceipt = JSON.parse(first.stdout);
  const bundle = JSON.parse(await readFile(outputPath, "utf8"));
  validateDeliveryEvidenceBundle(bundle, REPOSITORY, fx.root);
  validateDeliveryEvidencePublicationReceipt(
    publicationReceipt,
    bundle,
    REPOSITORY,
    fx.root,
    outputPath,
  );

  const exactOutput = await readFile(outputPath);
  const second = spawnSync(process.execPath, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 120_000,
  });
  assert.equal(second.status, 1);
  assert.equal(
    JSON.parse(second.stderr).code,
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
  );
  assert.deepEqual(await readFile(outputPath), exactOutput);
});
