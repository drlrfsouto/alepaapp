/* ai.js — tutor de IA com chave própria do usuário (BYO key) + modo offline.
 *
 * Dois modos de operação:
 *   - 'navegador' (padrão): as chaves ficam no localStorage e a chamada sai direto do
 *     cliente para o provedor. Não há backend. Suporta VÁRIAS chaves gratuitas do
 *     Google AI Studio com CONTINGÊNCIA automática: se a primeira devolver 429
 *     (cota esgotada), 401/403 (chave inválida), 404 (modelo indisponível) ou 5xx,
 *     o app tenta a próxima e ainda deixa a chave esgotada 1 min "na geladeira".
 *   - 'proxy': a chamada vai para uma função serverless do próprio deploy
 *     (`/api/ia`, ver api/ia.js — Vercel/Netlify/Cloudflare) e as chaves ficam em
 *     variáveis de ambiente do servidor. Nada de chave no navegador.
 *
 * Provedores suportados:
 *   - gemini    (Google AI Studio — chave GRATUITA; recomendado)
 *   - openai    (OpenAI / qualquer endpoint compatível: Groq, OpenRouter, Together, Ollama local)
 *   - anthropic (Claude)
 *   - custom    (OpenAI-compatible com baseUrl própria)
 *   - nenhum    (MODO OFFLINE: monta explicações a partir do próprio banco de dados)
 */

import { dados, materiaNome, topicoTexto } from './data.js';
import { normalizar } from './util.js';

/**
 * Provedores de IA suportados. O app é 100% client-side: a chave fica no
 * localStorage do navegador e a chamada sai direto do cliente.
 *
 * RECOMENDADO: Google Gemini (chave GRATUITA no AI Studio — sem cartão de crédito).
 * Modelos da camada gratuita em 2026: família Flash e Flash-Lite
 * (os modelos Pro passaram a ser pagos em abril/2026).
 * O alias `gemini-flash-latest` aponta sempre para o Flash estável mais recente.
 */
export const PROVEDORES = {
  gemini: {
    nome: 'Google Gemini — chave GRÁTIS no AI Studio (recomendado)',
    padraoModelo: 'gemini-flash-latest',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    docs: 'https://aistudio.google.com/apikey',
    gratuito: true,
    listaModelos: true,
    modelosSugeridos: [
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
    limite: 'Camada gratuita: limites por PROJETO e por modelo (RPM/TPM/RPD), com a cota diária zerando à meia-noite (horário do Pacífico). Consulte os seus em https://aistudio.google.com/rate-limit.',
  },
  openai: {
    nome: 'OpenAI (ChatGPT)', padraoModelo: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1', docs: 'https://platform.openai.com/api-keys',
    listaModelos: true,
  },
  anthropic: {
    nome: 'Anthropic (Claude)', padraoModelo: 'claude-3-5-sonnet-latest',
    baseUrl: 'https://api.anthropic.com/v1', docs: 'https://console.anthropic.com/settings/keys',
  },
  custom: {
    nome: 'Compatível com OpenAI (Groq, OpenRouter, Ollama, Gemini via /openai…)',
    padraoModelo: '', baseUrl: '', docs: '', listaModelos: true,
  },
  nenhum: { nome: 'Modo offline (sem IA externa)', padraoModelo: '', baseUrl: '', docs: '' },
};

export const SYSTEM_PROMPT = `Você é um tutor especializado no Concurso Público nº 002/2026 da Assembleia Legislativa do Estado do Pará (ALEPA), banca FUNDAÇÃO CETAP, para o CARGO 02 — Assessoramento Legislativo / Assessor Técnico PL.AL.102 (nível superior).

Contexto da prova objetiva (13/12/2026, manhã, 3 horas, em Belém/PA):
- Língua Portuguesa: 10 questões = 2,0 pontos
- Legislação Institucional e Ética no Serviço Público: 10 questões = 2,0 pontos
- Informática Básica: 5 questões = 1,0 ponto
- Raciocínio Lógico: 5 questões = 1,0 ponto
- Conhecimentos Específicos: 20 questões = 4,0 pontos (Dir. Administrativo, Dir. Civil, Dir. Constitucional, Dir. Financeiro, Dir. Previdenciário, Dir. Processual Civil, Dir. Processual Constitucional, Direitos Humanos, Processo Legislativo e Técnica Legislativa, Noções de Secretaria e Noções de Administração Geral)
- Total: 50 questões, 10,0 pontos, 5 alternativas (A a E). CADA questão vale 0,2 ponto (valor uniforme); os blocos diferem apenas pelo número de questões.
- Aprovação: mínimo 6,0 pontos E classificação dentro de 4× o número de vagas (11 vagas).
- Desempate: idade → Específicos → Legislação e Ética → Português → RL → Informática.

REGRAS DE RESPOSTA:
1. Responda SEMPRE em português do Brasil, com terminologia jurídica precisa.
2. Cite o dispositivo legal (lei, artigo, parágrafo, inciso) sempre que aplicável. Se não tiver certeza do número do dispositivo, diga "confirme o dispositivo" em vez de inventar.
3. Estruture com markdown enxuto: títulos curtos, listas, negrito nos termos-chave.
4. Seja didático: comece pela resposta direta, depois o fundamento, depois a pegadinha típica da banca CETAP, e finalize com um mnemônico quando ajudar.
5. Nunca invente jurisprudência, súmula, artigo, prazo ou número. Se não souber, declare a incerteza.
6. Quando gerar questões, use EXATAMENTE 5 alternativas (A a E), apenas uma correta, com comentário detalhado e alternativa errada plausível (estilo CETAP: troca de prazos, de órgãos, de quórum, de competência).
7. Priorize o conteúdo do Anexo II (conteúdo programático) do edital. Não divague para matérias fora do programa.
8. Mantenha as respostas objetivas — o usuário está revisando, não lendo um tratado.`;

/* ---------------- chamadas ---------------- */

/* ================= chaves: principal + contingência ================= */

/** Tempo em que uma chave que devolveu 429 fica fora da rotação. */
const GELADEIRA_MS = 60_000;

/**
 * Todas as chaves configuradas, sem duplicatas: a "principal" (`apiKey`) seguida das
 * de contingência (`apiKeys[]`). Cada uma pode vir de um projeto diferente do AI Studio —
 * os limites gratuitos são POR PROJETO, então N chaves ≈ N cotas.
 */
export function chavesIA(cfg) {
  const brutas = [cfg?.apiKey, ...(Array.isArray(cfg?.apiKeys) ? cfg.apiKeys : [])];
  return [...new Set(brutas.map((k) => String(k || '').trim()).filter(Boolean))];
}

/**
 * Ordem de uso das chaves: começa pela última que funcionou (`chaveAtiva`), segue pelas
 * livres e deixa as que estão na geladeira (429 há menos de `GELADEIRA_MS`) para o fim —
 * como último recurso, já que é melhor tentar do que devolver erro sem tentar.
 * @returns {Array<{chave:string, indice:number, gelada:boolean}>}
 */
export function ordemDeChaves(cfg) {
  const chaves = chavesIA(cfg);
  if (!chaves.length) return [];
  const agora = Date.now();
  const geladas = (cfg && cfg.chaveGelada) || {};
  const ativa = Math.min(Math.max(Number(cfg?.chaveAtiva) || 0, 0), chaves.length - 1);
  const indices = chaves.map((_, i) => i);
  const ordem = [...indices.slice(ativa), ...indices.slice(0, ativa)];
  const livres = ordem.filter((i) => !geladas[i] || geladas[i] <= agora);
  const presas = ordem.filter((i) => geladas[i] && geladas[i] > agora).sort((a, b) => geladas[a] - geladas[b]);
  return [...livres, ...presas].map((i) => ({ chave: chaves[i], indice: i, gelada: Boolean(geladas[i] && geladas[i] > agora) }));
}

/** Erro que justifica tentar OUTRA chave (cota, chave inválida, modelo ausente, servidor). */
export function ehErroDeChave(e) {
  const msg = String(e?.message || '');
  const s = Number(e?.status) || 0;
  if ([429, 401, 403, 404, 500, 503].includes(s)) return true;
  if (s === 400 && /API_KEY|INVALID_ARGUMENT/i.test(msg) && /key/i.test(msg)) return true;
  return /RESOURCE_EXHAUSTED|API_KEY_INVALID|PERMISSION_DENIED|Failed to fetch|NetworkError|Load failed/i.test(msg);
}

/** Rótulo curto para exibir na interface: "chave 2 de 3". */
export function rotuloChave(indice, total) {
  if (!total || total < 2) return total ? 'chave do navegador' : '';
  return `chave ${indice + 1} de ${total}`;
}

export function configurado(cfg) {
  if (!cfg || cfg.provedor === 'nenhum') return false;
  if (cfg.modo === 'proxy') return Boolean(cfg.proxyUrl || '/api/ia');
  if (cfg.provedor === 'custom' && !cfg.baseUrl) return false;
  return chavesIA(cfg).length > 0;
}

/**
 * Conversa com o provedor configurado.
 * @param {object} cfg        estado `ai` do usuário
 * @param {Array}  mensagens  [{ role: 'system'|'user'|'assistant', content }]
 * @param {object} opts       { maxTokens, temperatura, signal, json } — `json: true` pede
 *                            resposta em JSON estrito (responseMimeType/response_format)
 * @returns {{texto:string|null, offline?:boolean, motivo?:string, erro?:string, dica?:string,
 *            limite?:boolean, chaves?:{indice:number,total:number,geladas:object,tentadas:Array},
 *            contingencia?:boolean}}
 */
export async function conversar(cfg, mensagens, { maxTokens = 1200, temperatura = null, signal = null, json = false } = {}) {
  if (!configurado(cfg)) return { texto: null, offline: true, motivo: 'IA externa não configurada' };
  const t = temperatura ?? cfg.temperatura ?? 0.3;
  try {
    if (cfg.modo === 'proxy') return await chamarProxy(cfg, mensagens, maxTokens, t, signal, json);
    if (cfg.provedor === 'anthropic') return await chamarAnthropic(cfg, mensagens, maxTokens, t, signal);
    if (cfg.provedor === 'gemini') return await chamarGemini(cfg, mensagens, maxTokens, t, signal, json);
    return await chamarOpenAI(cfg, mensagens, maxTokens, t, signal, json);
  } catch (e) {
    return { texto: null, offline: true, erro: e.message, chaves: e.chaves || null, ...dicaDeErro(e, cfg) };
  }
}

/** Traduz os erros mais comuns em orientação acionável (sobretudo na camada gratuita). */
function dicaDeErro(e, cfg) {
  const msg = String(e?.message || e || '');
  const provedor = PROVEDORES[cfg?.provedor] || {};
  const total = e?.chaves?.total || chavesIA(cfg).length;
  const tentadas = e?.chaves?.tentadas?.length || 0;
  if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) {
    if (total > 1 && tentadas >= total) {
      return {
        limite: true,
        dica: `As ${total} chaves gratuitas chegaram ao limite (RPM/TPM/RPD por projeto). A cota diária zera à meia-noite do horário do Pacífico — enquanto isso o app segue no modo offline. Alternativas: adicionar outra chave de um projeto diferente em Configurações, usar um modelo Flash-Lite (costuma ter mais folga) ou esperar alguns minutos.`,
      };
    }
    return {
      limite: true,
      dica: cfg?.provedor === 'gemini'
        ? `Limite da camada GRATUITA atingido${total > 1 ? ` na chave ${tentadas || 1}` : ''}. Os limites são por projeto e por modelo (requisições/minuto, tokens/minuto e requisições/dia) e a cota diária zera à meia-noite do horário do Pacífico.${total > 1 ? ' O app já tenta a próxima chave sozinho.' : ' Adicione uma segunda chave gratuita em Configurações → "Chaves de contingência" para o app alternar automaticamente.'} Detalhes: https://aistudio.google.com/rate-limit`
        : 'Limite de requisições do provedor atingido. Aguarde um pouco e tente novamente, ou reduza o tamanho da resposta.',
    };
  }
  if (/400|401|403|API_KEY|INVALID_KEY|PERMISSION_DENIED/i.test(msg)) {
    return { dica: `Chave inválida, expirada ou sem permissão${total > 1 ? ` (todas as ${total} falharam)` : ''}. Gere outra em ${provedor.docs || 'https://aistudio.google.com/apikey'} e cole em Configurações → Tutor IA.` };
  }
  if (/404|NOT_FOUND|models?\//i.test(msg)) {
    if (cfg?.modo === 'proxy') {
      return { dica: 'O proxy de IA não foi encontrado neste servidor. Faça deploy de `api/ia.js` (Vercel/Netlify) ou volte para o modo "Navegador" em Configurações.' };
    }
    return { dica: `O modelo "${cfg?.modelo || provedor.padraoModelo}" não está disponível para a sua chave. Em Configurações → Tutor IA use "Listar modelos da minha chave" e escolha um da lista (na camada gratuita do Gemini, apenas modelos Flash e Flash-Lite).` };
  }
  if (/MAX_TOKENS|limite de tokens/i.test(msg)) {
    return { dica: 'A resposta estourou o limite de tokens. Gere menos itens por vez (ex.: 3 questões em vez de 10).' };
  }
  if (/Failed to fetch|NetworkError|CORS|Load failed/i.test(msg)) {
    return { dica: 'Falha de rede/CORS ao chamar o provedor. Verifique sua conexão; se estiver usando o modo "Navegador", o Gemini permite chamadas diretas do cliente. Alternativa sem rede: o modo offline continua funcionando.' };
  }
  return {};
}

/**
 * Lista os modelos disponíveis para a chave do usuário (Gemini e compatíveis OpenAI).
 * Usado pelo botão "Listar modelos" em Configurações — evita digitar nome de modelo
 * que a chave gratuita não alcança. Tenta as chaves em ordem (contingência).
 */
export async function listarModelos(cfg) {
  if (cfg?.modo === 'proxy') {
    const url = (cfg.proxyUrl || '/api/ia').replace(/\/?ia\/?$/, 'modelos');
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(await textoErro(res));
    const j = await res.json();
    if (j?.erro) throw new Error(j.erro);
    return j?.modelos || [];
  }
  const ordem = ordemDeChaves(cfg);
  if (!ordem.length) throw new Error('Configure provedor e chave antes de listar modelos.');
  const base = (cfg.baseUrl || PROVEDORES[cfg.provedor]?.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('Este provedor não expõe lista de modelos. Informe o nome manualmente.');

  let ultimo = null;
  for (const { chave, indice } of ordem) {
    try {
      const cabecalhos = cfg.provedor === 'gemini'
        ? { 'x-goog-api-key': chave }
        : { Authorization: `Bearer ${chave}` };
      const res = await fetch(`${base}/models?pageSize=200`, { headers: cabecalhos });
      if (!res.ok) { const e = new Error(await textoErro(res)); e.status = res.status; throw e; }
      const j = await res.json();
      const crus = j.models || j.data || [];
      const lista = crus
        .map((m) => {
          const id = String(m.name || m.id || '').replace(/^models\//, '');
          const rotulo = m.displayName || m.display_name || id;
          const gera = (m.supportedGenerationMethods || []).includes('generateContent');
          return { id, rotulo, gera, descricao: m.description || '' };
        })
        .filter((m) => m.id && m.gera !== false);
      // Flash-Lite primeiro (mais folga na cota gratuita), depois Flash, depois o resto
      const peso = (id) => (/flash-lite|lite-latest/.test(id) ? 0 : /flash/.test(id) ? 1 : /latest/.test(id) ? 2 : 3);
      lista.sort((a, b) => peso(a.id) - peso(b.id) || a.id.localeCompare(b.id));
      lista.chaveUsada = indice;
      return lista;
    } catch (e) {
      ultimo = e;
      if (!ehErroDeChave(e)) throw e;
    }
  }
  throw ultimo || new Error('Não foi possível listar os modelos.');
}

/* ================= modo proxy (chaves no servidor) ================= */

/**
 * Chama a função serverless do próprio deploy (`api/ia.js`), que guarda as chaves em
 * variáveis de ambiente e faz a rotação de contingência do lado do servidor.
 * Útil em produção (Vercel/Netlify): a chave nunca chega ao navegador.
 */
async function chamarProxy(cfg, mensagens, maxTokens, temperatura, signal, json = false) {
  const url = cfg.proxyUrl || '/api/ia';
  const system = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    // o SYSTEM_PROMPT viaja no corpo: o servidor não precisa duplicá-lo e você pode
    // auditar exatamente o que é enviado
    body: JSON.stringify({
      mensagens: mensagens.filter((m) => m.role !== 'system'),
      system: [SYSTEM_PROMPT, system].filter(Boolean).join('\n\n'),
      maxTokens, temperatura, json, modelo: cfg.modelo || null,
    }),
  });
  let j = null;
  try { j = await res.json(); } catch { j = null; }
  if (!res.ok || !j || j.erro) {
    const e = new Error(j?.erro || `HTTP ${res.status} — ${j?.detalhe || res.statusText || 'falha no proxy'}`);
    e.status = res.status;
    e.chaves = j?.chaves || null;
    throw e;
  }
  return {
    texto: j.texto, provedor: j.provedor || 'gemini', modelo: j.modelo,
    truncado: Boolean(j.truncado), uso: j.uso || null,
    chave: j.chave ?? null, totalChaves: j.totalChaves ?? null,
    contingencia: Boolean(j.contingencia),
    chaves: { indice: j.chaveIndice ?? 0, total: j.totalChaves ?? 1, geladas: {}, tentadas: j.tentadas || [] },
  };
}

async function chamarOpenAI(cfg, mensagens, maxTokens, temperatura, signal, json = false) {
  const base = (cfg.baseUrl || PROVEDORES.openai.baseUrl).replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chavesIA(cfg)[0] || cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelo || PROVEDORES.openai.padraoModelo,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...mensagens],
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(await textoErro(res));
  const j = await res.json();
  return { texto: j.choices?.[0]?.message?.content || '', provedor: 'openai', modelo: j.model };
}

async function chamarAnthropic(cfg, mensagens, maxTokens, temperatura, signal) {
  const base = (cfg.baseUrl || PROVEDORES.anthropic.baseUrl).replace(/\/$/, '');
  const historico = mensagens.filter((m) => m.role !== 'system');
  const extra = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': chavesIA(cfg)[0] || cfg.apiKey,
      'anthropic-version': '2023-06-01',
      // necessário para chamadas diretas do navegador
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.modelo || PROVEDORES.anthropic.padraoModelo,
      max_tokens: maxTokens,
      temperature,
      system: `${SYSTEM_PROMPT}\n\n${extra}`.trim(),
      messages: historico.length ? historico : [{ role: 'user', content: 'Olá! Por onde devo começar a estudar hoje?' }],
    }),
  });
  if (!res.ok) throw new Error(await textoErro(res));
  const j = await res.json();
  const texto = (j.content || []).map((c) => c.text || '').join('');
  return { texto, provedor: 'anthropic', modelo: j.model };
}

/**
 * Gemini com CONTINGÊNCIA: percorre as chaves configuradas (a ativa primeiro, pulando as
 * que estão na geladeira) até uma responder. Devolve também o mapa de chaves geladas para
 * o estado persistir (`store.registrarChavesIA`).
 */
async function chamarGemini(cfg, mensagens, maxTokens, temperatura, signal, json = false) {
  const ordem = ordemDeChaves(cfg);
  if (!ordem.length) throw new Error('Nenhuma chave de API configurada.');
  const total = chavesIA(cfg).length;
  const geladas = Object.assign({}, cfg.chaveGelada || {});
  const tentadas = [];
  let ultimoErro = null;

  for (let i = 0; i < ordem.length; i++) {
    const { chave, indice } = ordem[i];
    try {
      const r = await chamarGeminiUmaChave(cfg, chave, mensagens, maxTokens, temperatura, signal, json);
      delete geladas[indice];
      return Object.assign(r, {
        chave: indice, totalChaves: total,
        contingencia: indice !== 0 || i > 0,
        chaves: { indice, total, geladas, tentadas },
      });
    } catch (e) {
      ultimoErro = e;
      tentadas.push({ chave: indice + 1, erro: String(e.message || e).slice(0, 160) });
      if (Number(e.status) === 429) geladas[indice] = Date.now() + GELADEIRA_MS;
      const ultima = i === ordem.length - 1;
      if (ultima || !ehErroDeChave(e)) break;
    }
  }
  if (ultimoErro) {
    ultimoErro.chaves = { indice: tentadas.length ? tentadas[tentadas.length - 1].chave - 1 : 0, total, geladas, tentadas };
    throw ultimoErro;
  }
  throw new Error('Não foi possível falar com o Gemini.');
}

/** Uma chamada Gemini com UMA chave. A chave vai no cabeçalho (nunca na URL). */
async function chamarGeminiUmaChave(cfg, apiKey, mensagens, maxTokens, temperatura, signal, json = false) {
  const base = (cfg.baseUrl || PROVEDORES.gemini.baseUrl).replace(/\/$/, '');
  const model = cfg.modelo || PROVEDORES.gemini.padraoModelo;
  const contents = mensagens.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const sys = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n');

  const generationConfig = { temperature: temperatura, maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';

  const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal,
    // chave no HEADER (não na URL): não vaza em log, histórico nem referer
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Por onde começo?' }] }],
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${sys}`.trim() }] },
      generationConfig,
    }),
  });
  if (!res.ok) {
    const e = new Error(await textoErro(res));
    e.status = res.status;
    throw e;
  }
  const j = await res.json();

  if (j.promptFeedback?.blockReason) {
    throw new Error(`Resposta bloqueada pelo provedor (${j.promptFeedback.blockReason}). Reformule a pergunta.`);
  }
  const cand = j.candidates?.[0];
  const texto = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!texto) {
    const motivo = cand?.finishReason || 'sem conteúdo';
    throw new Error(motivo === 'MAX_TOKENS'
      ? 'A resposta estourou o limite de tokens. Peça menos itens por vez ou aumente maxTokens.'
      : `O modelo não retornou texto (${motivo}).`);
  }
  return {
    texto, provedor: 'gemini', modelo: cand?.model || model,
    truncado: cand?.finishReason === 'MAX_TOKENS',
    uso: j.usageMetadata ? { entrada: j.usageMetadata.promptTokenCount, saida: j.usageMetadata.candidatesTokenCount } : null,
  };
}

async function textoErro(res) {
  let detalhe = '';
  try {
    const j = await res.json();
    detalhe = j.error?.message || j.message || JSON.stringify(j).slice(0, 300);
  } catch { detalhe = await res.text().catch(() => ''); }
  return `HTTP ${res.status} — ${detalhe || res.statusText}`;
}

/* ---------------- prompts prontos ---------------- */

export function promptExplicarAlternativas(q) {
  return `Explique, alternativa por alternativa, por que cada uma está certa ou errada na questão abaixo (matéria: ${materiaNome(q.materia)}; tópico do edital: ${topicoTexto(q.topico)}).

ENUNCIADO:
${q.contexto ? `${q.contexto}\n\n` : ''}${q.enunciado}

ALTERNATIVAS:
${q.alternativas.map((a) => `${a.letra}) ${a.texto}`).join('\n')}

GABARITO OFICIAL: ${q.gabarito}

Ao final, dê: (1) um mnemônico curto para fixar a regra; (2) a "pegadinha" mais provável que a banca Fundação CETAP usaria nessa mesma matéria; (3) os dispositivos legais citados com número exato.`;
}

export function promptResumoTopico(topico, materia) {
  return `Gere um resumo de estudo objetivo (máx. 350 palavras) sobre o seguinte tópico do Anexo II do edital ALEPA/CETAP, Cargo 02 — Assessor Técnico:

MATÉRIA: ${materia?.nome}
TÓPICO: ${topico?.texto}

Estruture como:
1) O que é (2 linhas)
2) Fundamento legal (dispositivos)
3) Pontos que a banca cobra (lista)
4) Prazos, quóruns e números críticos (tabela)
5) 3 pegadinhas típicas
6) Mnemônico final

Não invente dispositivos. Se não tiver certeza de um número, escreva "[confirmar]".`;
}

export function promptGerarQuestoes({ materia, topico, quantidade = 5, dificuldade = 'medio', estilo = 'Fundação CETAP' }) {
  return `Crie ${quantidade} questões inéditas de múltipla escolha no estilo da banca ${estilo}, sobre:

MATÉRIA: ${materia?.nome}
TÓPICO DO EDITAL: ${topico?.texto || 'todo o conteúdo programático da matéria'}
DIFICULDADE: ${dificuldade}

Regras OBRIGATÓRIAS:
- Exatamente 5 alternativas (A, B, C, D, E), apenas UMA correta.
- Enunciado no padrão CETAP ("Assinale a alternativa correta", "Com base em..., é correto afirmar").
- As alternativas erradas devem ser plausíveis: troque prazos, quóruns, órgãos competentes, efeitos (ex tunc × ex nunc) ou inclua/exclua uma ressalva legal.
- Comentário com o fundamento legal e a explicação de CADA alternativa.
- Inclua um mnemônico e as "pegadinhas".

Responda APENAS com JSON válido, sem markdown, no formato:
{"questoes":[{"enunciado":"...","contexto":"...","alternativas":[{"letra":"A","texto":"..."},{"letra":"B","texto":"..."},{"letra":"C","texto":"..."},{"letra":"D","texto":"..."},{"letra":"E","texto":"..."}],"gabarito":"A","comentario":"...","mnemonico":"...","leiSeca":["..."],"tags":["..."],"pegadinhas":["..."],"dificuldade":"${dificuldade}"}]}`;
}

export function promptPlanoDeEstudo({ diasRestantes, horasPorDia, statsPorMateria, pontosFracos }) {
  const tabela = statsPorMateria.map((s) => `- ${s.materia}: ${s.taxa}% de acerto em ${s.tentativas} tentativas`).join('\n') || '- (sem histórico ainda)';
  return `Monte um plano de estudo semanal para o Concurso ALEPA 2026, Cargo 02 (Assessor Técnico).

SITUAÇÃO:
- Faltam ${diasRestantes} dias para a prova (13/12/2026).
- Disponibilidade: ${horasPorDia} h/dia.
- Desempenho atual por matéria:
${tabela}
- Pontos mais fracos: ${pontosFracos.length ? pontosFracos.join(', ') : 'ainda não identificados'}.

Entregue:
1) Priorização das 15 matérias por retorno sobre o tempo investido (justifique pelos pontos em jogo: o bloco de Específicos concentra 4,0 dos 10,0 pontos em 20 questões; Português e Legislação, 2,0 cada em 10 questões; Informática e RL, 1,0 cada em 5 questões — cada questão vale 0,2).
2) Grade semanal (segunda a domingo) com blocos de 45–60 min e o que estudar em cada um.
3) Estratégia dos últimos 30 dias e dos últimos 7 dias.
4) Três erros clássicos de preparação para concursos que devo evitar.

Seja concreto e enxuto. Não repita o edital inteiro.`;
}

/* ---------------- MODO OFFLINE ---------------- */

/**
 * Sem IA externa: constrói explicações a partir dos dados já existentes no app.
 * Nunca inventa conteúdo — só reorganiza o que foi curado.
 */
export function explicacaoOffline(q) {
  const partes = [];
  partes.push(`## ${q.enunciado}\n`);
  if (q.gabarito) {
    const alt = q.alternativas.find((a) => a.letra === q.gabarito);
    partes.push(`**Gabarito: ${q.gabarito})** ${alt ? alt.texto : ''}\n`);
  }
  partes.push(`### Comentário\n${q.comentario || '_Comentário indisponível para esta questão._'}\n`);
  if (q.mnemonico) partes.push(`### Mnemônico\n${q.mnemonico}\n`);
  if (q.pegadinhas?.length) partes.push(`### Pegadinhas\n${q.pegadinhas.map((p) => `- ${p}`).join('\n')}\n`);
  if (q.leiSeca?.length) partes.push(`### Lei seca\n${q.leiSeca.map((l) => `- ${l}`).join('\n')}\n`);
  if (q.estrategia) partes.push(`### Estratégia de resolução\n${q.estrategia}\n`);
  if (q.estiloBanca) partes.push(`### Como a banca cobra\n${q.estiloBanca}\n`);
  partes.push(`> Modo offline: conteúdo gerado a partir do banco curado do app. Configure uma chave de IA em **Configurações** para explicações adaptativas.`);
  return partes.join('\n');
}

/** Resumo offline de um tópico: agrega resumos, questões e cards relacionados. */
export function resumoOffline(topico) {
  const relacionados = dados.resumos.filter((r) => r.topico === topico.id);
  const questoes = dados.questoes.filter((q) => q.topico === topico.id);
  const cards = dados.flashcards.filter((c) => c.topico === topico.id);
  const linhas = [`# ${topico.texto}`, `**Matéria:** ${topico.materiaNome} · **Prioridade:** ${topico.prioridade} · **Dificuldade:** ${topico.dificuldade}`, ''];
  if (relacionados.length) {
    linhas.push('## Resumo curado', '');
    for (const r of relacionados) {
      linhas.push(`### ${r.titulo}`, '', r.texto, '');
      if (r.pontosChave?.length) linhas.push('**Pontos-chave:**', ...r.pontosChave.map((p) => `- ${p}`), '');
      if (r.mnemonicos?.length) linhas.push('**Mnemônicos:**', ...r.mnemonicos.map((p) => `- ${p}`), '');
      if (r.caiNaProva) linhas.push(`**Como cai na prova:** ${r.caiNaProva}`, '');
      if (r.leiSeca?.length) linhas.push('**Legislação:**', ...r.leiSeca.map((p) => `- ${p}`), '');
    }
  } else {
    linhas.push('## Resumo curado', '', '_Ainda não há resumo escrito para este tópico. Configure uma chave de IA em Configurações para gerá-lo sob demanda._', '');
  }
  if (cards.length) {
    linhas.push('## Flashcards disponíveis', '');
    for (const c of cards.slice(0, 12)) linhas.push(`- **P:** ${c.frente}  \n  **R:** ${c.verso}`);
    linhas.push('');
  }
  if (questoes.length) {
    linhas.push(`## Questões no banco (${questoes.length})`, '');
    for (const q of questoes.slice(0, 8)) linhas.push(`- ${q.enunciado.slice(0, 140)}${q.enunciado.length > 140 ? '…' : ''} → gabarito **${q.gabarito}**`);
    linhas.push('');
  }
  const topicosIrmaos = dados.topicos.filter((t) => t.materia === topico.materia && t.id !== topico.id).slice(0, 8);
  if (topicosIrmaos.length) {
    linhas.push('## Tópicos vizinhos na mesma matéria', '');
    for (const t of topicosIrmaos) linhas.push(`- ${t.texto.slice(0, 160)}`);
  }
  return linhas.join('\n');
}

/** Diagnóstico offline a partir do desempenho registrado. */
export function diagnosticoOffline(statsPorMateria, diasRestantes, horasPorDia) {
  const fracas = statsPorMateria.filter((s) => s.tentativas >= 5).sort((a, b) => a.taxa - b.taxa).slice(0, 4);
  const fortes = statsPorMateria.filter((s) => s.tentativas >= 5).sort((a, b) => b.taxa - a.taxa).slice(0, 3);
  const linhas = ['## Diagnóstico automático (modo offline)', ''];
  if (!fracas.length) {
    linhas.push('Ainda não há histórico suficiente. Responda ao menos 5 questões por matéria para o diagnóstico ficar útil.', '');
    linhas.push(`Com ${diasRestantes} dias e ${horasPorDia} h/dia, você tem cerca de **${Math.round(diasRestantes * horasPorDia)} horas** de estudo — suficiente para cobrir os 319 tópicos do Anexo II duas vezes, se mantiver o ritmo.`, '');
  } else {
    linhas.push('**Prioridade máxima (menor taxa de acerto):**', ...fracas.map((s) => `- ${materiaNome(s.materia)}: ${s.taxa}% em ${s.tentativas} tentativas`), '');
  }
  if (fortes.length) linhas.push('**Já consolidadas (reduza o tempo, só revise):**', ...fortes.map((s) => `- ${materiaNome(s.materia)}: ${s.taxa}%`), '');
  linhas.push(
    '### Regra de alocação sugerida',
    '',
    '- Conhecimentos Específicos valem **4,0 pontos por questão** (20 questões = 8,0 dos 10,0 pontos da prova). Dedique ~50% do tempo a esse bloco.',
    '- Português e Legislação e Ética valem 2,0 por questão (10 questões cada = 2,0 + 2,0 pontos). Dedique ~35%.',
    '- Informática e Raciocínio Lógico valem 1,0 por questão (5 questões cada = 0,5 + 0,5). Dedique ~15%.',
    '- O primeiro critério de desempate depois da idade é a pontuação em **Conhecimentos Específicos** — reforça a prioridade acima.',
    '',
    '### Últimos 30 dias',
    '',
    '1. Simulado espelho completo a cada 7 dias, cronometrado (3h).',
    '2. Correção comentada no mesmo dia, com registro de cada erro no caderno de erros.',
    '3. Revisão apenas de resumos + flashcards vencidos; nada de material novo.',
    '4. Na última semana: somente lei seca, prazos, quóruns e mnemônicos.',
  );
  return linhas.join('\n');
}

/** Tenta extrair JSON de uma resposta de LLM (cercas de markdown, texto extra etc.). */
export function extrairJSON(texto) {
  if (!texto) return null;
  let t = texto.trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) t = cerca[1].trim();
  const ini = t.search(/[[{]/);
  if (ini < 0) return null;
  const abre = t[ini];
  const fecha = abre === '{' ? '}' : ']';
  let profundidade = 0;
  let emString = false;
  let escape = false;
  for (let i = ini; i < t.length; i++) {
    const c = t[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { emString = !emString; continue; }
    if (emString) continue;
    if (c === abre) profundidade++;
    else if (c === fecha) {
      profundidade--;
      if (profundidade === 0) {
        try { return JSON.parse(t.slice(ini, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function validarQuestaoGerada(q, materia, topico) {
  const erros = [];
  if (!q.enunciado) erros.push('sem enunciado');
  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) erros.push('precisa de 5 alternativas');
  if (!q.gabarito || !['A', 'B', 'C', 'D', 'E'].includes(q.gabarito)) erros.push('gabarito inválido');
  const letras = (q.alternativas || []).map((a) => a.letra);
  if (normalizar(letras.join('')) !== 'abcde') erros.push(`alternativas fora de ordem: ${letras.join(',')}`);
  if (!q.comentario) erros.push('sem comentário');
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    questao: {
      id: `gen-${materia}-${Math.random().toString(36).slice(2, 8)}`,
      materia,
      topico: topico?.id || null,
      dificuldade: q.dificuldade || 'medio',
      contexto: q.contexto || '',
      enunciado: q.enunciado.trim(),
      alternativas: q.alternativas.map((a) => ({ letra: a.letra.toUpperCase(), texto: String(a.texto).trim() })),
      gabarito: q.gabarito.toUpperCase(),
      comentario: q.comentario.trim(),
      mnemonico: q.mnemonico || '',
      leiSeca: q.leiSeca || [],
      tags: q.tags || [],
      pegadinhas: q.pegadinhas || [],
      estrategia: q.estrategia || '',
      estiloBanca: q.estiloBanca || 'Fundação CETAP',
      origem: 'gerada-por-ia',
      revisar: true,
    },
  };
}
