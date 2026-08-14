// Gera os PNGs de ícone do app a partir de SVG, usando o Chromium do Playwright.
// Uso: node tools/gen-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'assets', 'icons');

const favicon = readFileSync(path.join(iconsDir, 'favicon.svg'), 'utf8');

const gradient = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="45%" stop-color="#1E8C7C"/>
      <stop offset="45%" stop-color="#17332E"/>
    </linearGradient>
  </defs>`;

function svgQuadrado({ rx }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    ${gradient}
    <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
    <text x="256" y="336" font-family="Poppins, Arial, sans-serif" font-weight="700" font-size="192" fill="#FFFFFF" text-anchor="middle">SB</text>
  </svg>`;
}

// maskable: conteúdo dentro da "safe zone" central (raio ~40% do lado)
function svgMaskable() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    ${gradient}
    <rect width="512" height="512" fill="url(#g)"/>
    <text x="256" y="300" font-family="Poppins, Arial, sans-serif" font-weight="700" font-size="150" fill="#FFFFFF" text-anchor="middle">SB</text>
  </svg>`;
}

const alvos = [
  { file: 'icon-192.png', svg: svgQuadrado({ rx: 96 }), size: 192 },
  { file: 'icon-512.png', svg: svgQuadrado({ rx: 96 }), size: 512 },
  { file: 'icon-maskable-512.png', svg: svgMaskable(), size: 512 },
  { file: 'apple-touch-icon.png', svg: svgQuadrado({ rx: 0 }), size: 180 }
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

for (const alvo of alvos) {
  await page.setViewportSize({ width: alvo.size, height: alvo.size });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    svg{display:block;width:${alvo.size}px;height:${alvo.size}px}
  </style></head><body>${alvo.svg}</body></html>`;
  await page.setContent(html);
  const svgEl = await page.$('svg');
  await svgEl.screenshot({ path: path.join(iconsDir, alvo.file) });
  console.log('gerado', alvo.file);
}

await browser.close();
console.log('ok');
