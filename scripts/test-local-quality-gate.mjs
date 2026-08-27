import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normaliseRepositoryPath,
  parsePrePushUpdates,
  planForChanges,
} from "./local-quality-gate.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-local-gate-"));
  fs.mkdirSync(path.join(root, "packages", "quality"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages", "quality", "package.json"), JSON.stringify({
    name: "@evavo/art-quality",
    scripts: { build: "tsc", typecheck: "tsc --noEmit", test: "node --test" },
  }));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "test-sprite-animation-preview.py"), "print('ok')\n");
  fs.writeFileSync(path.join(root, "scripts", "check-widget.mjs"), "export {};\n");
  fs.writeFileSync(path.join(root, "scripts", "test-widget.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
  return root;
}

test("package changes select exact workspace scripts without a cloud gate", () => {
  const root = fixture();
  try {
    const plan = planForChanges(["packages/quality/src/example.ts"], { root });
    const commands = plan.commands.map((entry) => [entry.executable, ...entry.args].join(" "));
    assert.equal(plan.mode, "changed");
    assert.ok(commands.includes("pnpm --filter @evavo/art-quality run build"));
    assert.ok(commands.includes("pnpm --filter @evavo/art-quality run typecheck"));
    assert.ok(commands.includes("pnpm --filter @evavo/art-quality run test"));
    assert.ok(commands.every((entry) => !/vercel|workflow_dispatch|actions\//u.test(entry)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cross-cutting dependency changes escalate to the complete local check", () => {
  const plan = planForChanges(["pnpm-lock.yaml"]);
  assert.equal(plan.mode, "full");
  assert.deepEqual(plan.commands.at(-1).args, ["check"]);
});

test("repository text and ignore policy changes also escalate to the complete local check", () => {
  for (const file of [".gitattributes", ".gitignore"]) {
    assert.equal(planForChanges([file]).mode, "full");
  }
});

test("Python tools compile and run their matching local regression", () => {
  const root = fixture();
  try {
    const plan = planForChanges(["tools/sprite_animation_preview.py"], { root });
    const commands = plan.commands.map((entry) => [entry.executable, ...entry.args]);
    assert.ok(commands.some((entry) => entry[0] === "python" && entry.includes("py_compile")));
    assert.ok(commands.some((entry) => entry.join(" ") === "python scripts/test-sprite-animation-preview.py -v"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push input is strict and keeps branch identity explicit", () => {
  const updates = parsePrePushUpdates("refs/heads/topic aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].remoteRef, "refs/heads/main");
  assert.equal(parsePrePushUpdates(`HEAD ${"c".repeat(40)} refs/heads/topic ${"0".repeat(40)}\n`)[0].localRef, "HEAD");
  assert.throws(() => parsePrePushUpdates("not enough fields\n"), /four fields/u);
  assert.throws(() => parsePrePushUpdates("a bad b bad\n"), /invalid ref/u);
  assert.throws(() => parsePrePushUpdates("refs/heads/topic bad refs/heads/main bad\n"), /invalid SHA/u);
});

test("repository paths are normalised without accepting traversal", () => {
  assert.equal(normaliseRepositoryPath(".\\packages\\quality\\src\\x.ts"), "packages/quality/src/x.ts");
  assert.throws(() => normaliseRepositoryPath("../outside"), /unsafe repository path/u);
  assert.throws(() => normaliseRepositoryPath("/absolute"), /unsafe repository path/u);
  assert.throws(() => normaliseRepositoryPath("C:/absolute"), /unsafe repository path/u);
  assert.throws(() => normaliseRepositoryPath("packages//quality"), /unsafe repository path/u);
});

test("changed root scripts run their matching regression when one exists", () => {
  const root = fixture();
  try {
    const plan = planForChanges(["scripts/check-widget.mjs"], { root });
    const commands = plan.commands.map((entry) => [entry.executable, ...entry.args].join(" "));
    assert.ok(commands.includes(`${process.execPath} --check scripts/check-widget.mjs`));
    assert.ok(commands.includes(`${process.execPath} --test scripts/test-widget.mjs`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
