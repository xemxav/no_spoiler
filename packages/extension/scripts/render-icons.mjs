/**
 * Generates the extension's mark: the vector sources under `icons/` and the
 * raster renditions the manifest declares.
 *
 * The geometry lives here rather than in the SVG files because the same
 * numbers drive both outputs — see "Identity" in `docs/design-system.md`.
 * Run with `pnpm --filter @no-spoiler/extension icons` after changing it.
 *
 * Rasterising is done here rather than with an image library so the repo gains
 * no dependency for four small icons. The mark is discs and a rounded
 * rectangle, both of which are a point-in-shape test; supersampling turns that
 * into the anti-aliased coverage a renderer would compute.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORAL = [0xff, 0x3d, 0x5a];
const INK = [0x14, 0x12, 0x18];

/** Every disc sits on the vertical centre line of the 64-unit glyph canvas. */
const GLYPH_CANVAS = 64;
const DISC_CY = 32;

/**
 * Faintest disc first: the solid one has to land on top, or the mark reads as
 * a row of grey circles instead of a smear.
 */
const THREE_DISCS = [
  { cx: 49, r: 17, opacity: 0.25 },
  { cx: 39, r: 17, opacity: 0.5 },
  { cx: 26, r: 17, opacity: 1 },
];

/** At 32px and below, three discs turn to grey mush. Two, bigger and wider apart. */
const TWO_DISCS = [
  { cx: 44, r: 19, opacity: 0.35 },
  { cx: 26, r: 19, opacity: 1 },
];

/** Tile radius grows with the tile; the glyph keeps a constant optical margin. */
const RENDITIONS = [
  { size: 16, radius: 5, border: 1, glyphScale: 0.75, discs: TWO_DISCS },
  { size: 32, radius: 9, border: 2, glyphScale: 0.68, discs: TWO_DISCS },
  { size: 48, radius: 13, border: 2, glyphScale: 0.625, discs: THREE_DISCS },
  { size: 128, radius: 30, border: 2, glyphScale: 0.625, discs: THREE_DISCS },
];

/** Samples per pixel per axis. 8 puts the edge error below one 8-bit step. */
const SUPERSAMPLE = 8;

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const nearestX = Math.min(Math.max(x, radius), size - radius);
  const nearestY = Math.min(Math.max(y, radius), size - radius);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Source-over of an opaque ink layer at `opacity` onto an opaque `base`. */
function over(base, layer, opacity) {
  return base.map((channel, i) => channel * (1 - opacity) + layer[i] * opacity);
}

/**
 * Colour of one sample: transparent outside the tile, ink in the border ring,
 * and the discs composited over coral inside it. The tile clips the discs,
 * which run past its edges by design.
 */
function sampleAt(x, y, { size, radius, border, glyphScale, discs }) {
  if (!insideRoundedRect(x, y, size, radius)) return null;
  const inner = insideRoundedRect(
    x - border,
    y - border,
    size - 2 * border,
    Math.max(radius - border, 0),
  );
  if (!inner) return INK;

  const glyphSize = size * glyphScale;
  const origin = (size - glyphSize) / 2;
  const gx = ((x - origin) / glyphSize) * GLYPH_CANVAS;
  const gy = ((y - origin) / glyphSize) * GLYPH_CANVAS;

  let colour = CORAL;
  for (const disc of discs) {
    if (insideCircle(gx, gy, disc.cx, DISC_CY, disc.r)) {
      colour = over(colour, INK, disc.opacity);
    }
  }
  return colour;
}

function rasterise(rendition) {
  const { size } = rendition;
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const colour = sampleAt(
            px + (sx + 0.5) * step,
            py + (sy + 0.5) * step,
            rendition,
          );
          if (!colour) continue;
          covered += 1;
          r += colour[0];
          g += colour[1];
          b += colour[2];
        }
      }
      const offset = (py * size + px) * 4;
      if (covered === 0) continue;
      pixels[offset] = Math.round(r / covered);
      pixels[offset + 1] = Math.round(g / covered);
      pixels[offset + 2] = Math.round(b / covered);
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10-12: deflate compression, adaptive filtering, no interlace — all zero.

  // One scanline per row, each prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function discMarkup(discs, fill) {
  return discs
    .map(
      (disc) =>
        `  <circle cx="${disc.cx}" cy="${DISC_CY}" r="${disc.r}" fill="${fill}"` +
        (disc.opacity === 1 ? "" : ` opacity="${disc.opacity}"`) +
        ` />`,
    )
    .join("\n");
}

function svgSource(discs, note) {
  return `<!-- ${note} Geometry: docs/design-system.md, "Identity". -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH_CANVAS} ${GLYPH_CANVAS}" width="${GLYPH_CANVAS}" height="${GLYPH_CANVAS}" role="img" aria-label="No Spoiler">
${discMarkup(discs, toHex(INK))}
</svg>
`;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

writeFileSync(
  join(outDir, "mark.svg"),
  svgSource(THREE_DISCS, "The blurred disc, full mark. Used above 32px."),
);
writeFileSync(
  join(outDir, "mark-small.svg"),
  svgSource(TWO_DISCS, "The blurred disc, reduced to two for 32px and below."),
);

for (const rendition of RENDITIONS) {
  const png = encodePng(rasterise(rendition), rendition.size);
  writeFileSync(join(outDir, `icon-${rendition.size}.png`), png);
  process.stdout.write(`icons/icon-${rendition.size}.png (${png.length} bytes)\n`);
}
