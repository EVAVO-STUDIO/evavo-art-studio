import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs, TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

import {
  compileCreativeQualityReview as compileBaseReview,
  validateCreativeQualityProfile,
} from "./creative-quality-director.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,191}$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REQUIRED_LOOP_MODES = new Set(["seamless", "finite-repeat"]);
const MAX_JSON_BYTES = 1024 * 1024;
const SPECIALIST_KEYS = new Set([
  "schemaVersion",
  "kind",
  "loopAssurance",
  "authority",
]);
const LOOP_KEYS = new Set(["repository", "taskId", "requiredModes"]);
const AUTHORITY_KEYS = new Set([
  "providerExecution",
  "creativeApproval",
  "publication",
  "clientRelease",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function require(condition, code) {
  if (!condition) throw new Error(code);
}

function requireExactKeys(value, keys, code) {
  require(
    value && typeof value === "object" && !Array.isArray(value),
    `${code}_OBJECT_REQUIRED`,
  );
  const actual = Object.keys(value);
  for (const key of actual) {
    require(keys.has(key), `${code}_UNKNOWN_FIELD_${key}`);
  }
  for (const key of keys) {
    require(Object.hasOwn(value, key), `${code}_MISSING_FIELD_${key}`);
  }
}

function normalPath(path) {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function canonicalIdentityPath(path) {
  const target = resolve(path);
  try {
    const canonical = realpathSync.native(target);
    return process.platform === "win32" ? canonical.toLowerCase() : canonical;
  } catch {
    return process.platform === "win32" ? target.toLowerCase() : target;
  }
}

function requireCanonicalRegularFile(path, code) {
  const target = resolve(path);
  let info;
  try {
    info = lstatSync(target, { bigint: true });
  } catch {
    throw new Error(`${code}_NOT_FOUND`);
  }
  require(
    info.isFile() && !info.isSymbolicLink(),
    `${code}_REGULAR_FILE_REQUIRED`,
  );
  require(info.size <= BigInt(MAX_JSON_BYTES), `${code}_TOO_LARGE`);
  require(
    normalPath(realpathSync.native(target)) === normalPath(target),
    `${code}_LINK_FORBIDDEN`,
  );
  return { target, info };
}

function readJson(path, code = "ART_DIRECTOR_JSON") {
  const { target, info } = requireCanonicalRegularFile(path, code);
  const noFollow =
    process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = openSync(target, constants.O_RDONLY | noFollow);
    const opened = fstatSync(handle, { bigint: true });
    require(opened.isFile(), `${code}_REGULAR_FILE_REQUIRED`);
    require(opened.size <= BigInt(MAX_JSON_BYTES), `${code}_TOO_LARGE`);
    if (info.ino !== 0n && opened.ino !== 0n) {
      require(
        info.dev === opened.dev && info.ino === opened.ino,
        `${code}_CHANGED_DURING_OPEN`,
      );
    }
    const raw = readFileSync(handle);
    require(raw.byteLength <= MAX_JSON_BYTES, `${code}_TOO_LARGE`);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      throw new Error(`${code}_UTF8_INVALID`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${code}_JSON_INVALID`);
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

function writeCreateOnly(path, value) {
  const target = resolve(path);
  const parent = dirname(target);
  let parentInfo;
  try {
    parentInfo = lstatSync(parent);
  } catch {
    throw new Error("ART_DIRECTOR_OUTPUT_PARENT_NOT_FOUND");
  }
  require(
    parentInfo.isDirectory() && !parentInfo.isSymbolicLink(),
    "ART_DIRECTOR_OUTPUT_PARENT_INVALID",
  );
  require(
    normalPath(realpathSync.native(parent)) === normalPath(parent),
    "ART_DIRECTOR_OUTPUT_PARENT_LINK_FORBIDDEN",
  );
  try {
    writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error("ART_DIRECTOR_OUTPUT_EXISTS");
    }
    throw error;
  }
}

export function validateCreativeQualitySpecialists(specialists) {
  requireExactKeys(
    specialists,
    SPECIALIST_KEYS,
    "ART_DIRECTOR_SPECIALISTS",
  );
  require(
    specialists.schemaVersion === 1 &&
      specialists.kind === "evavo-art-creative-quality-specialists-v1",
    "ART_DIRECTOR_SPECIALISTS_IDENTITY_INVALID",
  );
  const loop = specialists.loopAssurance;
  requireExactKeys(loop, LOOP_KEYS, "ART_DIRECTOR_LOOP_SPECIALIST");
  require(
    typeof loop.repository === "string" &&
      SAFE_REPOSITORY.test(loop.repository),
    "ART_DIRECTOR_LOOP_REPOSITORY_INVALID",
  );
  require(
    typeof loop.taskId === "string" && SAFE_ID.test(loop.taskId),
    "ART_DIRECTOR_LOOP_TASK_ID_INVALID",
  );
  require(
    Array.isArray(loop.requiredModes) &&
      loop.requiredModes.length === REQUIRED_LOOP_MODES.size &&
      new Set(loop.requiredModes).size === REQUIRED_LOOP_MODES.size &&
      [...REQUIRED_LOOP_MODES].every((mode) =>
        loop.requiredModes.includes(mode),
      ),
    "ART_DIRECTOR_LOOP_REQUIRED_MODES_INVALID",
  );
  requireExactKeys(
    specialists.authority,
    AUTHORITY_KEYS,
    "ART_DIRECTOR_SPECIALIST_AUTHORITY",
  );
  for (const key of AUTHORITY_KEYS) {
    require(
      specialists.authority[key] === false,
      `ART_DIRECTOR_SPECIALIST_AUTHORITY_${key.toUpperCase()}_MUST_BE_FALSE`,
    );
  }
  return specialists;
}

export function compileCreativeQualityReview(request, profile, specialists) {
  validateCreativeQualityProfile(profile);
  validateCreativeQualitySpecialists(specialists);
  const base = compileBaseReview(request, profile);
  const required = specialists.loopAssurance.requiredModes.includes(
    request.loop.mode,
  );
  const withoutDigest = {
    ...base,
    loopAssurance: {
      required,
      repository: required
        ? specialists.loopAssurance.repository
        : null,
      taskId: required ? specialists.loopAssurance.taskId : null,
      receiptRequiredBeforeTechnicalAssurance: required,
      creativeApprovalGranted: false,
    },
  };
  delete withoutDigest.reviewSha256;
  return { ...withoutDigest, reviewSha256: digest(withoutDigest) };
}

function runCli() {
  const [command, ...arguments_] = process.argv.slice(2);
  require(
    command === "validate" || command === "compile",
    "ART_DIRECTOR_COMMAND_INVALID",
  );
  const parsed = parseArgs({
    args: arguments_,
    options: {
      profile: { type: "string" },
      specialists: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
    tokens: true,
  });
  const seenOptions = new Set();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    require(
      !seenOptions.has(token.name),
      `ART_DIRECTOR_OPTION_DUPLICATE_${token.name.toUpperCase()}`,
    );
    seenOptions.add(token.name);
  }
  if (command === "validate") {
    require(
      parsed.values.input === undefined && parsed.values.output === undefined,
      "ART_DIRECTOR_VALIDATE_OPTION_INVALID",
    );
  }
  const profile = readJson(
    parsed.values.profile ?? "config/creative-quality-cel-v1.json",
    "ART_DIRECTOR_PROFILE",
  );
  const specialists = readJson(
    parsed.values.specialists ??
      "config/creative-quality-specialists-v1.json",
    "ART_DIRECTOR_SPECIALISTS",
  );
  if (command === "validate") {
    validateCreativeQualityProfile(profile);
    validateCreativeQualitySpecialists(specialists);
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          profileSha256: digest(profile),
          specialistsSha256: digest(specialists),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const input = parsed.values.input;
  require(input, "ART_DIRECTOR_INPUT_REQUIRED");
  const result = compileCreativeQualityReview(
    readJson(input, "ART_DIRECTOR_INPUT"),
    profile,
    specialists,
  );
  const output = parsed.values.output;
  if (output) writeCreateOnly(output, result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const directEntry = process.argv[1]
  ? canonicalIdentityPath(process.argv[1]) ===
    canonicalIdentityPath(fileURLToPath(import.meta.url))
  : false;

if (directEntry) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
