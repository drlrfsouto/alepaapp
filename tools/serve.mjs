/* tools/serve.mjs — servidor estático mínimo para desenvolvimento/preview.
 * Bind em 0.0.0.0 (necessário para o proxy de preview), com CORS liberado
 * apenas para leitura e MIME types corretos para módulos ES.
 *
 * Uso: node tools/serve.mjs [porta]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORTA = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let caminho = decodeURIComponent(url.pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    if (caminho === '/') caminho = '/index.html';

    // proteção básica contra path traversal
    const alvo = normalize(join(RAIZ, caminho));
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const info = await stat(alvo).catch(() => null);
    const arquivo = info?.isDirectory() ? join(alvo, 'index.html') : alvo;
    const dados = await readFile(arquivo).catch(() => null);
    if (!dados) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 não encontrado');
      return;
    }
    const tipo = MIME[extname(arquivo).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': tipo,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(dados);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`erro: ${e.message}`);
  }
});

server.listen(PORTA, '0.0.0.0', () => {
  console.log(`[serve] ALEPA 2026 disponível em http://0.0.0.0:${PORTA}/`);
});
