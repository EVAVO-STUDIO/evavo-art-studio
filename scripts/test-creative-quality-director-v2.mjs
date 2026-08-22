import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileCreativeQualityReview,
  validateCreativeQualitySpecialists,
} from "./creative-quality-director-v2.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const profilePath = join(
  repositoryRoot,
  "config",
  "creative-quality-cel-v1.json",
);
const specialistsPath = join(
  repositoryRoot,
  "config",
  "creative-quality-specialists-v1.json",
);
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const specialists = JSON.parse(readFileSync(specialistsPath, "utf8"));
const digest = (character) => `sha256:${character.repeat(64)}`;

function request(loop) {
  return {
    schemaVersion: 1,
    kind: "evavo-art-creative-quality-review-request-v1",
    reviewId: `shot-030-${loop.mode}-review`,
    candidate: {
      id: "shot-030-candidate-a",
      contentSha256: digest("a"),
      technicalEvidenceSha256: [digest("b")],
    },
    revision: { current: 1 },
    loop,
    references: [
      {
        role: "visual-standard",
        artifactId: "shot-030-standard-r1",
        contentSha256: digest("c"),
        approved: true,
      },
    ],
    findings: [],
  };
}

validateCreativeQualitySpecialists(specialists);
assert.throws(
  () => validateCreativeQualitySpecialists({ ...specialists, extra: true }),
  /ART_DIRECTOR_SPECIALISTS_UNKNOWN_FIELD_extra/,
);
assert.throws(
  () =>
    validateCreativeQualitySpecialists({
      ...specialists,
      loopAssurance: {
        ...specialists.loopAssurance,
        requiredModes: ["seamless", "seamless"],
      },
    }),
  /ART_DIRECTOR_LOOP_REQUIRED_MODES_INVALID/,
);
assert.throws(
  () =>
    validateCreativeQualitySpecialists({
      ...specialists,
      authority: { ...specialists.authority, publication: true },
    }),
  /ART_DIRECTOR_SPECIALIST_AUTHORITY_PUBLICATION_MUST_BE_FALSE/,
);

const seamless = compileCreativeQualityReview(
  request({
    mode: "seamless",
    boundary: {
      firstFrameSha256: digest("1"),
      lastFrameSha256: digest("2"),
      boundaryEvidenceSha256: digest("3"),
    },
    omitDuplicateTerminalFrame: true,
  }),
  profile,
  specialists,
);
assert.equal(seamless.loopAssurance.required, true);
assert.equal(
  seamless.loopAssurance.repository,
  "EVAVO-STUDIO/evavo-loop-studio",
);
assert.equal(seamless.loopAssurance.taskId, "external-loop-assurance");
assert.equal(seamless.loopAssurance.creativeApprovalGranted, false);

const nonLoop = compileCreativeQualityReview(
  request({ mode: "none" }),
  profile,
  specialists,
);
assert.equal(nonLoop.loopAssurance.required, false);
assert.equal(nonLoop.loopAssurance.repository, null);
assert.equal(nonLoop.disposition, "awaiting-human-creative-approval");

const temporaryRoot = mkdtempSync(
  join(tmpdir(), "evavo art director cli contract "),
);
try {
  const temporaryScripts = join(temporaryRoot, "scripts");
  const temporaryConfig = join(temporaryRoot, "config");
  mkdirSync(temporaryScripts);
  mkdirSync(temporaryConfig);

  const cliSource = join(scriptDirectory, "creative-quality-director-v2.mjs");
  const baseSource = join(scriptDirectory, "creative-quality-director.mjs");
  const temporaryCli = join(
    temporaryScripts,
    "creative-quality-director-v2.mjs",
  );
  const temporaryProfile = join(
    temporaryConfig,
    "creative-quality-cel-v1.json",
  );
  const temporarySpecialists = join(
    temporaryConfig,
    "creative-quality-specialists-v1.json",
  );
  copyFileSync(cliSource, temporaryCli);
  copyFileSync(
    baseSource,
    join(temporaryScripts, "creative-quality-director.mjs"),
  );
  copyFileSync(profilePath, temporaryProfile);
  copyFileSync(specialistsPath, temporarySpecialists);

  const validation = spawnSync(
    process.execPath,
    [
      temporaryCli,
      "validate",
      "--profile",
      temporaryProfile,
      "--specialists",
      temporarySpecialists,
    ],
    { encoding: "utf8" },
  );
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).ok, true);

  const unknownOption = spawnSync(
    process.execPath,
    [
      temporaryCli,
      "validate",
      "--profile",
      temporaryProfile,
      "--specialists",
      temporarySpecialists,
      "--unexpected",
      "value",
    ],
    { encoding: "utf8" },
  );
  assert.equal(unknownOption.status, 2);
  assert.match(unknownOption.stderr, /Unknown option '--unexpected'/);

  const duplicateOption = spawnSync(
    process.execPath,
    [
      temporaryCli,
      "validate",
      "--profile",
      temporaryProfile,
      "--profile",
      temporaryProfile,
      "--specialists",
      temporarySpecialists,
    ],
    { encoding: "utf8" },
  );
  assert.equal(duplicateOption.status, 2);
  assert.match(
    duplicateOption.stderr,
    /ART_DIRECTOR_OPTION_DUPLICATE_PROFILE/,
  );

  const invalidValidateOption = spawnSync(
    process.execPath,
    [
      temporaryCli,
      "validate",
      "--profile",
      temporaryProfile,
      "--specialists",
      temporarySpecialists,
      "--output",
      join(temporaryRoot, "forbidden-output.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(invalidValidateOption.status, 2);
  assert.match(
    invalidValidateOption.stderr,
    /ART_DIRECTOR_VALIDATE_OPTION_INVALID/,
  );

  const malformedSpecialists = join(
    temporaryConfig,
    "malformed-specialists.json",
  );
  writeFileSync(
    malformedSpecialists,
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]),
  );
  const malformedUtf8 = spawnSync(
    process.execPath,
    [
      temporaryCli,
      "validate",
      "--profile",
      temporaryProfile,
      "--specialists",
      malformedSpecialists,
    ],
    { encoding: "utf8" },
  );
  assert.equal(malformedUtf8.status, 2);
  assert.match(
    malformedUtf8.stderr,
    /ART_DIRECTOR_SPECIALISTS_UTF8_INVALID/,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write("Creative Quality Director v2 contracts passed.\n");
