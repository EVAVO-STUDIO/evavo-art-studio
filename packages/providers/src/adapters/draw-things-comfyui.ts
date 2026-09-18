import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import {
  createComfyUIProviderAdapters,
  loadComfyUIWorkflowCatalogFromFile,
  type ComfyUIProviderOptions,
  type ComfyUIWorkflowProfile,
} from "./comfyui.js";
import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  type ProviderAdapter,
  type ProviderAdapterDescriptor,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ResolvedProviderCandidateRequest,
} from "../types.js";

export const DRAW_THINGS_COMFYUI_PROVIDER_EVIDENCE_SCHEMA =
  "evavo.draw-things-comfyui-provider-evidence.v1" as const;
export const DRAW_THINGS_SAMPLER_CLASS = "DrawThingsSampler" as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DrawThingsComfyUIProviderOptions = ComfyUIProviderOptions;

export interface LoadDrawThingsComfyUIProviderOptions
  extends Omit<DrawThingsComfyUIProviderOptions, "catalog"> {
  readonly catalogPath: string;
  readonly allowedRoot?: string;
}

interface DrawThingsEndpointEvidence {
  readonly server: string;
  readonly port: string;
  readonly useTls: boolean;
  readonly remote: boolean;
}

function metadataObject(
  value: JsonValue | undefined,
): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, JsonValue>) }
    : {};
}

function drawThingsEndpoint(
  profile: ComfyUIWorkflowProfile,
): DrawThingsEndpointEvidence {
  const samplers = profile.nodeInventory.filter(
    (entry) => entry.classType === DRAW_THINGS_SAMPLER_CLASS,
  );
  if (!samplers.length) {
    throw new ProviderError(
      "DRAW_THINGS_PROFILE_MISSING",
      `Draw Things profile ${profile.profileId} must contain ${DRAW_THINGS_SAMPLER_CLASS}.`,
      "permanent",
    );
  }

  const endpoints = samplers.map((entry) => {
    const node = profile.workflow[entry.nodeId];
    if (!node) {
      throw new ProviderError(
        "DRAW_THINGS_PROFILE_INVALID",
        `Draw Things sampler node ${entry.nodeId} is absent from workflow ${profile.profileId}.`,
        "permanent",
      );
    }
    const serverValue = node.inputs.server;
    const portValue = node.inputs.port;
    const tlsValue = node.inputs.use_tls;
    const server =
      typeof serverValue === "string" ? serverValue.trim().toLowerCase() : "";
    const port =
      typeof portValue === "string" || typeof portValue === "number"
        ? String(portValue).trim()
        : "";
    if (!server || !port || !/^\d{1,5}$/u.test(port)) {
      throw new ProviderError(
        "DRAW_THINGS_ENDPOINT_INVALID",
        `Draw Things sampler ${entry.nodeId} must pin a concrete server and port in the reviewed workflow.`,
        "permanent",
      );
    }
    const numericPort = Number(port);
    if (numericPort < 1 || numericPort > 65_535 || typeof tlsValue !== "boolean") {
      throw new ProviderError(
        "DRAW_THINGS_ENDPOINT_INVALID",
        `Draw Things sampler ${entry.nodeId} has an invalid port or use_tls value.`,
        "permanent",
      );
    }
    const remote = !LOOPBACK_HOSTS.has(server);
    if (remote && tlsValue !== true) {
      throw new ProviderError(
        "DRAW_THINGS_REMOTE_TLS_REQUIRED",
        `Remote Draw Things sampler ${entry.nodeId} must enable TLS.`,
        "permanent",
      );
    }
    return {
      server,
      port,
      useTls: tlsValue,
      remote,
    } satisfies DrawThingsEndpointEvidence;
  });

  const first = endpoints[0]!;
  for (const endpoint of endpoints.slice(1)) {
    if (
      endpoint.server !== first.server ||
      endpoint.port !== first.port ||
      endpoint.useTls !== first.useTls
    ) {
      throw new ProviderError(
        "DRAW_THINGS_ENDPOINT_AMBIGUOUS",
        `Draw Things profile ${profile.profileId} contains sampler nodes targeting different gRPC endpoints.`,
        "permanent",
      );
    }
  }
  return first;
}

class DrawThingsComfyUIProviderAdapter implements ProviderAdapter {
  public readonly descriptor: ProviderAdapterDescriptor;
  readonly #delegate: ProviderAdapter;
  readonly #profile: ComfyUIWorkflowProfile;
  readonly #endpoint: DrawThingsEndpointEvidence;

  public constructor(
    delegate: ProviderAdapter,
    profile: ComfyUIWorkflowProfile,
    endpoint: DrawThingsEndpointEvidence,
  ) {
    this.#delegate = delegate;
    this.#profile = profile;
    this.#endpoint = endpoint;
    this.descriptor = Object.freeze({
      protocolVersion: PROVIDER_PROTOCOL_VERSION,
      id: `draw-things:${profile.profileId}`,
      label: `Draw Things via ComfyUI — ${profile.label}`,
      version: profile.version,
      priority: profile.priority,
      capabilities: Object.freeze([...delegate.descriptor.capabilities]),
      models: Object.freeze([...delegate.descriptor.models]),
      maximumCandidates: delegate.descriptor.maximumCandidates,
      maximumReferenceImages: delegate.descriptor.maximumReferenceImages,
      maximumSourceBytes: delegate.descriptor.maximumSourceBytes,
      dataPolicy: Object.freeze({
        remote: delegate.descriptor.dataPolicy.remote || endpoint.remote,
        retainedByProvider: true,
        usedForTraining: endpoint.remote ? "provider-dependent" : false,
      }),
    });
  }

  public async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    const result = await this.#delegate.execute(resolved, context);
    return {
      ...result,
      adapterId: this.descriptor.id,
      metadata: normalizeJson({
        ...metadataObject(result.metadata),
        drawThingsBridge: {
          schemaVersion: DRAW_THINGS_COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
          transport: "official-comfyui-grpc-bridge",
          profileId: this.#profile.profileId,
          profileSha256: this.#profile.profileSha256,
          samplerClass: DRAW_THINGS_SAMPLER_CLASS,
          delegatedAdapterId: result.adapterId,
          grpcServer: this.#endpoint.server,
          grpcPort: this.#endpoint.port,
          grpcTls: this.#endpoint.useTls,
          drawThingsRemote: this.#endpoint.remote,
          directGrpcClientUsed: false,
          arbitraryWorkflowAccepted: false,
          candidateApprovalPerformed: false,
          candidatePromotionPerformed: false,
        },
      }),
    };
  }
}

export function createDrawThingsComfyUIProviderAdapters(
  options: DrawThingsComfyUIProviderOptions,
): readonly ProviderAdapter[] {
  const delegates = createComfyUIProviderAdapters(options);
  const byProfileId = new Map(
    delegates.map((adapter) => [
      adapter.descriptor.id.replace(/^comfyui:/u, ""),
      adapter,
    ]),
  );
  const profiles = options.catalog.profiles.filter((profile) =>
    profile.nodeInventory.some(
      (entry) => entry.classType === DRAW_THINGS_SAMPLER_CLASS,
    ),
  );
  if (!profiles.length) {
    throw new ProviderError(
      "DRAW_THINGS_PROFILE_MISSING",
      `Draw Things provider catalog must contain at least one workflow profile with ${DRAW_THINGS_SAMPLER_CLASS}.`,
      "permanent",
    );
  }
  return Object.freeze(
    profiles.map((profile) => {
      const delegate = byProfileId.get(profile.profileId);
      if (!delegate) {
        throw new ProviderError(
          "DRAW_THINGS_DELEGATE_MISSING",
          `Validated ComfyUI catalog did not create delegate adapter for Draw Things profile ${profile.profileId}.`,
          "permanent",
        );
      }
      return new DrawThingsComfyUIProviderAdapter(
        delegate,
        profile,
        drawThingsEndpoint(profile),
      );
    }),
  );
}

export function loadDrawThingsComfyUIProviderAdaptersFromCatalogFile(
  options: LoadDrawThingsComfyUIProviderOptions,
): readonly ProviderAdapter[] {
  const catalog = loadComfyUIWorkflowCatalogFromFile(
    options.catalogPath,
    options.allowedRoot,
  );
  const {
    catalogPath: _catalogPath,
    allowedRoot: _allowedRoot,
    ...providerOptions
  } = options;
  return createDrawThingsComfyUIProviderAdapters({
    ...providerOptions,
    catalog,
  });
}
