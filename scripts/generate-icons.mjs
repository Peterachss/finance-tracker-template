/**
 * Generates the PWA icons as PNGs with no image dependency.
 *
 * Run with:  node scripts/generate-icons.mjs
 *
 * The mark is a lime leaf with a forest vein on a forest field, the same
 * shape as components/Logo.tsx: two circles intersecting into a lens laid on
 * the diagonal. Supersampled 4x for smooth edges.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");
mkdirSync(OUT, { recursive: true });

const FOREST = [0x1f, 0x5c, 0x46];
const LIME = [0xf3, 0xf6, 0x8c];
const SS = 4; // supersampling factor

// Leaf geometry in unit space (0..1 of the mark box), matching Logo.tsx.
const TIP_A = [0.22, 0.78];
const TIP_B = [0.78, 0.22];
const HALF_WIDTH = 0.17;

function leafTest(u, v) {
  const mx = (TIP_A[0] + TIP_B[0]) / 2;
  const my = (TIP_A[1] + TIP_B[1]) / 2;
  const half = Math.hypot(TIP_B[0] - TIP_A[0], TIP_B[1] - TIP_A[1]) / 2;
  const radius = (half * half + HALF_WIDTH * HALF_WIDTH) / (2 * HALF_WIDTH);
  const d = radius - HALF_WIDTH;
  const n = [Math.SQRT1_2, Math.SQRT1_2]; // perpendicular to the leaf axis
  const c1 = [mx + n[0] * d, my + n[1] * d];
  const c2 = [mx - n[0] * d, my - n[1] * d];
  const inLeaf = Math.hypot(u - c1[0], v - c1[1]) <= radius && Math.hypot(u - c2[0], v - c2[1]) <= radius;
  if (!inLeaf) return "none";
  // Vein: from the lower tip toward the centre and a little past it.
  const end = [0.6, 0.4];
  const vx = end[0] - TIP_A[0];
  const vy = end[1] - TIP_A[1];
  const t = Math.max(0, Math.min(1, ((u - TIP_A[0]) * vx + (v - TIP_A[1]) * vy) / (vx * vx + vy * vy)));
  const dist = Math.hypot(u - (TIP_A[0] + t * vx), v - (TIP_A[1] + t * vy));
  return dist <= 0.03 ? "vein" : "leaf";
}

function render(size, { maskable }) {
  const scale = size * SS;
  const box = scale * (maskable ? 0.6 : 0.78);
  const offset = (scale - box) / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const u = (px * SS + sx + 0.5 - offset) / box;
          const v = (py * SS + sy + 0.5 - offset) / box;
          const colour = leafTest(u, v) === "leaf" ? LIME : FOREST;
          r += colour[0]; g += colour[1]; b += colour[2];
        }
      }
      const count = SS * SS;
      const i = (py * size + px) * 4;
      pixels[i] = Math.round(r / count);
      pixels[i + 1] = Math.round(g / count);
      pixels[i + 2] = Math.round(b / count);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((value, index) => {
      raw[y * (size * 4 + 1) + 1 + index] = value;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  { file: "favicon.ico", size: 64, maskable: false, dir: join(ROOT, "app") },
];

for (const target of targets) {
  writeFileSync(join(target.dir ?? OUT, target.file), encodePng(target.size, render(target.size, target)));
  console.log(`wrote ${target.file} (${target.size}x${target.size})`);
}