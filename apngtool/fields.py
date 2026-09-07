"""Progress fields used to build transition masks.

A *field* is an 8-bit ("L") image with the same size as the output. Each pixel
value is the moment that pixel is reached by the transition: 0 = first,
255 = last. Every geometric effect is a field plus a per-frame lookup table, so
one renderer covers wipes, curtains, irises and dissolves alike.
"""

from __future__ import annotations

import math
import random

from PIL import Image, ImageChops

Size = tuple[int, int]

_NEAREST = Image.Resampling.NEAREST


def _strip(values: list[int], size: Size, horizontal: bool) -> Image.Image:
    """Stretch a 1-D ramp across the whole frame."""
    if horizontal:
        strip = Image.new("L", (len(values), 1))
    else:
        strip = Image.new("L", (1, len(values)))
    strip.putdata(values)
    return strip.resize(size, _NEAREST)


def uniform(size: Size) -> Image.Image:
    """Every pixel changes at the same time (plain fade / flash)."""
    return Image.new("L", size, 0)


def linear(size: Size, direction: str = "right") -> Image.Image:
    """Straight wipe. `direction` is where the edge travels to."""
    horizontal = direction in ("right", "left")
    n = size[0] if horizontal else size[1]
    ramp = [round(255 * i / max(1, n - 1)) for i in range(n)]
    if direction in ("left", "up"):
        ramp.reverse()
    return _strip(ramp, size, horizontal)


def diagonal(size: Size, direction: str = "down-right") -> Image.Image:
    """Wipe running across a corner, e.g. "down-right"."""
    horizontal = "left" if "left" in direction else "right"
    vertical = "up" if "up" in direction else "down"
    return ImageChops.blend(linear(size, horizontal), linear(size, vertical), 0.5)


def split(size: Size, axis: str = "y") -> Image.Image:
    """Curtain: starts at both edges of `axis` and meets in the middle."""
    horizontal = axis == "x"
    n = size[0] if horizontal else size[1]
    ramp = [round(255 * (1 - abs(2 * i / max(1, n - 1) - 1))) for i in range(n)]
    return _strip(ramp, size, horizontal)


def radial(size: Size, center: tuple[float, float] = (0.5, 0.5),
           shape: str = "circle") -> Image.Image:
    """Iris: 0 at `center` (relative coords), 255 at the farthest corner.

    Computed per pixel rather than by scaling Image.radial_gradient(), whose
    values only run up to 181 in the region we need. Spanning the full range
    keeps `feather` meaning the same thing here as in every other field.
    """
    w, h = size
    cx, cy = center[0] * w, center[1] * h
    if shape == "ellipse":
        # Ellipse with the frame's aspect ratio that still touches the corners.
        rx = max(cx, w - cx) * math.sqrt(2)
        ry = max(cy, h - cy) * math.sqrt(2)
    else:
        rx = ry = max(math.hypot(cx - x, cy - y) for x in (0, w) for y in (0, h))

    data = bytearray(w * h)
    hypot = math.hypot
    for y in range(h):
        dy = (y - cy) / ry
        row = y * w
        for x in range(w):
            value = int(255 * hypot((x - cx) / rx, dy) + 0.5)
            data[row + x] = 255 if value > 255 else value
    return Image.frombytes("L", size, bytes(data))


def blinds(size: Size, count: int = 10, axis: str = "y") -> Image.Image:
    """Venetian blinds: `count` bars that all grow in the same direction."""
    horizontal = axis == "x"
    n = size[0] if horizontal else size[1]
    seg = n / max(1, count)
    ramp = [round(255 * ((i % seg) / seg)) for i in range(n)]
    return _strip(ramp, size, horizontal)


def noise(size: Size, block: int = 1, seed: int | None = None) -> Image.Image:
    """Dissolve. `block` > 1 gives chunky mosaic pixels instead of grain."""
    w, h = size
    block = max(1, block)
    bw, bh = max(1, w // block), max(1, h // block)
    rnd = random.Random(seed)
    field = Image.frombytes("L", (bw, bh), rnd.randbytes(bw * bh))
    return field if (bw, bh) == size else field.resize(size, _NEAREST)


BUILDERS = {
    "uniform": uniform,
    "linear": linear,
    "diagonal": diagonal,
    "split": split,
    "radial": radial,
    "blinds": blinds,
    "noise": noise,
}
