import { OperatorGatewayError } from "./operator-server-error";

export type OperatorUpstreamMethod = "GET" | "POST";

export const ALLOWED_UPSTREAM_PATHS = Object.freeze([
  "GET /v1/runtime/jobs",
  "POST /v1/runtime/jobs",
  "GET /v1/runtime/events",
  "POST /v1/runtime/recover",
  "GET /v1/runtime/jobs/:jobId",
  "POST /v1/runtime/jobs/:jobId/:action",
  "GET /v1/artifacts/:artifactId",
  "GET /v1/artifacts/:artifactId/verify",
] as const);

const JOB_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const ACTION = /^(cancel|pause|resume|redrive)$/;

function decodedSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function onlyQueryKeys(url: URL, allowed: ReadonlySet<string>): boolean {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) return false;
  }
  return !url.hash;
}

export function operatorUpstreamPathAllowed(
  upstreamPath: string,
  method: OperatorUpstreamMethod,
): boolean {
  if (!upstreamPath.startsWith("/") || upstreamPath.startsWith("//")) return false;

  let url: URL;
  try {
    url = new URL(upstreamPath, "http://operator.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "http://operator.invalid" || url.username || url.password) {
    return false;
  }

  if (url.pathname === "/v1/runtime/jobs") {
    return method === "POST"
      ? url.search === "" && !url.hash
      : method === "GET" &&
          onlyQueryKeys(url, new Set(["state", "queue", "kind", "limit"]));
  }
  if (url.pathname === "/v1/runtime/events") {
    return method === "GET" && onlyQueryKeys(url, new Set(["after"]));
  }
  if (url.pathname === "/v1/runtime/recover") {
    return method === "POST" && url.search === "" && !url.hash;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "v1" && parts[1] === "runtime" && parts[2] === "jobs") {
    const jobId = parts[3] ? decodedSegment(parts[3]) : null;
    if (!jobId || !JOB_ID.test(jobId) || url.search || url.hash) return false;
    if (parts.length === 4) return method === "GET";
    const action = parts[4] ? decodedSegment(parts[4]) : null;
    return parts.length === 5 && method === "POST" && !!action && ACTION.test(action);
  }

  if (parts[0] === "v1" && parts[1] === "artifacts") {
    const artifactId = parts[2] ? decodedSegment(parts[2]) : null;
    if (!artifactId || !ARTIFACT_ID.test(artifactId) || url.search || url.hash) {
      return false;
    }
    return (
      method === "GET" &&
      (parts.length === 3 || (parts.length === 4 && parts[3] === "verify"))
    );
  }

  return false;
}

export function assertOperatorUpstreamPath(
  upstreamPath: string,
  method: OperatorUpstreamMethod,
): void {
  if (!operatorUpstreamPathAllowed(upstreamPath, method)) {
    throw new OperatorGatewayError(
      "OPERATOR_PATH_INVALID",
      "Operator upstream path or method is not allowed.",
      422,
    );
  }
}
