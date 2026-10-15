/* data.js — carregamento e normalização de todo o conteúdo estático (data/*.json).
 * Nada aqui depende do estado do usuário; é só leitura.
 */

import { normalizar } from './util.js';

const CACHE = new Map();

async function json(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${res.status})`);
  const data = await res.json();
  CACHE.set(url, data);
  return data;
}

/** Conteúdo completo carregado e normalizado. */
export const dados = {
  concurso: null,
  curriculo: null,
  materias: [],
  topicos: [],
  questoes: [],
  resumos: [],
  flashcards: [],
  simulados: [],
  carregado: false,
  erros: [],
};

export async function carregarTudo(base = 'data') {
  dados.erros = [];
  try {
    dados.concurso = await json(`${base}/concurso.json`);
  } catch (e) { dados.erros.push(`concurso.json: ${e.message}`); }

  try {
    dados.curriculo = await json(`${base}/curriculo.json`);
  } catch (e) { dados.erros.push(`curriculo.json: ${e.message}`); }

  // matérias e tópicos
  if (dados.curriculo) {
    dados.materias = dados.curriculo.materias || [];
    dados.topicos = [];
    for (const m of dados.materias) {
      for (const t of m.topicos || []) {
        // o edital usa `nome` para o texto do tópico; normalizamos para `texto`
        dados.topicos.push({
          ...t,
          texto: t.texto || t.nome || '',
          materia: m.id,
          materiaNome: m.nome,
          sigla: m.sigla,
          bloco: m.bloco,
          cor: m.cor,
        });
      }
    }
  }

  // banco de questões via manifesto
  dados.questoes = [];
  try {
    const idx = await json(`${base}/questoes/index.json`);
    const arquivos = idx.arquivos || [];
    const partes = await Promise.all(
      arquivos.map(async (a) => {
        try {
          const d = await json(`${base}/questoes/${a.arquivo}`);
          return { arquivo: a, questoes: d.questoes || [] };
        } catch (e) {
          dados.erros.push(`questoes/${a.arquivo}: ${e.message}`);
          return { arquivo: a, questoes: [] };
        }
      }),
    );
    for (const { arquivo, questoes } of partes) {
      for (const q of questoes) {
        dados.questoes.push(normalizarQuestao(q, arquivo.materia));
      }
    }
  } catch (e) {
    dados.erros.push(`questoes/index.json: ${e.message}`);
  }

  try { dados.resumos = (await json(`${base}/resumos.json`)).resumos || []; }
  catch (e) { dados.erros.push(`resumos.json: ${e.message}`); }

  try { dados.flashcards = (await json(`${base}/flashcards.json`)).flashcards || []; }
  catch (e) { dados.erros.push(`flashcards.json: ${e.message}`); }

  try { dados.simulados = (await json(`${base}/simulados.json`)); }
  catch (e) { dados.erros.push(`simulados.json: ${e.message}`); }

  dados.carregado = true;
  return dados;
}

function normalizarQuestao(q, materiaDoArquivo) {
  const materia = q.materia || materiaDoArquivo || inferirMateria(q.id);
  const topico = dados.topicos.find((t) => t.id === q.topico);
  return {
    ...q,
    materia,
    materiaNome: materiaNome(materia),
    cor: corMateria(materia),
    bloco: topico?.bloco || (['lp', 'leg', 'inf', 'rl'].includes(materia) ? 'basica' : 'especifica'),
    dificuldade: q.dificuldade || 'medio',
    alternativas: q.alternativas || [],
    tags: q.tags || [],
    leiSeca: q.leiSeca || [],
    pegadinhas: q.pegadinhas || [],
    _chave: `${materia}|${q.topico}|${normalizar(q.enunciado || '').slice(0, 40)}`,
  };
}

function inferirMateria(id) {
  const mapa = {
    'lp': 'lp', 'leg': 'leg', 'inf': 'inf', 'rl': 'rl',
    'dadm': 'dir-adm', 'dcon': 'dir-const', 'dciv': 'dir-civil', 'dpc': 'dir-proc-civ',
    'pleg': 'proc-leg', 'dpcon': 'dir-proc-const', 'dfin': 'dir-fin', 'dprev': 'dir-prev',
    'dh': 'dir-humanos', 'adm': 'adm-geral', 'sec': 'secretaria',
  };
  const pre = String(id).split('-')[0];
  return mapa[pre] || pre;
}

export function materiaPorId(id) { return dados.materias.find((m) => m.id === id) || null; }
export function materiaNome(id) { return materiaPorId(id)?.nome || id || '—'; }
export function corMateria(id) { return materiaPorId(id)?.cor || '#6366f1'; }
export function topicoPorId(id) { return dados.topicos.find((t) => t.id === id) || null; }
export function topicoTexto(id) { return topicoPorId(id)?.texto || id || '—'; }

export function questoesPorMateria(id) { return dados.questoes.filter((q) => q.materia === id); }
export function questoesPorTopico(id) { return dados.questoes.filter((q) => q.topico === id); }
export function questaoPorId(id) { return dados.questoes.find((q) => q.id === id) || null; }
export function resumosPorMateria(id) { return dados.resumos.filter((r) => r.materia === id); }
export function cardsPorMateria(id) { return dados.flashcards.filter((c) => c.materia === id); }

export function listarMaterias() {
  return dados.materias.map((m) => ({
    ...m,
    nTopicos: (m.topicos || []).length,
    nQuestoes: questoesPorMateria(m.id).length,
    nResumos: resumosPorMateria(m.id).length,
    nCards: cardsPorMateria(m.id).length,
  }));
}

/** Busca textual simples em questões, resumos e cards. */
export function buscar(termo) {
  const t = normalizar(termo.trim());
  if (t.length < 2) return { questoes: [], resumos: [], flashcards: [], topicos: [] };
  const tem = (...campos) => normalizar(campos.filter(Boolean).join(' ')).includes(t);

  return {
    questoes: dados.questoes.filter((q) => tem(q.enunciado, q.comentario, q.contexto, ...(q.tags || []), ...(q.leiSeca || []), ...(q.alternativas || []).map((a) => a.texto))).slice(0, 80),
    resumos: dados.resumos.filter((r) => tem(r.titulo, r.texto, ...(r.pontosChave || []))).slice(0, 40),
    flashcards: dados.flashcards.filter((c) => tem(c.frente, c.verso, ...(c.tags || []))).slice(0, 60),
    topicos: dados.topicos.filter((tp) => tem(tp.texto, tp.materiaNome)).slice(0, 60),
  };
}

/** Fase objetiva do concurso (dados oficiais de concurso.json → fases). */
export function faseObjetiva() {
  const f = (dados.concurso?.fases || []).find((x) => /objetiva/i.test(x.id || x.nome || ''));
  return f || { data: '2026-12-13', turno: 'MANHÃ', duracaoMinutos: 180, valorQuestao: 0.2, pontuacaoMaxima: 10, notaMinimaAprovacao: 6 };
}

/** Data da prova vinda do edital (fallback: 2026-12-13). */
export function dataDaProva() {
  const daFase = (dados.concurso?.fases || []).find((f) => /objetiva/i.test(f.id || f.nome || ''))?.data;
  if (daFase) return String(daFase).slice(0, 10);
  const cr = dados.concurso?.cronograma || [];
  const evento = cr.find((e) => /realiza|aplica/i.test(e.evento) && !/locais|divulga|gabarito|recurso|resultado|homologa/i.test(e.evento));
  return evento?.data || faseObjetiva().data || '2026-12-13';
}

/** Valor de cada questão (0,2 ponto, uniforme em todas as disciplinas). */
export function valorQuestao() { return faseObjetiva().valorQuestao ?? 0.2; }

/** Estrutura da prova como array de blocos (concurso.json → estruturaProva). */
export function estruturaProva() {
  const e = dados.concurso?.estruturaProva;
  return Array.isArray(e) ? e : [];
}

/** Pontos totais de cada bloco/disciplina da prova (ex.: CE = 20 × 0,2 = 4,0). */
export function pontosPorBloco() {
  return new Map(estruturaProva().map((b) => [b.id, b.pontos ?? (b.questoes * valorQuestao())]));
}

/** Eventos do cronograma que merecem destaque (inscrições, locais, prova, gabarito…). */
export function ehCritico(evento) {
  return /INSCRI|ENCERRAMENTO|LOCAIS|PROVA OBJETIVA|GABARITO|HOMOLOGA|RESULTADO|ISEN/i.test(evento?.evento || '');
}

/**
 * Distribuição ESTIMADA das 20 questões de Conhecimentos Específicos
 * (o edital não detalha; vem de concurso.json → estimativaConhecimentosEspecificos).
 */
export function estimativaCE() {
  return dados.concurso?.estimativaConhecimentosEspecificos?.porMateria || {};
}

/** Pontos disponíveis por matéria na prova (para priorização de estudo). */
export function pontosPorMateria() {
  const mapa = new Map();
  const ce = estimativaCE();
  const vq = valorQuestao();
  for (const bloco of estruturaProva()) {
    if (bloco.id === 'ce') {
      for (const [mat, qtd] of Object.entries(ce)) mapa.set(mat, (mapa.get(mat) || 0) + qtd * vq);
    } else {
      mapa.set(bloco.id, (mapa.get(bloco.id) || 0) + (bloco.pontos ?? bloco.questoes * vq));
    }
  }
  return mapa;
}
