import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
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
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-version" ]]; then
  printf '${label} version fixture\\n'
  exit 0
fi
exit 0
`,
  );
}

async function commandForwarder(filePath, body) {
  await executable(
    filePath,
    `#!/usr/bin/env bash
set -euo pipefail
${body}
`,
  );
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
  await mkdir(bin, { recursive: true });
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
    `if [[ "\${1:-}" == "-n" ]]; then shift; fi
if [[ "\${1:-}" == "env" ]]; then
  shift
  while [[ "\${1:-}" == *=* ]]; do export "$1"; shift; done
fi
exec "$@"`,
  );
  await commandForwarder(
    paths.timeout,
    `while [[ "\${1:-}" == --* ]]; do shift; done
[[ $# -gt 0 ]] || exit 93
shift
exec "$@"`,
  );
}

test("media bootstrap reuses validated preinstalled tools without apt", async (t) => {
  const paths = await fixture(t, "evavo-ci-media-fast-");
  const aptMarker = path.join(paths.root, "apt-called");
  await mediaTool(paths.ffmpeg, "ffmpeg");
  await mediaTool(paths.ffprobe, "ffprobe");
  await executable(
    paths.aptGet,
    `#!/usr/bin/env bash
touch "${aptMarker}"
exit 90
`,
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
  assert.ok(output.includes(`FFMPEG_BIN=${paths.ffmpeg}`));
  assert.ok(output.includes(`FFPROBE_BIN=${paths.ffprobe}`));
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
    `#!/usr/bin/env bash
set -euo pipefail
command_name=""
for argument in "$@"; do
  if [[ "\${argument}" == "update" || "\${argument}" == "install" ]]; then
    command_name="\${argument}"
    break
  fi
done
if [[ "\${command_name}" == "update" ]]; then
  count=0
  [[ ! -f "${updateCount}" ]] || count="$(cat "${updateCount}")"
  count=$((count + 1))
  printf '%s' "\${count}" > "${updateCount}"
  ((count >= 2))
  exit
fi
if [[ "\${command_name}" == "install" ]]; then
  count=0
  [[ ! -f "${installCount}" ]] || count="$(cat "${installCount}")"
  printf '%s' "$((count + 1))" > "${installCount}"
  cat > "${paths.ffmpeg}" <<'TOOL'
#!/usr/bin/env bash
printf 'ffmpeg version installed-fixture\\n'
TOOL
  cat > "${paths.ffprobe}" <<'TOOL'
#!/usr/bin/env bash
printf 'ffprobe version installed-fixture\\n'
TOOL
  chmod +x "${paths.ffmpeg}" "${paths.ffprobe}"
  exit 0
fi
exit 91
`,
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
  assert.match(
    output,
    /ART_STUDIO_FFMPEG_VERSION=ffmpeg version installed-fixture/,
  );
  assert.match(
    output,
    /ART_STUDIO_FFPROBE_VERSION=ffprobe version installed-fixture/,
  );
});

test("media bootstrap fails after the configured bounded attempts", async (t) => {
  const paths = await fixture(t, "evavo-ci-media-failure-");
  const updateCount = path.join(paths.root, "update-count");
  await writeForwarders(paths);
  await executable(
    paths.aptGet,
    `#!/usr/bin/env bash
set -euo pipefail
count=0
[[ ! -f "${updateCount}" ]] || count="$(cat "${updateCount}")"
printf '%s' "$((count + 1))" > "${updateCount}"
exit 92
`,
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
