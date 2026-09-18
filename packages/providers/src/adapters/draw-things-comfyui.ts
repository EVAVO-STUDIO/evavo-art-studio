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

export interface DrawThingsComfyUIProviderOptions
  extends ComfyUIProviderOptions {
  /**
   * Operator assertion for the Draw Things gRPC service reached by the official
   * ComfyUI bridge. Art Studio can verify the reviewed ComfyUI workflow and its
   * DrawThingsSampler node, but the bridge owns the actual gRPC endpoint.
   */
  readonly drawThingsRemote: boolean;
}

export interface LoadDrawThingsComfyUIProviderOptions
  extends Omit<DrawThingsComfyUIProviderOptions, "catalog"> {
  readonly catalogPath: string;
  readonly allowedRoot?: string;
}

function metadataObject(
  value: JsonValue | undefined,
): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, JsonValue>) }
    : {};
}

function usesDrawThings(profile: ComfyUIWorkflowProfile): boolean {
  return profile.nodeInventory.some(
    (entry) => entry.classType === DRAW_THINGS_SAMPLER_CLASS,
  );
}

class DrawThingsComfyUIProviderAdapter implements ProviderAdapter {
  public readonly descriptor: ProviderAdapterDescriptor;
  readonly #delegate: ProviderAdapter;
  readonly #profile: ComfyUIWorkflowProfile;
  readonly #drawThingsRemote: boolean;

  public constructor(
    delegate: ProviderAdapter,
    profile: ComfyUIWorkflowProfile,
    drawThingsRemote: boolean,
  ) {
    this.#delegate = delegate;
    this.#profile = profile;
    this.#drawThingsRemote = drawThingsRemote;
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
        remote: delegate.descriptor.dataPolicy.remote || drawThingsRemote,
        retainedByProvider: true,
        usedForTraining: drawThingsRemote ? "provider-dependent" : false,
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
          drawThingsRemote: this.#drawThingsRemote,
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
  const profiles = options.catalog.profiles.filter(usesDrawThings);
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
        options.drawThingsRemote,
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
