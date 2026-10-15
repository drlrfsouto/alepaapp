/* views/flashcards.js — estudo por repetição espaçada (SM-2 adaptado). */

import { h, shuffle, fmtDateBR, todayKey, addDays } from '../util.js';
import { get, set, registrar } from '../store.js';
import { dados, materiaNome, corMateria, cardsPorMateria } from '../data.js';
import { revisar, vencidos, proximos, progresso, novoCard } from '../srs.js';
import { cabecalho, card, badge, botao, barra, stat, vazio, toast, chipMateria, markdown } from '../components.js';

const filtros = { materia: '', somenteVencidos: false, limiteNovos: 10 };

export function viewFlashcards() {
  const raiz = h('div', { class: 'pagina' });
  function desenhar() {
    raiz.replaceChildren(montar());
  }
  raiz.appendChild(montar());
  return raiz;

  function montar() {
    const estado = get();
    const todos = dados.flashcards.filter((c) => !filtros.materia || c.materia === filtros.materia);
    const ids = todos.map((c) => c.id);
    const prog = progresso(estado.cards, ids);
    const filaVencidos = vencidos(estado.cards, ids);
    const novos = ids.filter((id) => !estado.cards[id]);
    const filaNovos = novos.slice(0, Math.max(0, filtros.limiteNovos));
    const fila = [...filaVencidos.map((v) => v.id), ...filaNovos.filter((id) => !filaVencidos.some((v) => v.id === id))];

    const box = h('div');
    box.appendChild(cabecalho('Flashcards',
      `${dados.flashcards.length} cartões · repetição espaçada (SM-2 adaptado)`,
      [botao('Estudar agora', () => iniciarSessao(fila), { variante: 'primario', desabilitado: !fila.length, icone: '▶' })]));

    box.appendChild(h('div', { class: 'faixa-stats' },
      stat(prog.vencidos, 'vencidos hoje', { cor: prog.vencidos ? 'var(--laranja)' : null }),
      stat(prog.emDia, 'em dia', { cor: 'var(--verde)' }),
      stat(prog.novos, 'novos'),
      stat(prog.dominados, 'dominados (21d+)', { cor: 'var(--azul)' }),
      stat(fila.length, 'nesta sessão')));

    const proj = proximos(estado.cards, ids, 7);
    if (proj.some((p) => p.total > 0)) {
      box.appendChild(card('Próximos 7 dias',
        h('div', { class: 'projecao' }, ...proj.map((p) => h('div', { class: 'projecao-dia' },
          h('strong', { text: String(p.total) }),
          h('span', { text: p.dia === todayKey() ? 'hoje' : fmtDateBR(p.dia).slice(0, 5) }))))));
    }

    box.appendChild(card('Filtros',
      h('div', { class: 'filtros' },
        h('div', { class: 'filtros-chips' },
          chipMateria('Todas as matérias', '#6366f1', { ativo: filtros.materia === '', onclick: () => { filtros.materia = ''; desenhar(); } }),
          ...dados.materias.filter((m) => cardsPorMateria(m.id).length).map((m) => chipMateria(m.nome, m.cor, {
            contador: cardsPorMateria(m.id).length,
            ativo: filtros.materia === m.id,
            onclick: () => { filtros.materia = m.id; desenhar(); },
          }))),
        h('div', { class: 'filtros-linha filtros-select' },
          h('label', { class: 'select-wrap' },
            h('span', { text: 'Novos cartões por sessão' }),
            h('input', { class: 'campo', type: 'number', min: 0, max: 40, value: filtros.limiteNovos, oninput: (e) => { filtros.limiteNovos = Number(e.target.value) || 0; desenhar(); } })),
          h('label', { class: 'check-wrap' },
            h('input', { type: 'checkbox', checked: filtros.somenteVencidos, onchange: (e) => { filtros.somenteVencidos = e.target.checked; desenhar(); } }),
            h('span', { text: 'Somente vencidos' })),
          botao('Estudar', () => iniciarSessao(filtros.somenteVencidos ? filaVencidos.map((v) => v.id) : fila), { variante: 'secundario' })))));

    const porMateria = dados.materias.filter((m) => cardsPorMateria(m.id).length);
    if (porMateria.length) {
      box.appendChild(card('Progresso por matéria',
        h('div', { class: 'materias-grid' }, ...porMateria.map((m) => {
          const idsM = cardsPorMateria(m.id).map((c) => c.id);
          const p = progresso(estado.cards, idsM);
          const taxa = idsM.length ? ((p.emDia + p.dominados) / idsM.length) * 100 : 0;
          return h('div', { class: 'materia-linha' },
            h('div', { class: 'materia-nome' }, chipMateria(m.nome, m.cor, { onclick: () => { filtros.materia = m.id; desenhar(); } })),
            h('div', { class: 'materia-barra' }, barra(taxa, { cor: m.cor, altura: 7 })),
            h('div', { class: 'materia-numeros' },
              h('span', { text: `${p.emDia + p.dominados}/${idsM.length}` }),
              h('span', { class: 'detalhe', text: p.vencidos ? `${p.vencidos} vencidos` : 'em dia' })),
            h('div', { class: 'materia-acao' }, botao('Estudar', () => { filtros.materia = m.id; desenhar(); iniciarSessao(idsM); }, { variante: 'fantasma' })));
        }))));
    }

    box.appendChild(card('Ver todos os cartões',
      h('div', { class: 'lista-cards' }, ...todos.slice(0, 400).map((c) => {
        const st = estado.cards[c.id];
        return h('details', { class: 'card-item' },
          h('summary', {},
            badge(materiaNome(c.materia), 'azul'),
            h('span', { text: c.frente }),
            st ? badge(`próxima: ${fmtDateBR(st.proxima)}`, st.proxima <= todayKey() ? 'laranja' : 'neutro') : badge('novo', 'neutro')),
          h('div', { class: 'card-verso' }, markdown(c.verso),
            h('div', { class: 'card-acoes' },
              botao('Estudar só este', () => iniciarSessao([c.id]), { variante: 'fantasma' }),
              st ? h('span', { class: 'nota', text: `ease ${st.ease?.toFixed(2)} · intervalo ${st.intervalo}d · ${st.acertos || 0}✓ ${st.erros || 0}✗` }) : null)));
      }))));

    return box;
  }

  function iniciarSessao(ids) {
    if (!ids.length) { toast('Nada para estudar agora. Volte amanhã!', 'sucesso'); return; }
    const alvo = document.getElementById('app');
    alvo.replaceChildren(sessao(ids));
    window.scrollTo(0, 0);
  }
}

/* ---------------- sessão ---------------- */

function sessao(ids) {
  const fila = [...ids];
  const vistos = new Set();
  let acertos = 0;
  let erros = 0;
  const inicio = Date.now();
  let virado = false;
  let cardAtual = null;

  const raiz = h('div', { class: 'sessao-cards' });

  // Um único listener de teclado para toda a sessão.
  function onKey(e) {
    if (!cardAtual) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      if (!virado) { virado = true; desenharCard(); }
      return;
    }
    if (virado && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      responder(cardAtual, Number(e.key) - 1);
    }
  }
  document.addEventListener('keydown', onKey);

  function desenhar() {
    if (!fila.length) { cardAtual = null; raiz.replaceChildren(montarFim()); return; }
    const id = fila[0];
    const card = dados.flashcards.find((c) => c.id === id);
    if (!card) { fila.shift(); desenhar(); return; }
    cardAtual = card;
    virado = false;
    raiz.replaceChildren(montarCard(card));
  }

  function montarCard(c) {
    const st = get().cards[c.id] || novoCard();
    const box = h('div', { class: 'flashcard-box' });
    desenharCard();
    return box;

    function desenharCard() {
      box.replaceChildren();
      box.appendChild(h('div', { class: 'sessao-topo' },
        h('button', { class: 'link-sair', text: '← sair', onclick: () => { document.removeEventListener('keydown', onKey); location.hash = '#/flashcards'; } }),
        badge(`${vistos.size}/${ids.length}`, 'neutro'),
        badge(materiaNome(c.materia), 'azul'),
        st.intervalo ? badge(`intervalo ${st.intervalo}d`, 'neutro') : badge('novo', 'neutro'),
        barra(ids.length ? (vistos.size / ids.length) * 100 : 0, { altura: 5 })));

      box.appendChild(h('div', {
        class: `flashcard ${virado ? 'flashcard-verso' : 'flashcard-frente'}`,
        onclick: () => { if (!virado) { virado = true; desenharCard(); } },
      },
        h('span', { class: 'flashcard-rotulo', text: virado ? 'Resposta' : 'Pergunta' }),
        markdown(virado ? c.verso : c.frente),
        !virado ? h('span', { class: 'flashcard-dica', text: 'clique ou pressione ESPAÇO para virar' }) : null));

      const acoes = h('div', { class: 'flashcard-acoes' });
      if (!virado) {
        acoes.appendChild(botao('Mostrar resposta', () => { virado = true; desenharCard(); }, { variante: 'primario', icone: '↻' }));
        acoes.appendChild(botao('Pular', () => { fila.push(fila.shift()); desenhar(); }, { variante: 'fantasma' }));
      } else {
        const graus = [
          { g: 0, rot: '1 · Errei', cor: 'perigo' },
          { g: 1, rot: '2 · Difícil', cor: 'secundario' },
          { g: 2, rot: '3 · Bom', cor: 'primario' },
          { g: 3, rot: '4 · Fácil', cor: 'sucesso' },
        ];
        for (const { g, rot, cor } of graus) {
          acoes.appendChild(h('div', { class: 'grau-wrap' },
            botao(rot, () => responder(c, g), { variante: cor }),
            h('span', { class: 'grau-proxima', text: previsao(c.id, g) })));
        }
      }
      box.appendChild(acoes);
      if (virado && c.tags?.length) box.appendChild(h('div', { class: 'flashcard-tags' }, ...c.tags.map((t) => badge(t, 'neutro'))));
    }
  }

  function previsao(id, grau) {
    const st = get().cards[id] || novoCard();
    const novo = revisar(st, grau);
    if (grau === 0) return 'volta nesta sessão';
    const d = Math.max(1, Math.round((new Date(`${novo.proxima}T12:00:00`) - new Date(`${todayKey()}T12:00:00`)) / 86400000));
    return d <= 1 ? 'em 1 dia' : d < 30 ? `em ${d} dias` : `em ~${Math.round(d / 30)} mês(es)`;
  }

  function responder(c, grau) {
    set((s) => { s.cards[c.id] = revisar(s.cards[c.id] || novoCard(), grau); });
    registrar('card', { id: c.id, grau, materia: c.materia });
    if (grau === 0) { erros += 1; fila.push(c.id); }
    else { acertos += 1; if (grau >= 2) vistos.add(c.id); else fila.push(c.id); }
    fila.shift();
    desenhar();
  }

  function montarFim() {
    document.removeEventListener('keydown', onKey);
    const min = (Date.now() - inicio) / 60000;
    return h('div', { class: 'resultado' },
      h('h2', { text: 'Sessão concluída' }),
      h('div', { class: 'resultado-numeros' },
        h('div', {}, h('strong', { text: String(vistos.size) }), h('span', { text: 'cartões revisados' })),
        h('div', {}, h('strong', { text: String(acertos) }), h('span', { text: 'acertos' })),
        h('div', {}, h('strong', { text: String(erros) }), h('span', { text: 'erros' })),
        h('div', {}, h('strong', { text: `${Math.round(min)} min` }), h('span', { text: 'duração' }))),
      h('div', { class: 'resultado-acoes' },
        botao('Voltar aos flashcards', () => { location.hash = '#/flashcards'; }, { variante: 'secundario' }),
        botao('Ir para questões', () => { location.hash = '#/questoes'; }, { variante: 'primario' })));
  }

  desenhar();
  return raiz;
}
