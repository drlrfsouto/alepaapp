/* ai.js — tutor de IA com chave própria do usuário (BYO key) + modo offline.
 *
 * A chave NUNCA sai do navegador do usuário para o nosso servidor: não há backend.
 * Ela fica em localStorage e é enviada diretamente ao provedor escolhido.
 *
 * Provedores suportados:
 *   - openai    (OpenAI / qualquer endpoint compatível: Groq, OpenRouter, Together, Ollama local)
 *   - anthropic (Claude)
 *   - gemini    (Google AI Studio)
 *   - custom    (OpenAI-compatible com baseUrl própria)
 *   - nenhum    (MODO OFFLINE: monta explicações a partir do próprio banco de dados)
 */

import { dados, materiaNome, topicoTexto } from './data.js';
import { normalizar } from './util.js';

export const PROVEDORES = {
  openai: { nome: 'OpenAI (ChatGPT)', padraoModelo: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', docs: 'https://platform.openai.com/api-keys' },
  anthropic: { nome: 'Anthropic (Claude)', padraoModelo: 'claude-3-5-sonnet-latest', baseUrl: 'https://api.anthropic.com/v1', docs: 'https://console.anthropic.com/settings/keys' },
  gemini: { nome: 'Google Gemini', padraoModelo: 'gemini-1.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', docs: 'https://aistudio.google.com/app/apikey' },
  custom: { nome: 'Compatível com OpenAI (Groq, OpenRouter, Ollama...)', padraoModelo: '', baseUrl: '', docs: '' },
  nenhum: { nome: 'Modo offline (sem IA externa)', padraoModelo: '', baseUrl: '', docs: '' },
};

export const SYSTEM_PROMPT = `Você é um tutor especializado no Concurso Público nº 002/2026 da Assembleia Legislativa do Estado do Pará (ALEPA), banca FUNDAÇÃO CETAP, para o CARGO 02 — Assessoramento Legislativo / Assessor Técnico PL.AL.102 (nível superior).

Contexto da prova objetiva (13/12/2026, manhã, 3 horas, em Belém/PA):
- Língua Portuguesa: 10 questões = 2,0 pontos
- Legislação Institucional e Ética no Serviço Público: 10 questões = 2,0 pontos
- Informática Básica: 5 questões = 1,0 ponto
- Raciocínio Lógico: 5 questões = 1,0 ponto
- Conhecimentos Específicos: 20 questões = 4,0 pontos (Dir. Administrativo, Dir. Civil, Dir. Constitucional, Dir. Financeiro, Dir. Previdenciário, Dir. Processual Civil, Dir. Processual Constitucional, Direitos Humanos, Processo Legislativo e Técnica Legislativa, Noções de Secretaria e Noções de Administração Geral)
- Total: 50 questões, 10,0 pontos, 5 alternativas (A a E). CADA questão vale 0,2 ponto (valor uniforme); os blocos diferem apenas pelo número de questões.
- Aprovação: mínimo 6,0 pontos E classificação dentro de 4× o número de vagas (11 vagas).
- Desempate: idade → Específicos → Legislação e Ética → Português → RL → Informática.

REGRAS DE RESPOSTA:
1. Responda SEMPRE em português do Brasil, com terminologia jurídica precisa.
2. Cite o dispositivo legal (lei, artigo, parágrafo, inciso) sempre que aplicável. Se não tiver certeza do número do dispositivo, diga "confirme o dispositivo" em vez de inventar.
3. Estruture com markdown enxuto: títulos curtos, listas, negrito nos termos-chave.
4. Seja didático: comece pela resposta direta, depois o fundamento, depois a pegadinha típica da banca CETAP, e finalize com um mnemônico quando ajudar.
5. Nunca invente jurisprudência, súmula, artigo, prazo ou número. Se não souber, declare a incerteza.
6. Quando gerar questões, use EXATAMENTE 5 alternativas (A a E), apenas uma correta, com comentário detalhado e alternativa errada plausível (estilo CETAP: troca de prazos, de órgãos, de quórum, de competência).
7. Priorize o conteúdo do Anexo II (conteúdo programático) do edital. Não divague para matérias fora do programa.
8. Mantenha as respostas objetivas — o usuário está revisando, não lendo um tratado.`;

/* ---------------- chamadas ---------------- */

export function configurado(cfg) {
  if (!cfg || cfg.provedor === 'nenhum') return false;
  if (cfg.provedor === 'custom' && !cfg.baseUrl) return false;
  return Boolean(cfg.apiKey);
}

export async function conversar(cfg, mensagens, { maxTokens = 1200, temperatura = null, signal = null } = {}) {
  if (!configurado(cfg)) return { texto: null, offline: true, motivo: 'IA externa não configurada' };
  const t = temperatura ?? cfg.temperatura ?? 0.3;
  try {
    if (cfg.provedor === 'anthropic') return await chamarAnthropic(cfg, mensagens, maxTokens, t, signal);
    if (cfg.provedor === 'gemini') return await chamarGemini(cfg, mensagens, maxTokens, t, signal);
    return await chamarOpenAI(cfg, mensagens, maxTokens, t, signal);
  } catch (e) {
    return { texto: null, offline: true, erro: e.message };
  }
}

async function chamarOpenAI(cfg, mensagens, maxTokens, temperatura, signal) {
  const base = (cfg.baseUrl || PROVEDORES.openai.baseUrl).replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelo || PROVEDORES.openai.padraoModelo,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...mensagens],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(await textoErro(res));
  const j = await res.json();
  return { texto: j.choices?.[0]?.message?.content || '', provedor: 'openai', modelo: j.model };
}

async function chamarAnthropic(cfg, mensagens, maxTokens, temperatura, signal) {
  const base = (cfg.baseUrl || PROVEDORES.anthropic.baseUrl).replace(/\/$/, '');
  const historico = mensagens.filter((m) => m.role !== 'system');
  const extra = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      // necessário para chamadas diretas do navegador
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.modelo || PROVEDORES.anthropic.padraoModelo,
      max_tokens: maxTokens,
      temperature,
      system: `${SYSTEM_PROMPT}\n\n${extra}`.trim(),
      messages: historico.length ? historico : [{ role: 'user', content: 'Olá! Por onde devo começar a estudar hoje?' }],
    }),
  });
  if (!res.ok) throw new Error(await textoErro(res));
  const j = await res.json();
  const texto = (j.content || []).map((c) => c.text || '').join('');
  return { texto, provedor: 'anthropic', modelo: j.model };
}

async function chamarGemini(cfg, mensagens, maxTokens, temperatura, signal) {
  const base = (cfg.baseUrl || PROVEDORES.gemini.baseUrl).replace(/\/$/, '');
  const model = cfg.modelo || PROVEDORES.gemini.padraoModelo;
  const contents = mensagens.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const sys = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const res = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Por onde começo?' }] }],
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${sys}`.trim() }] },
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) throw new Error(await textoErro(res));
  const j = await res.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { texto, provedor: 'gemini', modelo: model };
}

async function textoErro(res) {
  let detalhe = '';
  try {
    const j = await res.json();
    detalhe = j.error?.message || j.message || JSON.stringify(j).slice(0, 300);
  } catch { detalhe = await res.text().catch(() => ''); }
  return `HTTP ${res.status} — ${detalhe || res.statusText}`;
}

/* ---------------- prompts prontos ---------------- */

export function promptExplicarAlternativas(q) {
  return `Explique, alternativa por alternativa, por que cada uma está certa ou errada na questão abaixo (matéria: ${materiaNome(q.materia)}; tópico do edital: ${topicoTexto(q.topico)}).

ENUNCIADO:
${q.contexto ? `${q.contexto}\n\n` : ''}${q.enunciado}

ALTERNATIVAS:
${q.alternativas.map((a) => `${a.letra}) ${a.texto}`).join('\n')}

GABARITO OFICIAL: ${q.gabarito}

Ao final, dê: (1) um mnemônico curto para fixar a regra; (2) a "pegadinha" mais provável que a banca Fundação CETAP usaria nessa mesma matéria; (3) os dispositivos legais citados com número exato.`;
}

export function promptResumoTopico(topico, materia) {
  return `Gere um resumo de estudo objetivo (máx. 350 palavras) sobre o seguinte tópico do Anexo II do edital ALEPA/CETAP, Cargo 02 — Assessor Técnico:

MATÉRIA: ${materia?.nome}
TÓPICO: ${topico?.texto}

Estruture como:
1) O que é (2 linhas)
2) Fundamento legal (dispositivos)
3) Pontos que a banca cobra (lista)
4) Prazos, quóruns e números críticos (tabela)
5) 3 pegadinhas típicas
6) Mnemônico final

Não invente dispositivos. Se não tiver certeza de um número, escreva "[confirmar]".`;
}

export function promptGerarQuestoes({ materia, topico, quantidade = 5, dificuldade = 'medio', estilo = 'Fundação CETAP' }) {
  return `Crie ${quantidade} questões inéditas de múltipla escolha no estilo da banca ${estilo}, sobre:

MATÉRIA: ${materia?.nome}
TÓPICO DO EDITAL: ${topico?.texto || 'todo o conteúdo programático da matéria'}
DIFICULDADE: ${dificuldade}

Regras OBRIGATÓRIAS:
- Exatamente 5 alternativas (A, B, C, D, E), apenas UMA correta.
- Enunciado no padrão CETAP ("Assinale a alternativa correta", "Com base em..., é correto afirmar").
- As alternativas erradas devem ser plausíveis: troque prazos, quóruns, órgãos competentes, efeitos (ex tunc × ex nunc) ou inclua/exclua uma ressalva legal.
- Comentário com o fundamento legal e a explicação de CADA alternativa.
- Inclua um mnemônico e as "pegadinhas".

Responda APENAS com JSON válido, sem markdown, no formato:
{"questoes":[{"enunciado":"...","contexto":"...","alternativas":[{"letra":"A","texto":"..."},{"letra":"B","texto":"..."},{"letra":"C","texto":"..."},{"letra":"D","texto":"..."},{"letra":"E","texto":"..."}],"gabarito":"A","comentario":"...","mnemonico":"...","leiSeca":["..."],"tags":["..."],"pegadinhas":["..."],"dificuldade":"${dificuldade}"}]}`;
}

export function promptPlanoDeEstudo({ diasRestantes, horasPorDia, statsPorMateria, pontosFracos }) {
  const tabela = statsPorMateria.map((s) => `- ${s.materia}: ${s.taxa}% de acerto em ${s.tentativas} tentativas`).join('\n') || '- (sem histórico ainda)';
  return `Monte um plano de estudo semanal para o Concurso ALEPA 2026, Cargo 02 (Assessor Técnico).

SITUAÇÃO:
- Faltam ${diasRestantes} dias para a prova (13/12/2026).
- Disponibilidade: ${horasPorDia} h/dia.
- Desempenho atual por matéria:
${tabela}
- Pontos mais fracos: ${pontosFracos.length ? pontosFracos.join(', ') : 'ainda não identificados'}.

Entregue:
1) Priorização das 15 matérias por retorno sobre o tempo investido (justifique pelos pontos em jogo: o bloco de Específicos concentra 4,0 dos 10,0 pontos em 20 questões; Português e Legislação, 2,0 cada em 10 questões; Informática e RL, 1,0 cada em 5 questões — cada questão vale 0,2).
2) Grade semanal (segunda a domingo) com blocos de 45–60 min e o que estudar em cada um.
3) Estratégia dos últimos 30 dias e dos últimos 7 dias.
4) Três erros clássicos de preparação para concursos que devo evitar.

Seja concreto e enxuto. Não repita o edital inteiro.`;
}

/* ---------------- MODO OFFLINE ---------------- */

/**
 * Sem IA externa: constrói explicações a partir dos dados já existentes no app.
 * Nunca inventa conteúdo — só reorganiza o que foi curado.
 */
export function explicacaoOffline(q) {
  const partes = [];
  partes.push(`## ${q.enunciado}\n`);
  if (q.gabarito) {
    const alt = q.alternativas.find((a) => a.letra === q.gabarito);
    partes.push(`**Gabarito: ${q.gabarito})** ${alt ? alt.texto : ''}\n`);
  }
  partes.push(`### Comentário\n${q.comentario || '_Comentário indisponível para esta questão._'}\n`);
  if (q.mnemonico) partes.push(`### Mnemônico\n${q.mnemonico}\n`);
  if (q.pegadinhas?.length) partes.push(`### Pegadinhas\n${q.pegadinhas.map((p) => `- ${p}`).join('\n')}\n`);
  if (q.leiSeca?.length) partes.push(`### Lei seca\n${q.leiSeca.map((l) => `- ${l}`).join('\n')}\n`);
  if (q.estrategia) partes.push(`### Estratégia de resolução\n${q.estrategia}\n`);
  if (q.estiloBanca) partes.push(`### Como a banca cobra\n${q.estiloBanca}\n`);
  partes.push(`> Modo offline: conteúdo gerado a partir do banco curado do app. Configure uma chave de IA em **Configurações** para explicações adaptativas.`);
  return partes.join('\n');
}

/** Resumo offline de um tópico: agrega resumos, questões e cards relacionados. */
export function resumoOffline(topico) {
  const relacionados = dados.resumos.filter((r) => r.topico === topico.id);
  const questoes = dados.questoes.filter((q) => q.topico === topico.id);
  const cards = dados.flashcards.filter((c) => c.topico === topico.id);
  const linhas = [`# ${topico.texto}`, `**Matéria:** ${topico.materiaNome} · **Prioridade:** ${topico.prioridade} · **Dificuldade:** ${topico.dificuldade}`, ''];
  if (relacionados.length) {
    linhas.push('## Resumo curado', '');
    for (const r of relacionados) {
      linhas.push(`### ${r.titulo}`, '', r.texto, '');
      if (r.pontosChave?.length) linhas.push('**Pontos-chave:**', ...r.pontosChave.map((p) => `- ${p}`), '');
      if (r.mnemonicos?.length) linhas.push('**Mnemônicos:**', ...r.mnemonicos.map((p) => `- ${p}`), '');
      if (r.caiNaProva) linhas.push(`**Como cai na prova:** ${r.caiNaProva}`, '');
      if (r.leiSeca?.length) linhas.push('**Legislação:**', ...r.leiSeca.map((p) => `- ${p}`), '');
    }
  } else {
    linhas.push('## Resumo curado', '', '_Ainda não há resumo escrito para este tópico. Configure uma chave de IA em Configurações para gerá-lo sob demanda._', '');
  }
  if (cards.length) {
    linhas.push('## Flashcards disponíveis', '');
    for (const c of cards.slice(0, 12)) linhas.push(`- **P:** ${c.frente}  \n  **R:** ${c.verso}`);
    linhas.push('');
  }
  if (questoes.length) {
    linhas.push(`## Questões no banco (${questoes.length})`, '');
    for (const q of questoes.slice(0, 8)) linhas.push(`- ${q.enunciado.slice(0, 140)}${q.enunciado.length > 140 ? '…' : ''} → gabarito **${q.gabarito}**`);
    linhas.push('');
  }
  const topicosIrmaos = dados.topicos.filter((t) => t.materia === topico.materia && t.id !== topico.id).slice(0, 8);
  if (topicosIrmaos.length) {
    linhas.push('## Tópicos vizinhos na mesma matéria', '');
    for (const t of topicosIrmaos) linhas.push(`- ${t.texto.slice(0, 160)}`);
  }
  return linhas.join('\n');
}

/** Diagnóstico offline a partir do desempenho registrado. */
export function diagnosticoOffline(statsPorMateria, diasRestantes, horasPorDia) {
  const fracas = statsPorMateria.filter((s) => s.tentativas >= 5).sort((a, b) => a.taxa - b.taxa).slice(0, 4);
  const fortes = statsPorMateria.filter((s) => s.tentativas >= 5).sort((a, b) => b.taxa - a.taxa).slice(0, 3);
  const linhas = ['## Diagnóstico automático (modo offline)', ''];
  if (!fracas.length) {
    linhas.push('Ainda não há histórico suficiente. Responda ao menos 5 questões por matéria para o diagnóstico ficar útil.', '');
    linhas.push(`Com ${diasRestantes} dias e ${horasPorDia} h/dia, você tem cerca de **${Math.round(diasRestantes * horasPorDia)} horas** de estudo — suficiente para cobrir os 319 tópicos do Anexo II duas vezes, se mantiver o ritmo.`, '');
  } else {
    linhas.push('**Prioridade máxima (menor taxa de acerto):**', ...fracas.map((s) => `- ${materiaNome(s.materia)}: ${s.taxa}% em ${s.tentativas} tentativas`), '');
  }
  if (fortes.length) linhas.push('**Já consolidadas (reduza o tempo, só revise):**', ...fortes.map((s) => `- ${materiaNome(s.materia)}: ${s.taxa}%`), '');
  linhas.push(
    '### Regra de alocação sugerida',
    '',
    '- Conhecimentos Específicos valem **4,0 pontos por questão** (20 questões = 8,0 dos 10,0 pontos da prova). Dedique ~50% do tempo a esse bloco.',
    '- Português e Legislação e Ética valem 2,0 por questão (10 questões cada = 2,0 + 2,0 pontos). Dedique ~35%.',
    '- Informática e Raciocínio Lógico valem 1,0 por questão (5 questões cada = 0,5 + 0,5). Dedique ~15%.',
    '- O primeiro critério de desempate depois da idade é a pontuação em **Conhecimentos Específicos** — reforça a prioridade acima.',
    '',
    '### Últimos 30 dias',
    '',
    '1. Simulado espelho completo a cada 7 dias, cronometrado (3h).',
    '2. Correção comentada no mesmo dia, com registro de cada erro no caderno de erros.',
    '3. Revisão apenas de resumos + flashcards vencidos; nada de material novo.',
    '4. Na última semana: somente lei seca, prazos, quóruns e mnemônicos.',
  );
  return linhas.join('\n');
}

/** Tenta extrair JSON de uma resposta de LLM (cercas de markdown, texto extra etc.). */
export function extrairJSON(texto) {
  if (!texto) return null;
  let t = texto.trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) t = cerca[1].trim();
  const ini = t.search(/[[{]/);
  if (ini < 0) return null;
  const abre = t[ini];
  const fecha = abre === '{' ? '}' : ']';
  let profundidade = 0;
  let emString = false;
  let escape = false;
  for (let i = ini; i < t.length; i++) {
    const c = t[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { emString = !emString; continue; }
    if (emString) continue;
    if (c === abre) profundidade++;
    else if (c === fecha) {
      profundidade--;
      if (profundidade === 0) {
        try { return JSON.parse(t.slice(ini, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function validarQuestaoGerada(q, materia, topico) {
  const erros = [];
  if (!q.enunciado) erros.push('sem enunciado');
  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) erros.push('precisa de 5 alternativas');
  if (!q.gabarito || !['A', 'B', 'C', 'D', 'E'].includes(q.gabarito)) erros.push('gabarito inválido');
  const letras = (q.alternativas || []).map((a) => a.letra);
  if (normalizar(letras.join('')) !== 'abcde') erros.push(`alternativas fora de ordem: ${letras.join(',')}`);
  if (!q.comentario) erros.push('sem comentário');
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    questao: {
      id: `gen-${materia}-${Math.random().toString(36).slice(2, 8)}`,
      materia,
      topico: topico?.id || null,
      dificuldade: q.dificuldade || 'medio',
      contexto: q.contexto || '',
      enunciado: q.enunciado.trim(),
      alternativas: q.alternativas.map((a) => ({ letra: a.letra.toUpperCase(), texto: String(a.texto).trim() })),
      gabarito: q.gabarito.toUpperCase(),
      comentario: q.comentario.trim(),
      mnemonico: q.mnemonico || '',
      leiSeca: q.leiSeca || [],
      tags: q.tags || [],
      pegadinhas: q.pegadinhas || [],
      estrategia: q.estrategia || '',
      estiloBanca: q.estiloBanca || 'Fundação CETAP',
      origem: 'gerada-por-ia',
      revisar: true,
    },
  };
}
