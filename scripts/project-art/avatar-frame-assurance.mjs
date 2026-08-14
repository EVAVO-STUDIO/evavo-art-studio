import { createHash } from 'node:crypto';

export const AVATAR_FRAME_ASSURANCE_SCHEMA =
  'evavo.project-art-avatar-frame-assurance.v1';

export const AVATAR_FRAME_ASSURANCE_CHECKS = Object.freeze([
  'hands-and-fingers',
  'anatomy',
  'face-identity',
  'silhouette-and-crop',
  'temporal-continuity',
  'transparency-and-edge',
  'style-and-lighting',
]);

const VERDICTS = new Set(['pass', 'fail', 'uncertain']);
const APPLICABILITY = new Set(['visible', 'not-visible']);
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function parseObservation(value) {
  const code = 'PROJECT_ART_AVATAR_FRAME_ASSURANCE_OBSERVATION_INVALID';
  exact(
    value,
    [
      'inspectorId',
      'inspectorVersion',
      'applicability',
      'verdict',
      'confidence',
      'evidenceSha256',
      'note',
    ],
    code,
  );
  if (
    !SAFE_ID.test(value.inspectorId) ||
    typeof value.inspectorVersion !== 'string' ||
    value.inspectorVersion.length < 1 ||
    value.inspectorVersion.length > 128 ||
    !APPLICABILITY.has(value.applicability) ||
    !VERDICTS.has(value.verdict) ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !HASH.test(value.evidenceSha256) ||
    typeof value.note !== 'string' ||
    value.note.length > 1_000
  ) {
    fail(code);
  }
  if (value.applicability === 'not-visible' && value.verdict !== 'pass') {
    fail(code);
  }
  return Object.freeze({ ...value });
}

function parseCheck(value, expectedCheck) {
  const code = 'PROJECT_ART_AVATAR_FRAME_ASSURANCE_CHECK_INVALID';
  exact(value, ['check', 'observations'], code);
  if (
    value.check !== expectedCheck ||
    !Array.isArray(value.observations) ||
    value.observations.length < 2 ||
    value.observations.length > 8
  ) {
    fail(code);
  }
  const observations = value.observations.map((entry, index) =>
    parseObservation(entry, `${expectedCheck}.observations[${index}]`),
  );
  if (new Set(observations.map((entry) => entry.inspectorId)).size < 2) {
    fail('PROJECT_ART_AVATAR_FRAME_ASSURANCE_INDEPENDENCE_REQUIRED');
  }
  return Object.freeze({ check: expectedCheck, observations: Object.freeze(observations) });
}

export function inspectAvatarFrameAssurance(value, options = {}) {
  const code = 'PROJECT_ART_AVATAR_FRAME_ASSURANCE_INVALID';
  exact(
    value,
    ['schema', 'frameId', 'sourceSha256', 'checks', 'publicationAuthority'],
    code,
  );
  if (
    value.schema !== AVATAR_FRAME_ASSURANCE_SCHEMA ||
    !SAFE_ID.test(value.frameId) ||
    !HASH.test(value.sourceSha256) ||
    value.publicationAuthority !== false ||
    !Array.isArray(value.checks) ||
    value.checks.length !== AVATAR_FRAME_ASSURANCE_CHECKS.length ||
    (options.frameId && value.frameId !== options.frameId) ||
    (options.sourceSha256 && value.sourceSha256 !== options.sourceSha256)
  ) {
    fail(code);
  }

  const checks = value.checks.map((entry, index) =>
    parseCheck(entry, AVATAR_FRAME_ASSURANCE_CHECKS[index]),
  );
  const observations = checks.flatMap((entry) => entry.observations);
  const failed = observations.some((entry) => entry.verdict === 'fail');
  const uncertain = observations.some(
    (entry) => entry.verdict === 'uncertain' || entry.confidence < 0.9,
  );
  const status = failed
    ? 'repair-required'
    : uncertain
      ? 'quarantined'
      : 'review-ready';
  const report = Object.freeze({
    schema: AVATAR_FRAME_ASSURANCE_SCHEMA,
    frameId: value.frameId,
    sourceSha256: value.sourceSha256,
    checks: Object.freeze(checks),
    status,
    candidateApproval: false,
    publicationAuthority: false,
  });
  return Object.freeze({ ...report, reportSha256: fingerprint(report) });
}
