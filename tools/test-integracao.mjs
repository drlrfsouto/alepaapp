/* test-integracao.mjs — testa SEM rede os caminhos de IA e o backup no Supabase:
 *
 *   1. contingência entre várias chaves gratuitas do Gemini (rotação em 429/401/404/5xx)
 *   2. "geladeira" de 60 s na chave esgotada e retomada pela chave que funcionou
 *   3. todas as chaves esgotadas → dica clara e fallback offline (sem exceção)
 *   4. proxy serverless api/ia.js (Vercel): health sem vazar segredo, validação de corpo,
 *      rotação de chaves do servidor, limite por IP e erro com dica em português
 *   5. api/modelos.js: descoberta de modelos ordenando Flash-Lite primeiro
 *   6. src/supabase.js: envio do progresso SEM as chaves de IA e restauro preservando-as
 *
 * Rode com:  npm run test:integracao   (ou `npm test`, que roda tudo)
 */

import assert from 'node:assert';
/* ---------------- ambiente mínimo (sem jsdom, sem rede) ---------------- */

const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
  clear: () => memoria.clear(),
};

/** Roteador de fetch falso: cada teste registra as respostas por padrão de URL/chave. */
let rotas = [];
let chamadasFetch = [];
globalThis.fetch = async (url, opts = {}) => {
  chamadasFetch.push({ url: String(url), opts });
  for (const rota of rotas) {
    if (rota.teste(String(url), opts)) return rota.resposta(String(url), opts);
  }
  throw new Error(`fetch sem rota definida para ${url}`);
};
function respostaJSON(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  };
}
function resetFetch() { rotas = []; chamadasFetch = []; }

/* ---------------- módulos sob teste ---------------- */

const { conversar, chavesIA, ordemDeChaves, listarModelos, rotuloChave } = await import('../src/ai.js');
const { get, set, registrarChavesIA, carregar, importar, exportar } = await import('../src/store.js');
const sb = await import('../src/supabase.js');
const iaHandler = (await import('../api/ia.js')).default;
const modelosHandler = (await import('../api/modelos.js')).default;

/* ---------------- helpers do proxy ---------------- */

function reqFake({ method = 'POST', body = null, headers = {} } = {}) {
  return { method, body, headers, socket: { remoteAddress: '203.0.113.7' } };
}
function resFake() {
  return {
    statusCode: 200, headers: {}, corpo: null, encerrado: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.corpo = o; this.encerrado = true; return this; },
    end() { this.encerrado = true; return this; },
  };
}
const CHAVE_1 = 'AIza-teste-um';
const CHAVE_2 = 'AIza-teste-dois';
const GEMINI_OK = {
  candidates: [{ content: { parts: [{ text: 'CONEXÃO OK' }] }, finishReason: 'STOP', model: 'gemini-flash-latest' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
};
const GEMINI_429 = { error: { code: 429, message: 'You exceeded your current quota (RESOURCE_EXHAUSTED).', status: 'RESOURCE_EXHAUSTED' } };

function rotaGeminiPorChave({ chave1 = 200, chave2 = 200 } = {}) {
  rotas.push({
    teste: (url) => url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent'),
    resposta: (url, opts) => {
      const chave = opts.headers?.['x-goog-api-key'];
      const status = chave === CHAVE_1 ? chave1 : chave === CHAVE_2 ? chave2 : 401;
      return respostaJSON(status, status === 200 ? GEMINI_OK : GEMINI_429);
    },
  });
}

const CFG = () => ({
  provedor: 'gemini', apiKey: CHAVE_1, apiKeys: [CHAVE_2], chaveAtiva: 0, chaveGelada: {},
  modo: 'navegador', modelo: 'gemini-flash-latest', temperatura: 0.3,
});
const MSGS = [{ role: 'user', content: 'Responda apenas: CONEXÃO OK' }];

let testes = 0;
function caso(nome, fn) {
  return Promise.resolve().then(fn).then(() => { testes++; console.log(`  ✓ ${nome}`); })
    .catch((e) => { console.error(`  ✗ ${nome}\n      ${e.message}`); falhas++; });
}
let falhas = 0;

/* ============================================================ */
console.log('\n—— 1. Contingência entre chaves gratuitas (navegador) ——');

resetFetch();
await caso('chave 1 funciona → usa a 1, sem contingência', async () => {
  rotaGeminiPorChave({ chave1: 200 });
  const r = await conversar(CFG(), MSGS, { maxTokens: 40 });
  assert(r.texto === 'CONEXÃO OK', `texto inesperado: ${r.texto}`);
  assert(r.chave === 0, `deveria usar o índice 0, veio ${r.chave}`);
  assert(r.totalChaves === 2, 'deveria informar 2 chaves');
  assert(r.contingencia === false, 'não deveria marcar contingência');
  assert(chavesIA(CFG()).length === 2, 'chavesIA deveria achar 2 chaves');
});

resetFetch();
await caso('chave 1 com 429 → cai para a chave 2 (contingência)', async () => {
  rotaGeminiPorChave({ chave1: 429, chave2: 200 });
  const r = await conversar(CFG(), MSGS, { maxTokens: 40 });
  assert(r.texto === 'CONEXÃO OK', `deveria ter respondido com a chave 2, veio erro: ${r.erro}`);
  assert(r.chave === 1, `índice esperado 1, veio ${r.chave}`);
  assert(r.contingencia === true, 'deveria marcar contingência');
  assert(r.chaves.geladas[0] > Date.now(), 'a chave 1 deveria entrar na geladeira');
  assert(chamadasFetch.length === 2, `duas chamadas esperadas, vieram ${chamadasFetch.length}`);
  assert(/x-goog-api-key/.test(JSON.stringify(chamadasFetch[1].opts.headers)), 'a chave deve ir no cabeçalho');
  assert(!chamadasFetch.some((c) => c.url.includes(CHAVE_1)), 'a chave nunca pode aparecer na URL');
});

resetFetch();
await caso('geladeira: a próxima chamada começa pela chave que funcionou', async () => {
  const cfg = CFG();
  registrarChavesIA({ indice: 1, geladas: { 0: Date.now() + 60_000 } });
  set((s) => { s.ai.apiKey = CHAVE_1; s.ai.apiKeys = [CHAVE_2]; });
  registrarChavesIA({ indice: 1, geladas: { 0: Date.now() + 60_000 } });
  const ordem = ordemDeChaves(get().ai);
  assert(ordem[0].indice === 1, `deveria começar pela chave 2, veio ${ordem[0].indice}`);
  assert(ordem[1].gelada === true, 'a chave 1 deveria constar como gelada');
  assert(get().ai.chaveAtiva === 1, 'chaveAtiva deveria ser 1');
  assert(rotuloChave(1, 2) === 'chave 2 de 2', `rótulo inesperado: ${rotuloChave(1, 2)}`);
  assert(cfg.apiKey === CHAVE_1, 'sanidade do cfg local');
});

resetFetch();
await caso('todas as chaves no limite → dica clara e fallback offline', async () => {
  rotaGeminiPorChave({ chave1: 429, chave2: 429 });
  set((s) => { s.ai.chaveAtiva = 0; s.ai.chaveGelada = {}; });
  const r = await conversar(get().ai, MSGS, { maxTokens: 40 });
  assert(r.texto === null, 'não deveria haver texto');
  assert(r.offline === true, 'deveria marcar offline');
  assert(r.limite === true, 'deveria marcar limite');
  assert(/429|limite/i.test(String(r.erro)), `erro inesperado: ${r.erro}`);
  assert(/chaves gratuitas chegaram ao limite|próxima chave|rate-limit/i.test(String(r.dica)), `dica fraca: ${r.dica}`);
  assert(r.chaves.tentadas.length === 2, 'deveria registrar as 2 tentativas');
});

resetFetch();
await caso('chave inválida (401) também troca de chave', async () => {
  rotas.push({
    teste: (url) => url.includes(':generateContent'),
    resposta: (url, opts) => respostaJSON(opts.headers?.['x-goog-api-key'] === CHAVE_1 ? 401 : 200,
      opts.headers?.['x-goog-api-key'] === CHAVE_1 ? { error: { code: 401, message: 'API_KEY_INVALID' } } : GEMINI_OK),
  });
  set((s) => { s.ai.chaveAtiva = 0; s.ai.chaveGelada = {}; });
  const r = await conversar(get().ai, MSGS, { maxTokens: 40 });
  assert(r.texto === 'CONEXÃO OK', `deveria ter caído para a chave 2: ${r.erro}`);
  assert(r.chave === 1, 'índice esperado 1');
});

resetFetch();
await caso('erro NÃO trocável (resposta bloqueada) não queima as outras chaves', async () => {
  rotas.push({
    teste: (url) => url.includes(':generateContent'),
    resposta: () => respostaJSON(200, { promptFeedback: { blockReason: 'SAFETY' } }),
  });
  const r = await conversar(CFG(), MSGS, { maxTokens: 40 });
  assert(r.texto === null, 'não deveria haver texto');
  assert(/bloqueada/i.test(String(r.erro)), `erro inesperado: ${r.erro}`);
  assert(chamadasFetch.length === 1, `uma única chamada esperada, vieram ${chamadasFetch.length}`);
});

/* ============================================================ */
console.log('\n—— 1b. Persistência: reload e backup não podem perder progresso ——');

await caso('carregar() mantém respostas/flashcards salvos (regressão do deep merge)', async () => {
  const salvo = {
    versao: 1,
    perfil: { nome: 'Quem recarrega' },
    questoes: { 'lp-q001': { acertos: 3, erros: 1, seguidos: 2, historico: [{ ts: 'x', acertou: true }] } },
    cards: { 'fc-dadm-001': { ease: 2.5, intervalo: 9, repeticoes: 4, proxima: '2026-11-01' } },
    simulados: [{ id: 'sim-1', nota: 7.5, acertos: 38, total: 50 }],
    plano: [{ id: 'd1', data: '2026-10-15', blocos: [{ materia: 'lp', minutos: 30, tipo: 'questoes' }] }],
    ai: { provedor: 'gemini', apiKey: CHAVE_1, apiKeys: [CHAVE_2], chaveAtiva: 1, modo: 'proxy' },
    supabase: { url: 'https://a.supabase.co', anonKey: 'anon', sincronizar: true, dispositivo: 'dev-x' },
    registro: [{ ts: 'x', tipo: 'resposta', detalhe: {} }],
  };
  memoria.set('alepa2026.state.v1', JSON.stringify(salvo));
  carregar();
  const e = get();
  assert(e.perfil.nome === 'Quem recarrega', `perfil perdido: ${e.perfil.nome}`);
  assert(e.questoes['lp-q001']?.acertos === 3, 'respostas perdidas no reload');
  assert(e.questoes['lp-q001']?.historico?.length === 1, 'histórico da questão perdido');
  assert(e.cards['fc-dadm-001']?.intervalo === 9, 'flashcard (SRS) perdido no reload');
  assert(e.simulados.length === 1 && e.simulados[0].acertos === 38, 'simulado perdido');
  assert(e.plano.length === 1 && e.plano[0].blocos.length === 1, 'plano perdido no reload');
  assert(e.ai.apiKeys[0] === CHAVE_2 && e.ai.chaveAtiva === 1, 'contingência de chaves perdida');
  assert(e.supabase.dispositivo === 'dev-x', 'configuração do Supabase perdida');
  // campos novos do ESTADO_INICIAL continuam presentes mesmo em backups antigos
  assert(typeof e.ai.proxyUrl === 'string' && e.ai.proxyUrl, 'campo novo (proxyUrl) não recebeu padrão');
  assert(e.metas.minutosSemana === 600, 'metas padrão perdidas');
});

await caso('importar() (backup em JSON) restaura tudo e preserva campos novos', async () => {
  const backup = exportar();
  set((s) => { s.questoes = {}; s.cards = {}; s.perfil.nome = 'Apagado'; });
  assert(get().perfil.nome === 'Apagado', 'sanidade: o estado deveria ter sido zerado');
  importar(backup);
  assert(get().perfil.nome === 'Quem recarrega', 'o backup não restaurou o perfil');
  assert(get().questoes['lp-q001']?.acertos === 3, 'o backup não restaurou as respostas');
  assert(get().cards['fc-dadm-001']?.intervalo === 9, 'o backup não restaurou os flashcards');
});

/* ============================================================ */
console.log('\n—— 2. Proxy serverless (api/ia.js) — chaves só no servidor ——');

process.env.GEMINI_API_KEYS = `${CHAVE_1},${CHAVE_2}`;
process.env.GEMINI_MODEL = 'gemini-flash-latest';
process.env.IA_RATE_LIMIT = '0';
process.env.ALLOWED_ORIGINS = '';

resetFetch();
await caso('GET /api/ia informa quantas chaves existem sem revelar nenhuma', async () => {
  const res = resFake();
  await iaHandler(reqFake({ method: 'GET' }), res);
  assert(res.statusCode === 200, `status ${res.statusCode}`);
  assert(res.corpo.ok === true, 'deveria estar ok');
  assert(res.corpo.chaves === 2, `2 chaves esperadas, veio ${res.corpo.chaves}`);
  assert(!JSON.stringify(res.corpo).includes(CHAVE_1), 'o valor da chave vazou na resposta');
});

resetFetch();
await caso('POST /api/ia gera texto e rotaciona em 429', async () => {
  rotaGeminiPorChave({ chave1: 429, chave2: 200 });
  const res = resFake();
  await iaHandler(reqFake({ body: { mensagens: [{ role: 'user', content: 'oi' }], system: 'Você é um tutor do concurso.', maxTokens: 40 } }), res);
  assert(res.statusCode === 200, `status ${res.statusCode}: ${JSON.stringify(res.corpo)}`);
  assert(res.corpo.texto === 'CONEXÃO OK', `texto inesperado: ${res.corpo.texto}`);
  assert(res.corpo.chave === 2 && res.corpo.chaveIndice === 1, `chave esperada 2/índice 1, veio ${res.corpo.chave}/${res.corpo.chaveIndice}`);
  assert(res.corpo.contingencia === true, 'deveria marcar contingência');
  assert(res.corpo.modelo === 'gemini-flash-latest', `modelo: ${res.corpo.modelo}`);
  assert(chamadasFetch[0].opts.headers['x-goog-api-key'] === CHAVE_1, 'deveria tentar a chave 1 primeiro');
  assert(chamadasFetch[0].opts.body.includes('systemInstruction'), 'o system prompt deveria ir em systemInstruction');
});

resetFetch();
await caso('POST /api/ia rejeita corpo inválido e mensagem vazia', async () => {
  const res1 = resFake();
  await iaHandler(reqFake({ body: 'não é json' }), res1);
  assert(res1.statusCode === 400, `status ${res1.statusCode}`);
  assert(res1.corpo.dica, 'deveria trazer dica');

  const res2 = resFake();
  await iaHandler(reqFake({ body: { mensagens: [{ role: 'user', content: '   ' }] } }), res2);
  assert(res2.statusCode === 400, `status ${res2.statusCode}`);
  assert(/mensagem válida/i.test(res2.corpo.erro), `erro: ${res2.corpo.erro}`);
});

resetFetch();
await caso('sem chaves no servidor → 500 com instrução de configuração', async () => {
  const salvo = process.env.GEMINI_API_KEYS;
  delete process.env.GEMINI_API_KEYS;
  const res = resFake();
  await iaHandler(reqFake({ body: { mensagens: [{ role: 'user', content: 'oi' }] } }), res);
  assert(res.statusCode === 500, `status ${res.statusCode}`);
  assert(/GEMINI_API_KEYS/.test(res.corpo.dica), `dica: ${res.corpo.dica}`);
  process.env.GEMINI_API_KEYS = salvo;
});

resetFetch();
await caso('limite por IP protege a cota (IA_RATE_LIMIT)', async () => {
  process.env.IA_RATE_LIMIT = '2';
  rotaGeminiPorChave({ chave1: 200 });
  let bloqueado = null;
  for (let i = 0; i < 3; i++) {
    const res = resFake();
    await iaHandler(reqFake({ body: { mensagens: [{ role: 'user', content: 'oi' }] } }), res);
    if (res.statusCode === 429) { bloqueado = res.corpo; break; }
  }
  assert(bloqueado, 'a terceira requisição deveria ter sido bloqueada');
  assert(/IA_RATE_LIMIT/.test(bloqueado.dica), `dica: ${bloqueado.dica}`);
  process.env.IA_RATE_LIMIT = '0';
});

resetFetch();
await caso('429 em todas as chaves do servidor → dica sobre a cota gratuita', async () => {
  rotaGeminiPorChave({ chave1: 429, chave2: 429 });
  const res = resFake();
  await iaHandler(reqFake({ body: { mensagens: [{ role: 'user', content: 'oi' }] } }), res);
  assert(res.statusCode === 429, `status ${res.statusCode}`);
  assert(/meia-noite|GEMINI_API_KEYS|Flash-Lite/i.test(res.corpo.dica), `dica: ${res.corpo.dica}`);
  assert(res.corpo.tentadas.length === 2, 'deveria listar as tentativas');
});

resetFetch();
await caso('CORS: origem só é liberada quando ALLOWED_ORIGINS permite', async () => {
  process.env.ALLOWED_ORIGINS = 'https://*.vercel.app';
  rotaGeminiPorChave({ chave1: 200 });
  const resOk = resFake();
  await iaHandler(reqFake({ headers: { origin: 'https://alepaapp.vercel.app' }, body: { mensagens: [{ role: 'user', content: 'oi' }] } }), resOk);
  assert(resOk.headers['access-control-allow-origin'] === 'https://alepaapp.vercel.app', 'deveria liberar a origem vercel.app');

  const resBloq = resFake();
  await iaHandler(reqFake({ headers: { origin: 'https://malvado.example' }, body: { mensagens: [{ role: 'user', content: 'oi' }] } }), resBloq);
  assert(!resBloq.headers['access-control-allow-origin'], 'não deveria liberar origem fora da lista');
  process.env.ALLOWED_ORIGINS = '';
});

resetFetch();
await caso('modo proxy no app: /api/ia responde e vira resultado do conversar()', async () => {
  rotas.push({
    teste: (url) => url.endsWith('/api/ia'),
    resposta: async (url, opts) => {
      const corpo = JSON.parse(opts.body);
      assert(Array.isArray(corpo.mensagens), 'mensagens deveriam ir no corpo');
      assert(/tutor especializado/i.test(corpo.system), 'o SYSTEM_PROMPT deveria viajar no corpo');
      const res = resFake();
      await iaHandler(reqFake({ body: corpo }), res);
      return respostaJSON(res.statusCode, res.corpo);
    },
  });
  rotaGeminiPorChave({ chave1: 429, chave2: 200 });
  const cfg = { provedor: 'gemini', modo: 'proxy', proxyUrl: '/api/ia', modelo: '', apiKey: '', apiKeys: [] };
  const r = await conversar(cfg, MSGS, { maxTokens: 40 });
  assert(r.texto === 'CONEXÃO OK', `texto: ${r.texto} · erro: ${r.erro}`);
  assert(r.totalChaves === 2 && r.chave === 2, 'deveria repassar a chave usada pelo servidor');
  assert(r.chaves.indice === 1, `índice para o store: ${r.chaves.indice}`);
});

/* ============================================================ */
console.log('\n—— 3. Descoberta de modelos (api/modelos.js e listarModelos) ——');

resetFetch();
await caso('lista modelos com Flash-Lite primeiro', async () => {
  rotas.push({
    teste: (url) => url.includes('/models?'),
    resposta: () => respostaJSON(200, {
      models: [
        { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini Flash-Lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      ],
    }),
  });
  const res = resFake();
  await modelosHandler(reqFake({ method: 'GET' }), res);
  assert(res.statusCode === 200, `status ${res.statusCode}`);
  assert(res.corpo.modelos[0].id === 'gemini-3.5-flash-lite', `ordem: ${res.corpo.modelos.map((m) => m.id).join(', ')}`);
  assert(res.corpo.modelos.every((m) => !/embedding/.test(m.id)), 'modelos que não geram texto deveriam sair');
  assert(res.corpo.totalChaves === 2, 'deveria informar quantas chaves o servidor tem');

  // mesmo caminho pelo app no modo navegador
  set((s) => { s.ai.modo = 'navegador'; s.ai.apiKey = CHAVE_1; s.ai.apiKeys = [CHAVE_2]; s.ai.chaveAtiva = 0; s.ai.chaveGelada = {}; });
  const lista = await listarModelos(get().ai);
  assert(lista[0].id === 'gemini-3.5-flash-lite', `ordem no app: ${lista[0].id}`);
});

/* ============================================================ */
console.log('\n—— 4. Supabase: backup do progresso sem vazar chaves ——');

resetFetch();
await caso('enviarProgresso: URL, cabeçalhos e estado SEM chaves de IA', async () => {
  set((s) => {
    s.ai.apiKey = CHAVE_1; s.ai.apiKeys = [CHAVE_2];
    s.supabase.url = 'https://exemplo.supabase.co';
    s.supabase.anonKey = 'anon-publica-123';
    s.supabase.dispositivo = 'dev-teste-1';
    s.questoes['lp-q001'] = { acertos: 2, erros: 0, seguidos: 2 };
  });
  rotas.push({
    teste: (url) => url.includes('/rest/v1/progresso'),
    resposta: () => respostaJSON(201, null),
  });
  const r = await sb.enviarProgresso();
  assert(r.ok, 'deveria devolver ok');
  const chamada = chamadasFetch[0];
  assert(chamada.url === 'https://exemplo.supabase.co/rest/v1/progresso?on_conflict=id', `url: ${chamada.url}`);
  assert(chamada.opts.method === 'POST', 'deveria ser POST (upsert)');
  assert(chamada.opts.headers.apikey === 'anon-publica-123', 'cabeçalho apikey ausente');
  assert(/merge-duplicates/.test(chamada.opts.headers.prefer), 'prefer deveria pedir upsert');
  const corpo = JSON.parse(chamada.opts.body);
  assert(corpo.id === 'dev-teste-1', `id: ${corpo.id}`);
  assert(corpo.estado.ai.apiKey === '' && corpo.estado.ai.apiKeys.length === 0, 'as chaves de IA NÃO podem ser enviadas');
  assert(!('supabase' in corpo.estado), 'as credenciais do Supabase não devem voltar para a nuvem');
  assert(corpo.estado.questoes['lp-q001'].acertos === 2, 'o progresso deveria ir no corpo');
  assert(!chamada.opts.body.includes(CHAVE_1), 'a chave vazou no corpo da requisição');
  assert(get().supabase.ultimaSync, 'deveria registrar o momento do último backup');
});

resetFetch();
await caso('restaurarProgresso: substitui o estado e PRESERVA as chaves locais', async () => {
  const remoto = {
    id: 'dev-teste-1',
    estado: { versao: 1, perfil: { nome: 'Vindo da nuvem' }, questoes: { 'leg-q001': { acertos: 5, erros: 1, seguidos: 0 } }, ai: { provedor: 'openai', apiKey: 'sk-remota' }, simulados: [], cards: {}, plano: [] },
    atualizado_em: new Date().toISOString(),
  };
  rotas.push({
    teste: (url) => url.includes('/rest/v1/progresso?id=eq.'),
    resposta: () => respostaJSON(200, [remoto]),
  });
  const r = await sb.restaurarProgresso('dev-teste-1');
  assert(r, 'deveria achar a linha remota');
  assert(get().perfil.nome === 'Vindo da nuvem', 'o perfil deveria ter sido restaurado');
  assert(get().questoes['leg-q001'].acertos === 5, 'as respostas deveriam ter sido restauradas');
  assert(get().ai.apiKey === CHAVE_1, `a chave local deveria ser preservada, veio ${get().ai.apiKey}`);
  assert(get().ai.apiKeys.includes(CHAVE_2), 'as chaves de contingência locais deveriam ser preservadas');
  assert(get().ai.provedor === 'gemini', `o provedor local deveria ser preservado, veio ${get().ai.provedor}`);
  assert(get().supabase.url === 'https://exemplo.supabase.co', 'a configuração do Supabase deveria ser preservada');
});

resetFetch();
await caso('importarChavesIA: traz principal + contingência da RPC', async () => {
  rotas.push({
    teste: (url) => url.includes('/rest/v1/rpc/obter_chaves_ia'),
    resposta: () => respostaJSON(200, [
      { ordem: 2, chave: 'AIza-nuvem-2', rotulo: 'contingência' },
      { ordem: 1, chave: 'AIza-nuvem-1', rotulo: 'principal' },
    ]),
  });
  const r = await sb.importarChavesIA();
  assert(r.total === 2, `total: ${r.total}`);
  assert(get().ai.apiKey === 'AIza-nuvem-1', `principal: ${get().ai.apiKey}`);
  assert(get().ai.apiKeys[0] === 'AIza-nuvem-2', `contingência: ${get().ai.apiKeys[0]}`);
});

resetFetch();
await caso('supabase não configurado → erro claro, sem exceção crua', async () => {
  set((s) => { s.supabase.url = ''; s.supabase.anonKey = ''; });
  let erro = null;
  try { await sb.enviarProgresso(); } catch (e) { erro = e; }
  assert(erro && /não configurado/i.test(erro.message), `erro: ${erro?.message}`);
  assert(sb.supabaseConfigurado() === false, 'deveria constar como não configurado');
});

/* ---------------- resultado ---------------- */
console.log('\n———————————————');
if (falhas) {
  console.error(`❌ ${falhas} teste(s) de integração falharam (${testes} passaram).`);
  process.exit(1);
}
console.log(`✅ Testes de integração passaram: ${testes} casos (contingência de chaves, proxy, modelos, Supabase).`);
process.exit(0);
