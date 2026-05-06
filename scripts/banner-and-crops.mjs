import sharp from 'sharp';
import { readFileSync } from 'node:fs';

// 1) Banner: render the designed SVG to 1500x500 PNG
const bannerSvg = readFileSync('public/x-promo/banner-design.svg');
await sharp(bannerSvg, { density: 200 })
  .resize(1500, 500)
  .png()
  .toFile('public/x-promo/header-banner.png');

// 2) Casino crop: drop the empty white space below the dialog.
//    Source is 828x1792 with the dialog occupying roughly the top 700px.
await sharp('public/x-promo/post-casino.png')
  .extract({ left: 0, top: 0, width: 828, height: 750 })
  .resize({ width: 1200, fit: 'contain', background: '#f5e9c8' })
  .toFile('public/x-promo/post-casino-cropped.png');

// 3) Map crop: focus on map + key stats, drop the bottom button.
await sharp('public/x-promo/post-map.png')
  .extract({ left: 0, top: 0, width: 828, height: 1500 })
  .toFile('public/x-promo/post-map-cropped.png');

console.log('Wrote header-banner.png, post-casino-cropped.png, post-map-cropped.png');
