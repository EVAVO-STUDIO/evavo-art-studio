export class NextRequest extends Request {}

export class NextResponse<T = unknown> extends Response {
  static json<T>(value: T, init?: ResponseInit): NextResponse<T>;
}
