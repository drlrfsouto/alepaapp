/* views/config.js — perfil, metas, preferências, chave de IA, dados (backup/restore). */

import { h, baixarJSON, fmtDateBR, todayKey } from '../util.js';
import { get, set, exportar, importar, limparTudo, persistir } from '../store.js';
import { dados, dataDaProva, materiaNome } from '../data.js';
import { cabecalho, card, badge, botao, toast, modal, markdown, vazio } from '../components.js';
import { PROVEDORES, configurado } from '../ai.js';

const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// ordem de exibição: segunda → domingo
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function viewConfig() {
  const raiz = h('div', { class: 'pagina' });
  function desenhar() { raiz.replaceChildren(montar()); }
  raiz.appendChild(montar());
  return raiz;

  function montar() {
    const e = get();
    const box = h('div');
    box.appendChild(cabecalho('Configurações',
      'Perfil, metas, preferências, chave de IA e backup dos seus dados',
      [botao('Salvar', () => { persistir(); toast('Configurações salvas.', 'sucesso'); }, { variante: 'primario', icone: '💾' })]));

    /* ---------- perfil ---------- */
    box.appendChild(card('Perfil e metas',
      h('div', { class: 'form' },
        campo('Seu nome (opcional)', h('input', { class: 'campo', type: 'text', value: e.perfil.nome || '', placeholder: 'Como quer ser chamado?', oninput: (ev) => set((s) => { s.perfil.nome = ev.target.value; }) })),
        campo('Data da prova objetiva', h('input', { class: 'campo', type: 'date', value: e.perfil.dataProva || dataDaProva(), oninput: (ev) => set((s) => { s.perfil.dataProva = ev.target.value; }) }),
          `Oficial: ${fmtDateBR(dataDaProva())}. Ajuste apenas se houver retificação do cronograma.`),
        campo('Horas de estudo por dia', h('input', { class: 'campo', type: 'number', min: 0.5, max: 16, step: 0.5, value: e.perfil.horasPorDia, oninput: (ev) => set((s) => { s.perfil.horasPorDia = Number(ev.target.value) || 1; }) }),
          'Usado para gerar o plano de estudos.'),
        campo('Meta de minutos por semana', h('input', { class: 'campo', type: 'number', min: 60, max: 5000, step: 30, value: e.metas.minutosSemana, oninput: (ev) => set((s) => { s.metas.minutosSemana = Number(ev.target.value) || 600; }) })),
        campo('Meta de questões por semana', h('input', { class: 'campo', type: 'number', min: 10, max: 2000, step: 10, value: e.metas.questoesSemana, oninput: (ev) => set((s) => { s.metas.questoesSemana = Number(ev.target.value) || 150; }) })),
        h('div', { class: 'campo-bloco' },
          h('span', { text: 'Dias em que você estuda' }),
          h('div', { class: 'dias-semana' }, ...ORDEM_DIAS.map((d) => h('label', { class: 'dia-check' },
            h('input', {
              type: 'checkbox', checked: (e.perfil.diasSemana || []).includes(d),
              onchange: (ev) => set((s) => {
                const arr = new Set(s.perfil.diasSemana || []);
                if (ev.target.checked) arr.add(d); else arr.delete(d);
                s.perfil.diasSemana = [...arr];
              }),
            }),
            h('span', { text: NOMES_DIAS[d].slice(0, 3) }))))),
        h('div', { class: 'form-acoes' },
          botao('Regenerar plano com estes parâmetros', () => { location.hash = '#/plano'; toast('Ajuste feito — gere o plano na tela Plano de estudos.', 'info'); }, { variante: 'secundario' })))));

    /* ---------- preferências ---------- */
    box.appendChild(card('Preferências de estudo',
      h('div', { class: 'form' },
        check('Embaralhar a ordem das alternativas', e.config.embaralharAlternativas, (v) => set((s) => { s.config.embaralharAlternativas = v; }),
          'Recomendado: evita memorizar a posição da resposta ("sempre a C").'),
        check('Mostrar o comentário assim que eu confirmar a resposta', e.config.mostrarGabaritoImediatamente, (v) => set((s) => { s.config.mostrarGabaritoImediatamente = v; }),
          'Se desmarcado, o comentário fica recolhido em "Ver comentário completo".'),
        check('Tema escuro', e.config.modoEscuro, (v) => { set((s) => { s.config.modoEscuro = v; }); aplicarTema(); },
          'Também acompanha a preferência do sistema.'),
        campo('Densidade da interface', h('select', { class: 'campo', onchange: (ev) => { set((s) => { s.config.densidade = ev.target.value; }); aplicarDensidade(); } },
          h('option', { value: 'normal', selected: e.config.densidade === 'normal', text: 'Normal' }),
          h('option', { value: 'compacta', selected: e.config.densidade === 'compacta', text: 'Compacta' }))))));

    /* ---------- IA ---------- */
    const cfg = e.ai;
    box.appendChild(card('Inteligência artificial (chave própria)',
      h('div', { class: 'form' },
        h('div', { class: 'aviso-ia' }, markdown(`O app **não tem servidor**: sua chave fica no \`localStorage\` do seu navegador e é enviada **direto ao provedor**. Nenhum dado passa por terceiros deste projeto. Para remover, apague o campo e salve — ou use "Limpar todos os dados".

Sem chave, tudo continua funcionando: ${dados.questoes.length} questões comentadas, ${dados.resumos.length} resumos, ${dados.flashcards.length} flashcards, plano de estudos e diagnóstico são gerados localmente.`)),
        campo('Provedor', h('select', { class: 'campo', onchange: (ev) => { set((s) => { s.ai.provedor = ev.target.value; if (!s.ai.modelo) s.ai.modelo = ''; }); desenhar(); } },
          ...Object.entries(PROVEDORES).map(([k, v]) => h('option', { value: k, selected: cfg.provedor === k, text: v.nome })))),
        cfg.provedor !== 'nenhum' ? campo('Chave de API', h('input', {
          class: 'campo', type: 'password', value: cfg.apiKey || '', placeholder: 'sk-… / sua chave',
          autocomplete: 'off', spellcheck: false,
          oninput: (ev) => set((s) => { s.ai.apiKey = ev.target.value.trim(); }),
        }), PROVEDORES[cfg.provedor]?.docs ? h('a', { href: PROVEDORES[cfg.provedor].docs, target: '_blank', rel: 'noopener', text: 'Onde obter a chave' }) : null) : null,
        cfg.provedor !== 'nenhum' ? campo('Modelo', h('input', {
          class: 'campo', type: 'text', value: cfg.modelo || '', placeholder: PROVEDORES[cfg.provedor]?.padraoModelo || 'nome do modelo',
          oninput: (ev) => set((s) => { s.ai.modelo = ev.target.value.trim(); }),
        })) : null,
        cfg.provedor === 'custom' ? campo('Base URL', h('input', {
          class: 'campo', type: 'text', value: cfg.baseUrl || '', placeholder: 'https://api.groq.com/openai/v1',
          oninput: (ev) => set((s) => { s.ai.baseUrl = ev.target.value.trim(); }),
        }), 'Qualquer endpoint compatível com a API da OpenAI (Groq, OpenRouter, Together, LM Studio, Ollama).') : null,
        cfg.provedor !== 'nenhum' ? campo('Temperatura', h('input', {
          class: 'campo', type: 'number', min: 0, max: 1.5, step: 0.1, value: cfg.temperatura ?? 0.3,
          oninput: (ev) => set((s) => { s.ai.temperatura = Number(ev.target.value); }),
        }), '0 = respostas mais determinísticas (bom para lei seca). 0,7+ = mais criativo (bom para gerar questões).') : null,
        h('div', { class: 'form-acoes' },
          badge(configurado(cfg) ? '✓ IA configurada' : 'IA não configurada', configurado(cfg) ? 'verde' : 'neutro'),
          botao('Testar conexão', async () => {
            if (!configurado(get().ai)) { toast('Preencha provedor e chave.', 'erro'); return; }
            toast('Testando…', 'info', 1500);
            const { conversar } = await import('../ai.js');
            const r = await conversar(get().ai, [{ role: 'user', content: 'Responda apenas: CONEXÃO OK' }], { maxTokens: 40 });
            if (r.texto) { toast(`Conexão OK — "${r.texto.trim().slice(0, 40)}"`, 'sucesso', 4000); }
            else { toast(`Falhou: ${r.erro}`, 'erro', 8000); }
          }, { variante: 'primario' }),
          botao('Abrir o Tutor', () => { location.hash = '#/tutor'; }, { variante: 'secundario' })))));

    /* ---------- dados ---------- */
    box.appendChild(card('Seus dados',
      h('div', { class: 'form' },
        h('p', { class: 'nota', text: `Tudo é salvo localmente neste navegador (localStorage). Iniciado em ${fmtDateBR(String(e.criadoEm || '').slice(0, 10))}. Use outro navegador ou limpou o cache? Importe o backup.` }),
        resumoDados(e),
        h('div', { class: 'form-acoes' },
          botao('⬇ Exportar backup (JSON)', () => { baixarJSON(exportar(), `alepa2026-backup-${todayKey()}.json`); toast('Backup baixado.', 'sucesso'); }, { variante: 'primario' }),
          botao('⬆ Importar backup', () => abrirImportacao(), { variante: 'secundario' }),
          botao('Limpar respostas e simulados', () => confirmarLimpeza('parcial'), { variante: 'perigo' }),
          botao('Apagar TUDO', () => confirmarLimpeza('total'), { variante: 'perigo' })))));

    /* ---------- sobre ---------- */
    box.appendChild(card('Sobre o conteúdo',
      markdown(`**Fonte:** Edital de Abertura nº 001/2026 do Concurso Público nº 002/2026 da Assembleia Legislativa do Estado do Pará, com a retificação nº 002/2026 de 01/10/2026. Banca: **Fundação CETAP**.

**Cargo:** 02 — Assessoramento Legislativo / Assessor Técnico PL.AL.102 (nível superior).

**Conteúdo programático:** ${dados.topicos.length} tópicos transcritos do Anexo II, distribuídos em ${dados.materias.length} matérias. Três itens amplos do Anexo II foram **desdobrados** em subtópicos de estudo (Legislação, Informática e Raciocínio Lógico) para permitir revisão granular — o número oficial de itens do edital não muda.

**Banco de questões:** ${dados.questoes.length} questões autorais, comentadas, com gabarito, mnemônico, lei seca, pegadinhas e estratégia de resolução. Questões marcadas com o selo **"revisar"** citam norma estadual ou regimental cujo número de artigo/prazo **não** foi conferido em fonte primária — confirme no texto oficial antes de memorizar.

**Aviso:** este é um material de estudo independente. Sempre confira o edital, os anexos e as retificações no portal oficial da Fundação CETAP (\`fundacaocetap.selecao.net.br\`) e na legislação vigente consolidada.`)));

    return box;
  }
}

/* ---------- helpers ---------- */

function campo(rotulo, input, dica = null) {
  return h('label', { class: 'campo-bloco' }, h('span', { text: rotulo }), input, dica ? h('small', { class: 'nota', text: dica }) : null);
}

function check(rotulo, valor, onchange, dica = null) {
  return h('label', { class: 'check-bloco' },
    h('input', { type: 'checkbox', checked: Boolean(valor), onchange: (e) => onchange(e.target.checked) }),
    h('div', {}, h('span', { text: rotulo }), dica ? h('small', { class: 'nota', text: dica }) : null));
}

function resumoDados(e) {
  return h('table', { class: 'tabela-notas' },
    h('tbody', {},
      h('tr', {}, h('td', { text: 'Questões respondidas' }), h('td', {}, badge(String(Object.keys(e.questoes || {}).length), 'azul'))),
      h('tr', {}, h('td', { text: 'Simulados concluídos' }), h('td', {}, badge(String((e.simulados || []).length), 'azul'))),
      h('tr', {}, h('td', { text: 'Flashcards revisados' }), h('td', {}, badge(String(Object.keys(e.cards || {}).length), 'azul'))),
      h('tr', {}, h('td', { text: 'Tópicos com status definido' }), h('td', {}, badge(String(Object.keys(e.topicos || {}).length), 'azul'))),
      h('tr', {}, h('td', { text: 'Questões geradas por IA' }), h('td', {}, badge(String((e.questoesGeradas || []).length), 'neutro'))),
      h('tr', {}, h('td', { text: 'Dias no plano' }), h('td', {}, badge(String((e.plano || []).length), 'neutro'))),
      h('tr', {}, h('td', { text: 'Eventos registrados' }), h('td', {}, badge(String((e.registro || []).length), 'neutro')))));
}

function abrirImportacao() {
  const input = h('input', { class: 'campo', type: 'file', accept: 'application/json,.json' });
  const m = modal({
    titulo: 'Importar backup',
    corpo: h('div', { class: 'form' }, input, h('p', { class: 'nota', text: 'O conteúdo atual deste navegador será substituído pelo arquivo importado.' })),
    acoes: [botao('Importar', () => {
      const arq = input.files?.[0];
      if (!arq) { toast('Selecione um arquivo.', 'erro'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importar(String(reader.result));
          m.fechar();
          toast('Backup importado.', 'sucesso');
          location.reload();
        } catch (err) { toast(`Arquivo inválido: ${err.message}`, 'erro', 6000); }
      };
      reader.readAsText(arq);
    }, { variante: 'primario' })],
  });
}

function confirmarLimpeza(tipo) {
  const m = modal({
    titulo: tipo === 'total' ? 'Apagar todos os dados' : 'Limpar respostas e simulados',
    corpo: h('p', { text: tipo === 'total'
      ? 'Isso remove TUDO: respostas, simulados, flashcards, anotações, plano, chave de IA e preferências. Exporte um backup antes se quiser guardar o histórico.'
      : 'Isso zera respostas de questões, simulados, flashcards e o caderno de erros. Perfil, preferências, chave de IA e plano são mantidos.' }),
    acoes: [botao('Cancelar', () => m.fechar(), { variante: 'fantasma' }),
      botao(tipo === 'total' ? 'Apagar tudo' : 'Limpar', () => {
        if (tipo === 'total') limparTudo();
        else set((s) => { s.questoes = {}; s.simulados = []; s.cards = {}; s.topicos = {}; s.registro = []; });
        m.fechar();
        toast('Dados limpos.', 'sucesso');
        location.reload();
      }, { variante: 'perigo' })],
  });
}

export function aplicarTema() {
  const pref = get().config.modoEscuro;
  const sistema = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.tema = pref || (pref === null && sistema) ? 'escuro' : 'claro';
}

export function aplicarDensidade() {
  document.documentElement.dataset.densidade = get().config.densidade || 'normal';
}
