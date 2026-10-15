/* views/config.js — perfil, metas, preferências, chave de IA, dados (backup/restore). */

import { h, baixarJSON, fmtDateBR, todayKey } from '../util.js';
import { get, set, exportar, importar, limparTudo, persistir, registrarChavesIA } from '../store.js';
import { supabaseConfigurado, enviarProgresso, baixarProgresso, restaurarProgresso, importarChavesIA, idDispositivo } from '../supabase.js';
import { dados, dataDaProva, materiaNome } from '../data.js';
import { cabecalho, card, badge, botao, toast, modal, markdown, vazio } from '../components.js';
import { PROVEDORES, configurado, listarModelos, chavesIA } from '../ai.js';

// modelos descobertos com a chave do usuário (botão "Listar modelos")
let modelosDescobertos = [];
let listandoModelos = false;

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
    const prov = PROVEDORES[cfg.provedor] || {};
    const chaves = chavesIA(cfg);
    const modoProxy = cfg.modo === 'proxy';
    const sugestoes = [...new Set([...modelosDescobertos.map((m) => m.id), ...(prov.modelosSugeridos || [])])];

    box.appendChild(card('Inteligência artificial',
      h('div', { class: 'form' },
        h('div', { class: 'aviso-ia' }, markdown(`**Recomendado: Google Gemini, com chave GRATUITA do AI Studio** — sem cartão de crédito. Crie em [aistudio.google.com/apikey](https://aistudio.google.com/apikey), cole abaixo e clique em **Testar conexão**.

**Contingência:** cadastre **duas ou mais chaves** (de preferência de projetos diferentes do AI Studio). Os limites gratuitos são **por projeto**, então N chaves ≈ N cotas: quando uma devolve \`429\`, o app passa sozinho para a próxima e deixa a esgotada 1 minuto "na geladeira".

O app **não tem servidor próprio**: no modo *Navegador* a chamada sai direto daqui para o Google (chave no cabeçalho \`x-goog-api-key\`, nunca na URL) e as chaves ficam no \`localStorage\`. No modo *Servidor*, a chamada vai para o proxy \`/api/ia\` do seu deploy (Vercel) e **nenhuma chave chega ao navegador**.

Sem chave, nada quebra: ${dados.questoes.length} questões comentadas, ${dados.resumos.length} resumos, ${dados.flashcards.length} flashcards, plano e diagnóstico funcionam offline.`)),

        campo('Provedor', h('select', { class: 'campo', onchange: (ev) => { set((s) => { s.ai.provedor = ev.target.value; s.ai.modelo = ''; }); modelosDescobertos = []; desenhar(); } },
          ...Object.entries(PROVEDORES).map(([k, v]) => h('option', { value: k, selected: cfg.provedor === k, text: v.nome })))),

        campo('Modo de conexão', h('select', { class: 'campo', onchange: (ev) => { set((s) => { s.ai.modo = ev.target.value; }); desenhar(); } },
          h('option', { value: 'navegador', selected: !modoProxy, text: 'Navegador — chave(s) neste dispositivo, chamada direta ao provedor' }),
          h('option', { value: 'proxy', selected: modoProxy, text: 'Servidor — proxy /api/ia do deploy (chaves só no servidor)' })),
        modoProxy
          ? 'Exige publicar `api/ia.js` (Vercel/Netlify) e definir `GEMINI_API_KEYS` nas variáveis de ambiente. Rode o SQL de `supabase/migrations/` se quiser também o backup do progresso.'
          : 'As chaves ficam apenas neste navegador. É o modo que funciona em qualquer hospedagem estática.'),

        modoProxy ? campo('URL do proxy', h('input', {
          class: 'campo', type: 'text', value: cfg.proxyUrl || '/api/ia',
          oninput: (ev) => set((s) => { s.ai.proxyUrl = ev.target.value.trim(); }),
        }), 'Deixe `/api/ia` quando o app e a função estão no mesmo domínio (deploy único na Vercel). Use a URL completa (`https://SEU-APP.vercel.app/api/ia`) se o app estiver em outro domínio — e libere essa origem em `ALLOWED_ORIGINS`.') : null,

        !modoProxy ? campo('Chave 1 (principal)', h('input', {
          class: 'campo', type: 'password', value: cfg.apiKey || '',
          placeholder: cfg.provedor === 'gemini' ? 'AIza… (chave do Google AI Studio)' : 'sk-… / sua chave',
          autocomplete: 'off', spellcheck: false,
          oninput: (ev) => set((s) => { s.ai.apiKey = ev.target.value.trim(); }),
        }), prov.docs ? h('a', { href: prov.docs, target: '_blank', rel: 'noopener', text: cfg.provedor === 'gemini' ? 'Criar chave grátis no Google AI Studio ↗' : 'Onde obter a chave ↗' }) : null) : null,

        !modoProxy && cfg.provedor === 'gemini' ? campo(`Chaves de contingência (${Math.max(0, chaves.length - 1)} adicional(is))`, h('textarea', {
          class: 'campo', rows: 3, value: (cfg.apiKeys || []).join('\n'), spellcheck: false,
          placeholder: 'AIza…chave do segundo projeto\nAIza…chave do terceiro projeto',
          oninput: (ev) => set((s) => {
            s.ai.apiKeys = ev.target.value.split(/[\n;,]+/).map((k) => k.trim()).filter(Boolean);
            if (s.ai.chaveAtiva >= s.ai.apiKeys.length + 1) s.ai.chaveAtiva = 0;
          }),
        }), 'Uma por linha. Crie uma chave em cada projeto do AI Studio: como os limites gratuitos são por projeto, cada chave traz uma cota nova. A rotação é automática em caso de 429/401/403/404/5xx.') : null,

        campo('Modelo', h('div', { class: 'campo-linha' },
          h('input', {
            class: 'campo', type: 'text', value: cfg.modelo || '', list: 'lista-modelos-ia',
            placeholder: `${prov.padraoModelo || 'nome do modelo'} (deixe vazio para usar o padrão)`,
            oninput: (ev) => set((s) => { s.ai.modelo = ev.target.value.trim(); }),
          }),
          h('datalist', { id: 'lista-modelos-ia' }, ...sugestoes.map((m) => h('option', { value: m }))),
          prov.listaModelos || modoProxy ? botao(listandoModelos ? 'Listando…' : 'Listar modelos disponíveis', async () => {
            if (!configurado(get().ai)) { toast('Informe provedor e chave primeiro.', 'erro'); return; }
            listandoModelos = true; desenhar();
            try {
              modelosDescobertos = await listarModelos(get().ai);
              toast(`${modelosDescobertos.length} modelo(s) disponíveis.`, 'sucesso', 5000);
            } catch (err) {
              toast(`Não foi possível listar: ${err.message}`, 'erro', 8000);
            }
            listandoModelos = false; desenhar();
          }, { variante: 'fantasma', desabilitado: listandoModelos }) : null),
        prov.gratuito ? 'Na camada gratuita só entram modelos **Flash** e **Flash-Lite** (os Pro são pagos). `gemini-flash-latest` é um apelido que aponta sempre para o Flash estável mais recente — por isso é o padrão. Flash-Lite tem cota mais folgada, útil para gerar conteúdo em lote.' : 'Deixe vazio para usar o modelo padrão do provedor.'),

        prov.limite ? h('div', { class: 'aviso-limite' }, markdown(`**Limites da camada gratuita:** ${prov.limite} Se aparecer erro **429 / RESOURCE_EXHAUSTED**, o app tenta a próxima chave de contingência; se todas estiverem no limite, aguarde alguns minutos ou troque para um modelo Flash-Lite.`)) : null,

        cfg.provedor === 'custom' && !modoProxy ? campo('Base URL', h('input', {
          class: 'campo', type: 'text', value: cfg.baseUrl || '', placeholder: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          oninput: (ev) => set((s) => { s.ai.baseUrl = ev.target.value.trim(); }),
        }), 'Qualquer endpoint compatível com a API da OpenAI (Groq, OpenRouter, Together, LM Studio, Ollama — ou o próprio Gemini em `/v1beta/openai/`).') : null,

        campo('Temperatura', h('input', {
          class: 'campo', type: 'number', min: 0, max: 1.5, step: 0.1, value: cfg.temperatura ?? 0.3,
          oninput: (ev) => set((s) => { s.ai.temperatura = Number(ev.target.value); }),
        }), '0 = respostas mais determinísticas (bom para lei seca). 0,7+ = mais criativo (bom para gerar questões).'),

        h('div', { class: 'form-acoes' },
          badge(configurado(cfg)
            ? (modoProxy ? `✓ proxy ${cfg.proxyUrl || '/api/ia'}` : `✓ ${chaves.length} chave(s) · ${cfg.modelo || prov.padraoModelo}`)
            : 'IA não configurada', configurado(cfg) ? 'verde' : 'neutro'),
          Object.keys(cfg.chaveGelada || {}).length ? badge(`${Object.keys(cfg.chaveGelada).length} chave(s) em espera (429)`, 'amarelo') : null,
          botao('Testar conexão', async () => {
            if (!configurado(get().ai)) { toast('Preencha provedor e chave.', 'erro'); return; }
            toast('Testando…', 'info', 1500);
            const { conversar } = await import('../ai.js');
            const r = await conversar(get().ai, [{ role: 'user', content: 'Responda apenas: CONEXÃO OK' }], { maxTokens: 40 });
            registrarChavesIA(r.chaves);
            if (r.texto) {
              const qual = r.totalChaves > 1 ? ` · chave ${r.chave} de ${r.totalChaves}${r.contingencia ? ' (contingência)' : ''}` : '';
              toast(`Conexão OK com ${r.modelo || get().ai.modelo || 'o modelo padrão'}${qual}`, 'sucesso', 6000);
            } else {
              toast(`Falhou: ${r.erro}${r.dica ? ` · ${r.dica}` : ''}`, 'erro', 12000);
            }
            desenhar();
          }, { variante: 'primario' }),
          botao('Abrir o Tutor', () => { location.hash = '#/tutor'; }, { variante: 'secundario' })))));

    /* ---------- Supabase / deploy ---------- */
    const sb = e.supabase || {};
    const sbOk = supabaseConfigurado(sb);
    box.appendChild(card('Supabase — backup do progresso (opcional)',
      h('div', { class: 'form' },
        h('div', { class: 'aviso-ia' }, markdown(`Guarde seu progresso na nuvem e continue em outro dispositivo. Rode antes o SQL de [\`supabase/migrations/0001_progresso_e_chaves.sql\`](../supabase/migrations/0001_progresso_e_chaves.sql) no SQL Editor do seu projeto.

Use a chave **anon** (pública) — a \`service_role\` **nunca** deve vir para o app. O upload **não inclui suas chaves de IA** (elas são removidas antes do envio). Sem login, a linha é identificada por um id aleatório deste navegador: quem souber o id consegue ler aquele progresso.`)),
        campo('URL do projeto', h('input', {
          class: 'campo', type: 'text', value: sb.url || '', placeholder: 'https://SEU-PROJETO.supabase.co', spellcheck: false,
          oninput: (ev) => set((s) => { s.supabase.url = ev.target.value.trim(); }),
        })),
        campo('Chave anon (pública)', h('input', {
          class: 'campo', type: 'password', value: sb.anonKey || '', placeholder: 'eyJhbGciOi…', spellcheck: false, autocomplete: 'off',
          oninput: (ev) => set((s) => { s.supabase.anonKey = ev.target.value.trim(); }),
        }), 'Project Settings → API → anon public.'),
        check('Sincronizar automaticamente', Boolean(sb.sincronizar), (v) => { set((s) => { s.supabase.sincronizar = v; }); },
          'Envia o estado 8 s após cada mudança relevante (respostas, flashcards, simulados, plano).'),
        h('div', { class: 'form-acoes' },
          badge(sbOk ? '✓ Supabase configurado' : 'Supabase não configurado', sbOk ? 'verde' : 'neutro'),
          sb.ultimaSync ? badge(`último backup: ${fmtDateBR(String(sb.ultimaSync).slice(0, 10))} ${String(sb.ultimaSync).slice(11, 16)}`, 'neutro') : null,
          botao('Testar conexão', async () => {
            if (!sbOk) { toast('Informe URL e chave anon.', 'erro'); return; }
            try {
              await baixarProgresso(idDispositivo());
              toast('Supabase OK — tabela `progresso` acessível.', 'sucesso', 5000);
            } catch (err) {
              toast(`Falhou: ${err.message}`, 'erro', 10000);
            }
          }, { variante: 'secundario' }),
          botao('⬆ Enviar backup agora', async () => {
            if (!sbOk) { toast('Informe URL e chave anon.', 'erro'); return; }
            try {
              const r = await enviarProgresso();
              toast(`Progresso enviado (id ${String(r.id).slice(0, 8)}…).`, 'sucesso', 5000);
              desenhar();
            } catch (err) {
              toast(`Falhou: ${err.message}`, 'erro', 10000);
            }
          }, { variante: 'primario' }),
          botao('⬇ Restaurar da nuvem', () => {
            if (!sbOk) { toast('Informe URL e chave anon.', 'erro'); return; }
            const m = modal({
              titulo: 'Restaurar progresso do Supabase',
              corpo: markdown('Isso **substitui** o progresso deste navegador pelo que está gravado na nuvem (respostas, flashcards, simulados, plano e perfil). Suas chaves de IA locais são preservadas.\n\nExporte um backup em JSON antes se estiver em dúvida.'),
              acoes: [
                botao('Cancelar', () => m.fechar(), { variante: 'fantasma' }),
                botao('Restaurar', async () => {
                  m.fechar();
                  try {
                    const r = await restaurarProgresso();
                    if (!r) { toast('Não há progresso gravado para este dispositivo.', 'info', 6000); return; }
                    toast('Progresso restaurado. Recarregando…', 'sucesso', 3000);
                    setTimeout(() => location.reload(), 900);
                  } catch (err) {
                    toast(`Falhou: ${err.message}`, 'erro', 10000);
                  }
                }, { variante: 'perigo' }),
              ],
            });
          }, { variante: 'secundario' }),
          botao('🔑 Importar chaves de IA do Supabase', async () => {
            if (!sbOk) { toast('Informe URL e chave anon.', 'erro'); return; }
            try {
              const r = await importarChavesIA();
              toast(r.total ? `${r.total} chave(s) importada(s) do Supabase.` : 'Nenhuma chave ativa na tabela `chaves_ia`.', r.total ? 'sucesso' : 'info', 6000);
              desenhar();
            } catch (err) {
              toast(`Falhou: ${err.message}`, 'erro', 10000);
            }
          }, { variante: 'fantasma' })),
        h('p', { class: 'nota', text: 'Importar chaves do Supabase exige a tabela `chaves_ia` e a função `obter_chaves_ia()` do migration. Atenção: por esse caminho a chave volta para o navegador — em produção prefira o modo Servidor (proxy /api/ia) com as chaves nas variáveis de ambiente da Vercel.' }))));

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

/** `dica` pode ser texto OU um nó (ex.: o link "onde obter a chave"). */
function campo(rotulo, input, dica = null) {
  const nota = !dica ? null
    : typeof dica === 'string' ? h('small', { class: 'nota', text: dica })
    : h('small', { class: 'nota' }, dica);
  return h('label', { class: 'campo-bloco' }, h('span', { text: rotulo }), input, nota);
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
