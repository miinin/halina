// Rakentaa selaindemon yhdeksi HTML-tiedostoksi: apps/web/dist-demo/halina-demo.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('..', import.meta.url).pathname;
execSync('npx vite build --config vite.demo.config.ts', { cwd: dir, stdio: 'inherit' });
const out = join(dir, 'dist-demo');
let html = readFileSync(join(out, 'demo.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(out, f), 'utf8')}</style>`);
const js = [...html.matchAll(/<script type="module" crossorigin src="\/?([^"]+)"><\/script>/g)]
  .map((m) => readFileSync(join(out, m[1]), 'utf8').replace(/<\/script/gi, '<\\/script'))
  .join('\n');
html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/g, '');
// Artifact-julkaisu lisää oman dokumenttirungon: otetaan head- ja body-sisältö ilman kääreitä.
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const page = `${head.trim()}\n<style>:root{color-scheme:dark}</style>\n${body.trim()}\n<script type="module">${js}</script>\n`;
writeFileSync(join(out, 'halina-demo.html'), page);
console.log(`halina-demo.html ${(page.length / 1024).toFixed(0)} kt`);
