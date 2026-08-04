declare module "server-only";

declare module "next/server" {
  export class NextRequest {
    headers: Headers;
    text(): Promise<string>;
  }
  export class NextResponse {
    static json(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ): unknown;
  }
}
