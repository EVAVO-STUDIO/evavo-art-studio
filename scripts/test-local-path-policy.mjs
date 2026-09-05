import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAllowedLocalPath,
  canonicalizeProspectivePath,
  configuredLocalRootCount,
} from "../tools/lib/local_path_policy.mjs";

const ENV_NAME = "EVAVO_TEST_LOCAL_PATH_ROOTS";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-path-policy-"));
  const allowed = path.join(root, "allowed");
  const outside = path.join(root, "outside");
  await mkdir(allowed, { recursive: true });
  await mkdir(outside, { recursive: true });
  const previous = process.env[ENV_NAME];
  process.env[ENV_NAME] = allowed;
  t.after(async () => {
    if (previous === undefined) delete process.env[ENV_NAME];
    else process.env[ENV_NAME] = previous;
    await rm(root, { recursive: true, force: true });
  });
  return { root, allowed, outside };
}

test("allows real inputs and prospective nested outputs inside a configured root", async (t) => {
  const { allowed } = await fixture(t);
  const input = path.join(allowed, "source.png");
  await writeFile(input, "image");

  assert.equal(await assertAllowedLocalPath(input, { envName: ENV_NAME }), path.resolve(input));
  const output = path.join(allowed, "future", "nested", "result.webp");
  assert.equal(
    await assertAllowedLocalPath(output, { envName: ENV_NAME, output: true }),
    path.resolve(output),
  );
  assert.equal(configuredLocalRootCount(ENV_NAME), 1);

  const canonicalFuture = await canonicalizeProspectivePath(path.dirname(output));
  assert.ok(canonicalFuture.endsWith(path.join("future", "nested")));
});

test("rejects real inputs and prospective outputs outside configured roots", async (t) => {
  const { outside } = await fixture(t);
  const input = path.join(outside, "secret.png");
  await writeFile(input, "secret");

  await assert.rejects(
    () => assertAllowedLocalPath(input, { envName: ENV_NAME, label: "test image" }),
    /outside configured test image roots/i,
  );
  await assert.rejects(
    () =>
      assertAllowedLocalPath(path.join(outside, "future", "result.webp"), {
        envName: ENV_NAME,
        output: true,
        label: "test image",
      }),
    /outside configured test image roots/i,
  );
});

test("rejects input and output paths that escape through an existing symlink ancestor", async (t) => {
  const { allowed, outside } = await fixture(t);
  const outsideInput = path.join(outside, "secret.png");
  await writeFile(outsideInput, "secret");
  const escape = path.join(allowed, "escape");
  await symlink(outside, escape, process.platform === "win32" ? "junction" : "dir");

  await assert.rejects(
    () => assertAllowedLocalPath(path.join(escape, "secret.png"), { envName: ENV_NAME }),
    /outside configured local file roots/i,
  );
  await assert.rejects(
    () =>
      assertAllowedLocalPath(path.join(escape, "future", "result.webp"), {
        envName: ENV_NAME,
        output: true,
      }),
    /outside configured local file roots/i,
  );
});

test("fails closed when no allowed roots are configured", async () => {
  const previous = process.env[ENV_NAME];
  delete process.env[ENV_NAME];
  try {
    await assert.rejects(
      () => assertAllowedLocalPath("anywhere.png", { envName: ENV_NAME }),
      new RegExp(`${ENV_NAME} is not configured`, "i"),
    );
  } finally {
    if (previous !== undefined) process.env[ENV_NAME] = previous;
  }
});
