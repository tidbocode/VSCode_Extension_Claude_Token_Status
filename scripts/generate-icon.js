// Generates icon.png — run with: node scripts/generate-icon.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 128;
const pixels = new Uint8Array(SIZE * SIZE * 4); // RGBA, starts fully transparent

// Rounded rectangle background — dark purple #1a1033
const ROUND = 22;
const CX = SIZE / 2, CY = SIZE / 2;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const hx = Math.max(0, Math.abs(x + 0.5 - CX) - (CX - ROUND));
    const hy = Math.max(0, Math.abs(y + 0.5 - CY) - (CY - ROUND));
    if (hx * hx + hy * hy <= ROUND * ROUND) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = 26; pixels[i+1] = 16; pixels[i+2] = 51; pixels[i+3] = 255;
    }
  }
}

// 4-pointed sparkle — two thin ellipses (horizontal + vertical spikes)
// Gold color: #FFD75A
const OUTER = 44;  // spike length from center
const THIN  = 5;   // half-width of each spike

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (pixels[i+3] === 0) continue; // skip transparent pixels

    // 4x4 supersampling for smooth edges
    let hits = 0;
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4 - CX;
        const py = y + (sy + 0.5) / 4 - CY;
        const inH = (px*px)/(OUTER*OUTER) + (py*py)/(THIN*THIN) <= 1;
        const inV = (px*px)/(THIN*THIN) + (py*py)/(OUTER*OUTER) <= 1;
        if (inH || inV) hits++;
      }
    }

    if (hits > 0) {
      const a = hits / 16;
      pixels[i]   = Math.round(pixels[i]   + (255 - pixels[i])   * a);
      pixels[i+1] = Math.round(pixels[i+1] + (215 - pixels[i+1]) * a);
      pixels[i+2] = Math.round(pixels[i+2] + (90  - pixels[i+2]) * a);
    }
  }
}

// Small bright white dot at center
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (pixels[i+3] === 0) continue;
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
    if (dx*dx + dy*dy <= 3*3) {
      pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255;
    }
  }
}

// PNG encoder (no external dependencies)
function encodePNG(data, w, h) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, body) {
    const t = Buffer.from(type);
    const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(body.length);
    const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, body])));
    return Buffer.concat([lenBuf, t, body, crcBuf]);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter type: None
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = y * (w * 4 + 1) + 1 + x * 4;
      raw[d] = data[s]; raw[d+1] = data[s+1]; raw[d+2] = data[s+2]; raw[d+3] = data[s+3];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outPath = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(outPath, encodePNG(pixels, SIZE, SIZE));
console.log(`Written: ${outPath}`);
