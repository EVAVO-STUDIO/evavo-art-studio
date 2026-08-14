import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  assert,
  canonical,
  decodeUtf8Strict,
  freeze,
  hashBytes,
  pathWithin,
  safeRelativePath,
} from "./frame-body-master-approval-common.mjs";

function identity(info) {
  return freeze({
    dev: String(info.dev),
    ino: String(info.ino),
    nlink: String(info.nlink),
    size: String(info.size),
    mtimeMs: String(info.mtimeMs),
  });
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (
      !error
      || typeof error !== "object"
      || !["EISDIR", "EINVAL", "EPERM", "EACCES", "ENOTSUP"].includes(error.code)
    ) {
      throw error;
    }
  } finally {
    if (handle) await handle.close();
  }
}

export async function ensureApprovalDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(
    relativeDirectory,
    "master approval workspace directory path",
  );
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    let info = await lstat(current).catch(() => null);
    if (!info) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "EEXIST") {
          throw error;
        }
      }
      info = await lstat(current);
    }
    assert(
      info.isDirectory() && !info.isSymbolicLink(),
      `master approval directory component is not a real directory: ${current}`,
    );
  }
  const resolved = await realpath(current);
  assert(
    pathWithin(root, resolved),
    `master approval directory escaped the persistent workspace: ${resolved}`,
  );
  return resolved;
}

async function inspectExisting(filePath, label) {
  const before = await lstat(filePath).catch(() => null);
  if (!before) return null;
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    `${label} is not a one-link regular non-symlink file: ${filePath}`,
  );
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(
    sameIdentity(identity(before), identity(after)),
    `${label} changed while it was being read: ${filePath}`,
  );
  return freeze({
    bytes,
    sha256: hashBytes(bytes),
    size: bytes.length,
    identity: identity(after),
  });
}

async function writeSyncedStage(filePath, bytes) {
  const parent = path.dirname(filePath);
  const basename = path.basename(filePath);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stagePath = path.join(
      parent,
      `.${basename}.hmf-approval-stage-${token}`,
    );
    let handle;
    try {
      handle = await open(stagePath, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      const staged = await inspectExisting(stagePath, "master approval stage");
      assert(
        staged.size === bytes.length
          && staged.sha256 === hashBytes(bytes),
        `master approval stage did not retain the expected bytes: ${stagePath}`,
      );
      return freeze({ path: stagePath, identity: staged.identity });
    } catch (error) {
      if (handle) await handle.close();
      if (error && typeof error === "object" && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  assert(false, `could not reserve a master approval stage for ${filePath}.`);
}

export async function writeApprovalExactOrReuse(
  filePath,
  bytes,
  expectedSha256,
  label,
) {
  const expectedHash = hashBytes(bytes);
  assert(
    expectedHash === expectedSha256,
    `${label} expected SHA-256 does not match its bytes.`,
  );
  const existing = await inspectExisting(filePath, label);
  if (existing) {
    assert(
      existing.sha256 === expectedSha256 && existing.size === bytes.length,
      `existing ${label} conflicts with the governed master approval output: ${filePath}`,
    );
    return freeze({ status: "reused", identity: existing.identity });
  }

  const stage = await writeSyncedStage(filePath, bytes);
  let published = false;
  try {
    try {
      await link(stage.path, filePath);
      published = true;
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") {
        throw error;
      }
      const raced = await inspectExisting(filePath, label);
      assert(
        raced?.sha256 === expectedSha256 && raced.size === bytes.length,
        `racing ${label} conflicts with the governed master approval output: ${filePath}`,
      );
      return freeze({ status: "reused", identity: raced.identity });
    }
    const linked = await lstat(filePath);
    const staged = await lstat(stage.path);
    assert(
      linked.dev === staged.dev && linked.ino === staged.ino,
      `${label} was not published from the exact staged inode.`,
    );
    const readback = await readFile(filePath);
    assert(
      readback.length === bytes.length
        && hashBytes(readback) === expectedSha256,
      `${label} failed exact post-link readback.`,
    );
  } finally {
    await rm(stage.path, { force: true });
  }
  assert(published, `${label} was not published.`);
  await syncDirectory(path.dirname(filePath));
  const final = await inspectExisting(filePath, label);
  assert(
    final?.sha256 === expectedSha256 && final.size === bytes.length,
    `${label} failed exact post-write readback.`,
  );
  return freeze({ status: "created", identity: final.identity });
}

export async function removeOwnedApprovalOutput(filePath, expectedIdentity) {
  const existing = await lstat(filePath).catch(() => null);
  if (!existing) return;
  assert(
    existing.isFile() && !existing.isSymbolicLink(),
    `rollback target is not a regular non-symlink file: ${filePath}`,
  );
  assert(
    sameIdentity(identity(existing), expectedIdentity),
    `rollback target changed and was left untouched: ${filePath}`,
  );
  await unlink(filePath);
  await syncDirectory(path.dirname(filePath));
}

export async function writeApprovalReceiptChain(
  filePath,
  previousReceipts,
  receipt,
) {
  const expectedPrevious = canonical(previousReceipts);
  const nextChain = freeze([...previousReceipts, receipt]);
  const expectedNext = canonical(nextChain);
  const existing = await inspectExisting(
    filePath,
    "master approval receipt chain",
  );
  assert(
    existing,
    "persisted receipt chain disappeared before master approval materialization.",
  );
  const text = decodeUtf8Strict(
    existing.bytes,
    "master approval receipt chain",
  );
  if (text === expectedNext) {
    return freeze({ status: "reused", chain: nextChain });
  }
  assert(
    text === expectedPrevious,
    "persisted receipt chain differs from the validated mastered predecessor chain.",
  );
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(expectedNext, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    const current = await inspectExisting(
      filePath,
      "master approval receipt chain",
    );
    assert(
      current && sameIdentity(current.identity, existing.identity),
      "persisted receipt chain changed before master approval append.",
    );
    await rename(temporary, filePath);
    await syncDirectory(path.dirname(filePath));
  } catch (error) {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  const written = await inspectExisting(
    filePath,
    "master approval receipt chain",
  );
  assert(
    decodeUtf8Strict(
      written.bytes,
      "master approval receipt chain",
    ) === expectedNext,
    "master approval receipt chain failed exact post-write readback.",
  );
  return freeze({ status: "advanced", chain: nextChain });
}
