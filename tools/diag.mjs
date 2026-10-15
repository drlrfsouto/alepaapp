/* diag.mjs — imprime o texto renderizado de rotas específicas (uso interno de depuração).
 *   node tools/diag.mjs /resumos/lp /questao/lp-q001
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const definir = (n, v) => Object.defineProperty(globalThis, n, { value: v, writable: true, configurable: true });
definir('window', window); definir('document', window.document); definir('navigator', window.navigator);
definir('location', window.location); definir('localStorage', window.localStorage); definir('sessionStorage', window.sessionStorage);
definir('HTMLElement', window.HTMLElement); definir('Node', window.Node); definir('Event', window.Event);
definir('CustomEvent', window.CustomEvent); definir('HashChangeEvent', window.HashChangeEvent || window.Event);
definir('MouseEvent', window.MouseEvent || window.Event); definir('KeyboardEvent', window.KeyboardEvent);
definir('getComputedStyle', window.getComputedStyle.bind(window));
definir('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
definir('matchMedia', window.matchMedia);
window.scrollTo = () => {};
definir('fetch', async (url) => {
  const p = path.join(RAIZ, String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
  if (!p.startsWith(RAIZ) || !fs.existsSync(p)) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  const corpo = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(corpo), text: async () => corpo };
});
window.fetch = globalThis.fetch;
console.error = () => {}; console.warn = () => {};

await import(path.join(RAIZ, 'src', 'app.js'));
const espera = (ms = 40) => new Promise((r) => setTimeout(r, ms));
await espera(200);
const app = document.getElementById('app');

for (const rota of process.argv.slice(2)) {
  window.location.hash = `#${rota}`;
  window.dispatchEvent(new window.HashChangeEvent('hashchange', { oldURL: '', newURL: `#${rota}` }));
  await espera(120);
  console.log(`\n========== ${rota} ==========`);
  console.log('classes raiz:', [...new Set([...app.querySelectorAll('*')].flatMap((e) => [...e.classList]))].slice(0, 40).join(' '));
  console.log(app.textContent.replace(/\s+/g, ' ').trim().slice(0, 30000));
}
