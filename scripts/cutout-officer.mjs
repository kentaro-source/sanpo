// Cuts the immigration officer free of the busy hall background, then
// composites the green baccarat felt back in underneath him — AI
// background-removal treats the flat green felt as "floor" and drops
// it, but the casino mat is wanted, so it is re-added as its own
// feathered layer from the original pixels.
//
// Usage: node scripts/cutout-officer.mjs [left] [top] [width] [height]
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';

const SRC = 'C:/dev/sanpo/c418d23f-9812-4b53-8d0c-275823124ccf.jpg';
const OUT =
  'C:/dev/sanpo/.claude/worktrees/recursing-ride-0e99dd/public/img/officer.png';

const crop = {
  left: Number(process.argv[2] ?? 165),
  top: Number(process.argv[3] ?? 10),
  width: Number(process.argv[4] ?? 715),
  height: Number(process.argv[5] ?? 545),
};
const { width: W, height: H } = crop;

// Source y where the green baccarat felt begins (sampled ~425).
const FELT_SRC_Y = 425;
const feltTop = FELT_SRC_Y - crop.top; // felt start in crop space

const croppedPng = await sharp(SRC).extract(crop).png().toBuffer();

// 1. AI cutout of the officer — same dimensions as the crop, surroundings
//    (incl. the green felt) made transparent.
const blob = await removeBackground(
  new Blob([croppedPng], { type: 'image/png' }),
);
// Force back to the crop dimensions — the model may emit a slightly
// different size, which would break the later same-size composite.
const cutout = await sharp(Buffer.from(await blob.arrayBuffer()))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toBuffer();

// 2. Felt layer — the original crop, alpha-masked to just the bottom
//    felt band. The masks are SVG gradients in WHITE with varying
//    stop-opacity, applied as alpha via successive `dest-in` composites
//    (vertical fade-in at the felt's top edge + soft left/right edges)
//    so the casino mat doesn't read as a hard rectangle.
const vTop = (((feltTop - 45) / H) * 100).toFixed(1);
const vIn = (((feltTop + 30) / H) * 100).toFixed(1);
const vMask = await sharp(
  Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="${vTop}%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="${vIn}%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#v)"/>
    </svg>`,
  ),
)
  .png()
  .toBuffer();
const hMask = await sharp(
  Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="14%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="86%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#h)"/>
    </svg>`,
  ),
)
  .png()
  .toBuffer();
const feltLayer = await sharp(croppedPng)
  .ensureAlpha()
  .composite([
    { input: vMask, blend: 'dest-in' },
    { input: hMask, blend: 'dest-in' },
  ])
  .png()
  .toBuffer();

// 3. Officer cutout over the felt layer. Both layers are normalised to
//    raw RGBA with explicit dimensions so the composite can't be tripped
//    up by stray density metadata. The trim runs in a SEPARATE sharp
//    pipeline — chaining .composite().trim() makes sharp apply trim
//    first, shrinking the base so the overlay no longer fits.
const feltRaw = await sharp(feltLayer).ensureAlpha().raw().toBuffer();
const cutRaw = await sharp(cutout).ensureAlpha().raw().toBuffer();
const composited = await sharp(feltRaw, {
  raw: { width: W, height: H, channels: 4 },
})
  .composite([{ input: cutRaw, raw: { width: W, height: H, channels: 4 } }])
  .png()
  .toBuffer();
await sharp(composited).trim({ threshold: 10 }).png().toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`wrote ${OUT} (${meta.width}x${meta.height})`);
