import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const svg = readFileSync(resolve('public/icon-512.svg'));

// Generate 400x400 PNG (X profile size)
await sharp(svg, { density: 400 })
  .resize(400, 400)
  .png()
  .toFile('public/x-promo/profile-400.png');

// Also 800x800 hi-res for retina
await sharp(svg, { density: 800 })
  .resize(800, 800)
  .png()
  .toFile('public/x-promo/profile-800.png');

console.log('Wrote public/x-promo/profile-400.png and profile-800.png');
