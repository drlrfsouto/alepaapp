/* views/simulados.js — montagem e execução de simulados com nota ponderada. */

import { h, shuffle, fmtDateTimeBR, fmtDuracao, round, todayKey } from '../util.js';
import { get, set, cadernoErros } from '../store.js';
import { dados, materiaNome, corMateria } from '../data.js';
import { cabecalho, card, badge, botao, barra, stat, vazio, toast, markdown, modal } from '../components.js';
import { criarResolver } from './resolver.js';

const modelos = () => dados.simulados?.simulados || [];

export function viewSimulados() {
  const raiz = h('div', { class: 'pagina' });
  raiz.appendChild(cabecalho('Simulados',
    'Monte a prova espelho do edital ou treine blocos isolados. A nota usa o peso real de cada matéria.',
    [botao('Histórico', () => { location.hash = '#/simulados/historico'; }, { variante: 'secundario', icone: '📊' })]));

  const cfg = dados.simulados?.config || {};
  raiz.appendChild(card('Regras da prova objetiva',
    h('div', {},
      h('ul', { class: 'lista-simples' },
        h('li', {}, h('strong', { text: '13/12/2026, manhã, 3 horas' }), ' — Belém/PA'),
        h('li', {}, '50 questões objetivas, 5 alternativas (A a E), 0,2 ponto por questão'),
        h('li', {}, h('strong', { text: 'Aprovação: ' }), `mínimo ${cfg.notaMinima ?? 6.0} pontos E classificação dentro de ${cfg.regraCorte || '4× o número de vagas'}`),
        h('li', {}, 'Cada questão vale 0,2 ponto — blocos: Português 2,0 · Legislação e Ética 2,0 · Informática 1,0 · Raciocínio Lógico 1,0 · Específicos 4,0 (20 questões)'),
        h('li', {}, 'Desempate: idade → Específicos → Legislação e Ética → Português → RL → Informática')))));

  const grade = h('div', { class: 'grade-simulados' });
  for (const m of modelos()) {
    const jaFez = get().simulados.filter((s) => s.modelo === m.id);
    const melhor = jaFez.length ? Math.max(...jaFez.map((s) => s.nota)) : null;
    grade.appendChild(h('article', { class: `simulado-card ${m.tipo === 'espelho' ? 'simulado-destaque' : ''}` },
      h('div', { class: 'simulado-topo' },
        badge(m.tipo, m.tipo === 'espelho' ? 'laranja' : 'azul'),
        m.duracaoMin ? badge(fmtDuracao(m.duracaoMin), 'neutro') : null,
        m.totalQuestoes ? badge(`${m.totalQuestoes} questões`, 'neutro') : null),
      h('h3', { text: m.nome }),
      h('p', { class: 'simulado-desc', text: m.descricao }),
      melhor !== null ? h('p', { class: 'simulado-melhor' }, h('strong', { text: `Melhor nota: ${melhor.toFixed(1)}` }), h('span', { text: ` · ${jaFez.length} tentativa(s)` })) : null,
      h('div', { class: 'simulado-acoes' },
        botao(m.tipo === 'espelho' ? '🎯 Iniciar simulado' : 'Iniciar', () => iniciar(m), { variante: m.tipo === 'espelho' ? 'primario' : 'secundario' }),
        m.estrutura !== 'usuario' && m.estrutura !== 'dinamica' ? botao('Ver estrutura', () => mostrarEstrutura(m), { variante: 'fantasma' }) : null),
    ));
  }
  raiz.appendChild(card('Modelos disponíveis', grade));

  if (dados.questoes.length < 50) {
    raiz.appendChild(card('⚠ Banco em construção',
      h('p', { text: `O banco tem ${dados.questoes.length} questões curadas. O simulado espelho pede 50. Quando faltar questão em uma matéria, o app usa todas as disponíveis e avisa — o objetivo é treinar no formato real desde já, e o banco cresce com o gerador de conteúdo (tools/generate-content.mjs) e com as questões criadas pelo Tutor IA.` }),
      { classe: 'card-alerta' }));
  }
  return raiz;
}

function mostrarEstrutura(m) {
  const linhas = (m.estrutura || []).map((e) =>
    `| ${materiaNome(e.materia)} | ${e.quantidade} | 0,2 | ${(e.pontos ?? e.quantidade * VALOR_QUESTAO).toFixed(1)} |`);
  const md = `| Matéria | Questões | Valor/questão | Pontos do bloco |\n|---|---|---|---|\n${linhas.join('\n')}`;
  modal({ titulo: m.nome, corpo: markdown(md), largura: '640px' });
}

/** Monta a lista de questões de um modelo. */
export function montarQuestoes(modelo, estado) {
  const avisos = [];
  let questoes = [];

  if (modelo.tipo === 'parametrizado') return { questoes, avisos };

  if (Array.isArray(modelo.estrutura)) {
    for (const bloco of modelo.estrutura) {
      const disp = dados.questoes.filter((q) => q.materia === bloco.materia);
      const usadas = new Set(questoes.map((q) => q.id));
      const pool = shuffle(disp.filter((q) => !usadas.has(q.id)));
      const pegar = pool.slice(0, bloco.quantidade);
      if (pegar.length < bloco.quantidade) {
        avisos.push(`${materiaNome(bloco.materia)}: só há ${pegar.length} de ${bloco.quantidade} questões no banco.`);
      }
      questoes.push(...pegar.map((q) => ({ ...q, _blocoProva: bloco.blocoProva || null })));
    }
  } else if (modelo.estrutura === 'dinamica' || modelo.tipo === 'srs' || modelo.tipo === 'erros') {
    // prioriza vencidos no SRS + erros do usuário
    const idsErro = new Set(cadernoErros());
    const erradas = shuffle(dados.questoes.filter((q) => idsErro.has(q.id)));
    const vencidas = shuffle(dados.questoes.filter((q) => {
      const c = estado.cards[`q:${q.id}`];
      return c && c.proxima && c.proxima <= todayKey();
    }));
    const novas = shuffle(dados.questoes.filter((q) => !estado.questoes[q.id]));
    const n = modelo.totalQuestoes || 10;
    questoes = [...erradas, ...vencidas, ...novas].slice(0, n);
    if (questoes.length < n) avisos.push(`Só foi possível montar ${questoes.length} de ${n} questões.`);
  }
  return { questoes, avisos };
}

const VALOR_QUESTAO = 0.2;

/** Pontos que a disciplina representa na prova espelho (quantidade × 0,2). */
function pontosDaMateria(materia) {
  for (const m of modelos()) {
    if (!Array.isArray(m.estrutura)) continue;
    const b = m.estrutura.find((e) => e.materia === materia);
    if (b) return b.pontos ?? (b.quantidade ?? 0) * VALOR_QUESTAO;
  }
  return 0;
}

export function iniciar(modelo) {
  const estado = get();
  if (modelo.tipo === 'parametrizado') return abrirParametrizado(modelo);
  const { questoes, avisos } = montarQuestoes(modelo, estado);
  if (avisos.length) toast(avisos[0], 'aviso', 5000);
  if (!questoes.length) { toast('Sem questões para este modelo.', 'erro'); return; }

  const idSimulado = `sim-${Date.now().toString(36)}`;
  const alvo = document.getElementById('app');
  alvo.replaceChildren(criarResolver({
    questoes,
    modo: 'simulado',
    titulo: modelo.nome,
    cronometrar: true,
    limiteMin: modelo.duracaoMin || 0,
    aoResponder: () => {},
    aoConcluir: (r) => concluir(modelo, idSimulado, r, questoes),
  }));
  window.scrollTo(0, 0);
}

function abrirParametrizado(modelo) {
  const materias = dados.materias.filter((m) => dados.questoes.some((q) => q.materia === m.id));
  let sel = materias[0]?.id;
  let qtd = 5;
  const nota = h('p', { class: 'nota' });
  const corpo = h('div', { class: 'form' },
    h('label', {}, h('span', { text: 'Matéria' }),
      h('select', { class: 'campo', onchange: (e) => { sel = e.target.value; atualizar(); } },
        ...materias.map((m) => h('option', { value: m.id, text: `${m.nome} (${dados.questoes.filter((q) => q.materia === m.id).length})` })))),
    h('label', {}, h('span', { text: 'Quantidade de questões' }),
      h('input', { class: 'campo', type: 'number', min: 1, max: 40, value: qtd, oninput: (e) => { qtd = Number(e.target.value) || 1; atualizar(); } })),
    nota,
  );
  function atualizar() {
    const max = dados.questoes.filter((q) => q.materia === sel).length;
    nota.textContent = `Disponíveis nesta matéria: ${max}. Ritmo de prova: ~1,5 min por questão.`;
  }
  atualizar();

  const m = modal({
    titulo: modelo.nome,
    corpo,
    acoes: [botao('Iniciar', () => {
      const qs = shuffle(dados.questoes.filter((q) => q.materia === sel)).slice(0, Math.min(qtd, 40))
        ;
      m.fechar();
      iniciarLista(modelo, qs, `Simulado — ${materiaNome(sel)}`);
    }, { variante: 'primario' })],
  });
}

function iniciarLista(modelo, questoes, titulo) {
  if (!questoes.length) { toast('Sem questões.', 'erro'); return; }
  const idSimulado = `sim-${Date.now().toString(36)}`;
  const alvo = document.getElementById('app');
  alvo.replaceChildren(criarResolver({
    questoes,
    modo: 'simulado',
    titulo,
    cronometrar: true,
    limiteMin: Math.max(5, Math.round(questoes.length * 1.5)),
    aoConcluir: (r) => concluir(modelo, idSimulado, r, questoes),
  }));
  window.scrollTo(0, 0);
}

function concluir(modelo, idSimulado, resultado, questoes) {
  const porMateria = new Map();
  for (const q of questoes) {
    const letra = resultado.respostas.find((r) => r.qid === q.id)?.letra;
    if (!porMateria.has(q.materia)) porMateria.set(q.materia, { materia: q.materia, pontosDisponiveis: pontosDaMateria(q.materia), total: 0, acertos: 0 });
    const o = porMateria.get(q.materia);
    o.total += 1;
    if (letra && letra === q.gabarito) o.acertos += 1;
  }

  // Pontuação no formato do edital: cada questão vale 0,2 ponto (uniforme).
  let nota = 0;
  let maximo = 0;
  for (const o of porMateria.values()) {
    nota += o.acertos * VALOR_QUESTAO;
    maximo += o.total * VALOR_QUESTAO;
  }
  nota = round(nota, 2);
  maximo = round(maximo, 2);

  const registro = {
    id: idSimulado,
    modelo: modelo.id,
    modeloNome: modelo.nome,
    iniciadoEm: new Date(Date.now() - resultado.duracaoMin * 60000).toISOString(),
    finalizadoEm: new Date().toISOString(),
    respostas: Object.fromEntries(resultado.respostas.map((r) => [r.qid, r.letra])),
    nota,
    notaMaxima: maximo,
    acertos: resultado.acertos,
    total: resultado.total,
    duracaoMin: round(resultado.duracaoMin, 1),
    porMateria: [...porMateria.values()].map((o) => ({ ...o, taxa: round((o.acertos / o.total) * 100, 1), pontos: round(o.acertos * VALOR_QUESTAO, 2), pontosMax: round(o.total * VALOR_QUESTAO, 2) })),
  };

  set((s) => { s.simulados.unshift(registro); if (s.simulados.length > 60) s.simulados.length = 60; },
    { log: { tipo: 'simulado', detalhe: { modelo: modelo.id, nota, duracaoMin: registro.duracaoMin } } });

  return montarResultado(registro, questoes, resultado);
}

function montarResultado(reg, questoes, resultado) {
  const notaMinima = dados.simulados?.config?.notaMinima ?? 6.0;
  // converte a nota do simulado para a escala de 10 pontos da prova real
  const notaEscala10 = reg.notaMaxima ? round((reg.nota / reg.notaMaxima) * 10, 2) : 0;
  const aprovado = notaEscala10 >= notaMinima;

  const box = h('div', { class: 'resultado' });
  box.appendChild(h('h2', { text: resultado.cancelado ? 'Simulado encerrado antes do fim' : 'Resultado do simulado' }));
  box.appendChild(h('div', { class: `nota-final ${aprovado ? 'nota-ok' : 'nota-baixa'}` },
    h('div', { class: 'nota-valor' }, h('strong', { text: notaEscala10.toFixed(2) }), h('span', { text: 'de 10,0' })),
    h('div', { class: 'nota-veredito' },
      h('strong', { text: aprovado ? '✓ Acima da nota de corte' : '✗ Abaixo da nota de corte' }),
      h('span', { text: `Corte do edital: ${notaMinima.toFixed(1)} pontos + classificação em até 4× as vagas` }))));

  box.appendChild(h('div', { class: 'resultado-numeros' },
    h('div', {}, h('strong', { text: `${reg.acertos}/${reg.total}` }), h('span', { text: 'acertos' })),
    h('div', {}, h('strong', { text: fmtDuracao(reg.duracaoMin) }), h('span', { text: 'duração' })),
    h('div', {}, h('strong', { text: `${Math.round((reg.acertos / reg.total) * 100)}%` }), h('span', { text: 'aproveitamento' })),
    h('div', {}, h('strong', { text: reg.nota.toFixed(2) }), h('span', { text: `de ${reg.notaMaxima.toFixed(2)} pts ponderados` }))));

  const tabela = h('table', { class: 'tabela-notas' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Matéria' }), h('th', { text: 'Acertos' }), h('th', { text: 'Vale' }), h('th', { text: 'Pontos' }), h('th', { text: 'Aproveitamento' }))),
    h('tbody', {}, ...reg.porMateria.map((o) => h('tr', {},
      h('td', {}, h('span', { class: 'ponto-cor', style: { background: corMateria(o.materia) } }), materiaNome(o.materia)),
      h('td', { text: `${o.acertos}/${o.total}` }),
      h('td', { text: `${(o.pontosMax ?? o.total * VALOR_QUESTAO).toFixed(1)} pts` }),
      h('td', { text: `${o.pontos.toFixed(2)} / ${(o.pontosMax ?? o.total * VALOR_QUESTAO).toFixed(1)}` }),
      h('td', {}, h('div', { class: 'mini-barra' }, h('div', { class: 'mini-fill', style: { width: `${o.taxa}%`, background: corTaxa(o.taxa) } }), h('span', { text: `${o.taxa}%` })))))));
  box.appendChild(card('Desempenho por matéria', tabela));

  const piores = [...reg.porMateria].sort((a, b) => a.taxa - b.taxa).slice(0, 3);
  box.appendChild(card('Onde reforçar',
    h('div', {},
      h('ul', { class: 'lista-simples' }, ...piores.map((o) => h('li', {},
        h('strong', { text: materiaNome(o.materia) }),
        h('span', { text: ` — ${o.taxa}% de acerto. ` }),
        botao('treinar agora', () => { location.hash = `#/treino/${o.materia}`; }, { variante: 'fantasma' })))),
      h('p', { class: 'nota', text: 'Lembre: Conhecimentos Específicos concentram 4,0 dos 10,0 pontos (20 questões × 0,2) e são o primeiro critério de desempate depois da idade.' }))));

  const detalhes = h('div', { class: 'resultado-lista' });
  for (const q of questoes) {
    const letra = resultado.respostas.find((r) => r.qid === q.id)?.letra;
    const acertou = letra && letra === q.gabarito;
    detalhes.appendChild(h('details', { class: `item-resultado ${acertou ? 'ok' : letra ? 'erro' : 'branco'}` },
      h('summary', {},
        h('span', { class: 'marca', text: letra ? (acertou ? '✓' : '✗') : '—' }),
        h('span', { class: 'enunciado', text: q.enunciado.slice(0, 130) + (q.enunciado.length > 130 ? '…' : '') }),
        h('span', { class: 'gab', text: `gabarito ${q.gabarito} · você ${letra || 'em branco'}` })),
      h('div', { class: 'item-corpo' },
        markdown(q.comentario || ''),
        q.mnemonico ? h('p', { class: 'linha-mnemonico', text: `🧠 ${q.mnemonico}` }) : null,
        botao('Refazer só esta', () => iniciarLista({ id: 'avulsa', nome: 'Questão avulsa' }, [q], 'Questão avulsa'), { variante: 'fantasma' }))));
  }
  box.appendChild(card('Correção comentada', detalhes));

  box.appendChild(h('div', { class: 'resultado-acoes' },
    botao('Voltar aos simulados', () => { location.hash = '#/simulados'; }, { variante: 'secundario' }),
    botao('Painel', () => { location.hash = '#/'; }, { variante: 'fantasma' }),
    botao('Refazer este simulado', () => iniciar(modelos().find((m) => m.id === reg.modelo) || modelos()[0]), { variante: 'primario' })));
  return box;
}

export function viewHistorico() {
  const historico = get().simulados;
  const raiz = h('div', { class: 'pagina' });
  raiz.appendChild(cabecalho('Histórico de simulados', `${historico.length} tentativa(s) registrada(s)`,
    [botao('Novo simulado', () => { location.hash = '#/simulados'; }, { variante: 'primario' })]));

  if (!historico.length) {
    raiz.appendChild(vazio('Você ainda não concluiu nenhum simulado.', botao('Começar agora', () => { location.hash = '#/simulados'; }, { variante: 'primario' })));
    return raiz;
  }

  const melhor = Math.max(...historico.map((s) => (s.notaMaxima ? (s.nota / s.notaMaxima) * 10 : 0)));
  const ultimo = historico[0];
  const ultimoNota = ultimo.notaMaxima ? round((ultimo.nota / ultimo.notaMaxima) * 10, 2) : 0;
  raiz.appendChild(h('div', { class: 'faixa-stats' },
    stat(ultimoNota.toFixed(2), 'última nota (0-10)', { cor: corNota(ultimoNota) }),
    stat(melhor.toFixed(2), 'melhor nota (0-10)', { cor: corNota(melhor) }),
    stat(historico.length, 'simulados feitos'),
    stat(fmtDuracao(historico.reduce((s, x) => s + (x.duracaoMin || 0), 0)), 'tempo total')));

  raiz.appendChild(card('Tentativas',
    h('table', { class: 'tabela-notas' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Data' }), h('th', { text: 'Modelo' }), h('th', { text: 'Nota' }), h('th', { text: 'Acertos' }), h('th', { text: 'Duração' }), h('th', { text: '' }))),
      h('tbody', {}, ...historico.map((s) => {
        const n = s.notaMaxima ? round((s.nota / s.notaMaxima) * 10, 2) : 0;
        return h('tr', {},
          h('td', { text: fmtDateTimeBR(s.finalizadoEm) }),
          h('td', { text: s.modeloNome || s.modelo }),
          h('td', {}, badge(n.toFixed(2), n >= 6 ? 'verde' : 'vermelho')),
          h('td', { text: `${s.acertos}/${s.total}` }),
          h('td', { text: fmtDuracao(s.duracaoMin) }),
          h('td', {}, botao('detalhes', () => mostrarDetalhes(s), { variante: 'fantasma' })));
      })))));
  return raiz;
}

function mostrarDetalhes(s) {
  const linhas = (s.porMateria || []).map((o) =>
    `| ${materiaNome(o.materia)} | ${o.acertos}/${o.total} | ${o.taxa}% | ${o.pontos.toFixed(2)} |`).join('\n');
  const texto = `**Modelo:** ${s.modeloNome || s.modelo}
**Data:** ${fmtDateTimeBR(s.finalizadoEm)}
**Nota:** ${s.nota.toFixed(2)} de ${s.notaMaxima.toFixed(2)}
**Duração:** ${fmtDuracao(s.duracaoMin)}

| Matéria | Acertos | Aproveitamento | Pontos |
|---|---|---|---|
${linhas}`;
  modal({ titulo: 'Detalhes do simulado', corpo: markdown(texto), largura: '700px' });
}

function corTaxa(t) { return t >= 70 ? 'var(--verde)' : t >= 50 ? 'var(--amarelo)' : 'var(--vermelho)'; }
function corNota(n) { return n >= 6 ? 'var(--verde)' : 'var(--vermelho)'; }
