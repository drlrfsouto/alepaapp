/* components.js — peças de UI reutilizáveis. */

import { h, fmtDateBR, fmtDateTimeBR, pct, diffDays, todayKey } from './util.js';

export function cabecalho(titulo, subtitulo, acoes = []) {
  return h('header', { class: 'cabecalho' },
    h('div', {}, h('h1', { text: titulo }), subtitulo ? h('p', { class: 'subtitulo', text: subtitulo }) : null),
    acoes.length ? h('div', { class: 'acoes' }, ...acoes) : null,
  );
}

export function card(titulo, corpo, { classe = '', acoes = null } = {}) {
  return h('section', { class: `card ${classe}` },
    titulo ? h('div', { class: 'card-topo' },
      h('h2', { text: titulo }),
      acoes ? h('div', { class: 'card-acoes' }, ...acoes) : null) : null,
    h('div', { class: 'card-corpo' }, corpo),
  );
}

export function badge(texto, cor = 'neutro') {
  return h('span', { class: `badge badge-${cor}`, text: texto });
}

export function chipMateria(nome, cor, { onclick = null, ativo = false, contador = null } = {}) {
  return h('button', {
    class: `chip ${ativo ? 'chip-ativo' : ''}`,
    style: { '--cor': cor },
    onclick,
  },
    h('span', { class: 'chip-ponto' }),
    h('span', { class: 'chip-nome', text: nome }),
    contador !== null ? h('span', { class: 'chip-contador', text: String(contador) }) : null,
  );
}

export function barra(progresso, { cor = 'var(--accent)', rotulo = null, altura = 8 } = {}) {
  const v = Math.max(0, Math.min(100, progresso));
  return h('div', { class: 'barra-wrap' },
    rotulo ? h('div', { class: 'barra-rotulo' },
      h('span', { text: rotulo }), h('span', { text: `${Math.round(v)}%` })) : null,
    h('div', { class: 'barra', style: { height: `${altura}px` } },
      h('div', { class: 'barra-fill', style: { width: `${v}%`, background: cor } })),
  );
}

export function stat(valor, rotulo, { cor = null, dica = null } = {}) {
  return h('div', { class: 'stat', title: dica || '' },
    h('strong', { text: String(valor), style: cor ? { color: cor } : null }),
    h('span', { text: rotulo }),
  );
}

export function botao(texto, onclick, { variante = 'primario', icone = null, desabilitado = false, classe = '' } = {}) {
  return h('button', {
    class: `btn btn-${variante} ${classe}`,
    onclick,
    disabled: desabilitado,
    type: 'button',
  }, icone ? h('span', { class: 'btn-icone', text: icone }) : null, h('span', { text: texto }));
}

export function vazio(mensagem, acao = null) {
  return h('div', { class: 'vazio' }, h('p', { text: mensagem }), acao);
}

export function carregando(mensagem = 'Carregando…') {
  return h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), h('span', { text: mensagem }));
}

/* ---------- modal ---------- */

export function modal({ titulo, corpo, acoes = [], largura = '560px', aoFechar = null }) {
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) fechar(); } });
  function fechar() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    aoFechar?.();
  }
  function onKey(e) { if (e.key === 'Escape') fechar(); }
  document.addEventListener('keydown', onKey);
  overlay.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: { maxWidth: largura } },
    h('div', { class: 'modal-topo' },
      h('h3', { text: titulo }),
      h('button', { class: 'modal-fechar', text: '✕', onclick: fechar, 'aria-label': 'Fechar' })),
    h('div', { class: 'modal-corpo' }, corpo),
    acoes.length ? h('div', { class: 'modal-acoes' }, ...acoes) : null));
  document.body.appendChild(overlay);
  return { fechar, overlay };
}

/* ---------- parágrafos (reexportado de util.js para conveniência das views) ---------- */
export { paragrafos } from './util.js';

/* ---------- toast ---------- */

let toastBox = null;
export function toast(msg, tipo = 'info', ms = 3200) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toast-box' });
    document.body.appendChild(toastBox);
  }
  const el = h('div', { class: `toast toast-${tipo}`, text: msg });
  toastBox.appendChild(el);
  setTimeout(() => { el.classList.add('toast-sai'); setTimeout(() => el.remove(), 260); }, ms);
}

/* ---------- markdown leve (seguro: escapa antes de formatar) ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapar(s) { return String(s).replace(/[&<>"']/g, (c) => ESC[c]); }

export function markdown(texto) {
  const box = h('div', { class: 'md' });
  if (!texto) return box;
  const linhas = String(texto).replace(/\r\n/g, '\n').split('\n');
  let lista = null;
  let tabela = null;
  let paragrafo = [];

  const flushParagrafo = () => {
    if (paragrafo.length) { box.appendChild(h('p', { html: inline(paragrafo.join(' ')) })); paragrafo = []; }
  };
  const flushLista = () => { if (lista) { box.appendChild(lista.el); lista = null; } };
  const flushTabela = () => { if (tabela) { box.appendChild(montarTabela(tabela)); tabela = null; } };
  const flushTudo = () => { flushParagrafo(); flushLista(); flushTabela(); };

  for (const linhaBruta of linhas) {
    const linha = linhaBruta;
    const t = linha.trim();

    if (!t) { flushTudo(); continue; }

    // tabela
    if (/^\|.*\|$/.test(t)) {
      flushParagrafo(); flushLista();
      const celulas = t.slice(1, -1).split('|').map((c) => c.trim());
      if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) { tabela.sep = true; continue; }
      if (!tabela) tabela = { linhas: [], sep: false };
      tabela.linhas.push(celulas);
      continue;
    }
    flushTabela();

    const cab = t.match(/^(#{1,6})\s+(.*)$/);
    if (cab) { flushTudo(); box.appendChild(h(`h${Math.min(6, cab[1].length + 2)}`, { html: inline(cab[2]) })); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushTudo(); box.appendChild(h('hr')); continue; }

    const li = t.match(/^[-*+]\s+(.*)$/);
    if (li) {
      flushParagrafo(); flushTabela();
      if (!lista) lista = { el: h('ul'), tipo: 'ul' };
      lista.el.appendChild(h('li', { html: inline(li[1]) }));
      continue;
    }
    const oi = t.match(/^\d+[.)]\s+(.*)$/);
    if (oi) {
      flushParagrafo(); flushTabela();
      if (!lista) lista = { el: h('ol'), tipo: 'ol' };
      lista.el.appendChild(h('li', { html: inline(oi[1]) }));
      continue;
    }
    const bq = t.match(/^>\s?(.*)$/);
    if (bq) { flushParagrafo(); flushLista(); flushTabela(); box.appendChild(h('blockquote', { html: inline(bq[1]) })); continue; }

    flushLista();
    paragrafo.push(t);
  }
  flushTudo();
  return box;
}

function inline(s) {
  let out = escapar(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  out = out.replace(/  $/, '<br>');
  return out;
}

function montarTabela({ linhas }) {
  if (!linhas.length) return h('div');
  const [cabeca, ...corpo] = linhas;
  return h('table', { class: 'md-tabela' },
    h('thead', {}, h('tr', {}, ...cabeca.map((c) => h('th', { html: inline(c) })))),
    h('tbody', {}, ...corpo.map((l) => h('tr', {}, ...l.map((c) => h('td', { html: inline(c) }))))));
}

/* ---------- blocos específicos ---------- */

export function blocoLeiSeca(itens) {
  if (!itens?.length) return null;
  return h('div', { class: 'lei-seca' },
    h('h4', { text: 'Legislação citada' }),
    h('ul', {}, ...itens.map((i) => h('li', { text: i }))));
}

export function blocoPegadinhas(itens) {
  if (!itens?.length) return null;
  return h('div', { class: 'pegadinhas' },
    h('h4', { text: '⚠ Pegadinhas' }),
    h('ul', {}, ...itens.map((i) => h('li', { text: i }))));
}

export function blocoMnemonico(txt) {
  if (!txt) return null;
  return h('div', { class: 'mnemonico' }, h('h4', { text: '🧠 Mnemônico' }), h('p', { text: txt }));
}

export function linhaHistorico(item) {
  return h('div', { class: 'linha-hist' },
    h('span', { class: `ponto ${item.certa ? 'ponto-certo' : 'ponto-errado'}` }),
    h('span', { text: fmtDateTimeBR(item.em) }),
    h('span', { text: item.certa ? 'acertou' : `errou (marcou ${item.letra})` }));
}

export function seloDificuldade(d) {
  const mapa = { facil: ['Fácil', 'verde'], medio: ['Média', 'amarelo'], dificil: ['Difícil', 'vermelho'] };
  const [rot, cor] = mapa[d] || ['Média', 'amarelo'];
  return badge(rot, cor);
}

export function seloPrioridade(p) {
  const mapa = { S: ['Prioridade S', 'vermelho'], A: ['Prioridade A', 'laranja'], B: ['Prioridade B', 'azul'], C: ['Prioridade C', 'neutro'] };
  const [rot, cor] = mapa[String(p || 'B').toUpperCase()] || mapa.B;
  return badge(rot, cor);
}

export function contadorRegressivo(dataProva) {
  // mesma contagem usada pelo plano de estudos (dias completos até a prova)
  const dias = Math.max(0, diffDays(dataProva, todayKey()));
  const box = h('div', { class: 'regressivo' },
    h('div', {}, h('strong', { text: dias > 0 ? String(dias) : '0' }), h('span', { text: dias > 0 ? 'dias' : 'dia' })),
    h('div', { class: 'regressivo-info' },
      h('span', { text: 'Prova objetiva' }),
      h('strong', { text: fmtDateBR(dataProva) })),
  );
  if (dias <= 30) box.classList.add('regressivo-urgente');
  return box;
}

export function graficoBarras(série, { altura = 60, cor = 'var(--accent)' } = {}) {
  const max = Math.max(1, ...série.map((s) => s.total));
  return h('div', { class: 'grafico', style: { height: `${altura}px` } },
    ...série.map((s) => h('div', { class: 'grafico-col', title: `${fmtDateBR(s.dia)} — ${s.total}` },
      h('div', { class: 'grafico-barra', style: { height: `${pct(s.total, max)}%`, background: cor } }),
      h('span', { class: 'grafico-legenda', text: fmtDateBR(s.dia).slice(0, 5) }))),
  );
}
