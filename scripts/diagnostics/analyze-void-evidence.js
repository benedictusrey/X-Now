'use strict';
/* Compare void-evidence frames with their neighbors:
 * for the dark-void bounding box found in the flash frame, report mean
 * luminance of the SAME region in each neighbor frame. A real flash shows
 * bright neighbors + dark flash frame; a mask artifact shows dark everywhere.
 * Usage: node analyze-void-evidence.js <flash.png> <prev.png> <next.png>
 */
const fs = require('fs');
const zlib = require('zlib');

// --- minimal PNG decoder (8-bit RGB/RGBA, no interlace) ---
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8; const idat = [];
  let W = 0, H = 0, bitDepth = 0, colorType = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      W = data.readUInt32BE(0); H = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!ch || bitDepth !== 8) throw new Error(`unsupported png: colorType=${colorType} depth=${bitDepth}`);
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
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      cur[x] = v & 0xff;
    }
  }
  return { W, H, ch, data: out };
}

function regionStats(img, rx, ry, rw, rh) {
  let sum = 0, n = 0;
  for (let y = ry; y < ry + rh && y < img.H; y += 2) {
    for (let x = rx; x < rx + rw && x < img.W; x += 2) {
      const i = (y * img.W + x) * img.ch;
      sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      n++;
    }
  }
  return { meanLum: +(sum / n).toFixed(1), samples: n };
}

function darkBBox(img, G = 10) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y + G <= img.H; y += G) {
    for (let x = 0; x + G <= img.W; x += G) {
      let sum = 0, n = 0;
      for (let yy = y; yy < y + G; yy += 2)
        for (let xx = x; xx < x + G; xx += 2) {
          const i = (yy * img.W + xx) * img.ch;
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
          n++;
        }
      if (sum / n <= 40) {
        count++;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + G); maxY = Math.max(maxY, y + G);
      }
    }
  }
  return count ? { minX, minY, maxX, maxY, count } : null;
}

const [flashP, prevP, nextP] = process.argv.slice(2, 5);
const flash = decodePNG(fs.readFileSync(flashP));
const prev = prevP ? decodePNG(fs.readFileSync(prevP)) : null;
const next = nextP ? decodePNG(fs.readFileSync(nextP)) : null;

console.log(`flash frame: ${flash.W}x${flash.H}`);
const bbox = darkBBox(flash);
if (!bbox) { console.log('no dark region in flash frame'); process.exit(0); }
const rw = bbox.maxX - bbox.minX, rh = bbox.maxY - bbox.minY;
console.log(`dark region: x=${bbox.minX}..${bbox.maxX} y=${bbox.minY}..${bbox.maxY} (${rw}x${rh}, ${bbox.count} tiles)`);
console.log(`region stats across time:`);
console.log(`  prev : ${prev ? JSON.stringify(regionStats(prev, bbox.minX, bbox.minY, rw, rh)) : 'n/a'}`);
console.log(`  flash: ${JSON.stringify(regionStats(flash, bbox.minX, bbox.minY, rw, rh))}`);
console.log(`  next : ${next ? JSON.stringify(regionStats(next, bbox.minX, bbox.minY, rw, rh)) : 'n/a'}`);
// also sample a few point colors in the region of the flash frame
const pts = [[bbox.minX + rw / 2 | 0, bbox.minY + rh / 2 | 0], [bbox.minX + 20, bbox.minY + 20]];
for (const [px, py] of pts) {
  const i = (py * flash.W + px) * flash.ch;
  console.log(`  flash@(${px},${py}) = rgb(${flash.data[i]},${flash.data[i + 1]},${flash.data[i + 2]})`);
}
