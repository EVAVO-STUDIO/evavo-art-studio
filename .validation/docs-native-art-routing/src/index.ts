export * from "./book-studio-autopilot-routing.ts";

import {
  canonicalBookJson as canonicalBookJsonInternal,
  sha256BookText as sha256BookTextInternal,
} from "./book-studio-project-contracts.ts";

export function canonicalBookJson(value: unknown): string {
  return canonicalBookJsonInternal(value);
}

export async function sha256BookText(value: string): Promise<string> {
  return sha256BookTextInternal(value);
}
