# PROMPT MESTRE — App de estudo ALEPA 2026 (Cargo 02)

Prompt pronto para colar em IAs construtoras de aplicativos (Lovable, Bolt.new, v0, Cursor,
Claude Code, Replit Agent, Windsurf). Tudo o que a IA precisa saber sobre o concurso está
**dentro do prompt** — ela não precisa (e não deve) inventar dados do edital.

## Como usar

| Situação | O que copiar |
|---|---|
| Ferramenta com contexto grande (Cursor, Claude Code, Bolt, Replit) | **Bloco 1** inteiro |
| Ferramenta com limite curto (v0, chat simples) | **Bloco 2** e depois os prompts do **Bloco 3**, um por vez |
| Já existe um app e você quer evoluir | **Bloco 3** (prompt específico do módulo) |
| Quer só **produzir conteúdo** (questões/resumos/flashcards) | **Bloco 4** ou `npm run fila` |

Dica: cole o Bloco 1 e termine com *"Comece pela Fase 1 e pare para eu revisar antes da Fase 2."*
Ao final de cada fase, rode os critérios de aceite — eles são testáveis, não opinativos.

---

# BLOCO 1 — PROMPT MESTRE (copiar daqui até o fim do bloco)

## 1. Papel e objetivo

Você é um engenheiro de software sênior especializado em produtos de educação. Construa um
**aplicativo web completo de estudo e revisão** para um candidato do:

- **Concurso:** Concurso Público nº 002/2026 da **ALEPA** (Assembleia Legislativa do Estado do Pará)
- **Banca:** **Fundação CETAP**
- **Cargo:** **Cargo 02 — Assessoramento Legislativo / Assessor Técnico, plano de cargo PL.AL.102** (nível superior, qualquer área)
- **Edital:** Abertura nº 001/2026 (28/09/2026), com **Retificação nº 002/2026** (01/10/2026)
- **Site da banca:** `https://fundacaocetap.selecao.net.br/informacoes/156/`

O app deve permitir estudar **todo o conteúdo programático do Anexo II** de forma eficiente:
questões comentadas, resumos, flashcards com repetição espaçada, simulados espelho da prova,
plano de estudos até a data da prova, estatísticas com projeção de nota, cronograma do edital e
um tutor com IA opcional.

**Idioma de toda a interface, textos e comentários: português do Brasil.**

## 2. Dados oficiais do concurso (use exatamente estes valores)

### Cargo 02
- Vagas: **11** (7 ampla concorrência, 1 PcD, 1 pretos/pardos, 1 quilombola, 1 indígena) + cadastro de reserva
- Escolaridade: nível superior em qualquer área · Jornada: **30 h semanais**
- Vencimento básico **R$ 3.697,73** + gratificação de nível superior (80%) + gratificação DL 04/12 (100%) = **R$ 10.353,64**
- Taxa de inscrição: **R$ 118,00** · Regime jurídico: Lei Estadual nº 5.810/1994 (RJU-PA)

### Prova objetiva — **13/12/2026, turno da MANHÃ, 180 minutos, em Belém/PA**
| Bloco | Questões | Valor por questão | Pontos |
|---|---|---|---|
| Língua Portuguesa | 10 | 0,2 | 2,0 |
| Legislação Institucional e Ética no Serviço Público | 10 | 0,2 | 2,0 |
| Informática Básica | 5 | 0,2 | 1,0 |
| Raciocínio Lógico | 5 | 0,2 | 1,0 |
| Conhecimentos Específicos (11 matérias) | 20 | 0,2 | **4,0** |
| **Total** | **50** | — | **10,0** |

- 5 alternativas (**A a E**), apenas uma correta. **Cada questão vale 0,2 ponto — valor uniforme;
  não existe peso diferente por questão.** Os blocos diferem apenas pelo número de questões.
- Aprovação: **mínimo 6,0 pontos** (30 acertos) **E** classificação dentro de **4× o número de vagas**.
- Etapas: Prova Objetiva (eliminatória e classificatória), Prova de Títulos (classificatória) e
  heteroidentificação.
- **Desempate:** maior idade (60+, Estatuto do Idoso) → Conhecimentos Específicos → Legislação e
  Ética → Língua Portuguesa → Raciocínio Lógico → Informática → ter sido jurado → sorteio.

### Distribuição estimada das 20 questões de Específicos
O edital **não** fixa a divisão interna. Use esta estimativa **configurável pelo usuário**:
Dir. Administrativo 3 · Dir. Constitucional 3 · Processo Legislativo e Técnica Legislativa 3 ·
Dir. Civil 2 · Dir. Processual Civil 2 · Noções de Secretaria 2 · Dir. Processual Constitucional 1 ·
Dir. Financeiro 1 · Dir. Previdenciário 1 · Direitos Humanos 1 · Adm. Geral 1 = **20**.

### Cronograma essencial (datas em `AAAA-MM-DD`)
| Data | Evento |
|---|---|
| 2026-09-28 | Publicação do Edital de Abertura e Anexos |
| 2026-10-01 | Início das inscrições · pedido de isenção (01 e 02/10) |
| 2026-10-30 | Resultado dos pedidos de isenção |
| 2026-11-04 | **Encerramento das inscrições** |
| 2026-11-25 | Homologação das inscrições e divulgação dos **locais de prova** |
| 2026-12-13 | **PROVA OBJETIVA (manhã)** |
| 2026-12-14 | Gabarito preliminar |
| 2026-12-15/16 | Recursos contra o gabarito |
| 2027-01-20 | Gabarito definitivo |
| 2027-03-10 | Resultado final |

Validade do concurso: 2 anos, prorrogável uma vez.

### Conteúdo programático (Anexo II) — 15 matérias, 319 tópicos
| Matéria (id) | Sigla | Bloco | Tópicos |
|---|---|---|---|
| Língua Portuguesa (`lp`) | LP | básica | 17 |
| Legislação Institucional e Ética no Serviço Público (`leg`) | LEG | básica | 18 |
| Informática Básica (`inf`) | INF | básica | 12 |
| Raciocínio Lógico (`rl`) | RL | básica | 12 |
| Direito Administrativo (`dir-adm`) | DADM | específica | 69 |
| Direito Processual Civil (`dir-proc-civ`) | DPC | específica | 50 |
| Direito Constitucional (`dir-const`) | DCON | específica | 38 |
| Direito Civil (`dir-civil`) | DCIV | específica | 36 |
| Processo Legislativo e Técnica Legislativa (`proc-leg`) | PLEG | específica | 19 |
| Direito Previdenciário (`dir-prev`) | DPREV | específica | 17 |
| Direito Processual Constitucional (`dir-proc-const`) | DPCON | específica | 8 |
| Direitos Humanos (`dir-humanos`) | DH | específica | 8 |
| Noções de Secretaria (`secretaria`) | SEC | específica | 6 |
| Direito Financeiro (`dir-fin`) | DFIN | específica | 5 |
| Adm. Geral (`adm-geral`) | ADM | específica | 4 |

Cada tópico tem `id`, `nome` (texto literal do edital), `prioridade` (**S/A/B/C**) e
`dificuldade` (**facil/medio/dificil**). O prefixo do id de questão é a sigla em minúsculas
(`lp-q001`, `dadm-q008`, `dpcon-q003`).

## 3. Stack e restrições

- **PWA estático, sem backend e sem login.** HTML + CSS + JavaScript (módulos ES) — sem framework e
  sem bundler é aceitável e desejável; se usar framework, que seja leve e com build simples.
- **Offline-first**: service worker com cache do shell e dos dados; utilizável em modo avião após o
  primeiro acesso. `manifest.webmanifest` + ícones 192/512 (inclusive maskable) para instalação.
- **Estado do usuário em `localStorage`** (uma única chave versionada), com **exportar/importar JSON**
  e **limpar tudo**.
- **Todo o conteúdo em arquivos JSON** separados do código (fonte da verdade), servidos por `fetch`.
  Nenhum dado do edital hard-coded em componente.
- **IA opcional**: o usuário informa a própria chave (OpenAI, Anthropic, Gemini ou endpoint
  compatível). A chave fica **somente no navegador**; chamadas diretas do cliente. Sem chave, o app
  precisa continuar 100% funcional (fallbacks offline).
- Não use `innerHTML` com dados externos (segurança). Prefira criação de elementos ou sanitização.
- Responsivo (mobile-first: sidebar vira drawer), tema **claro/escuro**, densidade confortável,
  acessível (foco visível, `aria-label`, navegação por teclado, atalho **Ctrl+K** para busca global).

## 4. Contratos de dados (respeite os nomes de campo)

```jsonc
// concurso.json
{ "meta": { "orgao", "concurso", "edital", "retificacao", "banca", "siteBanca", "siteInscricao",
            "regimeJuridico", "validade", "localProva", "fonteConteudo" },
  "cargo": { "codigo":"02", "nome", "planoCargo":"PL.AL.102", "escolaridade", "requisito", "jornada",
             "vencimentoBasico", "gratificacaoNS", "gratificacaoDL0412", "remuneracaoTotal",
             "taxaInscricao", "vagas": { "total":11, "amplaConcorrencia":7, "pessoaComDeficiencia":1,
             "pretosEPardos":1, "quilombolas":1, "indigenas":1 }, "atribuicoes": [] },
  "fases": [{ "id":"objetiva", "nome", "carater", "data":"2026-12-13", "turno":"MANHÃ",
              "duracaoMinutos":180, "formato", "valorQuestao":0.2, "pontuacaoMaxima":10.0,
              "notaMinimaAprovacao":6.0, "corteClassificatorio" }],
  "estruturaProva": [{ "id":"lp", "disciplina", "questoes":10, "peso":0.2, "pontos":2.0, "bloco":"basica" }],
  "estimativaConhecimentosEspecificos": { "aviso", "porMateria": { "dir-adm":3 } },
  "criteriosDesempate": [], "cronograma": [{ "data", "evento", "status":"concluido|em-andamento|futuro" }],
  "observacoes": [] }

// curriculo.json
{ "materias": [{ "id":"dir-adm", "nome", "sigla":"DADM", "bloco":"especifica",
                 "questoesProva":3, "pontosProva":0.6, "cor":"#f59e0b",
                 "topicos": [{ "id":"dadm-01", "nome":"…", "prioridade":"S", "dificuldade":"medio" }] }] }

// questoes/index.json  → { arquivos: [{ arquivo, materia, descricao }], totais: { questoes, porMateria }, esquema }
// questoes/<materia>.json → { materia, questoes: [QUESTAO] }
// QUESTAO:
{ "id":"lp-q001", "topico":"lp-06", "dificuldade":"medio", "contexto":"…", "enunciado":"…",
  "alternativas":[{"letra":"A","texto":"…"} /* 5, A–E, nesta ordem */],
  "gabarito":"B", "comentario":"explica o acerto, refuta CADA letra e fecha com a regra prática",
  "mnemonico":"…", "leiSeca":["Art. X — teor"], "tags":[], "pegadinhas":[],
  "estrategia":"…", "estiloBanca":"…", "origem":"…", "revisar":"opcional" }

// resumos.json → { resumos: [{ id:"res-dadm-01", materia, topico, titulo, tempoLeituraMin,
//   texto (markdown seguro, ≥1.800 caracteres), pontosChave[5-9], mnemonicos[], caiNaProva[3-5],
//   leiSeca[], origem, revisar? }] }

// flashcards.json → { flashcards: [{ id:"fc-001", materia, topico, frente, verso, tags[], dificuldade }] }

// simulados.json → { config: { valorPorQuestao:0.2, pontuacaoMaxima:10, notaMinima:6,
//   duracaoMinutos:180, turno:"MANHÃ" }, simulados: [{ id, nome, descricao,
//   tipo:"espelho|bloco|srs|parametrizado|erros", duracaoMin, totalQuestoes,
//   estrutura:[{ materia, quantidade, pontos }] | "dinamica" | "usuario", regras[], observacao }] }
```

**Invariantes que devem ser validadas por script:** ids únicos; 5 alternativas A–E por questão;
gabarito sempre uma dessas letras; `topico` existente no currículo; `estruturaProva` somando
**50 questões e 10,0 pontos**; simulado espelho somando **30 básicas + 20 específicas**;
`pontos = quantidade × 0,2` em qualquer estrutura.

## 5. Telas e rotas

| Rota | Tela | Requisitos |
|---|---|---|
| `#/` | **Painel** | contagem regressiva para 13/12/2026; recomendação do dia (plano, caderno de erros, simulado); progresso geral (questões respondidas, taxa de acerto, cartões vencidos); próximas datas críticas do edital; atalhos |
| `#/plano` | **Plano de estudos** | botão "Gerar plano" (usa perfil: horas/dia, dias da semana, data da prova); lista de dias com blocos de minutos por matéria e tópicos; marcar bloco como concluído; aviso quando o tempo não cobre os 319 tópicos |
| `#/questoes` | **Banco de questões** | filtros por matéria, tópico, dificuldade, tags e busca textual; contadores; abrir treino filtrado |
| `#/treino/:materia` | **Treino por matéria** | resolvedor com alternativas clicáveis, confirmar, feedback imediato, comentário completo, lei seca, pegadinhas, mnemônico, navegação entre questões, marcar para revisar |
| `#/questao/:id` | **Questão única** | deep link compartilhável |
| `#/erros` | **Caderno de erros** | questões erradas ainda não consolidadas + marcadas manualmente; refazer em sessão |
| `#/simulados` | **Simulados** | 6 modelos: espelho da prova (50 q / 3 h), básicos (30), específicos (20), treino diário (10, dinâmico por SRS), por matéria (parametrizado), caderno de erros; cronômetro; entrega com correção, nota em escala 0–10 e por matéria |
| `#/simulados/historico` | **Histórico** | evolução das notas, tempo médio, taxa por matéria |
| `#/resumos` e `#/resumos/:materia` | **Resumos** | leitura com markdown, pontos-chave, "cai na prova", lei seca, busca e filtro; tempo de leitura |
| `#/flashcards` | **Flashcards** | fila SRS (vencidos, novos, próximos 7 dias); sessão com frente/verso, 4 graus de autoavaliação com prévia do próximo intervalo; progresso (novos/em dia/vencidos/dominados) |
| `#/curriculo` | **Edital** | estrutura da prova (tabela oficial), dados do cargo e vagas, matérias com cobertura do banco |
| `#/curriculo/:materia` | **Matéria** | todos os tópicos com prioridade/dificuldade, status editável (novo/estudando/dominado), anotações, atalhos para questões/resumos/cartões do tópico |
| `#/cronograma` | **Datas** | 21 eventos do edital com status, destaque para os críticos e contagem regressiva por evento |
| `#/estatisticas` | **Estatísticas** | projeção de nota na prova por matéria (sem histórico = 50%, marcado com `*`), desempenho por matéria ordenado do pior para o melhor, atividade dos últimos 14 dias, streak |
| `#/tutor` | **Tutor IA** | chat com contexto do concurso; ações rápidas ("explique esta questão", "resuma o tópico", "gere 5 questões", "diagnostique meu desempenho"); funcionando sem chave via modo offline |
| `#/config` | **Configurações** | perfil (horas/dia, dias da semana, meta de pontos), provedor/modelo/chave de IA, tema, densidade, exportar/importar/limpar dados, sobre o edital |

## 6. Algoritmos (implemente como especificado)

**Pontuação:** `nota = acertos × 0,2`; `notaMáxima = totalDeQuestões × 0,2`. Nunca multiplique por
"peso de disciplina".

**SRS (flashcards):** estado `{ ease=2.5, intervalo=0, repeticoes=0, proxima=null, lapsos=0 }`,
`ease` entre 1,3 e 3,2, intervalo máximo 240 dias. Graus: `0 Errei` → ease −0,20 e volta **hoje**;
`1 Difícil` → ease −0,15 e intervalo ×1,2 (mín. 1 dia); `2 Bom` → intervalo × ease;
`3 Fácil` → ease +0,15 e intervalo × ease. Primeiras repetições: mesma sessão → 1–2 dias → 4 dias
(atalhos quando "Fácil"). Cartão **dominado**: intervalo ≥ 21 dias e ease ≥ 2,4.
Questões alimentam o mesmo SRS: acerto de primeira = grau 2, acerto após erro = 1, erro = 0.

**Plano de estudos:** (1) pontos por matéria a partir da estrutura da prova; (2) fator de ponto fraco
`clamp(1 + (0,75 − taxaDeAcerto), 0,85; 1,5)` com amostra mínima de 3 tentativas; (3) dias úteis
conforme perfil; (4) reservar os **últimos 12% dos dias** para reta final; (5) ordenar tópicos por
`pontosDaMatéria × pesoDaPrioridade (S 1,6 · A 1,3 · B 1,0 · C 0,7) × fator`, com custo em minutos
(base 25 min específica / 20 min básica × dificuldade × prioridade × tamanho do tópico, limitado a
10–60 min); (6) distribuir em slots de até 45 min escolhendo sempre a matéria **mais atrasada** em
relação ao alvo `minutosDeConteúdo × pontosDaMatéria / 10`; (7) na reta final, simulado completo a
cada 3 dias + revisão relâmpago de tópicos S/A (20 min cada).

**Projeção de nota:** `Σ (pontosDoBloco × taxaDeAcertoDoBloco)`, com 50% para matérias sem histórico.

**Caderno de erros:** entra toda questão com `erros > 0` e **menos de 2 acertos consecutivos**;
sai quando consolida. Questões marcadas manualmente permanecem até serem desmarcadas.

## 7. Conteúdo inicial (obrigatório)

Sem conteúdo o app é uma casca. Entregue, no mínimo:

- **≥ 100 questões inéditas e comentadas**, distribuídas para espelhar a prova
  (LP 10 · Legislação/Ética 10+ · Informática 8 · RL 8 · Específicas 60+), cada uma com comentário
  que refuta **todas** as alternativas, mnemônico, `leiSeca`, `pegadinhas`, `estrategia` e `estiloBanca`;
- **≥ 15 resumos** longos (um por matéria, ≥ 1.800 caracteres) com `pontosChave`, `mnemonicos`,
  `caiNaProva` e `leiSeca`;
- **≥ 150 flashcards** atômicos cobrindo as 15 matérias;
- os **319 tópicos do Anexo II** em `curriculo.json` com prioridade S/A/B/C.

Regras de qualidade do conteúdo (inegociáveis):
1. **Uma única alternativa correta**; nunca duas defensáveis; o comentário **jamais** admite ambiguidade.
2. **Não inventar** artigo, lei, súmula, prazo ou jurisprudência. Sem certeza → descrever o instituto
   sem o número e marcar `"revisar": "conferir na fonte oficial"`.
3. Alternativas de tamanho parecido; proibido "todas/nenhuma das anteriores".
4. Português do Brasil com acentuação correta e terminologia jurídica precisa.
5. Sempre que possível, contextualizar no cotidiano legislativo paraense (comissões, Mesa Diretora,
   sessões, pareceres, decretos legislativos, Regimento Interno — Resolução nº 02/2022).

## 8. Critérios de aceite (verifique um a um antes de declarar pronto)

1. `npm start` (ou equivalente) serve o app em `0.0.0.0` e todas as 18 rotas renderizam sem erro no console.
2. O Painel mostra a contagem regressiva correta para **13/12/2026** e pelo menos 3 datas críticas.
3. Responder uma questão grava o resultado, mostra o comentário completo e atualiza as estatísticas
   após recarregar a página (persistência real).
4. Um simulado espelho entrega **exatamente 50 questões** (30 básicas + 20 específicas), com
   cronômetro de 180 min e nota final em escala **0–10** batendo com `acertos × 0,2`.
5. Gerar o plano com 3 h/dia e todos os dias da semana produz **~59 dias** de blocos, com matérias
   alternadas e sem `undefined`/`NaN` na tela.
6. A sessão de flashcards mostra o próximo intervalo **antes** de o usuário avaliar e grava o estado
   SRS; cartões avaliados como "Errei" voltam na mesma sessão.
7. A projeção de nota em Estatísticas muda depois de responder questões.
8. Com o dispositivo offline (ou network desligado), o app abre e os dados aparecem (service worker).
9. Instalar como PWA funciona: `manifest` válido, ícones 192/512 presentes, `theme-color` definido.
10. Sem chave de IA configurada, o Tutor responde com conteúdo offline e **nenhuma** função do app fica indisponível.
11. Exportar gera um JSON importável em outra sessão (round-trip sem perda).
12. Um script de validação dos dados (`validate`) passa com 0 erros.

## 9. O que NÃO fazer

- Não invente datas, valores, vagas, notas de corte ou tópicos do edital diferentes dos listados acima.
- Não use "peso por questão" variável (2,0 / 1,0 / 4,0 são **pontos do bloco**, não multiplicadores).
- Não crie login, conta, servidor ou banco de dados obrigatório.
- Não envie a chave de IA do usuário para nenhum servidor intermediário.
- Não use `innerHTML` com conteúdo vindo de JSON/IA.
- Não escreva comentário de questão que admita duas respostas possíveis.
- Não deixe botão sem ação, rota sem view ou estado sem persistência.

## 10. Ordem de entrega sugerida

- **Fase 1 — Fundação:** estrutura de pastas, servidor estático, `data/*.json` com os dados do
  edital + currículo (319 tópicos), camada de dados, roteador, layout (sidebar/topbar/tema),
  validador de dados. *Pare e mostre.*
- **Fase 2 — Estudo:** banco de questões, resolvedor com comentário, treino por matéria, caderno de
  erros, resumos, flashcards + SRS. *Pare e mostre.*
- **Fase 3 — Prova:** simulados (6 modelos, espelho com cronômetro), histórico, estatísticas com
  projeção, plano de estudos, Painel com recomendação do dia, cronograma. *Pare e mostre.*
- **Fase 4 — Acabamento:** tutor IA com fallbacks offline, busca global Ctrl+K, service worker +
  manifest + ícones, exportar/importar, acessibilidade, responsivo, testes de fumaça e README.

*(Fim do Bloco 1.)*

---

# BLOCO 2 — PROMPT CURTO (para ferramentas com pouco contexto)

> Construa um PWA estático (HTML+CSS+JS em módulos ES, sem backend e sem login, estado em
> `localStorage`, offline-first com service worker) para estudar para o **Concurso 002/2026 da ALEPA,
> Cargo 02 — Assessor Técnico PL.AL.102**, banca **Fundação CETAP**, prova em **13/12/2026 (manhã,
> 180 min, Belém/PA)**: **50 questões A–E valendo 0,2 ponto cada = 10,0**, sendo Português 10 (2,0),
> Legislação e Ética 10 (2,0), Informática 5 (1,0), Raciocínio Lógico 5 (1,0) e Conhecimentos
> Específicos 20 (4,0). Corte: **6,0 pontos** e classificação até 4× as **11 vagas**. Desempate:
> idade → Específicos → Legislação → Português → RL → Informática.
>
> Conteúdo em JSON separado do código: `concurso.json` (edital, cargo, fases, cronograma),
> `curriculo.json` (**15 matérias / 319 tópicos** do Anexo II com prioridade S/A/B/C),
> `questoes/*.json` (≥100 questões com 5 alternativas, gabarito, comentário que refuta cada letra,
> mnemônico, lei seca, pegadinhas), `resumos.json` (≥15 resumos com pontos-chave e "cai na prova"),
> `flashcards.json` (≥150 cartões), `simulados.json` (6 modelos, incluindo o espelho de 50 questões).
>
> Telas: Painel (contagem regressiva + recomendação do dia), Plano de estudos (gerado até a prova,
> blocos de 45 min alternando matérias, 12% final reservados a simulados/revisão), Banco de questões
> com filtros, Treino por matéria, Questão única, Caderno de erros (sai após 2 acertos seguidos),
> Simulados com cronômetro e nota 0–10, Histórico, Resumos, Flashcards com **repetição espaçada**
> (ease 2,5, limites 1,3–3,2; graus Errei/Difícil/Bom/Fácil; dominado = intervalo ≥21 dias),
> Edital/Currículo com status por tópico, Cronograma, Estatísticas com **projeção de nota**
> (`Σ pontos do bloco × taxa de acerto`, 50% quando sem histórico), Tutor IA opcional (chave só no
> navegador, com modo offline) e Configurações (exportar/importar/limpar).
>
> Regras: uma única alternativa correta por questão; nunca inventar artigo, súmula ou prazo (sem
> certeza → marcar `revisar`); nada de `innerHTML` com dados externos; responsivo, tema claro/escuro,
> Ctrl+K para busca; entregável com `npm start` servindo em `0.0.0.0` e um script `validate` que
> confere ids únicos, 5 alternativas A–E, 50 questões/10,0 pontos e o espelho 30+20.
> Comece pela fundação (dados + layout + rotas) e pare para eu revisar.

---

# BLOCO 3 — PROMPTS DE CONTINUAÇÃO (por módulo)

**Resolvedor de questões**
> Implemente o componente de resolução: lista de alternativas A–E clicáveis (teclas 1–5 e A–E),
> botão Confirmar, feedback imediato com destaque verde/vermelho, gabarito, comentário em parágrafos,
> blocos de "lei seca", "pegadinhas da banca", "mnemônico", "estratégia" e "estilo da banca";
> botões Próxima/Anterior com grade numerada, marcar para revisar, e registro da resposta no estado
> (`acertos`, `erros`, `seguidos`, `historico`). Sem `innerHTML`.

**SRS de flashcards**
> Implemente `srs.js` e a tela de flashcards: estado por cartão `{ ease, intervalo, repeticoes,
> proxima, lapsos, acertos, erros }`; 4 graus com os efeitos descritos no Bloco 1 §6; prévia do
> próximo intervalo em cada botão; filas de vencidos/novos/próximos 7 dias; contadores
> (novos, em dia, vencidos, dominados); atalhos de teclado (espaço vira, 1–4 avaliam).

**Plano de estudos**
> Implemente `planner.js` + tela: gere dias até a data da prova respeitando horas/dia e dias da
> semana; reserve 12% final para reta final (simulado a cada 3 dias + revisão de tópicos S/A);
> distribua slots de 45 min escolhendo a matéria mais atrasada em relação ao alvo proporcional aos
> pontos; liste os dias com blocos coloridos por matéria, tópicos e minutos; permita marcar concluído
> e regenerar; mostre aviso honesto quando nem todos os 319 tópicos couberem.

**Simulados**
> Implemente os 6 modelos a partir de `simulados.json` (estrutura declarativa sorteia do banco;
> `dinamica` usa SRS + caderno de erros; `usuario` pede matéria e quantidade na tela). Cronômetro
> regressivo com aviso nos últimos 10 min, entrega automática ao zerar, correção com nota
> `acertos × 0,2`, tabela por matéria (acertos, pontos, aproveitamento), histórico persistido e
> comparação com tentativas anteriores.

**Estatísticas**
> Implemente projeção de nota (`Σ pontos do bloco × taxa`), tabela por matéria com mini-barras,
> destaque do corte 6,0, desempenho por matéria ordenado do pior para o melhor com atalho "Treinar",
> atividade dos últimos 14 dias em gráfico de barras e streak de dias seguidos.

**Tutor IA**
> Implemente chat com `SYSTEM_PROMPT` contendo os dados do concurso e a proibição de inventar
> dispositivo legal; suporte a OpenAI, Anthropic, Gemini e endpoint compatível; chave salva só no
> `localStorage`; ações rápidas (explicar questão, resumir tópico, gerar N questões, diagnosticar);
> parser de JSON com validação (5 alternativas A–E, gabarito único, comentário mínimo) antes de
> aceitar questões geradas; fallbacks offline que usam os próprios dados quando não há chave.

**PWA/offline**
> Implemente `manifest.webmanifest`, ícones 192/512/512-maskable e `sw.js` com: network-first para
> navegações com fallback ao `index.html`, stale-while-revalidate para `/data/**`, cache-first para
> assets, limpeza de caches antigos na ativação, versão no nome do cache e indicador de modo offline
> na interface.

---

# BLOCO 4 — PROMPT PARA GERAR CONTEÚDO (questões, resumos, flashcards)

Use este bloco em qualquer assistente para preencher lacunas do banco. Os prompts já preenchidos,
tópicos priorizados, são gerados por `npm run fila` (arquivo `docs/fila-de-conteudo.md`) e por
`npm run fila -- --completo` (um arquivo por tipo de conteúdo).

> Você é professor de cursinho preparatório para concursos, especialista na banca **Fundação CETAP**.
> Crie **{{N}} questão(ões) inédita(s)** sobre o tópico **{{ID}} — {{NOME_DO_TOPICO}}** da matéria
> **{{MATERIA}}** do Concurso 002/2026 da ALEPA (Cargo 02 — Assessor Técnico PL.AL.102).
> Responda **apenas com JSON** no formato `{"questoes":[{ topico, dificuldade, contexto, enunciado,
> alternativas:[{letra,texto} ×5 (A–E)], gabarito, comentario (mín. 400 caracteres, refutando cada
> letra), mnemonico, leiSeca[], tags[], pegadinhas[], estrategia, estiloBanca, origem }]}`.
> Regras: **uma única alternativa correta**; alternativas de tamanho parecido; proibido
> "todas/nenhuma das anteriores"; **não invente** número de artigo, lei, súmula, prazo ou data;
> português do Brasil; contextualize no cotidiano legislativo paraense quando fizer sentido.
> Não repita estas questões já existentes: {{LISTA_DAS_EXISTENTES}}.

O mesmo padrão vale para resumos (`{"resumos":[…]}`, texto ≥ 1.800 caracteres, `pontosChave` 5–9,
`caiNaProva` 3–5) e flashcards (`{"flashcards":[…]}`, um fato por cartão, frente ≤ 180 e verso ≤ 400
caracteres). Depois de inserir qualquer conteúdo, rode o validador.

---

## Notas por ferramenta

| Ferramenta | Ajustes recomendados |
|---|---|
| **Lovable** | Cole o Bloco 1. Se sugerir Supabase, aceite apenas para hospedar os JSON como *storage* público — mantenha o progresso do usuário em `localStorage` para não exigir login. Peça "PWA + service worker" explicitamente na Fase 4. |
| **Bolt.new** | Cole o Bloco 1 e peça para criar os arquivos `data/*.json` primeiro (Fase 1). Bolt lida bem com projetos estáticos; use `npm start` no preview. |
| **v0** | Use o Bloco 2 e depois os prompts do Bloco 3 um a um — v0 é forte em UI, fraco em persistência: peça componentes controlados e exporte o estado para `localStorage`. |
| **Cursor / Claude Code / Windsurf** | Cole o Bloco 1 no chat com o repositório aberto. Este projeto já é a implementação de referência: peça diffs por módulo em vez de reescrever do zero. |
| **Replit Agent** | Cole o Bloco 1 e peça deploy estático; verifique o service worker no domínio publicado (exige HTTPS). |

## Checklist final antes de usar para estudar

- [ ] `npm run validate` → 0 erros
- [ ] `npm test` → rotas e interações sem exceção
- [ ] Painel com contagem regressiva correta para 13/12/2026
- [ ] Simulado espelho com 50 questões e nota 0–10 coerente
- [ ] Inscrição feita no site da banca até **04/11/2026** (o app não inscreve ninguém)
- [ ] Itens marcados `revisar` conferidos na fonte oficial
- [ ] Local de prova conferido a partir de **25/11/2026**
