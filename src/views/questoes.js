/* views/questoes.js — banco de questões: filtros, lista, treino por matéria e caderno de erros. */

import { h, normalizar, sortBy, groupBy, debounce, shuffle } from '../util.js';
import { get, questoesErradas, cadernoErros, statsPorMateria } from '../store.js';
import { dados, materiaNome, corMateria, listarMaterias, topicoPorId } from '../data.js';
import { cabecalho, card, badge, botao, chipMateria, seloDificuldade, seloPrioridade, barra, vazio, toast, paragrafos } from '../components.js';
import { criarResolver } from './resolver.js';

const filtros = { busca: '', materias: new Set(), dificuldade: '', bloco: '', topico: '', somente: 'todas' };

/* ---------------- banco ---------------- */

export function viewBanco({ query }) {
  if (query.get('materia')) filtros.materias = new Set([query.get('materia')]);
  const raiz = h('div', { class: 'pagina' });

  raiz.appendChild(cabecalho('Banco de questões',
    `${dados.questoes.length} questões comentadas · 15 matérias · padrão Fundação CETAP`,
    [botao('🎲 Treino aleatório (20)', () => iniciarTreino(shuffle(dados.questoes).slice(0, 20), 'Treino aleatório'), { variante: 'primario' })]));

  const painel = montarFiltros(() => desenharLista());
  const listaBox = h('div', { id: 'lista-questoes' });
  raiz.appendChild(card('Filtros', painel));
  raiz.appendChild(listaBox);

  function desenharLista() {
    const filtradas = aplicarFiltros();
    listaBox.replaceChildren(montarLista(filtradas));
  }
  desenharLista();
  return raiz;
}

function montarFiltros(onChange) {
  const deb = debounce(onChange, 180);
  const box = h('div', { class: 'filtros' });
  const chipsPorMateria = new Map();
  let btnTreinar = null;
  let inputBusca = null;

  function atualizarVisual() {
    for (const [id, btn] of chipsPorMateria) btn.classList.toggle('chip-ativo', filtros.materias.has(id));
    if (btnTreinar) btnTreinar.querySelector('span:last-child').textContent = `Treinar resultado (${aplicarFiltros().length})`;
    if (inputBusca) inputBusca.value = filtros.busca;
  }

  inputBusca = h('input', {
    type: 'search', class: 'campo campo-busca', placeholder: 'Buscar por tema, lei, artigo, palavra do enunciado…',
    value: filtros.busca, oninput: (e) => { filtros.busca = e.target.value; deb(); },
  });
  box.appendChild(h('div', { class: 'filtros-linha' }, inputBusca));

  const chips = h('div', { class: 'filtros-chips' });
  for (const m of listarMaterias()) {
    const chip = chipMateria(m.nome, m.cor, {
      contador: m.nQuestoes,
      ativo: filtros.materias.has(m.id),
      onclick: () => {
        if (filtros.materias.has(m.id)) filtros.materias.delete(m.id);
        else filtros.materias.add(m.id);
        atualizarVisual();
        onChange();
      },
    });
    chipsPorMateria.set(m.id, chip);
    chips.appendChild(chip);
  }
  box.appendChild(chips);

  const limpar = botao('Limpar filtros', () => {
    filtros.busca = ''; filtros.materias.clear(); filtros.dificuldade = ''; filtros.bloco = ''; filtros.somente = 'todas';
    box.querySelectorAll('select').forEach((s, i) => { s.value = ''; });
    atualizarVisual();
    onChange();
  }, { variante: 'fantasma' });

  btnTreinar = botao(`Treinar resultado (${aplicarFiltros().length})`, () => {
    const qs = aplicarFiltros();
    if (!qs.length) { toast('Nenhuma questão com esses filtros.', 'erro'); return; }
    iniciarTreino(qs, 'Treino filtrado');
  }, { variante: 'secundario' });

  box.appendChild(h('div', { class: 'filtros-linha filtros-select' },
    select('Dificuldade', [['', 'Todas'], ['facil', 'Fácil'], ['medio', 'Média'], ['dificil', 'Difícil']], filtros.dificuldade, (v) => { filtros.dificuldade = v; onChange(); }),
    select('Bloco', [['', 'Todos'], ['basica', 'Conhecimentos Básicos'], ['especifica', 'Conhecimentos Específicos']], filtros.bloco, (v) => { filtros.bloco = v; onChange(); }),
    select('Situação', [['todas', 'Todas'], ['nao-vistas', 'Ainda não vistas'], ['erradas', 'Que eu errei'], ['acertadas', 'Que eu acertei'], ['marcadas', 'Marcadas para revisar']], filtros.somente, (v) => { filtros.somente = v; onChange(); }),
    limpar,
    btnTreinar,
  ));

  atualizarVisual();
  return box;
}

function select(rotulo, opcoes, valor, onchange) {
  return h('label', { class: 'select-wrap' },
    h('span', { text: rotulo }),
    h('select', { class: 'campo', onchange: (e) => onchange(e.target.value) },
      ...opcoes.map(([v, t]) => h('option', { value: v, selected: v === valor, text: t }))));
}

function aplicarFiltros() {
  const estado = get();
  const t = normalizar(filtros.busca.trim());
  let lista = dados.questoes.filter((q) => {
    if (filtros.materias.size && !filtros.materias.has(q.materia)) return false;
    if (filtros.dificuldade && q.dificuldade !== filtros.dificuldade) return false;
    if (filtros.bloco && q.bloco !== filtros.bloco) return false;
    const r = estado.questoes[q.id];
    if (filtros.somente === 'nao-vistas' && r) return false;
    if (filtros.somente === 'erradas' && r?.ultimoResultado !== 'erro') return false;
    if (filtros.somente === 'acertadas' && r?.ultimoResultado !== 'acerto') return false;
    if (filtros.somente === 'marcadas' && !r?.marcadaParaRevisao) return false;
    if (t) {
      const alvo = normalizar([q.enunciado, q.comentario, q.contexto, q.mnemonico, ...(q.tags || []), ...(q.leiSeca || []), ...(q.alternativas || []).map((a) => a.texto)].join(' '));
      if (!alvo.includes(t)) return false;
    }
    return true;
  });
  return lista;
}

function montarLista(lista) {
  const estado = get();
  if (!lista.length) return vazio('Nenhuma questão corresponde aos filtros. Tente remover algum critério.');

  const porMateria = groupBy(lista, 'materia');
  const box = h('div', { class: 'lista-questoes' });
  box.appendChild(h('p', { class: 'contador', text: `${lista.length} questão(ões) encontrada(s) em ${porMateria.size} matéria(s).` }));

  for (const [mat, qs] of porMateria) {
    const grupo = h('div', { class: 'grupo-materia' });
    grupo.appendChild(h('div', { class: 'grupo-cabecalho', style: { '--cor': corMateria(mat) } },
      h('h3', { text: materiaNome(mat) }),
      h('div', { class: 'grupo-acoes' },
        badge(`${qs.length} questões`, 'neutro'),
        botao('Treinar esta matéria', () => iniciarTreino(qs, materiaNome(mat)), { variante: 'fantasma' }))));

    const tabela = h('div', { class: 'tabela-questoes' });
    for (const q of qs) {
      const r = estado.questoes[q.id];
      tabela.appendChild(h('details', { class: `linha-questao ${r ? (r.ultimoResultado === 'acerto' ? 'linha-ok' : 'linha-erro') : ''}` },
        h('summary', {},
          h('span', { class: 'linha-id', text: q.id }),
          h('span', { class: 'linha-enunciado', text: q.enunciado }),
          h('span', { class: 'linha-badges' },
            seloDificuldade(q.dificuldade),
            r ? badge(r.ultimoResultado === 'acerto' ? 'acertou' : 'errou', r.ultimoResultado === 'acerto' ? 'verde' : 'vermelho') : badge('nova', 'neutro'),
            q.revisar ? badge('revisar', 'laranja') : null)),
        h('div', { class: 'linha-corpo' },
          h('div', { class: 'linha-alternativas' }, ...q.alternativas.map((a) => h('p', {
            class: a.letra === q.gabarito ? 'alt-certa' : '',
            text: `${a.letra}) ${a.texto}`,
          }))),
          h('div', { class: 'linha-comentario' }, paragrafos(q.comentario)),
          q.mnemonico ? h('p', { class: 'linha-mnemonico', text: `🧠 ${q.mnemonico}` }) : null,
          q.leiSeca?.length ? h('p', { class: 'linha-lei', text: `📜 ${q.leiSeca.join(' · ')}` }) : null,
          h('div', { class: 'linha-acoes' },
            botao('Responder agora', () => iniciarTreino([q], 'Questão única'), { variante: 'primario' }),
            botao('Ver no treino da matéria', () => iniciarTreino(questoesPorMateriaLocal(mat), materiaNome(mat)), { variante: 'secundario' })))));
    }
    grupo.appendChild(tabela);
    box.appendChild(grupo);
  }
  return box;
}

function questoesPorMateriaLocal(id) { return dados.questoes.filter((q) => q.materia === id); }

/* ---------------- treino ---------------- */

export function viewTreino({ params }) {
  const materia = params.materia;
  const qs = questoesPorMateriaLocal(materia);
  if (!qs.length) {
    return h('div', { class: 'pagina' }, cabecalho(materiaNome(materia), 'Sem questões ainda'),
      vazio(`O banco ainda não tem questões desta matéria. Veja o currículo e os resumos enquanto isso.`,
        botao('Abrir currículo da matéria', () => { location.hash = `#/curriculo/${materia}`; }, { variante: 'primario' })));
  }
  const st = statsPorMateria(dados.questoes).find((s) => s.materia === materia);
  return criarResolver({
    questoes: shuffle(qs),
    modo: 'livre',
    titulo: `Treino — ${materiaNome(materia)}`,
    comentarioImediato: true,
    aoResponder: () => {},
  });
}

export function viewQuestaoUnica({ params }) {
  const q = dados.questoes.find((x) => x.id === params.id);
  if (!q) return vazio('Questão não encontrada.');
  return criarResolver({ questoes: [q], modo: 'livre', titulo: `Questão ${q.id}` });
}

/* ---------------- caderno de erros ---------------- */

export function viewErros() {
  const raiz = h('div', { class: 'pagina' });
  function desenhar() {
    const estado = get();
    const idsErrados = new Set(cadernoErros());
    const marcadas = new Set(Object.entries(estado.questoes).filter(([, r]) => r.marcadaParaRevisao).map(([id]) => id));
    const alvo = new Set([...idsErrados, ...marcadas]);
    const qs = dados.questoes.filter((q) => alvo.has(q.id));

    raiz.replaceChildren();
    raiz.appendChild(cabecalho('Caderno de erros',
      `${idsErrados.size} questão(ões) erradas ainda não consolidadas (precisam de 2 acertos seguidos) · ${marcadas.size} marcada(s) manualmente · ${questoesErradas().length} errada(s) na última tentativa`,
      [qs.length ? botao(`Refazer ${qs.length} questão(ões)`, () => iniciarTreino(shuffle(qs), 'Caderno de erros'), { variante: 'primario' }) : null]));

    if (!qs.length) {
      raiz.appendChild(card('Tudo em ordem', vazio('Nenhuma questão pendente. Continue treinando para alimentar o caderno de erros automaticamente.',
        botao('Ir para o banco', () => { location.hash = '#/questoes'; }, { variante: 'primario' }))));
      return;
    }

    const porMat = statsPorMateria(dados.questoes).filter((m) => qs.some((q) => q.materia === m.materia));
    raiz.appendChild(card('Onde estão seus erros',
      h('div', { class: 'materias-grid' }, ...porMat.map((m) => h('div', { class: 'materia-linha' },
        h('div', { class: 'materia-nome' }, chipMateria(materiaNome(m.materia), corMateria(m.materia))),
        h('div', { class: 'materia-barra' }, barra(m.taxa, { cor: corTaxa(m.taxa), altura: 7 })),
        h('div', { class: 'materia-numeros' }, h('span', { text: `${qs.filter((q) => q.materia === m.materia).length} pendentes` })))))));

    raiz.appendChild(card('Questões pendentes',
      h('div', { class: 'tabela-questoes' }, ...qs.map((q) => h('div', { class: 'linha-resumida' },
        badge(materiaNome(q.materia), 'azul'),
        h('span', { class: 'linha-enunciado', text: q.enunciado }),
        h('div', { class: 'linha-acoes' },
          botao('Refazer', () => iniciarTreino([q], 'Revisão'), { variante: 'fantasma' }),
          botao('Remover', () => remover(q.id), { variante: 'fantasma' })))))));

    function remover(id) {
      const e2 = get();
      e2.questoes[id] = { ...(e2.questoes[id] || {}), id, ultimoResultado: 'acerto', marcadaParaRevisao: false };
      desenhar();
      toast('Questão removida do caderno de erros.', 'sucesso', 2000);
    }
  }
  desenhar();
  return raiz;
}

function corTaxa(t) { return t >= 70 ? 'var(--verde)' : t >= 50 ? 'var(--amarelo)' : 'var(--vermelho)'; }

/* ---------------- util ---------------- */

export function iniciarTreino(questoes, titulo) {
  if (!questoes.length) { toast('Nenhuma questão para treinar.', 'erro'); return; }
  const alvo = document.getElementById('app');
  alvo.replaceChildren(criarResolver({ questoes, modo: 'livre', titulo, comentarioImediato: true }));
  window.scrollTo(0, 0);
  history.replaceState(null, '', '#/questoes');
}
