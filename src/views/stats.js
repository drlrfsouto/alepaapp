/* views/stats.js — estatísticas de desempenho, projeção de nota e exportação. */

import { h, fmtDateBR, todayKey, diffDays, round, baixarJSON } from '../util.js';
import { get, set, exportar, statsPorMateria, atividadeNosUltimosDias, streakAtual, cadernoErros } from '../store.js';
import { dados, materiaNome, corMateria, dataDaProva, listarMaterias } from '../data.js';
import { progresso } from '../srs.js';
import { cabecalho, card, badge, botao, barra, stat, graficoBarras, chipMateria, toast, markdown, vazio } from '../components.js';
import { diagnosticoOffline } from '../ai.js';

export function viewStats() {
  const e = get();
  const raiz = h('div', { class: 'pagina' });

  raiz.appendChild(cabecalho('Estatísticas e diagnóstico',
    'Seu desempenho real por matéria, projeção de nota e o que fazer com isso',
    [botao('Exportar progresso', () => { baixarJSON(exportar(), `alepa2026-progresso-${todayKey()}.json`); toast('Arquivo baixado.', 'sucesso'); }, { variante: 'secundario', icone: '⬇' }),
     botao('Ver histórico de simulados', () => { location.hash = '#/simulados/historico'; }, { variante: 'fantasma' })]));

  const porMateria = statsPorMateria(dados.questoes);
  const comDados = porMateria.filter((m) => m.tentativas > 0);
  const totalTent = comDados.reduce((s, m) => s + m.tentativas, 0);
  const totalAcertos = comDados.reduce((s, m) => s + m.acertos, 0);
  const taxaGeral = totalTent ? round((totalAcertos / totalTent) * 100, 1) : 0;

  raiz.appendChild(h('div', { class: 'faixa-stats' },
    stat(`${taxaGeral}%`, 'acerto geral', { cor: corTaxa(taxaGeral) }),
    stat(totalTent, 'questões respondidas'),
    stat(e.simulados.length, 'simulados'),
    stat(e.simulados.length ? round(Math.max(...e.simulados.map((s) => (s.notaMaxima ? (s.nota / s.notaMaxima) * 10 : 0))), 2).toFixed(2) : '—', 'melhor nota (0-10)', { cor: 'var(--verde)' }),
    stat(`${streakAtual()}🔥`, 'dias seguidos'),
    stat(cadernoErros().length, 'no caderno de erros', { cor: 'var(--vermelho)' })));

  /* ---- projeção de nota ---- */
  const modelo = (dados.simulados?.simulados || []).find((m) => m.id === 'sim-prova-real');
  const estrutura = modelo?.estrutura || [];
  let notaProjetada = 0;
  let notaMaxima = 0;
  const linhasProjecao = [];
  for (const bloco of estrutura) {
    const st = porMateria.find((m) => m.materia === bloco.materia);
    const taxa = st?.tentativas ? st.taxa / 100 : 0.5; // sem histórico → assume 50%
    const pontos = bloco.pontos ?? bloco.quantidade * 0.2; // cada questão vale 0,2
    notaProjetada += pontos * taxa;
    notaMaxima += pontos;
    linhasProjecao.push({ materia: bloco.materia, quantidade: bloco.quantidade, valor: 0.2, pontos, taxa: round(taxa * 100, 1), esperado: round(pontos * taxa, 2), temDados: Boolean(st?.tentativas) });
  }
  const projetada = round(notaProjetada, 2);

  raiz.appendChild(card('Projeção de nota na prova',
    h('div', {},
      h('div', { class: 'nota-final' },
        h('div', { class: 'nota-valor' }, h('strong', { text: projetada.toFixed(2) }), h('span', { text: `de ${notaMaxima.toFixed(1)}` })),
        h('div', { class: 'nota-veredito' },
          h('strong', { text: projetada >= 6 ? '✓ Acima do corte (6,0)' : '✗ Abaixo do corte (6,0)' }),
          h('span', { text: 'Estimativa baseada no seu desempenho real. Matérias sem histórico contam como 50%.' }))),
      h('table', { class: 'tabela-notas' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Matéria' }), h('th', { text: 'Q' }), h('th', { text: 'Valor/q' }), h('th', { text: 'Pontos do bloco' }), h('th', { text: 'Seu aproveitamento' }), h('th', { text: 'Nota esperada' }))),
        h('tbody', {}, ...linhasProjecao.map((l) => h('tr', { class: l.temDados ? '' : 'linha-sem-dados' },
          h('td', {}, h('span', { class: 'ponto-cor', style: { background: corMateria(l.materia) } }), materiaNome(l.materia)),
          h('td', { text: String(l.quantidade) }),
          h('td', { text: '0,2' }),
          h('td', { text: l.pontos.toFixed(1) }),
          h('td', {}, h('div', { class: 'mini-barra' }, h('div', { class: 'mini-fill', style: { width: `${l.taxa}%`, background: corTaxa(l.taxa) } }), h('span', { text: `${l.taxa}%${l.temDados ? '' : ' *'}` }))),
          h('td', {}, badge(l.esperado.toFixed(2), l.esperado / l.pontos >= 0.6 ? 'verde' : 'vermelho'))))),
        h('tfoot', {}, h('tr', {}, h('th', { text: 'TOTAL' }), h('th', { text: String(estrutura.reduce((s, b) => s + b.quantidade, 0)) }), h('th', { text: '—' }), h('th', { text: notaMaxima.toFixed(1) }), h('th', { text: '—' }), h('th', { text: projetada.toFixed(2) })))),
      h('p', { class: 'nota', text: '* matérias sem histórico suficiente — responda ao menos 5 questões de cada para a projeção ficar confiável.' }))));

  /* ---- desempenho por matéria ---- */
  raiz.appendChild(card('Desempenho por matéria',
    h('div', { class: 'materias-grid' }, ...[...comDados.sort((a, b) => a.taxa - b.taxa), ...porMateria.filter((m) => !m.tentativas)].map((m) => h('div', { class: 'materia-linha' },
      h('div', { class: 'materia-nome' }, chipMateria(materiaNome(m.materia), corMateria(m.materia), { onclick: () => { location.hash = `#/curriculo/${m.materia}`; } })),
      h('div', { class: 'materia-barra' }, barra(m.taxa, { cor: m.tentativas ? corTaxa(m.taxa) : 'var(--cinza)', altura: 7 })),
      h('div', { class: 'materia-numeros' },
        h('span', { text: m.tentativas ? `${m.taxa}%` : 'sem dados' }),
        h('span', { class: 'detalhe', text: `${m.acertos}/${m.tentativas}` })),
      h('div', { class: 'materia-acao' }, botao('Treinar', () => { location.hash = `#/treino/${m.materia}`; }, { variante: 'fantasma' })))))));

  /* ---- atividade ---- */
  raiz.appendChild(h('div', { class: 'duas-colunas' },
    card('Atividade (30 dias)', graficoBarras(atividadeNosUltimosDias(30), { altura: 90 })),
    card('Cobertura do programa', montarCobertura(e))));

  /* ---- simulados ---- */
  if (e.simulados.length) {
    raiz.appendChild(card('Evolução nos simulados',
      h('div', { class: 'evolucao' }, ...e.simulados.slice(0, 10).reverse().map((s) => {
        const n = s.notaMaxima ? round((s.nota / s.notaMaxima) * 10, 2) : 0;
        return h('div', { class: 'evolucao-item' },
          h('span', { text: fmtDateBR(s.finalizadoEm.slice(0, 10)) }),
          h('span', { class: 'evolucao-modelo', text: s.modeloNome || s.modelo }),
          barra((n / 10) * 100, { cor: corNota(n), altura: 8 }),
          badge(n.toFixed(2), n >= 6 ? 'verde' : 'vermelho'));
      }))));
  }

  /* ---- diagnóstico ---- */
  const dias = diffDays(e.perfil.dataProva || dataDaProva(), todayKey());
  const fracos = comDados.filter((m) => m.tentativas >= 5).sort((a, b) => a.taxa - b.taxa).slice(0, 5).map((m) => materiaNome(m.materia));
  raiz.appendChild(card('Diagnóstico automático', markdown(diagnosticoOffline(comDados.map((m) => ({ ...m, materia: materiaNome(m.materia) })), dias, e.perfil.horasPorDia))));

  return raiz;
}

function montarCobertura(e) {
  const porMateria = listarMaterias();
  const corpo = h('div', { class: 'materias-grid' });
  for (const m of porMateria) {
    const tops = dados.topicos.filter((t) => t.materia === m.id);
    const ini = tops.filter((t) => (e.topicos[t.id]?.status || 'novo') !== 'novo').length;
    corpo.appendChild(h('div', { class: 'materia-linha' },
      h('div', { class: 'materia-nome' }, chipMateria(m.nome, m.cor)),
      h('div', { class: 'materia-barra' }, barra((ini / Math.max(1, tops.length)) * 100, { cor: m.cor, altura: 7 })),
      h('div', { class: 'materia-numeros' }, h('span', { text: `${ini}/${tops.length}` }), h('span', { class: 'detalhe', text: 'tópicos' }))));
  }
  return corpo;
}

function corTaxa(t) { return t >= 70 ? 'var(--verde)' : t >= 50 ? 'var(--amarelo)' : 'var(--vermelho)'; }
function corNota(n) { return n >= 6 ? 'var(--verde)' : 'var(--vermelho)'; }
