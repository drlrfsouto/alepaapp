/* serverless/lib/gemini.js — núcleo compartilhado pelas funções de /api.
 *
 * Por que existe: no modo "proxy" as chaves do Gemini ficam em variáveis de ambiente do
 * servidor (Vercel/Netlify/Node) e NUNCA chegam ao navegador. Este módulo carrega as
 * chaves, faz a rotação de CONTINGÊNCIA (429/401/403/404/5xx → próxima chave), aplica
 * geladeira de 60 s na chave esgotada e impõe um limite de requisições por IP.
 *
 * Variáveis de ambiente (todas opcionais, com padrão sensato):
 *   GEMINI_API_KEYS="AIza1,AIza2 AIza3"   lista separada por vírgula, espaço ou quebra de linha
 *   GEMINI_API_KEY="AIza1"                chave principal (alternativa à lista)
 *   GEMINI_API_KEY_2 / _3 / _4 ...        chaves de contingência numeradas (alternativa)
 *   GEMINI_MODEL="gemini-flash-latest"    modelo padrão (free tier: Flash / Flash-Lite)
 *   GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
 *   ALLOWED_ORIGINS="https://x.vercel.app,https://*.meudominio.com"  vazio = só mesma origem
 *   IA_MAX_TOKENS=4096                    teto de maxOutputTokens aceito
 *   IA_RATE_LIMIT=30                      requisições/minuto por IP (0 desliga)
 *   IA_TIMEOUT_MS=60000
 */

const BASE_PADRAO = 'https://generativelanguage.googleapis.com/v1beta';
const MODELO_PADRAO = 'gemini-flash-latest';
const GELADEIRA_MS = 60_000;
const TROCAVEIS = new Set([429, 401, 403, 404, 500, 503]);

/** Lê as chaves do ambiente, na ordem: GEMINI_API_KEYS, GEMINI_API_KEY, GEMINI_API_KEY_N. */
export function carregarChaves(env = process.env) {
  const lista = [];
  const brutas = String(env.GEMINI_API_KEYS || '')
    .split(/[\s,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  lista.push(...brutas);
  if (env.GEMINI_API_KEY) lista.push(String(env.GEMINI_API_KEY).trim());
  for (let i = 2; i <= 12; i++) {
    const v = env[`GEMINI_API_KEY_${i}`];
    if (v) lista.push(String(v).trim());
  }
  return [...new Set(lista.filter(Boolean))];
}

export function config(env = process.env) {
  return {
    chaves: carregarChaves(env),
    modelo: String(env.GEMINI_MODEL || MODELO_PADRAO),
    base: String(env.GEMINI_BASE_URL || BASE_PADRAO).replace(/\/$/, ''),
    maxTokens: Number(env.IA_MAX_TOKENS || 4096),
    rateLimit: Number(env.IA_RATE_LIMIT ?? 30),
    timeout: Number(env.IA_TIMEOUT_MS || 60000),
    origens: String(env.ALLOWED_ORIGINS || '')
      .split(/[\s,;]+/)
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

/* -------- geladeira e limite por IP (em memória: valem por instância "quente") -------- */
const geladas = new Map(); // indice -> timestamp de liberação
const acessos = new Map(); // ip -> { n, reset }

export function chaveLiberada(indice) {
  const ate = geladas.get(indice);
  return !ate || ate <= Date.now();
}

export function gelarChave(indice) {
  geladas.set(indice, Date.now() + GELADEIRA_MS);
}

export function liberarChave(indice) {
  geladas.delete(indice);
}

/** @returns {{ok:boolean, motivo?:string, falta?:number}} */
export function limitarPorIP(ip, limite) {
  if (!limite || limite <= 0) return { ok: true };
  const agora = Date.now();
  const jan = acessos.get(ip) || { n: 0, reset: agora + 60_000 };
  if (agora > jan.reset) { jan.n = 0; jan.reset = agora + 60_000; }
  jan.n += 1;
  acessos.set(ip, jan);
  if (jan.n > limite) return { ok: false, motivo: 'rate_limit', falta: Math.max(1, Math.round((jan.reset - agora) / 1000)) };
  return { ok: true };
}

export function ipDoCliente(req) {
  const xff = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req?.socket?.remoteAddress || 'desconhecido';
}

/* -------- CORS -------- */

/** Devolve a origem permitida ou null. Sem ALLOWED_ORIGINS, só aceita mesma origem. */
export function origemPermitida(req, cfg) {
  const origem = String(req?.headers?.origin || '');
  if (!origem) return null; // chamadas sem Origin (curl, mesmo domínio)
  if (!cfg.origens.length) return null; // não liberamos cross-origin por padrão
  let host = '';
  try { host = new URL(origem).hostname; } catch { return null; }
  for (const padraoBruto of cfg.origens) {
    if (padraoBruto === '*') return origem;
    const padrao = padraoBruto.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (padrao.startsWith('*.')) {
      const dominio = padrao.slice(1);         // ".vercel.app"
      const raiz = padrao.slice(2);            // "vercel.app"
      if (host.endsWith(dominio) || host === raiz) return origem;
    } else if (padrao === host || padraoBruto === origem) {
      return origem;
    }
  }
  return null;
}

export function cabecalhosCORS(req, cfg) {
  const permitida = origemPermitida(req, cfg);
  const h = { 'content-type': 'application/json; charset=utf-8' };
  if (permitida) {
    h['access-control-allow-origin'] = permitida;
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-allow-methods'] = 'GET,POST,OPTIONS';
    h['access-control-max-age'] = '600';
    h.vary = 'Origin';
  }
  return h;
}

/* -------- chamada ao Gemini com rotação -------- */

/** Uma requisição `generateContent` com UMA chave. A chave vai no cabeçalho, nunca na URL. */
async function chamarUmaChave({ base, modelo, chave, mensagens, system, maxTokens, temperatura, json, timeout }) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeout);
  const generationConfig = { maxOutputTokens: maxTokens };
  if (typeof temperatura === 'number' && Number.isFinite(temperatura)) generationConfig.temperature = temperatura;
  if (json) generationConfig.responseMimeType = 'application/json';
  try {
    const res = await fetch(`${base}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      signal: controlador.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        contents: mensagens.length ? mensagens : [{ role: 'user', parts: [{ text: 'Por onde começo?' }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig,
      }),
    });
    const status = res.status;
    let corpo = null;
    const bruto = await res.text().catch(() => '');
    try { corpo = JSON.parse(bruto); } catch { corpo = bruto; }
    if (!res.ok) {
      const detalhe = corpo?.error?.message || (typeof corpo === 'string' ? corpo.slice(0, 300) : '');
      const erro = new Error(`HTTP ${status} — ${detalhe || res.statusText}`);
      erro.status = status;
      throw erro;
    }
    if (corpo?.promptFeedback?.blockReason) {
      const erro = new Error(`Resposta bloqueada pelo provedor (${corpo.promptFeedback.blockReason}).`);
      erro.status = 400;
      erro.bloqueada = true;
      throw erro;
    }
    const cand = corpo?.candidates?.[0];
    const texto = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!texto) {
      const motivo = cand?.finishReason || 'sem conteúdo';
      const erro = new Error(motivo === 'MAX_TOKENS'
        ? 'A resposta estourou o limite de tokens. Peça menos itens por vez.'
        : `O modelo não retornou texto (${motivo}).`);
      erro.status = motivo === 'MAX_TOKENS' ? 400 : 502;
      throw erro;
    }
    return {
      texto,
      modelo: cand?.model || modelo,
      truncado: cand?.finishReason === 'MAX_TOKENS',
      uso: corpo?.usageMetadata
        ? { entrada: corpo.usageMetadata.promptTokenCount, saida: corpo.usageMetadata.candidatesTokenCount }
        : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chama o Gemini percorrendo as chaves (a ativa primeiro, pulando as geladas).
 * @returns {Promise<{texto:string, modelo:string, chave:number, totalChaves:number,
 *                    contingencia:boolean, truncado:boolean, uso:object|null, tentadas:Array}>}
 */
export async function gerar({ mensagens, system = null, maxTokens = 1200, temperatura = null, json = false, modelo = null, cfg = config() }) {
  if (!cfg.chaves.length) {
    const erro = new Error('Nenhuma chave configurada no servidor (defina GEMINI_API_KEYS ou GEMINI_API_KEY).');
    erro.status = 500;
    throw erro;
  }
  const total = cfg.chaves.length;
  const alvo = Math.min(Math.max(Number(maxTokens) || 1200, 64), cfg.maxTokens);
  const indices = cfg.chaves.map((_, i) => i);
  const ordem = [...indices.filter((i) => chaveLiberada(i)), ...indices.filter((i) => !chaveLiberada(i))];
  const tentadas = [];
  let ultimo = null;

  for (let i = 0; i < ordem.length; i++) {
    const indice = ordem[i];
    try {
      const r = await chamarUmaChave({
        base: cfg.base,
        modelo: modelo || cfg.modelo,
        chave: cfg.chaves[indice],
        mensagens, system,
        maxTokens: alvo,
        temperatura: temperatura == null ? null : Number(temperatura),
        json,
        timeout: cfg.timeout,
      });
      liberarChave(indice);
      return Object.assign(r, { chave: indice, totalChaves: total, contingencia: i > 0, tentadas });
    } catch (e) {
      ultimo = e;
      tentadas.push({ chave: indice + 1, status: e.status || 0, erro: String(e.message || e).slice(0, 160) });
      if (e.status === 429) gelarChave(indice);
      const ehTroca = TROCAVEIS.has(Number(e.status)) || /RESOURCE_EXHAUSTED|API_KEY_INVALID|PERMISSION_DENIED/.test(String(e.message || ''));
      if (!ehTroca || e.bloqueada || i === ordem.length - 1) break;
    }
  }
  ultimo.tentadas = tentadas;
  ultimo.totalChaves = total;
  ultimo.todasChaves = tentadas.length > 1;
  throw ultimo;
}

/** Lista os modelos liberados para as chaves do servidor (tenta em ordem). */
export async function modelos({ cfg = config() } = {}) {
  if (!cfg.chaves.length) {
    const erro = new Error('Nenhuma chave configurada no servidor.');
    erro.status = 500;
    throw erro;
  }
  let ultimo = null;
  for (let indice = 0; indice < cfg.chaves.length; indice++) {
    try {
      const res = await fetch(`${cfg.base}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': cfg.chaves[indice] },
      });
      if (!res.ok) {
        const detalhe = (await res.text().catch(() => '')).slice(0, 200);
        const erro = new Error(`HTTP ${res.status} — ${detalhe}`);
        erro.status = res.status;
        throw erro;
      }
      const j = await res.json();
      const lista = (j.models || [])
        .map((m) => ({
          id: String(m.name || '').replace(/^models\//, ''),
          rotulo: m.displayName || m.name,
          gera: (m.supportedGenerationMethods || []).includes('generateContent'),
          descricao: m.description || '',
        }))
        .filter((m) => m.id && m.gera !== false);
      const peso = (id) => (/flash-lite|lite-latest/.test(id) ? 0 : /flash/.test(id) ? 1 : /latest/.test(id) ? 2 : 3);
      lista.sort((a, b) => peso(a.id) - peso(b.id) || a.id.localeCompare(b.id));
      return { modelos: lista, chave: indice, totalChaves: cfg.chaves.length };
    } catch (e) {
      ultimo = e;
      if (!TROCAVEIS.has(Number(e.status))) throw e;
    }
  }
  throw ultimo;
}

/** Mensagem de dica em português para os erros mais comuns da camada gratuita. */
export function dicaDeErro(e, total = 1) {
  const msg = String(e?.message || '');
  if (e?.status === 429) {
    return total > 1
      ? `Todas as ${total} chaves do servidor chegaram ao limite gratuito (RPM/TPM/RPD por projeto). A cota diária zera à meia-noite do horário do Pacífico. Aguarde alguns minutos ou adicione outra chave em GEMINI_API_KEYS.`
      : 'Limite da camada GRATUITA atingido no servidor. Aguarde alguns minutos, use um modelo Flash-Lite (mais folga) ou adicione uma segunda chave em GEMINI_API_KEYS. Limites: https://aistudio.google.com/rate-limit';
  }
  if ([400, 401, 403].includes(e?.status)) return 'Chave do Gemini inválida, expirada ou sem permissão no servidor. Gere outra em https://aistudio.google.com/apikey e atualize a variável de ambiente.';
  if (e?.status === 404) return `O modelo "${e?.modelo || ''}" não está disponível para estas chaves. Na camada gratuita só existem modelos Flash/Flash-Lite — veja /api/modelos.`;
  if (/MAX_TOKENS|limite de tokens/i.test(msg)) return 'Resposta maior que o limite de tokens: gere menos itens por vez ou aumente IA_MAX_TOKENS.';
  if (/abort|timeout/i.test(msg)) return 'Tempo esgotado na chamada ao Gemini. Tente novamente ou reduza o tamanho do pedido.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|getaddrinfo/i.test(msg)) return 'O servidor não conseguiu alcançar generativelanguage.googleapis.com (DNS/egress bloqueado ou Google fora do ar). Em alguns ambientes é preciso liberar a saída de rede para o domínio.';
  return '';
}
