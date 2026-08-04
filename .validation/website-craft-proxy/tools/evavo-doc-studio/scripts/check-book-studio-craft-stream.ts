import assert from "node:assert/strict";

import { readEvavoBoundedUtf8Body } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream";

function streamChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
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

  const exactBoundary = await readEvavoBoundedUtf8Body({
    body: streamChunks([new TextEncoder().encode("exact-boundary")]),
    declaredLength: "14",
    maximumBytes: 14,
    tooLarge: () => new Error("STREAM_TOO_LARGE"),
    invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
  });
  assert.equal(exactBoundary, "exact-boundary");

  await assert.rejects(
    readEvavoBoundedUtf8Body({
      body: streamChunks([new Uint8Array(16), new Uint8Array(17)]),
      declaredLength: "2",
      maximumBytes: 32,
      tooLarge: () => new Error("STREAM_TOO_LARGE"),
      invalidEncoding: () => new Error("STREAM_INVALID_UTF8")
    }),
    /STREAM_TOO_LARGE/
  );

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
      maximumBytes: 0,
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
    boundedAssemblyBuffer: true,
    exactBoundaryAccepted: true,
    dishonestDeclaredLengthRejectedByActualBytes: true,
    strictUtf8Required: true,
    invalidBoundsRejected: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
