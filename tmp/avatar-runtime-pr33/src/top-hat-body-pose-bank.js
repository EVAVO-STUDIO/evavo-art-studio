// Validation-only dependency fixture matching current Top Hat pose-bank truth.
export function inspectTopHatBodyPoseBank() {
  return Object.freeze({
    admittedPoseCount: 3,
    missingPoseSlotIds: Object.freeze([
      "blink-closed",
      "listening-attentive",
      "thinking-reflective",
      "speech-neutral",
      "presentation-open",
      "presentation-emphasis",
    ]),
    fallbackClipIds: Object.freeze([
      "blink-closed",
      "listening-attentive",
      "thinking-reflective",
      "speech-neutral",
      "presentation-open",
      "presentation-emphasis",
    ]),
    expandedPerformanceReady: false,
  });
}
