/* views/tutor.js — chat com o tutor IA (chave própria) + gerador de questões. */

import { h, uid, shuffle, normalizar } from '../util.js';
import { get, set } from '../store.js';
import { dados, materiaNome, listarMaterias, topicoPorId } from '../data.js';
import { cabecalho, card, badge, botao, toast, markdown, carregando, vazio, seloDificuldade, chipMateria } from '../components.js';
import { conversar, configurado, PROVEDORES, promptExplicarAlternativas, promptGerarQuestoes, promptPlanoDeEstudo, extrairJSON, validarQuestaoGerada, explicacaoOffline } from '../ai.js';
import { statsPorMateria } from '../store.js';

const historico = []; // [{role, content}]

const ATALHOS = [
  { rot: '📋 Explicar alternativa por alternativa', tipo: 'explicar' },
  { rot: '🎲 Gerar 5 questões inéditas', tipo: 'gerar' },
  { rot: '🗓 Plano de estudo personalizado', tipo: 'plano' },
  { rot: '⚖ Comparar institutos parecidos', tipo: 'comparar' },
  { rot: '🧠 Criar mnemônicos', tipo: 'mnemonico' },
  { rot: '📜 Resumir lei seca', tipo: 'leisecca' },
  { rot: '🎯 O que estudar nesta semana', tipo: 'semana' },
];

export function viewTutor({ query }) {
  const raiz = h('div', { class: 'pagina pagina-tutor' });
  const cfg = get().ai;

  raiz.appendChild(cabecalho('Tutor IA',
    configurado(cfg)
      ? `Conectado a ${PROVEDORES[cfg.provedor]?.nome} · modelo ${cfg.modelo || PROVEDORES[cfg.provedor]?.padraoModelo}`
      : 'Modo offline — configure sua própria chave de IA para respostas generativas',
    [botao('⚙ Configurar IA', () => { location.hash = '#/config'; }, { variante: 'secundario' })]));

  if (!configurado(cfg)) {
    raiz.appendChild(card('Como funciona',
      markdown(`Este app **não tem servidor** — todo o conteúdo roda no seu navegador. Por isso, a IA é opcional e usa **a sua própria chave**.

**O que funciona SEM chave (modo offline):**
- 101 questões comentadas com gabarito, mnemônico, lei seca, pegadinhas e estratégia de resolução;
- ${dados.resumos.length} resumos curados por matéria;
- ${dados.flashcards.length} flashcards com repetição espaçada;
- explicação automática de qualquer questão do banco (montada a partir dos comentários já curados);
- diagnóstico de desempenho e plano de estudos gerados por regras.

**O que a chave de IA acrescenta:**
- resumos sob demanda para qualquer um dos ${dados.topicos.length} tópicos do Anexo II;
- geração de questões inéditas no estilo da Fundação CETAP (importadas para um banco local);
- respostas a dúvidas livres, com o contexto do edital já injetado no prompt de sistema;
- plano de estudo adaptativo.

**Como obter uma chave (grátis em quase todos os casos):**
- Google AI Studio → \`aistudio.google.com/app/apikey\` (tem cota gratuita generosa)
- OpenAI → \`platform.openai.com/api-keys\`
- Anthropic → \`console.anthropic.com/settings/keys\`
- Groq / OpenRouter / Ollama local → use o provedor "Compatível com OpenAI"

A chave fica **somente no seu navegador** (localStorage) e é enviada direto ao provedor escolhido. Nenhum dado passa por servidor deste projeto.`)));
  }

  /* ---- atalhos ---- */
  raiz.appendChild(card('Atalhos',
    h('div', { class: 'atalhos' }, ...ATALHOS.map((a) => botao(a.rot, () => executarAtalho(a.tipo), { variante: 'secundario' })))));

  /* ---- conversa ---- */
  const conversa = h('div', { class: 'conversa' });
  const entrada = h('textarea', {
    class: 'campo', rows: 3,
    placeholder: configurado(cfg)
      ? 'Pergunte qualquer coisa do edital… (Ctrl+Enter para enviar)'
      : 'Modo offline: a resposta vem do banco curado do app. Descreva a dúvida ou cole o enunciado de uma questão.',
    onkeydown: (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); enviar(); } },
  });
  const btnEnviar = botao('Enviar', () => enviar(), { variante: 'primario', icone: '➤' });

  raiz.appendChild(card(null, h('div', {}, conversa, h('div', { class: 'tutor-entrada' }, entrada, btnEnviar)), { classe: 'card-tutor' }));

  /* ---- questões geradas ---- */
  const geradas = get().questoesGeradas || [];
  if (geradas.length) {
    raiz.appendChild(card(`Questões geradas por IA (${geradas.length})`,
      h('div', {},
        h('p', { class: 'nota', text: 'Estas questões foram criadas pela IA e marcadas com o selo "revisar". Confira sempre o gabarito na lei seca antes de memorizar.' }),
        h('div', { class: 'form-acoes' },
          botao(`Treinar as ${geradas.length}`, () => treinarGeradas(geradas), { variante: 'primario' }),
          botao('Exportar para o banco', () => exportarGeradas(), { variante: 'secundario' }),
          botao('Apagar todas', () => { set((s) => { s.questoesGeradas = []; }); toast('Questões geradas removidas.', 'sucesso'); location.reload(); }, { variante: 'perigo' })),
        h('div', { class: 'tabela-questoes' }, ...geradas.map((q) => h('details', { class: 'linha-questao' },
          h('summary', {},
            badge(materiaNome(q.materia), 'azul'),
            h('span', { class: 'linha-enunciado', text: q.enunciado }),
            seloDificuldade(q.dificuldade)),
          h('div', { class: 'linha-corpo' },
            h('div', { class: 'linha-alternativas' }, ...q.alternativas.map((a) => h('p', { class: a.letra === q.gabarito ? 'alt-certa' : '', text: `${a.letra}) ${a.texto}` }))),
            markdown(q.comentario || ''),
            botao('Remover', () => { set((s) => { s.questoesGeradas = s.questoesGeradas.filter((x) => x.id !== q.id); }); location.reload(); }, { variante: 'fantasma' }))))))));
  }

  const perguntaInicial = query.get('pergunta');
  if (perguntaInicial) {
    entrada.value = perguntaInicial;
    setTimeout(() => enviar(), 60);
  } else {
    desenharConversa();
  }

  function desenharConversa() {
    conversa.replaceChildren();
    if (!historico.length) {
      conversa.appendChild(h('div', { class: 'vazio' },
        h('p', { text: 'Nenhuma conversa ainda. Use um atalho acima ou escreva sua dúvida.' }),
        h('p', { class: 'nota', text: 'Ex.: "Explique a diferença entre anulação, revogação, cassação e caducidade com exemplos." ' })));
      return;
    }
    for (const m of historico) {
      conversa.appendChild(h('div', { class: `msg msg-${m.role}` },
        h('span', { class: 'msg-autor', text: m.role === 'user' ? 'Você' : 'Tutor' }),
        m.role === 'user' ? h('div', { class: 'msg-texto' }, h('p', { text: m.content })) : markdown(m.content),
        m.fonte ? h('span', { class: 'msg-fonte', text: m.fonte }) : null));
    }
    conversa.scrollTop = conversa.scrollHeight;
  }

  async function enviar(textoOverride = null) {
    const texto = (textoOverride ?? entrada.value).trim();
    if (!texto) return;
    entrada.value = '';
    historico.push({ role: 'user', content: texto });
    desenharConversa();

    const alvo = h('div', { class: 'msg msg-assistant' }, carregando('Pensando…'));
    conversa.appendChild(alvo);
    conversa.scrollTop = conversa.scrollHeight;

    const cfgAgora = get().ai;
    if (configurado(cfgAgora)) {
      const resp = await conversar(cfgAgora, [...historico], { maxTokens: 1600 });
      if (resp.texto) {
        historico.push({ role: 'assistant', content: resp.texto, fonte: `${PROVEDORES[cfgAgora.provedor]?.nome} · ${resp.modelo || cfgAgora.modelo}` });
      } else {
        const offline = responderOffline(texto);
        historico.push({ role: 'assistant', content: offline.texto, fonte: `modo offline (${resp.erro || 'IA indisponível'})` });
      }
    } else {
      const offline = responderOffline(texto);
      historico.push({ role: 'assistant', content: offline.texto, fonte: 'modo offline — banco curado do app' });
    }
    desenharConversa();
  }

  /* ---------- modo offline: responde com o que já existe no banco ---------- */
  function responderOffline(texto) {
    const t = normalizar(texto);

    // se colou um enunciado do banco, devolve a explicação completa
    const q = dados.questoes.find((x) => normalizar(x.enunciado).slice(0, 60) === t.slice(0, 60))
      || dados.questoes.find((x) => t.includes(normalizar(x.enunciado).slice(0, 40)));
    if (q) return { texto: explicacaoOffline(q) };

    const achados = [];
    for (const qq of dados.questoes) {
      const alvo = normalizar(`${qq.enunciado} ${qq.comentario} ${(qq.tags || []).join(' ')} ${(qq.leiSeca || []).join(' ')}`);
      let score = 0;
      for (const termo of t.split(/\s+/).filter((p) => p.length > 3)) if (alvo.includes(termo)) score += 1;
      if (score >= 2) achados.push({ score, tipo: 'questao', item: qq });
    }
    for (const r of dados.resumos) {
      const alvo = normalizar(`${r.titulo} ${r.texto} ${(r.pontosChave || []).join(' ')}`);
      let score = 0;
      for (const termo of t.split(/\s+/).filter((p) => p.length > 3)) if (alvo.includes(termo)) score += 1;
      if (score >= 2) achados.push({ score: score + 1, tipo: 'resumo', item: r });
    }
    for (const c of dados.flashcards) {
      const alvo = normalizar(`${c.frente} ${c.verso}`);
      let score = 0;
      for (const termo of t.split(/\s+/).filter((p) => p.length > 3)) if (alvo.includes(termo)) score += 1;
      if (score >= 2) achados.push({ score, tipo: 'card', item: c });
    }
    achados.sort((a, b) => b.score - a.score);

    if (!achados.length) {
      return {
        texto: `Não encontrei conteúdo curado sobre isso no banco local (modo offline).

**O que você pode fazer:**
1. Configurar uma chave de IA em **Configurações → Inteligência artificial** para respostas generativas.
2. Reformular usando termos do edital (ex.: "autotutela", "súmula 473", "vacatio legis", "regra de ouro").
3. Abrir o **Banco de questões** e buscar pelo termo — lá a busca cobre enunciado, comentário, tags e legislação.`,
      };
    }

    const partes = ['Encontrei isto no banco curado do app:'];
    for (const a of achados.slice(0, 4)) {
      if (a.tipo === 'resumo') partes.push(`\n---\n\n### 📖 ${a.item.titulo}\n\n${a.item.texto.slice(0, 1600)}${a.item.texto.length > 1600 ? '\n\n_[resumo truncado — abra em Resumos para ler inteiro]_' : ''}`);
      else if (a.tipo === 'questao') partes.push(`\n---\n\n${explicacaoOffline(a.item)}`);
      else partes.push(`\n---\n\n### 🃏 Flashcard\n\n**P:** ${a.item.frente}\n\n**R:** ${a.item.verso}`);
    }
    partes.push('\n---\n\n> Modo offline: conteúdo reorganizado a partir do banco curado. Nada foi inventado.');
    return { texto: partes.join('\n') };
  }

  /* ---------- atalhos ---------- */
  async function executarAtalho(tipo) {
    if (tipo === 'explicar') return escolherQuestaoParaExplicar();
    if (tipo === 'gerar') return abrirGeradorDeQuestoes();
    if (tipo === 'plano') {
      const e = get();
      const prova = e.perfil.dataProva;
      const dias = prova ? Math.max(0, diffDias(prova)) : 60;
      const porMat = statsPorMateria(dados.questoes).filter((m) => m.tentativas > 0);
      const fracos = porMat.sort((a, b) => a.taxa - b.taxa).slice(0, 5).map((m) => materiaNome(m.materia));
      return enviar(promptPlanoDeEstudo({ diasRestantes: dias, horasPorDia: e.perfil.horasPorDia, statsPorMateria: porMat.map((m) => ({ ...m, materia: materiaNome(m.materia) })), pontosFracos: fracos }));
    }
    if (tipo === 'comparar') return enviar('Compare, em tabela, os institutos que os candidatos mais confundem no Direito Administrativo: anulação × revogação × cassação × caducidade × convalidação. Para cada um dê: fundamento, efeito (ex tunc/ex nunc), quem pode praticar, prazo e um exemplo prático. Termine com 3 pegadinhas típicas da Fundação CETAP.');
    if (tipo === 'mnemonico') return enviar('Crie 10 mnemônicos originais e curtos para os pontos mais cobrados do edital ALEPA 2026 (Cargo 02 — Assessor Técnico): princípios da administração, elementos e atributos do ato administrativo, espécies normativas do art. 59 da CF, prazos do processo legislativo, limites de pessoal da LRF, créditos adicionais, segurados do RGPS, classes de dependentes, métodos de arquivamento e remédios constitucionais. Para cada um explique em uma linha como usar.');
    if (tipo === 'leisecca') return escolherMateriaParaLeiSeca();
    if (tipo === 'semana') {
      const e = get();
      return enviar(`Considerando que faltam ${e.perfil.dataProva ? diffDias(e.perfil.dataProva) : '?'} dias para a prova da ALEPA (13/12/2026) e que eu estudo ${e.perfil.horasPorDia} h por dia, monte o cronograma dos próximos 7 dias, dia a dia, com blocos de 50 minutos. Priorize Conhecimentos Específicos (4,0 pontos em 20 questões), depois Português e Legislação (2,0 pontos cada, em 10 questões), e por último Informática e Raciocínio Lógico (1,0 ponto cada, em 5 questões) — cada questão vale 0,2. Indique também quantas questões devo resolver por dia.`);
    }
  }

  function diffDias(data) {
    const a = new Date(`${data}T12:00:00`);
    const b = new Date();
    return Math.ceil((a - b) / 86400000);
  }

  function escolherQuestaoParaExplicar() {
    let sel = dados.questoes[0]?.id;
    const corpo = h('div', { class: 'form' },
      h('label', {}, h('span', { text: 'Questão do banco' }),
        h('select', { class: 'campo', size: 12, onchange: (e) => { sel = e.target.value; } },
          ...dados.questoes.map((q) => h('option', { value: q.id, text: `${materiaNome(q.materia)} — ${q.enunciado.slice(0, 90)}` })))),
      h('p', { class: 'nota', text: 'A explicação usa o comentário já curado; com IA configurada, ela aprofunda alternativa por alternativa.' }));
    import('../components.js').then(({ modal }) => {
      const m = modal({
        titulo: 'Explicar questão',
        corpo,
        acoes: [botao('Explicar', () => {
          const q = dados.questoes.find((x) => x.id === sel);
          m.fechar();
          if (configurado(get().ai)) enviar(promptExplicarAlternativas(q));
          else { historico.push({ role: 'user', content: `Explique: ${q.enunciado}` }); historico.push({ role: 'assistant', content: explicacaoOffline(q), fonte: 'modo offline' }); desenharConversa(); }
        }, { variante: 'primario' })],
      });
    });
  }

  function escolherMateriaParaLeiSeca() {
    let sel = 'dir-adm';
    const corpo = h('div', { class: 'form' },
      h('label', {}, h('span', { text: 'Matéria' }),
        h('select', { class: 'campo', onchange: (e) => { sel = e.target.value; } },
          ...dados.materias.map((m) => h('option', { value: m.id, selected: m.id === sel, text: m.nome })))),
      h('p', { class: 'nota', text: 'A IA vai resumir os dispositivos mais cobrados da matéria.' }));
    import('../components.js').then(({ modal }) => {
      const m = modal({
        titulo: 'Resumir lei seca',
        corpo,
        acoes: [botao('Gerar', () => {
          m.fechar();
          enviar(`Faça um resumo de LEI SECA da matéria "${materiaNome(sel)}" focado no que a Fundação CETAP cobra em prova objetiva para cargo de nível superior. Liste, em tópicos, os dispositivos com maior incidência: artigo, conteúdo essencial, prazos, quóruns, competências e exceções. Não invente números de artigo — se não tiver certeza, escreva "[confirmar]".`);
        }, { variante: 'primario' })],
      });
    });
  }

  /* ---------- gerador de questões ---------- */
  function abrirGeradorDeQuestoes() {
    let matSel = 'dir-adm';
    let topSel = '';
    let qtd = 5;
    let dif = 'medio';

    const selTopico = h('select', { class: 'campo' });
    function preencher() {
      const tops = dados.topicos.filter((t) => t.materia === matSel);
      selTopico.replaceChildren(h('option', { value: '', text: '— matéria inteira —' }), ...tops.map((t) => h('option', { value: t.id, text: t.texto.slice(0, 120) })));
      topSel = '';
    }
    preencher();

    const corpo = h('div', { class: 'form' },
      h('label', {}, h('span', { text: 'Matéria' }),
        h('select', { class: 'campo', onchange: (e) => { matSel = e.target.value; preencher(); } },
          ...dados.materias.map((m) => h('option', { value: m.id, selected: m.id === matSel, text: m.nome })))),
      h('label', {}, h('span', { text: 'Tópico do Anexo II' }), selTopico),
      h('label', {}, h('span', { text: 'Quantidade' }),
        h('input', { class: 'campo', type: 'number', min: 1, max: 10, value: qtd, oninput: (e) => { qtd = Math.min(10, Math.max(1, Number(e.target.value) || 1)); } })),
      h('label', {}, h('span', { text: 'Dificuldade' }),
        h('select', { class: 'campo', onchange: (e) => { dif = e.target.value; } },
          h('option', { value: 'facil', text: 'Fácil' }), h('option', { value: 'medio', selected: true, text: 'Média' }), h('option', { value: 'dificil', text: 'Difícil' }))),
      h('p', { class: 'nota', text: 'Requer chave de IA configurada. As questões geradas entram em um banco local separado e ficam marcadas com "revisar" — confirme sempre na lei seca.' }));

    selTopico.onchange = (e) => { topSel = e.target.value; };

    import('../components.js').then(({ modal }) => {
      const m = modal({
        titulo: 'Gerar questões inéditas',
        corpo,
        largura: '620px',
        acoes: [botao('Gerar', async () => {
          if (!configurado(get().ai)) { toast('Configure uma chave de IA primeiro.', 'erro', 4000); m.fechar(); location.hash = '#/config'; return; }
          m.fechar();
          const materia = dados.materias.find((x) => x.id === matSel);
          const topico = topSel ? topicoPorId(topSel) : null;
          historico.push({ role: 'user', content: `[Gerando ${qtd} questões de ${materia.nome}${topico ? ` — ${topico.texto.slice(0, 80)}` : ''}]` });
          desenharConversa();
          const alvo = h('div', { class: 'msg msg-assistant' }, carregando(`Gerando ${qtd} questão(ões)…`));
          conversa.appendChild(alvo);
          const prompt = promptGerarQuestoes({ materia, topico, quantidade: qtd, dificuldade: dif });
          const resp = await conversar(get().ai, [...historico, { role: 'user', content: prompt }], { maxTokens: 3000, temperatura: 0.7 });
          if (!resp.texto) { alvo.replaceChildren(markdown(`_Falha ao gerar: ${resp.erro}_`)); return; }
          const json = extrairJSON(resp.texto);
          const brutas = json?.questoes || (Array.isArray(json) ? json : []);
          if (!brutas.length) { alvo.replaceChildren(markdown(`_A IA não devolveu JSON válido._\n\n${resp.texto}`)); return; }
          const validas = [];
          const invalidas = [];
          for (const b of brutas) {
            const v = validarQuestaoGerada(b, matSel, topico);
            if (v.ok) validas.push(v.questao); else invalidas.push(v.erros.join('; '));
          }
          if (validas.length) {
            set((s) => { s.questoesGeradas = [...(s.questoesGeradas || []), ...validas]; });
          }
          alvo.replaceChildren(markdown(
            `**${validas.length} questão(ões) gerada(s)** e adicionada(s) ao banco local.` +
            (invalidas.length ? `\n\n_${invalidas.length} descartada(s) por falha de validação: ${invalidas.join(' | ')}_` : '') +
            '\n\n> Todas ficam marcadas como **"revisar"**: confira o gabarito na lei seca antes de memorizar.'));
          if (validas.length) {
            alvo.appendChild(h('div', { class: 'form-acoes' },
              botao(`Treinar as ${validas.length} agora`, () => treinarGeradas(validas), { variante: 'primario' }),
              botao('Ver todas as geradas', () => location.reload(), { variante: 'secundario' })));
          }
          desenharConversa();
        }, { variante: 'primario' })],
      });
    });
  }

  function treinarGeradas(lista) {
    import('./resolver.js').then(({ criarResolver }) => {
      document.getElementById('app').replaceChildren(criarResolver({
        questoes: lista.map((q) => ({ ...q, materiaNome: materiaNome(q.materia), cor: '#8b5cf6', bloco: 'especifica' })),
        modo: 'livre',
        titulo: 'Questões geradas por IA',
      }));
      window.scrollTo(0, 0);
    });
  }

  function exportarGeradas() {
    const geradas = get().questoesGeradas || [];
    if (!geradas.length) return;
    const porMateria = {};
    for (const q of geradas) {
      const k = q.materia;
      if (!porMateria[k]) porMateria[k] = { materia: k, descricao: `Questões geradas por IA para ${materiaNome(k)} (conferir gabaritos na lei seca).`, questoes: [] };
      porMateria[k].questoes.push(q);
    }
    import('../util.js').then(({ baixarJSON }) => baixarJSON(Object.values(porMateria), `questoes-geradas-${uid('exp')}.json`));
    toast('Arquivo exportado. Copie para data/questoes/ e registre no index.json para incorporá-lo ao banco.', 'sucesso', 8000);
  }

  return raiz;
}
