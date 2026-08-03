declare module "server-only";

declare module "next/server" {
  export class NextRequest extends Request {}
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): Response;
  }
}
