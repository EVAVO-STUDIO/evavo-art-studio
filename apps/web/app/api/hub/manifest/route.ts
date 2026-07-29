
import { NextResponse } from "next/server";

const manifest = Object.freeze({
  schemaVersion: "1.0",
  key: "art-studio",
  label: "EVAVO Art Studio",
  shortLabel: "AS",
  moduleId: "art-production-workspace",
  status: "preview",
  accent: "#ff244e",
  deployment: {
    strategy: "federated-candidate",
    repositoryFullName: "EVAVO-STUDIO/evavo-art-studio",
    recommendedHost: "art.evavo.com.au",
    requiresSignedLaunch: true,
  },
});

export function GET(): NextResponse {
  return NextResponse.json(manifest, { headers: { "cache-control": "public, max-age=300" } });
}
