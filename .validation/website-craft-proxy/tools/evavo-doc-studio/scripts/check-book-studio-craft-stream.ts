import assert from "node:assert/strict";

import { readEvavoBoundedUtf8Body } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream";

function streamChunks(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    }
  });
}

async function main(): Promise<void> {
  const tinyChunkCount = 16_384;
  const tinyChunks = Array.from({ length: tinyChunkCount }, () => new Uint8Array([97]));
  const manyTinyChunks = await readEvavoBoundedUtf8Body({
    body: streamChunks(tinyChunks),
    declaredLength: String(tinyChunkCount),
    maximumBytes: tinyChunkCount,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(manyTinyChunks.length, tinyChunkCount);
  assert.equal(manyTinyChunks, "a".repeat(tinyChunkCount));

  const tinyAgainstHugeLimit = await readEvavoBoundedUtf8Body({
    body: streamChunks([new Uint8Array([122])]),
    declaredLength: "1",
    maximumBytes: 2 ** 40,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(tinyAgainstHugeLimit, "z", "A one-byte body must not allocate the configured maximum eagerly.");

  const growthSource = "growth-".repeat(32_768);
  const growthBytes = new TextEncoder().encode(growthSource);
  const grown = await readEvavoBoundedUtf8Body({
    body: streamChunks([
      growthBytes.subarray(0, 70_000),
      growthBytes.subarray(70_000, 170_000),
      growthBytes.subarray(170_000)
    ]),
    declaredLength: null,
    maximumBytes: growthBytes.byteLength,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(grown, growthSource);

  const understatedButBounded = await readEvavoBoundedUtf8Body({
    body: streamChunks([new TextEncoder().encode("decoded-body-can-exceed-transport-hint")]),
    declaredLength: "1",
    maximumBytes: 128,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(understatedButBounded, "decoded-body-can-exceed-transport-hint");

  const exactBoundary = await readEvavoBoundedUtf8Body({
    body: streamChunks([new TextEncoder().encode("exact-boundary")]),
    declaredLength: "14",
    maximumBytes: 14,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(exactBoundary, "exact-boundary");

  let overflowCancelled = false;
  await assert.rejects(
    readEvavoBoundedUtf8Body({
      body: streamChunks([new Uint8Array(16), new Uint8Array(17)], () => { overflowCancelled = true; }),
      declaredLength: "2",
      maximumBytes: 32,
      tooLarge: () => new Error("STREAM_TOO_LARGE"),
      invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
    }),
    /STREAM_TOO_LARGE/
  );
  assert.equal(overflowCancelled, true);

  let stalledCancellationRequested = false;
  const stalledCancellationBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
    },
    cancel() {
      stalledCancellationRequested = true;
      return new Promise<void>(() => undefined);
    }
  });
  await Promise.race([
    assert.rejects(
      readEvavoBoundedUtf8Body({
        body: stalledCancellationBody,
        declaredLength: null,
        maximumBytes: 1,
        tooLarge: () => new Error("STREAM_TOO_LARGE"),
        invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
      }),
      /STREAM_TOO_LARGE/
    ),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("STREAM_CANCELLATION_BLOCKED_REJECTION")), 250);
    })
  ]);
  assert.equal(stalledCancellationRequested, true);

  await assert.rejects(
    readEvavoBoundedUtf8Body({
      body: streamChunks([new Uint8Array([0xff])]),
      declaredLength: "1",
      maximumBytes: 1,
      tooLarge: () => new Error("STREAM_TOO_LARGE"),
      invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
    }),
    /STREAM_INVALID_UTF8/
  );

  await assert.rejects(
    readEvavoBoundedUtf8Body({
      body: streamChunks([new Uint8Array([1])]),
      declaredLength: "not-a-number",
      maximumBytes: 1,
      tooLarge: () => new Error("STREAM_TOO_LARGE"),
      invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
    }),
    /STREAM_TOO_LARGE/
  );

  await assert.rejects(
    readEvavoBoundedUtf8Body({
      body: streamChunks([new Uint8Array([1])]),
      declaredLength: null,
      maximumBytes: Number.MAX_SAFE_INTEGER + 1,
      tooLarge: () => new Error("STREAM_TOO_LARGE"),
      invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
    }),
    /BOOK_CRAFT_STREAM_BOUND_INVALID/
  );

  assert.equal(await readEvavoBoundedUtf8Body({
    body: null,
    declaredLength: "0",
    maximumBytes: 1,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  }), "");

  console.log(JSON.stringify({
    status: "PASS",
    tinyChunkCount,
    adaptiveBufferGrowth: true,
    eagerMaximumAllocationAvoided: true,
    exactBoundaryAccepted: true,
    actualOverflowCancelled: true,
    cancellationCannotDelayDeterministicRejection: true,
    decodedBodyMayExceedDeclaredTransportHintWithinBound: true,
    strictUtf8Required: true,
    invalidBoundsRejected: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
