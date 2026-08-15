import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(
  HERE,
  "..",
  "heavy-metal-fighting-frame-atlas-v3-verify-delivery-authorization.mjs",
);

function withTemp(prefix, callback) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(requestPath, authorizationPath) {
  return spawnSync(
    process.execPath,
    [CLI_PATH, "--request", requestPath, "--authorization", authorizationPath],
    { encoding: "utf8" },
  );
}

test("delivery authorization verifier CLI requires exact request and authorization arguments", () => {
  const result = spawnSync(process.execPath, [CLI_PATH], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /requires exactly --request/);
});

test("delivery authorization verifier admits authorization file before request replay", () => {
  withTemp("hmf-delivery-verify-cli-route-", (root) => {
    const authorizationPath = path.join(root, "authorization.json");
    const requestPath = path.join(root, "request.json");
    writeFileSync(authorizationPath, "{}\n");
    writeFileSync(requestPath, "{}\n");
    const result = run(requestPath, authorizationPath);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /delivery authorization CLI request fields must be exactly/);
  });
});

test("delivery authorization verifier rejects symbolic authorization evidence before request loading", { skip: process.platform === "win32" }, () => {
  withTemp("hmf-delivery-verify-cli-symlink-", (root) => {
    const target = path.join(root, "authorization-target.json");
    const symbolic = path.join(root, "authorization.json");
    writeFileSync(target, "{}\n");
    symlinkSync(target, symbolic);
    const result = run(path.join(root, "missing-request.json"), symbolic);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /symbolic link or junction/);
    assert.doesNotMatch(result.stderr, /ENOENT.*missing-request/);
  });
});

test("delivery authorization verifier rejects multiply-linked authorization evidence before request loading", { skip: process.platform === "win32" }, () => {
  withTemp("hmf-delivery-verify-cli-hardlink-", (root) => {
    const target = path.join(root, "authorization-target.json");
    const linked = path.join(root, "authorization.json");
    writeFileSync(target, "{}\n");
    linkSync(target, linked);
    const result = run(path.join(root, "missing-request.json"), linked);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /exactly one filesystem link/);
    assert.doesNotMatch(result.stderr, /ENOENT.*missing-request/);
  });
});
