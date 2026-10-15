#!/usr/bin/env node
/* generate-content.mjs — pipeline de expansão do banco de conteúdo com IA.
 *
 * Lê data/curriculo.json (319 tópicos do Anexo II), mede a COBERTURA atual
 * (questões, resumos e flashcards por tópico), escolhe as lacunas de maior
 * retorno para a prova e gera conteúdo novo no MESMO esquema dos arquivos
 * existentes — validando cada item antes de gravar.
 *
 * Uso:
 *   node tools/generate-content.mjs --lacunas                  # só o relatório de cobertura
 *   node tools/generate-content.mjs --fila                     # prompts prontos p/ colar (sem API)
 *   node tools/generate-content.mjs --tipo=questoes --n=2 --limite=10
 *   node tools/generate-content.mjs --materia=dir-adm,proc-leg --tipo=todos
 *   node tools/generate-content.mjs --topico=dadm-05 --tipo=flashcards --n=6
 *   node tools/generate-content.mjs --tipo=questoes --dry-run
 *
 * Opções:
 *   --tipo=questoes|resumos|flashcards|todos   (padrão: todos)
 *   --materia=id[,id]      restringe matérias (ids de data/curriculo.json)
 *   --topico=id            restringe a um único tópico
 *   --n=N                  itens por tópico (padrão: 2 questões, 1 resumo, 3 flashcards)
 *   --limite=N             máximo de chamadas de IA nesta execução (padrão: 8)
 *   --prioridade=S,A,B     filtra tópicos pela prioridade do edital (padrão: S,A)
 *   --lacunas              imprime a cobertura e sai
 *   --fila[=arquivo.md]    não chama IA: escreve os prompts prontos (padrão docs/fila-de-conteudo.md)
 *   --dry-run              gera e valida, mas não grava
 *   --provider=openai|anthropic   (padrão openai; qualquer endpoint compatível serve)
 *   --base-url=URL         (padrão env OPENAI_BASE_URL ou https://api.openai.com/v1)
 *   --modelo=NOME          (padrão env OPENAI_MODEL ou gpt-4o-mini)
 *   --api-key=CHAVE        (padrão env OPENAI_API_KEY / ANTHROPIC_API_KEY)
 *   --sem-validar          não roda tools/validate-data.mjs ao final
 *
 * Nenhuma chave é armazenada em arquivo: use variáveis de ambiente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const HOJE = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ args */
function args(argv) {
  const a = { _: [] };
  for (const t of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(t);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
    else a._.push(t);
  }
  return a;
}
const ARG = args(process.argv.slice(2));
const TIPO = String(ARG.tipo || 'todos');
const MATERIAS = ARG.materia ? String(ARG.materia).split(',').map((s) => s.trim()).filter(Boolean) : null;
const TOPICO = ARG.topico ? String(ARG.topico) : null;
const PRIORIDADES = String(ARG.prioridade || 'S,A').split(',').map((s) => s.trim().toUpperCase());
const LIMITE = Number(ARG.limite || 8);
const DRY = Boolean(ARG['dry-run']);
const PROVIDER = String(ARG.provider || 'openai').toLowerCase();
const BASE_URL = String(ARG['base-url'] || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODELO = String(ARG.modelo || process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || 'gpt-4o-mini');
const API_KEY = String(ARG['api-key'] || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '');

function nPorTipo(tipo) {
  if (ARG.n) return Number(ARG.n);
  return tipo === 'questoes' ? 2 : tipo === 'flashcards' ? 3 : 1;
}
const TIPOS = TIPO === 'todos' ? ['questoes', 'resumos', 'flashcards'] : [TIPO];
for (const t of TIPOS) if (!['questoes', 'resumos', 'flashcards'].includes(t)) {
  console.error(`--tipo inválido: ${t} (use questoes|resumos|flashcards|todos)`);
  process.exit(2);
}

/* -------------------------------------------------------------- leitura */
const ler = (p) => JSON.parse(fs.readFileSync(path.join(DADOS, p), 'utf8'));
const curriculo = ler('curriculo.json');
const concurso = ler('concurso.json');
const resumosArq = ler('resumos.json');
const cardsArq = ler('flashcards.json');
const indexArq = ler('questoes/index.json');

const questoesPorArquivo = new Map();
for (const a of indexArq.arquivos) {
  const j = ler(path.join('questoes', a.arquivo));
  questoesPorArquivo.set(a.arquivo, j);
}
const todasQuestoes = [];
for (const [arq, j] of questoesPorArquivo) {
  for (const q of j.questoes) todasQuestoes.push({ ...q, _arquivo: arq, _materiaArquivo: j.materia });
}
const materiaDe = (q) => q.materia || q._materiaArquivo;

const topicoPorId = new Map();
for (const m of curriculo.materias) {
  for (const t of m.topicos) topicoPorId.set(t.id, { ...t, materia: m.id, materiaNome: m.nome, sigla: m.sigla, bloco: m.bloco });
}
const materiaPorId = new Map(curriculo.materias.map((m) => [m.id, m]));

/* pontos em jogo por matéria (cada questão vale 0,2) */
const pontosMateria = new Map();
const estimativaCE = concurso.estimativaConhecimentosEspecificos?.porMateria || {};
for (const b of concurso.estruturaProva || []) {
  if (b.id === 'ce') { for (const [mat, qtd] of Object.entries(estimativaCE)) pontosMateria.set(mat, (pontosMateria.get(mat) || 0) + qtd * 0.2); }
  else pontosMateria.set(b.id, (pontosMateria.get(b.id) || 0) + (b.pontos ?? b.questoes * 0.2));
}

/* ------------------------------------------------------------- cobertura */
function cobertura() {
  const porTopico = new Map();
  for (const [id, t] of topicoPorId) porTopico.set(id, { ...t, questoes: 0, resumos: 0, cards: 0 });
  for (const q of todasQuestoes) { const o = porTopico.get(q.topico); if (o) o.questoes++; }
  for (const r of resumosArq.resumos) { const o = porTopico.get(r.topico); if (o) o.resumos++; }
  for (const c of cardsArq.flashcards) { const o = porTopico.get(c.topico); if (o) o.cards++; }
  return [...porTopico.values()];
}

function lacunas() {
  return cobertura()
    .filter((t) => !MATERIAS || MATERIAS.includes(t.materia))
    .filter((t) => !TOPICO || t.id === TOPICO)
    .filter((t) => PRIORIDADES.includes(String(t.prioridade || '').toUpperCase()) || TOPICO === t.id)
    .map((t) => {
      const pontos = pontosMateria.get(t.materia) || 0;
      const pesoPrioridade = { S: 3, A: 2, B: 1 }[String(t.prioridade || '').toUpperCase()] || 1;
      const falta = (t.questoes < 2 ? 2 - t.questoes : 0) + (t.resumos < 1 ? 1 : 0) + (t.cards < 3 ? 3 - t.cards : 0);
      return { ...t, pontos, falta, score: pesoPrioridade * (1 + pontos) * (1 + falta) };
    })
    .filter((t) => t.falta > 0)
    .sort((a, b) => b.score - a.score);
}

function relatorio() {
  const c = cobertura();
  const porMat = new Map();
  for (const t of c) {
    const o = porMat.get(t.materia) || { materia: t.materia, nome: t.materiaNome, topicos: 0, q: 0, r: 0, f: 0, semQ: 0, pontos: pontosMateria.get(t.materia) || 0 };
    o.topicos++; o.q += t.questoes; o.r += t.resumos; o.f += t.cards;
    if (!t.questoes) o.semQ++;
    porMat.set(t.materia, o);
  }
  const linhas = [...porMat.values()].sort((a, b) => b.pontos - a.pontos);
  console.log('\nCobertura do banco por matéria');
  console.log('─'.repeat(96));
  console.log('matéria'.padEnd(30) + 'pts'.padStart(5) + 'tópicos'.padStart(9) + 'questões'.padStart(10) + 'resumos'.padStart(9) + 'cards'.padStart(7) + 'sem questão'.padStart(13));
  for (const l of linhas) {
    console.log(l.nome.slice(0, 29).padEnd(30) + l.pontos.toFixed(1).padStart(5) + String(l.topicos).padStart(9) + String(l.q).padStart(10) + String(l.r).padStart(9) + String(l.f).padStart(7) + String(l.semQ).padStart(13));
  }
  const tot = linhas.reduce((a, l) => ({ t: a.t + l.topicos, q: a.q + l.q, r: a.r + l.r, f: a.f + l.f }), { t: 0, q: 0, r: 0, f: 0 });
  console.log('─'.repeat(96));
  console.log(`TOTAL: ${tot.t} tópicos · ${tot.q} questões · ${tot.r} resumos · ${tot.f} flashcards`);
  const l = lacunas();
  console.log(`Lacunas priorizadas (prioridade ${PRIORIDADES.join('/')}): ${l.length} tópico(s) · ${l.reduce((s, x) => s + x.falta, 0)} item(ns) a produzir\n`);
  return l;
}

/* ------------------------------------------------------------ especificações */
const REGRA_COMUM = `
REGRAS OBRIGATÓRIAS (o conteúdo é validado por script; qualquer desvio é descartado):
1. Responda APENAS com JSON válido, sem markdown, sem comentários, sem texto antes ou depois.
2. Todo o texto em português do Brasil, com acentuação correta.
3. NUNCA invente número de artigo, lei, resolução ou data que você não conheça com certeza.
   Se precisar citar dispositivo, cite apenas os que constam no material de apoio abaixo.
   Na dúvida, descreva o instituto sem o número do artigo.
4. Proibido conteúdo ambíguo: cada item tem exatamente UMA resposta correta/verdadeira.
5. Não repita literalmente itens já existentes (lista abaixo).
6. Contexto do concurso: ALEPA (Assembleia Legislativa do Estado do Pará), Concurso Público
   nº 002/2026, Cargo 02 — Assessoramento Legislativo / Assessor Técnico PL.AL.102,
   banca Fundação CETAP, prova objetiva em 13/12/2026, 50 questões de 5 alternativas (A a E),
   cada questão valendo 0,2 ponto. Sempre que fizer sentido, use situações do cotidiano
   legislativo paraense (comissões, Mesa Diretora, sessões, pareceres, decretos legislativos).`;

const EXEMPLO_QUESTAO = JSON.stringify({
  id: 'EXEMPLO',
  topico: 'dadm-01',
  dificuldade: 'medio',
  contexto: 'Durante a instrução de um processo administrativo na ALEPA, um servidor analisa pedido de licença.',
  enunciado: 'À luz da Lei nº 9.784/1999, assinale a alternativa correta.',
  alternativas: [
    { letra: 'A', texto: 'texto da alternativa A' }, { letra: 'B', texto: 'texto da alternativa B' },
    { letra: 'C', texto: 'texto da alternativa C' }, { letra: 'D', texto: 'texto da alternativa D' },
    { letra: 'E', texto: 'texto da alternativa E' },
  ],
  gabarito: 'C',
  comentario: 'Explicação didática em 2 ou 3 parágrafos: por que a correta está correta e, uma a uma, por que as demais estão erradas. Feche com a regra prática que resolve a família de questões.',
  mnemonico: 'Frase curta e memorável que resume a regra.',
  leiSeca: ['Art. 2º, parágrafo único, II — vedação de promoção pessoal de agentes públicos'],
  tags: ['lei 9.784', 'processo administrativo'],
  pegadinhas: ['A banca troca "pode" por "deve" para inverter o sentido da norma'],
  estrategia: 'Como eliminar distratores nesta família de questões.',
  estiloBanca: 'Como a Fundação CETAP costuma cobrar este tópico.',
  origem: 'inédita — elaborada para este banco',
});

function specQuestao(t, jaExistentes) {
  return `Você é professor de cursinho preparatório para concursos, especialista na banca Fundação CETAP
e em Direito/Administração aplicados ao Poder Legislativo estadual.

TAREFA: criar ${nPorTipo('questoes')} questão(ões) INÉDITA(S) e objetivas sobre UM único tópico do edital.

TÓPICO: ${t.id} — ${t.texto || t.nome}
MATÉRIA: ${t.materiaNome} (${t.sigla}) · bloco ${t.bloco} · vale ${t.pontos} ponto(s) na prova
PRIORIDADE NO EDITAL: ${t.prioridade} · DIFICULDADE SUGERIDA: ${t.dificuldade}
${REGRA_COMUM}

FORMATO DE CADA QUESTÃO (objeto JSON dentro de {"questoes": [...]}):
${EXEMPLO_QUESTAO}

CAMPOS E RESTRIÇÕES:
- "topico": exatamente "${t.id}".
- "dificuldade": "facil" | "medio" | "dificil".
- "contexto": 1 frase situando o caso (opcional, mas recomendado em questões jurídicas).
- "enunciado": comando claro, terminando em ponto. Use "assinale a alternativa correta/incorreta"
  e, se usar a forma INCORRETA, deixe a palavra em CAIXA ALTA no enunciado.
- "alternativas": SEMPRE 5, com letras "A","B","C","D","E" nesta ordem, textos de tamanho parecido
  (evite que a maior seja a correta), sem "todas as anteriores" nem "nenhuma das anteriores".
- "gabarito": UMA letra, a única correta.
- "comentario": mínimo 400 caracteres; explique o acerto, refute cada distrator nomeando a letra
  e termine com a regra prática. Nunca admita ambiguidade.
- "mnemonico": até 120 caracteres.
- "leiSeca": array (pode ser vazio) com o dispositivo/teor citado, no formato "Art. X — teor".
- "tags": 2 a 5 strings curtas.
- "pegadinhas": 1 a 3 armadilhas típicas da banca neste tópico.
- "estrategia" e "estiloBanca": 1 a 2 frases cada.
- "origem": "inédita — elaborada para este banco".
- NÃO inclua o campo "id": o script atribui.

QUESTÕES JÁ EXISTENTES NESTE TÓPICO (não repita enunciados nem a mesma pegada):
${jaExistentes.length ? jaExistentes.map((q, i) => `${i + 1}. [${q.dificuldade}] ${q.enunciado}\n   gabarito ${q.gabarito}: ${q.alternativas.find((a) => a.letra === q.gabarito)?.texto || ''}`).join('\n') : '(nenhuma — este tópico ainda não tem questões)'}`;
}

function specResumo(t, existentes) {
  return `Você é professor e autor de material didático para concursos públicos brasileiros.

TAREFA: escrever 1 RESUMO de estudo completo e autossuficiente sobre UM tópico do edital.

TÓPICO: ${t.id} — ${t.texto || t.nome}
MATÉRIA: ${t.materiaNome} (${t.sigla}) · bloco ${t.bloco} · vale ${t.pontos} ponto(s) na prova
PRIORIDADE NO EDITAL: ${t.prioridade}
${REGRA_COMUM}

FORMATO (JSON {"resumos": [ {...} ]}):
{
  "topico": "${t.id}",
  "titulo": "título curto e específico (não repita o nome do tópico)",
  "tempoLeituraMin": 6,
  "texto": "mínimo 1.800 caracteres. Use parágrafos separados por \\n\\n, TÓPICOS com •, CAIXA ALTA nos termos-chave e quadros comparativos em texto simples. Cubra: conceito, fundamento, requisitos/espécies, prazos e números que costumam cair, jurisprudência/posição dominante se houver, erros frequentes e aplicação ao contexto da ALEPA.",
  "pontosChave": ["5 a 9 frases curtas, cada uma um fato testável em prova"],
  "mnemonicos": ["1 a 3 mnemônicos com a explicação entre parênteses"],
  "caiNaProva": ["3 a 5 afirmações sobre como a banca cobra este tópico"],
  "leiSeca": ["dispositivos citados, no formato 'Art. X — teor' (pode ser vazio)"],
  "origem": "inédito — elaborado para este banco"
}
- NÃO inclua "id", "materia": o script atribui.
- RESUMOS JÁ EXISTENTES NESTE TÓPICO (não repita): ${existentes.length ? existentes.map((r) => `"${r.titulo}"`).join(', ') : 'nenhum'}`;
}

function specCards(t, existentes) {
  return `Você é especialista em memorização e repetição espaçada (Anki/SuperMemo) para concursos.

TAREFA: criar ${nPorTipo('flashcards')} FLASHCARDS atômicos sobre UM tópico do edital.

TÓPICO: ${t.id} — ${t.texto || t.nome}
MATÉRIA: ${t.materiaNome} (${t.sigla}) · vale ${t.pontos} ponto(s) na prova
${REGRA_COMUM}

FORMATO (JSON {"flashcards": [ {...} ]}):
{ "frente": "pergunta curta e inequívoca", "verso": "resposta direta + 1 frase de contexto", "tags": ["2 a 4 tags"], "dificuldade": "facil|medio|dificil" }

REGRAS DE QUALIDADE:
- Um fato por cartão (atomicidade). Nada de listas com 8 itens.
- Prefira cloze natural: "Qual o prazo de ___?" / "Quem compete ___?".
- Frente com até 180 caracteres; verso com até 400.
- Cubra: conceito, competência, prazo/número, exceção, mnemônico.
- NÃO inclua "id", "materia", "topico": o script atribui (topico = ${t.id}).
- CARTÕES JÁ EXISTENTES NESTE TÓPICO (não repita a pergunta): ${existentes.length ? existentes.map((c) => `"${c.frente}"`).join(' | ') : 'nenhum'}`;
}

/* ------------------------------------------------------------------ IA */
async function chamarIA(promptUsuario, system) {
  if (!API_KEY) throw new Error('sem chave de API (defina OPENAI_API_KEY ou use --api-key)');
  if (PROVIDER === 'anthropic') {
    const r = await fetch(`${BASE_URL.includes('anthropic') ? BASE_URL : 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 4000, system, messages: [{ role: 'user', content: promptUsuario }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return (j.content || []).map((c) => c.text || '').join('\n');
  }
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODELO, temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: promptUsuario }],
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

function extrairJSON(bruto) {
  const s = String(bruto).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* segue */ }
  const i = s.search(/[[{]/);
  const ultimo = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (i >= 0 && ultimo > i) {
    const trecho = s.slice(i, ultimo + 1);
    try { return JSON.parse(trecho); } catch { /* segue */ }
  }
  throw new Error('resposta da IA não contém JSON parseável');
}

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------- validação */
const DIFICULDADES = ['facil', 'medio', 'dificil'];
function validarQuestao(q, t, vistos) {
  const e = [];
  if (typeof q.enunciado !== 'string' || q.enunciado.trim().length < 25) e.push('enunciado curto/ausente');
  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) e.push('precisa de 5 alternativas');
  else {
    const letras = q.alternativas.map((a) => a.letra);
    if (letras.join('') !== 'ABCDE') e.push(`letras fora de ordem: ${letras.join('')}`);
    if (q.alternativas.some((a) => !a.texto || String(a.texto).trim().length < 3)) e.push('alternativa sem texto');
  }
  if (!['A', 'B', 'C', 'D', 'E'].includes(q.gabarito)) e.push(`gabarito inválido: ${q.gabarito}`);
  if (typeof q.comentario !== 'string' || q.comentario.length < 400) e.push('comentário < 400 caracteres');
  if (!DIFICULDADES.includes(q.dificuldade)) e.push(`dificuldade inválida: ${q.dificuldade}`);
  const chave = normalizar(q.enunciado).slice(0, 90);
  if (vistos.has(chave)) e.push('duplicada (enunciado já existe no banco)');
  if (/todas as (alternativas )?(anteriores|acima)|nenhuma das anteriores/i.test(JSON.stringify(q.alternativas))) e.push('usa "todas/nenhuma das anteriores"');
  if (e.length) return e;
  vistos.add(chave);
  return null;
}
function validarResumo(r, vistos) {
  const e = [];
  if (!r.titulo || String(r.titulo).length < 8) e.push('título curto');
  if (!r.texto || String(r.texto).length < 1800) e.push(`texto com ${(r.texto || '').length} caracteres (mín. 1800)`);
  if (!Array.isArray(r.pontosChave) || r.pontosChave.length < 5) e.push('pontosChave < 5');
  if (!Array.isArray(r.caiNaProva) || r.caiNaProva.length < 3) e.push('caiNaProva < 3');
  if (typeof r.tempoLeituraMin !== 'number') r.tempoLeituraMin = Math.max(3, Math.round(String(r.texto || '').length / 1400));
  const chave = normalizar(r.titulo).slice(0, 60);
  if (vistos.has(chave)) e.push('título duplicado');
  if (e.length) return e;
  vistos.add(chave);
  return null;
}
function validarCard(c, vistos) {
  const e = [];
  if (!c.frente || String(c.frente).length < 12) e.push('frente curta');
  if (!c.verso || String(c.verso).length < 12) e.push('verso curto');
  if (!Array.isArray(c.tags) || !c.tags.length) e.push('sem tags');
  if (!DIFICULDADES.includes(c.dificuldade)) c.dificuldade = 'medio';
  const chave = normalizar(c.frente).slice(0, 70);
  if (vistos.has(chave)) e.push('frente duplicada');
  if (e.length) return e;
  vistos.add(chave);
  return null;
}

/* ------------------------------------------------------------ gravação */
function arquivoDaMateria(materia) {
  const direto = indexArq.arquivos.find((a) => a.materia === materia && a.arquivo !== 'complementares.json');
  if (direto) return direto.arquivo;
  return 'complementares.json';
}
function proximoIdQuestao(materia, arq) {
  // o prefixo do id é a SIGLA da matéria em minúsculas: lp-q001, dadm-q008, dpcon-q003…
  const prefixo = String(materiaPorId.get(materia)?.sigla || materia).toLowerCase().replace(/[^a-z]/g, '');
  void arq;
  const ids = new Set(todasQuestoes.map((q) => q.id));
  let n = todasQuestoes.filter((q) => q.id.startsWith(`${prefixo}-q`)).length + 1;
  while (ids.has(`${prefixo}-q${String(n).padStart(3, '0')}`)) n++;
  return `${prefixo}-q${String(n).padStart(3, '0')}`;
}
function proximoIdResumo(materia) {
  const sigla = (materiaPorId.get(materia)?.sigla || materia).toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
  let n = resumosArq.resumos.filter((r) => r.materia === materia).length + 1;
  const ids = new Set(resumosArq.resumos.map((r) => r.id));
  while (ids.has(`res-${sigla}-${String(n).padStart(2, '0')}`)) n++;
  return `res-${sigla}-${String(n).padStart(2, '0')}`;
}
function proximoIdCard() {
  let n = cardsArq.flashcards.length + 1;
  const ids = new Set(cardsArq.flashcards.map((c) => c.id));
  while (ids.has(`fc-${String(n).padStart(3, '0')}`)) n++;
  return `fc-${String(n).padStart(3, '0')}`;
}
function escrever(p, obj) {
  if (DRY) return;
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}
function atualizarIndex() {
  const porMateria = {};
  for (const q of todasQuestoes) { const m = materiaDe(q); porMateria[m] = (porMateria[m] || 0) + 1; }
  indexArq.totais = { questoes: todasQuestoes.length, porMateria: Object.fromEntries(Object.entries(porMateria).sort((a, b) => b[1] - a[1])) };
  indexArq.atualizadoEm = HOJE;
}

/* ------------------------------------------------------------------ fila */
function tabelaLacunas(lista, n) {
  const cab = ['topico', 'matéria', 'tópico do edital', 'prio', 'pts', 'q', 'res', 'fc'];
  const larg = [10, 26, 52, 5, 5, 3, 4, 3];
  const linha = (vals) => vals.map((v, i) => String(v).slice(0, larg[i]).padEnd(larg[i])).join(' ').trimEnd();
  const out = [`| ${cab.join(' | ')} |`, `|${larg.map(() => '---').join('|')}|`];
  for (const t of lista.slice(0, n)) out.push(`| \`${t.id}\` | ${t.materiaNome} | ${t.texto || t.nome} | ${t.prioridade} | ${t.pontos.toFixed(1)} | ${t.questoes} | ${t.resumos} | ${t.cards} |`);
  return out.join('\n');
}

/**
 * --fila            → docs/fila-de-conteudo.md  (fila priorizada + modelos de prompt)
 * --fila --completo → docs/prompts/*.md         (promotes já expandidos, prontos para colar)
 */
function escreverFila(lista, destino) {
  const alvo = destino === true ? path.join(RAIZ, 'docs', 'fila-de-conteudo.md') : path.resolve(RAIZ, String(destino));
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  const TOP = Number(ARG.top || 30);

  fs.writeFileSync(alvo, `# Fila de produção de conteúdo

Gerado em ${HOJE} por \`node tools/generate-content.mjs --fila\`.

Este documento é a **fila de produção** do banco: os tópicos do Anexo II que ainda não têm
cobertura suficiente, ordenados por retorno esperado na prova
(prioridade no edital × pontos em jogo × tamanho da lacuna).

- Lacunas com prioridade S/A: **${lista.length} tópicos** (${lista.reduce((s, x) => s + x.falta, 0)} itens a produzir).
- Meta prática por tópico: **2 questões**, **1 resumo**, **3 flashcards**.

## Próximos ${Math.min(TOP, lista.length)} da fila

${tabelaLacunas(lista, TOP)}

<details><summary>Legenda e como usar</summary>

- **prio** = prioridade do tópico no edital (S = sempre cai, A = alta, B = básica).
- **pts** = pontos que a matéria representa na prova (50 questões × 0,2 = 10,0).
- **q/res/fc** = questões, resumos e flashcards que o tópico já tem no banco.
- Para gerar tudo automaticamente com uma API:
  \`\`\`bash
  export OPENAI_API_KEY="..."          # ou OPENAI_BASE_URL / OPENAI_MODEL p/ provedor compatível
  node tools/generate-content.mjs --tipo=questoes --limite=8
  node tools/generate-content.mjs --tipo=todos --materia=dir-adm,proc-leg
  \`\`\`
- Sem API? Gere os prompts já preenchidos e cole em qualquer assistente:
  \`\`\`bash
  node tools/generate-content.mjs --fila --completo          # docs/prompts/*.md
  node tools/generate-content.mjs --fila --completo --tipo=questoes --materia=lp --top=10
  \`\`\`
- Depois de inserir qualquer conteúdo, rode \`npm run validate\`.

</details>

## Modelos de prompt

Os três modelos abaixo são exatamente os que o gerador usa. Substitua os campos entre
\`{{chaves}}\` e cole no assistente de sua preferência.

### 1. Questões inéditas

\`\`\`text
Você é professor de cursinho preparatório para concursos, especialista na banca Fundação CETAP.

TAREFA: criar {{N}} questão(ões) INÉDITA(S) e objetivas sobre UM único tópico do edital.
TÓPICO: {{ID}} — {{NOME_DO_TOPICO}}
MATÉRIA: {{MATERIA}} · vale {{PONTOS}} ponto(s) na prova · PRIORIDADE: {{PRIORIDADE}}

REGRAS OBRIGATÓRIAS:
1. Responda APENAS com JSON válido: {"questoes": [ {...} ]}.
2. Português do Brasil, com acentuação.
3. NÃO invente número de artigo, lei, resolução ou data. Na dúvida, descreva o instituto sem citar o número.
4. Cada questão tem exatamente UMA alternativa correta — sem ambiguidade.
5. Contexto: ALEPA, Concurso 002/2026, Cargo 02 Assessor Técnico PL.AL.102, banca Fundação CETAP,
   prova em 13/12/2026, 50 questões A–E valendo 0,2 ponto cada. Use situações do cotidiano
   legislativo paraense quando fizer sentido.

Campos de cada questão: topico ("{{ID}}"), dificuldade (facil|medio|dificil), contexto (1 frase),
enunciado, alternativas (SEMPRE 5, letras A,B,C,D,E nesta ordem, textos de tamanho parecido,
sem "todas/nenhuma das anteriores"), gabarito (uma letra), comentario (mín. 400 caracteres:
justifique o acerto, refute cada distrator nomeando a letra e feche com a regra prática),
mnemonico (até 120 caracteres), leiSeca (array "Art. X — teor", pode ser vazio),
tags (2 a 5), pegadinhas (1 a 3), estrategia, estiloBanca, origem ("inédita — elaborada para este banco").
NÃO inclua "id".

QUESTÕES JÁ EXISTENTES NESTE TÓPICO (não repita): {{LISTA_DAS_EXISTENTES}}
\`\`\`

### 2. Resumo de estudo

\`\`\`text
Você é autor de material didático para concursos públicos brasileiros.

TAREFA: escrever 1 RESUMO completo e autossuficiente sobre o tópico {{ID}} — {{NOME_DO_TOPICO}}
({{MATERIA}}, prioridade {{PRIORIDADE}}, vale {{PONTOS}} ponto(s) na prova).

Responda APENAS com JSON: {"resumos": [{
  "topico": "{{ID}}",
  "titulo": "título curto e específico",
  "tempoLeituraMin": 6,
  "texto": "mínimo 1.800 caracteres; parágrafos separados por \n\n; • para tópicos;
            CAIXA ALTA nos termos-chave. Cubra conceito, fundamento, requisitos/espécies,
            prazos e números que caem, posição dominante, erros frequentes e aplicação à ALEPA.",
  "pontosChave": ["5 a 9 frases curtas, cada uma um fato testável em prova"],
  "mnemonicos": ["1 a 3 mnemônicos explicados"],
  "caiNaProva": ["3 a 5 afirmações sobre como a banca cobra o tópico"],
  "leiSeca": ["Art. X — teor (pode ser vazio)"],
  "origem": "inédito — elaborado para este banco"
}]}

NÃO invente dispositivo legal. NÃO inclua "id" nem "materia".
Resumos já existentes neste tópico (não repita): {{LISTA_DOS_EXISTENTES}}
\`\`\`

### 3. Flashcards

\`\`\`text
Você é especialista em repetição espaçada (Anki/SuperMemo) para concursos.

TAREFA: criar {{N}} FLASHCARDS atômicos sobre o tópico {{ID}} — {{NOME_DO_TOPICO}} ({{MATERIA}}).

Responda APENAS com JSON: {"flashcards": [{ "frente": "...", "verso": "...", "tags": ["..."], "dificuldade": "facil|medio|dificil" }]}

REGRAS: um fato por cartão; frente ≤ 180 caracteres e verso ≤ 400; prefira pergunta de lacuna
("Qual o prazo de ___?"); cubra conceito, competência, prazo/número, exceção e mnemônico;
não invente artigo de lei. NÃO inclua "id", "materia" nem "topico".
Cartões já existentes neste tópico (não repita a pergunta): {{LISTA_DOS_EXISTENTES}}
\`\`\`

## Como o conteúdo gerado entra no banco

1. Questões → \`data/questoes/<materia>.json\` (ou \`complementares.json\`, com o campo \`materia\`);
   o manifesto \`data/questoes/index.json\` é recalculado automaticamente.
2. Resumos → \`data/resumos.json\`. Flashcards → \`data/flashcards.json\`.
3. Ids atribuídos em sequência (\`dadm-q013\`, \`res-dadm-03\`, \`fc-159\`).
4. Rode \`npm run validate\` e \`npm test\` antes de commitar.
5. Itens que citam artigo de lei/estado devem ganhar \`"revisar": true\` até a conferência na fonte oficial.
`, 'utf8');

  console.log(`Fila escrita em ${path.relative(RAIZ, alvo)} (${Math.min(TOP, lista.length)} de ${lista.length} lacunas).`);

  if (ARG.completo) {
    const dir = path.join(RAIZ, 'docs', 'prompts');
    fs.mkdirSync(dir, { recursive: true });
    for (const tipo of TIPOS) {
      const partes = [];
      for (const t of lista.slice(0, TOP)) {
        const jaQ = todasQuestoes.filter((q) => q.topico === t.id);
        const jaR = resumosArq.resumos.filter((r) => r.topico === t.id);
        const jaC = cardsArq.flashcards.filter((c) => c.topico === t.id);
        const prompt = tipo === 'questoes' ? specQuestao(t, jaQ) : tipo === 'resumos' ? specResumo(t, jaR) : specCards(t, jaC);
        partes.push(`## ${t.materiaNome} — \`${t.id}\` ${t.texto || t.nome}

**Prioridade ${t.prioridade} · ${t.pontos} ponto(s) · já existem ${jaQ.length} questão(ões), ${jaR.length} resumo(s), ${jaC.length} flashcard(s)**

\`\`\`text
${prompt}
\`\`\`
`);
      }
      const arq = path.join(dir, `${tipo}.md`);
      fs.writeFileSync(arq, `# Prompts expandidos — ${tipo}

Gerado em ${HOJE}. Cada bloco é autossuficiente: copie, cole no assistente e valide a resposta com \`npm run validate\`.

${partes.join('\n')}`, 'utf8');
      console.log(`  ${partes.length} prompts de ${tipo} → ${path.relative(RAIZ, arq)}`);
    }
  }
  return alvo;
}

/* ------------------------------------------------------------------ main */
async function main() {
  const lista = relatorio();
  if (ARG.lacunas) return;
  if (!lista.length) { console.log('Nenhuma lacuna dentro dos filtros. 🎉'); return; }

  if (ARG.fila) { escreverFila(lista, ARG.fila); return; }

  if (!API_KEY) {
    console.log('\nNenhuma chave de API encontrada (OPENAI_API_KEY).');
    console.log('Gere a fila de prompts para colar manualmente com:  node tools/generate-content.mjs --fila');
    process.exit(0);
  }

  const vistosQ = new Set(todasQuestoes.map((q) => normalizar(q.enunciado).slice(0, 90)));
  const vistosR = new Set(resumosArq.resumos.map((r) => normalizar(r.titulo).slice(0, 60)));
  const vistosC = new Set(cardsArq.flashcards.map((c) => normalizar(c.frente).slice(0, 70)));

  let chamadas = 0;
  let criados = 0;
  let descartados = 0;
  const alvos = [];
  for (const t of lista) {
    for (const tipo of TIPOS) {
      const tem = tipo === 'questoes' ? t.questoes : tipo === 'resumos' ? t.resumos : t.cards;
      const minimo = tipo === 'questoes' ? 2 : tipo === 'resumos' ? 1 : 3;
      if (tem >= minimo) continue;
      alvos.push({ t, tipo });
    }
    if (alvos.length >= LIMITE * 2) break;
  }

  for (const { t, tipo } of alvos) {
    if (chamadas >= LIMITE) break;
    chamadas++;
    const prompt = tipo === 'questoes' ? specQuestao(t, todasQuestoes.filter((q) => q.topico === t.id))
      : tipo === 'resumos' ? specResumo(t, resumosArq.resumos.filter((r) => r.topico === t.id))
      : specCards(t, cardsArq.flashcards.filter((c) => c.topico === t.id));
    process.stdout.write(`→ ${tipo.padEnd(11)} ${t.id.padEnd(12)} ${String(t.texto || t.nome).slice(0, 42).padEnd(44)}`);
    try {
      const bruto = await chamarIA(prompt, 'Você gera conteúdo de estudo para concursos em JSON estrito. Responda somente JSON.');
      const json = extrairJSON(bruto);
      const itens = tipo === 'questoes' ? json.questoes : tipo === 'resumos' ? json.resumos : json.flashcards;
      if (!Array.isArray(itens) || !itens.length) throw new Error('resposta sem a lista esperada');
      let aceitos = 0;
      for (const item of itens.slice(0, nPorTipo(tipo))) {
        const errs = tipo === 'questoes' ? validarQuestao(item, t, vistosQ)
          : tipo === 'resumos' ? validarResumo(item, vistosR) : validarCard(item, vistosC);
        if (errs) { descartados++; console.log(`\n   ✗ descartado: ${errs.join('; ')}`); continue; }
        if (tipo === 'questoes') {
          const id = proximoIdQuestao(t.materia);
          const arq = arquivoDaMateria(t.materia);
          const registro = { id, topico: t.id, dificuldade: item.dificuldade, ...(item.contexto ? { contexto: item.contexto } : {}), enunciado: item.enunciado.trim(), alternativas: item.alternativas, gabarito: item.gabarito, comentario: item.comentario.trim(), mnemonico: item.mnemonico || '', leiSeca: item.leiSeca || [], tags: item.tags || [], pegadinhas: item.pegadinhas || [], estrategia: item.estrategia || '', estiloBanca: item.estiloBanca || '', origem: item.origem || 'inédita — gerada por IA e revisada', ...(arq === 'complementares.json' ? { materia: t.materia } : {}) };
          questoesPorArquivo.get(arq).questoes.push(registro);
          todasQuestoes.push({ ...registro, _arquivo: arq });
          t.questoes++;
        } else if (tipo === 'resumos') {
          const registro = { id: proximoIdResumo(t.materia), materia: t.materia, topico: t.id, titulo: item.titulo.trim(), tempoLeituraMin: item.tempoLeituraMin, texto: item.texto.trim(), pontosChave: item.pontosChave, mnemonicos: item.mnemonicos || [], caiNaProva: item.caiNaProva || [], leiSeca: item.leiSeca || [], origem: item.origem || 'inédito — gerado por IA e revisado' };
          resumosArq.resumos.push(registro);
          t.resumos++;
        } else {
          const registro = { id: proximoIdCard(), materia: t.materia, topico: t.id, frente: item.frente.trim(), verso: item.verso.trim(), tags: item.tags, dificuldade: item.dificuldade };
          cardsArq.flashcards.push(registro);
          t.cards++;
        }
        aceitos++; criados++;
      }
      if (aceitos) process.stdout.write(` ✓ ${aceitos} novo(s)\n`);
      else process.stdout.write(' — nada aproveitado\n');
    } catch (e) {
      descartados++;
      console.log(`\n   ✗ falha: ${e.message}`);
    }
  }

  /* grava */
  if (criados) {
    for (const [arq, j] of questoesPorArquivo) {
      j.atualizadoEm = HOJE;
      escrever(path.join(DADOS, 'questoes', arq), j);
    }
    atualizarIndex();
    escrever(path.join(DADOS, 'questoes', 'index.json'), indexArq);
    resumosArq.atualizadoEm = HOJE;
    escrever(path.join(DADOS, 'resumos.json'), resumosArq);
    cardsArq.atualizadoEm = HOJE;
    escrever(path.join(DADOS, 'flashcards.json'), cardsArq);
  }

  console.log(`\n———————————————`);
  console.log(`${chamadas} chamada(s) de IA · ${criados} item(ns) criado(s) · ${descartados} descartado(s)${DRY ? ' · DRY-RUN (nada gravado)' : ''}`);
  if (criados && !DRY) {
    relatorio();
    if (!ARG['sem-validar']) {
      const r = spawnSync(process.execPath, [path.join(RAIZ, 'tools', 'validate-data.mjs')], { stdio: 'inherit' });
      if (r.status !== 0) { console.error('⚠️  O validador apontou problemas — revise antes de commitar.'); process.exit(1); }
    }
  }
}

main().catch((e) => { console.error('\nFalha:', e); process.exit(1); });
