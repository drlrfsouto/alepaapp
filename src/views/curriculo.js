/* views/curriculo.js — Anexo II completo (matérias/tópicos) + cronograma do edital. */

import { h, todayKey, fmtDateBR, diffDays, normalizar, debounce, sortBy } from '../util.js';
import { get, set } from '../store.js';
import { dados, materiaNome, corMateria, listarMaterias, questoesPorMateria, resumosPorMateria, cardsPorMateria, estruturaProva, faseObjetiva, ehCritico, valorQuestao } from '../data.js';
import { cabecalho, card, badge, botao, barra, stat, chipMateria, vazio, toast, seloPrioridade, markdown } from '../components.js';

const STATUS = [
  { id: 'novo', rot: 'Não iniciado', cor: 'neutro' },
  { id: 'estudando', rot: 'Em estudo', cor: 'amarelo' },
  { id: 'revisando', rot: 'Em revisão', cor: 'azul' },
  { id: 'dominado', rot: 'Dominado', cor: 'verde' },
];

export function viewCurriculo() {
  const estado = get();
  const raiz = h('div', { class: 'pagina' });

  raiz.appendChild(cabecalho('Conteúdo programático (Anexo II)',
    `${dados.topicos.length} tópicos · ${dados.materias.length} matérias · Edital nº 001/2026 com a retificação nº 002/2026`,
    [botao('Cronograma do edital', () => { location.hash = '#/cronograma'; }, { variante: 'secundario', icone: '📅' })]));

  const cobertos = dados.topicos.filter((t) => estado.topicos[t.id]?.status && estado.topicos[t.id].status !== 'novo').length;
  raiz.appendChild(h('div', { class: 'faixa-stats' },
    stat(dados.topicos.length, 'tópicos oficiais'),
    stat(cobertos, 'já iniciados', { cor: 'var(--verde)' }),
    stat(dados.topicos.filter((t) => estado.topicos[t.id]?.status === 'dominado').length, 'dominados', { cor: 'var(--azul)' }),
    stat(`${Math.round((cobertos / dados.topicos.length) * 100)}%`, 'cobertura do programa')));
  raiz.appendChild(barra((cobertos / dados.topicos.length) * 100, { rotulo: 'Progresso no Anexo II', cor: 'var(--verde)', altura: 10 }));

  const grid = h('div', { class: 'grade-materias' });
  for (const m of listarMaterias()) {
    const tops = dados.topicos.filter((t) => t.materia === m.id);
    const dom = tops.filter((t) => estado.topicos[t.id]?.status === 'dominado').length;
    const ini = tops.filter((t) => estado.topicos[t.id]?.status && estado.topicos[t.id].status !== 'novo').length;
    grid.appendChild(h('article', { class: 'materia-card', style: { '--cor': m.cor } },
      h('div', { class: 'materia-card-topo' },
        badge(m.bloco === 'basica' ? 'Conhecimentos Básicos' : 'Conhecimentos Específicos', m.bloco === 'basica' ? 'azul' : 'laranja'),
        badge(`${tops.length} tópicos`, 'neutro')),
      h('h3', { text: m.nome }),
      m.sigla ? h('code', { class: 'materia-sigla', text: m.sigla }) : null,
      barra((ini / Math.max(1, tops.length)) * 100, { cor: m.cor, altura: 6 }),
      h('p', { class: 'materia-card-info', text: `${ini}/${tops.length} iniciados · ${dom} dominados` }),
      h('div', { class: 'materia-card-numeros' },
        stat(m.nQuestoes, 'questões'), stat(m.nResumos, 'resumos'), stat(m.nCards, 'cards')),
      h('div', { class: 'materia-card-acoes' },
        botao('Ver tópicos', () => { location.hash = `#/curriculo/${m.id}`; }, { variante: 'secundario' }),
        m.nQuestoes ? botao('Treinar', () => { location.hash = `#/treino/${m.id}`; }, { variante: 'primario' }) : null,
      )));
  }
  raiz.appendChild(card('Matérias', grid));

  const c = dados.concurso;
  const fase = faseObjetiva();
  const blocos = estruturaProva();
  if (c && blocos.length) {
    raiz.appendChild(card('Estrutura da prova objetiva',
      h('div', {},
        h('p', { class: 'nota', text: `Aplicação: ${fmtDateBR(fase.data)} · turno da ${String(fase.turno || 'manhã').toLowerCase()} · ${Math.round((fase.duracaoMinutos || 180) / 60)} horas · Belém/PA · cada questão vale ${String(valorQuestao()).replace('.', ',')} ponto` }),
        h('table', { class: 'tabela-notas' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Disciplina' }), h('th', { text: 'Questões' }), h('th', { text: 'Valor/questão' }), h('th', { text: 'Pontos do bloco' }))),
          h('tbody', {}, ...blocos.map((d) => h('tr', {},
            h('td', { text: d.disciplina || d.id }),
            h('td', { text: String(d.questoes) }),
            h('td', { text: String(valorQuestao()).replace('.', ',') }),
            h('td', { text: String(d.pontos ?? (d.questoes * valorQuestao()).toFixed(1)) })))),
          h('tfoot', {}, h('tr', {},
            h('th', { text: 'Total' }),
            h('th', { text: String(blocos.reduce((s2, b) => s2 + b.questoes, 0)) }),
            h('th', { text: '—' }),
            h('th', { text: String(fase.pontuacaoMaxima || 10) }))),
        h('p', { class: 'nota', style: { marginTop: '.5rem' }, text: `Aprovação: mínimo ${fase.notaMinimaAprovacao || 6} pontos E classificação dentro de 4× o número de vagas. O bloco "Conhecimentos Específicos" agrupa 11 matérias do Anexo II — a distribuição interna das 20 questões é estimativa de estudo, não fixação do edital.` })))));
  }
  return raiz;
}

export function viewMateria({ params }) {
  const estado = get();
  const m = dados.materias.find((x) => x.id === params.materia);
  if (!m) return vazio('Matéria não encontrada.');
  const tops = sortBy(dados.topicos.filter((t) => t.materia === m.id), (t) => t.id);

  const raiz = h('div', { class: 'pagina' });
  raiz.appendChild(cabecalho(m.nome, `${tops.length} tópicos do Anexo II · ${questoesPorMateria(m.id).length} questões no banco`,
    [botao('← Todas as matérias', () => { location.hash = '#/curriculo'; }, { variante: 'fantasma' }),
     questoesPorMateria(m.id).length ? botao('Treinar', () => { location.hash = `#/treino/${m.id}`; }, { variante: 'primario' }) : null]));

  const ini = tops.filter((t) => estado.topicos[t.id]?.status && estado.topicos[t.id].status !== 'novo').length;
  raiz.appendChild(barra((ini / tops.length) * 100, { rotulo: `${ini} de ${tops.length} tópicos iniciados`, cor: m.cor, altura: 9 }));

  const legenda = h('div', { class: 'legenda-status' }, ...STATUS.map((s) => badge(s.rot, s.cor)));
  raiz.appendChild(legenda);

  let busca = '';
  const lista = h('div', { class: 'lista-topicos' });
  const campoBusca = h('input', {
    class: 'campo campo-busca', type: 'search', placeholder: `Filtrar tópicos de ${m.nome}…`,
    oninput: debounce((e) => { busca = normalizar(e.target.value); desenharTopicos(); }, 180),
  });
  raiz.appendChild(card('Tópicos', h('div', {}, campoBusca, lista)));

  function desenharTopicos() {
    lista.replaceChildren();
    const visiveis = tops.filter((t) => !busca || normalizar(t.texto).includes(busca));
    if (!visiveis.length) { lista.appendChild(vazio('Nenhum tópico com esse texto.')); return; }
    for (const t of visiveis) lista.appendChild(montarTopico(t));
  }

  function montarTopico(t) {
    const st = estado.topicos[t.id] || {};
    const qs = dados.questoes.filter((q) => q.topico === t.id);
    const cards = dados.flashcards.filter((c) => c.topico === t.id);
    const res = dados.resumos.filter((r) => r.topico === t.id);

    return h('details', { class: `topico status-${st.status || 'novo'}`, open: Boolean(st.anotacoes) },
      h('summary', {},
        h('span', { class: 'topico-id', text: t.id }),
        h('span', { class: 'topico-texto', text: t.texto }),
        h('span', { class: 'topico-badges' },
          seloPrioridade(t.prioridade),
          badge(t.dificuldade || 'media', 'neutro'),
          qs.length ? badge(`${qs.length}q`, 'azul') : null,
          cards.length ? badge(`${cards.length}c`, 'neutro') : null,
          res.length ? badge('resumo', 'verde') : null,
          badge(STATUS.find((s) => s.id === (st.status || 'novo'))?.rot || 'Não iniciado', STATUS.find((s) => s.id === (st.status || 'novo'))?.cor || 'neutro'))),
      h('div', { class: 'topico-corpo' },
        t._nota ? h('p', { class: 'nota', text: t._nota }) : null,
        h('div', { class: 'topico-status' },
          h('span', { text: 'Marcar como:' }),
          ...STATUS.map((s) => botao(s.rot, () => {
            set((es) => { es.topicos[t.id] = { ...(es.topicos[t.id] || {}), status: s.id, atualizadoEm: new Date().toISOString() }; });
            const el = lista.querySelector(`[data-topico="${t.id}"]`);
            desenharTopicos();
            toast(`Tópico marcado como ${s.rot}.`, 'sucesso', 1500);
          }, { variante: (st.status || 'novo') === s.id ? 'primario' : 'fantasma' }))),
        h('div', { class: 'topico-acoes' },
          qs.length ? botao(`Treinar ${qs.length} questão(ões)`, () => treinar(qs, t.texto.slice(0, 60)), { variante: 'primario' }) : null,
          res.length ? botao('Ler resumo', () => { location.hash = '#/resumos'; }, { variante: 'secundario' }) : null,
          cards.length ? botao('Flashcards', () => { location.hash = '#/flashcards'; }, { variante: 'secundario' }) : null,
          botao('🤖 Estudar com IA', () => { location.hash = `#/tutor?pergunta=${encodeURIComponent(`Explique de forma objetiva e com foco em prova este tópico do edital ALEPA/CETAP (${m.nome}): "${t.texto}". Inclua dispositivos legais, prazos e as pegadinhas mais comuns.`)}`; }, { variante: 'fantasma' })),
        h('label', { class: 'topico-nota' },
          h('span', { text: 'Minhas anotações' }),
          h('textarea', {
            class: 'campo', rows: 3, placeholder: 'Anote aqui a regra, o prazo, o mnemônico…',
            value: st.anotacoes || '',
            oninput: debounce((e) => {
              set((es) => { es.topicos[t.id] = { ...(es.topicos[t.id] || {}), anotacoes: e.target.value, atualizadoEm: new Date().toISOString() }; });
            }, 400),
          }))));
  }

  desenharTopicos();
  return raiz;
}

function treinar(qs, titulo) {
  import('./resolver.js').then(({ criarResolver }) => {
    document.getElementById('app').replaceChildren(criarResolver({ questoes: qs, modo: 'livre', titulo }));
    window.scrollTo(0, 0);
  });
}

/* ---------------- cronograma ---------------- */

export function viewCronograma() {
  const c = dados.concurso;
  const raiz = h('div', { class: 'pagina' });
  raiz.appendChild(cabecalho('Cronograma do concurso',
    'Datas oficiais do Edital nº 002/2026 — confira sempre o portal da Fundação CETAP antes de se programar',
    [botao('← Voltar', () => { location.hash = '#/'; }, { variante: 'fantasma' })]));

  const hoje = todayKey();
  const eventos = sortBy(c?.cronograma || [], (e) => e.data);
  const proximos = eventos.filter((e) => diffDays(e.data, hoje) >= 0);
  const passados = eventos.filter((e) => diffDays(e.data, hoje) < 0).reverse();

  if (proximos.length) {
    const p = proximos[0];
    raiz.appendChild(h('div', { class: 'proximo-evento' },
      h('div', {}, h('strong', { text: fmtDateBR(p.data) }), h('span', { text: ` ${p.evento}` })),
      h('div', { class: 'regressivo-numero' },
        h('strong', { text: String(diffDays(p.data, hoje)) }),
        h('span',{text:diffDays(p.data,hoje)===1?'dia':'dias'}))));
  }

  raiz.appendChild(card('Próximas datas',
    h('ul', { class: 'lista-datas' }, ...proximos.map((e) => h('li', { class: ehCritico(e) ? 'data-critica' : '' },
      h('strong', { text: fmtDateBR(e.data) }),
      h('span', { text: ` ${e.evento}` }),
      ehCritico(e) ? badge('crítico', 'vermelho') : null,
      h('em', { text: `em ${diffDays(e.data, hoje)} dias` }))))));

  if (passados.length) {
    raiz.appendChild(card('Já ocorreram',
      h('ul', { class: 'lista-datas lista-passado' }, ...passados.map((e) => h('li', {},
        h('strong', { text: fmtDateBR(e.data) }),
        h('span', { text: ` ${e.evento}` }))))));
  }

  if (c?.cargo) {
    const g = c.cargo;
    const vagas = g.vagas || {};
    const vagasTxt = typeof vagas === 'object'
      ? `${vagas.total ?? '—'} (${vagas.amplaConcorrencia ?? '—'} AC, ${vagas.pessoaComDeficiencia ?? '—'} PcD, ${vagas.pretosEPardos ?? '—'} pretos/pardos, ${vagas.quilombolas ?? '—'} quilombolas, ${vagas.indigenas ?? '—'} indígenas)`
      : String(vagas);
    raiz.appendChild(card(`${g.codigo ?? 'Cargo 02'} — ${g.nome ?? 'Assessor Técnico'}`,
      markdown(`**Plano/cargo:** ${g.planoCargo ?? '—'}
**Escolaridade:** ${g.escolaridade ?? '—'}
**Requisito:** ${g.requisito ?? '—'}
**Vagas:** ${vagasTxt}
**Jornada:** ${g.jornada ?? '—'}
**Vencimento básico:** ${g.vencimentoBasico ?? '—'}
**Remuneração total:** ${g.remuneracaoTotal ?? '—'}
**Taxa de inscrição:** ${g.taxaInscricao ?? '—'}

**Atribuições:**
${(Array.isArray(g.atribuicoes) ? g.atribuicoes : [g.atribuicoes || '—']).map((a) => `- ${a}`).join('\n')}`)));
  }

  if (c?.criteriosDesempate?.length) {
    raiz.appendChild(card('Critérios de desempate (em ordem)',
      h('ol', { class: 'lista-simples' }, ...c.criteriosDesempate.map((x) => h('li', { text: typeof x === 'string' ? x : x.criterio || JSON.stringify(x) })))));
  }

  if (c?.observacoes?.length) {
    raiz.appendChild(card('Observações do edital',
      h('ul', { class: 'lista-simples' }, ...c.observacoes.map((o) => h('li', { text: o }))),
      { classe: 'card-alerta' }));
  }
  return raiz;
}
