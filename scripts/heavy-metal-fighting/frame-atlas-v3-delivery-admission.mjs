import { types as utilTypes } from "node:util";

const DEFAULT_LIMITS = Object.freeze({
  maximumDepth: 64,
  maximumNodes: 100_000,
  maximumBytes: 16 * 1024 * 1024,
});

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_ATLAS_V3_INPUT_INVALID: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

export function freezeHmfFrameAtlasV3Value(value) {
  if (Array.isArray(value)) value.forEach(freezeHmfFrameAtlasV3Value);
  else if (value && typeof value === "object") Object.values(value).forEach(freezeHmfFrameAtlasV3Value);
  return Object.freeze(value);
}

function ownShape(value, label) {
  if (utilTypes.isProxy(value)) fail(`${label} may not be a Proxy.`);
  try {
    return {
      prototype: Object.getPrototypeOf(value),
      keys: Reflect.ownKeys(value),
      descriptors: Object.getOwnPropertyDescriptors(value),
    };
  } catch (error) {
    fail(
      `${label} could not be inspected without invoking caller-controlled behaviour: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function capture(value, label, state, depth) {
  state.nodes += 1;
  assert(state.nodes <= state.limits.maximumNodes, `${label} exceeds the immutable snapshot node limit.`);
  assert(depth <= state.limits.maximumDepth, `${label} exceeds the immutable snapshot depth limit.`);

  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${label} contains a non-finite number.`);
    return value;
  }
  assert(typeof value === "object", `${label} contains a non-JSON value of type ${typeof value}.`);
  assert(!state.ancestors.has(value), `${label} contains a cyclic object graph.`);
  state.ancestors.add(value);

  try {
    const shape = ownShape(value, label);
    assert(shape.keys.every((key) => typeof key !== "symbol"), `${label} contains symbolic properties.`);

    if (Array.isArray(value)) {
      assert(shape.prototype === Array.prototype, `${label} must use the ordinary Array prototype.`);
      const expectedNames = new Set(["length"]);
      for (let index = 0; index < value.length; index += 1) expectedNames.add(String(index));
      const names = shape.keys.map(String);
      assert(
        names.length === expectedNames.size && names.every((name) => expectedNames.has(name)),
        `${label} contains sparse or additional array properties.`,
      );
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = shape.descriptors[String(index)];
        assert(descriptor && "value" in descriptor, `${label}[${index}] may not be an accessor.`);
        assert(descriptor.enumerable === true, `${label}[${index}] must be enumerable JSON data.`);
        output.push(capture(descriptor.value, `${label}[${index}]`, state, depth + 1));
      }
      return Object.freeze(output);
    }

    assert(shape.prototype === Object.prototype, `${label} must use the ordinary Object prototype.`);
    const output = {};
    for (const key of shape.keys) {
      const name = String(key);
      assert(!DANGEROUS_KEYS.has(name), `${label} contains the unsafe property ${name}.`);
      const descriptor = shape.descriptors[name];
      assert(descriptor && "value" in descriptor, `${label}.${name} may not be an accessor.`);
      assert(descriptor.enumerable === true, `${label}.${name} must be enumerable JSON data.`);
      output[name] = capture(descriptor.value, `${label}.${name}`, state, depth + 1);
    }
    return Object.freeze(output);
  } finally {
    state.ancestors.delete(value);
  }
}

export function snapshotHmfFrameAtlasV3Json(value, label, limits = {}) {
  const normalizedLimits = {
    maximumDepth: limits.maximumDepth ?? DEFAULT_LIMITS.maximumDepth,
    maximumNodes: limits.maximumNodes ?? DEFAULT_LIMITS.maximumNodes,
    maximumBytes: limits.maximumBytes ?? DEFAULT_LIMITS.maximumBytes,
  };
  for (const [name, limit] of Object.entries(normalizedLimits)) {
    assert(Number.isInteger(limit) && limit >= 1, `${label} ${name} must be a positive integer.`);
  }
  const captured = capture(
    value,
    label,
    { ancestors: new WeakSet(), nodes: 0, limits: normalizedLimits },
    0,
  );
  const serialized = JSON.stringify(captured);
  assert(serialized !== undefined, `${label} could not be represented as JSON.`);
  assert(
    Buffer.byteLength(serialized, "utf8") <= normalizedLimits.maximumBytes,
    `${label} exceeds the immutable snapshot byte limit.`,
  );
  return freezeHmfFrameAtlasV3Value(captured);
}

export function assertExactHmfFrameAtlasV3Keys(value, expectedKeys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields must be exactly: ${expected.join(", ")}.`,
  );
  return value;
}

export function assertAllowedHmfFrameAtlasV3Keys(value, allowedKeys, requiredKeys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} contains unsupported field ${key}.`);
  for (const key of requiredKeys) assert(Object.hasOwn(value, key), `${label}.${key} is required.`);
  return value;
}

export const HMF_FRAME_ATLAS_V3_COMPILE_REQUEST_FIELDS = Object.freeze([
  "frameId",
  "workspaceRoot",
  "frameReceipts",
  "styleProofApprovalRecords",
  "styleProofReceipts",
  "compiledAt",
]);

export function snapshotHmfFrameAtlasV3CompileRequest(value = {}) {
  const captured = snapshotHmfFrameAtlasV3Json(value, "HMF Frame atlas-v3 compiler input");
  assertAllowedHmfFrameAtlasV3Keys(
    captured,
    HMF_FRAME_ATLAS_V3_COMPILE_REQUEST_FIELDS,
    [
      "frameId",
      "workspaceRoot",
      "frameReceipts",
      "styleProofApprovalRecords",
      "styleProofReceipts",
    ],
    "HMF Frame atlas-v3 compiler input",
  );
  assert(typeof captured.frameId === "string" && captured.frameId.length > 0, "compiler input frameId must be a non-empty string.");
  assert(typeof captured.workspaceRoot === "string" && captured.workspaceRoot.length > 0, "compiler input workspaceRoot must be a non-empty string.");
  assert(!captured.workspaceRoot.includes("\0"), "compiler input workspaceRoot may not contain NUL bytes.");
  assert(Array.isArray(captured.frameReceipts), "compiler input frameReceipts must be an array.");
  assert(Array.isArray(captured.styleProofApprovalRecords), "compiler input styleProofApprovalRecords must be an array.");
  assert(Array.isArray(captured.styleProofReceipts), "compiler input styleProofReceipts must be an array.");
  if (Object.hasOwn(captured, "compiledAt")) {
    assert(typeof captured.compiledAt === "string" && captured.compiledAt.length > 0, "compiler input compiledAt must be a non-empty string when supplied.");
  }
  return captured;
}

export function snapshotHmfFrameAtlasV3FileRequest(input, outputPath) {
  assert(typeof outputPath === "string" && outputPath.length > 0, "outputPath must be a non-empty string.");
  assert(outputPath === outputPath.trim(), "outputPath may not contain leading or trailing whitespace.");
  assert(!outputPath.includes("\0"), "outputPath may not contain NUL bytes.");
  return freezeHmfFrameAtlasV3Value({
    input: snapshotHmfFrameAtlasV3CompileRequest(input),
    outputPath,
  });
}
