/* views/resolver.js — widget de resolução de questões, reutilizado por
 * treino livre, caderno de erros e simulados. */

import { h, shuffle, paragrafos } from '../util.js';
import { get, set, registrarResposta } from '../store.js';
import { materiaNome, topicoTexto } from '../data.js';
import { avaliarQuestao, revisar } from '../srs.js';
import { badge, botao, barra, seloDificuldade, blocoLeiSeca, blocoPegadinhas, blocoMnemonico, toast } from '../components.js';

/**
 * @param {object} cfg
 * @param {Array}  cfg.questoes     lista de questões normalizadas
 * @param {string} cfg.modo         'livre' | 'simulado'
 * @param {string} cfg.titulo
 * @param {Function} cfg.aoConcluir ({ respostas, acertos, total, duracaoMin }) => Node|void
 * @param {Function} cfg.aoResponder (questao, letra, acertou) => void
 * @param {boolean} cfg.cronometrar  mostrar cronômetro
 * @param {number}  cfg.limiteMin    limite em minutos (simulado)
 * @param {boolean} cfg.comentarioImediato
 */
export function criarResolver(cfg) {
  const {
    questoes = [],
    modo = 'livre',
    titulo = 'Sessão de questões',
    aoConcluir = null,
    aoResponder = null,
    cronometrar = false,
    limiteMin = 0,
    comentarioImediato = null,
  } = cfg;

  const config = get().config;
  const mostrarComentario = comentarioImediato ?? (modo === 'livre' ? true : false);
  const lista = config.embaralharAlternativas ? questoes.map((q) => ({ ...q, alternativas: shuffle(q.alternativas) })) : questoes;

  const estado = {
    indice: 0,
    respostas: new Map(), // qid -> letra
    marcadas: new Map(),  // qid -> letra (antes de confirmar)
    reveladas: new Set(), // qid já com comentário visível
    inicio: Date.now(),
    timerId: null,
    encerrado: false,
  };

  const raiz = h('div', { class: 'resolver' });
  const topo = h('div', { class: 'resolver-topo' });
  const corpo = h('div', { class: 'resolver-corpo' });
  const rodape = h('div', { class: 'resolver-rodape' });
  raiz.append(topo, corpo, rodape);

  function desenhar() {
    if (estado.encerrado) return;
    const q = lista[estado.indice];
    topo.replaceChildren(montarTopo(q));
    corpo.replaceChildren(montarQuestao(q));
    rodape.replaceChildren(montarRodape(q));
  }

  function montarTopo(q) {
    const itens = [];
    itens.push(h('div', { class: 'resolver-titulo' },
      h('button', { class: 'link-sair', text: '← sair', onclick: () => encerrar(true) }),
      h('strong', { text: titulo })));
    itens.push(h('div', { class: 'resolver-meta' },
      badge(`${estado.indice + 1}/${lista.length}`, 'neutro'),
      badge(materiaNome(q.materia), 'azul'),
      seloDificuldade(q.dificuldade),
      cronometrar ? montarCronometro() : null));
    itens.push(barra(((estado.indice) / lista.length) * 100, { altura: 5 }));
    return h('div', { class: 'resolver-cabecalho' }, ...itens);
  }

  let cronometroEl = null;
  function montarCronometro() {
    cronometroEl = h('span', { class: 'cronometro badge badge-neutro', text: '00:00' });
    return cronometroEl;
  }

  function tempoDecorridoMin() { return (Date.now() - estado.inicio) / 60000; }

  function tick() {
    if (!cronometroEl) return;
    const seg = Math.floor((Date.now() - estado.inicio) / 1000);
    const restante = limiteMin ? Math.max(0, limiteMin * 60 - seg) : seg;
    const mm = String(Math.floor(restante / 60)).padStart(2, '0');
    const ss = String(restante % 60).padStart(2, '0');
    cronometroEl.textContent = `${mm}:${ss}`;
    if (limiteMin) {
      cronometroEl.classList.toggle('badge-vermelho', restante < 300);
      if (restante === 0) { toast('Tempo esgotado!', 'erro'); encerrar(false); }
    }
  }

  function montarQuestao(q) {
    const marcada = estado.marcadas.get(q.id);
    const revelada = estado.reveladas.has(q.id);
    const caixa = h('article', { class: `questao ${revelada ? 'questao-revelada' : ''}` });

    if (q.contexto) caixa.appendChild(h('div', { class: 'questao-contexto' }, paragrafos(q.contexto)));
    caixa.appendChild(h('h3', { class: 'questao-enunciado', text: q.enunciado }));

    if (modo === 'livre') {
      caixa.appendChild(h('div', { class: 'questao-topico' },
        h('span', { class: 'rotulo', text: 'Tópico do edital:' }),
        h('span', { text: topicoTexto(q.topico) })));
    }

    const alts = h('div', { class: 'alternativas', role: 'radiogroup' });
    for (const a of q.alternativas) {
      let classe = 'alternativa';
      if (marcada === a.letra) classe += ' alternativa-marcada';
      if (revelada) {
        classe += a.letra === q.gabarito ? ' alternativa-certa' : ' alternativa-errada';
        if (marcada === a.letra && marcada !== q.gabarito) classe += ' alternativa-marcada-errada';
      }
      alts.appendChild(h('button', {
        class: classe,
        type: 'button',
        disabled: revelada,
        onclick: () => { estado.marcadas.set(q.id, a.letra); desenhar(); },
      },
        h('span', { class: 'alternativa-letra', text: a.letra }),
        h('span', { class: 'alternativa-texto', text: a.texto })));
    }
    caixa.appendChild(alts);

    if (revelada) caixa.appendChild(montarFeedback(q, marcada));
    return caixa;
  }

  function montarFeedback(q, marcada) {
    const acertou = marcada === q.gabarito;
    const box = h('div', { class: `feedback ${acertou ? 'feedback-certo' : 'feedback-errado'}` });
    box.appendChild(h('div', { class: 'feedback-titulo' },
      h('strong', { text: acertou ? '✓ Você acertou' : `✗ Você errou` }),
      h('span', { text: `Gabarito: ${q.gabarito}` })));

    if (acertou && q.comentario) {
      box.appendChild(h('details', { class: 'feedback-comentario' },
        h('summary', { text: 'Ver comentário completo' }),
        paragrafos(q.comentario, 'comentario-texto')));
    } else {
      box.appendChild(h('div', { class: 'feedback-comentario' }, paragrafos(q.comentario, 'comentario-texto')));
    }

    if (q.mnemonico) box.appendChild(blocoMnemonico(q.mnemonico));
    if (q.pegadinhas?.length) box.appendChild(blocoPegadinhas(q.pegadinhas));
    if (q.leiSeca?.length) box.appendChild(blocoLeiSeca(q.leiSeca));
    if (q.estrategia) box.appendChild(h('div', { class: 'estrategia' }, h('h4', { text: 'Estratégia' }), paragrafos(q.estrategia)));
    if (q.estiloBanca) box.appendChild(h('div', { class: 'estilo-banca' }, h('h4', { text: 'Como a CETAP cobra' }), paragrafos(q.estiloBanca)));
    if (q.revisar) box.appendChild(h('div', { class: 'aviso-revisao' }, h('strong', { text: '⚠ Confirmar na fonte oficial:' }), h('span', { text: ` ${q.revisar}` })));

    box.appendChild(h('div', { class: 'feedback-acoes' },
      botao('💬 Perguntar ao tutor', () => { location.hash = `#/tutor?pergunta=${encodeURIComponent(`Explique alternativa por alternativa: ${q.enunciado}`)}`; }, { variante: 'fantasma' }),
      botao('🔖 Marcar para revisar', () => marcarParaRevisao(q.id), { variante: 'fantasma' }),
    ));
    return box;
  }

  function montarRodape(q) {
    const marcada = estado.marcadas.get(q.id);
    const revelada = estado.reveladas.has(q.id);
    const botoes = [];

    if (modo === 'livre' && !revelada) {
      botoes.push(botao('Confirmar resposta', () => confirmar(q), { variante: 'primario', desabilitado: !marcada, icone: '✓' }));
      botoes.push(botao('Mostrar gabarito', () => { estado.reveladas.add(q.id); revelar(q, marcada, true); }, { variante: 'secundario', icone: '👁' }));
    } else if (modo === 'simulado' && !revelada) {
      botoes.push(botao(marcada ? `Marcada: ${marcada} — seguir` : 'Seguir sem marcar', () => avancar(q), { variante: 'primario' }));
    }

    if (revelada || modo === 'simulado') {
      const ultimo = estado.indice === lista.length - 1;
      botoes.push(botao(ultimo ? 'Finalizar' : 'Próxima →', () => {
        if (ultimo) encerrar(false);
        else { estado.indice += 1; desenhar(); }
      }, { variante: ultimo ? 'sucesso' : 'primario' }));
      if (!ultimo) {
        botoes.push(botao('← Anterior', () => { estado.indice = Math.max(0, estado.indice - 1); desenhar(); }, { variante: 'fantasma' }));
      }
    }

    // navegação rápida (grade de questões)
    const grade = h('div', { class: 'grade-questoes' },
      ...lista.map((qq, i) => {
        const resp = estado.respostas.get(qq.id);
        const certa = resp && resp === qq.gabarito;
        let cls = 'grade-item';
        if (i === estado.indice) cls += ' grade-atual';
        if (resp) cls += modo === 'livre' ? (certa ? ' grade-certa' : ' grade-errada') : ' grade-marcada';
        return h('button', { class: cls, text: String(i + 1), type: 'button', title: qq.materiaNome, onclick: () => { estado.indice = i; desenhar(); } });
      }));

    return h('div', { class: 'rodape-inner' },
      h('div', { class: 'rodape-botoes' }, ...botoes),
      grade);
  }

  function confirmar(q) {
    const letra = estado.marcadas.get(q.id);
    if (!letra) return;
    estado.reveladas.add(q.id);
    revelar(q, letra, false);
  }

  function revelar(q, letra, pulou) {
    if (letra) {
      const acertou = registrarResposta(q.id, q.gabarito, letra, { materia: q.materia, topico: q.topico, modo });
      // alimenta o SRS das questões como se fossem cards
      set((s) => {
        s.cards[`q:${q.id}`] = revisar(s.cards[`q:${q.id}`], avaliarQuestao(acertou, { jaTinhaErrado: (s.questoes[q.id]?.erros || 0) > 1 }));
      });
      aoResponder?.(q, letra, acertou);
    } else if (pulou) {
      registrarResposta(q.id, q.gabarito, letra, { materia: q.materia, modo });
    }
    estado.respostas.set(q.id, letra || null);
    desenhar();
  }

  function avancar(q) {
    const letra = estado.marcadas.get(q.id);
    estado.respostas.set(q.id, letra || null);
    if (estado.indice < lista.length - 1) { estado.indice += 1; desenhar(); }
  }

  function marcarParaRevisao(qid) {
    set((s) => { s.questoes[qid] = { ...(s.questoes[qid] || {}), id: qid, marcadaParaRevisao: true, marcadoEm: new Date().toISOString() }; });
    toast('Questão marcada para revisão.', 'sucesso', 1800);
  }

  function encerrar(cancelado) {
    if (estado.encerrado) return;
    clearInterval(estado.timerId);
    estado.encerrado = true;
    const duracaoMin = tempoDecorridoMin();
    const respostas = [...estado.respostas.entries()].map(([qid, letra]) => ({ qid, letra }));
    const resultado = {
      cancelado,
      respostas,
      total: lista.length,
      respondidas: respostas.filter((r) => r.letra).length,
      acertos: respostas.filter((r) => {
        const q = lista.find((x) => x.id === r.qid);
        return q && r.letra && r.letra === q.gabarito;
      }).length,
      duracaoMin,
      questoes: lista,
    };
    if (cancelado && !respostas.length) {
      location.hash = '#/';
      return;
    }
    const node = aoConcluir?.(resultado);
    if (node instanceof Node) raiz.replaceChildren(node);
    else raiz.replaceChildren(montarResultadoPadrao(resultado));
  }

  function montarResultadoPadrao(r) {
    const taxa = r.total ? Math.round((r.acertos / r.total) * 100) : 0;
    const box = h('div', { class: 'resultado' },
      h('h2', { text: r.cancelado ? 'Sessão encerrada' : 'Resultado da sessão' }),
      h('div', { class: 'resultado-numeros' },
        h('div', {}, h('strong', { text: `${r.acertos}/${r.total}` }), h('span', { text: 'acertos' })),
        h('div', {}, h('strong', { text: `${taxa}%` }), h('span', { text: 'aproveitamento' })),
        h('div', {}, h('strong', { text: `${Math.round(r.duracaoMin)} min` }), h('span', { text: 'duração' }))));
    box.appendChild(barra(taxa, { rotulo: 'Desempenho', cor: taxa >= 60 ? 'var(--verde)' : 'var(--vermelho)' }));

    const detalhes = h('div', { class: 'resultado-lista' });
    for (const q of lista) {
      const letra = r.respostas.find((x) => x.qid === q.id)?.letra;
      const acertou = letra && letra === q.gabarito;
      detalhes.appendChild(h('details', { class: `item-resultado ${acertou ? 'ok' : 'erro'}` },
        h('summary', {},
          h('span', { class: 'marca', text: letra ? (acertou ? '✓' : '✗') : '—' }),
          h('span', { class: 'enunciado', text: q.enunciado.slice(0, 120) + (q.enunciado.length > 120 ? '…' : '') }),
          h('span', { class: 'gab', text: `gabarito ${q.gabarito}` })),
        h('div', { class: 'item-corpo' },
          h('p', { text: `Você marcou: ${letra || '(em branco)'}` }),
          paragrafos(q.comentario, 'comentario-texto'),
          botao('Rever questão', () => { estado.encerrado = false; estado.indice = lista.indexOf(q); estado.reveladas.clear(); estado.marcadas.clear(); desenhar(); }, { variante: 'fantasma' }))));
    }
    box.appendChild(detalhes);
    box.appendChild(h('div', { class: 'resultado-acoes' },
      botao('Voltar ao início', () => { location.hash = '#/'; }, { variante: 'secundario' }),
      botao('Refazer esta sessão', () => { location.reload(); }, { variante: 'primario' })));
    return box;
  }

  if (cronometrar || modo === 'simulado') {
    estado.timerId = setInterval(tick, 1000);
    tick();
  }
  if (!lista.length) {
    raiz.replaceChildren(h('div', { class: 'vazio' }, h('p', { text: 'Nenhuma questão disponível para esta seleção.' }),
      botao('Voltar', () => { location.hash = '#/questoes'; }, { variante: 'secundario' })));
    return raiz;
  }
  desenhar();
  return raiz;
}
