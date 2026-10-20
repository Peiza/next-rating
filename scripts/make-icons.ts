/*
 * Draws the app icons into public/icons/: a white upward trend line on the
 * light theme's accent colour. No dependencies: the shapes are sampled 4×4
 * times per pixel for smooth edges and written as PNG with node:zlib. The
 * PNGs are committed, so CI never runs this; run `npm run icons` after a
 * change here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT = join(import.meta.dirname, '..', 'public', 'icons');

/** --accent and --on-accent of the light theme in src/app/styles.css. */
const BACKGROUND = [0x00, 0x3a, 0x9e] as const;
const MARK = [0xff, 0xff, 0xff] as const;

type Point = [number, number];

/** The trend line in a unit square, y pointing down, ending in an arrow head. */
const LINE: Point[] = [
  [0.16, 0.72],
  [0.4, 0.48],
  [0.55, 0.6],
  [0.76, 0.39],
];
const TIP: Point = [0.86, 0.29];
const STROKE = 0.085;
const HEAD_WIDTH = 0.13;

interface Icon {
  file: string;
  size: number;
  /** Rounded corners with transparency; otherwise the background fills the square. */
  rounded: boolean;
  /** How much of the square the mark's unit box takes, centred. */
  scale: number;
}

const ICONS: Icon[] = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  // Maskable icons may be cut to a circle of 80% of the width, so the mark stays inside it.
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 },
];

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inTriangle([px, py]: Point, [a, b, c]: [Point, Point, Point]): boolean {
  const side = (p: Point, q: Point) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]);
  const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** The arrow head: a triangle from the line's last point to the tip. */
function arrowHead(): [Point, Point, Point] {
  const base = LINE.at(-1)!;
  const [dx, dy] = [TIP[0] - base[0], TIP[1] - base[1]];
  const length = Math.hypot(dx, dy);
  const [nx, ny] = [-dy / length, dx / length];
  return [TIP, [base[0] + nx * HEAD_WIDTH, base[1] + ny * HEAD_WIDTH], [base[0] - nx * HEAD_WIDTH, base[1] - ny * HEAD_WIDTH]];
}

const HEAD = arrowHead();

function onMark(point: Point): boolean {
  if (inTriangle(point, HEAD)) return true;
  for (let i = 1; i < LINE.length; i++) {
    if (distanceToSegment(point, LINE[i - 1]!, LINE[i]!) <= STROKE / 2) return true;
  }
  return false;
}

/** Inside a square with corners rounded by `radius`, all in units of the side. */
function inRoundedSquare([x, y]: Point, radius: number): boolean {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

const SAMPLES = 4;

function draw({ size, rounded, scale }: Icon): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const point: Point = [(x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size];
          if (rounded && !inRoundedSquare(point, 0.2)) continue;
          cover++;
          const unit: Point = [(point[0] - 0.5) / scale + 0.5, (point[1] - 0.5) / scale + 0.5];
          if (onMark(unit)) mark++;
        }
      }
      const i = (y * size + x) * 4;
      const share = cover === 0 ? 0 : mark / cover;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BACKGROUND[c]! * (1 - share) + MARK[c]! * share);
      pixels[i + 3] = Math.round((cover / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG, every row with filter type 0. */
function png(size: number, pixels: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) {
  writeFileSync(join(OUT, icon.file), png(icon.size, draw(icon)));
  console.log(`public/icons/${icon.file}`);
}
