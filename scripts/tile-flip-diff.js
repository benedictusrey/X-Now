'use strict';
/* Tile-flip diff between two PNG frames (no masking): counts 10px grid tiles
 * that change luminance class (dark<=40 / mid / light>=205) and reports the
 * flip bbox + net direction. Distinguishes "black player popped in" (large
 * coherent toDark flip) from "scattered void" patterns.
 * Usage: node tile-flip-diff.js <a.png> <b.png>
 */
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  let pos = 8; const idat = []; let W = 0, H = 0, colorType = 0, bitDepth = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
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
    const filter = raw[rp++];
    const row = raw.slice(rp, rp + stride); rp += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break; }
      }
      cur[x] = v & 0xff;
    }
  }
  return { W, H, ch, data: out };
}

const G = 10;
function tileLums(img) {
  const lums = new Map();
  for (let y = 0; y + G <= img.H; y += G)
    for (let x = 0; x + G <= img.W; x += G) {
      let sum = 0, n = 0;
      for (let yy = y; yy < y + G; yy += 2)
        for (let xx = x; xx < x + G; xx += 2) {
          const i = (yy * img.W + xx) * img.ch;
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
          n++;
        }
      lums.set(x + ',' + y, sum / n);
    }
  return lums;
}

const [pa, pb] = process.argv.slice(2, 4);
const A = decodePNG(fs.readFileSync(pa)), B = decodePNG(fs.readFileSync(pb));
const la = tileLums(A), lb = tileLums(B);
const cls = (l) => (l <= 40 ? 'dark' : l >= 205 ? 'light' : 'mid');
let toDark = 0, toLight = 0;
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
for (const [k, lv] of la) {
  const cv = lb.get(k);
  if (cv === undefined) continue;
  const ca = cls(lv), cb = cls(cv);
  if (ca !== cb && ca !== 'mid' && cb !== 'mid') {
    const [x, y] = k.split(',').map(Number);
    if (cb === 'dark') {
      toDark++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + G); maxY = Math.max(maxY, y + G);
    } else toLight++;
  }
}
const total = la.size;
console.log(`tiles=${total} toDark=${toDark} (${(toDark / total * 100).toFixed(1)}%) toLight=${toLight} (${(toLight / total * 100).toFixed(1)}%)`);
if (toDark) console.log(`toDark bbox: x=${minX}..${maxX} y=${minY}..${maxY} (${maxX - minX}x${maxY - minY})`);
// coherence: toDark flips within the bbox vs outside
if (toDark > 20) {
  let inside = 0;
  for (const [k, lv] of la) {
    const cv = lb.get(k);
    if (cv === undefined) continue;
    const [x, y] = k.split(',').map(Number);
    if (x >= minX && x < maxX && y >= minY && y < maxY && cls(lv) === 'light' && cls(cv) === 'dark') inside++;
  }
  console.log(`coherence: ${inside}/${toDark} toDark flips inside bbox (${(inside / toDark * 100).toFixed(0)}%)`);
}
