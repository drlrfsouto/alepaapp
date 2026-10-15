/* tools/serve.mjs — servidor estático mínimo para desenvolvimento/preview.
 * Bind em 0.0.0.0 (necessário para o proxy de preview), com CORS liberado
 * apenas para leitura e MIME types corretos para módulos ES.
 *
 * Também executa as funções de /api (api/ia.js, api/modelos.js) — o MESMO código que vai
 * para a Vercel — para você testar o modo "Servidor (proxy)" localmente:
 *   GEMINI_API_KEYS="AIza1,AIza2" node tools/serve.mjs 8080
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

/* ---- funções serverless locais (api/*.js) ---- */
const HANDLERS = new Map();
async function handlerDe(caminho) {
  const nome = caminho.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9_-]+$/i.test(nome)) return null;
  if (!HANDLERS.has(nome)) {
    const arquivo = join(RAIZ, 'api', `${nome}.js`);
    if (!(await stat(arquivo).catch(() => null))) { HANDLERS.set(nome, null); return null; }
    const mod = await import(`file://${arquivo}`);
    HANDLERS.set(nome, mod.default || null);
  }
  return HANDLERS.get(nome);
}

/** Adapta a resposta do Node à interface que as funções esperam (status/json/setHeader/end). */
function adaptarRes(res) {
  return {
    setHeader: (k, v) => res.setHeader(k, v),
    getHeader: (k) => res.getHeader(k),
    status(c) { res.statusCode = c; return this; },
    json(o) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(o));
      return this;
    },
    end() { if (!res.writableEnded) res.end(); return this; },
  };
}

async function lerCorpo(req) {
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  const bruto = Buffer.concat(pedacos).toString('utf8');
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch { return bruto; }
}

async function tratarAPI(req, res, caminho) {
  const handler = await handlerDe(caminho);
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: `Função ${caminho} não encontrada em api/.` }));
    return true;
  }
  const corpo = req.method === 'POST' || req.method === 'PUT' ? await lerCorpo(req) : null;
  await handler({ method: req.method, headers: req.headers, body: corpo, socket: req.socket }, adaptarRes(res));
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let caminho = decodeURIComponent(url.pathname);

    if (caminho.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      await tratarAPI(req, res, caminho);
      return;
    }
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
  const chaves = String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(/[\s,;]+/).filter(Boolean);
  console.log(chaves.length
    ? `[serve] proxy local ativo: /api/ia e /api/modelos com ${chaves.length} chave(s) do Gemini`
    : '[serve] proxy local sem chave: defina GEMINI_API_KEYS para testar o modo "Servidor" (ex.: GEMINI_API_KEYS="AIza..." node tools/serve.mjs)');
});
