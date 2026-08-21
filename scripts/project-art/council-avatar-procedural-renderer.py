#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageChops, ImageDraw

MASTER_W = 1024
MASTER_H = 1536
VIDEO_W = 512
VIDEO_H = 768
FPS = 60
INK = (10, 10, 14, 255)
OFF_WHITE = (235, 231, 220, 255)
CHERRY = (255, 36, 78, 255)
REVIEW_BG = (20, 20, 24)


@dataclass(frozen=True)
class ClipSpec:
    clip_id: str
    duration: float
    loop: bool
    purpose: str


CLIPS = (
    ClipSpec("idle-primary", 4.0, True, "primary presence and breathing proof"),
    ClipSpec("idle-b", 5.0, True, "secondary idle, blink and weight-shift proof"),
    ClipSpec("listening", 3.5, True, "attentive listening proof"),
    ClipSpec("talk-neutral", 3.5, True, "neutral body-speech cadence proof"),
    ClipSpec("run-loop", 1.2, True, "locomotion and centre-of-mass proof"),
)


CHARACTERS = {
    "top-hat-man": {
        "displayName": "Top Hat Man",
        "role": "Architect",
        "seatId": "architect",
        "canonicalSeat": True,
        "previewOnly": False,
        "species": "human",
        "silhouette": "tall tailored eccentric",
    },
    "eva-female": {
        "displayName": "EVA",
        "role": "Researcher",
        "seatId": "researcher",
        "canonicalSeat": True,
        "previewOnly": False,
        "species": "human",
        "silhouette": "angular vertical geometry",
    },
    "council-critic": {
        "displayName": "Veyra",
        "role": "Critic",
        "seatId": "critic",
        "canonicalSeat": True,
        "previewOnly": False,
        "species": "original four-eyed tribunal elder",
        "silhouette": "extremely tall narrow cranial sail",
    },
    "council-open-reviewer": {
        "displayName": "Moro Pell",
        "role": "Open Reviewer",
        "seatId": "open-reviewer",
        "canonicalSeat": True,
        "previewOnly": False,
        "species": "original broad amphibious scholar elder",
        "silhouette": "low broad centre with throat membrane",
    },
    "nymm-guest-arbiter": {
        "displayName": "Nymm",
        "role": "Guest Arbiter",
        "seatId": None,
        "canonicalSeat": False,
        "previewOnly": True,
        "species": "original long-necked lateral-eyed crown-fan elder",
        "silhouette": "small body with oversized ceremonial sleeves",
    },
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def blink(phase: float, centre: float, width: float = 0.024) -> float:
    distance = abs(((phase - centre + 0.5) % 1.0) - 0.5)
    if distance >= width:
        return 0.0
    value = 1.0 - distance / width
    return value * value * (3.0 - 2.0 * value)


def motion(character_id: str, clip_id: str, phase: float) -> dict[str, float]:
    phase %= 1.0
    tau = math.tau
    values = {
        "root_x": 0.0,
        "root_y": 0.0,
        "body": 0.0,
        "head": 0.0,
        "arm_l": 0.0,
        "arm_r": 0.0,
        "elbow_l": 0.0,
        "elbow_r": 0.0,
        "leg_l": 0.0,
        "leg_r": 0.0,
        "knee_l": 0.0,
        "knee_r": 0.0,
        "mouth": 0.0,
        "blink": 0.0,
        "gaze": 0.0,
        "secondary": 0.0,
    }
    if clip_id in {"idle-primary", "idle-b", "listening", "talk-neutral"}:
        values["root_y"] = math.sin(tau * phase) * 4.0
        values["body"] = math.sin(tau * phase + 0.4) * 1.2
        values["head"] = math.sin(tau * phase + 1.1) * 0.8
        values["secondary"] = math.sin(tau * phase - 0.7)
    if clip_id == "idle-primary":
        values["root_x"] = math.sin(tau * phase) * 2.0
        values["arm_l"] = math.sin(tau * phase + 0.2) * 1.5
        values["arm_r"] = math.sin(tau * phase + 1.5) * 1.2
        values["blink"] = max(blink(phase, 0.27), blink(phase, 0.73))
        values["gaze"] = math.sin(tau * phase * 0.5) * 2.0
    elif clip_id == "idle-b":
        shift = math.sin(tau * phase)
        values["root_x"] = shift * 9.0
        values["body"] += shift * 2.0
        values["head"] -= shift * 1.4
        values["arm_l"] = math.sin(tau * phase + 0.3) * 3.2
        values["arm_r"] = math.sin(tau * phase + 2.0) * 2.7
        values["elbow_r"] = max(0.0, math.sin(tau * phase - 0.7)) * 10.0
        values["blink"] = max(blink(phase, 0.18), blink(phase, 0.64))
        values["gaze"] = math.sin(tau * phase * 2.0 + 0.4) * 3.0
    elif clip_id == "listening":
        values["body"] -= 2.5
        values["head"] += 3.5 + math.sin(tau * phase) * 0.8
        values["elbow_l"] = 8.0
        values["elbow_r"] = -5.0
        values["gaze"] = 3.0
        values["blink"] = blink(phase, 0.42, 0.03)
    elif clip_id == "talk-neutral":
        syllable = (
            math.sin(tau * 4 * phase + 0.2) * 0.55
            + math.sin(tau * 7 * phase + 1.4) * 0.3
            + math.sin(tau * 11 * phase + 0.7) * 0.15
        )
        gesture = 0.5 - 0.5 * math.cos(tau * phase)
        values["mouth"] = clamp(0.18 + abs(syllable) * 0.9)
        values["arm_l"] = -4.0 - gesture * 13.0
        values["elbow_l"] = 14.0 + gesture * 25.0
        values["arm_r"] = 3.0 + math.sin(tau * phase + 1.2) * 3.0
        values["elbow_r"] = -7.0 + math.sin(tau * phase + 0.6) * 5.0
        values["head"] += math.sin(tau * 2 * phase) * 1.5
        values["blink"] = max(blink(phase, 0.31), blink(phase, 0.86))
    elif clip_id == "run-loop":
        stride = math.sin(tau * phase)
        opposite = -stride
        values["root_y"] = -6.0 + abs(stride) * 18.0
        values["root_x"] = math.sin(tau * 2 * phase) * 2.0
        values["body"] = -9.0 + math.sin(tau * 2 * phase + 0.5) * 1.7
        values["head"] = 7.0 - values["body"] * 0.35
        values["leg_l"] = stride * 34.0
        values["leg_r"] = opposite * 34.0
        values["knee_l"] = max(0.0, -stride) * 58.0
        values["knee_r"] = max(0.0, stride) * 58.0
        values["arm_l"] = -stride * 29.0
        values["arm_r"] = stride * 29.0
        values["elbow_l"] = 48.0 + max(0.0, stride) * 18.0
        values["elbow_r"] = -48.0 - max(0.0, -stride) * 18.0
        values["secondary"] = math.sin(tau * phase - 0.65)
        values["blink"] = blink(phase, 0.1, 0.018)
    if character_id == "council-critic":
        values["head"] *= 0.55
        values["secondary"] = math.sin(tau * phase - 1.0)
    elif character_id == "council-open-reviewer":
        values["root_y"] *= 0.7
        values["body"] *= 0.7
        values["head"] *= 0.55
        values["secondary"] = math.sin(tau * phase + 0.8)
        values["mouth"] *= 0.8
    elif character_id == "nymm-guest-arbiter":
        values["root_y"] *= 0.45
        values["body"] *= 0.35
        values["head"] *= 0.4
        values["secondary"] = math.sin(tau * phase - 1.7)
    return values


def point(origin: tuple[float, float], length: float, angle: float) -> tuple[float, float]:
    radians = math.radians(angle)
    return origin[0] + math.sin(radians) * length, origin[1] + math.cos(radians) * length


def limb(
    draw: ImageDraw.ImageDraw,
    shoulder: tuple[float, float],
    upper: float,
    lower: float,
    shoulder_angle: float,
    elbow_angle: float,
    width: int,
    colour: tuple[int, int, int, int],
) -> tuple[float, float]:
    elbow = point(shoulder, upper, shoulder_angle)
    wrist = point(elbow, lower, shoulder_angle + elbow_angle)
    draw.line((*shoulder, *elbow), fill=INK, width=width + 10)
    draw.line((*elbow, *wrist), fill=INK, width=width + 10)
    draw.line((*shoulder, *elbow), fill=colour, width=width)
    draw.line((*elbow, *wrist), fill=colour, width=width)
    draw.ellipse((elbow[0] - width / 2, elbow[1] - width / 2, elbow[0] + width / 2, elbow[1] + width / 2), fill=colour)
    return wrist


def hand(
    draw: ImageDraw.ImageDraw,
    centre: tuple[float, float],
    colour: tuple[int, int, int, int],
    digits: int,
    scale: float = 1.0,
) -> None:
    radius = 16 * scale
    draw.ellipse((centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius), fill=colour, outline=INK, width=max(3, round(4 * scale)))
    for index in range(digits):
        offset = (index - (digits - 1) / 2) * 8 * scale
        draw.line((centre[0] + offset, centre[1] - 4 * scale, centre[0] + offset * 1.15, centre[1] + 24 * scale), fill=INK, width=max(2, round(3 * scale)))


def foot(draw: ImageDraw.ImageDraw, centre: tuple[float, float], colour: tuple[int, int, int, int], facing: float) -> None:
    draw.ellipse((centre[0] - 27, centre[1] - 12, centre[0] + 27 + facing * 8, centre[1] + 14), fill=colour, outline=INK, width=5)


def human_face(draw: ImageDraw.ImageDraw, centre: tuple[float, float], blink_value: float, mouth: float, gaze: float, moustache: bool = False) -> None:
    skin = (221, 171, 139, 255)
    draw.ellipse((centre[0] - 75, centre[1] - 92, centre[0] + 75, centre[1] + 92), fill=skin, outline=INK, width=7)
    eye_y = centre[1] - 18
    for side in (-1, 1):
        eye_x = centre[0] + side * 28
        height = max(2, 13 * (1.0 - blink_value))
        draw.ellipse((eye_x - 16, eye_y - height, eye_x + 16, eye_y + height), fill=OFF_WHITE, outline=INK, width=3)
        if blink_value < 0.85:
            draw.ellipse((eye_x - 5 + gaze, eye_y - 5, eye_x + 5 + gaze, eye_y + 5), fill=INK)
    mouth_y = centre[1] + 44
    draw.ellipse((centre[0] - 22, mouth_y - 3 - mouth * 9, centre[0] + 22, mouth_y + 3 + mouth * 9), fill=(105, 37, 51, 255), outline=INK, width=3)
    if moustache:
        draw.arc((centre[0] - 44, centre[1] + 8, centre[0], centre[1] + 46), 180, 350, fill=INK, width=8)
        draw.arc((centre[0], centre[1] + 8, centre[0] + 44, centre[1] + 46), 190, 360, fill=INK, width=8)


def render_top_hat(image: Image.Image, values: dict[str, float]) -> None:
    draw = ImageDraw.Draw(image)
    root = (512 + values["root_x"], 1325 + values["root_y"])
    body = values["body"]
    head = (root[0], 470 + values["root_y"] + values["head"] * 3)
    shoulder_y = 680 + values["root_y"]
    coat = [(405, shoulder_y), (619, shoulder_y), (685, 1210), (575, 1290), (512, 1110), (449, 1290), (339, 1210)]
    coat = [(x + values["root_x"], y) for x, y in coat]
    draw.polygon(coat, fill=(40, 39, 43, 255), outline=INK)
    draw.line((root[0], 730, root[0], 1210), fill=(112, 20, 37, 255), width=12)
    left = limb(draw, (410 + values["root_x"], shoulder_y + 30), 235, 205, 7 + values["arm_l"], 8 + values["elbow_l"], 43, (57, 55, 60, 255))
    right = limb(draw, (614 + values["root_x"], shoulder_y + 30), 235, 205, -7 + values["arm_r"], -8 + values["elbow_r"], 43, (57, 55, 60, 255))
    hand(draw, left, (221, 171, 139, 255), 5)
    hand(draw, right, (221, 171, 139, 255), 5)
    hip_l = (465 + values["root_x"], 1190 + values["root_y"])
    hip_r = (559 + values["root_x"], 1190 + values["root_y"])
    ankle_l = limb(draw, hip_l, 195, 165, 2 + values["leg_l"], values["knee_l"], 48, (30, 29, 34, 255))
    ankle_r = limb(draw, hip_r, 195, 165, -2 + values["leg_r"], -values["knee_r"], 48, (30, 29, 34, 255))
    foot(draw, ankle_l, (24, 23, 27, 255), -1)
    foot(draw, ankle_r, (24, 23, 27, 255), 1)
    human_face(draw, head, values["blink"], values["mouth"], values["gaze"], moustache=True)
    brim_y = head[1] - 98
    draw.ellipse((head[0] - 115, brim_y - 20, head[0] + 115, brim_y + 20), fill=(24, 23, 27, 255), outline=INK, width=6)
    draw.rounded_rectangle((head[0] - 70, brim_y - 180, head[0] + 70, brim_y), radius=18, fill=(28, 27, 31, 255), outline=INK, width=7)
    draw.rectangle((head[0] - 70, brim_y - 45, head[0] + 70, brim_y - 20), fill=(113, 22, 39, 255))
    cane_x = right[0] + 34
    draw.line((cane_x, right[1] - 10, cane_x + values["secondary"] * 5, root[1] + 30), fill=(72, 39, 24, 255), width=13)


def render_eva(image: Image.Image, values: dict[str, float]) -> None:
    draw = ImageDraw.Draw(image)
    root = (512 + values["root_x"], 1322 + values["root_y"])
    head = (root[0], 430 + values["root_y"] + values["head"] * 3)
    shoulder_y = 650 + values["root_y"]
    dress = [
        (431 + values["root_x"], shoulder_y),
        (593 + values["root_x"], shoulder_y),
        (660 + values["root_x"] + values["secondary"] * 12, 1260),
        (512 + values["root_x"], 1370),
        (364 + values["root_x"] - values["secondary"] * 12, 1260),
    ]
    draw.polygon(dress, fill=(22, 22, 27, 255), outline=INK)
    draw.polygon([(512, shoulder_y + 30), (570, 950), (512, 1110), (455, 950)], fill=(245, 240, 225, 255))
    draw.polygon([(512, shoulder_y + 50), (542, 880), (512, 970), (482, 880)], fill=CHERRY)
    left = limb(draw, (428 + values["root_x"], shoulder_y + 22), 220, 195, 10 + values["arm_l"], 8 + values["elbow_l"], 38, (32, 31, 37, 255))
    right = limb(draw, (596 + values["root_x"], shoulder_y + 22), 220, 195, -10 + values["arm_r"], -8 + values["elbow_r"], 38, (32, 31, 37, 255))
    hand(draw, left, (225, 175, 145, 255), 5, 0.9)
    hand(draw, right, (225, 175, 145, 255), 5, 0.9)
    hip_l = (478 + values["root_x"], 1190 + values["root_y"])
    hip_r = (546 + values["root_x"], 1190 + values["root_y"])
    ankle_l = limb(draw, hip_l, 190, 165, 2 + values["leg_l"], values["knee_l"], 38, (35, 34, 40, 255))
    ankle_r = limb(draw, hip_r, 190, 165, -2 + values["leg_r"], -values["knee_r"], 38, (35, 34, 40, 255))
    foot(draw, ankle_l, (27, 26, 31, 255), -1)
    foot(draw, ankle_r, (27, 26, 31, 255), 1)
    human_face(draw, head, values["blink"], values["mouth"], values["gaze"])
    draw.pieslice((head[0] - 100, head[1] - 115, head[0] + 100, head[1] + 105), 175, 365, fill=(29, 28, 34, 255), outline=INK, width=6)


def render_veyra(image: Image.Image, values: dict[str, float]) -> None:
    draw = ImageDraw.Draw(image)
    root = (512 + values["root_x"], 1350 + values["root_y"])
    shoulder_y = 630 + values["root_y"]
    body = [(447, shoulder_y), (577, shoulder_y), (610, 1230), (553, 1328), (471, 1328), (414, 1230)]
    body = [(x + values["root_x"], y) for x, y in body]
    draw.polygon(body, fill=(31, 31, 34, 255), outline=INK)
    draw.line((512 + values["root_x"], shoulder_y + 30, 512 + values["root_x"], 1260), fill=(137, 46, 55, 255), width=10)
    head = (root[0], 430 + values["root_y"] + values["head"] * 3)
    draw.ellipse((head[0] - 67, head[1] - 108, head[0] + 67, head[1] + 108), fill=(215, 207, 188, 255), outline=INK, width=7)
    sail = [(head[0] - 18, head[1] - 98), (head[0] - 42 + values["secondary"] * 8, 110), (head[0] + 18 + values["secondary"] * 5, 65), (head[0] + 45, head[1] - 80)]
    draw.polygon(sail, fill=(104, 93, 86, 255), outline=INK)
    for row, y in enumerate((head[1] - 30, head[1] + 13)):
        for side in (-1, 1):
            x = head[0] + side * (25 + row * 5)
            h = max(2, 11 * (1.0 - values["blink"]))
            draw.ellipse((x - 14, y - h, x + 14, y + h), fill=OFF_WHITE, outline=INK, width=3)
            if values["blink"] < 0.85:
                draw.ellipse((x - 4 + values["gaze"], y - 4, x + 4 + values["gaze"], y + 4), fill=(32, 26, 24, 255))
    mouth_y = head[1] + 62
    draw.ellipse((head[0] - 18, mouth_y - 2 - values["mouth"] * 8, head[0] + 18, mouth_y + 2 + values["mouth"] * 8), fill=(86, 47, 45, 255), outline=INK, width=3)
    left = limb(draw, (445 + values["root_x"], shoulder_y + 20), 275, 240, 8 + values["arm_l"], 5 + values["elbow_l"], 29, (199, 190, 171, 255))
    right = limb(draw, (579 + values["root_x"], shoulder_y + 20), 275, 240, -8 + values["arm_r"], -5 + values["elbow_r"], 29, (199, 190, 171, 255))
    hand(draw, left, (199, 190, 171, 255), 4, 0.9)
    hand(draw, right, (199, 190, 171, 255), 4, 0.9)
    ankle_l = limb(draw, (482 + values["root_x"], 1210), 170, 135, 2 + values["leg_l"] * 0.7, values["knee_l"], 32, (36, 35, 38, 255))
    ankle_r = limb(draw, (542 + values["root_x"], 1210), 170, 135, -2 + values["leg_r"] * 0.7, -values["knee_r"], 32, (36, 35, 38, 255))
    foot(draw, ankle_l, (29, 28, 31, 255), -1)
    foot(draw, ankle_r, (29, 28, 31, 255), 1)


def render_moro(image: Image.Image, values: dict[str, float]) -> None:
    draw = ImageDraw.Draw(image)
    root = (512 + values["root_x"], 1335 + values["root_y"])
    shoulder_y = 700 + values["root_y"]
    draw.rounded_rectangle((285 + values["root_x"], shoulder_y, 739 + values["root_x"], 1255), radius=130, fill=(185, 185, 166, 255), outline=INK, width=8)
    draw.rounded_rectangle((350 + values["root_x"], shoulder_y + 90, 674 + values["root_x"], 1240), radius=90, fill=(220, 215, 193, 255), outline=INK, width=5)
    draw.line((365, 870, 660, 1130), fill=(156, 50, 59, 255), width=12)
    head = (root[0], 520 + values["root_y"] + values["head"] * 3)
    draw.ellipse((head[0] - 155, head[1] - 100, head[0] + 155, head[1] + 118), fill=(124, 139, 119, 255), outline=INK, width=8)
    eye_positions = ((head[0] - 73, head[1] - 18), (head[0], head[1] - 42), (head[0] + 73, head[1] - 18))
    for x, y in eye_positions:
        h = max(2, 14 * (1.0 - values["blink"]))
        draw.ellipse((x - 21, y - h, x + 21, y + h), fill=OFF_WHITE, outline=INK, width=3)
        if values["blink"] < 0.85:
            draw.ellipse((x - 6 + values["gaze"], y - 6, x + 6 + values["gaze"], y + 6), fill=(31, 39, 28, 255))
    membrane_y = head[1] + 76
    membrane_height = 18 + 14 * (0.5 + 0.5 * values["secondary"])
    draw.ellipse((head[0] - 92, membrane_y - membrane_height, head[0] + 92, membrane_y + membrane_height), fill=(151, 75, 82, 220), outline=INK, width=4)
    left = limb(draw, (315 + values["root_x"], shoulder_y + 80), 230, 190, 17 + values["arm_l"], 8 + values["elbow_l"], 58, (119, 134, 114, 255))
    right = limb(draw, (709 + values["root_x"], shoulder_y + 80), 230, 190, -17 + values["arm_r"], -8 + values["elbow_r"], 58, (119, 134, 114, 255))
    hand(draw, left, (119, 134, 114, 255), 4, 1.25)
    hand(draw, right, (119, 134, 114, 255), 4, 1.25)
    ankle_l = limb(draw, (425 + values["root_x"], 1200), 130, 100, 5 + values["leg_l"] * 0.5, values["knee_l"], 62, (83, 92, 80, 255))
    ankle_r = limb(draw, (599 + values["root_x"], 1200), 130, 100, -5 + values["leg_r"] * 0.5, -values["knee_r"], 62, (83, 92, 80, 255))
    foot(draw, ankle_l, (70, 76, 68, 255), -1)
    foot(draw, ankle_r, (70, 76, 68, 255), 1)


def render_nymm(image: Image.Image, values: dict[str, float]) -> None:
    draw = ImageDraw.Draw(image)
    root = (512 + values["root_x"], 1340 + values["root_y"])
    body_y = 930 + values["root_y"]
    draw.rounded_rectangle((395 + values["root_x"], body_y, 629 + values["root_x"], 1260), radius=90, fill=(229, 225, 211, 255), outline=INK, width=7)
    left = limb(draw, (408 + values["root_x"], body_y + 70), 205, 165, 23 + values["arm_l"], 5 + values["elbow_l"], 70, (222, 217, 203, 255))
    right = limb(draw, (616 + values["root_x"], body_y + 70), 205, 165, -23 + values["arm_r"], -5 + values["elbow_r"], 70, (222, 217, 203, 255))
    hand(draw, left, CHERRY, 4, 0.9)
    hand(draw, right, (195, 188, 178, 255), 4, 0.9)
    neck_x = root[0] + values["secondary"] * 8
    draw.line((root[0], body_y + 20, neck_x, 490), fill=INK, width=86)
    draw.line((root[0], body_y + 20, neck_x, 490), fill=(199, 192, 180, 255), width=70)
    head = (neck_x, 405 + values["head"] * 2)
    draw.ellipse((head[0] - 96, head[1] - 76, head[0] + 96, head[1] + 76), fill=(205, 198, 185, 255), outline=INK, width=7)
    for side in (-1, 1):
        x = head[0] + side * 70
        y = head[1] - 5
        h = max(2, 16 * (1.0 - values["blink"]))
        draw.ellipse((x - 25, y - h, x + 25, y + h), fill=OFF_WHITE, outline=INK, width=3)
        if values["blink"] < 0.85:
            draw.ellipse((x - 7 + values["gaze"] * 0.5, y - 7, x + 7 + values["gaze"] * 0.5, y + 7), fill=(29, 15, 23, 255))
    fan_phase = values["secondary"] * 5
    for index in range(7):
        angle = -48 + index * 16
        end = point((head[0], head[1] - 65), 145 + (index % 2) * 18, angle + fan_phase)
        draw.line((head[0], head[1] - 55, *end), fill=INK, width=20)
        draw.line((head[0], head[1] - 55, *end), fill=(111, 100, 105, 255), width=12)
    ankle_l = limb(draw, (467 + values["root_x"], 1220), 100, 85, 3 + values["leg_l"] * 0.5, values["knee_l"], 34, (60, 58, 64, 255))
    ankle_r = limb(draw, (557 + values["root_x"], 1220), 100, 85, -3 + values["leg_r"] * 0.5, -values["knee_r"], 34, (60, 58, 64, 255))
    foot(draw, ankle_l, (42, 40, 45, 255), -1)
    foot(draw, ankle_r, (42, 40, 45, 255), 1)


RENDERERS: dict[str, Callable[[Image.Image, dict[str, float]], None]] = {
    "top-hat-man": render_top_hat,
    "eva-female": render_eva,
    "council-critic": render_veyra,
    "council-open-reviewer": render_moro,
    "nymm-guest-arbiter": render_nymm,
}


def render_transparent(character_id: str, clip_id: str, phase: float) -> Image.Image:
    if character_id not in RENDERERS:
        raise ValueError(f"unknown character: {character_id}")
    if clip_id not in {clip.clip_id for clip in CLIPS}:
        raise ValueError(f"unknown clip: {clip_id}")
    image = Image.new("RGBA", (MASTER_W, MASTER_H), (0, 0, 0, 0))
    RENDERERS[character_id](image, motion(character_id, clip_id, phase))
    return image


def composite_review(frame: Image.Image) -> Image.Image:
    background = Image.new("RGB", (VIDEO_W, VIDEO_H), REVIEW_BG)
    draw = ImageDraw.Draw(background)
    for x in range(0, VIDEO_W, 32):
        draw.line((x, 0, x, VIDEO_H), fill=(27, 27, 32), width=1)
    for y in range(0, VIDEO_H, 32):
        draw.line((0, y, VIDEO_W, y), fill=(27, 27, 32), width=1)
    draw.line((0, round(VIDEO_H * 0.87), VIDEO_W, round(VIDEO_H * 0.87)), fill=(54, 54, 61), width=2)
    foreground = frame.resize((VIDEO_W, VIDEO_H), Image.Resampling.LANCZOS)
    result = background.convert("RGBA")
    result.alpha_composite(foreground)
    return result.convert("RGB")


def encode_clip(character_id: str, clip: ClipSpec, output: Path) -> dict[str, object]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to encode review videos")
    frame_count = round(clip.duration * FPS)
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{VIDEO_W}x{VIDEO_H}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    if process.stdin is None:
        raise RuntimeError("ffmpeg stdin was not created")
    hashes: list[str] = []
    samples: list[Image.Image] = []
    first: Image.Image | None = None
    last: Image.Image | None = None
    sample_indexes = {round(index * (frame_count - 1) / 11) for index in range(12)}
    for frame_index in range(frame_count):
        phase = frame_index / frame_count
        transparent = render_transparent(character_id, clip.clip_id, phase)
        if frame_index == 0:
            first = transparent.copy()
        if frame_index == frame_count - 1:
            last = transparent.copy()
        if frame_index in sample_indexes:
            samples.append(transparent.resize((256, 384), Image.Resampling.LANCZOS))
        review = composite_review(transparent)
        raw = review.tobytes()
        hashes.append(hashlib.sha256(raw).hexdigest())
        process.stdin.write(raw)
    process.stdin.close()
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"ffmpeg failed for {character_id}/{clip.clip_id}: {return_code}")
    poster = output.with_suffix(".poster.png")
    render_transparent(character_id, clip.clip_id, 0.0).save(poster, optimize=True)
    contact = output.with_suffix(".contact.png")
    sheet = Image.new("RGBA", (1024, 1152), (18, 18, 22, 255))
    for index, sample in enumerate(samples):
        sheet.alpha_composite(sample, ((index % 4) * 256, (index // 4) * 384))
    sheet.save(contact, optimize=True)
    if first is None or last is None:
        raise RuntimeError("clip did not render frames")
    first_small = first.resize((256, 384), Image.Resampling.LANCZOS)
    last_small = last.resize((256, 384), Image.Resampling.LANCZOS)
    difference = ImageChops.difference(first_small, last_small)
    energy = sum(sum(pixel) for pixel in difference.convert("RGB").getdata()) / (256 * 384 * 3 * 255)
    return {
        "clipId": clip.clip_id,
        "purpose": clip.purpose,
        "durationSeconds": clip.duration,
        "fps": FPS,
        "frameCount": frame_count,
        "loop": clip.loop,
        "video": output.name,
        "poster": poster.name,
        "contactSheet": contact.name,
        "uniqueFrameCount": len(set(hashes)),
        "duplicateFrameCount": frame_count - len(set(hashes)),
        "normalisedSeamEnergy": energy,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }


def authority() -> dict[str, bool]:
    return {
        "providerExecution": False,
        "creativeApproval": False,
        "identityApproval": False,
        "candidateApproval": False,
        "candidatePromotion": False,
        "sourceMutation": False,
        "repositoryMutation": False,
        "gitCommit": False,
        "gitPush": False,
        "productionAdmission": False,
        "publication": False,
        "websiteActivation": False,
        "runtimeActivation": False,
        "deployment": False,
        "forcePush": False,
    }


def build_review(output_root: Path) -> dict[str, object]:
    manifest: dict[str, object] = {
        "schema": "evavo.project-art-council-avatar-procedural-review-artifact.v1",
        "status": "procedural-previsualisation-review-only",
        "masterCanvas": {"width": MASTER_W, "height": MASTER_H},
        "videoCanvas": {"width": VIDEO_W, "height": VIDEO_H},
        "fps": FPS,
        "renderer": "scripts/project-art/council-avatar-procedural-renderer.py",
        "externalImageGenerationUsed": False,
        "identityMasterCandidate": False,
        "characters": [],
        "authority": authority(),
    }
    characters = manifest["characters"]
    if not isinstance(characters, list):
        raise RuntimeError("invalid manifest character collection")
    for character_id, character in CHARACTERS.items():
        clips = [
            encode_clip(
                character_id,
                clip,
                output_root / "renders" / character_id / f"{clip.clip_id}.mp4",
            )
            for clip in CLIPS
        ]
        characters.append({"characterId": character_id, **character, "clips": clips})
    manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    manifest["manifestSha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    destination = output_root / "manifests"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "review-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def write_qa(output_root: Path, manifest: dict[str, object]) -> None:
    failures: list[str] = []
    warnings: list[str] = []
    characters = manifest.get("characters")
    if not isinstance(characters, list):
        raise RuntimeError("invalid manifest characters")
    for character in characters:
        for clip in character["clips"]:
            if clip["uniqueFrameCount"] < clip["frameCount"] * 0.9:
                failures.append(f"{character['characterId']}/{clip['clipId']}: duplicate-frame threshold failed")
            if clip["normalisedSeamEnergy"] > 0.12:
                warnings.append(f"{character['characterId']}/{clip['clipId']}: inspect loop seam manually")
    report = {
        "schema": "evavo.project-art-council-avatar-procedural-review-qa.v1",
        "status": "passed" if not failures else "failed",
        "technicalFailures": failures,
        "manualReviewWarnings": warnings,
        "creativeApprovalEstablished": False,
        "animationApprovalEstablished": False,
        "identityApprovalEstablished": False,
        "productionAdmissionEstablished": False,
        "runtimeActivationEstablished": False,
        "websiteActivationEstablished": False,
    }
    destination = output_root / "qa"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "qa-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if failures:
        raise RuntimeError("technical QA failed: " + "; ".join(failures))


def write_checksums(output_root: Path) -> None:
    lines = []
    for item in sorted(output_root.rglob("*")):
        if item.is_file() and item.name != "SHA256SUMS":
            lines.append(f"{hashlib.sha256(item.read_bytes()).hexdigest()}  {item.relative_to(output_root).as_posix()}")
    (output_root / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")


def self_test() -> dict[str, object]:
    failures: list[str] = []
    samples: list[dict[str, object]] = []
    for character_id in CHARACTERS:
        for clip in CLIPS:
            hashes: list[str] = []
            for phase in (0.0, 0.25, 0.5, 0.75):
                frame = render_transparent(character_id, clip.clip_id, phase)
                if frame.mode != "RGBA" or frame.size != (MASTER_W, MASTER_H):
                    failures.append(f"{character_id}/{clip.clip_id}: invalid canvas")
                    continue
                if frame.getchannel("A").getbbox() is None:
                    failures.append(f"{character_id}/{clip.clip_id}: empty alpha")
                hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
            unique = len(set(hashes))
            if unique < 4:
                failures.append(f"{character_id}/{clip.clip_id}: only {unique} unique sampled frames")
            samples.append({
                "characterId": character_id,
                "clipId": clip.clip_id,
                "sampleCount": len(hashes),
                "uniqueSampleCount": unique,
            })
    if failures:
        raise RuntimeError("procedural renderer self-test failed: " + "; ".join(failures))
    return {
        "schema": "evavo.project-art-council-avatar-procedural-renderer-self-test.v1",
        "status": "passed",
        "characterCount": len(CHARACTERS),
        "canonicalSeatCount": sum(1 for character in CHARACTERS.values() if character["canonicalSeat"]),
        "previewOnlyCharacterCount": sum(1 for character in CHARACTERS.values() if character["previewOnly"]),
        "clipCountPerCharacter": len(CLIPS),
        "sampledFrameCount": sum(int(sample["sampleCount"]) for sample in samples),
        "externalImageGenerationUsed": False,
        "identityApprovalEstablished": False,
        "runtimeActivationEstablished": False,
        "websiteActivationEstablished": False,
        "samples": samples,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        print(json.dumps(self_test(), indent=2))
        return 0
    if args.output is None:
        parser.error("--output is required unless --self-test is used")
    if args.output.exists():
        raise RuntimeError("COUNCIL_AVATAR_PROCEDURAL_REVIEW_OUTPUT_ALREADY_EXISTS")
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = build_review(args.output)
    write_qa(args.output, manifest)
    write_checksums(args.output)
    characters = manifest["characters"]
    if not isinstance(characters, list):
        raise RuntimeError("invalid manifest characters")
    print(json.dumps({
        "status": "passed",
        "output": str(args.output),
        "characters": len(characters),
        "canonicalSeats": sum(1 for character in characters if character["canonicalSeat"]),
        "previewOnlyCharacters": sum(1 for character in characters if character["previewOnly"]),
        "clips": sum(len(character["clips"]) for character in characters),
        "identityApprovalEstablished": False,
        "runtimeActivationEstablished": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
