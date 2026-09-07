"""Frame rendering and APNG/WebP output."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps
from PIL.PngImagePlugin import Blend, Disposal

from . import fields

# Japanese-capable fonts shipped with Windows, best looking first.
FONT_CANDIDATES = (
    r"C:\Windows\Fonts\YuGothB.ttc",
    r"C:\Windows\Fonts\meiryob.ttc",
    r"C:\Windows\Fonts\YuGothM.ttc",
    r"C:\Windows\Fonts\meiryo.ttc",
    r"C:\Windows\Fonts\NotoSansJP-VF.ttf",
    r"C:\Windows\Fonts\msgothic.ttc",
)

EASINGS = {
    "linear": lambda t: t,
    "in": lambda t: t * t,
    "out": lambda t: 1 - (1 - t) ** 2,
    "in-out": lambda t: t * t * (3 - 2 * t),
}


@dataclass
class Spec:
    """Everything needed to render one transition."""

    shape: str = "uniform"          # see fields.BUILDERS
    mode: str = "cover"             # cover | uncover | sweep
    size: tuple[int, int] = (1280, 720)
    color: str = "black"
    duration: float = 0.7           # seconds of movement
    hold: float = 0.0               # seconds the last frame stays on screen
    fps: int = 24
    ease: str = "in-out"
    feather: int = 40               # edge softness, in field units (0-255)
    band: int = 80                  # sweep band width, in field units
    invert: bool = False            # flip the order pixels are reached in
    direction: str = "right"
    axis: str = "y"
    count: int = 10                 # blinds
    block: int = 1                  # dissolve pixel size
    seed: int | None = None
    center: tuple[float, float] = (0.5, 0.5)
    iris: str = "circle"            # circle | ellipse
    text: str | None = None
    text_color: str = "white"
    font: str | None = None
    font_size: int | None = None
    loop: int = 1                   # 0 = endless


def _rgb(color: str) -> tuple[int, int, int]:
    return ImageColor.getrgb(color)[:3]


def _clamp8(v: float) -> int:
    return 0 if v < 0 else 255 if v > 255 else round(v)


def build_field(spec: Spec) -> Image.Image:
    if spec.shape == "linear":
        fld = fields.linear(spec.size, spec.direction)
    elif spec.shape == "diagonal":
        fld = fields.diagonal(spec.size, spec.direction)
    elif spec.shape == "split":
        fld = fields.split(spec.size, spec.axis)
    elif spec.shape == "radial":
        fld = fields.radial(spec.size, spec.center, spec.iris)
    elif spec.shape == "blinds":
        fld = fields.blinds(spec.size, spec.count, spec.axis)
    elif spec.shape == "noise":
        fld = fields.noise(spec.size, spec.block, spec.seed)
    elif spec.shape == "uniform":
        fld = fields.uniform(spec.size)
    else:
        raise ValueError(f"unknown shape: {spec.shape}")
    return ImageOps.invert(fld) if spec.invert else fld


def _cover_lut(t: float, feather: int, lo: int = 0, hi: int = 255) -> list[int]:
    """Alpha ramp sweeping the field's own value range as t goes 0 -> 1.

    The edge starts where the first pixel is (lo) and ends one feather past the
    last one (hi), so the movement always fills the requested duration exactly
    -- including a flat field, where every pixel ramps together as a fade.
    """
    f = max(1, feather)
    edge = lo + t * ((hi - lo) + f)
    return [_clamp8((edge - v) / f * 255) for v in range(256)]


def _sweep_lut(t: float, band: int, lo: int = 0, hi: int = 255) -> list[int]:
    """A soft band travelling across the field (flash, passing bar)."""
    b = max(1, band)
    pos = lo - b + t * ((hi - lo) + 2 * b)
    return [_clamp8((1 - abs(v - pos) / b) * 255) for v in range(256)]


def resolve_font(spec: Spec) -> ImageFont.FreeTypeFont:
    size = spec.font_size or max(16, round(spec.size[1] * 0.09))
    paths = [spec.font] if spec.font else list(FONT_CANDIDATES)
    for path in paths:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    raise FileNotFoundError(
        "日本語フォントが見つかりません。--font でフォントファイルを指定してください。")


def _text_layer(spec: Spec) -> Image.Image:
    layer = Image.new("RGBA", spec.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = resolve_font(spec)
    spacing = round(font.size * 0.45)
    box = draw.multiline_textbbox((0, 0), spec.text, font=font,
                                  align="center", spacing=spacing)
    x = (spec.size[0] - (box[2] - box[0])) / 2 - box[0]
    y = (spec.size[1] - (box[3] - box[1])) / 2 - box[1]
    draw.multiline_text((x, y), spec.text, font=font, align="center",
                        spacing=spacing, fill=_rgb(spec.text_color) + (255,))
    return layer


def _text_alpha(mode: str, p: float) -> int:
    """Caption fades in after the cover has settled (and out before it lifts)."""
    v = (0.40 - p) / 0.25 if mode == "uncover" else (p - 0.35) / 0.25
    return _clamp8(v * 255)


def _scale_alpha(layer: Image.Image, alpha: int) -> Image.Image:
    out = layer.copy()
    out.putalpha(layer.getchannel("A").point(lambda v: v * alpha // 255))
    return out


def render_frames(spec: Spec) -> tuple[list[Image.Image], list[float]]:
    """Return the frames plus each frame's duration in milliseconds."""
    fld = build_field(spec)
    rgb = _rgb(spec.color)
    ease = EASINGS[spec.ease]
    text_layer = _text_layer(spec) if spec.text else None
    lo, hi = fld.getextrema()
    count = max(2, round(spec.duration * spec.fps))

    frames = []
    for i in range(count):
        p = i / (count - 1)
        t = ease(p)
        if spec.mode == "sweep":
            mask = fld.point(_sweep_lut(t, spec.band, lo, hi))
        else:
            mask = fld.point(_cover_lut(t, spec.feather, lo, hi))
            if spec.mode == "uncover":
                mask = ImageOps.invert(mask)
        frame = Image.new("RGBA", spec.size, rgb + (255,))
        frame.putalpha(mask)
        if text_layer is not None:
            alpha = _text_alpha(spec.mode, p)
            if alpha:
                frame.alpha_composite(_scale_alpha(text_layer, alpha))
        frames.append(frame)

    durations = [1000.0 / spec.fps] * count
    if spec.hold > 0:
        frames.append(frames[-1].copy())
        durations.append(spec.hold * 1000.0)
    return frames, durations


def save(frames: list[Image.Image], durations: list[float],
         target: str | Path | BinaryIO, fmt: str = "apng", loop: int = 1):
    """Write the animation. `target` is a path or an open binary file."""
    if isinstance(target, (str, Path)):
        target = Path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
    ms = [max(10, round(d)) for d in durations]
    head, rest = frames[0], frames[1:]
    if fmt == "webp":
        head.save(target, format="WEBP", save_all=True, append_images=rest,
                  duration=ms, loop=loop, lossless=True, method=6)
    else:
        # Each frame is a full replacement of the canvas, so SOURCE/NONE.
        # Pillow still crops to the changed area, which keeps the file small.
        head.save(target, format="PNG", save_all=True, append_images=rest,
                  duration=ms, loop=loop, optimize=True,
                  disposal=Disposal.OP_NONE, blend=Blend.OP_SOURCE)
    return target


def render_to_file(spec: Spec, path: str | Path, fmt: str = "apng") -> Path:
    frames, durations = render_frames(spec)
    return save(frames, durations, path, fmt=fmt, loop=spec.loop)


def render_to_bytes(spec: Spec, fmt: str = "apng") -> tuple[bytes, int]:
    """Render straight to memory. Returns the file bytes and the frame count."""
    frames, durations = render_frames(spec)
    buffer = BytesIO()
    save(frames, durations, buffer, fmt=fmt, loop=spec.loop)
    data = buffer.getvalue()
    with Image.open(BytesIO(data)) as encoded:
        return data, getattr(encoded, "n_frames", 1)
