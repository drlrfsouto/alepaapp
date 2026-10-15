/* store.js — estado global persistido em localStorage.
 * Estrutura imutável na prática: sempre chamar `set()` / `patch()`, nunca mutar direto.
 */

import { todayKey, addDays, uid } from './util.js';

const KEY = 'alepa2026.state.v1';

export const ESTADO_INICIAL = {
  versao: 1,
  criadoEm: null,
  perfil: {
    nome: '',
    cargo: 'Cargo 02 — Assessoramento Legislativo / Assessor Técnico PL.AL.102',
    edital: 'Concurso Público nº 002/2026 — ALEPA (Fundação CETAP)',
    horasPorDia: 3,
    diasSemana: [1, 2, 3, 4, 5, 6, 0], // 0=domingo
    dataProva: null, // preenchido pelo data.js a partir de concurso.json
    metaPontos: 8.0,
  },
  // respostas de questões: { [questaoId]: { ultimoResultado, acertos, erros, seguidos, ultimoEm, historico: [] } }
  questoes: {},
  // simulados: [{ id, modelo, iniciadoEm, finalizadoEm, respostas: {qid:letra}, nota, acertos, total }]
  simulados: [],
  // flashcards SRS: { [cardId]: { ease, intervalo, repeticoes, proxima, ultimoEm, acertos, erros } }
  cards: {},
  // tópicos do currículo: { [topicoId]: { status: 'novo|estudando|dominado', anotacoes, atualizadoEm } }
  topicos: {},
  // plano de estudo gerado: [{ id, data, blocos: [{ materia, topicos, minutos, tipo }] }]
  plano: [],
  planoGeradoEm: null,
  // metas semanais
  metas: { minutosSemana: 600, questoesSemana: 150 },
  ai: {
    provedor: 'nenhum', // 'openai' | 'anthropic' | 'gemini' | 'custom' | 'nenhum'
    apiKey: '',
    modelo: '',
    baseUrl: '',
    temperatura: 0.3,
    usarOffline: true,
  },
  config: {
    mostrarGabaritoImediatamente: false,
    embaralharAlternativas: false,
    modoEscuro: false,
    densidade: 'normal',
    som: false,
  },
  registro: [], // log de atividades: { ts, tipo, detalhe }
};

let estado = structuredClone(ESTADO_INICIAL);
const listeners = new Set();
let saveTimer = null;

export function carregar() {
  try {
    const bruto = localStorage.getItem(KEY);
    if (bruto) {
      const salvo = JSON.parse(bruto);
      estado = mesclar(structuredClone(ESTADO_INICIAL), salvo);
    }
  } catch (e) {
    console.warn('[store] falha ao carregar estado:', e);
    estado = structuredClone(ESTADO_INICIAL);
  }
  if (!estado.criadoEm) estado.criadoEm = new Date().toISOString();
  return estado;
}

function mesclar(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  for (const k of Object.keys(patch)) {
    base[k] = mesclar(base[k], patch[k]);
  }
  return base;
}

export function get() { return estado; }

export function set(mutator, { log = null } = {}) {
  const antes = estado;
  mutator(estado);
  if (log) registrar(log.tipo, log.detalhe);
  emitir(antes);
  return estado;
}

/** Atalho para patch raso no nível raiz. */
export function patch(obj) {
  return set((s) => Object.assign(s, obj));
}

export function registrar(tipo, detalhe = {}) {
  estado.registro.unshift({ ts: new Date().toISOString(), tipo, detalhe });
  if (estado.registro.length > 400) estado.registro.length = 400;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitir(antes) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistir, 220);
  for (const fn of listeners) {
    try { fn(estado, antes); } catch (e) { console.error('[store] listener:', e); }
  }
}

export function persistir() {
  try {
    localStorage.setItem(KEY, JSON.stringify(estado));
    return true;
  } catch (e) {
    console.warn('[store] falha ao persistir (quota?):', e);
    return false;
  }
}

export function exportar() {
  return JSON.parse(JSON.stringify(estado));
}

export function importar(json) {
  const dados = typeof json === 'string' ? JSON.parse(json) : json;
  estado = mesclar(structuredClone(ESTADO_INICIAL), dados);
  estado.criadoEm = estado.criadoEm || new Date().toISOString();
  persistir();
  emitir(null);
}

export function limparTudo() {
  localStorage.removeItem(KEY);
  estado = structuredClone(ESTADO_INICIAL);
  estado.criadoEm = new Date().toISOString();
  persistir();
  emitir(null);
}

/* ------------------------- seletores ------------------------- */

export function statsQuestoes() {
  const todos = Object.values(estado.questoes);
  const respondidas = todos.length;
  let acertos = 0;
  for (const q of todos) acertos += q.acertos || 0;
  const total = todos.reduce((s, q) => s + (q.acertos || 0) + (q.erros || 0), 0);
  return {
    respondidas,
    tentativas: total,
    acertos,
    erros: total - acertos,
    taxa: total ? Math.round((acertos / total) * 1000) / 10 : 0,
  };
}

export function statsPorMateria(banco) {
  const map = new Map();
  for (const q of banco) {
    const m = q.materia || 'outros';
    if (!map.has(m)) map.set(m, { materia: m, tentativas: 0, acertos: 0, vistas: 0, certasDePrimeira: 0 });
    const reg = map.get(m);
    const r = estado.questoes[q.id];
    if (r) {
      reg.vistas += 1;
      reg.tentativas += (r.acertos || 0) + (r.erros || 0);
      reg.acertos += r.acertos || 0;
      if (r.seguidos >= 1) reg.certasDePrimeira += 1;
    }
  }
  for (const v of map.values()) v.taxa = v.tentativas ? Math.round((v.acertos / v.tentativas) * 1000) / 10 : 0;
  return [...map.values()].sort((a, b) => a.taxa - b.taxa);
}

export function questoesErradas() {
  return Object.entries(estado.questoes)
    .filter(([, r]) => r.ultimoResultado === 'erro')
    .map(([id]) => id);
}

/**
 * Caderno de erros no sentido pedagógico: toda questão que o usuário já errou e
 * ainda não consolidou (2 acertos consecutivos). Sai do caderno quando
 * `seguidos >= 2`. Questões marcadas manualmente são tratadas à parte na view.
 * @param {number} consolidacao  acertos consecutivos necessários (padrão 2)
 */
export function cadernoErros(consolidacao = 2) {
  return Object.entries(estado.questoes)
    .filter(([, r]) => (r.erros || 0) > 0 && (r.seguidos || 0) < consolidacao)
    .sort((a, b) => (b[1].erros || 0) - (a[1].erros || 0))
    .map(([id]) => id);
}

export function registrarResposta(questaoId, letraCorreta, letraMarcada, extra = {}) {
  const acertou = letraCorreta === letraMarcada;
  set((s) => {
    const r = s.questoes[questaoId] || {
      id: questaoId, acertos: 0, erros: 0, seguidos: 0, tentativas: 0, historico: [], criadoEm: new Date().toISOString(),
    };
    r.ultimoResultado = acertou ? 'acerto' : 'erro';
    r.ultimoEm = new Date().toISOString();
    r.tentativas = (r.tentativas || 0) + 1;
    if (acertou) { r.acertos = (r.acertos || 0) + 1; r.seguidos = (r.seguidos || 0) + 1; }
    else { r.erros = (r.erros || 0) + 1; r.seguidos = 0; }
    r.historico = (r.historico || []).slice(-19);
    r.historico.push({ em: r.ultimoEm, letra: letraMarcada, certa: acertou });
    s.questoes[questaoId] = r;
  }, { log: { tipo: 'resposta', detalhe: { questaoId, acertou, ...extra } } });
  return acertou;
}

/* ------------------------- metas / streak ------------------------- */

export function streakAtual() {
  const dias = new Set(estado.registro.filter((r) => ['resposta', 'simulado', 'card', 'estudo'].includes(r.tipo)).map((r) => todayKey(new Date(r.ts))));
  let n = 0;
  let cursor = todayKey();
  // tolera "hoje ainda não estudou": começa de hoje e, se vazio, tenta ontem
  if (!dias.has(cursor)) cursor = addDays(cursor, -1);
  while (dias.has(cursor)) { n += 1; cursor = addDays(cursor, -1); }
  return n;
}

export function atividadeNosUltimosDias(n = 14) {
  const mapa = new Map();
  for (const r of estado.registro) {
    if (!['resposta', 'simulado', 'card', 'estudo'].includes(r.tipo)) continue;
    const d = todayKey(new Date(r.ts));
    mapa.set(d, (mapa.get(d) || 0) + 1);
  }
  const saida = [];
  let cursor = todayKey();
  for (let i = 0; i < n; i++) {
    saida.unshift({ dia: cursor, total: mapa.get(cursor) || 0 });
    cursor = addDays(cursor, -1);
  }
  return saida;
}

export function minutosEstimadosHoje() {
  const hoje = todayKey();
  const respostas = estado.registro.filter((r) => todayKey(new Date(r.ts)) === hoje);
  // heurística: ~1,2 min por questão respondida, ~15 min por simulado concluído
  let min = 0;
  for (const r of respostas) {
    if (r.tipo === 'resposta') min += 1.2;
    else if (r.tipo === 'card') min += 0.4;
    else if (r.tipo === 'simulado') min += r.detalhe?.duracaoMin || 15;
    else min += r.detalhe?.minutos || 10;
  }
  return Math.round(min);
}

export function idSessao() { return uid('sess'); }
