import type { CapabilityDefinition } from "@evavo/art-contracts";

import { CAPABILITY_CATALOG as BASE_CAPABILITY_CATALOG } from "./capabilities.js";
import { VISUAL_CONTINUITY_CAPABILITIES } from "./continuity-capabilities.js";

function assertUniqueCapabilityIds(
  capabilities: readonly CapabilityDefinition[],
): void {
  const found = new Set<string>();
  for (const capability of capabilities) {
    if (found.has(capability.id)) {
      throw new Error(`Duplicate Art Studio capability ID ${capability.id}.`);
    }
    found.add(capability.id);
  }
}

const combined: readonly CapabilityDefinition[] = [
  ...BASE_CAPABILITY_CATALOG,
  ...VISUAL_CONTINUITY_CAPABILITIES,
];
assertUniqueCapabilityIds(combined);

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] =
  Object.freeze(combined);
