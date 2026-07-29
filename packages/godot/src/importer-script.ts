export const GODOT_SPRITE_FRAMES_IMPORTER = `extends SceneTree

func fail(message: String, code: int = 1) -> void:
    push_error(message)
    quit(code)

func _init() -> void:
    var user_args := OS.get_cmdline_user_args()
    if user_args.size() != 1:
        fail("EVAVO SpriteFrames importer expects one res:// descriptor path.", 2)
        return

    var descriptor_path: String = user_args[0]
    var descriptor_text := FileAccess.get_file_as_string(descriptor_path)
    if descriptor_text.is_empty():
        fail("EVAVO SpriteFrames descriptor could not be read: " + descriptor_path, 3)
        return

    var descriptor = JSON.parse_string(descriptor_text)
    if typeof(descriptor) != TYPE_DICTIONARY:
        fail("EVAVO SpriteFrames descriptor is not a JSON object.", 4)
        return

    var atlas_texture = load(String(descriptor["atlasTexturePath"]))
    if atlas_texture == null or not atlas_texture is Texture2D:
        fail("EVAVO atlas texture could not be loaded.", 5)
        return

    var frame_map: Dictionary = {}
    var frame_metadata: Dictionary = {}
    for frame in descriptor["frames"]:
        var frame_id := String(frame["id"])
        frame_map[frame_id] = frame
        frame_metadata[frame_id] = {
            "pivot": Vector2(float(frame["pivot"]["x"]), float(frame["pivot"]["y"])),
            "source_size": Vector2i(int(frame["sourceSize"]["width"]), int(frame["sourceSize"]["height"])),
            "trim": Rect2i(int(frame["trim"]["x"]), int(frame["trim"]["y"]), int(frame["trim"]["width"]), int(frame["trim"]["height"])),
            "region": Rect2i(int(frame["region"]["x"]), int(frame["region"]["y"]), int(frame["region"]["width"]), int(frame["region"]["height"]))
        }

    var sprite_frames := SpriteFrames.new()
    if sprite_frames.has_animation(&"default"):
        sprite_frames.remove_animation(&"default")

    for animation in descriptor["animations"]:
        var animation_name := StringName(String(animation["name"]))
        sprite_frames.add_animation(animation_name)
        sprite_frames.set_animation_speed(animation_name, float(animation["framesPerSecond"]))
        match int(animation["loopModeValue"]):
            1:
                sprite_frames.set_animation_loop_mode(animation_name, SpriteFrames.LOOP_LINEAR)
            2:
                sprite_frames.set_animation_loop_mode(animation_name, SpriteFrames.LOOP_PINGPONG)
            _:
                sprite_frames.set_animation_loop_mode(animation_name, SpriteFrames.LOOP_NONE)

        for frame_entry in animation["frames"]:
            var frame_id := String(frame_entry["frameId"])
            if not frame_map.has(frame_id):
                fail("Animation references missing packed frame: " + frame_id, 6)
                return
            var frame: Dictionary = frame_map[frame_id]
            var region: Dictionary = frame["region"]
            var trim: Dictionary = frame["trim"]
            var source_size: Dictionary = frame["sourceSize"]
            var texture := AtlasTexture.new()
            texture.atlas = atlas_texture
            texture.region = Rect2(
                float(region["x"]),
                float(region["y"]),
                float(region["width"]),
                float(region["height"])
            )
            texture.filter_clip = true
            texture.margin = Rect2(
                -float(trim["x"]),
                -float(trim["y"]),
                float(source_size["width"]),
                float(source_size["height"])
            )
            sprite_frames.add_frame(
                animation_name,
                texture,
                float(frame_entry["relativeDuration"])
            )

    sprite_frames.set_meta("evavo_atlas_id", String(descriptor["atlasId"]))
    sprite_frames.set_meta("evavo_target_engine", String(descriptor["targetEngine"]))
    sprite_frames.set_meta("evavo_frame_metadata", frame_metadata)
    sprite_frames.set_meta("evavo_texture_filtering", String(descriptor["textureFiltering"]))

    var result := ResourceSaver.save(sprite_frames, String(descriptor["outputResourcePath"]))
    if result != OK:
        fail("SpriteFrames resource save failed with code " + str(result), 7)
        return

    print(JSON.stringify({
        "event": "evavo_spriteframes_saved",
        "atlasId": descriptor["atlasId"],
        "resource": descriptor["outputResourcePath"]
    }))
    quit(0)
`;
