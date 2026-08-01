import {
  type SpriteEffectDefinition,
  type SpriteEffectPackRequest,
  type SpriteEffectUniformDefinition,
} from "./types.js";

function constantName(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join("");
}

export function renderSpriteEffectBinder(
  request: SpriteEffectPackRequest,
  definitions: readonly SpriteEffectDefinition[],
): string {
  const uniforms = new Map<string, SpriteEffectUniformDefinition>([
    [
      "source_uv_rect",
      Object.freeze({
        name: "source_uv_rect",
        type: "vec4",
        scope: "instance",
        defaultValue: "vec4(0.0, 0.0, 1.0, 1.0)",
        purpose: "Normalized atlas-safe source rectangle.",
      }),
    ],
    [
      "effect_time",
      Object.freeze({
        name: "effect_time",
        type: "float",
        scope: "instance",
        defaultValue: "0.0",
        purpose: "Pause-aware game-owned effect clock.",
      }),
    ],
  ]);
  for (const definition of definitions) {
    for (const uniform of definition.uniforms) uniforms.set(uniform.name, uniform);
  }
  const constants = [...uniforms.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (uniform) =>
        `    public static readonly StringName ${constantName(uniform.name)} = new("${uniform.name}");`,
    )
    .join("\n");

  return `using System;
using Godot;

namespace ${request.csharpNamespace};

/// <summary>
/// Shared-material-safe per-CanvasItem bindings for ${request.packId}.
/// Shader state is visual only and must never own gameplay authority.
/// </summary>
public static class ${request.binderClassName}
{
${constants}

    public static Vector4 SourceUvRectFromPixels(Rect2 sourceRegionPixels, Vector2 textureSizePixels)
    {
        if (!float.IsFinite(textureSizePixels.X) || !float.IsFinite(textureSizePixels.Y) ||
            textureSizePixels.X <= 0.0f || textureSizePixels.Y <= 0.0f)
            throw new ArgumentOutOfRangeException(nameof(textureSizePixels));
        return new Vector4(
            sourceRegionPixels.Position.X / textureSizePixels.X,
            sourceRegionPixels.Position.Y / textureSizePixels.Y,
            sourceRegionPixels.Size.X / textureSizePixels.X,
            sourceRegionPixels.Size.Y / textureSizePixels.Y);
    }

    public static void BindWholeTexture(CanvasItem target)
    {
        ArgumentNullException.ThrowIfNull(target);
        target.SetInstanceShaderParameter(SourceUvRect, new Vector4(0.0f, 0.0f, 1.0f, 1.0f));
    }

    public static void BindSourceRegion(CanvasItem target, Rect2 sourceRegionPixels, Vector2 textureSizePixels)
    {
        ArgumentNullException.ThrowIfNull(target);
        target.SetInstanceShaderParameter(SourceUvRect, SourceUvRectFromPixels(sourceRegionPixels, textureSizePixels));
    }

    public static void SetEffectTime(CanvasItem target, double pauseAwareSeconds)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (!double.IsFinite(pauseAwareSeconds))
            throw new ArgumentOutOfRangeException(nameof(pauseAwareSeconds));
        target.SetInstanceShaderParameter(EffectTime, (float)Math.Max(0.0, pauseAwareSeconds));
    }

    public static void SetFloat(CanvasItem target, StringName parameter, float value)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (!float.IsFinite(value)) throw new ArgumentOutOfRangeException(nameof(value));
        target.SetInstanceShaderParameter(parameter, value);
    }

    public static void SetVector2(CanvasItem target, StringName parameter, Vector2 value)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (!float.IsFinite(value.X) || !float.IsFinite(value.Y))
            throw new ArgumentOutOfRangeException(nameof(value));
        target.SetInstanceShaderParameter(parameter, value);
    }

    public static void SetVector4(CanvasItem target, StringName parameter, Vector4 value)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (!float.IsFinite(value.X) || !float.IsFinite(value.Y) ||
            !float.IsFinite(value.Z) || !float.IsFinite(value.W))
            throw new ArgumentOutOfRangeException(nameof(value));
        target.SetInstanceShaderParameter(parameter, value);
    }

    public static void SetColour(CanvasItem target, StringName parameter, Color value)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (!float.IsFinite(value.R) || !float.IsFinite(value.G) ||
            !float.IsFinite(value.B) || !float.IsFinite(value.A))
            throw new ArgumentOutOfRangeException(nameof(value));
        target.SetInstanceShaderParameter(parameter, value);
    }

    public static void SetBoolean(CanvasItem target, StringName parameter, bool value)
    {
        ArgumentNullException.ThrowIfNull(target);
        target.SetInstanceShaderParameter(parameter, value);
    }
}
`;
}
