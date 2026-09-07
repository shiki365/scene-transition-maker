"""Static HTML page for checking generated transitions in a browser."""

from __future__ import annotations

import html
from pathlib import Path

_CARD = """  <figure class="card" data-src="{src}">
    <div class="stage"><img src="{src}" alt="{name}"></div>
    <figcaption><b>{name}</b><span>{desc}</span><small>{size} / {frames}枚</small></figcaption>
  </figure>
"""

_PAGE = """<!doctype html>
<meta charset="utf-8">
<title>場面転換素材プレビュー</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; padding: 24px; background: #15161a; color: #e7e7ea;
         font-family: "Yu Gothic UI", "Meiryo", system-ui, sans-serif; }}
  h1 {{ font-size: 18px; margin: 0 0 4px; }}
  p.lead {{ margin: 0 0 20px; color: #9a9aa5; font-size: 13px; }}
  button {{ background: #2f3140; color: #e7e7ea; border: 1px solid #464a5e;
            border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }}
  button:hover {{ background: #3a3d4f; }}
  .grid {{ display: grid; gap: 16px; margin-top: 20px;
           grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }}
  .card {{ margin: 0; background: #1e1f26; border: 1px solid #303240;
           border-radius: 10px; overflow: hidden; cursor: pointer; }}
  .card:hover {{ border-color: #6b70ff; }}
  .stage {{ position: relative; aspect-ratio: 16 / 9;
            background:
              repeating-linear-gradient(0deg, #ffffff14 0 1px, transparent 1px 40px),
              repeating-linear-gradient(90deg, #ffffff14 0 1px, transparent 1px 40px),
              linear-gradient(135deg, #3b5a6b, #6b4b5a 55%, #4a4b6b); }}
  .stage::after {{ content: "SCENE"; position: absolute; inset: 0; display: grid;
                   place-items: center; font-size: 34px; font-weight: 700;
                   letter-spacing: .3em; color: #ffffff40; }}
  .stage img {{ position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }}
  figcaption {{ padding: 10px 12px; display: grid; gap: 3px; }}
  figcaption b {{ font-size: 14px; }}
  figcaption span {{ font-size: 12px; color: #b6b6c2; }}
  figcaption small {{ font-size: 11px; color: #7d7d8a; }}
</style>
<h1>場面転換素材プレビュー</h1>
<p class="lead">カードをクリックすると再生し直します。背景の「SCENE」が隠れる／現れる様子で効果を確認してください。</p>
<button id="replay-all">すべて再生</button>
<div class="grid">
{cards}</div>
<script>
  const replay = card => {{
    const img = card.querySelector("img");
    img.src = card.dataset.src + "?" + Date.now();
  }};
  document.querySelectorAll(".card").forEach(c => c.addEventListener("click", () => replay(c)));
  document.getElementById("replay-all")
    .addEventListener("click", () => document.querySelectorAll(".card").forEach(replay));
</script>
"""


def human_size(num: int) -> str:
    return f"{num / 1024:.1f} KB" if num < 1024 * 1024 else f"{num / 1048576:.2f} MB"


def write_preview(entries: list[dict], out_dir: str | Path) -> Path:
    """`entries` items: {file, name, desc, frames}."""
    out_dir = Path(out_dir)
    cards = "".join(
        _CARD.format(
            src=html.escape(Path(e["file"]).name),
            name=html.escape(e["name"]),
            desc=html.escape(e["desc"]),
            size=human_size(Path(e["file"]).stat().st_size),
            frames=e["frames"],
        )
        for e in entries
    )
    path = out_dir / "preview.html"
    path.write_text(_PAGE.format(cards=cards), encoding="utf-8")
    return path
