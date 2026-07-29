import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const OPERATOR_SESSION_COOKIE = "evavo_art_operator" as const;
export const OPERATOR_SESSION_VERSION = "1" as const;

const MINIMUM_SECRET_BYTES = 32;
const DEFAULT_SESSION_SECONDS = 8 * 60 * 60;
const MAXIMUM_SESSION_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

type Environment = Readonly<Record<string, string | undefined>>;

export interface OperatorSessionClaims {
  readonly version: typeof OPERATOR_SESSION_VERSION;
  readonly subject: "owner";
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly sessionId: string;
}

export interface OperatorAuthConfiguration {
  readonly configured: boolean;
  readonly accessToken?: string;
  readonly sessionSecret?: string;
  readonly sessionSeconds: number;
}

function secret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const bytes = Buffer.byteLength(normalized, "utf8");
  return bytes >= MINIMUM_SECRET_BYTES && bytes <= 4_096
    ? normalized
    : undefined;
}

function sessionSeconds(value: string | undefined): number {
  if (!value) return DEFAULT_SESSION_SECONDS;
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 15 * 60 ||
    parsed > MAXIMUM_SESSION_SECONDS
  ) {
    return DEFAULT_SESSION_SECONDS;
  }
  return parsed;
}

export function operatorAuthConfiguration(
  environment: Environment = process.env,
): OperatorAuthConfiguration {
  const accessToken = secret(environment.EVAVO_ART_OPERATOR_ACCESS_TOKEN);
  const sessionSecret = secret(environment.EVAVO_ART_OPERATOR_SESSION_SECRET);
  return {
    configured: accessToken !== undefined && sessionSecret !== undefined,
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(sessionSecret === undefined ? {} : { sessionSecret }),
    sessionSeconds: sessionSeconds(environment.EVAVO_ART_OPERATOR_SESSION_SECONDS),
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function operatorAccessTokenMatches(
  supplied: string,
  configuration = operatorAuthConfiguration(),
): boolean {
  if (!configuration.accessToken) return false;
  const normalized = supplied.trim();
  if (!normalized) return false;
  return timingSafeEqual(digest(normalized), digest(configuration.accessToken));
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(payload: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret)
    .update(payload, "utf8")
    .digest("base64url");
}

function signatureMatches(
  payload: string,
  supplied: string,
  sessionSecret: string,
): boolean {
  const expected = Buffer.from(signature(payload, sessionSecret), "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function claims(value: unknown): OperatorSessionClaims | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== OPERATOR_SESSION_VERSION ||
    record.subject !== "owner" ||
    typeof record.issuedAt !== "number" ||
    !Number.isInteger(record.issuedAt) ||
    typeof record.expiresAt !== "number" ||
    !Number.isInteger(record.expiresAt) ||
    typeof record.sessionId !== "string" ||
    !/^[a-f0-9]{32}$/.test(record.sessionId)
  ) {
    return null;
  }
  return {
    version: OPERATOR_SESSION_VERSION,
    subject: "owner",
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    sessionId: record.sessionId,
  };
}

export function createOperatorSession(
  now = new Date(),
  configuration = operatorAuthConfiguration(),
): Readonly<{ token: string; claims: OperatorSessionClaims; maxAge: number }> {
  if (!configuration.configured || !configuration.sessionSecret) {
    throw new Error(
      "Operator sessions require EVAVO_ART_OPERATOR_ACCESS_TOKEN and EVAVO_ART_OPERATOR_SESSION_SECRET of at least 32 bytes.",
    );
  }
  const issuedAt = Math.floor(now.getTime() / 1_000);
  if (!Number.isFinite(issuedAt)) throw new Error("Operator session time is invalid.");
  const sessionClaims: OperatorSessionClaims = {
    version: OPERATOR_SESSION_VERSION,
    subject: "owner",
    issuedAt,
    expiresAt: issuedAt + configuration.sessionSeconds,
    sessionId: randomUUID().replaceAll("-", ""),
  };
  const payload = encode(sessionClaims);
  return {
    token: `${payload}.${signature(payload, configuration.sessionSecret)}`,
    claims: sessionClaims,
    maxAge: configuration.sessionSeconds,
  };
}

export function verifyOperatorSession(
  token: string | undefined,
  now = new Date(),
  configuration = operatorAuthConfiguration(),
): OperatorSessionClaims | null {
  if (!configuration.configured || !configuration.sessionSecret || !token) {
    return null;
  }
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  if (!signatureMatches(payload, suppliedSignature, configuration.sessionSecret)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
  const sessionClaims = claims(parsed);
  if (!sessionClaims) return null;
  const current = Math.floor(now.getTime() / 1_000);
  if (!Number.isFinite(current)) return null;
  if (sessionClaims.issuedAt > current + CLOCK_SKEW_SECONDS) return null;
  if (sessionClaims.expiresAt <= current) return null;
  if (sessionClaims.expiresAt - sessionClaims.issuedAt > MAXIMUM_SESSION_SECONDS) {
    return null;
  }
  return sessionClaims;
}
