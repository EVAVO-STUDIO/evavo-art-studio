export interface EvavoBoundedUtf8BodyInput {
  body: ReadableStream<Uint8Array> | null;
  declaredLength: string | null;
  maximumBytes: number;
  tooLarge: () => Error;
  invalidEncoding: () => Error;
}

const DEFAULT_INITIAL_BUFFER_BYTES = 64 * 1024;

function readDeclaredLength(input: EvavoBoundedUtf8BodyInput): number | undefined {
  if (input.declaredLength === null) return undefined;
  const declared = input.declaredLength.trim();
  if (!/^\d+$/.test(declared)) throw input.tooLarge();
  const parsed = Number(declared);
  if (!Number.isSafeInteger(parsed) || parsed > input.maximumBytes) throw input.tooLarge();
  return parsed;
}

function initialCapacity(maximumBytes: number, declaredLength: number | undefined): number {
  return Math.max(
    1,
    Math.min(maximumBytes, declaredLength ?? DEFAULT_INITIAL_BUFFER_BYTES, DEFAULT_INITIAL_BUFFER_BYTES),
  );
}

function growBuffer(
  current: Uint8Array,
  populatedBytes: number,
  requiredBytes: number,
  maximumBytes: number,
): Uint8Array {
  if (requiredBytes <= current.byteLength) return current;
  let nextCapacity = current.byteLength;
  while (nextCapacity < requiredBytes) {
    const doubled = nextCapacity <= Math.floor(maximumBytes / 2)
      ? nextCapacity * 2
      : maximumBytes;
    nextCapacity = Math.min(maximumBytes, Math.max(requiredBytes, doubled));
  }
  const grown = new Uint8Array(nextCapacity);
  grown.set(current.subarray(0, populatedBytes));
  return grown;
}

function requestReaderCancellation(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): void {
  try {
    void reader.cancel(reason).catch(() => undefined);
  } catch {
    // The deterministic caller-facing error remains authoritative if cancellation fails.
  }
}

export async function readEvavoBoundedUtf8Body(
  input: EvavoBoundedUtf8BodyInput,
): Promise<string> {
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) {
    throw new Error("BOOK_CRAFT_STREAM_BOUND_INVALID");
  }

  const declaredLength = readDeclaredLength(input);
  if (!input.body) return "";

  const reader = input.body.getReader();
  let buffer = new Uint8Array(initialCapacity(input.maximumBytes, declaredLength));
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
      if (!(value instanceof Uint8Array)) {
        requestReaderCancellation(reader, "bounded-body-chunk-invalid");
        throw new Error("BOOK_CRAFT_STREAM_CHUNK_INVALID");
      }
      if (value.byteLength > input.maximumBytes - totalBytes) {
        requestReaderCancellation(reader, "bounded-body-limit-exceeded");
        throw input.tooLarge();
      }
      const nextTotal = totalBytes + value.byteLength;
      buffer = growBuffer(buffer, totalBytes, nextTotal, input.maximumBytes);
      buffer.set(value, totalBytes);
      totalBytes = nextTotal;
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, totalBytes));
  } catch {
    throw input.invalidEncoding();
  }
}
