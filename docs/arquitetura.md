# Arquitetura

App **PWA estático**, sem build, sem dependências em runtime e sem backend.
Tudo o que o navegador precisa está em `src/`, `data/`, `sw.js`, `manifest.webmanifest` e `icons/`.

> Regra de ouro: **os JSON em `data/` são a fonte da verdade**. O código se adapta a eles — nunca o contrário.
> Nenhum dado do edital é embutido em código (exceto fallbacks defensivos, sempre marcados).

## 1. Árvore de arquivos

```
alepaapp/
├─ index.html               # shell: sidebar + topbar + <main id="app">
├─ manifest.webmanifest     # PWA instalável (nome, ícones, cores, escopo)
├─ sw.js                    # service worker (cache network-first / SWR / cache-first)
├─ package.json             # scripts (start, test, validate, gerar, fila, icones)
├─ PROMPT_MASTER.md         # prompt pronto para colar em IAs construtoras de apps
├─ README.md
├─ data/                    # conteúdo (fonte da verdade)
│  ├─ concurso.json         # edital: meta, cargo, fases, estruturaProva, cronograma, desempate
│  ├─ curriculo.json        # Anexo II: 15 matérias, 319 tópicos com prioridade e dificuldade
│  ├─ questoes/
│  │  ├─ index.json         # manifesto: arquivos, totais, esquema
│  │  ├─ lp.json … dir-proc-civ.json    # 1 questão por matéria (bancos nomeados)
│  │  └─ complementares.json            # questões com campo próprio "materia"
│  ├─ resumos.json          # 20 resumos longos (texto + pontosChave + caiNaProva + leiSeca)
│  ├─ flashcards.json       # 164 cartões para repetição espaçada
│  └─ simulados.json        # 6 modelos de simulado (o espelho da prova + blocos + dinâmicos)
├─ src/
│  ├─ app.js                # bootstrap: carrega dados, monta nav, registra 18 rotas, Ctrl+K
│  ├─ router.js             # roteador por hash com parâmetros (:materia, :id) e 404
│  ├─ util.js               # h() (DOM sem framework), datas, shuffle, normalizar, debounce…
│  ├─ store.js              # estado do usuário em localStorage + estatísticas derivadas
│  ├─ data.js               # carrega/normaliza os JSON e expõe seletores
│  ├─ srs.js                # algoritmo de repetição espaçada (SM-2 adaptado)
│  ├─ planner.js            # geração do plano de estudos até a data da prova
│  ├─ ai.js                 # integração opcional com LLM + fallbacks offline
│  ├─ components.js         # biblioteca de componentes (card, badge, modal, toast, markdown…)
│  ├─ styles.css            # design tokens, layout responsivo, tema claro/escuro, densidade
│  └─ views/                # 11 telas (uma função por tela, sem framework)
│     ├─ dashboard.js  questoes.js  resolver.js  simulados.js  flashcards.js
│     ├─ resumos.js    curriculo.js  plano.js    stats.js      tutor.js  config.js
├─ tools/
│  ├─ serve.mjs             # servidor estático (0.0.0.0, MIME, proteção contra traversal)
│  ├─ validate-data.mjs     # validador do banco (esquema, ids, referências, espelho da prova)
│  ├─ smoke.mjs             # teste de fumaça em DOM virtual (jsdom): todas as rotas + interações
│  ├─ generate-content.mjs  # pipeline de expansão do banco com IA (ou fila de prompts)
│  └─ gerar-icones.py       # gera os PNGs dos ícones sem dependências externas
├─ icons/                   # icon.svg, 192, 512 e 512-maskable
└─ docs/                    # esta pasta (arquitetura, dados, metodologia, fila de conteúdo)
```

## 2. Fluxo de inicialização

1. `index.html` carrega `src/app.js` como módulo ES.
2. `boot()` mostra o estado de carregamento e chama `carregar()` (estado do usuário) → `aplicarTema()` / `aplicarDensidade()`.
3. `carregarTudo('data')` busca **em paralelo** `concurso.json`, `curriculo.json`, `questoes/index.json`, cada arquivo de questões listado no manifesto, `resumos.json`, `flashcards.json` e `simulados.json`. Falhas individuais não derrubam o app: entram em `dados.erros` e viram um aviso no Painel.
4. Normalização: os tópicos do edital usam `nome`; `data.js` expõe também `texto` (as views leem um ou outro). Questões de `complementares.json` trazem o campo `materia` próprio, que tem precedência sobre a matéria do arquivo.
5. `montarNav()` desenha os 12 itens da sidebar; `registrarRotas()` registra as 18 rotas; `iniciar(app)` faz o primeiro render e escuta `hashchange`.
6. `registrarServiceWorker()` registra `sw.js` (silencioso se o navegador não suportar).
7. `Ctrl+K` abre a busca global (`buscar()` em `data.js` percorre questões, resumos, flashcards e tópicos).

## 3. Rotas

| Rota | View | Observação |
|---|---|---|
| `#/` | `viewDashboard` | contagem regressiva, recomendação do dia, progresso, datas críticas |
| `#/plano` | `viewPlano` | gera/atualiza o plano até 13/12/2026 e lista os blocos por dia |
| `#/questoes` | `viewBanco` | banco completo com filtros (matéria, tópico, dificuldade, tags, busca) |
| `#/treino/:materia` | `viewTreino` | sessão livre por matéria |
| `#/questao/:id` | `viewQuestaoUnica` | questão isolada (deep link compartilhável) |
| `#/erros` | `viewErros` | caderno de erros (erradas + marcadas manualmente) |
| `#/simulados` | `viewSimulados` | 6 modelos + regras da prova |
| `#/simulados/historico` | `viewHistorico` | desempenho por simulado |
| `#/simulados/:id` | `viewSimulados` | deep link para um modelo |
| `#/resumos` e `#/resumos/:materia` | `viewResumos` | leitura com filtro/busca |
| `#/flashcards` | `viewFlashcards` | fila SRS + sessão de estudo |
| `#/curriculo` | `viewCurriculo` | edital, estrutura da prova, matérias, cargo |
| `#/curriculo/:materia` | `viewMateria` | tópicos com status e atalhos por tópico |
| `#/cronograma` | `viewCronograma` | 21 eventos do edital + dados do cargo |
| `#/estatisticas` | `viewStats` | projeção de nota, desempenho por matéria, atividade |
| `#/tutor` | `viewTutor` | chat com LLM (opcional) e ações rápidas offline |
| `#/config` | `viewConfig` | perfil, meta, provedor de IA, exportar/importar, limpar |

## 4. Estado do usuário (`store.js`)

Uma única chave `alepa2026.state.v1` no `localStorage`:

- `perfil` — nome, cargo, edital, horas/dia, dias da semana, `dataProva`, meta de pontos;
- `questoes` — por id: `{ ultimoResultado, acertos, erros, seguidos, ultimoEm, marcadaParaRevisao, historico[] }`;
- `simulados` — registros completos (respostas, nota, acertos, tempo, pontos por matéria);
- `cards` — estado SRS por flashcard: `{ ease, intervalo, repeticoes, proxima, lapsos, acertos, erros }`;
- `topicos` — status por tópico do Anexo II (`novo|estudando|dominado`) + anotações;
- `plano` — dias gerados com blocos `{ materia, topicos, minutos, tipo }`;
- `config` — tema, densidade, provedor de IA, modelo, `apiKey`, base URL, temperatura;
- `historico` — log de ações para o gráfico de atividade.

Escrita sempre via `set(mutator)` / `patch(obj)` (nunca mutação direta), com `subscribe()` para reações e `registrar(tipo, detalhe)` alimentando a série de atividade. `exportar()` / `importar()` permitem backup em JSON e `limparTudo()` zera com confirmação.

**Nada de telemetria**: a chave de API fica só no `localStorage` do navegador do usuário e as chamadas saem direto do cliente.

## 5. Camada de dados (`data.js`)

`dados` é o objeto único com `concurso`, `curriculo`, `materias`, `topicos`, `questoes`, `resumos`, `flashcards`, `simulados` e `erros`. Seletores usados pelas views:

- matérias: `materiaPorId`, `materiaNome`, `corMateria`, `listarMaterias`;
- tópicos: `topicoPorId`, `topicoTexto`;
- conteúdo: `questoesPorMateria`, `questoesPorTopico`, `questaoPorId`, `resumosPorMateria`, `cardsPorMateria`, `buscar`;
- edital: `faseObjetiva`, `dataDaProva`, `valorQuestao`, `estruturaProva`, `pontosPorBloco`, `estimativaCE`, `pontosPorMateria`, `ehCritico`.

## 6. UI sem framework

`h(tag, attrs, ...children)` (em `util.js`) cria elementos reais — sem `innerHTML` em dados externos, o que elimina a classe de bugs de injeção. `components.js` agrega os blocos reutilizáveis: `cabecalho`, `card`, `badge`, `chipMateria`, `barra`, `stat`, `botao`, `vazio`, `carregando`, `modal` (retorna `{ fechar, overlay }`), `toast`, `markdown` (subconjunto seguro: negrito, itálico, listas, títulos, código, tabelas), `blocoLeiSeca`, `blocoPegadinhas`, `blocoMnemonico`, `seloDificuldade`, `seloPrioridade`, `contadorRegressivo`, `graficoBarras`, `paragrafos` (reexportado de `util.js`).

`styles.css` centraliza os tokens (`--accent`, `--verde`, `--vermelho`, …), o layout (sidebar fixa no desktop, drawer no mobile), o tema claro/escuro (`data-tema`) e a densidade (`data-densidade`).

## 7. IA opcional (`ai.js`)

Provedores: OpenAI, Anthropic, Google Gemini, qualquer endpoint **compatível com OpenAI** (Groq, OpenRouter, Ollama…) e o modo `nenhum` (100% offline).
`SYSTEM_PROMPT` fixa o contexto do concurso (estrutura da prova, valor de 0,2 por questão, corte de 6,0, desempate) e proíbe inventar dispositivo legal.

Prompts prontos: `promptExplicarAlternativas`, `promptResumoTopico`, `promptGerarQuestoes`, `promptPlanoDeEstudo`.
Sem chave configurada, o app não trava: `explicacaoOffline`, `resumoOffline` e `diagnosticoOffline` produzem conteúdo a partir dos próprios dados.
Questões geradas por IA passam por `extrairJSON` + `validarQuestaoGerada` antes de serem aceitas na sessão.

## 8. Offline (`sw.js`)

Versão do cache: `alepa-2026-v1.0.0` (trocar a versão invalida tudo).

| Recurso | Estratégia |
|---|---|
| Navegações (`GET`) | **network-first** com fallback para o `index.html` em cache |
| `/data/**` | **stale-while-revalidate** (usa o cache e atualiza em segundo plano) |
| `src/**`, `icons/**`, `manifest`, CSS | **cache-first** |

Na ativação, limpa caches antigos; aceita a mensagem `pular-espera` para forçar atualização imediata.
Como o app usa módulos ES e `fetch`, ele precisa ser servido por HTTP — `npm start` resolve.

## 9. Ferramentas

| Comando | O que faz |
|---|---|
| `npm start` | servidor estático em `http://0.0.0.0:8080` (`node tools/serve.mjs [porta]`) |
| `npm run validate` | valida esquema, ids únicos, 5 alternativas A–E, gabarito, referências de matéria/tópico, totais do manifesto e o espelho 30+20 = 50 questões / 10,0 pontos |
| `npm run test:smoke` | sobe o app em DOM virtual (jsdom), visita as 18 rotas e executa interações (gerar plano, responder questão, sessão SRS, abrir simulado) |
| `npm test` | validate + smoke |
| `npm run lacunas` | relatório de cobertura do banco por matéria/tópico |
| `npm run fila` | escreve `docs/fila-de-conteudo.md` (fila priorizada + modelos de prompt) |
| `npm run gerar` | chama o LLM para preencher lacunas (requer `OPENAI_API_KEY`) e revalida |
| `npm run icones` | regenera os PNGs dos ícones (`python3 tools/gerar-icones.py`) |
| `node tools/diag.mjs /rota …` | depuração: imprime o texto renderizado e as classes CSS de rotas específicas em DOM virtual |

`jsdom` é a única dependência, e só de desenvolvimento (testes). Se ela não estiver instalada, `npm run test:smoke` falha com instrução clara — o app em si não depende dela.

## 10. Como estender

- **Nova questão**: acrescente ao arquivo da matéria em `data/questoes/` (ou a `complementares.json` com o campo `materia`), rode `npm run validate` — os totais do manifesto são recalculados pelo gerador (`tools/generate-content.mjs`) ou manualmente em `index.json`.
- **Nova matéria/tópico**: edite `data/curriculo.json` (`materias[].topicos[]` com `id`, `nome`, `prioridade`, `dificuldade`) e, se ela compuser a prova, ajuste `estruturaProva` ou `estimativaConhecimentosEspecificos` em `concurso.json`.
- **Nova tela**: crie `src/views/x.js` exportando `viewX({ params, query, container })`, importe em `app.js`, registre a rota (`registrar('/x', viewX, { nav: '/x' })`) e, se quiser no menu, acrescente um item em `NAV`.
- **Novo modelo de simulado**: adicione um objeto em `simulados.json` com `estrutura` declarativa (`{ materia, quantidade, pontos }`) — o app monta as questões sorteando do banco; `estrutura: "dinamica"` usa SRS + erros e `estrutura: "usuario"` pede os parâmetros na tela.

## 11. Decisões e trade-offs

| Decisão | Motivo |
|---|---|
| Sem framework e sem bundler | Zero build, abre em qualquer servidor estático, sem `node_modules` em produção, fácil de auditar e hospedar (inclusive em GitHub Pages) |
| Conteúdo em JSON versionado | O edital é a fonte da verdade; conteúdo é revisável em diff e expansível por pipeline automático |
| Estado local, sem conta/login | Privacidade total, funciona offline e não precisa de backend |
| IA opcional e client-side | Quem tem chave usa; quem não tem continua com 100% das funções (fallbacks offline) |
| PWA + service worker | Instalável no celular e utilizável em modo avião — o cenário real de estudo |
| `h()` em vez de templates/`innerHTML` | Segurança (dados externos nunca viram HTML) e simplicidade de depuração |
