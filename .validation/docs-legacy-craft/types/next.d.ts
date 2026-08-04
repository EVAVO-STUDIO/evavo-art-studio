declare module "server-only";

declare module "next/server" {
  export class NextRequest {
    headers: Headers;
    text(): Promise<string>;
  }

  export class NextResponse {
    static json<T>(body: T, init?: ResponseInit): Response;
  }
}
