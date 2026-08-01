import { SpriteSupervisorError, type NormalizedSpriteSupervisorCompileRequest } from "./types.js";

const CHILD_KIND_QUEUE: Readonly<Record<string, "provider" | "media" | "selection">> = Object.freeze({
  "art.candidate.generate": "provider",
  "art.candidate.edit": "provider",
  "art.candidate.inpaint": "provider",
  "art.candidate.master-alpha": "media",
  "art.candidate.select": "selection",
  "art.candidate.promote": "selection",
  "art.repair.plan": "selection",
  "art.repair.execute-provider-canvas": "provider",
  "art.repair.revise-family": "selection",
  "art.repair.prepare-revision-selection": "selection",
  "art.repair.rank-revisions": "selection",
  "art.repair.promote-revision": "selection",
  "sprite.family.verify": "selection",
  "sprite.atlas.build": "media",
});

export function canonicalSpriteSupervisorQueue(kind: string): string | null {
  return CHILD_KIND_QUEUE[kind] ?? null;
}

export function assertSpriteSupervisorQueuePolicy(
  request: NormalizedSpriteSupervisorCompileRequest,
): void {
  for (const task of request.tasks) {
    const expected = canonicalSpriteSupervisorQueue(task.kind);
    if (!expected) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_CHILD_KIND_REJECTED",
        `No canonical queue is registered for child kind ${task.kind}.`,
      );
    }
    if (task.queue !== expected) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_QUEUE_MISMATCH",
        `Task ${task.id} uses queue ${task.queue}; ${task.kind} must use ${expected}.`,
        {
          taskId: task.id,
          kind: task.kind,
          suppliedQueue: task.queue,
          expectedQueue: expected,
        },
      );
    }
  }
}
