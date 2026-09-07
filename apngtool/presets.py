"""Named transition presets.

Each entry is a description plus the Spec fields that differ from the defaults.
"""

from __future__ import annotations

PRESETS: dict[str, dict] = {
    "fade-out": dict(
        desc="暗転：黒でフェードアウト（最後は真っ黒のまま残る）",
        shape="uniform", mode="cover", color="black",
        duration=0.7, hold=0.6),
    "fade-in": dict(
        desc="明転：黒から明ける（最後は透明になって消える）",
        shape="uniform", mode="uncover", color="black",
        duration=0.7),
    "white-out": dict(
        desc="ホワイトアウト：白でフェードアウト",
        shape="uniform", mode="cover", color="white",
        duration=0.6, hold=0.5),
    "white-in": dict(
        desc="ホワイトイン：白から明ける",
        shape="uniform", mode="uncover", color="white",
        duration=0.7),
    "flash": dict(
        desc="フラッシュ：一瞬白く光って消える（回想・衝撃の合図に）",
        shape="uniform", mode="sweep", color="white",
        duration=0.5, band=255, ease="out"),
    "wipe-right": dict(
        desc="横ワイプ：左から右へ黒が覆う",
        shape="linear", mode="cover", direction="right",
        duration=0.55, feather=25, hold=0.5),
    "wipe-open-right": dict(
        desc="横ワイプ開き：黒が右へ抜けて画面が現れる",
        shape="linear", mode="uncover", direction="right",
        duration=0.55, feather=25),
    "wipe-down": dict(
        desc="縦ワイプ：上から下へ黒が覆う",
        shape="linear", mode="cover", direction="down",
        duration=0.55, feather=25, hold=0.5),
    "diagonal-wipe": dict(
        desc="斜めワイプ：左上から右下へ覆う",
        shape="diagonal", mode="cover", direction="down-right",
        duration=0.6, feather=25, hold=0.5),
    "curtain-close": dict(
        desc="暗幕：上下から閉じる",
        shape="split", mode="cover", axis="y",
        duration=0.7, feather=20, hold=0.5),
    "curtain-open": dict(
        desc="暗幕開き：中央から上下へ開く",
        shape="split", mode="uncover", axis="y", invert=True,
        duration=0.7, feather=20),
    "iris-out": dict(
        desc="アイリスアウト：円が絞られて閉じる",
        shape="radial", mode="cover", invert=True,
        duration=0.8, feather=12, hold=0.5),
    "iris-in": dict(
        desc="アイリスイン：円が開いて画面が現れる",
        shape="radial", mode="uncover",
        duration=0.8, feather=12),
    "blinds": dict(
        desc="ブラインド：横帯が同時に伸びて覆う",
        shape="blinds", mode="cover", count=10, axis="y",
        duration=0.6, feather=15, hold=0.5),
    "dissolve": dict(
        desc="ディゾルブ：砂状に溶けて覆う",
        shape="noise", mode="cover", block=6, seed=7,
        duration=0.8, feather=70, hold=0.5),
    "mosaic": dict(
        desc="モザイクディゾルブ：四角いブロックが埋まって覆う",
        shape="noise", mode="cover", block=24, seed=3,
        duration=0.8, feather=50, hold=0.5),
    "band-sweep": dict(
        desc="帯スイープ：黒帯が左から右へ通過する（軽い場面切替に）",
        shape="linear", mode="sweep", direction="right", color="black",
        duration=0.7, band=70, ease="linear"),
    "caption": dict(
        desc="テロップ：暗転してテキストを表示（--text で文面を変更）",
        shape="uniform", mode="cover", color="black",
        duration=1.0, hold=1.6, text="場面転換"),
}


def spec_kwargs(name: str) -> dict:
    """Preset values without the human-facing description."""
    if name not in PRESETS:
        raise KeyError(name)
    return {k: v for k, v in PRESETS[name].items() if k != "desc"}
