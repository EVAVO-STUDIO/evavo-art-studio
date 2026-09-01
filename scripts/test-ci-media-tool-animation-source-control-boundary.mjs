import assert from "node:assert/strict";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readAnimationSourceControlDocument,
} from "./lib/animation-source-control-document.mjs";
import {
  writeAnimationSourceJson,
} from "./lib/animation-source-output.mjs";

async function fixture(prefix) {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

test("control documents are bounded, digest-bound and BOM aware", async () => {
  const root = await fixture("evavo-control-document-");
  try {
    const plain = path.join(root, "plain.json");
    await writeFile(plain, '{"ok":true}\n', "utf8");
    const observed = await readAnimationSourceControlDocument(plain);
    assert.deepEqual(observed.value, { ok: true });
    assert.equal(observed.evidence.stableDoubleRead, true);
    assert.equal(observed.evidence.ordinaryFile, true);
    assert.equal(observed.evidence.singleLink, true);
    assert.match(observed.evidence.sha256, /^sha256:[0-9a-f]{64}$/u);

    const bom = path.join(root, "bom.json");
    await writeFile(
      bom,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('{"bom":true}\n', "utf8"),
      ]),
    );
    const bomObserved =
      await readAnimationSourceControlDocument(bom);
    assert.deepEqual(bomObserved.value, { bom: true });
    assert.equal(bomObserved.evidence.utf8Bom, true);

    await assert.rejects(
      readAnimationSourceControlDocument(plain, {
        maximumBytes: 4,
      }),
      /ANIMATION_SOURCE_CONTROL_DOCUMENT_TOO_LARGE/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("control documents reject invalid encoding, NUL bytes and non-files", async () => {
  const root = await fixture("evavo-control-invalid-");
  try {
    const utf8 = path.join(root, "invalid-utf8.json");
    await writeFile(utf8, Buffer.from([0x7b, 0xff, 0x7d]));
    await assert.rejects(
      readAnimationSourceControlDocument(utf8),
      /ANIMATION_SOURCE_CONTROL_DOCUMENT_UTF8_INVALID/u,
    );

    const nul = path.join(root, "nul.json");
    await writeFile(nul, Buffer.from('{"x":"\u0000"}', "utf8"));
    await assert.rejects(
      readAnimationSourceControlDocument(nul),
      /ANIMATION_SOURCE_CONTROL_DOCUMENT_NUL_FORBIDDEN/u,
    );

    const directory = path.join(root, "directory.json");
    await mkdir(directory);
    await assert.rejects(
      readAnimationSourceControlDocument(directory),
      /ANIMATION_SOURCE_CONTROL_DOCUMENT_FILE_REQUIRED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("control documents reject symlink and hard-link aliases", async (t) => {
  const root = await fixture("evavo-control-links-");
  try {
    const original = path.join(root, "original.json");
    await writeFile(original, '{"ok":true}\n', "utf8");

    const alias = path.join(root, "hardlink.json");
    try {
      await link(original, alias);
      await assert.rejects(
        readAnimationSourceControlDocument(original),
        /ANIMATION_SOURCE_CONTROL_DOCUMENT_HARDLINK_FORBIDDEN/u,
      );
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EACCES") {
        throw error;
      }
      t.diagnostic("hard links unavailable in this environment");
    }

    if (process.platform !== "win32") {
      const target = path.join(root, "target.json");
      const symbolic = path.join(root, "symbolic.json");
      await writeFile(target, '{"ok":true}\n', "utf8");
      await symlink(target, symbolic);
      await assert.rejects(
        readAnimationSourceControlDocument(symbolic),
        /ANIMATION_SOURCE_CONTROL_DOCUMENT_SYMLINK_FORBIDDEN/u,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated JSON is create-only by default and preserves existing bytes", async () => {
  const root = await fixture("evavo-output-create-only-");
  try {
    const destination = path.join(root, "bundle.json");
    await writeFile(destination, "do-not-touch\n", "utf8");
    await assert.rejects(
      writeAnimationSourceJson(destination, { replaced: false }),
      /ANIMATION_SOURCE_OUTPUT_EXISTS/u,
    );
    assert.equal(
      await readFile(destination, "utf8"),
      "do-not-touch\n",
    );

    const created = path.join(root, "created.json");
    const evidence = await writeAnimationSourceJson(
      created,
      { created: true },
    );
    assert.equal(evidence.createOnly, true);
    assert.equal(evidence.replaced, false);
    assert.deepEqual(
      JSON.parse(await readFile(created, "utf8")),
      { created: true },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit replacement is atomic and protected inputs can never be outputs", async () => {
  const root = await fixture("evavo-output-replace-");
  try {
    const destination = path.join(root, "receipt.json");
    await writeFile(destination, '{"old":true}\n', "utf8");
    const evidence = await writeAnimationSourceJson(
      destination,
      { fresh: true },
      { replace: true },
    );
    assert.equal(evidence.replaced, true);
    assert.deepEqual(
      JSON.parse(await readFile(destination, "utf8")),
      { fresh: true },
    );

    const protectedInput = path.join(root, "request.json");
    await writeFile(protectedInput, '{"request":true}\n', "utf8");
    await assert.rejects(
      writeAnimationSourceJson(
        protectedInput,
        { unsafe: true },
        { replace: true, protectedPaths: [protectedInput] },
      ),
      /ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION/u,
    );
    assert.equal(
      await readFile(protectedInput, "utf8"),
      '{"request":true}\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent create-only writers never overwrite one another", async () => {
  const root = await fixture("evavo-output-concurrent-");
  try {
    const destination = path.join(root, "shared.json");
    const settled = await Promise.allSettled([
      writeAnimationSourceJson(destination, { writer: 1 }),
      writeAnimationSourceJson(destination, { writer: 2 }),
    ]);
    assert.equal(
      settled.filter((entry) => entry.status === "fulfilled").length,
      1,
    );
    assert.equal(
      settled.filter((entry) => entry.status === "rejected").length,
      1,
    );
    const document = JSON.parse(await readFile(destination, "utf8"));
    assert.ok(document.writer === 1 || document.writer === 2);
    const residue = (await readdir(root)).filter(
      (name) => name.includes(".tmp-") || name.endsWith(".lock"),
    );
    assert.deepEqual(residue, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("output destinations reject hard links, linked parents and oversized JSON", async (t) => {
  const root = await fixture("evavo-output-links-");
  try {
    const original = path.join(root, "original.json");
    const alias = path.join(root, "alias.json");
    await writeFile(original, '{"old":true}\n', "utf8");
    try {
      await link(original, alias);
      await assert.rejects(
        writeAnimationSourceJson(alias, { next: true }, {
          replace: true,
        }),
        /ANIMATION_SOURCE_OUTPUT_HARDLINK_FORBIDDEN/u,
      );
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EACCES") {
        throw error;
      }
      t.diagnostic("hard links unavailable in this environment");
    }

    if (process.platform !== "win32") {
      const realParent = path.join(root, "real-parent");
      const linkedParent = path.join(root, "linked-parent");
      await mkdir(realParent);
      await symlink(realParent, linkedParent);
      await assert.rejects(
        writeAnimationSourceJson(
          path.join(linkedParent, "output.json"),
          { unsafe: true },
        ),
        /ANIMATION_SOURCE_OUTPUT_PARENT_INVALID/u,
      );
    }

    await assert.rejects(
      writeAnimationSourceJson(
        path.join(root, "large.json"),
        { payload: "x".repeat(128) },
        { maximumBytes: 32 },
      ),
      /ANIMATION_SOURCE_OUTPUT_TOO_LARGE/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated JSON rejects symbolic destinations, active locks and invalid serialization", async (t) => {
  const root = await fixture("evavo-output-invalid-");
  try {
    const destination = path.join(root, "output.json");
    const lockPath = `${destination}.lock`;
    await writeFile(lockPath, "occupied\n", "utf8");
    await assert.rejects(
      writeAnimationSourceJson(destination, { blocked: true }),
      /ANIMATION_SOURCE_OUTPUT_LOCKED/u,
    );
    assert.equal(await readFile(lockPath, "utf8"), "occupied\n");
    await rm(lockPath);

    const circular = {};
    circular.self = circular;
    await assert.rejects(
      writeAnimationSourceJson(destination, circular),
      /ANIMATION_SOURCE_OUTPUT_JSON_SERIALIZE_FAILED/u,
    );
    await assert.rejects(
      writeAnimationSourceJson(destination, undefined),
      /ANIMATION_SOURCE_OUTPUT_JSON_SERIALIZE_FAILED/u,
    );
    await assert.rejects(
      writeAnimationSourceJson(destination, { invalid: true }, {
        replace: "yes",
      }),
      /ANIMATION_SOURCE_OUTPUT_REPLACE_INVALID/u,
    );

    if (process.platform !== "win32") {
      const target = path.join(root, "target.json");
      const symbolic = path.join(root, "symbolic.json");
      await writeFile(target, '{"safe":true}\n', "utf8");
      await symlink(target, symbolic);
      await assert.rejects(
        writeAnimationSourceJson(symbolic, { unsafe: true }, {
          replace: true,
        }),
        /ANIMATION_SOURCE_OUTPUT_DESTINATION_INVALID/u,
      );
      assert.equal(await readFile(target, "utf8"), '{"safe":true}\n');
    } else {
      t.diagnostic("symbolic destination case is covered on non-Windows hosts");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
