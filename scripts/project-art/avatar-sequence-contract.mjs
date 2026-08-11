import {
  AUTHORITY_KEYS,
  AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
  CLIP_KINDS,
  LOOP_MODES,
  LIMITS,
  MAXIMUM_IMAGE_DIMENSION,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  REVIEW_DISCIPLINES,
  boundedInteger,
  canonicalJson,
  exactKeys,
  fail,
  finiteNumber,
  hashBytes,
  identifier,
  isRecord,
} from './avatar-sequence-common.mjs';

function falseAuthority(keys) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

function parseAuthority(value) {
  exactKeys(
    value,
    AUTHORITY_KEYS,
    'authority',
    'PROJECT_ART_AVATAR_SEQUENCE_AUTHORITY_INVALID',
  );
  for (const key of AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_AUTHORITY_INVALID',
        `authority.${key} must remain false.`,
      );
    }
  }
  return falseAuthority(AUTHORITY_KEYS);
}

function parseCanvas(value) {
  exactKeys(value, ['width', 'height', 'requireAlpha'], 'canvas');
  const width = boundedInteger(value.width, 'canvas.width', 1, MAXIMUM_IMAGE_DIMENSION);
  const height = boundedInteger(value.height, 'canvas.height', 1, MAXIMUM_IMAGE_DIMENSION);
  if (width * height > LIMITS.maximumDecodedPixels || value.requireAlpha !== true) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_CANVAS_INVALID',
      'Avatar sequence canvas must fit the decoded-image boundary and require alpha.',
    );
  }
  return Object.freeze({ width, height, requireAlpha: true });
}

function parseThresholds(value, label) {
  exactKeys(
    value,
    [
      'maximumChangedFraction',
      'maximumMeanChannelDelta',
      'maximumAlphaChangedFraction',
      'maximumCentroidShiftPixels',
    ],
    label,
  );
  return Object.freeze({
    maximumChangedFraction: finiteNumber(
      value.maximumChangedFraction,
      `${label}.maximumChangedFraction`,
      0,
      1,
    ),
    maximumMeanChannelDelta: finiteNumber(
      value.maximumMeanChannelDelta,
      `${label}.maximumMeanChannelDelta`,
      0,
      255,
    ),
    maximumAlphaChangedFraction: finiteNumber(
      value.maximumAlphaChangedFraction,
      `${label}.maximumAlphaChangedFraction`,
      0,
      1,
    ),
    maximumCentroidShiftPixels: finiteNumber(
      value.maximumCentroidShiftPixels,
      `${label}.maximumCentroidShiftPixels`,
      0,
      1_000_000,
    ),
  });
}

function parseMap(value, clipIds, label) {
  if (!isRecord(value) || Object.keys(value).length > LIMITS.maximumMapEntries) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_DEFAULTS_INVALID', `${label} is invalid.`);
  }
  const output = {};
  for (const [key, rawClipId] of Object.entries(value)) {
    const canonicalKey = identifier(key, `${label}.${key}`);
    const clipId = identifier(rawClipId, `${label}.${key}`);
    if (!clipIds.has(clipId)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_DEFAULT_CLIP_MISSING',
        `${label}.${canonicalKey} refers to an unknown clip.`,
      );
    }
    output[canonicalKey] = clipId;
  }
  return Object.freeze(output);
}

function parseDefaults(value, clips, clipIds) {
  exactKeys(value, ['idleClipId', 'talk', 'presence', 'events', 'emotions'], 'defaults');
  exactKeys(
    value.talk,
    ['inClipId', 'loopClipId', 'outClipId'],
    'defaults.talk',
  );
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const idleClipId = identifier(value.idleClipId, 'defaults.idleClipId');
  const talk = Object.freeze({
    inClipId: identifier(value.talk.inClipId, 'defaults.talk.inClipId'),
    loopClipId: identifier(value.talk.loopClipId, 'defaults.talk.loopClipId'),
    outClipId: identifier(value.talk.outClipId, 'defaults.talk.outClipId'),
  });
  for (const clipId of [idleClipId, ...Object.values(talk)]) {
    if (!clipIds.has(clipId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_DEFAULT_CLIP_MISSING');
    }
  }
  if (
    byId.get(idleClipId)?.kind !== 'idle' ||
    byId.get(idleClipId)?.loopMode !== 'loop' ||
    byId.get(talk.inClipId)?.kind !== 'talk-in' ||
    byId.get(talk.inClipId)?.loopMode !== 'once' ||
    byId.get(talk.loopClipId)?.kind !== 'talk-loop' ||
    byId.get(talk.loopClipId)?.loopMode !== 'loop' ||
    byId.get(talk.outClipId)?.kind !== 'talk-out' ||
    byId.get(talk.outClipId)?.loopMode !== 'once'
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_DEFAULT_CLIP_KIND_INVALID',
      'Idle and talk defaults must retain exact runtime kinds and loop modes.',
    );
  }
  return Object.freeze({
    idleClipId,
    talk,
    presence: parseMap(value.presence, clipIds, 'defaults.presence'),
    events: parseMap(value.events, clipIds, 'defaults.events'),
    emotions: parseMap(value.emotions, clipIds, 'defaults.emotions'),
  });
}

function loopReviewId(assignmentId, clipId) {
  return `loop-${hashBytes(Buffer.from(`${assignmentId}:${clipId}`, 'utf8')).slice(0, 24)}`;
}

function parseClips(value, framesById, assignmentId, characterId, canvas, loopAuthority) {
  if (!Array.isArray(value) || value.length < 4 || value.length > LIMITS.maximumClips) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_CLIPS_INVALID',
      `clips must contain 4-${LIMITS.maximumClips} entries.`,
    );
  }
  const clipIds = new Set();
  const clips = [];
  const loopClosureRequests = [];
  for (const [clipIndex, clip] of value.entries()) {
    exactKeys(
      clip,
      [
        'id',
        'kind',
        'loopMode',
        'frames',
        'neutralFrameId',
        'emotion',
        'loopThresholds',
      ],
      `clips[${clipIndex}]`,
    );
    const id = identifier(clip.id, `clips[${clipIndex}].id`);
    if (clipIds.has(id)) fail('PROJECT_ART_AVATAR_SEQUENCE_CLIP_ID_DUPLICATE');
    clipIds.add(id);
    if (!CLIP_KINDS.includes(clip.kind)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_CLIP_KIND_INVALID');
    }
    if (!LOOP_MODES.includes(clip.loopMode)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_LOOP_MODE_INVALID');
    }
    if (
      !Array.isArray(clip.frames) ||
      clip.frames.length < 1 ||
      clip.frames.length > LIMITS.maximumFramesPerClip
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_CLIP_FRAMES_INVALID');
    }
    const parsedFrames = clip.frames.map((entry, frameIndex) => {
      exactKeys(
        entry,
        ['frameId', 'durationMs'],
        `clips[${clipIndex}].frames[${frameIndex}]`,
      );
      const frameId = identifier(
        entry.frameId,
        `clips[${clipIndex}].frames[${frameIndex}].frameId`,
      );
      if (!framesById.has(frameId)) {
        fail('PROJECT_ART_AVATAR_SEQUENCE_CLIP_FRAME_MISSING');
      }
      return Object.freeze({
        frameId,
        durationMs: boundedInteger(
          entry.durationMs,
          `clips[${clipIndex}].frames[${frameIndex}].durationMs`,
          16,
          2000,
        ),
      });
    });
    const neutralFrameId = identifier(
      clip.neutralFrameId,
      `clips[${clipIndex}].neutralFrameId`,
    );
    if (!parsedFrames.some((entry) => entry.frameId === neutralFrameId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_NEUTRAL_FRAME_INVALID');
    }
    const emotion =
      clip.emotion === null
        ? null
        : identifier(clip.emotion, `clips[${clipIndex}].emotion`);
    let loopThresholds = null;
    if (clip.loopMode === 'loop') {
      if (parsedFrames.length < 2) {
        fail('PROJECT_ART_AVATAR_SEQUENCE_LOOP_FRAME_COUNT_INVALID');
      }
      const uniqueFrameIds = new Set(parsedFrames.map((entry) => entry.frameId));
      if (uniqueFrameIds.size !== parsedFrames.length) {
        fail(
          'PROJECT_ART_AVATAR_SEQUENCE_LOOP_FRAME_DUPLICATE',
          'True loop clips must use one path per ordered seam input; reuse belongs in non-wrap clips.',
        );
      }
      loopThresholds = parseThresholds(
        clip.loopThresholds,
        `clips[${clipIndex}].loopThresholds`,
      );
    } else if (clip.loopThresholds !== null) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_FALSE_WRAP_REQUIREMENT',
        'once and ping-pong clips must not carry final-to-first thresholds.',
      );
    }
    const durationMs = parsedFrames.reduce(
      (total, entry) => total + entry.durationMs,
      0,
    );
    const parsedClip = Object.freeze({
      id,
      kind: clip.kind,
      loopMode: clip.loopMode,
      frames: Object.freeze(parsedFrames),
      neutralFrameId,
      emotion,
      durationMs,
    });
    clips.push(parsedClip);
    if (clip.loopMode === 'loop') {
      const loopRequest = Object.freeze({
        schema: PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
        reviewId: loopReviewId(assignmentId, id),
        projectId: characterId,
        purpose: `Validate the final-to-first seam for explicitly assigned clip ${id}.`,
        frames: Object.freeze(
          parsedFrames.map((entry) => {
            const frame = framesById.get(entry.frameId);
            return Object.freeze({
              path: frame.path,
              expectedSha256: frame.sha256,
            });
          }),
        ),
        expected: Object.freeze({
          width: canvas.width,
          height: canvas.height,
          requireAlpha: true,
        }),
        thresholds: loopThresholds,
        preview: Object.freeze({
          difference: true,
          overlay: true,
          onionSkin: true,
        }),
        authority: loopAuthority,
      });
      loopClosureRequests.push(
        Object.freeze({
          clipId: id,
          request: loopRequest,
          requestCanonicalSha256: hashBytes(
            Buffer.from(canonicalJson(loopRequest), 'utf8'),
          ),
        }),
      );
    }
  }
  return Object.freeze({
    clips: Object.freeze(clips),
    clipIds,
    loopClosureRequests: Object.freeze(loopClosureRequests),
  });
}


export {
  falseAuthority,
  parseAuthority,
  parseCanvas,
  parseClips,
  parseDefaults,
};
