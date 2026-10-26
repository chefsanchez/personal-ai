// Rasterize the source SVG. The shipped PNGs need no dependency at app runtime.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }
const directory = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(join(directory, 'icon.svg'));
for (const [name, size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512]]) {
  const source = name.includes('maskable') ? Buffer.from(svg.toString().replace('rx="112"','rx="0"')) : svg;
  await sharp(source).resize(size,size).flatten({background:'#090b10'}).png().toFile(join(directory,name));
}
console.log('App icons generated from public/icons/icon.svg (180, 192, 512 and maskable 512).');
