/* router.js — roteador por hash, sem dependências. */

import { h } from './util.js';
import { carregando } from './components.js';

const rotas = [];
let alvo = null;
let rotaAtual = null;

export function registrar(padrao, handler, meta = {}) {
  // '/questao/:id' → regexp
  const chaves = [];
  const rx = new RegExp('^' + padrao.replace(/:[A-Za-z0-9_]+/g, (m) => {
    chaves.push(m.slice(1));
    return '([^/]+)';
  }).replace(/\//g, '\\/') + '$');
  rotas.push({ padrao, rx, chaves, handler, meta });
}

export function iniciar(container, { aoNavegar = null } = {}) {
  alvo = container;
  window.addEventListener('hashchange', () => resolver(aoNavegar));
  resolver(aoNavegar);
}

export function ir(para) {
  const hash = para.startsWith('#') ? para : `#${para}`;
  if (location.hash === hash) resolver();
  else location.hash = hash;
}

export function rotaAtualInfo() { return rotaAtual; }

function resolver(aoNavegar) {
  const hash = location.hash.replace(/^#/, '') || '/';
  const caminho = hash.split('?')[0];
  const params = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');

  for (const r of rotas) {
    const m = caminho.match(r.rx);
    if (!m) continue;
    const p = {};
    r.chaves.forEach((k, i) => { p[k] = decodeURIComponent(m[i + 1]); });
    rotaAtual = { caminho, padrao: r.padrao, params: p, query: params, meta: r.meta };
    renderizar(r, p, params, aoNavegar);
    return;
  }
  rotaAtual = { caminho, padrao: null, params: {}, query: params, meta: {} };
  alvo.replaceChildren(h('div', { class: 'vazio' },
    h('h2', { text: 'Página não encontrada' }),
    h('p', { text: caminho }),
    h('a', { class: 'btn btn-primario', href: '#/', text: 'Voltar ao início' })));
}

async function renderizar(rota, params, query, aoNavegar) {
  alvo.replaceChildren(carregando());
  aoNavegar?.(rota.meta);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  try {
    const resultado = await rota.handler({ params, query, container: alvo });
    if (resultado instanceof Node) alvo.replaceChildren(resultado);
    else if (Array.isArray(resultado)) alvo.replaceChildren(...resultado);
    // handler também pode ter preenchido `alvo` diretamente
  } catch (e) {
    console.error('[router]', e);
    alvo.replaceChildren(h('div', { class: 'vazio erro' },
      h('h2', { text: 'Erro ao carregar esta tela' }),
      h('p', { text: e.message }),
      h('pre', { class: 'erro-detalhe', text: String(e.stack || '').slice(0, 600) })));
  }
}
