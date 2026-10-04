/*!
 * app.v7.js - 場面転換素材メーカー (browser edition)
 *
 * Effects are not drawn one by one. Each one is a "progress field": a
 * greyscale image whose pixel value says when that pixel is reached
 * (0 = first, 255 = last). A per-frame lookup table turns the field into the
 * alpha channel, so wipes, irises and dissolves all share one renderer.
 *
 * The first 18 presets mirror apngtool/presets.py in the desktop version and
 * render exactly as they did in v1.x. The shapes, timing curves and options
 * added in v2.0 (wave, ink, drip, clock, spiral, form, tiles; round trip,
 * reverse, reach, edge colour, caption styles) exist only in the browser.
 * v2.2 adds rings and the colour strobe (the whole layer switches between two colours).
 * "turn" is the one shape whose field moves: it is rebuilt for every frame at that frame's angle.
 * v2.4: the page also speaks English and Korean (i18n.v1.js). Texts stay Japanese in this file and go
 * through t() where they reach the page; the Japanese text is the dictionary key.
 */
(function () {
  "use strict";

  const t = (text, vars) => (window.I18n ? window.I18n.t(text, vars) : text);

  const DEFAULTS = {
    shape: "uniform", mode: "cover", size: [1280, 720], color: "#000000",
    duration: 0.7, hold: 0, fps: 24, ease: "in-out", feather: 40, band: 80,
    invert: false, direction: "right", axis: "y", count: 10, block: 1, seed: 7,
    center: [0.5, 0.5], iris: "circle", text: "", textColor: "#ffffff",
    fontSize: null, loop: 1,
    variant: "", order: "direction", amount: 50, reach: 100, reverse: false,
    edge: false, edgeColor: "#ff8a1f", font: "gothic", textPos: "center", textOutline: false,
    strobe: 0, color2: "#000000", edgeSolid: false, fontName: "",
  };

  const GROUPS = ["暗転・明転", "ワイプ", "幕・帯", "形で閉じる・開く", "模様", "ホラー・雰囲気", "テロップ", "サイバー", "異空間・反転"];

  // A preset that sets `loop` itself needs it (a heartbeat has to repeat), so it overrides
  // the user's choice; every other preset leaves the loop setting alone.
  const PRESETS = {
    "fade-out": { group: 0, desc: "暗転：黒でフェードアウト（最後は真っ黒のまま残る）",
      shape: "uniform", mode: "cover", color: "#000000", duration: 0.7, hold: 0.6 },
    "fade-in": { group: 0, desc: "明転：黒から明ける（最後は透明になって消える）",
      shape: "uniform", mode: "uncover", color: "#000000", duration: 0.7 },
    "white-out": { group: 0, desc: "ホワイトアウト：白でフェードアウト",
      shape: "uniform", mode: "cover", color: "#ffffff", duration: 0.6, hold: 0.5 },
    "white-in": { group: 0, desc: "ホワイトイン：白から明ける",
      shape: "uniform", mode: "uncover", color: "#ffffff", duration: 0.7 },
    "flash": { group: 0, desc: "フラッシュ：一瞬白く光って消える（回想・衝撃の合図に）",
      shape: "uniform", mode: "sweep", color: "#ffffff", duration: 0.5, band: 255, ease: "out" },
    "wipe-right": { group: 1, desc: "横ワイプ：左から右へ黒が覆う",
      shape: "linear", mode: "cover", direction: "right", duration: 0.55, feather: 25, hold: 0.5 },
    "wipe-open-right": { group: 1, desc: "横ワイプ開き：黒が右へ抜けて画面が現れる",
      shape: "linear", mode: "uncover", direction: "right", duration: 0.55, feather: 25 },
    "wipe-down": { group: 1, desc: "縦ワイプ：上から下へ黒が覆う",
      shape: "linear", mode: "cover", direction: "down", duration: 0.55, feather: 25, hold: 0.5 },
    "diagonal-wipe": { group: 1, desc: "斜めワイプ：左上から右下へ覆う",
      shape: "diagonal", mode: "cover", direction: "down-right", duration: 0.6, feather: 25, hold: 0.5 },
    "curtain-close": { group: 2, desc: "暗幕：上下から閉じる",
      shape: "split", mode: "cover", axis: "y", duration: 0.7, feather: 20, hold: 0.5 },
    "curtain-open": { group: 2, desc: "暗幕開き：中央から上下へ開く",
      shape: "split", mode: "uncover", axis: "y", invert: true, duration: 0.7, feather: 20 },
    "iris-out": { group: 3, desc: "アイリスアウト：円が絞られて閉じる",
      shape: "radial", mode: "cover", invert: true, duration: 0.8, feather: 12, hold: 0.5 },
    "iris-in": { group: 3, desc: "アイリスイン：円が開いて画面が現れる",
      shape: "radial", mode: "uncover", duration: 0.8, feather: 12 },
    "blinds": { group: 2, desc: "ブラインド：横帯が同時に伸びて覆う",
      shape: "blinds", mode: "cover", count: 10, axis: "y", duration: 0.6, feather: 15, hold: 0.5 },
    "dissolve": { group: 4, desc: "ディゾルブ：砂状に溶けて覆う",
      shape: "noise", mode: "cover", block: 6, seed: 7, duration: 0.8, feather: 70, hold: 0.5 },
    "mosaic": { group: 4, desc: "モザイクディゾルブ：四角いブロックが埋まって覆う",
      shape: "noise", mode: "cover", block: 24, seed: 3, duration: 0.8, feather: 50, hold: 0.5 },
    "band-sweep": { group: 1, desc: "帯スイープ：黒帯が左から右へ通過する（軽い場面切替に）",
      shape: "linear", mode: "sweep", direction: "right", color: "#000000",
      duration: 0.7, band: 70, ease: "linear" },
    "caption": { group: 6, desc: "テロップ：暗転して文字を表示",
      shape: "uniform", mode: "cover", color: "#000000", duration: 1.0, hold: 1.6, text: "場面転換" },

    // ---- v2.0
    "fade-roundtrip": { group: 0, desc: "暗転→明転（1 枚で）：暗くなって少し止まり、また明ける",
      shape: "uniform", mode: "roundtrip", duration: 0.6, hold: 0.8 },
    "lightning": { group: 0, desc: "稲光：白く 2〜3 回光って消える（雷・衝撃の場面に）",
      shape: "uniform", mode: "cover", color: "#ffffff", ease: "lightning", duration: 1.0, reach: 85 },
    "blackout": { group: 0, desc: "停電：明かりがちらついてから暗転する",
      shape: "uniform", mode: "cover", color: "#000000", ease: "flicker", duration: 1.4, hold: 0.6 },
    "wave-wipe": { group: 1, desc: "波ワイプ：波打つ境目で左から覆う",
      shape: "wave", variant: "sine", mode: "cover", direction: "right", count: 3, amount: 40,
      feather: 20, duration: 0.8, hold: 0.5 },
    "zigzag-wipe": { group: 1, desc: "ギザギザワイプ：のこぎりの歯のような境目で上から覆う",
      shape: "wave", variant: "zigzag", mode: "cover", direction: "down", count: 12, amount: 30,
      feather: 6, duration: 0.7, hold: 0.5 },
    "clock-wipe": { group: 1, desc: "時計ワイプ：12 時から時計回りに覆う",
      shape: "clock", variant: "clock", mode: "cover", feather: 4, duration: 0.9, hold: 0.5 },
    "spiral": { group: 1, desc: "渦巻き：外側から渦を巻いて中心へ覆う",
      shape: "spiral", mode: "cover", count: 3, feather: 16, duration: 1.2, hold: 0.5 },
    "glow-wipe": { group: 1, desc: "光るワイプ：光の筋が走り抜けて覆う",
      shape: "linear", mode: "cover", direction: "right", feather: 60, edge: true, edgeColor: "#a8e0ff",
      duration: 0.7, hold: 0.5 },
    "doors-open": { group: 2, desc: "観音開き：中央から左右へ開いて画面が現れる",
      shape: "split", mode: "uncover", axis: "x", invert: true, feather: 10, duration: 0.8 },
    "cinema-bars": { group: 2, desc: "シネマ（黒帯）：上下に黒帯が入って止まる（回想・ムービーシーンに）",
      shape: "split", mode: "cover", axis: "y", reach: 24, feather: 1, duration: 0.6, hold: 0.5 },
    "star-out": { group: 3, desc: "星で閉じる：星の形に絞られて閉じる",
      shape: "form", variant: "star", mode: "cover", invert: true, feather: 4, duration: 0.9, hold: 0.5 },
    "heart-out": { group: 3, desc: "ハートで閉じる：ハートの形に絞られて閉じる",
      shape: "form", variant: "heart", mode: "cover", invert: true, feather: 4, duration: 0.9, hold: 0.5 },
    "diamond-in": { group: 3, desc: "ひし形で開く：ひし形に開いて画面が現れる",
      shape: "form", variant: "diamond", mode: "uncover", feather: 6, duration: 0.8 },
    "bounce-iris": { group: 3, desc: "はずむアイリス：円がはずみながら開く（ポップな場面に）",
      shape: "radial", mode: "uncover", ease: "bounce", feather: 6, duration: 1.0 },
    "tiles": { group: 4, desc: "タイル：四角が左上から次々に広がって覆う",
      shape: "tiles", variant: "square", order: "direction", direction: "down-right", count: 16,
      feather: 8, duration: 0.9, hold: 0.5 },
    "dots": { group: 4, desc: "水玉：丸が左から次々に広がって覆う",
      shape: "tiles", variant: "circle", order: "direction", direction: "right", count: 20,
      feather: 8, duration: 0.9, hold: 0.5 },
    "checker": { group: 4, desc: "チェッカー：市松模様に 2 回に分けて覆う",
      shape: "tiles", variant: "square", order: "checker", count: 8, feather: 4, duration: 0.8, hold: 0.5 },
    "blood-drip": { group: 5, desc: "血のしたたり：赤黒い液が上から垂れて覆う",
      shape: "drip", mode: "cover", color: "#5c0008", count: 22, amount: 60, seed: 11,
      feather: 8, ease: "in", duration: 1.6, hold: 0.6 },
    "ink-spread": { group: 5, desc: "墨のにじみ：中心から墨がにじんで広がる",
      shape: "ink", variant: "circle", mode: "cover", color: "#0b0b10", amount: 50, seed: 5,
      feather: 24, duration: 1.3, hold: 0.5 },
    "burn": { group: 5, desc: "焼け焦げ：縁を赤く光らせながら下から焼け落ちる",
      shape: "ink", variant: "line", direction: "up", mode: "cover", color: "#140a05", amount: 70, seed: 9,
      feather: 40, edge: true, edgeColor: "#ff7a1a", duration: 1.5, hold: 0.5 },
    "vignette": { group: 5, desc: "ふちを暗く：画面のまわりだけ暗くして止まる（回想・不穏な場面に）",
      shape: "radial", iris: "ellipse", mode: "cover", invert: true, reach: 42, feather: 150,
      duration: 1.0, hold: 0.5 },
    "heartbeat": { group: 5, desc: "鼓動：赤いふちがドクン、ドクンと脈打つ（ずっとループ）",
      shape: "radial", iris: "ellipse", mode: "cover", invert: true, reach: 40, feather: 150,
      color: "#8f0010", ease: "heartbeat", duration: 1.1, loop: 0 },
    "caption-mincho": { group: 6, desc: "テロップ（明朝）：暗転して明朝体の文字を表示（和風・ホラーに）",
      shape: "uniform", mode: "cover", color: "#000000", duration: 1.2, hold: 1.8,
      text: "――  翌朝  ――", font: "mincho" },
    "caption-only": { group: 6, desc: "字幕だけ：画面はそのまま、下に文字を出して消す",
      shape: "uniform", mode: "roundtrip", reach: 0, duration: 0.5, hold: 2.0,
      text: "とある洋館にて", textPos: "bottom", textOutline: true },

    // ---- v2.1
    "glitch": { group: 7, desc: "グリッチ：横に裂けたノイズの帯が走って覆う",
      shape: "glitch", mode: "cover", color: "#070b1a", count: 26, seed: 13, feather: 30,
      edge: true, edgeColor: "#00e5ff", ease: "flicker", duration: 0.9, hold: 0.5 },
    "digital-rain": { group: 7, desc: "デジタルレイン：光る四角が列ごとに降って覆う",
      shape: "rain", mode: "cover", color: "#02120a", count: 48, seed: 21, feather: 25,
      edge: true, edgeColor: "#39ff88", ease: "in", duration: 1.4, hold: 0.5 },
    "scanline": { group: 7, desc: "走査線：1 行おきに上から走り、残りの行を埋める",
      shape: "scan", mode: "cover", color: "#05070f", count: 72, feather: 20,
      edge: true, edgeColor: "#7df9ff", ease: "linear", duration: 0.9, hold: 0.5 },
    "hex-grid": { group: 7, desc: "ヘックス：六角形のマスが中心から次々に広がって覆う",
      shape: "hex", mode: "cover", order: "center", color: "#0a0f24", count: 14, feather: 10,
      edge: true, edgeColor: "#3fa9ff", duration: 1.0, hold: 0.5 },
    "data-corrupt": { group: 7, desc: "データ破損：ちらつくブロックノイズで覆う",
      shape: "noise", mode: "cover", color: "#0b0014", block: 16, seed: 5, feather: 90,
      edge: true, edgeColor: "#ff2bd6", ease: "flicker", duration: 1.0, hold: 0.5 },
    "caption-cyber": { group: 7, desc: "テロップ（サイバー）：暗転して等幅の文字を表示",
      shape: "uniform", mode: "cover", color: "#03060c", duration: 0.8, hold: 1.6,
      text: "SYSTEM REBOOT", font: "mono", textColor: "#39ff88" },

    // ---- v2.2
    // The flips close on a glowing line and stop there; the open one starts from that same line,
    // so the scene can be switched in between. edgeSolid keeps the line opaque while it waits.
    "flip-over": { group: 8, desc: "裏返る（閉じる）：上下から一気に閉じて、光る 1 本の線で止まる（空間がひっくり返る合図に）",
      shape: "split", mode: "cover", axis: "y", color: "#0c0618", feather: 30, reach: 96, edgeSolid: true,
      edge: true, edgeColor: "#f3eaff", ease: "in", duration: 0.35, hold: 0.5 },
    "flip-open": { group: 8, desc: "裏返る（開く）：光る 1 本の線から上下に開く（「閉じる」「回って裏返る」のあとに）",
      shape: "split", mode: "cover", axis: "y", color: "#0c0618", feather: 30, reach: 96, edgeSolid: true,
      edge: true, edgeColor: "#f3eaff", ease: "in", duration: 0.35, reverse: true },
    "flip-turn": { group: 8, desc: "回って裏返る（閉じる）：半回転しながら閉じて、光る 1 本の線で止まる（開くのは「裏返る（開く）」で）",
      shape: "turn", mode: "cover", color: "#0c0618", feather: 30, reach: 96, amount: 50, edgeSolid: true,
      edge: true, edgeColor: "#f3eaff", ease: "in-out", duration: 0.6, hold: 0.5 },
    "negative": { group: 8, desc: "ネガのちらつき：白と黒が入れ替わりながら点滅して明ける（点滅します）",
      shape: "uniform", mode: "cover", color: "#ffffff", strobe: 4, color2: "#000000",
      ease: "negative", reach: 88, duration: 1.6 },
    "inverse-ripple": { group: 8, desc: "反転の波紋：覆う輪と透ける輪が交互に中心から広がり、すき間が埋まる",
      shape: "rings", mode: "cover", color: "#12002a", count: 8, feather: 12,
      edge: true, edgeColor: "#c9a2ff", ease: "in-out", duration: 1.2, hold: 0.5 },
  };

  // Choices that change meaning with the shape: [value, label] pairs plus the row's label.
  const VARIANTS = {
    form: ["形", [["star", "星"], ["heart", "ハート"], ["diamond", "ひし形"], ["square", "四角"], ["hexagon", "六角形"]]],
    clock: ["回り方", [["clock", "時計回り"], ["fan", "両側から（扇）"]]],
    wave: ["境目の形", [["sine", "なみ"], ["zigzag", "ギザギザ"], ["square", "凸凹"]]],
    tiles: ["マスの形", [["square", "四角"], ["circle", "丸"], ["diamond", "ひし形"]]],
    ink: ["広がり方", [["line", "向きに沿って"], ["circle", "中心から"]]],
  };
  // The "count" slider: [label, min, max] per shape.
  const COUNTS = {
    blinds: ["本数", 2, 40], wave: ["波の数", 1, 16], drip: ["しずくの数", 4, 60],
    tiles: ["横のマス数", 3, 40], spiral: ["巻き数", 1, 8],
    glitch: ["帯の数", 6, 60], rain: ["列の数", 8, 120], scan: ["走査線の数", 8, 180], hex: ["横のマス数", 4, 40],
    rings: ["輪の数", 2, 24],
  };
  const AMOUNTS = { wave: "波の高さ", ink: "にじみの強さ", drip: "しずくの長さ", turn: "回る角度" };
  // "turn": the amount slider (0..100) is the angle turned while closing, up to a full turn.
  const turnDegrees = amount => amount * 3.6;

  function bounce(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d;
    return n * t * t + 0.984375;
  }
  /** Jumps to 1 at `start`, stays there briefly so every frame rate catches it, then fades over `length`. */
  const burst = (p, start, length) => (p < start ? 0 : p < start + 0.04 ? 1
    : Math.max(0, 1 - (p - start - 0.04) / length) ** 2);
  /** A smooth bump centred on `mid`, zero outside mid ± half. */
  const bump = (p, mid, half) => { const x = (p - mid) / half; return Math.abs(x) >= 1 ? 0 : (1 - x * x) ** 2; };
  // Flicker: [from, level] steps, then a smooth fall into darkness from 0.56.
  const FLICKER = [[0, 0], [0.07, 0.85], [0.11, 0.05], [0.19, 0.9], [0.22, 0], [0.3, 0.7], [0.33, 0.15], [0.44, 1], [0.49, 0.25]];
  function flicker(p) {
    if (p >= 0.56) { const x = (p - 0.56) / 0.44; return 0.25 + 0.75 * x * x * (3 - 2 * x); }
    let level = 0;
    for (const [from, value] of FLICKER) if (p >= from) level = value;
    return level;
  }

  const EASINGS = {
    "linear": t => t,
    "in": t => t * t,
    "out": t => 1 - (1 - t) * (1 - t),
    "in-out": t => t * t * (3 - 2 * t),
    "bounce": bounce,
    "flicker": flicker,
    "lightning": p => Math.min(1, Math.max(burst(p, 0.02, 0.12), 0.6 * burst(p, 0.2, 0.1), burst(p, 0.36, 0.4))),
    "heartbeat": p => Math.max(bump(p, 0.14, 0.12), 0.7 * bump(p, 0.4, 0.12)),
    // Up at once, held while the colours switch (see STROBE_END), then a fall back to clear.
    "negative": p => (p < 0.03 ? p / 0.03 : p < STROBE_END ? 1 : (1 - (p - STROBE_END) / (1 - STROBE_END)) ** 2),
  };

  // The colour strobe switches colours evenly over this part of the move and keeps the last one after it.
  const STROBE_END = 0.75;

  const PREVIEW_WIDTH = 480;
  const PREVIEW_PAUSE = 1200;                       // ms on the last frame before the preview repeats
  const CCFOLIA_LIMIT = 5 * 1024 * 1024;            // CCFOLIA rejects image uploads of 5 MB or more (its bundle, 2026-09-24)
  const SAVE_KEY = "ccf-scene-transition.state";
  const FONTS = {
    gothic: '"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif',
    mincho: '"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif',
    mono: '"Consolas","Menlo","Courier New","Yu Gothic UI","Meiryo",monospace',
  };
  // Caption fonts from Google Fonts: [family, weight, fallback]. Loaded only when chosen, one weight each.
  // The weights were checked against fonts.googleapis.com/css2 for status-bar-maker (2026-09-14).
  const WEB_FONTS = {
    notosans: ["Noto Sans JP", 700, "gothic"],
    zenmaru: ["Zen Maru Gothic", 700, "gothic"],
    mplusround: ["M PLUS Rounded 1c", 700, "gothic"],
    kosugimaru: ["Kosugi Maru", 400, "gothic"],
    delagothic: ["Dela Gothic One", 400, "gothic"],
    mochiypop: ["Mochiy Pop One", 400, "gothic"],
    reggae: ["Reggae One", 400, "gothic"],
    dotgothic: ["DotGothic16", 400, "gothic"],
    hachimaru: ["Hachi Maru Pop", 400, "gothic"],
    klee: ["Klee One", 600, "gothic"],
    kurenaido: ["Zen Kurenaido", 400, "gothic"],
    notoserif: ["Noto Serif JP", 700, "mincho"],
    shippori: ["Shippori Mincho B1", 700, "mincho"],
    zenold: ["Zen Old Mincho", 700, "mincho"],
    kaisei: ["Kaisei Decol", 700, "mincho"],
    zenantique: ["Zen Antique", 400, "mincho"],
    yujisyuku: ["Yuji Syuku", 400, "mincho"],
    yujiboku: ["Yuji Boku", 400, "mincho"],
    orbitron: ["Orbitron", 700, "gothic"],
    sharetech: ["Share Tech Mono", 400, "mono"],
    pressstart: ["Press Start 2P", 400, "gothic"],
    cinzel: ["Cinzel", 700, "mincho"],
    // Hangul (v2.4). Weights checked against fonts.googleapis.com/css2 on 2026-10-04.
    notosanskr: ["Noto Sans KR", 700, "gothic"],
    jua: ["Jua", 400, "gothic"],
    blackhansans: ["Black Han Sans", 400, "gothic"],
    nanumpen: ["Nanum Pen Script", 400, "gothic"],
    notoserifkr: ["Noto Serif KR", 700, "mincho"],
    nanummyeongjo: ["Nanum Myeongjo", 700, "mincho"],
  };
  const quoteFamily = name => '"' + name.replace(/["\\]/g, "\\$&") + '"';

  /** The canvas font for a caption. The three built-in choices keep their v2.x strings exactly. */
  function captionFont(spec, size) {
    const web = WEB_FONTS[spec.font];
    if (web) return web[1] + " " + size + "px " + quoteFamily(web[0]) + "," + FONTS[web[2]];
    if (spec.font === "pc" && spec.fontName) return "bold " + size + "px " + quoteFamily(spec.fontName) + "," + FONTS.gothic;
    return "bold " + size + "px " + (FONTS[spec.font] || FONTS.gothic);
  }

  const fontLinks = new Set();
  /**
   * Make sure a Google Fonts caption font is ready before drawing (the canvas does not wait for it).
   * Only the letters in the caption are fetched (unicode-range). Resolves false if it could not load.
   */
  async function ensureFont(spec) {
    const web = WEB_FONTS[spec.font];
    if (!web || !spec.text) return true;
    const [family, weight] = web;
    if (!fontLinks.has(family)) {
      fontLinks.add(family);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + family.replace(/ /g, "+") + ":wght@" + weight + "&display=block";
      const ready = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
      document.head.append(link);
      await ready;
    }
    const face = weight + " 40px " + quoteFamily(family);
    try {
      const found = await Promise.race([
        document.fonts.load(face, spec.text),
        new Promise(resolve => setTimeout(() => resolve([]), 10000)),
      ]);
      return found.length > 0;
    } catch (err) {
      return false;
    }
  }
  // How strongly the edge colour shows at each coverage value: none when clear or covered, full halfway.
  const EDGE = Uint8Array.from({ length: 256 }, (_, c) => Math.round(255 * Math.sin(Math.PI * c / 255)));

  // ---------------------------------------------------------------- fields

  function ramp(n, reverse) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(255 * i / Math.max(1, n - 1));
    return reverse ? out.reverse() : out;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Smooth value noise, 0..1, one lattice cell per unit. */
  function noise2(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /** Five octaves of value noise, 0..1: blotchy at large scale, ragged at small. */
  function fbm(x, y, seed) {
    let sum = 0, amp = 0.5, freq = 1;
    for (let o = 0; o < 5; o++) {
      sum += amp * noise2(x * freq, y * freq, seed + o * 101);
      amp *= 0.5;
      freq *= 2;
    }
    return sum / 0.96875;
  }

  const DIRS = {
    "right": [1, 0], "left": [-1, 0], "down": [0, 1], "up": [0, -1],
    "down-right": [1, 1], "down-left": [-1, 1], "up-right": [1, -1], "up-left": [-1, -1],
  };

  /** 0 where a move in `dir` starts and 1 where it ends. u, v run 0..1 across and down. */
  function along(dir, u, v) {
    const [dx, dy] = dir;
    let sum = 0;
    if (dx) sum += dx > 0 ? u : 1 - u;
    if (dy) sum += dy > 0 ? v : 1 - v;
    return sum / (Math.abs(dx) + Math.abs(dy));
  }

  /** Position along the moving edge, 0..1. */
  function across(dir, u, v) {
    const [dx, dy] = dir;
    if (!dx) return u;
    if (!dy) return v;
    return ((dx > 0 ? u : 1 - u) - (dy > 0 ? v : 1 - v) + 1) / 2;
  }

  const WAVES = {
    sine: x => Math.sin(2 * Math.PI * x),
    zigzag: x => 1 - 4 * Math.abs(x - Math.floor(x) - 0.5),
    square: x => Math.tanh(5 * Math.sin(2 * Math.PI * x)),
  };

  const TILE_SHAPES = {
    square: (a, b) => Math.max(Math.abs(a), Math.abs(b)),
    circle: (a, b) => Math.hypot(a, b) / Math.SQRT2,
    diamond: (a, b) => (Math.abs(a) + Math.abs(b)) / 2,
  };

  function regular(corners, inner) {
    const n = inner ? corners * 2 : corners;
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const r = inner && i % 2 ? inner : 1;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
  }

  // Outlines around the origin, y pointing down. The heart is the classic parametric
  // curve, shifted so the origin sits where every ray leaves it only once.
  const POLYGONS = {
    star: regular(5, 0.42),
    heart: Array.from({ length: 240 }, (_, i) => {
      const t = i / 240 * 2 * Math.PI;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [x / 17, -(y + 2.5) / 17];
    }),
    diamond: [[0, -1], [1, 0], [0, 1], [-1, 0]],
    square: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    hexagon: regular(6, 0),
  };

  /** Distance from the origin to the outline, sampled at 4096 angles (index 4096 = 360°). */
  const radiusTables = {};
  function radiusTable(name) {
    if (radiusTables[name]) return radiusTables[name];
    const points = POLYGONS[name] || POLYGONS.star;
    const n = 4096, table = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const a = i / n * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
      let best = 0;
      for (let k = 0; k < points.length; k++) {
        const [x1, y1] = points[k], [x2, y2] = points[(k + 1) % points.length];
        const ex = x2 - x1, ey = y2 - y1;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-12) continue;
        const t = (x1 * ey - y1 * ex) / denom;      // how far along the ray
        const s = (x1 * dy - y1 * dx) / denom;      // where on the edge
        if (t > best && s >= 0 && s <= 1) best = t;
      }
      table[i] = best;
    }
    return (radiusTables[name] = table);
  }

  /** Spread any real-valued map over 0..255, lowest value first. */
  function toField(values, field) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const scale = hi > lo ? 255 / (hi - lo) : 0;
    for (let i = 0; i < values.length; i++) field[i] = Math.round((values[i] - lo) * scale);
  }

  /** The largest distance from (cx, cy) to a corner. */
  const farthest = (cx, cy, w, h) => Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy),
    Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));

  /** Angle from 12 o'clock, clockwise, in turns (0..1). */
  function turnsFromTop(dx, dy) {
    const a = Math.atan2(dx, -dy);
    return (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI);
  }

  function buildField(spec) {
    const [w, h] = spec.size;
    const field = new Uint8Array(w * h);

    if (spec.shape === "linear") {
      const horizontal = spec.direction === "right" || spec.direction === "left";
      const line = ramp(horizontal ? w : h,
        spec.direction === "left" || spec.direction === "up");
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "diagonal") {
      const across = ramp(w, spec.direction.includes("left"));
      const down = ramp(h, spec.direction.includes("up"));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = (across[x] + down[y]) >> 1;
      }
    } else if (spec.shape === "split") {
      const horizontal = spec.axis === "x";
      const n = horizontal ? w : h;
      const line = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        line[i] = Math.round(255 * (1 - Math.abs(2 * i / Math.max(1, n - 1) - 1)));
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "blinds") {
      const horizontal = spec.axis === "x";
      const n = horizontal ? w : h;
      const segment = n / Math.max(1, spec.count);
      const line = new Uint8Array(n);
      for (let i = 0; i < n; i++) line[i] = Math.round(255 * ((i % segment) / segment));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "radial") {
      const cx = spec.center[0] * w, cy = spec.center[1] * h;
      let rx, ry;
      if (spec.iris === "ellipse") {
        rx = Math.max(cx, w - cx) * Math.SQRT2;
        ry = Math.max(cy, h - cy) * Math.SQRT2;
      } else {
        rx = ry = farthest(cx, cy, w, h);
      }
      for (let y = 0; y < h; y++) {
        const dy = (y - cy) / ry;
        for (let x = 0; x < w; x++) {
          const dx = (x - cx) / rx;
          field[y * w + x] = Math.min(255, Math.round(255 * Math.hypot(dx, dy)));
        }
      }
    } else if (spec.shape === "noise") {
      const block = Math.max(1, spec.block);
      const bw = Math.max(1, Math.floor(w / block)), bh = Math.max(1, Math.floor(h / block));
      const random = mulberry32(spec.seed == null ? 7 : spec.seed);
      const cells = new Uint8Array(bw * bh);
      for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(random() * 256);
      for (let y = 0; y < h; y++) {
        const row = Math.min(bh - 1, Math.floor(y * bh / h)) * bw;
        for (let x = 0; x < w; x++) {
          field[y * w + x] = cells[row + Math.min(bw - 1, Math.floor(x * bw / w))];
        }
      }
    } else if (spec.shape === "turn") {
      // Two bars closing on a line through the centre, like "split", with the line at spec.angle.
      // Their reach is measured to the farthest corner at that angle, so nothing is covered at t = 0.
      const a = (spec.angle || 0) * Math.PI / 180;
      const nx = -Math.sin(a), ny = Math.cos(a);
      const reach = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
      for (let y = 0; y < h; y++) {
        const dy = (y + 0.5 - h / 2) * ny;
        for (let x = 0; x < w; x++) {
          const d = Math.abs((x + 0.5 - w / 2) * nx + dy);
          field[y * w + x] = Math.max(0, Math.round(255 * (1 - d / reach)));
        }
      }
    } else if (spec.shape !== "uniform") {
      // The v2.0 shapes work in floating point and are spread over 0..255 at the end.
      const values = new Float32Array(w * h);
      realField(spec, values);
      toField(values, field);
    }
    // "uniform" leaves the field at zero: every pixel changes together.

    let lo = 255, hi = 0;
    for (let i = 0; i < field.length; i++) {
      let v = field[i];
      if (spec.invert) { v = 255 - v; field[i] = v; }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { field, lo, hi };
  }

  function realField(spec, values) {
    const [w, h] = spec.size;
    const aspect = w / h;
    const dir = DIRS[spec.direction] || DIRS.right;
    const cx = spec.center[0] * w, cy = spec.center[1] * h;
    const seed = spec.seed == null ? 7 : spec.seed;

    if (spec.shape === "wave") {
      const amp = spec.amount / 100 * 0.15;
      const wave = WAVES[spec.variant] || WAVES.sine;
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          values[y * w + x] = along(dir, u, v) + amp * wave(spec.count * across(dir, u, v));
        }
      }
    } else if (spec.shape === "ink") {
      const k = spec.amount / 100 * 0.6;
      const circle = spec.variant === "circle";
      const far = farthest(cx, cy, w, h);
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          const base = circle ? Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / far : along(dir, u, v);
          values[y * w + x] = base + k * (fbm(u * aspect * 3, v * 3, seed) - 0.5);
        }
      }
    } else if (spec.shape === "drip") {
      // Each drip is a finger hanging from the top with a round tip; the main front is a little uneven.
      const random = mulberry32(seed);
      const length = spec.amount / 100 * 0.55;
      const drops = [];
      for (let i = 0; i < spec.count; i++) {
        drops.push({ at: random(), half: 0.004 + random() * 0.01, reach: 0.25 + 0.75 * random() });
      }
      const lead = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        let e = 0.03 * noise2(u * 8, 0.5, seed);
        for (const d of drops) {
          const du = Math.abs(u - d.at) / d.half;
          if (du >= 1) continue;
          const radius = d.half * aspect;                 // tip radius, in screen heights
          const tip = length * d.reach - radius * (1 - Math.sqrt(1 - du * du));
          if (tip > e) e = tip;
        }
        lead[x] = e;
      }
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) values[y * w + x] = v - lead[x];
      }
    } else if (spec.shape === "clock") {
      const fan = spec.variant === "fan";
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const turn = turnsFromTop(x + 0.5 - cx, y + 0.5 - cy);
          values[y * w + x] = fan ? 1 - Math.abs(1 - 2 * turn) : turn;
        }
      }
    } else if (spec.shape === "spiral") {
      // An Archimedean spiral: one full turn moves the edge one step towards the centre.
      const turns = Math.max(1, spec.count);
      const far = farthest(cx, cy, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const r = Math.hypot(dx, dy) / far;
          values[y * w + x] = (turns * (1 - r) + turnsFromTop(dx, dy)) / (turns + 1);
        }
      }
    } else if (spec.shape === "form") {
      const table = radiusTable(spec.variant);
      const n = table.length - 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          let a = Math.atan2(dy, dx);
          if (a < 0) a += 2 * Math.PI;
          const f = a / (2 * Math.PI) * n, i = Math.min(n - 1, Math.floor(f));
          const radius = table[i] + (table[i + 1] - table[i]) * (f - i);
          values[y * w + x] = Math.hypot(dx, dy) / Math.max(1e-6, radius);
        }
      }
    } else if (spec.shape === "tiles") {
      // Every tile grows from its own centre; `order` staggers when each tile starts.
      const nx = Math.max(1, spec.count), ny = Math.max(1, Math.round(spec.count * h / w));
      const cw = w / nx, ch = h / ny;
      const random = mulberry32(seed);
      const order = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const u = (i + 0.5) / nx, v = (j + 0.5) / ny;
          order[j * nx + i] = spec.order === "center" ? Math.hypot((u - spec.center[0]) * aspect, v - spec.center[1])
            : spec.order === "random" ? random()
            : spec.order === "checker" ? (i + j) % 2
            : along(dir, u, v);
        }
      }
      let lo = Infinity, hi = -Infinity;
      for (const o of order) { if (o < lo) lo = o; if (o > hi) hi = o; }
      const span = hi > lo ? hi - lo : 1;
      const spread = spec.order === "checker" ? 0.5 : 0.6;
      const local = TILE_SHAPES[spec.variant] || TILE_SHAPES.square;
      for (let y = 0; y < h; y++) {
        const j = Math.min(ny - 1, Math.floor(y / ch));
        const b = (y + 0.5 - (j + 0.5) * ch) / (ch / 2);
        for (let x = 0; x < w; x++) {
          const i = Math.min(nx - 1, Math.floor(x / cw));
          const a = (x + 0.5 - (i + 0.5) * cw) / (cw / 2);
          values[y * w + x] = (order[j * nx + i] - lo) / span * spread + local(a, b) * (1 - spread);
        }
      }
    } else if (spec.shape === "glitch") {
      // Horizontal bands of random height (in screen fractions, so the preview matches the export),
      // each swept from a random side at a random moment, its edge broken into jagged segments.
      const random = mulberry32(seed);
      const bands = [];
      const avg = 1 / Math.max(2, spec.count);
      for (let v0 = 0; v0 < 1;) {
        const v1 = Math.min(1, v0 + avg * (0.25 + random() * 1.5));
        bands.push({ end: v1, order: random(), left: random() < 0.5 });
        v0 = v1;
      }
      let b = 0;
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        while (b < bands.length - 1 && v >= bands[b].end) b++;
        const band = bands[b];
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          const jag = (hash2(b, Math.floor(u * 14), seed) - 0.5) * 0.12;
          values[y * w + x] = band.order * 0.7 + ((band.left ? u : 1 - u) + jag) * 0.3;
        }
      }
    } else if (spec.shape === "rain") {
      // Square cells in columns; every column falls from the top starting at its own moment.
      // The thin gaps between cells fill last, so the grid shows until the very end.
      const cols = Math.max(4, spec.count);
      const cell = w / cols;
      const rows = Math.max(1, Math.ceil(h / cell));
      for (let y = 0; y < h; y++) {
        const row = Math.floor(y / cell), fy = y / cell - row;
        for (let x = 0; x < w; x++) {
          const col = Math.floor(x / cell), fx = x / cell - col;
          const gap = cell >= 6 && (fx < 0.08 || fx > 0.92 || fy < 0.08 || fy > 0.92);
          values[y * w + x] = gap ? 1.05
            : hash2(col, 0, seed) * 0.45 + (row / rows) * 0.55 + hash2(col, row, seed + 1) * 0.04;
        }
      }
    } else if (spec.shape === "scan") {
      // Interlaced scan: every other line top to bottom, then the lines in between.
      const lines = Math.max(2, spec.count);
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        const value = (Math.floor(v * lines) % 2) * 0.5 + v * 0.5;
        for (let x = 0; x < w; x++) values[y * w + x] = value;
      }
    } else if (spec.shape === "rings") {
      // Rings round the centre: every other ring grows outwards first, then the rings in between.
      const far = farthest(cx, cy, w, h);
      const n = Math.max(1, spec.count);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const r = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / far);
          values[y * w + x] = (Math.min(n - 1, Math.floor(r * n)) % 2) * 0.5 + r * 0.5;
        }
      }
    } else if (spec.shape === "hex") {
      // Flat-topped hexagons, each growing from its own centre like the tiles, in the same orders.
      const size = w / (Math.max(1, spec.count) * 1.5);   // centre to corner, in pixels
      const S3 = Math.sqrt(3);
      const qs = new Int16Array(w * h), rs = new Int16Array(w * h);
      const cells = new Map();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = x + 0.5, py = y + 0.5;
          const fq = (2 / 3 * px) / size, fr = (-px / 3 + S3 / 3 * py) / size, fs = -fq - fr;
          let q = Math.round(fq), r = Math.round(fr);
          const s = Math.round(fs);
          const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
          if (dq > dr && dq > ds) q = -r - s;
          else if (dr > ds) r = -q - s;
          qs[y * w + x] = q; rs[y * w + x] = r;
          const key = q * 4096 + r;
          if (!cells.has(key)) {
            const cx = size * 1.5 * q, cy = size * S3 * (r + q / 2);
            const u = cx / w, v = cy / h;
            cells.set(key, spec.order === "center" ? Math.hypot((u - spec.center[0]) * aspect, v - spec.center[1])
              : spec.order === "random" ? hash2(q, r, seed)
              : spec.order === "checker" ? (((q - r) % 3) + 3) % 3
              : along(dir, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))));
          }
        }
      }
      let lo = Infinity, hi = -Infinity;
      for (const o of cells.values()) { if (o < lo) lo = o; if (o > hi) hi = o; }
      const span = hi > lo ? hi - lo : 1;
      const spread = spec.order === "checker" ? 2 / 3 : 0.6;   // checker: three groups one after another
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = y * w + x, q = qs[k], r = rs[k];
          const dx = Math.abs(x + 0.5 - size * 1.5 * q), dy = Math.abs(y + 0.5 - size * S3 * (r + q / 2));
          const local = Math.min(1, Math.max(dy / (S3 / 2 * size), (dx + dy / S3) / size));
          values[k] = (cells.get(q * 4096 + r) - lo) / span * spread + local * (1 - spread);
        }
      }
    }
  }

  // ------------------------------------------------------------ frame maths

  const clamp8 = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  function coverLut(t, feather, lo, hi) {
    const f = Math.max(1, feather);
    const edge = lo + t * ((hi - lo) + f);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp8((edge - v) / f * 255);
    return lut;
  }

  function sweepLut(t, band, lo, hi) {
    const b = Math.max(1, band);
    const pos = lo - b + t * ((hi - lo) + 2 * b);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp8((1 - Math.abs(v - pos) / b) * 255);
    return lut;
  }

  function parseColor(value) {
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = "#000000";
    probe.fillStyle = value;
    const hex = probe.fillStyle;
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function textLayer(spec) {
    const [w, h] = spec.size;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const size = spec.fontSize || Math.max(16, Math.round(h * 0.09));
    g.font = captionFont(spec, size);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lines = spec.text.split("\n");
    const lineHeight = size * 1.45;
    const middle = spec.textPos === "bottom" ? h * 0.82 : spec.textPos === "top" ? h * 0.18 : h / 2;
    const top = middle - (lines.length - 1) * lineHeight / 2;
    if (spec.textOutline) {
      // Dark rim for light text and the other way round, so it reads over any scene.
      const [r, gr, b] = parseColor(spec.textColor);
      g.strokeStyle = 0.299 * r + 0.587 * gr + 0.114 * b > 140 ? "#000000" : "#ffffff";
      g.lineWidth = Math.max(2, size * 0.14);
      g.lineJoin = "round";
      lines.forEach((line, i) => g.strokeText(line, w / 2, top + i * lineHeight));
    }
    g.fillStyle = spec.textColor;
    lines.forEach((line, i) => g.fillText(line, w / 2, top + i * lineHeight));
    return g.getImageData(0, 0, w, h).data;
  }

  /**
   * Caption opacity at time p of one move. It fades in while the screen is being covered and
   * out early while it opens. The first two branches are the v1.x formulas, kept as written.
   */
  function textAlpha(mode, step) {
    const p = step.p;
    const v = mode === "uncover" ? (0.40 - p) / 0.25 : step.rising ? (p - 0.35) / 0.25 : (p - 0.6) / 0.25;
    return clamp8(v * 255);
  }

  /** Draw the caption over the colour layer (plain source-over). */
  function compose(frame, layer, alpha) {
    for (let i = 0; i < frame.length; i += 4) {
      const sa = layer[i + 3] * alpha / 65025;
      if (sa <= 0) continue;
      const da = frame[i + 3] / 255;
      const out = sa + da * (1 - sa);
      if (out <= 0) continue;
      frame[i] = (layer[i] * sa + frame[i] * da * (1 - sa)) / out;
      frame[i + 1] = (layer[i + 1] * sa + frame[i + 1] * da * (1 - sa)) / out;
      frame[i + 2] = (layer[i + 2] * sa + frame[i + 2] * da * (1 - sa)) / out;
      frame[i + 3] = out * 255;
    }
  }

  function identical(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  const frameCount = spec => Math.max(2, Math.round(spec.duration * spec.fps));

  /**
   * The frames to draw, in order, as { p, rising, hold }: p is the time through one move (0..1),
   * rising says the screen is being covered, hold is extra time on that frame in ms.
   * A round trip goes there and back and holds in the middle; reverse flips the whole list.
   */
  function timeline(spec) {
    const count = frameCount(spec);
    const steps = [];
    for (let i = 0; i < count; i++) {
      steps.push({ p: i / (count - 1), rising: spec.mode !== "uncover", hold: 0 });
    }
    steps[count - 1].hold = spec.hold > 0 ? spec.hold * 1000 : 0;
    if (spec.mode === "roundtrip") {
      for (let i = count - 2; i >= 0; i--) steps.push({ p: i / (count - 1), rising: false, hold: 0 });
    }
    return spec.reverse ? steps.reverse() : steps;
  }

  /** Every frame in order as { pixels, delay }. */
  function* frameStream(spec) {
    const [w, h] = spec.size;
    let { field, lo, hi } = buildField(spec);
    const first = parseColor(spec.color);
    const second = spec.strobe > 0 ? parseColor(spec.color2 || "#000000") : first;
    const [er, eg, eb] = parseColor(spec.edgeColor || "#000000");
    const ease = EASINGS[spec.ease] || EASINGS["in-out"];
    const layer = spec.text ? textLayer(spec) : null;
    const reach = spec.reach == null ? 1 : spec.reach / 100;
    const uncover = spec.mode === "uncover";
    const tr = new Uint8Array(256), tg = new Uint8Array(256), tb = new Uint8Array(256), ta = new Uint8Array(256);

    for (const step of timeline(spec)) {
      const t = ease(step.p) * reach;
      if (spec.shape === "turn") {
        // Turn while closing, and keep turning the same way while a round trip opens again.
        const turn = turnDegrees(spec.amount), e = ease(step.p);
        ({ field, lo, hi } = buildField(Object.assign({}, spec, { angle: step.rising ? turn * e : turn * (2 - e) })));
      }
      // With a strobe, the move is cut into `strobe` even parts that take the two colours in turn.
      const part = spec.strobe > 0 ? Math.min(spec.strobe - 1, Math.floor(step.p / STROBE_END * spec.strobe)) : 0;
      const [r, g, b] = part % 2 ? second : first;
      const lut = spec.mode === "sweep"
        ? sweepLut(t, spec.band, lo, hi) : coverLut(t, spec.feather, lo, hi);
      // Colour and alpha for each field value, so the pixel loop is a plain table lookup.
      for (let v = 0; v < 256; v++) {
        const c = lut[v];
        let a = uncover ? 255 - c : c;
        if (spec.edge) {
          const e = EDGE[c];
          if (e > a) a = e;
          // A solid edge: opaque from the halfway point inwards, with only a soft glow outside it.
          if (spec.edgeSolid && !uncover) a = c >= 128 ? 255 : Math.max(a, Math.min(255, 2 * e));
          tr[v] = r + Math.round((er - r) * e / 255);
          tg[v] = g + Math.round((eg - g) * e / 255);
          tb[v] = b + Math.round((eb - b) * e / 255);
        } else {
          tr[v] = r; tg[v] = g; tb[v] = b;
        }
        ta[v] = a;
      }
      const pixels = new Uint8ClampedArray(w * h * 4);
      for (let k = 0, j = 0; k < field.length; k++, j += 4) {
        const v = field[k];
        pixels[j] = tr[v];
        pixels[j + 1] = tg[v];
        pixels[j + 2] = tb[v];
        pixels[j + 3] = ta[v];
      }
      if (layer) {
        const alpha = textAlpha(spec.mode, step);
        if (alpha) compose(pixels, layer, alpha);
      }
      yield { pixels, delay: 1000 / spec.fps + step.hold };
    }
  }

  /** All frames at once, for the preview. */
  function renderFrames(spec) {
    const frames = [], delays = [];
    for (const { pixels, delay } of frameStream(spec)) {
      // A frame that changes nothing just extends the previous one's delay.
      if (frames.length && identical(frames[frames.length - 1], pixels)) {
        delays[delays.length - 1] += delay;
        continue;
      }
      frames.push(pixels);
      delays.push(delay);
    }
    return { frames, delays, width: spec.size[0], height: spec.size[1] };
  }

  // ------------------------------------------------------------- previewing

  function shrink(spec) {
    const [w, h] = spec.size;
    if (w <= PREVIEW_WIDTH) return spec;
    const ratio = PREVIEW_WIDTH / w;
    return Object.assign({}, spec, {
      size: [PREVIEW_WIDTH, Math.max(2, Math.round(h * ratio))],
      block: Math.max(1, Math.round(spec.block * ratio)),
      fontSize: spec.fontSize ? Math.max(8, Math.round(spec.fontSize * ratio)) : null,
    });
  }

  class Player {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d");
      this.timer = null;
    }
    load(render, loop) {
      this.stop();
      this.render = render;
      this.loop = loop;
      this.canvas.width = render.width;
      this.canvas.height = render.height;
      this.play();
    }
    play() {
      if (!this.render) return;
      this.stop();
      this.step(0);
    }
    step(index) {
      const { frames, delays, width, height } = this.render;
      this.context.putImageData(new ImageData(frames[index], width, height), 0, 0);
      const last = index === frames.length - 1;
      // The file itself may play once and stop, but the preview starts over after a pause,
      // so a fade-out never just sits there as a black box.
      const wait = delays[index] + (last && this.loop !== 0 ? PREVIEW_PAUSE : 0);
      this.timer = setTimeout(() => this.step(last ? 0 : index + 1), wait);
    }
    stop() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // --------------------------------------------------------------------- UI

  const $ = id => document.getElementById(id);
  const el = {};
  for (const id of ["preset", "desc", "color", "edge", "edgeColor", "size", "feather", "direction", "axis",
    "count", "block", "iris", "centerX", "centerY", "band", "variant", "order", "amount", "seed",
    "duration", "hold", "ease", "fps", "loop", "text", "textColor", "fontSize", "font", "textPos",
    "textOutline", "mode", "invert", "reverse", "reach", "format", "strobe", "color2", "fontName"]) {
    el[id] = $(id);
  }
  const stage = $("stage"), status = $("status");
  const player = new Player($("preview"));
  const KEEP_NOTE = "（切り替えても、出力サイズ・なめらかさ・くり返し・形式・入力したテロップはそのまま）";
  let timer = null;
  let currentPreset = null;
  let webpReady = true;                               // until WEBP.supported() says otherwise

  /** The preset's values; its sample caption is in the page's language. */
  function preset(name) {
    const p = Object.assign({}, DEFAULTS, PRESETS[name]);
    if (p.text) p.text = t(p.text);
    return p;
  }
  const forcesLoop = name => Object.prototype.hasOwnProperty.call(PRESETS[name], "loop");

  const outputHeight = () => Number(el.size.value.split("x")[1]) || 720;

  /** Fill the shape-dependent choices and slider range before any value is set. */
  function configureShape(shape) {
    const variants = VARIANTS[shape];
    el.variant.replaceChildren();
    if (variants) {
      $("variantLabel").textContent = t(variants[0]);
      for (const [value, label] of variants[1]) el.variant.append(new Option(t(label), value));
    }
    const count = COUNTS[shape];
    if (count) {
      $("countLabel").textContent = t(count[0]);
      el.count.min = count[1];
      el.count.max = count[2];
    }
    if (AMOUNTS[shape]) $("amountLabel").textContent = t(AMOUNTS[shape]);
  }

  // The output settings belong to the user, not to the effect, so switching presets keeps them.
  // A caption the user typed stays as well; a preset's own sample caption is swapped like any other value.
  function applyPreset(name) {
    const p = preset(name);
    const first = currentPreset === null;
    const keepText = !first && el.text.value.trim() !== preset(currentPreset).text;
    const resetLoop = first || forcesLoop(name) || forcesLoop(currentPreset);
    currentPreset = name;
    configureShape(p.shape);
    el.desc.textContent = t(p.desc) + t(KEEP_NOTE);
    el.color.value = p.color;
    el.edge.checked = p.edge;
    el.edgeColor.value = p.edgeColor;
    if (first) {
      el.size.value = p.size.join("x");
      el.fps.value = p.fps;
    }
    if (resetLoop) el.loop.checked = p.loop === 0;
    if (!keepText) {
      el.text.value = p.text;
      el.textColor.value = p.textColor;
      el.fontSize.value = p.fontSize || Math.round(outputHeight() * 0.09);
      el.font.value = p.font;
      el.textPos.value = p.textPos;
      el.textOutline.checked = p.textOutline;
    }
    el.feather.value = p.feather;
    el.direction.value = p.direction;
    el.axis.value = p.axis;
    const range = COUNTS[p.shape];
    el.count.value = range ? Math.min(range[2], Math.max(range[1], p.count)) : p.count;
    el.block.value = Math.min(60, p.block);
    el.iris.value = p.iris;
    el.centerX.value = p.center[0];
    el.centerY.value = p.center[1];
    el.band.value = p.band;
    if (p.variant) el.variant.value = p.variant;
    el.order.value = p.order;
    el.amount.value = p.amount;
    el.seed.value = p.seed;
    el.duration.value = p.duration;
    el.hold.value = p.hold;
    el.ease.value = p.ease;
    el.mode.value = p.mode;
    el.invert.checked = p.invert;
    el.reverse.checked = p.reverse;
    el.reach.value = p.reach;
    el.strobe.value = p.strobe;
    el.color2.value = p.color2;
    syncRows();
  }

  function syncRows() {
    const shape = preset(el.preset.value).shape;
    const variant = el.variant.value, order = el.order.value;
    const tiled = shape === "tiles" || shape === "hex";
    const show = {
      rowDirection: ["linear", "diagonal", "wave"].includes(shape)
        || (shape === "ink" && variant === "line") || (tiled && order === "direction"),
      rowAxis: shape === "split" || shape === "blinds",
      rowCount: shape in COUNTS,
      rowBlock: shape === "noise",
      rowIris: shape === "radial",
      rowCenter: ["radial", "form", "clock", "spiral", "rings"].includes(shape)
        || (shape === "ink" && variant === "circle") || (tiled && order === "center"),
      rowVariant: shape in VARIANTS,
      rowOrder: tiled,
      rowAmount: shape in AMOUNTS,
      rowSeed: ["noise", "ink", "drip", "glitch", "rain"].includes(shape) || (tiled && order === "random"),
      rowBand: el.mode.value === "sweep",
      rowEdgeColor: el.edge.checked,
      rowColor2: Number(el.strobe.value) > 0,
      rowFontName: el.font.value === "pc",
    };
    for (const [row, visible] of Object.entries(show)) $(row).classList.toggle("hidden", !visible);
    $("featherOut").value = el.feather.value;
    $("countOut").value = el.count.value;
    $("blockOut").value = el.block.value + "px";
    $("bandOut").value = el.band.value;
    $("amountOut").value = shape === "turn" ? turnDegrees(Number(el.amount.value)) + "°" : el.amount.value;
    $("seedOut").value = "#" + el.seed.value;
    $("reachOut").value = el.reach.value + "%";
    $("strobeOut").value = Number(el.strobe.value) > 0 ? t("{n}回", { n: el.strobe.value }) : t("しない");
    $("durationOut").value = Number(el.duration.value).toFixed(2) + "s";
    $("holdOut").value = Number(el.hold.value).toFixed(1) + "s";
    $("fontSizeOut").value = el.fontSize.value;
    $("holdLabel").textContent = t(el.mode.value === "roundtrip" ? "途中で止める秒数" : "静止の秒数");
    $("formatNote").textContent = t(!webpReady
      ? "このブラウザでは WebP を作れないため、APNG で保存します（Chrome・Edge なら WebP を作れます）。"
      : el.format.value === "webp"
        ? "APNG の数分の 1 の大きさになります。ココフォリアで動くことを確かめてあります。"
        : "5MB を超えると、ココフォリアではアップロード時に圧縮されて動かなくなります。WebP を使えない場所向けです。");
  }

  function currentSpec() {
    const [w, h] = el.size.value.split("x").map(Number);
    return {
      shape: preset(el.preset.value).shape,
      edgeSolid: preset(el.preset.value).edgeSolid,
      mode: el.mode.value,
      size: [w, h],
      color: el.color.value,
      duration: Number(el.duration.value),
      hold: Number(el.hold.value),
      fps: Number(el.fps.value),
      ease: el.ease.value,
      feather: Number(el.feather.value),
      band: Number(el.band.value),
      invert: el.invert.checked,
      direction: el.direction.value,
      axis: el.axis.value,
      count: Number(el.count.value),
      block: Number(el.block.value),
      seed: Number(el.seed.value),
      center: [Number(el.centerX.value), Number(el.centerY.value)],
      iris: el.iris.value,
      text: el.text.value.trim(),
      textColor: el.textColor.value,
      fontSize: Number(el.fontSize.value),
      loop: el.loop.checked ? 0 : 1,
      variant: el.variant.value,
      order: el.order.value,
      amount: Number(el.amount.value),
      reach: Number(el.reach.value),
      reverse: el.reverse.checked,
      edge: el.edge.checked,
      edgeColor: el.edgeColor.value,
      font: el.font.value,
      textPos: el.textPos.value,
      textOutline: el.textOutline.checked,
      strobe: Number(el.strobe.value),
      color2: el.color2.value,
      fontName: el.fontName.value.trim(),
    };
  }

  const FONT_MISSING = "（書体を読み込めなかったため、代わりの書体で表示しています。インターネットにつながっているか確かめてください）";
  let drawing = 0;

  async function refresh() {
    const ticket = ++drawing;
    const spec = currentSpec();
    let fontOk = true;
    if (WEB_FONTS[spec.font] && spec.text) {
      status.textContent = t("書体を読み込んでいます…");
      fontOk = await ensureFont(spec);
      if (ticket !== drawing) return;                 // a newer change is already on its way
    }
    const render = renderFrames(shrink(spec));
    player.load(render, spec.loop);
    const seconds = render.delays.reduce((sum, d) => sum + d, 0) / 1000;
    status.classList.remove("error");
    status.textContent = t("出力 {size} / {frames}コマ / {seconds}秒 / ", {
      size: el.size.value, frames: render.frames.length, seconds: seconds.toFixed(2),
    }) + t(spec.loop === 0 ? "ずっとループ" : "1回だけ再生（プレビューはくり返し表示）")
      + (fontOk ? "" : t(FONT_MISSING));
  }

  function schedule() {
    syncRows();
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }

  // ------------------------------------------------------ undo & autosave

  // The whole form is the project: undo, redo and autosave are snapshots of its values.
  const history = { undo: [], redo: [], last: null };
  const FIELDS = Object.keys(el).filter(id => id !== "preset" && id !== "desc");

  function snapshot() {
    const out = { preset: el.preset.value };
    for (const id of FIELDS) out[id] = el[id].type === "checkbox" ? el[id].checked : el[id].value;
    return JSON.stringify(out);
  }

  function restore(snap) {
    let data;
    try { data = JSON.parse(snap); } catch (err) { return false; }
    if (!data || !PRESETS[data.preset]) return false;
    // Start from the preset so a save from an older version still gets sensible new fields.
    el.preset.value = data.preset;
    currentPreset = null;
    applyPreset(data.preset);
    for (const id of FIELDS) {
      if (!(id in data)) continue;
      const input = el[id];
      if (input.type === "checkbox") input.checked = !!data[id];
      else input.value = data[id];
      if (input.tagName === "SELECT" && input.selectedIndex < 0) input.selectedIndex = 0;
    }
    if (!webpReady) el.format.value = "apng";
    syncRows();
    return true;
  }

  function save(snap) {
    try { localStorage.setItem(SAVE_KEY, snap); } catch (err) { /* storage may be blocked */ }
  }

  function updateHistoryButtons() {
    $("undo").disabled = !history.undo.length;
    $("redo").disabled = !history.redo.length;
  }

  function commit() {
    const snap = snapshot();
    if (snap === history.last) return;
    if (history.last !== null) {
      history.undo.push(history.last);
      if (history.undo.length > 150) history.undo.shift();
    }
    history.redo.length = 0;
    history.last = snap;
    updateHistoryButtons();
    save(snap);
  }

  function jump(from, to) {
    if (!from.length) return;
    to.push(history.last);
    history.last = from.pop();
    restore(history.last);
    updateHistoryButtons();
    save(history.last);
    refresh();
  }

  $("form").addEventListener("input", event => {
    if (event.target === el.preset) {
      applyPreset(el.preset.value);
      refresh();
    } else {
      schedule();
    }
  });
  // "change" fires once a value is settled (slider released, text field left), which makes one undo step.
  $("form").addEventListener("change", commit);
  $("undo").addEventListener("click", () => jump(history.undo, history.redo));
  $("redo").addEventListener("click", () => jump(history.redo, history.undo));
  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.target.matches("input[type=text], textarea")) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); jump(history.undo, history.redo); }
    else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); jump(history.redo, history.undo); }
  });
  $("reseed").addEventListener("click", () => {
    let next;
    do { next = 1 + Math.floor(Math.random() * 9999); } while (String(next) === el.seed.value);
    el.seed.value = next;
    // A hidden input fires nothing by itself; send the same events a slider would.
    el.seed.dispatchEvent(new Event("input", { bubbles: true }));
    el.seed.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("replay").addEventListener("click", () => player.play());

  let backgroundUrl = null;
  function setBackground(button) {
    stage.className = "stage " + button.dataset.bg;
    stage.style.backgroundImage = button.dataset.bg === "custom" && backgroundUrl ? "url(" + backgroundUrl + ")" : "";
    for (const other of $("bgSeg").children) other.setAttribute("aria-pressed", other === button);
  }
  $("bgSeg").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.bg === "custom") $("bgFile").click();
    else setBackground(button);
  });
  // The picture only goes into the preview's CSS; it is never uploaded or saved.
  $("bgFile").addEventListener("change", () => {
    const file = $("bgFile").files[0];
    if (!file) return;
    if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    backgroundUrl = URL.createObjectURL(file);
    setBackground($("bgSeg").querySelector("[data-bg=custom]"));
    $("bgFile").value = "";
  });

  /** A file name from the preset's label, safe on Windows. */
  function fileName(ext) {
    const label = el.preset.selectedOptions[0].text.replace(/[\\/:*?"<>|]/g, "_");
    return label + (el.reverse.checked ? t("（逆再生）") : "") + ext;
  }

  $("download").addEventListener("click", async () => {
    const button = $("download");
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = t("書き出し中...");
    await new Promise(resolve => setTimeout(resolve, 30));   // let the message paint
    try {
      const spec = currentSpec();
      await ensureFont(spec);
      const webp = webpReady && el.format.value === "webp";
      // Frames go to the encoder one by one, so only the previous one stays in memory.
      const encoder = webp
        ? WEBP.encoder(spec.size[0], spec.size[1], spec.loop)
        : APNG.encoder(spec.size[0], spec.size[1], spec.loop);
      const count = timeline(spec).length;
      let done = 0;
      for (const { pixels, delay } of frameStream(spec)) {
        await encoder.add(pixels, delay);
        status.textContent = t("書き出し中... {done} / {count} コマ", { done: ++done, count });
      }
      const result = encoder.finish();
      const name = fileName(webp ? ".webp" : ".png");
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      const bytes = result.blob.size;
      const sizeText = bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : (bytes / 1024).toFixed(1) + " KB";
      status.textContent = t("{name} を保存しました（{size} / {frames}コマ / {bytes}）", {
        name, size: spec.size.join("x"), frames: result.frames, bytes: sizeText,
      });
      if (bytes >= CCFOLIA_LIMIT) {
        status.classList.add("error");
        const lighter = t(spec.shape === "noise"
          ? "出力サイズを小さくする・なめらかさを下げる・動きの秒数を短くする・粒を大きくすると軽くなります。"
          : "出力サイズを小さくする・なめらかさを下げる・動きの秒数を短くすると軽くなります。");
        status.textContent += webp
          ? t("。ただし 5MB 以上あるため、ココフォリアにはアップロードできません。") + lighter
          : t("。ただし 5MB 以上あるため、ココフォリアではアップロード時に圧縮されて動かなくなります。")
            + (webpReady ? t("形式を WebP にすると軽くなります。") : lighter);
      }
    } catch (error) {
      status.classList.add("error");
      // The encoders throw Japanese messages, which are keys like any other text.
      status.textContent = t("エラー: {message}", { message: t(error.message) });
    } finally {
      button.disabled = false;
    }
  });

  GROUPS.forEach((label, index) => {
    const group = document.createElement("optgroup");
    group.label = t(label);
    for (const [name, p] of Object.entries(PRESETS)) {
      if (p.group === index) group.append(new Option(t(p.desc.split("：")[0]), name));
    }
    el.preset.append(group);
  });
  let saved = null;
  try { saved = localStorage.getItem(SAVE_KEY); } catch (err) { /* storage may be blocked */ }
  if (!saved || !restore(saved)) {
    el.preset.value = "fade-out";
    applyPreset("fade-out");
  }
  history.last = snapshot();
  updateHistoryButtons();
  refresh();

  WEBP.supported().then(ok => {
    if (ok) return;
    webpReady = false;
    el.format.value = "apng";
    el.format.querySelector("option[value=webp]").disabled = true;
    syncRows();
  });

  window.SCENE_TOOL = { renderFrames, frameStream, buildField, timeline, preset, PRESETS, DEFAULTS, WEB_FONTS, ensureFont };
})();
