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
  freeze,
  hashBytes,
  pathWithin,
  safeRelativePath,
} from "./frame-body-selected-candidate-mastering-common.mjs";

function identity(info) {
  return freeze({
    dev: String(info.dev),
    ino: String(info.ino),
    size: String(info.size),
    mtimeMs: String(info.mtimeMs),
  });
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
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

export async function ensureMasteringDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(relativeDirectory, "mastering workspace directory path");
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    let info = await lstat(current).catch(() => null);
    if (!info) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      }
      info = await lstat(current);
    }
    assert(
      info.isDirectory() && !info.isSymbolicLink(),
      `mastering workspace directory component is not a real directory: ${current}`,
    );
  }
  const resolved = await realpath(current);
  assert(
    pathWithin(root, resolved),
    `mastering workspace directory escaped the persistent workspace: ${resolved}`,
  );
  return resolved;
}

async function inspectExisting(filePath, label) {
  const before = await lstat(filePath).catch(() => null);
  if (!before) return null;
  assert(
    before.isFile() && !before.isSymbolicLink(),
    `${label} is not a regular non-symlink file: ${filePath}`,
  );
  assert(before.nlink === 1, `${label} must have exactly one filesystem link: ${filePath}`);
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
    const stagePath = path.join(parent, `.${basename}.hmf-master-stage-${token}`);
    let handle;
    try {
      handle = await open(stagePath, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      const staged = await inspectExisting(stagePath, "mastering stage");
      assert(
        staged.size === bytes.length && staged.sha256 === hashBytes(bytes),
        `mastering stage did not retain the exact expected bytes: ${stagePath}`,
      );
      return freeze({ path: stagePath, identity: staged.identity });
    } catch (error) {
      if (handle) await handle.close();
      if (error && typeof error === "object" && error.code === "EEXIST") continue;
      throw error;
    }
  }
  assert(false, `could not reserve a mastering stage for ${filePath}.`);
}

export async function writeMasteringExactOrReuse(
  filePath,
  bytes,
  expectedSha256,
  label,
) {
  const expectedHash = hashBytes(bytes);
  assert(expectedHash === expectedSha256, `${label} expected SHA-256 does not match its exact bytes.`);
  const existing = await inspectExisting(filePath, label);
  if (existing) {
    assert(
      existing.sha256 === expectedSha256 && existing.size === bytes.length,
      `existing ${label} conflicts with the governed selected-candidate mastering output: ${filePath}`,
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
      if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      const raced = await inspectExisting(filePath, label);
      assert(
        raced?.sha256 === expectedSha256 && raced.size === bytes.length,
        `racing ${label} conflicts with the governed selected-candidate mastering output: ${filePath}`,
      );
      return freeze({ status: "reused", identity: raced.identity });
    }
    const linked = await lstat(filePath);
    const staged = await lstat(stage.path);
    assert(
      linked.dev === staged.dev && linked.ino === staged.ino,
      `${label} was not published from the exact staged inode.`,
    );
    const finalBeforeUnlink = await readFile(filePath);
    assert(
      finalBeforeUnlink.length === bytes.length
        && hashBytes(finalBeforeUnlink) === expectedSha256,
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

export async function removeOwnedMasteringOutput(filePath, expectedIdentity) {
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

export async function writeMasteringReceiptChain(
  filePath,
  previousReceipts,
  receipt,
) {
  const expectedPrevious = canonical(previousReceipts);
  const nextChain = freeze([...previousReceipts, receipt]);
  const expectedNext = canonical(nextChain);
  const existing = await inspectExisting(filePath, "mastering receipt chain");
  assert(existing, "persisted receipt chain disappeared before mastering materialization.");
  const text = existing.bytes.toString("utf8");
  if (text === expectedNext) return freeze({ status: "reused", chain: nextChain });
  assert(
    text === expectedPrevious,
    "persisted receipt chain differs from the validated selected predecessor chain.",
  );
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(expectedNext, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    const current = await inspectExisting(filePath, "mastering receipt chain");
    assert(
      current && sameIdentity(current.identity, existing.identity),
      "persisted receipt chain changed before mastering append.",
    );
    await rename(temporary, filePath);
    await syncDirectory(path.dirname(filePath));
  } catch (error) {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  const written = await inspectExisting(filePath, "mastering receipt chain");
  assert(
    written?.bytes.toString("utf8") === expectedNext,
    "mastering receipt chain failed exact post-write readback.",
  );
  return freeze({ status: "advanced", chain: nextChain });
}
