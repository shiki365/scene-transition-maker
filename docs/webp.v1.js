/*!
 * webp.v1.js - minimal animated WebP writer for the 場面転換素材メーカー.
 *
 * Same idea as apng.v2.js: frames after the first are cropped to the
 * rectangle that actually changed and written with blend=off / dispose=none.
 *
 * The pixels are compressed by the browser itself: each cropped frame goes
 * through canvas convertToBlob("image/webp"). This file only copies the
 * resulting bitstream into ANMF chunks, so there is no library to load.
 *
 * Chromium encodes quality 1 losslessly (VP8L), but with a fast, weak
 * setting: flat fades shrink to almost nothing, yet vertical gradients can
 * come out 40 times larger than the APNG. Quality 0.9 is lossy colour plus a
 * lossless alpha plane (ALPH + VP8), which handles those well. Each frame is
 * therefore encoded both ways and the smaller one is kept; one file may mix
 * both kinds of frame. Measured on all 18 presets (2026-09-28): 1-49 % of the
 * APNG size, alpha identical, colour off by at most 3/255 (13/255 on the edges
 * of caption text).
 */
(function (global) {
  "use strict";

  function fourcc(text) {
    return [0, 1, 2, 3].map((i) => text.charCodeAt(i));
  }

  function le24(out, at, value) {
    out[at] = value & 0xff;
    out[at + 1] = (value >> 8) & 0xff;
    out[at + 2] = (value >> 16) & 0xff;
  }

  function chunk(type, body) {
    const padded = body.length + (body.length & 1);
    const out = new Uint8Array(8 + padded);
    out.set(fourcc(type), 0);
    new DataView(out.buffer).setUint32(4, body.length, true);
    out.set(body, 8);
    return out;
  }

  /** The chunks of a still WebP file as [{ type, bytes }], bytes including the header. */
  function readChunks(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    for (let at = 12; at + 8 <= bytes.length;) {
      const type = String.fromCharCode(...bytes.subarray(at, at + 4));
      const size = view.getUint32(at + 4, true);
      const end = at + 8 + size + (size & 1);
      out.push({ type, bytes: bytes.subarray(at, Math.min(end, bytes.length)) });
      at = end;
    }
    return out;
  }

  /** Copy one rectangle out of an RGBA frame. */
  function crop(rgba, width, box) {
    const out = new Uint8ClampedArray(box.w * box.h * 4);
    for (let row = 0; row < box.h; row++) {
      const from = ((box.y + row) * width + box.x) * 4;
      out.set(rgba.subarray(from, from + box.w * 4), row * box.w * 4);
    }
    return out;
  }

  /** The rectangle where two frames differ, or null when they are identical. */
  function changedBox(current, previous, width, height) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      for (let x = 0; x < width; x++) {
        const i = row + x * 4;
        if (current[i] !== previous[i] || current[i + 1] !== previous[i + 1]
            || current[i + 2] !== previous[i + 2] || current[i + 3] !== previous[i + 3]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    // ANMF stores the offset divided by 2, so the frame must start on even pixels.
    const x = minX & ~1, y = minY & ~1;
    return { x, y, w: maxX - x + 1, h: maxY - y + 1 };
  }

  /**
   * Encode one RGBA rectangle and keep only its bitstream chunks (ALPH? + VP8 / VP8L).
   * Every quality in `qualities` is tried and the smallest result wins.
   */
  async function encodeStill(pixels, w, h, qualities) {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").putImageData(new ImageData(pixels, w, h), 0, 0);
    let best = null;
    for (const quality of qualities) {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (blob.type !== "image/webp") {
        throw new Error("このブラウザは WebP の書き出しに対応していません。Chrome か Edge でお試しください。");
      }
      const parts = readChunks(new Uint8Array(await blob.arrayBuffer()))
        .filter((c) => c.type === "ALPH" || c.type === "VP8 " || c.type === "VP8L");
      const size = parts.reduce((n, c) => n + c.bytes.length, 0);
      if (!best || size < best.size) best = { parts, size, lossless: parts.some((c) => c.type === "VP8L") };
    }
    return best;
  }

  function concat(parts) {
    let size = 0;
    for (const part of parts) size += part.length;
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  /**
   * Streaming writer with the same shape as APNG.encoder:
   *
   *   const enc = WEBP.encoder(width, height, numPlays);
   *   await enc.add(rgba, delayMs);   // once per frame, in order; rgba must not change afterwards
   *   const { blob, frames, lossless } = enc.finish();
   *
   * numPlays: 0 = endless, 1 = play once and hold the last frame.
   * Identical consecutive frames are merged by extending the previous delay.
   * qualities: every one is tried per frame and the smallest wins (see the header).
   */
  function encoder(width, height, numPlays, qualities = [1, 0.9]) {
    const kept = [];                    // { box, parts, delay }
    let previous = null, lossless = true;

    async function add(rgba, delay) {
      const box = previous ? changedBox(rgba, previous, width, height) : { x: 0, y: 0, w: width, h: height };
      previous = rgba;
      if (!box) {                       // nothing moved: extend the previous delay
        kept[kept.length - 1].delay += delay;
        return;
      }
      const still = await encodeStill(crop(rgba, width, box), box.w, box.h, qualities);
      if (!still.lossless) lossless = false;
      kept.push({ box, parts: still.parts.map((c) => c.bytes), delay });
    }

    function finish() {
      const vp8x = new Uint8Array(10);
      vp8x[0] = 0x10 | 0x02;            // alpha + animation
      le24(vp8x, 4, width - 1);
      le24(vp8x, 7, height - 1);

      const anim = new Uint8Array(6);   // background colour 0 (transparent), then loop count
      new DataView(anim.buffer).setUint16(4, numPlays, true);

      const body = [new Uint8Array(fourcc("WEBP")), chunk("VP8X", vp8x), chunk("ANIM", anim)];
      for (const { box, parts, delay } of kept) {
        const head = new Uint8Array(16);
        le24(head, 0, box.x / 2);
        le24(head, 3, box.y / 2);
        le24(head, 6, box.w - 1);
        le24(head, 9, box.h - 1);
        le24(head, 12, Math.max(1, Math.round(delay)));
        head[15] = 0x02;                // do not blend (replace), dispose: none
        body.push(chunk("ANMF", concat([head, ...parts])));
      }

      const riff = new Uint8Array(8);
      riff.set(fourcc("RIFF"), 0);
      new DataView(riff.buffer).setUint32(4, body.reduce((n, p) => n + p.length, 0), true);
      return { blob: new Blob([riff, ...body], { type: "image/webp" }), frames: kept.length, lossless };
    }

    return { add, finish };
  }

  /** Whether this browser can write WebP from a canvas (Safari returns PNG instead). */
  async function supported() {
    try {
      if (typeof OffscreenCanvas === "undefined") return false;
      const canvas = new OffscreenCanvas(2, 2);
      canvas.getContext("2d").fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality: 1 });
      return blob.type === "image/webp";
    } catch (err) {
      return false;
    }
  }

  global.WEBP = { encoder, supported };
})(window);
