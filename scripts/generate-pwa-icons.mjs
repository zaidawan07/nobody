// Generates the PWA icons in public/icons/.
//
// THESE ARE PLACEHOLDERS. Each one is a flat evergreen tile with a white house
// mark: enough to install the app and recognise it on a home screen, not a
// designed brand asset. Replace public/icons/*.png with real artwork before
// launch; docs/PRELAUNCH.md tracks that as an open item.
//
// No image library is involved. The pixels are computed here and encoded as
// PNG by hand -- zlib for the scanlines, a CRC32 table for the chunk
// checksums -- so regenerating them needs nothing beyond Node:
//
//   node scripts/generate-pwa-icons.mjs
//
// Colours are the design tokens from src/styles.css, converted from OKLCH so
// the icon and the app cannot drift apart.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");

// --- OKLCH -> sRGB ---------------------------------------------------------
// Bjorn Ottosson's OKLab -> linear sRGB matrix, then the sRGB transfer curve.

function oklchToRgb(L, C, hueDeg) {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [lr, lg, lb].map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  });
}

// src/styles.css: --primary: oklch(0.42 0.085 165)
const BRAND = oklchToRgb(0.42, 0.085, 165);
// src/styles.css: --background: oklch(0.985 0.008 95) -- used for the mark
const MARK = oklchToRgb(0.985, 0.008, 95);

const hex = (rgb) =>
  "#" +
  rgb
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

// --- geometry --------------------------------------------------------------

function inRoundedTile(x, y, size, radius) {
  if (radius <= 0) return true;
  const qx = Math.max(radius - x, x - (size - radius), 0);
  const qy = Math.max(radius - y, y - (size - radius), 0);
  return qx * qx + qy * qy <= radius * radius;
}

// A house in a -1..1 box, y pointing down: triangular roof over a rectangle.
function inHouse(x, y) {
  const inRoof = y >= -0.62 && y <= 0.02 && Math.abs(x) <= 0.62 * ((y + 0.62) / 0.64);
  const inBody = Math.abs(x) <= 0.42 && y >= 0.02 && y <= 0.62;
  return inRoof || inBody;
}

// 3x3 supersampling, so diagonals are not visibly jagged at 192px.
const SUB = 3;

function renderIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.22;
  // A maskable icon can be cropped to a circle of 80% width, so the mark is
  // kept well inside that: it must survive the crop, not fill the tile.
  const scale = maskable ? 0.52 : 0.72;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      let marked = 0;

      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const x = px + (sx + 0.5) / SUB;
          const y = py + (sy + 0.5) / SUB;
          if (!inRoundedTile(x, y, size, radius)) continue;
          covered++;
          const hx = (x - size / 2) / ((size / 2) * scale);
          const hy = (y - size / 2) / ((size / 2) * scale);
          if (inHouse(hx, hy)) marked++;
        }
      }

      const total = SUB * SUB;
      const alpha = Math.round((covered / total) * 255);
      const useMark = covered > 0 && marked * 2 >= covered;
      const rgb = useMark ? MARK : BRAND;

      const o = (py * size + px) * 4;
      rgba[o] = rgb[0];
      rgba[o + 1] = rgb[1];
      rgba[o + 2] = rgb[2];
      rgba[o + 3] = alpha;
    }
  }
  return rgba;
}

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- output ----------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-192.png", size: 192, maskable: true },
  { file: "maskable-512.png", size: 512, maskable: true },
];

console.log("brand " + hex(BRAND) + "  mark " + hex(MARK));
for (const t of targets) {
  const png = encodePng(t.size, renderIcon(t.size, t.maskable));
  const path = join(outDir, t.file);
  writeFileSync(path, png);
  console.log(
    "wrote public/icons/" + t.file + " (" + t.size + "x" + t.size + ", " + png.length + " bytes)",
  );
}
