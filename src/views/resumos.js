/* views/resumos.js — biblioteca de resumos + leitura com gerador de IA. */

import { h, normalizar, debounce, fmtDuracao } from '../util.js';
import { get, set } from '../store.js';
import { dados, materiaNome, corMateria, resumosPorMateria, questoesPorTopico, cardsPorMateria } from '../data.js';
import { cabecalho, card, badge, botao, chipMateria, vazio, toast, markdown, carregando, barra } from '../components.js';
import { promptResumoTopico, conversar, configurado, resumoOffline, PROVEDORES } from '../ai.js';

const filtros = { materia: '', busca: '' };
const gerados = new Map(); // topicoId -> texto

export function viewResumos(opts = {}) {
  if (opts?.materia) filtros.materia = String(opts.materia);
  const raiz = h('div', { class: 'pagina' });
  function desenhar() { raiz.replaceChildren(montar()); }
  raiz.appendChild(montar());
  return raiz;

  function montar() {
    const t = normalizar(filtros.busca.trim());
    let lista = dados.resumos.filter((r) => (!filtros.materia || r.materia === filtros.materia));
    if (t) lista = lista.filter((r) => normalizar(`${r.titulo} ${r.texto} ${(r.pontosChave || []).join(' ')}`).includes(t));

    const box = h('div');
    box.appendChild(cabecalho('Resumos',
      `${dados.resumos.length} resumos curados, alinhados ao Anexo II do edital · ${dados.topicos.length} tópicos no programa`,
      [botao('Gerar resumo por tópico', () => abrirGerador(), { variante: 'secundario', icone: '🤖' })]));

    box.appendChild(card('Filtrar',
      h('div', { class: 'filtros' },
        h('div', { class: 'filtros-linha' },
          h('input', { class: 'campo campo-busca', type: 'search', placeholder: 'Buscar nos resumos…', value: filtros.busca, oninput: debounce((e) => { filtros.busca = e.target.value; desenhar(); }, 200) })),
        h('div', { class: 'filtros-chips' },
          chipMateria('Todos', '#6366f1', { ativo: filtros.materia === '', onclick: () => { filtros.materia = ''; desenhar(); } }),
          ...dados.materias.map((m) => chipMateria(m.nome, m.cor, {
            contador: resumosPorMateria(m.id).length,
            ativo: filtros.materia === m.id,
            onclick: () => { filtros.materia = m.id; desenhar(); },
          }))))));

    if (!lista.length) {
      box.appendChild(vazio('Nenhum resumo com esse filtro. Use o gerador de IA para criar um resumo de qualquer tópico do Anexo II.',
        botao('Abrir gerador', () => abrirGerador(), { variante: 'primario' })));
      return box;
    }

    for (const r of lista) {
      box.appendChild(card(null, montarResumo(r), {
        classe: 'card-resumo',
        acoes: [badge(materiaNome(r.materia), 'azul'), r.tempoLeituraMin ? badge(`~${r.tempoLeituraMin} min`, 'neutro') : null],
      }));
    }
    return box;
  }

  function montarResumo(r) {
    const box = h('article', { class: 'resumo' });
    box.appendChild(h('h2', { text: r.titulo }));
    const topico = dados.topicos.find((t) => t.id === r.topico);
    box.appendChild(h('div', { class: 'resumo-meta' },
      topico ? h('span', { class: 'resumo-topico', text: `Tópico do edital: ${topico.texto.slice(0, 220)}` }) : null,
      r.revisar ? h('span', { class: 'aviso-revisao', text: `⚠ ${r.revisar}` }) : null));
    box.appendChild(h('div', { class: 'resumo-corpo' },
      h('details', { open: true }, h('summary', { text: 'Ler resumo completo' }), markdown(r.texto))));

    if (r.pontosChave?.length) {
      box.appendChild(h('div', { class: 'resumo-bloco' },
        h('h4', { text: '✅ Pontos-chave' }),
        h('ul', {}, ...r.pontosChave.map((p) => h('li', { text: p })))));
    }
    if (r.mnemonicos?.length) {
      box.appendChild(h('div', { class: 'resumo-bloco mnemonico' },
        h('h4', { text: '🧠 Mnemônicos' }),
        h('ul', {}, ...r.mnemonicos.map((p) => h('li', { text: p })))));
    }
    if (r.caiNaProva) {
      box.appendChild(h('div', { class: 'resumo-bloco pegadinhas' },
        h('h4', { text: '🎯 Como cai na prova' }), h('p', { text: r.caiNaProva })));
    }
    if (r.leiSeca?.length) {
      box.appendChild(h('div', { class: 'resumo-bloco lei-seca' },
        h('h4', { text: '📜 Legislação' }),
        h('ul', {}, ...r.leiSeca.map((p) => h('li', { text: p })))));
    }

    const qs = questoesPorTopico(r.topico);
    box.appendChild(h('div', { class: 'resumo-acoes' },
      qs.length ? botao(`Treinar ${qs.length} questão(ões) deste tópico`, () => treinar(qs, r.titulo), { variante: 'primario' }) : null,
      botao('Treinar a matéria', () => { location.hash = `#/treino/${r.materia}`; }, { variante: 'secundario' }),
      botao('Ver tópico no currículo', () => { location.hash = `#/curriculo/${r.materia}`; }, { variante: 'fantasma' }),
      botao('🤖 Aprofundar com IA', () => aprofundar(r, box), { variante: 'fantasma' })));
    return box;
  }
}

function treinar(qs, titulo) {
  import('./resolver.js').then(({ criarResolver }) => {
    document.getElementById('app').replaceChildren(criarResolver({ questoes: qs, modo: 'livre', titulo }));
    window.scrollTo(0, 0);
  });
}

async function aprofundar(r, box) {
  const cfg = get().ai;
  const topico = dados.topicos.find((t) => t.id === r.topico);
  const materia = dados.materias.find((m) => m.id === r.materia);
  if (!configurado(cfg)) {
    toast('Configure uma chave de IA em Configurações para aprofundar.', 'aviso', 4000);
    location.hash = '#/config';
    return;
  }
  const alvo = h('div', { class: 'ia-saida' }, carregando('Gerando aprofundamento…'));
  box.appendChild(alvo);
  const prompt = `${promptResumoTopico(topico || { texto: r.titulo }, materia)}\n\nContexto que o estudante já leu (aprofunde além disso, sem repetir):\n${r.pontosChave?.join('\n') || ''}`;
  const resp = await conversar(cfg, [{ role: 'user', content: prompt }], { maxTokens: 1600 });
  alvo.replaceChildren(markdown(resp.texto || `_Não foi possível gerar (${resp.erro || 'modo offline'})._`));
}

/* ---------------- gerador por tópico ---------------- */

function abrirGerador() {
  const box = h('div', { class: 'form' });
  let materiaSel = dados.materias[0]?.id;
  let topicoSel = null;

  const selMateria = h('select', { class: 'campo', onchange: (e) => { materiaSel = e.target.value; preencherTopicos(); } },
    ...dados.materias.map((m) => h('option', { value: m.id, text: m.nome })));

  const selTopico = h('select', { class: 'campo' });
  function preencherTopicos() {
    const tops = dados.topicos.filter((t) => t.materia === materiaSel);
    selTopico.replaceChildren(...tops.map((t) => h('option', { value: t.id, text: `${t.texto.slice(0, 130)}${t.texto.length > 130 ? '…' : ''}` })));
    topicoSel = tops[0]?.id || null;
    selTopico.onchange = (e) => { topicoSel = e.target.value; };
  }
  preencherTopicos();

  const saida = h('div', { class: 'ia-saida' });
  box.append(
    h('label', {}, h('span', { text: 'Matéria' }), selMateria),
    h('label', {}, h('span', { text: 'Tópico do Anexo II' }), selTopico),
    h('p', { class: 'nota', text: configurado(get().ai)
      ? `IA configurada (${PROVEDORES[get().ai.provedor]?.nome}). O resumo será gerado sob demanda.`
      : 'Sem chave de IA configurada: o app monta o resumo offline a partir dos resumos, flashcards e questões já curados para este tópico.' }),
    h('div', { class: 'form-acoes' },
      botao('Gerar resumo', async () => {
        const topico = dados.topicos.find((t) => t.id === topicoSel);
        if (!topico) return;
        saida.replaceChildren(carregando('Preparando resumo…'));
        const cfg = get().ai;
        if (configurado(cfg)) {
          const materia = dados.materias.find((m) => m.id === topico.materia);
          const resp = await conversar(cfg, [{ role: 'user', content: promptResumoTopico(topico, materia) }], { maxTokens: 1800 });
          if (resp.texto) {
            gerados.set(topico.id, resp.texto);
            saida.replaceChildren(h('div', {}, markdown(resp.texto),
              h('div', { class: 'form-acoes' },
                botao('💾 Salvar como resumo local', () => salvarGerado(topico, resp.texto), { variante: 'secundario' }),
                botao('Treinar questões deste tópico', () => { const qs = questoesPorTopico(topico.id); if (qs.length) treinar(qs, topico.texto.slice(0, 60)); else toast('Sem questões para este tópico ainda.', 'aviso'); }, { variante: 'primario' }))));
            return;
          }
          toast(`IA indisponível (${resp.erro}). Usando modo offline.`, 'aviso', 5000);
        }
        const txt = resumoOffline(topico);
        saida.replaceChildren(h('div', {}, markdown(txt),
          h('div', { class: 'form-acoes' },
            botao('💾 Salvar como resumo local', () => salvarGerado(topico, txt), { variante: 'secundario' }))));
      }, { variante: 'primario' })),
    saida);

  const alvo = document.getElementById('app');
  alvo.replaceChildren(h('div', { class: 'pagina' },
    cabecalho('Gerar resumo por tópico', 'Escolha qualquer um dos 319 tópicos do Anexo II',
      [botao('← Voltar', () => { location.hash = '#/resumos'; }, { variante: 'fantasma' })]),
    card('Selecione o tópico', box)));
  window.scrollTo(0, 0);
}

function salvarGerado(topico, texto) {
  set((s) => {
    s.resumosGerados = s.resumosGerados || [];
    s.resumosGerados.unshift({
      id: `gen-${topico.id}-${Date.now().toString(36)}`,
      materia: topico.materia,
      topico: topico.id,
      titulo: topico.texto.slice(0, 90),
      texto,
      criadoEm: new Date().toISOString(),
      origem: 'ia',
    });
  });
  toast('Resumo salvo localmente (exporte em Configurações para não perder).', 'sucesso', 4000);
}
