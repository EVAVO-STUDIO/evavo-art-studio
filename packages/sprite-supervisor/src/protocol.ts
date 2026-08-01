import { SPRITE_SUPERVISOR_PROTOCOL_VERSION } from "./types.js";

export function spriteSupervisorProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: SPRITE_SUPERVISOR_PROTOCOL_VERSION,
    purpose:
      "Run a compiled sprite-production workflow as bounded durable child jobs, observe immutable artifacts and failures, redrive transient work, route authorised repair tasks, stop for human review when evidence is ambiguous, and emit release evidence only after required work passes.",
    placeholderRules: [
      '{"$artifact":"role"} resolves exactly one immutable artifact binding.',
      '{"$artifacts":"role"} resolves every immutable artifact bound to a role.',
      '{"$plan":"/json/pointer"} resolves a value from the verified compiled sprite plan.',
      '{"$run":"runId|tick|taskId|taskCycle|workflowSha256"} resolves supervisor context.',
    ],
    schedulingRules: [
      "Normal tasks start only after every declared dependency succeeds or is deliberately skipped.",
      "Repair tasks start only when their declared source task enters repairing state.",
      "Child idempotency keys include the run, task and repair cycle so repeated ticks converge.",
      "A supervisor tick schedules at most the configured number of active child jobs.",
      "Dormant failure-triggered repair tasks are not counted as active until a child job is actually submitted.",
      "Every tick writes immutable state evidence and advances a compare-and-swap named reference.",
      "Concurrent state-reference conflicts remain transient and are retried against the newest immutable state.",
    ],
    failureRules: [
      "Transient, lease-expired and timeout failures are redriven only inside a bounded budget.",
      "Explicit abort rules take precedence over retry or repair.",
      "A configured repair task may run only inside its bounded repair-cycle budget.",
      "Unknown or exhausted failures become review-required by default rather than looping indefinitely.",
      "Required tasks cannot be skipped through review resolution.",
      "Quality thresholds and verification gates cannot be disabled or relaxed through supervisor input.",
    ],
    reviewRules: [
      "Every review command has a unique resolutionId and is bound to one exact expectedStateTick.",
      "A repeated identical resolution is idempotent; reuse of its ID with different content is rejected.",
      "Task retry, skip or abort commands are accepted only while that exact task is review-required.",
      "Final release approval is accepted only after every required task succeeds and no child job remains active.",
      "The stable workflow identity excludes review commands, while each review submission receives its own request SHA-256 and root-job idempotency key.",
    ],
    releaseRules: [
      "Every required task must succeed.",
      "Every required release artifact role must be bound to verified immutable content.",
      "Artifacts labelled qualityState=rejected are release blockers.",
      "Optional final human approval is recorded with resolution ID, expected state tick, approver, reason and time.",
      "The supervisor does not invent provider credentials, bypass promotion, execute a shell or deploy a project.",
    ],
    childJobKinds: [
      "art.candidate.generate",
      "art.candidate.edit",
      "art.candidate.inpaint",
      "art.candidate.master-alpha",
      "art.candidate.select",
      "art.candidate.promote",
      "art.repair.plan",
      "art.repair.execute-provider-canvas",
      "art.repair.revise-family",
      "art.repair.prepare-revision-selection",
      "art.repair.rank-revisions",
      "art.repair.promote-revision",
      "sprite.family.verify",
      "sprite.atlas.build",
    ],
    executionBoundary:
      "REST and MCP validate and compile workflows only. Explicit CLI submission or an authenticated runtime operation starts the root supervisor job. Provider and promotion authority remains inside the child workers that already enforce their own contracts.",
  };
}
