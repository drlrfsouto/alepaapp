/* smoke.mjs — teste de fumaça: sobe o app num DOM virtual (jsdom), visita todas as
 * rotas e reporta qualquer exceção ou erro de console. Rode com `npm test`.
 *
 *   node tools/smoke.mjs            → visita todas as rotas
 *   node tools/smoke.mjs /plano     → visita apenas uma rota
 *
 * Requer jsdom: `npm i --no-save jsdom`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };

const problemas = [];
const logs = [];

function logErro(where, e) {
  problemas.push(`${where}: ${e?.message || e}${e?.stack ? '\n    ' + String(e.stack).split('\n').slice(1, 3).join('\n    ') : ''}`);
}

async function main() {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;

  // ---- globals que o app espera ----
  const definir = (nome, valor) => Object.defineProperty(globalThis, nome, { value: valor, writable: true, configurable: true });
  definir('window', window);
  definir('document', window.document);
  definir('navigator', window.navigator);
  definir('location', window.location);
  definir('localStorage', window.localStorage);
  definir('sessionStorage', window.sessionStorage);
  definir('HTMLElement', window.HTMLElement);
  definir('Element', window.Element);
  definir('Node', window.Node);
  definir('Event', window.Event);
  definir('CustomEvent', window.CustomEvent);
  definir('HashChangeEvent', window.HashChangeEvent || window.Event);
  definir('MouseEvent', window.MouseEvent || window.Event);
  definir('KeyboardEvent', window.KeyboardEvent);
  definir('getComputedStyle', window.getComputedStyle.bind(window));
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.matchMedia = window.matchMedia?.bind(window) || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia;
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.scrollTo = () => {};

  window.addEventListener('error', (ev) => logErro('window.error', ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => logErro('unhandledrejection', ev.reason));
  const consoleOriginal = { error: console.error, warn: console.warn };
  console.error = (...a) => { logs.push(['error', a.join(' ')]); consoleOriginal.error(...a); };
  console.warn = (...a) => { logs.push(['warn', a.join(' ')]); };

  // ---- fetch de disco ----
  definir('fetch', async (url) => {
    const u = String(url).replace(/^https?:\/\/[^/]+/, '');
    const p = path.join(RAIZ, u.split('?')[0]);
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }
    const corpo = fs.readFileSync(p, 'utf8');
    return {
      ok: true, status: 200, headers: { get: () => MIME[path.extname(p)] || 'text/plain' },
      json: async () => JSON.parse(corpo), text: async () => corpo,
    };
  });
  window.fetch = globalThis.fetch;

  const rotas = process.argv.slice(2).length ? process.argv.slice(2) : [
    '/', '/plano', '/questoes', '/treino/lp', '/treino/dir-adm', '/questao/lp-q001', '/erros',
    '/simulados', '/simulados/historico', '/resumos', '/resumos/lp', '/flashcards', '/curriculo',
    '/curriculo/lp', '/cronograma', '/estatisticas', '/tutor', '/config',
  ];

  await import(path.join(RAIZ, 'src', 'app.js'));
  await esperar();

  const app = document.getElementById('app');
  if (!app.children.length) problemas.push('boot: #app vazio após carregar dados');
  else console.log(`boot ok · nav com ${document.querySelectorAll('#nav a').length} itens · ${document.title}`);

  for (const rota of rotas) {
    try {
      window.location.hash = `#${rota}`;
      window.dispatchEvent(new window.HashChangeEvent('hashchange', { oldURL: '', newURL: `#${rota}` }));
      await esperar();
      const filhos = app.children.length;
      const texto = (app.textContent || '').trim();
      if (!filhos) problemas.push(`${rota}: renderizou vazio`);
      else if (texto.length < 30) problemas.push(`${rota}: conteúdo suspeito (${texto.length} caracteres)`);
      console.log(`  ${rota.padEnd(20)} ${filhos > 1 ? `${filhos} blocos` : '1 bloco'} · ${texto.length} caracteres`);
    } catch (e) { logErro(rota, e); }
  }

  /* ---- interações mínimas ---- */
  const interacoes = [
    ['gerar plano', async () => {
      irPara(window, '#/plano'); await esperar();
      const btn = [...app.querySelectorAll('button')].find((b) => /gerar|atualizar plano/i.test(b.textContent || ''));
      if (!btn) throw new Error('botão de gerar plano não encontrado');
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar(); await esperar();
      // a view mostra o dia de hoje duas vezes de propósito (cartão "📌 Hoje" + lista "Dia a dia")
      const stPlano = JSON.parse(localStorage.getItem('alepa2026.state.v1') || '{}').plano || [];
      const dias = app.querySelectorAll('.lista-dias details.dia').length;
      if (!stPlano.length) throw new Error('o plano não foi gravado no estado');
      if (dias !== stPlano.length) throw new Error(`lista "Dia a dia" tem ${dias} cartões, mas o estado tem ${stPlano.length} dias`);
      const datas = [...app.querySelectorAll('.lista-dias .dia-data strong')].map((e) => e.textContent);
      const dup = datas.filter((d, i) => datas.indexOf(d) !== i);
      if (dup.length) throw new Error(`datas duplicadas na lista: ${dup.join(', ')}`);
      if (/undefined|NaN/.test(app.textContent || '')) throw new Error('plano renderizou "undefined"/"NaN"');
      console.log(`  plano gerado · ${stPlano.length} dias (${stPlano[0].data} → ${stPlano[stPlano.length - 1].data}) · ${app.querySelectorAll('.bloco').length} blocos`);
    }],
    ['responder questão no treino', async () => {
      irPara(window, '#/treino/lp'); await esperar();
      const alt = app.querySelector('.alternativa, [data-letra]');
      if (!alt) throw new Error('nenhuma alternativa renderizada');
      alt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      const confirmar = [...app.querySelectorAll('button')].find((b) => /confirmar|responder/i.test(b.textContent || ''));
      confirmar?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      console.log(`  resposta registrada · gabarito visível: ${/gabarito/i.test(app.textContent || '')}`);
    }],
    ['estudar flashcard (SRS ponta a ponta)', async () => {
      irPara(window, '#/flashcards'); await esperar();
      const estudar = [...app.querySelectorAll('button')].find((b) => /estudar|iniciar|revisar/i.test(b.textContent || ''));
      if (!estudar) throw new Error('nenhum botão de iniciar sessão de flashcards');
      estudar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      const frente = app.querySelector('.flashcard-frente');
      if (!frente) throw new Error('frente do cartão não renderizou');
      const mostrar = [...app.querySelectorAll('button')].find((b) => /mostrar resposta/i.test(b.textContent || ''));
      if (!mostrar) throw new Error('botão "Mostrar resposta" ausente');
      mostrar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      if (!app.querySelector('.flashcard-verso')) throw new Error('o cartão não virou para o verso');
      const bom = [...app.querySelectorAll('button')].find((b) => /3 · Bom|bom/i.test(b.textContent || ''));
      if (!bom) throw new Error('botões de avaliação SRS ausentes');
      bom.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      const estado = JSON.parse(localStorage.getItem('alepa2026.state.v1') || '{}');
      const avaliados = Object.keys(estado.cards || {}).length;
      if (!avaliados) throw new Error('a avaliação não foi gravada no estado (cards vazio)');
      console.log(`  SRS ok · ${avaliados} cartão(ões) com histórico gravado`);
    }],
    ['iniciar simulado diário', async () => {
      irPara(window, '#/simulados'); await esperar();
      const iniciar = [...app.querySelectorAll('button')].find((b) => /iniciar|começar|treino diário/i.test(b.textContent || ''));
      if (!iniciar) throw new Error('nenhum botão de iniciar simulado');
      iniciar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await esperar();
      if (!app.querySelector('.alternativa')) throw new Error('o simulado não abriu o resolvedor');
      console.log(`  simulado aberto · ${app.querySelectorAll('.alternativa').length} alternativas na 1ª questão`);
    }],
  ];

  for (const [nome, fn] of interacoes) {
    try { await fn(); } catch (e) { logErro(`interação: ${nome}`, e); }
  }

  /* ---- resultado ---- */
  console.log('\n———————————————');
  const warns = logs.filter((l) => l[0] === 'warn');
  if (warns.length) console.log(`${warns.length} aviso(s) de console (ver acima)`);
  if (problemas.length) {
    console.error(`\n❌ ${problemas.length} problema(s):`);
    for (const p of problemas) console.error('  • ' + p);
    process.exit(1);
  }
  console.log('✅ Smoke test passou: todas as rotas renderizaram sem exceções.');
  process.exit(0); // sessões cronometradas deixam timers pendentes
}

function irPara(window, hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange', { oldURL: '', newURL: hash }));
}
function esperar(ms = 120) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => { console.error('Falha fatal no smoke test:', e); process.exit(1); });
