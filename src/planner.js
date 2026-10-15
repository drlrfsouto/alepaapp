/* planner.js — gera o plano de estudo até a data da prova.
 *
 * Estratégia:
 *  1. Calcula o PESO de cada matéria a partir dos pontos que ela representa na prova
 *     (cada questão vale 0,2 — o bloco de Específicos concentra 4,0 dos 10,0 pontos).
 *  2. Distribui os dias úteis restantes proporcionalmente a esse peso, com um piso
 *     mínimo para as matérias básicas e um bônus para as de prioridade S.
 *  3. Preenche cada dia com blocos de matéria + tópicos, respeitando horas/dia e
 *     dias da semana escolhidos, e reserva os últimos dias para REVISÃO + SIMULADOS.
 */

import { todayKey, addDays, diffDays, clamp } from './util.js';

export const PESO_PRIORIDADE = { S: 1.6, A: 1.3, B: 1.0, C: 0.7 };

/**
 * @param {object} opts
 * @param {Array}  opts.materias      matérias de curriculo.json (com topicos[])
 * @param {Array}  opts.estrutura     [{ materia, quantidade, peso }] da prova
 * @param {number} opts.horasPorDia
 * @param {number[]} opts.diasSemana  ex.: [1,2,3,4,5]
 * @param {string} opts.dataProva     'YYYY-MM-DD'
 * @param {object} opts.estado        estado do usuário (para priorizar pontos fracos)
 */
export function gerarPlano({
  materias = [],
  estrutura = [],
  horasPorDia = 3,
  diasSemana = [1, 2, 3, 4, 5, 6, 0],
  dataProva,
  estado = null,
  inicio = todayKey(),
}) {
  const hoje = inicio;
  const diasTotais = Math.max(0, diffDays(dataProva, hoje));
  if (!diasTotais) return { dias: [], resumo: null, aviso: 'A data da prova já passou ou é hoje.' };

  // 1. pontos por matéria na prova (cada questão vale 0,2)
  const pesosProva = new Map();
  let totalPontos = 0;
  for (const e of estrutura) {
    const p = e.pontos ?? (e.quantidade || 0) * 0.2;
    pesosProva.set(e.materia, p);
    totalPontos += p;
  }
  // matérias específicas podem vir agrupadas em "conhecimentos-especificos"; expandir
  if (pesosProva.size === 0 || totalPontos === 0) {
    for (const m of materias) pesosProva.set(m.id, m.bloco === 'especifica' ? 2 : 1);
    totalPontos = [...pesosProva.values()].reduce((a, b) => a + b, 0);
  }

  // 2. desempenho do usuário → fator de correção (ponto fraco recebe mais tempo)
  // O prefixo do id da questão é a SIGLA da matéria em minúsculas (lp-q001 → LP,
  // dadm-q008 → DADM). Guardamos a chave em MAIÚSCULAS para casar com materias[].sigla.
  const fracoPorMateria = new Map();
  if (estado) {
    const porMateria = new Map();
    for (const [qid, r] of Object.entries(estado.questoes || {})) {
      const sigla = String(qid.split('-')[0] || '').toUpperCase();
      if (!sigla) continue;
      const tent = (r.acertos || 0) + (r.erros || 0);
      if (!tent) continue; // sem histórico não informa nada
      if (!porMateria.has(sigla)) porMateria.set(sigla, { acertos: 0, tent: 0 });
      const o = porMateria.get(sigla);
      o.acertos += r.acertos || 0;
      o.tent += tent;
    }
    for (const [sigla, o] of porMateria) {
      if (o.tent < 3) continue; // amostra pequena demais para mexer no plano
      const taxa = o.acertos / o.tent;
      // abaixo de 75% de acerto ganha até +50% de tempo; acima de 75% pode perder até 15%
      fracoPorMateria.set(sigla, clamp(1 + (0.75 - taxa), 0.85, 1.5));
    }
  }

  // 3. minutos disponíveis por dia
  const diasUteis = [];
  for (let i = 0; i < diasTotais; i++) {
    const d = addDays(hoje, i);
    const dow = new Date(`${d}T12:00:00`).getDay();
    if (diasSemana.includes(dow)) diasUteis.push(d);
  }
  const minutosDia = Math.round(horasPorDia * 60);
  const minutosTotais = diasUteis.length * minutosDia;

  // 4. reserva de reta final: últimos ~12% dos dias para revisão + simulados
  const diasRevisao = Math.max(2, Math.round(diasUteis.length * 0.12));
  const diasConteudo = diasUteis.slice(0, Math.max(1, diasUteis.length - diasRevisao));
  const diasFinais = diasUteis.slice(Math.max(1, diasUteis.length - diasRevisao));
  const minutosConteudo = diasConteudo.length * minutosDia;

  // 5. fila de tópicos ordenada por peso da matéria × prioridade
  const fila = [];
  for (const m of materias) {
    const pesoProva = pesosProva.get(m.id) ?? 1;
    const fator = fracoPorMateria.get(m.sigla) || fracoPorMateria.get(m.id) || 1;
    for (const t of m.topicos || []) {
      const pr = PESO_PRIORIDADE[String(t.prioridade || 'B').toUpperCase()] ?? 1;
      fila.push({
        materia: m.id,
        materiaNome: m.nome,
        sigla: m.sigla,
        cor: m.cor,
        bloco: m.bloco,
        topicoId: t.id,
        texto: t.texto || t.nome || '',
        prioridade: t.prioridade || 'B',
        dificuldade: t.dificuldade || 'media',
        score: pesoProva * pr * fator,
        minutos: estimarMinutos(t, m),
      });
    }
  }
  fila.sort((a, b) => b.score - a.score || a.materia.localeCompare(b.materia));

  // 6. distribuir em rodadas: cada rodada percorre a fila proporcionalmente,
  //    de modo que TODAS as matérias apareçam cedo (evita estudar só uma matéria).
  const dias = [];
  const consumo = new Map(); // materia -> minutos já alocados
  const alvoMin = new Map(); // materia -> minutos-alvo
  for (const [m, p] of pesosProva) alvoMin.set(m, Math.round(minutosConteudo * (p / totalPontos)));

  const porMateria = new Map();
  for (const item of fila) {
    if (!porMateria.has(item.materia)) porMateria.set(item.materia, []);
    porMateria.get(item.materia).push(item);
  }

  let cursor = new Map([...porMateria.keys()].map((k) => [k, 0]));

  for (const dia of diasConteudo) {
    let restante = minutosDia;
    const blocos = [];
    // alterna matérias a cada slot de ~45 min, escolhendo a mais "atrasada" em relação ao alvo
    while (restante >= 15) {
      const slot = Math.min(45, restante);
      const mat = escolherMateria(alvoMin, consumo, cursor, porMateria);
      if (!mat) break;
      const lista = porMateria.get(mat);
      const i = cursor.get(mat);
      if (i >= lista.length) { cursor.set(mat, 0); continue; }
      const itens = [];
      let usado = 0;
      let j = i;
      while (j < lista.length && usado < slot) {
        const it = lista[j];
        const m = clamp(it.minutos, 10, slot - usado);
        itens.push({ ...it, minutos: m });
        usado += m;
        j += 1;
      }
      if (!itens.length) { cursor.set(mat, j); continue; }
      cursor.set(mat, j);
      consumo.set(mat, (consumo.get(mat) || 0) + usado);
      blocos.push({
        materia: mat,
        materiaNome: lista[0].materiaNome,
        cor: lista[0].cor,
        minutos: usado,
        tipo: 'conteudo',
        topicos: itens,
      });
      restante -= usado;
    }
    dias.push({ id: `dia-${dia}`, data: dia, blocos, minutos: minutosDia - restante, tipo: 'conteudo' });
  }

  // 7. reta final: revisão dos tópicos prioridade S/A + simulados
  const revisaoPrioritaria = fila.filter((f) => ['S', 'A'].includes(String(f.prioridade).toUpperCase()));
  let idxRev = 0;
  diasFinais.forEach((dia, k) => {
    const blocos = [];
    const ehDiaDeSimulado = k % 3 === 2;
    let restante = minutosDia;
    if (ehDiaDeSimulado) {
      blocos.push({ materia: null, materiaNome: 'Simulado completo', cor: '#f59e0b', minutos: Math.min(180, restante), tipo: 'simulado', topicos: [] });
      restante -= Math.min(180, restante);
    }
    if (restante >= 15) {
      const itens = [];
      while (idxRev < revisaoPrioritaria.length && itens.reduce((s, i) => s + i.minutos, 0) < restante) {
        itens.push({ ...revisaoPrioritaria[idxRev], minutos: 20 });
        idxRev += 1;
      }
      if (itens.length) blocos.push({ materia: itens[0].materia, materiaNome: 'Revisão relâmpago (S/A)', cor: '#ef4444', minutos: itens.length * 20, tipo: 'revisao', topicos: itens });
    }
    if (!blocos.length) blocos.push({ materia: null, materiaNome: 'Caderno de erros + flashcards', cor: '#8b5cf6', minutos: minutosDia, tipo: 'revisao', topicos: [] });
    dias.push({ id: `dia-${dia}`, data: dia, blocos, minutos: minutosDia, tipo: 'reta-final' });
  });

  dias.sort((a, b) => (a.data < b.data ? -1 : 1));

  const resumo = {
    diasTotais,
    diasDeEstudo: dias.length,
    minutosTotais: dias.reduce((s, d) => s + d.minutos, 0),
    horasTotais: Math.round(dias.reduce((s, d) => s + d.minutos, 0) / 60),
    topicosCobertos: new Set(dias.flatMap((d) => d.blocos.flatMap((b) => b.topicos.map((t) => t.topicoId)))).size,
    topicosTotais: fila.length,
  };

  return { dias, resumo, fila, alvoMin, aviso: resumo.topicosCobertos < resumo.topicosTotais
    ? `O plano cobre ${resumo.topicosCobertos} de ${resumo.topicosTotais} tópicos do edital no tempo disponível. Os tópicos de prioridade S e A têm precedência; os demais entram se sobrar tempo — aumente as horas/dia para cobrir tudo.`
    : null };
}

function escolherMateria(alvoMin, consumo, cursor, porMateria) {
  let melhor = null;
  let melhorDeficit = -Infinity;
  for (const [mat, alvo] of alvoMin) {
    const lista = porMateria.get(mat);
    if (!lista) continue;
    // permite dar voltas na lista (revisão espaçada natural)
    if (cursor.get(mat) >= lista.length) cursor.set(mat, 0);
    const usado = consumo.get(mat) || 0;
    const deficit = alvo - usado;
    // normaliza pelo alvo para não favorecer só matérias gigantes
    const rel = alvo ? deficit / alvo : deficit;
    if (rel > melhorDeficit) { melhorDeficit = rel; melhor = mat; }
  }
  return melhorDeficit > -0.6 ? melhor : null;
}

function estimarMinutos(topico, materia) {
  const base = materia?.bloco === 'especifica' ? 25 : 20;
  const dif = { facil: 0.8, medio: 1.0, media: 1.0, dificil: 1.3 }[String(topico.dificuldade || 'medio').toLowerCase()] ?? 1;
  const pr = { S: 1.3, A: 1.15, B: 1.0, C: 0.85 }[String(topico.prioridade || 'B').toUpperCase()] ?? 1;
  // tópicos longos (listas de artigos) levam mais tempo
  const tam = String(topico.texto || '').length;
  const fatorTam = tam > 600 ? 1.4 : tam > 300 ? 1.15 : 1;
  return clamp(Math.round(base * dif * pr * fatorTam), 10, 60);
}

/** Recomenda o que estudar HOJE dado o estado (vencidos SRS + plano + erros). */
export function recomendacaoDeHoje({ plano, estado, dataProva, hoje = todayKey() }) {
  const dia = (plano || []).find((d) => d.data === hoje) || (plano || []).find((d) => d.data > hoje);
  const diasRestantes = diffDays(dataProva, hoje);
  const errs = Object.entries(estado.questoes || {}).filter(([, r]) => r.ultimoResultado === 'erro').length;
  const sugestoes = [];

  if (dia) {
    sugestoes.push({
      titulo: `Plano de hoje (${dia.tipo === 'reta-final' ? 'reta final' : 'conteúdo'})`,
      rota: '#/plano',
      minutos: dia.minutos,
      detalhe: dia.blocos.map((b) => `${b.materiaNome} — ${b.minutos} min`).join(' · '),
      prioridade: 1,
    });
  }
  if (errs > 0) {
    sugestoes.push({ titulo: `${errs} questão(ões) no caderno de erros`, rota: '#/erros', minutos: Math.min(60, errs * 3), prioridade: 2 });
  }
  if (diasRestantes <= 30 && diasRestantes % 7 === 0) {
    sugestoes.push({ titulo: 'Simulado espelho da prova (50 questões / 3h)', rota: '#/simulados/sim-prova-real', minutos: 180, prioridade: 0 });
  }
  sugestoes.sort((a, b) => a.prioridade - b.prioridade);
  return { dia, diasRestantes, sugestoes };
}
