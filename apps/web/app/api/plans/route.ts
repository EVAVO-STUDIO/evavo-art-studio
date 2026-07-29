
import { validateArtBrief } from "@evavo/art-contracts";
import { createProductionPlan } from "@evavo/art-core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const validation = validateArtBrief(input);
  if (!validation.success) {
    return NextResponse.json({ error: { code: "INVALID_ART_BRIEF", issues: validation.issues } }, { status: 422 });
  }

  return NextResponse.json(createProductionPlan(validation.value), {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}
