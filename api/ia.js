/* api/ia.js — função serverless que fala com o Gemini sem expor a chave ao navegador.
 *
 * Deploy: Vercel (zero-config: qualquer arquivo em /api vira rota), Netlify ou Node.
 *
 *   GET  /api/ia  → { ok, chaves, modelo }                 (health check, sem segredo)
 *   POST /api/ia  → { texto, modelo, chave, totalChaves, contingencia, uso, truncado }
 *                   corpo: { mensagens, system?, maxTokens?, temperatura?, json?, modelo? }
 *   em erro       → { erro, status, dica, tentadas }
 *
 * Variáveis de ambiente (ver serverless/lib/gemini.js):
 *   GEMINI_API_KEYS (ou GEMINI_API_KEY + GEMINI_API_KEY_2…), GEMINI_MODEL,
 *   ALLOWED_ORIGINS, IA_MAX_TOKENS, IA_RATE_LIMIT, IA_TIMEOUT_MS
 *
 * No app: Configurações → Inteligência artificial → Modo "Servidor (proxy)".
 */

import { config, gerar, limitarPorIP, ipDoCliente, cabecalhosCORS, dicaDeErro } from '../serverless/lib/gemini.js';

const PAPEIS = new Set(['user', 'model', 'assistant', 'system']);
const MAX_MENSAGENS = 24;      // histórico enviado ao modelo (controla gasto de tokens)
const MAX_CORPO = 200_000;     // bytes de corpo aceitos

function responder(res, status, corpo, cabecalhos) {
  Object.entries(cabecalhos || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(corpo);
}

function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

/** Normaliza o histórico para o formato do Gemini e separa o system prompt. */
function preparar(mensagens, systemExtra) {
  const lista = Array.isArray(mensagens) ? mensagens.slice(-MAX_MENSAGENS) : [];
  const system = [];
  const contents = [];
  for (const m of lista) {
    if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
    if (!PAPEIS.has(m.role)) continue;
    if (m.role === 'system') { system.push(m.content.trim()); continue; }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }
  if (systemExtra && typeof systemExtra === 'string') system.unshift(systemExtra.trim());
  return { contents, system: system.join('\n\n').slice(0, 20_000) || null };
}

export default async function handler(req, res) {
  const cfg = config();
  const cors = cabecalhosCORS(req, cfg);

  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-origin', cors['access-control-allow-origin'] || '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-max-age', '600');
    return res.status(204).end();
  }

  /* ---- health check: quantas chaves o servidor tem (nunca mostra o valor) ---- */
  if (req.method === 'GET') {
    return responder(res, 200, {
      ok: cfg.chaves.length > 0,
      provedor: 'gemini',
      chaves: cfg.chaves.length,
      modelo: cfg.modelo,
      limitePorMinuto: cfg.rateLimit,
      maxTokens: cfg.maxTokens,
      dica: cfg.chaves.length ? null : 'Defina GEMINI_API_KEYS (ou GEMINI_API_KEY) nas variáveis de ambiente do deploy.',
    }, cors);
  }

  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use GET (status) ou POST (gerar).' }, cors);

  const corpo = lerCorpo(req);
  if (!corpo) return responder(res, 400, { erro: 'Corpo JSON inválido.', dica: 'Envie { mensagens: [{ role, content }], maxTokens, temperatura, json }.' }, cors);
  if (JSON.stringify(corpo).length > MAX_CORPO) {
    return responder(res, 413, { erro: 'Pedido grande demais.', dica: `Reduza o histórico (máximo ${MAX_CORPO} bytes).` }, cors);
  }

  if (!cfg.chaves.length) {
    return responder(res, 500, {
      erro: 'Nenhuma chave do Gemini configurada no servidor.',
      dica: 'Defina GEMINI_API_KEYS="AIza...,AIza..." (ou GEMINI_API_KEY) no painel do seu deploy e refaça a publicação.',
    }, cors);
  }

  const limite = limitarPorIP(ipDoCliente(req), cfg.rateLimit);
  if (!limite.ok) {
    return responder(res, 429, {
      erro: 'Muitas requisições deste IP para o proxy.',
      dica: `Aguarde ~${limite.falta}s. O limite protege a cota gratuita das chaves do servidor (IA_RATE_LIMIT).`,
    }, cors);
  }

  const { contents, system } = preparar(corpo.mensagens, corpo.system);
  if (!contents.length) {
    return responder(res, 400, { erro: 'Nenhuma mensagem válida.', dica: 'Envie ao menos uma mensagem com role "user" e content não vazio.' }, cors);
  }

  const modeloPedido = typeof corpo.modelo === 'string' && corpo.modelo.trim() ? corpo.modelo.trim() : null;
  try {
    const r = await gerar({
      mensagens: contents,
      system,
      maxTokens: corpo.maxTokens,
      temperatura: corpo.temperatura,
      json: Boolean(corpo.json),
      modelo: modeloPedido,
      cfg,
    });
    return responder(res, 200, {
      texto: r.texto,
      provedor: 'gemini',
      modelo: r.modelo,
      truncado: r.truncado,
      uso: r.uso,
      chave: r.chave + 1,          // 1-based: só para exibição na interface
      chaveIndice: r.chave,        // 0-based: usado pelo cliente para lembrar a chave ativa
      totalChaves: r.totalChaves,
      contingencia: r.contingencia,
      tentadas: r.tentadas,
    }, cors);
  } catch (e) {
    const status = Number(e.status) || 502;
    return responder(res, status >= 500 ? 502 : status, {
      erro: String(e.message || 'Falha ao chamar o Gemini.'),
      status,
      dica: dicaDeErro(Object.assign(e, { modelo: modeloPedido || cfg.modelo }), e.totalChaves || cfg.chaves.length),
      tentadas: e.tentadas || [],
      totalChaves: e.totalChaves || cfg.chaves.length,
    }, cors);
  }
}
