import { pushFail } from "./contract.mjs";
import { gitText, networkOptions } from "./git-exec.mjs";

const HTTPS_GITHUB_ORIGIN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u;

function parseOriginRepository(originUrl) {
  const match = HTTPS_GITHUB_ORIGIN.exec(originUrl);
  if (!match) pushFail("ORIGIN_UNSAFE", "The push boundary requires one exact HTTPS github.com origin URL.");
  return `${match[1]}/${match[2]}`;
}

function parseNullConfig(buffer) {
  if (buffer.length === 0) return [];
  const records = buffer.toString("utf8").split("\0");
  if (records.at(-1) === "") records.pop();
  const output = [];
  for (const record of records) {
    const separator = record.indexOf("\n");
    if (separator < 1) pushFail("GIT_OUTPUT_INVALID", "Git config output is malformed.");
    output.push(Object.freeze({ key: record.slice(0, separator), value: record.slice(separator + 1) }));
  }
  return Object.freeze(output);
}

async function optionalConfig(root, args, deps) {
  const result = await deps.runGit(root.path, args, {
    allowedExitCodes: [0, 1],
    errorCode: "GIT_CONFIG_INSPECTION_FAILED",
  });
  return result.exitCode === 0 ? result.stdout : Buffer.alloc(0);
}

export async function inspectOrigin(root, repository, deps) {
  const originUrl = await gitText(root.path, ["config", "--local", "--get", "remote.origin.url"], {
    errorCode: "ORIGIN_INSPECTION_FAILED",
  });
  const originRepository = parseOriginRepository(originUrl);
  if (originRepository.toLowerCase() !== repository.toLowerCase()) {
    pushFail("ORIGIN_MISMATCH", "Current origin does not match the explicitly selected GitHub repository.", {
      expectedRepository: repository,
      originUrl,
    });
  }

  const pushUrls = (await optionalConfig(root, ["config", "--local", "--get-all", "remote.origin.pushurl"], deps))
    .toString("utf8").split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (pushUrls.length > 0) pushFail("ORIGIN_UNSAFE", "A separate remote.origin.pushurl is not permitted.");

  const receivePack = (await optionalConfig(root, ["config", "--local", "--get", "remote.origin.receivepack"], deps))
    .toString("utf8").trim();
  if (receivePack) pushFail("ORIGIN_UNSAFE", "A custom remote.origin.receivepack is not permitted.");

  const mirror = (await optionalConfig(root, ["config", "--local", "--bool", "--get", "remote.origin.mirror"], deps))
    .toString("utf8").trim().toLowerCase();
  if (mirror === "true") pushFail("ORIGIN_UNSAFE", "A mirror push remote is not permitted.");

  const config = parseNullConfig((await deps.runGit(root.path, ["config", "--null", "--list"], {
    errorCode: "GIT_CONFIG_INSPECTION_FAILED",
  })).stdout);
  const rewrites = config.filter(({ key }) => {
    const normalized = key.toLowerCase();
    return normalized.startsWith("url.") && (normalized.endsWith(".insteadof") || normalized.endsWith(".pushinsteadof"));
  });
  if (rewrites.length > 0) {
    pushFail("ORIGIN_UNSAFE", "Git URL rewrite rules are not permitted at the push boundary.", {
      keys: rewrites.map((entry) => entry.key),
    });
  }

  return Object.freeze({ url: originUrl, repository: originRepository });
}

function parseRemoteHead(buffer, branch) {
  const text = buffer.toString("utf8").trim();
  if (!text) return null;
  const lines = text.split("\n").filter(Boolean);
  if (lines.length !== 1) pushFail("REMOTE_OUTPUT_INVALID", "Remote branch lookup returned multiple records.");
  const match = /^([0-9a-f]{40}|[0-9a-f]{64})\trefs\/heads\/(.+)$/u.exec(lines[0]);
  if (!match || match[2] !== branch) pushFail("REMOTE_OUTPUT_INVALID", "Remote branch lookup returned malformed or unexpected data.");
  return match[1];
}

export async function readRemoteHead(root, originUrl, branch, deps) {
  const result = await deps.runGit(root.path, ["ls-remote", "--exit-code", "--refs", originUrl, `refs/heads/${branch}`], networkOptions({
    allowedExitCodes: [0, 2],
    errorCode: "REMOTE_INSPECTION_FAILED",
  }));
  if (result.exitCode === 2) return null;
  return parseRemoteHead(result.stdout, branch);
}
