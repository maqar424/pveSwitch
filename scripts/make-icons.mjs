// Generates the app icons: a power-switch glyph with "pve" beneath it.
// Run with: node scripts/make-icons.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(dir, '..', 'assets');

const EMERALD = '#34d399';
const LIGHT = '#e7e9ee';
const BG = '#0b0d12';

function svg({ bg, glyph, text, size = 1024 }) {
  const bgRect = bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${bgRect}
  <g transform="translate(296,196) scale(18)" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
    <line x1="12" y1="2" x2="12" y2="12"/>
  </g>
  <text x="512" y="742" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="184" font-weight="700" letter-spacing="6" fill="${text}">pve</text>
</svg>`;
}

async function render(svgStr, outName, size) {
  const out = path.join(assets, outName);
  await sharp(Buffer.from(svgStr), { density: 384 }).resize(size, size).png().toFile(out);
  console.log('wrote', outName, `(${size}px)`);
}

await render(svg({ bg: BG, glyph: EMERALD, text: LIGHT }), 'icon.png', 1024);
await render(svg({ bg: null, glyph: EMERALD, text: LIGHT }), 'android-icon-foreground.png', 1024);
await render(svg({ bg: null, glyph: '#ffffff', text: '#ffffff' }), 'android-icon-monochrome.png', 1024);
await render(svg({ bg: BG, glyph: EMERALD, text: LIGHT, size: 48 }), 'favicon.png', 48);
console.log('done');
