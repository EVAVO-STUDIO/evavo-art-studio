import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOTSTRAP = path.join(ROOT, "scripts/bootstrap-ci-media-tools.sh");
const MAINLINE_WORKFLOW = path.join(ROOT, ".github/workflows/ci.yml");
const BOOTSTRAP_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/ci-media-tool-bootstrap.yml",
);

async function executable(filePath, content) {
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function mediaTool(filePath, label) {
  await executable(
    filePath,
    `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "${1:-}" == "-version" ]]; then\n  printf '${label} version fixture\\n'\n  exit 0\nfi\nexit 0\n`,
  );
}

async function commandForwarder(filePath, body) {
  await executable(filePath, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
}

function runBootstrap(environment) {
  return spawnSync("/bin/bash", [BOOTSTRAP], {
    cwd: ROOT,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function assertSuccess(result) {
  assert.equal(
    result.status,
    0,
    `bootstrap failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

async function fixture(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const bin = path.join(root, "bin");
  const environment = path.join(root, "github-env");
  await commandForwarder(path.join(root, "mkdir-bin"), `mkdir -p "${bin}"`);
  spawnSync(path.join(root, "mkdir-bin"), [], { encoding: "utf8" });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    bin,
    environment,
    ffmpeg: path.join(bin, "ffmpeg"),
    ffprobe: path.join(bin, "ffprobe"),
    aptGet: path.join(bin, "apt-get"),
    sudo: path.join(bin, "sudo"),
    timeout: path.join(bin, "timeout"),
  };
}

async function writeForwarders(paths) {
  await commandForwarder(
    paths.sudo,
    `if [[ "${1:-}" == "-n" ]]; then shift; fi\nif [[ "${1:-}" == "env" ]]; then\n  shift\n  while [[ "${1:-}" == *=* ]]; do export "${1}"; shift; done\nfi\nexec "${@}"`,
  );
  await commandForwarder(
    paths.timeout,
    `while [[ "${1:-}" == --* ]]; do shift; done\nshift\nexec "${@}"`,
  );
}

test("media bootstrap reuses validated preinstalled tools without apt", async (t) => {
  const paths = await fixture(t, "evavo-ci-media-fast-");
  const aptMarker = path.join(paths.root, "apt-called");
  await mediaTool(paths.ffmpeg, "ffmpeg");
  await mediaTool(paths.ffprobe, "ffprobe");
  await executable(
    paths.aptGet,
    `#!/usr/bin/env bash\ntouch "${aptMarker}"\nexit 90\n`,
  );

  const result = runBootstrap({
    CI_MEDIA_ENV_FILE: paths.environment,
    CI_MEDIA_FFMPEG_BIN: paths.ffmpeg,
    CI_MEDIA_FFPROBE_BIN: paths.ffprobe,
    CI_MEDIA_APT_GET_BIN: paths.aptGet,
  });
  assertSuccess(result);
  assert.equal(await exists(aptMarker), false);
  assert.match(result.stdout, /package installation was skipped/);

  const output = await readFile(paths.environment, "utf8");
  assert.match(output, new RegExp(`FFMPEG_BIN=${paths.ffmpeg}`));
  assert.match(output, new RegExp(`FFPROBE_BIN=${paths.ffprobe}`));
  assert.match(output, /ART_STUDIO_FFMPEG_VERSION=ffmpeg version fixture/);
  assert.match(output, /ART_STUDIO_FFPROBE_VERSION=ffprobe version fixture/);
  assert.match(output, /ART_STUDIO_FFMPEG_SHA256=[0-9a-f]{64}/);
  assert.match(output, /ART_STUDIO_FFPROBE_SHA256=[0-9a-f]{64}/);
});

test("media bootstrap retries bounded apt work and validates installed tools", async (t) => {
  const paths = await fixture(t, "evavo-ci-media-retry-");
  const updateCount = path.join(paths.root, "update-count");
  const installCount = path.join(paths.root, "install-count");
  await writeForwarders(paths);
  await executable(
    paths.aptGet,
    `#!/usr/bin/env bash\nset -euo pipefail\ncommand_name=""\nfor argument in "${@}"; do\n  if [[ "${argument}" == "update" || "${argument}" == "install" ]]; then command_name="${argument}"; break; fi\ndone\nif [[ "${command_name}" == "update" ]]; then\n  count=0\n  [[ ! -f "${updateCount}" ]] || count="$(cat "${updateCount}")"\n  count=$((count + 1))\n  printf '%s' "${count}" > "${updateCount}"\n  ((count >= 2))\n  exit\nfi\nif [[ "${command_name}" == "install" ]]; then\n  count=0\n  [[ ! -f "${installCount}" ]] || count="$(cat "${installCount}")"\n  printf '%s' "$((count + 1))" > "${installCount}"\n  cat > "${paths.ffmpeg}" <<'TOOL'\n#!/usr/bin/env bash\nprintf 'ffmpeg version installed-fixture\\n'\nTOOL\n  cat > "${paths.ffprobe}" <<'TOOL'\n#!/usr/bin/env bash\nprintf 'ffprobe version installed-fixture\\n'\nTOOL\n  chmod +x "${paths.ffmpeg}" "${paths.ffprobe}"\n  exit 0\nfi\nexit 91\n`,
  );

  const result = runBootstrap({
    CI_MEDIA_ENV_FILE: paths.environment,
    CI_MEDIA_FFMPEG_BIN: paths.ffmpeg,
    CI_MEDIA_FFPROBE_BIN: paths.ffprobe,
    CI_MEDIA_APT_GET_BIN: paths.aptGet,
    CI_MEDIA_SUDO_BIN: paths.sudo,
    CI_MEDIA_TIMEOUT_BIN: paths.timeout,
    CI_MEDIA_APT_ATTEMPTS: "2",
    CI_MEDIA_RETRY_DELAY_SECONDS: "0",
  });
  assertSuccess(result);
  assert.equal(await readFile(updateCount, "utf8"), "2");
  assert.equal(await readFile(installCount, "utf8"), "1");
  assert.match(result.stdout, /attempt 1\/2/);
  assert.match(result.stdout, /attempt 2\/2/);

  const output = await readFile(paths.environment, "utf8");
  assert.match(output, /ART_STUDIO_FFMPEG_VERSION=ffmpeg version installed-fixture/);
  assert.match(output, /ART_STUDIO_FFPROBE_VERSION=ffprobe version installed-fixture/);
});

test("media bootstrap fails after the configured bounded attempts", async (t) => {
  const paths = await fixture(t, "evavo-ci-media-failure-");
  const updateCount = path.join(paths.root, "update-count");
  await writeForwarders(paths);
  await executable(
    paths.aptGet,
    `#!/usr/bin/env bash\nset -euo pipefail\ncount=0\n[[ ! -f "${updateCount}" ]] || count="$(cat "${updateCount}")"\nprintf '%s' "$((count + 1))" > "${updateCount}"\nexit 92\n`,
  );

  const result = runBootstrap({
    CI_MEDIA_ENV_FILE: paths.environment,
    CI_MEDIA_FFMPEG_BIN: paths.ffmpeg,
    CI_MEDIA_FFPROBE_BIN: paths.ffprobe,
    CI_MEDIA_APT_GET_BIN: paths.aptGet,
    CI_MEDIA_SUDO_BIN: paths.sudo,
    CI_MEDIA_TIMEOUT_BIN: paths.timeout,
    CI_MEDIA_APT_ATTEMPTS: "2",
    CI_MEDIA_RETRY_DELAY_SECONDS: "0",
  });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(updateCount, "utf8"), "2");
  assert.match(result.stderr, /exhausted 2 bounded attempts/);
  assert.equal(await exists(paths.ffmpeg), false);
  assert.equal(await exists(paths.ffprobe), false);
});

test("mainline workflows permanently use the bounded bootstrap contract", async () => {
  const [mainline, workflow, bootstrap] = await Promise.all([
    readFile(MAINLINE_WORKFLOW, "utf8"),
    readFile(BOOTSTRAP_WORKFLOW, "utf8"),
    readFile(BOOTSTRAP, "utf8"),
  ]);

  assert.match(mainline, /bash scripts\/bootstrap-ci-media-tools\.sh/);
  assert.doesNotMatch(mainline, /sudo apt-get update/);
  assert.match(workflow, /test-ci-media-tool-bootstrap\.mjs/);
  assert.match(workflow, /bash scripts\/bootstrap-ci-media-tools\.sh/);
  assert.match(bootstrap, /CI_MEDIA_APT_UPDATE_TIMEOUT_SECONDS:-120/);
  assert.match(bootstrap, /CI_MEDIA_APT_INSTALL_TIMEOUT_SECONDS:-180/);
  assert.match(bootstrap, /--kill-after=15s/);
  assert.match(bootstrap, /Acquire::Retries=3/);
  assert.match(bootstrap, /package installation was skipped/);
});
