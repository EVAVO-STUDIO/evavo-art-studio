export class NextRequest {
  readonly headers: Headers;
  readonly #source: string;

  constructor(source = "", headers: HeadersInit = {}) {
    this.#source = source;
    this.headers = new Headers(headers);
  }

  async text(): Promise<string> {
    return this.#source;
  }
}

class JsonResponse<T> {
  readonly status: number;
  readonly headers: Headers;
  readonly #body: T;

  constructor(body: T, init: { status?: number; headers?: HeadersInit } = {}) {
    this.#body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers);
  }

  async json(): Promise<T> {
    return this.#body;
  }
}

export class NextResponse {
  static json<T>(
    body: T,
    init: { status?: number; headers?: HeadersInit } = {},
  ): JsonResponse<T> {
    return new JsonResponse(body, init);
  }
}
