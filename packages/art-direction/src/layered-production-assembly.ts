import { freeze } from "./layered-production-internal.js";
import {
  LAYERED_ASSEMBLY_MANIFEST_KIND,
  LAYERED_ASSEMBLY_PROTOCOL_VERSION,
  LAYERED_ASSEMBLY_REQUEST_KIND,
} from "./layered-production-assembly-types.js";

export { compileLayeredAssemblyManifest } from "./layered-production-assembly-compiler.js";
export { verifyLayeredAssemblyManifest } from "./layered-production-assembly-verification.js";

export function layeredAssemblyProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: LAYERED_ASSEMBLY_PROTOCOL_VERSION,
    requestKind: LAYERED_ASSEMBLY_REQUEST_KIND,
    manifestKind: LAYERED_ASSEMBLY_MANIFEST_KIND,
    scopes: ["style-proof-review", "runtime-candidate"] as const,
    rules: freeze([
      "compile from an exact self-hashed layered-production plan rather than a flattened concept image",
      "bind every retained source to one plan unit, artifact SHA-256, byte count, dimensions and alpha policy",
      "keep style-proof composites candidate-only until exact source approvals exist",
      "validate district bounds, layer order, full-canvas placement, Y-sort, animation geometry and foreground occlusion",
      "model route nodes, travel edges, destinations and scene bindings as data rather than reading gameplay from pixels",
      "retain overview, journey-follow and destination-close integer-zoom camera contracts",
      "emit self-hashed manifests only; never execute a provider, mutate image bytes, assemble a scene or promote art automatically",
    ]),
    authority: freeze({
      providerExecution: false as const,
      creativeApproval: false as const,
      imageMutation: false as const,
      automaticAssembly: false as const,
      automaticPromotion: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  });
}
