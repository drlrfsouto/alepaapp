/* util.js — helpers de DOM e data, sem dependências. */

/** Cria um elemento. `attrs` aceita class, dataset.*, on* handlers, style object. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k in el && k !== 'list' && typeof v !== 'object') {
      try { el[k] = v; } catch { el.setAttribute(k, v); }
    } else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- data/hora ---------- */

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/** Diferença em dias inteiros (a - b). */
export function diffDays(a, b) {
  const ms = parseDate(a).setHours(0, 0, 0, 0) - parseDate(b).setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function addDays(dateKey, days) {
  const d = parseDate(dateKey);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

export function fmtDateBR(dateKey) {
  if (!dateKey) return '—';
  const [y, m, d] = String(dateKey).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTimeBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuracao(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

/* ---------- array/objeto ---------- */

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function groupBy(arr, fn) {
  const out = new Map();
  for (const item of arr) {
    const k = typeof fn === 'function' ? fn(item) : item[fn];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export function sortBy(arr, fn) {
  return [...arr].sort((a, b) => {
    const va = typeof fn === 'function' ? fn(a) : a[fn];
    const vb = typeof fn === 'function' ? fn(b) : b[fn];
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
export function round(n, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }

export function pct(n, total) { return total ? round((n / total) * 100, 1) : 0; }

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- texto ---------- */

export function normalizar(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function destacar(texto, termos) {
  if (!termos || !termos.length) return document.createTextNode(texto);
  const frag = document.createDocumentFragment();
  const rx = new RegExp(`(${termos.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  let last = 0;
  let m;
  while ((m = rx.exec(texto)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(texto.slice(last, m.index)));
    frag.appendChild(h('mark', { text: m[0] }));
    last = m.index + m[0].length;
  }
  if (last < texto.length) frag.appendChild(document.createTextNode(texto.slice(last)));
  return frag;
}

/** Converte \n em <br> de forma segura (sem innerHTML em dados externos). */
export function paragrafos(texto, className = '') {
  const box = h('div', { class: className });
  String(texto || '').split(/\n+/).forEach((p) => {
    if (!p.trim()) return;
    box.appendChild(h('p', { text: p.trim() }));
  });
  return box;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function baixarJSON(objeto, nomeArquivo) {
  const blob = new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nomeArquivo });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
