/* views/dashboard.js — tela inicial: contagem regressiva, diagnóstico, atalhos e plano do dia. */

import { h, todayKey, fmtDateBR, diffDays, fmtDuracao } from '../util.js';
import { get, statsPorMateria, streakAtual, atividadeNosUltimosDias, minutosEstimadosHoje, cadernoErros } from '../store.js';
import { dados, materiaNome, dataDaProva, ehCritico } from '../data.js';
import { vencidos, progresso } from '../srs.js';
import { recomendacaoDeHoje } from '../planner.js';
import { cabecalho, card, stat, badge, barra, botao, chipMateria, contadorRegressivo, graficoBarras } from '../components.js';

export default function viewDashboard() {
  const estado = get();
  const prova = estado.perfil.dataProva || dataDaProva();
  const dias = diffDays(prova, todayKey());

  const sq = statsQuestoesLocal(estado);
  const porMateria = statsPorMateria(dados.questoes);
  const erradas = cadernoErros();
  const idsCards = dados.flashcards.map((c) => c.id);
  const cardsVencidos = vencidos(estado.cards, idsCards);
  const progCards = progresso(estado.cards, idsCards);
  const streak = streakAtual();
  const serie = atividadeNosUltimosDias(14);
  const minutosHoje = minutosEstimadosHoje();

  const rec = recomendacaoDeHoje({ plano: estado.plano, estado, dataProva: prova });

  const raiz = h('div', { class: 'pagina' });

  raiz.appendChild(cabecalho(
    estado.perfil.nome ? `Olá, ${estado.perfil.nome.split(' ')[0]}!` : 'Painel de estudo',
    `${estado.perfil.cargo} · ${estado.perfil.edital}`,
    [botao('Plano de estudo', () => { location.hash = '#/plano'; }, { variante: 'secundario', icone: '🗓' })],
  ));

  /* ---- faixa superior ---- */
  const faixa = h('div', { class: 'faixa' });
  faixa.appendChild(contadorRegressivo(prova));
  faixa.appendChild(h('div', { class: 'faixa-stats' },
    stat(`${sq.taxa}%`, 'acerto geral', { cor: sq.taxa >= 60 ? 'var(--verde)' : sq.taxa >= 40 ? 'var(--amarelo)' : 'var(--vermelho)', dica: `${sq.acertos} acertos em ${sq.tentativas} tentativas` }),
    stat(sq.respondidas, 'questões vistas', { dica: `de ${dados.questoes.length} no banco` }),
    stat(cardsVencidos.length, 'cards vencidos', { cor: cardsVencidos.length ? 'var(--laranja)' : null }),
    stat(erradas.length, 'no caderno de erros', { cor: erradas.length ? 'var(--vermelho)' : null }),
    stat(`${streak}🔥`, 'dias seguidos'),
    stat(fmtDuracao(minutosHoje), 'estudado hoje'),
  ));
  raiz.appendChild(faixa);

  /* ---- alerta crítico ---- */
  const criticos = (dados.concurso?.cronograma || []).filter((c) => ehCritico(c) && diffDays(c.data, todayKey()) >= 0).slice(0, 4);
  if (criticos.length) {
    raiz.appendChild(card('Datas críticas do edital',
      h('ul', { class: 'lista-datas' }, ...criticos.map((c) => h('li', {},
        h('strong', { text: fmtDateBR(c.data) }),
        h('span', { text: ` ${c.evento}` }),
        h('em', { text: diffDays(c.data, todayKey()) === 0 ? ' (hoje!)' : ` (em ${diffDays(c.data, todayKey())} dias)` })))),
      { classe: 'card-alerta' }));
  }

  /* ---- o que fazer agora ---- */
  const agora = h('div', { class: 'acoes-rapidas' });
  agora.appendChild(acaoRapida('🎯', 'Simulado espelho da prova', '50 questões · 3h · idêntico à prova de 13/12/2026', '#/simulados/sim-prova-real'));
  agora.appendChild(acaoRapida('📝', 'Treinar questões', `${dados.questoes.length} questões comentadas nas 15 matérias`, '#/questoes'));
  agora.appendChild(acaoRapida('🃏', `Flashcards${cardsVencidos.length ? ` (${cardsVencidos.length} vencidos)` : ''}`, `${dados.flashcards.length} cartões · repetição espaçada`, '#/flashcards'));
  agora.appendChild(acaoRapida('📖', 'Resumos', `${dados.resumos.length} resumos curados por matéria`, '#/resumos'));
  agora.appendChild(acaoRapida('🚫', `Caderno de erros${erradas.length ? ` (${erradas.length})` : ''}`, 'Refaça só o que você errou', '#/erros'));
  agora.appendChild(acaoRapida('🤖', 'Tutor IA', 'Explique, gere questões e tire dúvidas', '#/tutor'));
  raiz.appendChild(card('O que fazer agora', h('div', { class: 'grade-acoes' }, agora)));

  /* ---- sugestões do planejador ---- */
  if (rec.sugestoes.length) {
    raiz.appendChild(card('Recomendado para hoje',
      h('ul', { class: 'lista-sugestoes' }, ...rec.sugestoes.map((s) => h('li', {},
        h('div', { class: 'sugestao-txt' },
          h('strong', { text: s.titulo }),
          s.detalhe ? h('span', { text: s.detalhe }) : null),
        h('div', { class: 'sugestao-acao' },
          s.minutos ? badge(fmtDuracao(s.minutos), 'neutro') : null,
          botao('Ir', () => { location.hash = s.rota; }, { variante: 'fantasma' })),
      )))));
  }

  /* ---- desempenho por matéria ---- */
  const corpoMaterias = h('div', { class: 'materias-grid' });
  const comDados = porMateria.filter((m) => m.tentativas > 0);
  const semDados = porMateria.filter((m) => m.tentativas === 0);
  for (const m of [...comDados, ...semDados].slice(0, 15)) {
    const nome = materiaNome(m.materia);
    corpoMaterias.appendChild(h('div', { class: 'materia-linha' },
      h('div', { class: 'materia-nome' },
        chipMateria(nome, corDa(m.materia), { onclick: () => { location.hash = `#/curriculo/${m.materia}`; } })),
      h('div', { class: 'materia-barra' }, barra(m.taxa, { cor: corTaxa(m.taxa), altura: 7 })),
      h('div', { class: 'materia-numeros' },
        h('span', { text: m.tentativas ? `${m.taxa}%` : 'sem dados' }),
        h('span', { class: 'detalhe', text: `${m.acertos}/${m.tentativas}` })),
      h('div', { class: 'materia-acao' }, botao('Treinar', () => { location.hash = `#/treino/${m.materia}`; }, { variante: 'fantasma' })),
    ));
  }
  raiz.appendChild(card('Desempenho por matéria', corpoMaterias, {
    classe: 'card-materias',
    acoes: [botao('Ver tudo', () => { location.hash = '#/estatisticas'; }, { variante: 'fantasma' })],
  }));

  /* ---- linha inferior ---- */
  const inferior = h('div', { class: 'duas-colunas' });
  inferior.appendChild(card('Atividade nos últimos 14 dias', graficoBarras(serie, { altura: 80 })));

  const metaSemana = estado.metas.minutosSemana || 600;
  const minutosSemana = serie.slice(7).reduce((s, d) => s + d.total * 1.2, 0);
  inferior.appendChild(card('Meta semanal',
    h('div', {},
      barra(Math.min(100, (minutosSemana / metaSemana) * 100), { rotulo: `${Math.round(minutosSemana)} de ${metaSemana} min`, cor: 'var(--accent)' }),
      h('p', { class: 'nota', text: 'Ajuste a meta em Configurações. A contagem é estimada a partir das questões respondidas.' }),
      h('div', { class: 'resumo-cards' },
        stat(progCards.novos, 'cards novos'),
        stat(progCards.emDia, 'em dia'),
        stat(progCards.vencidos, 'vencidos', { cor: 'var(--laranja)' }),
        stat(progCards.dominados, 'dominados', { cor: 'var(--verde)' })))));
  raiz.appendChild(inferior);

  if (dados.erros.length) {
    raiz.appendChild(card('Avisos de carregamento de dados',
      h('ul', { class: 'lista-erros' }, ...dados.erros.map((e) => h('li', { text: e }))),
      { classe: 'card-alerta' }));
  }

  return raiz;
}

function statsQuestoesLocal(estado) {
  const todos = Object.values(estado.questoes);
  let acertos = 0; let tentativas = 0; let vistas = 0;
  for (const q of todos) {
    if ((q.acertos || 0) + (q.erros || 0) > 0) vistas += 1;
    acertos += q.acertos || 0;
    tentativas += (q.acertos || 0) + (q.erros || 0);
  }
  return { respondidas: vistas, tentativas, acertos, taxa: tentativas ? Math.round((acertos / tentativas) * 1000) / 10 : 0 };
}

function acaoRapida(icone, titulo, desc, rota) {
  return h('a', { class: 'acao-rapida', href: `#${rota}` },
    h('span', { class: 'acao-icone', text: icone }),
    h('div', {}, h('strong', { text: titulo }), h('span', { class: 'acao-desc', text: desc })));
}

function corDa(materia) { return dados.materias.find((m) => m.id === materia)?.cor || '#6366f1'; }
function corTaxa(t) { return t >= 70 ? 'var(--verde)' : t >= 50 ? 'var(--amarelo)' : 'var(--vermelho)'; }
