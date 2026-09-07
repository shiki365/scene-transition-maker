"""Command line interface."""

from __future__ import annotations

import argparse
import sys
import webbrowser
from pathlib import Path

from PIL import Image

from . import presets, preview
from .render import EASINGS, Spec, render_frames, save

# Spec fields a CLI flag may override on top of the preset.
OVERRIDES = (
    "size", "color", "duration", "hold", "fps", "ease", "feather", "band",
    "invert", "direction", "axis", "count", "block", "seed", "center", "iris",
    "mode", "text", "text_color", "font", "font_size", "loop",
)


def _size(value: str) -> tuple[int, int]:
    try:
        w, h = value.lower().split("x")
        return int(w), int(h)
    except ValueError:
        raise argparse.ArgumentTypeError("サイズは 1280x720 の形式で指定してください")


def _center(value: str) -> tuple[float, float]:
    try:
        x, y = value.split(",")
        return float(x), float(y)
    except ValueError:
        raise argparse.ArgumentTypeError("中心は 0.5,0.5 の形式で指定してください")


def _add_common(p: argparse.ArgumentParser) -> None:
    g = p.add_argument_group("見た目")
    g.add_argument("--size", type=_size, help="出力サイズ（既定 1280x720）")
    g.add_argument("--color", help="覆う色。black / white / #1a0f2b など")
    g.add_argument("--mode", choices=("cover", "uncover", "sweep"),
                   help="cover=覆う / uncover=開く / sweep=通過する")
    g.add_argument("--feather", type=int, help="境界のぼかし量 0-255（既定 40）")
    g.add_argument("--band", type=int, help="sweep の帯の幅 1-255")
    g.add_argument("--invert", action="store_true", default=None,
                   help="効果の進む向きを反転する")
    g.add_argument("--direction", choices=("right", "left", "up", "down",
                                           "down-right", "down-left",
                                           "up-right", "up-left"),
                   help="ワイプが進む向き")
    g.add_argument("--axis", choices=("x", "y"), help="暗幕・ブラインドの軸")
    g.add_argument("--count", type=int, help="ブラインドの本数")
    g.add_argument("--block", type=int, help="ディゾルブの粒の大きさ(px)")
    g.add_argument("--seed", type=int, help="ディゾルブの乱数シード")
    g.add_argument("--center", type=_center, help="アイリスの中心 0.5,0.5")
    g.add_argument("--iris", choices=("circle", "ellipse"), help="アイリスの形")

    t = p.add_argument_group("タイミング")
    t.add_argument("--duration", type=float, help="動きの秒数（既定 0.7）")
    t.add_argument("--hold", type=float, help="最後の絵を保持する秒数")
    t.add_argument("--fps", type=int, help="フレームレート（既定 24）")
    t.add_argument("--ease", choices=tuple(EASINGS),
                   help="速度変化（既定 in-out）")
    t.add_argument("--loop", type=int, help="再生回数。0 で無限（既定 1）")

    x = p.add_argument_group("テロップ")
    x.add_argument("--text", help="中央に出す文字。改行は \n")
    x.add_argument("--text-color", dest="text_color", help="文字色（既定 white）")
    x.add_argument("--font", help="フォントファイルのパス")
    x.add_argument("--font-size", dest="font_size", type=int, help="文字サイズ(px)")

    o = p.add_argument_group("出力")
    o.add_argument("--format", choices=("apng", "webp"), default="apng",
                   help="出力形式（既定 apng）")
    o.add_argument("--ext", help="拡張子。既定は apng→png, webp→webp")
    o.add_argument("--open", action="store_true",
                   help="生成後にブラウザで開いて確認する")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="make_transition.py",
        description="ココフォリアで使う場面転換用 APNG 素材を作ります。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="例:\n"
               "  python make_transition.py list\n"
               "  python make_transition.py make fade-out\n"
               "  python make_transition.py make iris-out --color \"#0d0b1a\" --duration 1.2\n"
               "  python make_transition.py make caption --text \"――  翌朝  ――\"\n"
               "  python make_transition.py all\n")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="プリセット一覧を表示")

    make = sub.add_parser("make", help="プリセットを1つ生成")
    make.add_argument("preset", choices=tuple(presets.PRESETS))
    make.add_argument("-o", "--out", help="出力先ファイル（既定 out/<preset>.png）")
    _add_common(make)

    every = sub.add_parser("all", help="全プリセットとプレビューHTMLを生成")
    every.add_argument("-o", "--out-dir", default="out", help="出力先フォルダ（既定 out）")
    _add_common(every)

    return p


def build_spec(name: str, args: argparse.Namespace) -> Spec:
    kwargs = presets.spec_kwargs(name)
    for key in OVERRIDES:
        value = getattr(args, key, None)
        if value is not None:
            kwargs[key] = value
    if isinstance(kwargs.get("text"), str):
        kwargs["text"] = kwargs["text"].replace("\n", "\n")
    return Spec(**kwargs)


def _extension(args: argparse.Namespace) -> str:
    if args.ext:
        return args.ext.lstrip(".")
    return "webp" if args.format == "webp" else "png"


def _emit(name: str, spec: Spec, path: Path, fmt: str) -> dict:
    frames, durations = render_frames(spec)
    save(frames, durations, path, fmt=fmt, loop=spec.loop)
    with Image.open(path) as encoded:
        count = getattr(encoded, "n_frames", 1)  # identical frames get merged
    total = sum(durations) / 1000
    loop = "無限ループ" if spec.loop == 0 else f"{spec.loop}回再生"
    print(f"  {path}  {spec.size[0]}x{spec.size[1]}  {count}枚  "
          f"{total:.2f}秒  {loop}  {preview.human_size(path.stat().st_size)}")
    return {"file": str(path), "name": name,
            "desc": presets.PRESETS[name]["desc"], "frames": count}


def main(argv: list[str] | None = None) -> int:
    # Keep Japanese readable when the output is piped to a file or another tool.
    for stream in (sys.stdout, sys.stderr):
        if stream.encoding and stream.encoding.lower().replace("-", "") != "utf8":
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)

    if args.cmd == "list":
        width = max(len(n) for n in presets.PRESETS)
        print("使えるプリセット:")
        for name, data in presets.PRESETS.items():
            print(f"  {name.ljust(width)}  {data['desc']}")
        print("")
        print("使い方:")
        print("  python make_transition.py make fade-out")
        print("      プリセットを1つ作る（out フォルダに出力）")
        print("  python make_transition.py make iris-out --color \"#0d0b1a\" --duration 1.2")
        print("      色や長さを変える")
        print("  python make_transition.py make caption --text \"翌朝\" --open")
        print("      テロップの文字を変えて、できたものをブラウザで開く")
        print("  python make_transition.py all --open")
        print("      全種類を作り直してプレビューを開く")
        print("  python make_transition.py make --help")
        print("      使えるオプションを全部表示")
        return 0

    fmt, ext = args.format, _extension(args)

    if args.cmd == "make":
        out = Path(args.out) if args.out else Path("out") / f"{args.preset}.{ext}"
        print("生成中...")
        _emit(args.preset, build_spec(args.preset, args), out, fmt)
        if args.open:
            webbrowser.open(out.resolve().as_uri())
        return 0

    out_dir = Path(args.out_dir)
    print(f"全 {len(presets.PRESETS)} 種類を生成中...")
    entries = [
        _emit(name, build_spec(name, args), out_dir / f"{name}.{ext}", fmt)
        for name in presets.PRESETS
    ]
    page = preview.write_preview(entries, out_dir)
    print("")
    print(f"完成しました。素材は {out_dir.resolve()} に入っています。")
    print(f"プレビュー: {page}")
    if args.open:
        webbrowser.open(page.resolve().as_uri())
    return 0
