import {
  PermanentRuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
  type RuntimeRepository,
} from "@evavo/art-runtime";
import {
  SpriteSupervisorError,
  compileSpriteSupervisorWorkflow,
} from "@evavo/art-sprite-supervisor";

import {
  createSpriteSupervisorHandlers as createBaseSpriteSupervisorHandlers,
  spriteSupervisorWorkerCapabilities,
} from "./sprite-supervisor-handlers.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function verifyPayloadRequestHash(
  context: Parameters<RuntimeJobHandler>[0],
): void {
  const payload = context.job.spec.payload;
  if (!isRecord(payload) || payload.schemaVersion !== "1.0") return;
  try {
    const workflow = compileSpriteSupervisorWorkflow(payload.request);
    const supplied = payload.requestSha256;
    const rootTick = context.job.spec.labels.supervisorTick === "0";
    if (rootTick && typeof supplied !== "string") {
      throw new PermanentRuntimeError(
        "SPRITE_SUPERVISOR_REQUEST_HASH_MISSING",
        "Root supervisor jobs must carry the exact compiled request SHA-256.",
      );
    }
    if (supplied !== undefined && supplied !== workflow.requestSha256) {
      throw new PermanentRuntimeError(
        "SPRITE_SUPERVISOR_REQUEST_HASH_MISMATCH",
        "Supervisor payload does not match its declared request SHA-256.",
      );
    }
  } catch (error: unknown) {
    if (error instanceof PermanentRuntimeError) throw error;
    if (error instanceof SpriteSupervisorError) {
      throw new PermanentRuntimeError(error.code, error.message, error.details);
    }
    throw error;
  }
}

export function createSpriteSupervisorHandlers(
  runtime: RuntimeRepository,
): Readonly<Record<string, RuntimeJobHandler>> {
  const base = createBaseSpriteSupervisorHandlers(runtime);
  const handler = base["art.sprite-production.supervise"];
  if (!handler) {
    throw new Error("Base sprite supervisor handler is not registered.");
  }
  const guarded: RuntimeJobHandler = async (context) => {
    verifyPayloadRequestHash(context);
    try {
      return await handler(context);
    } catch (error: unknown) {
      if (
        error instanceof PermanentRuntimeError &&
        error.code === "SPRITE_SUPERVISOR_STATE_CONFLICT"
      ) {
        throw new TransientRuntimeError(
          error.code,
          error.message,
          error.details,
        );
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.sprite-production.supervise": guarded,
  });
}

export { spriteSupervisorWorkerCapabilities };
