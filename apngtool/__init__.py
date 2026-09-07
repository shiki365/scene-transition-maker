"""ココフォリア向けの場面転換 APNG 素材ジェネレータ。"""

from .presets import PRESETS
from .render import Spec, render_frames, render_to_file, save

__all__ = ["PRESETS", "Spec", "render_frames", "render_to_file", "save"]
