'use strict';
/* Region white/luminance scan across numbered evidence frames.
 * Reports, for each existing frame, the white-pixel fraction (lum>=235),
 * dark fraction (lum<=40) and mean luminance inside a fixed rect.
 * Usage: node region-white-scan.js <dir> <prefix> <startSeq> <endSeq> <x> <y> <w> <h>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  let pos = 8; const idat = []; let W = 0, H = 0, colorType = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3;
  const stride = W * ch;
  const out = Buffer.alloc(W * H * ch);
  let rp = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[rp++]; const row = raw.slice(rp, rp + stride); rp += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { W, H, ch, data: out };
}

function regionStats(img, rx, ry, rw, rh) {
  let n = 0, w = 0, d = 0, sum = 0;
  for (let y = ry; y < ry + rh && y < img.H; y += 2) {
    for (let x = rx; x < rx + rw && x < img.W; x += 2) {
      const i = (y * img.W + x) * img.ch;
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      n++; sum += lum;
      if (lum >= 235) w++;
      else if (lum <= 40) d++;
    }
  }
  n = Math.max(1, n);
  return { white: +(w / n).toFixed(3), dark: +(d / n).toFixed(3), mean: +(sum / n).toFixed(1) };
}

const [dir, prefix, s0, s1, x, y, w, h] = process.argv.slice(2, 10);
const rx = +x, ry = +y, rw = +w, rh = +h;
for (let s = +s0; s <= +s1; s++) {
  const f = path.join(dir, `${prefix}-f${String(s).padStart(4, '0')}.png`);
  if (!fs.existsSync(f)) continue;
  const img = decodePNG(fs.readFileSync(f));
  const st = regionStats(img, rx, ry, rw, rh);
  console.log(String(s).padStart(4), JSON.stringify(st));
}
