/* app.js — bootstrap: carrega dados, monta navegação e registra as rotas. */

import { h } from './util.js';
import { carregar, get, set } from './store.js';
import { carregarTudo, dados, dataDaProva } from './data.js';
import { registrar, iniciar } from './router.js';
import { carregando, toast } from './components.js';
import { aplicarTema, aplicarDensidade } from './views/config.js';
import { aplicarConfigPublica, iniciarSincronizacao, supabaseConfigurado, enviarProgresso } from './supabase.js';

import viewDashboard from './views/dashboard.js';
import { viewBanco, viewTreino, viewQuestaoUnica, viewErros } from './views/questoes.js';
import { viewSimulados, viewHistorico } from './views/simulados.js';
import { viewResumos } from './views/resumos.js';
import { viewFlashcards } from './views/flashcards.js';
import { viewCurriculo, viewMateria, viewCronograma } from './views/curriculo.js';
import { viewPlano } from './views/plano.js';
import { viewStats } from './views/stats.js';
import { viewTutor } from './views/tutor.js';
import { viewConfig } from './views/config.js';

const NAV = [
  { rota: '/', rot: 'Painel', icone: '🏠' },
  { rota: '/plano', rot: 'Plano', icone: '🗓' },
  { rota: '/questoes', rot: 'Questões', icone: '📝' },
  { rota: '/simulados', rot: 'Simulados', icone: '🎯' },
  { rota: '/erros', rot: 'Erros', icone: '🚫' },
  { rota: '/resumos', rot: 'Resumos', icone: '📖' },
  { rota: '/flashcards', rot: 'Flashcards', icone: '🃏' },
  { rota: '/curriculo', rot: 'Edital', icone: '📚' },
  { rota: '/cronograma', rot: 'Datas', icone: '📅' },
  { rota: '/estatisticas', rot: 'Estatísticas', icone: '📊' },
  { rota: '/tutor', rot: 'Tutor IA', icone: '🤖' },
  { rota: '/config', rot: 'Config', icone: '⚙' },
];

async function boot() {
  const app = document.getElementById('app');
  app.replaceChildren(carregando('Carregando edital, currículo e banco de questões…'));

  carregar();

  // tema/densidade antes de qualquer render
  aplicarTema();
  aplicarDensidade();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!get().config.modoEscuro) aplicarTema();
  });

  try {
    await carregarTudo('data');
  } catch (e) {
    app.replaceChildren(h('div', { class: 'pagina' }, h('div', { class: 'vazio erro' },
      h('h2', { text: 'Não foi possível carregar os dados' }),
      h('p', { text: e.message }),
      h('p', { class: 'nota', text: 'Este app precisa ser servido por HTTP (módulos ES + fetch). Use `npm start` ou `python3 -m http.server`.' }))));
    return;
  }

  // garante a data da prova no perfil
  if (!get().perfil.dataProva) set((s) => { s.perfil.dataProva = dataDaProva(); });

  // deploy (Vercel/Supabase): aplica config.json se existir e liga o backup automático
  await aplicarConfigPublica();
  iniciarSincronizacao();
  if (supabaseConfigurado() && get().supabase.sincronizar) {
    // envia já na abertura; o subscribe cuida das mudanças seguintes (com debounce).
    // Restaurar é sempre uma ação EXPLÍCITA do usuário em Configurações.
    enviarProgresso().catch((e) => console.warn('[supabase] backup inicial falhou:', e.message));
  }

  montarNav();
  registrarRotas();
  iniciar(app, { aoNavegar: (meta) => marcarNavAtivo(meta) });

  if (dados.erros.length) {
    toast(`${dados.erros.length} arquivo(s) de dados com problema. Veja o Painel.`, 'aviso', 6000);
  }

  registrarServiceWorker();
  avisarSemQuestoes();
}

function registrarRotas() {
  registrar('/', viewDashboard, { nav: '/' });
  registrar('/plano', viewPlano, { nav: '/plano' });
  registrar('/questoes', viewBanco, { nav: '/questoes' });
  registrar('/treino/:materia', viewTreino, { nav: '/questoes' });
  registrar('/questao/:id', viewQuestaoUnica, { nav: '/questoes' });
  registrar('/erros', viewErros, { nav: '/erros' });
  registrar('/simulados', viewSimulados, { nav: '/simulados' });
  registrar('/simulados/historico', viewHistorico, { nav: '/simulados' });
  registrar('/simulados/:id', (ctx) => viewSimulados(), { nav: '/simulados' });
  registrar('/resumos', viewResumos, { nav: '/resumos' });
  registrar('/resumos/:materia', (ctx) => viewResumos({ materia: ctx.params.materia }), { nav: '/resumos' });
  registrar('/flashcards', viewFlashcards, { nav: '/flashcards' });
  registrar('/curriculo', viewCurriculo, { nav: '/curriculo' });
  registrar('/curriculo/:materia', viewMateria, { nav: '/curriculo' });
  registrar('/cronograma', viewCronograma, { nav: '/cronograma' });
  registrar('/estatisticas', viewStats, { nav: '/estatisticas' });
  registrar('/tutor', viewTutor, { nav: '/tutor' });
  registrar('/config', viewConfig, { nav: '/config' });
}

function montarNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.replaceChildren(...NAV.map((n) => h('a', {
    class: 'nav-item', href: `#${n.rota}`, 'data-rota': n.rota,
  }, h('span', { class: 'nav-icone', text: n.icone }), h('span', { class: 'nav-rotulo', text: n.rot }))));

  // contador de cartões vencidos no item de flashcards
  atualizarBadgesNav();
  window.addEventListener('focus', atualizarBadgesNav);
  document.addEventListener('click', () => setTimeout(atualizarBadgesNav, 400));
}

function atualizarBadgesNav() {
  const e = get();
  const ids = dados.flashcards.map((c) => c.id);
  const vencidos = ids.filter((id) => { const c = e.cards[id]; return c && c.proxima && c.proxima <= new Date().toISOString().slice(0, 10); }).length;
  const erros = Object.values(e.questoes).filter((q) => q.ultimoResultado === 'erro').length;
  colocarBadge('[data-rota="/flashcards"]', vencidos);
  colocarBadge('[data-rota="/erros"]', erros);
}

function colocarBadge(sel, n) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.toggle('tem-badge', n > 0);
  let b = el.querySelector('.nav-badge');
  if (n > 0) {
    if (!b) { b = h('span', { class: 'nav-badge' }); el.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  } else b?.remove();
}

function marcarNavAtivo(meta) {
  const rota = meta?.nav || location.hash.replace('#', '').split('?')[0] || '/';
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('nav-ativo', a.dataset.rota === rota || (rota !== '/' && a.dataset.rota !== '/' && rota.startsWith(a.dataset.rota)));
  });
  atualizarBadgesNav();
  const item = document.querySelector('.nav-item.nav-ativo');
  if (item && window.innerWidth < 900) item.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw] registro falhou:', e));
  });
}

function avisarSemQuestoes() {
  const semQuestoes = dados.materias.filter((m) => !dados.questoes.some((q) => q.materia === m.id));
  if (semQuestoes.length) {
    console.info('[app] matérias ainda sem questões no banco:', semQuestoes.map((m) => m.nome));
  }
}

// atalho global: Ctrl+K abre a busca
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    location.hash = '#/questoes';
    setTimeout(() => document.querySelector('.campo-busca')?.focus(), 250);
  }
});

boot();
