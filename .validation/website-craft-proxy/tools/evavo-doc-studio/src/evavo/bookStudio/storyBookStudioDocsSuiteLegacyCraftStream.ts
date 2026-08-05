export interface EvavoBoundedUtf8BodyInput {
  body: ReadableStream<Uint8Array> | null;
  declaredLength: string | null;
  maximumBytes: number;
  tooLarge: () => Error;
  invalidEncoding: () => Error;
}

export async function readEvavoBoundedUtf8Body(
  input: EvavoBoundedUtf8BodyInput,
): Promise<string> {
  if (!Number.isInteger(input.maximumBytes) || input.maximumBytes < 1) {
    throw new Error("BOOK_CRAFT_STREAM_BOUND_INVALID");
  }

  if (input.declaredLength !== null) {
    const declared = input.declaredLength.trim();
    if (!/^\d+$/.test(declared) || Number(declared) > input.maximumBytes) {
      throw input.tooLarge();
    }
  }

  if (!input.body) return "";

  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      totalBytes += value.byteLength;
      if (totalBytes > input.maximumBytes) {
        try {
          await reader.cancel("bounded-body-limit-exceeded");
        } catch {
          // The deterministic size error remains authoritative even if cancellation fails.
        }
        throw input.tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw input.invalidEncoding();
  }
}
