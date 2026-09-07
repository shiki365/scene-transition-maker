/*!
 * apng.v1.js - minimal APNG writer for the 場面転換素材メーカー.
 *
 * Takes RGBA frames and produces an animated PNG. Frames after the first are
 * cropped to the rectangle that actually changed and written with
 * blend=SOURCE / dispose=NONE, which is what keeps the files small.
 *
 * Deflate comes from the browser's own CompressionStream, so there is no
 * library to load.
 */
(function (global) {
  "use strict";

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, body) {
    const out = new Uint8Array(body.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
    return out;
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === "undefined") {
      throw new Error("このブラウザは書き出しに対応していません（CompressionStream が必要です）。"
        + "Chrome / Edge / Firefox / Safari の新しい版でお試しください。");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Copy one rectangle out of an RGBA frame. */
  function crop(rgba, width, box) {
    if (box.x === 0 && box.y === 0 && box.w === width && box.h * width * 4 === rgba.length) {
      return rgba;
    }
    const out = new Uint8Array(box.w * box.h * 4);
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
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function paeth(left, up, upperLeft) {
    const p = left + up - upperLeft;
    const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
  }

  /**
   * Prefix every scanline with a PNG filter byte. All five filters are tried
   * and the one with the smallest sum of signed bytes wins, which is the
   * heuristic libpng uses. Worth the work: on gradients it roughly halves the
   * compressed size compared with always writing unfiltered rows.
   */
  function filterRows(rgba, width, height) {
    const bpp = 4, stride = width * bpp;
    const out = new Uint8Array(height * (stride + 1));
    const candidates = [];
    for (let k = 0; k < 5; k++) candidates.push(new Uint8Array(stride));
    let previous = new Uint8Array(stride);

    for (let y = 0; y < height; y++) {
      const row = rgba.subarray(y * stride, (y + 1) * stride);
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
      for (let i = 0; i < stride; i++) {
        const value = row[i];
        const left = i >= bpp ? row[i - bpp] : 0;
        const up = previous[i];
        const upperLeft = i >= bpp ? previous[i - bpp] : 0;
        const c0 = value;
        const c1 = (value - left) & 0xff;
        const c2 = (value - up) & 0xff;
        const c3 = (value - ((left + up) >> 1)) & 0xff;
        const c4 = (value - paeth(left, up, upperLeft)) & 0xff;
        candidates[0][i] = c0; s0 += c0 < 128 ? c0 : 256 - c0;
        candidates[1][i] = c1; s1 += c1 < 128 ? c1 : 256 - c1;
        candidates[2][i] = c2; s2 += c2 < 128 ? c2 : 256 - c2;
        candidates[3][i] = c3; s3 += c3 < 128 ? c3 : 256 - c3;
        candidates[4][i] = c4; s4 += c4 < 128 ? c4 : 256 - c4;
      }
      let best = 0, bestSum = s0;
      if (s1 < bestSum) { best = 1; bestSum = s1; }
      if (s2 < bestSum) { best = 2; bestSum = s2; }
      if (s3 < bestSum) { best = 3; bestSum = s3; }
      if (s4 < bestSum) { best = 4; bestSum = s4; }
      const at = y * (stride + 1);
      out[at] = best;
      out.set(candidates[best], at + 1);
      previous = row;
    }
    return out;
  }

  function be32(value) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0);
    return out;
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
   * frames    : array of Uint8ClampedArray, each width*height*4 RGBA bytes
   * delays    : per-frame delay in milliseconds (same length as frames)
   * numPlays  : 0 = endless, 1 = play once and hold the last frame
   * Returns a Blob of type image/png. Identical consecutive frames are merged.
   */
  async function encode(frames, width, height, delays, numPlays) {
    const kept = [];
    for (let i = 0; i < frames.length; i++) {
      const box = i === 0 ? { x: 0, y: 0, w: width, h: height }
        : changedBox(frames[i], frames[i - 1], width, height);
      if (!box) {                       // nothing moved: extend the previous delay
        kept[kept.length - 1].delay += delays[i];
        continue;
      }
      kept.push({ data: crop(frames[i], width, box), box, delay: delays[i] });
    }

    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    ihdr[8] = 8;      // bit depth
    ihdr[9] = 6;      // colour type: RGBA
    const actl = new Uint8Array(8);
    const actlView = new DataView(actl.buffer);
    actlView.setUint32(0, kept.length);
    actlView.setUint32(4, numPlays);

    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("acTL", actl),
    ];

    let sequence = 0;
    for (let i = 0; i < kept.length; i++) {
      const { data, box, delay } = kept[i];
      const fctl = new Uint8Array(26);
      const f = new DataView(fctl.buffer);
      f.setUint32(0, sequence++);
      f.setUint32(4, box.w);
      f.setUint32(8, box.h);
      f.setUint32(12, box.x);
      f.setUint32(16, box.y);
      f.setUint16(20, Math.max(1, Math.round(delay)));
      f.setUint16(22, 1000);            // delay is in milliseconds
      fctl[24] = 0;                     // dispose: leave the frame in place
      fctl[25] = 0;                     // blend: replace, do not composite
      parts.push(chunk("fcTL", fctl));

      const body = await deflate(filterRows(data, box.w, box.h));
      parts.push(i === 0 ? chunk("IDAT", body)
        : chunk("fdAT", concat([be32(sequence++), body])));
    }

    parts.push(chunk("IEND", new Uint8Array(0)));
    return { blob: new Blob(parts, { type: "image/png" }), frames: kept.length };
  }

  global.APNG = { encode };
})(window);
