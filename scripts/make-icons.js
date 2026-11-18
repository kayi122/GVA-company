// Generates the app icons (PNG) used when agents "Add to Home Screen". Run: node scripts/make-icons.js
// Pure Node (no image libraries): draws the GVA mark — white plus over lime Wi-Fi arcs on navy.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NAVY = [7, 21, 51], LIME = [184, 212, 51], WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// colour at a point in the 32×32 design grid of favicon.svg
function colourAt(x, y) {
  if (segDist(x, y, 16, 3, 16, 12) <= 1.3 || segDist(x, y, 11.5, 7.5, 20.5, 7.5) <= 1.3) return WHITE;
  const d = Math.hypot(x - 16, y - 28.6);
  if (Math.abs(d - 12.5) <= 1.2 && y <= 20.6) return LIME;
  if (Math.abs(d - 7.5) <= 1.2 && y <= 24) return LIME;
  if (Math.hypot(x - 16, y - 27) <= 2) return LIME;
  return NAVY;
}

function png(size, contentScale) {
  const scale = (size * contentScale) / 32;
  const SS = 4; // 4×4 supersampling for smooth edges
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS - size / 2) / scale + 16;
        const y = (py + (sy + 0.5) / SS - size / 2) / scale + 16;
        const c = colourAt(x, y);
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = SS * SS, o = 1 + px * 4;
      row[o] = r / n; row[o + 1] = g / n; row[o + 2] = b / n; row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../client/public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
// content kept inside the central 60% so Android's round/squircle masks never cut it
for (const s of [192, 512]) writeFileSync(new URL(`icon-${s}.png`, out), png(s, 0.6));
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 0.62));
console.log('Icons written to client/public/icons/');
