import { type SpriteEffectId } from "./types.js";

const COMMON = `
varying vec4 evavo_modulate;

vec2 clamp_source_uv(vec2 uv) {
  vec2 minimum_uv = source_uv_rect.xy;
  vec2 maximum_uv = source_uv_rect.xy + source_uv_rect.zw;
  vec2 inset = TEXTURE_PIXEL_SIZE * 0.5;
  return clamp(uv, minimum_uv + inset, maximum_uv - inset);
}

vec4 sample_source(vec2 uv) {
  vec2 minimum_uv = source_uv_rect.xy;
  vec2 maximum_uv = source_uv_rect.xy + source_uv_rect.zw;
  bvec2 below = lessThan(uv, minimum_uv);
  bvec2 above = greaterThan(uv, maximum_uv);
  if (any(below) || any(above)) {
    return vec4(0.0);
  }
  return texture(TEXTURE, clamp_source_uv(uv));
}
`;

const SHADERS: Readonly<Record<SpriteEffectId, string>> = Object.freeze({
  sprite_feedback: `shader_type canvas_item;
render_mode blend_mix, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float outline_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform float outline_width_px : hint_range(0.5, 4.0) = 1.0;
instance uniform vec4 outline_color : source_color = vec4(1.0, 0.141, 0.306, 1.0);
instance uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform vec4 flash_color : source_color = vec4(1.0);
instance uniform float opacity : hint_range(0.0, 1.0) = 1.0;
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
}

void fragment() {
  vec4 modulation = evavo_modulate;
  vec4 base = sample_source(UV);
  vec2 step_uv = TEXTURE_PIXEL_SIZE * max(outline_width_px, 0.5);
  float neighbours = 0.0;
  neighbours = max(neighbours, sample_source(UV + vec2(step_uv.x, 0.0)).a);
  neighbours = max(neighbours, sample_source(UV - vec2(step_uv.x, 0.0)).a);
  neighbours = max(neighbours, sample_source(UV + vec2(0.0, step_uv.y)).a);
  neighbours = max(neighbours, sample_source(UV - vec2(0.0, step_uv.y)).a);
  neighbours = max(neighbours, sample_source(UV + step_uv).a);
  neighbours = max(neighbours, sample_source(UV - step_uv).a);
  neighbours = max(neighbours, sample_source(UV + vec2(step_uv.x, -step_uv.y)).a);
  neighbours = max(neighbours, sample_source(UV + vec2(-step_uv.x, step_uv.y)).a);
  float outline_alpha = max(neighbours - base.a, 0.0) * outline_amount * outline_color.a;
  float composed_alpha = base.a + outline_alpha * (1.0 - base.a);
  vec3 composed_rgb = composed_alpha > 0.00001
    ? (base.rgb * base.a + outline_color.rgb * outline_alpha * (1.0 - base.a)) / composed_alpha
    : vec3(0.0);
  vec4 composed = vec4(composed_rgb, composed_alpha);
  composed.rgb = mix(composed.rgb, flash_color.rgb, flash_amount * composed.a);
  composed.a *= opacity;
  COLOR = composed * modulation;
}
`,
  sprite_dissolve: `shader_type canvas_item;
render_mode blend_mix, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float effect_time = 0.0;
instance uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform float edge_width : hint_range(0.001, 0.25) = 0.08;
instance uniform vec4 edge_color : source_color = vec4(1.0, 0.141, 0.306, 1.0);
instance uniform float dither_phase = 0.0;
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
}

float bayer4(vec2 pixel, float phase) {
  vec2 shifted = mod(floor(pixel) + floor(phase), 4.0);
  int x = int(shifted.x);
  int y = int(shifted.y);
  int index = x + y * 4;
  if (index == 0) return 0.03125;
  if (index == 1) return 0.53125;
  if (index == 2) return 0.15625;
  if (index == 3) return 0.65625;
  if (index == 4) return 0.78125;
  if (index == 5) return 0.28125;
  if (index == 6) return 0.90625;
  if (index == 7) return 0.40625;
  if (index == 8) return 0.21875;
  if (index == 9) return 0.71875;
  if (index == 10) return 0.09375;
  if (index == 11) return 0.59375;
  if (index == 12) return 0.96875;
  if (index == 13) return 0.46875;
  if (index == 14) return 0.84375;
  return 0.34375;
}

void fragment() {
  vec4 modulation = evavo_modulate;
  vec4 base = sample_source(UV);
  vec2 pixel = floor(UV / TEXTURE_PIXEL_SIZE);
  float threshold = bayer4(pixel, dither_phase);
  float progress = clamp(dissolve_amount, 0.0, 1.0);
  float retained = step(progress, threshold);
  float pulse = 0.92 + 0.08 * sin(effect_time * 6.283185);
  float edge = smoothstep(progress, progress + max(edge_width, 0.001), threshold) -
    smoothstep(progress + max(edge_width, 0.001), progress + max(edge_width, 0.001) * 2.0, threshold);
  vec4 result = base;
  result.rgb = mix(result.rgb, edge_color.rgb * pulse, edge * edge_color.a);
  result.a *= retained;
  COLOR = result * modulation;
}
`,
  sprite_ghost: `shader_type canvas_item;
render_mode blend_mix, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float effect_time = 0.0;
instance uniform float ghost_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform float drift_px : hint_range(0.0, 4.0) = 1.0;
instance uniform float drift_speed : hint_range(0.0, 8.0) = 1.4;
instance uniform vec4 ghost_tint : source_color = vec4(0.78, 0.84, 0.88, 1.0);
instance uniform float ghost_opacity : hint_range(0.0, 1.0) = 0.62;
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
}

void fragment() {
  vec4 modulation = evavo_modulate;
  float wave = sin(effect_time * drift_speed + UV.y * 18.0);
  float offset_pixels = round(drift_px * wave);
  vec2 offset = vec2(TEXTURE_PIXEL_SIZE.x * offset_pixels, 0.0);
  vec4 base = sample_source(UV);
  vec4 drifted = sample_source(UV + offset);
  vec4 combined = mix(base, drifted, 0.45 * ghost_amount);
  float luminance = dot(combined.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 ghost_rgb = mix(vec3(luminance), ghost_tint.rgb * luminance, 0.62);
  combined.rgb = mix(combined.rgb, ghost_rgb, ghost_amount);
  combined.a *= mix(1.0, ghost_opacity, ghost_amount);
  COLOR = combined * modulation;
}
`,
  sprite_sway: `shader_type canvas_item;
render_mode blend_mix, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float effect_time = 0.0;
instance uniform float sway_amount_px : hint_range(0.0, 8.0) = 0.0;
instance uniform float sway_speed : hint_range(0.0, 8.0) = 1.0;
instance uniform float sway_phase = 0.0;
instance uniform float anchor_from_bottom : hint_range(0.0, 0.5) = 0.08;
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
  float local_y = clamp((UV.y - source_uv_rect.y) / max(source_uv_rect.w, 0.00001), 0.0, 1.0);
  float flexible = smoothstep(anchor_from_bottom, 1.0, 1.0 - local_y);
  float wave = sin(effect_time * sway_speed + sway_phase + local_y * 1.570796);
  VERTEX.x += wave * sway_amount_px * flexible;
}

void fragment() {
  COLOR = sample_source(UV) * evavo_modulate;
}
`,
  sprite_engraved_ink: `shader_type canvas_item;
render_mode blend_mix, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float ink_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform float black_point : hint_range(0.0, 1.0) = 0.25;
instance uniform float white_point : hint_range(0.0, 1.0) = 0.78;
instance uniform float dither_strength : hint_range(0.0, 0.5) = 0.16;
instance uniform vec4 accent_color : source_color = vec4(1.0, 0.141, 0.306, 1.0);
instance uniform float accent_tolerance : hint_range(0.0, 1.0) = 0.26;
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
}

float bayer4_signed(vec2 pixel) {
  vec2 shifted = mod(floor(pixel), 4.0);
  int x = int(shifted.x);
  int y = int(shifted.y);
  int index = x + y * 4;
  float value = 5.0;
  if (index == 0) value = 0.0;
  else if (index == 1) value = 8.0;
  else if (index == 2) value = 2.0;
  else if (index == 3) value = 10.0;
  else if (index == 4) value = 12.0;
  else if (index == 5) value = 4.0;
  else if (index == 6) value = 14.0;
  else if (index == 7) value = 6.0;
  else if (index == 8) value = 3.0;
  else if (index == 9) value = 11.0;
  else if (index == 10) value = 1.0;
  else if (index == 11) value = 9.0;
  else if (index == 12) value = 15.0;
  else if (index == 13) value = 7.0;
  else if (index == 14) value = 13.0;
  return (value + 0.5) / 16.0 - 0.5;
}

void fragment() {
  vec4 modulation = evavo_modulate;
  vec4 base = sample_source(UV);
  float luminance = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 pixel = floor(UV / TEXTURE_PIXEL_SIZE);
  float shifted = luminance + bayer4_signed(pixel) * dither_strength;
  float normalized = clamp((shifted - black_point) / max(white_point - black_point, 0.001), 0.0, 1.0);
  vec3 ink = vec3(step(0.5, normalized));
  float accent_distance = distance(base.rgb, accent_color.rgb);
  float preserve_accent = 1.0 - smoothstep(accent_tolerance * 0.5, max(accent_tolerance, 0.001), accent_distance);
  ink = mix(ink, accent_color.rgb, preserve_accent * accent_color.a);
  base.rgb = mix(base.rgb, ink, ink_amount);
  COLOR = base * modulation;
}
`,
  sprite_additive_pulse: `shader_type canvas_item;
render_mode blend_add, unshaded;

instance uniform vec4 source_uv_rect = vec4(0.0, 0.0, 1.0, 1.0);
instance uniform float effect_time = 0.0;
instance uniform float pulse_amount : hint_range(0.0, 4.0) = 0.0;
instance uniform float pulse_speed : hint_range(0.0, 12.0) = 2.0;
instance uniform vec4 pulse_color : source_color = vec4(1.0, 0.82, 0.5, 1.0);
${COMMON}
void vertex() {
  evavo_modulate = COLOR;
}

void fragment() {
  vec4 modulation = evavo_modulate;
  vec4 base = sample_source(UV);
  float wave = 0.5 + 0.5 * sin(effect_time * pulse_speed);
  float intensity = pulse_amount * wave;
  vec4 result = vec4(base.rgb * pulse_color.rgb * intensity, base.a * pulse_color.a * intensity);
  COLOR = result * modulation;
}
`,
});

export function renderSpriteEffectShader(id: SpriteEffectId): string {
  return `${SHADERS[id].trim()}\n`;
}
