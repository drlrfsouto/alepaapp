# Arquitetura

App **PWA estático**, sem build e sem dependências em runtime. Roda 100% no navegador;
o único servidor opcional é o proxy de IA (`api/`) usado quando você publica na Vercel.
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
├─ vercel.json              # deploy: funções em /api, cache do PWA, headers
├─ .env.example             # variáveis do servidor (GEMINI_API_KEYS, ALLOWED_ORIGINS…)
├─ config.example.json      # modelo do config.json público (modo proxy + Supabase)
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
│  ├─ ai.js                 # LLM opcional: Gemini + rotação de chaves (contingência) + proxy
│  ├─ supabase.js           # backup/restauro do progresso no Supabase (REST puro, opcional)
│  ├─ components.js         # biblioteca de componentes (card, badge, modal, toast, markdown…)
│  ├─ styles.css            # design tokens, layout responsivo, tema claro/escuro, densidade
│  └─ views/                # 11 telas (uma função por tela, sem framework)
│     ├─ dashboard.js  questoes.js  resolver.js  simulados.js  flashcards.js
│     ├─ resumos.js    curriculo.js  plano.js    stats.js      tutor.js  config.js
├─ api/                     # funções serverless do modo "Servidor" (Vercel/Netlify/Node)
│  ├─ ia.js                 # POST: gera resposta com as chaves do ambiente · GET: health check
│  └─ modelos.js            # GET: modelos liberados para as chaves do servidor
├─ serverless/
│  └─ lib/gemini.js         # núcleo compartilhado: chaves, rotação/geladeira, rate limit, CORS
├─ supabase/
│  └─ migrations/0001_progresso_e_chaves.sql   # tabelas + RLS + RPC (rodar no SQL Editor)
├─ tools/
│  ├─ serve.mjs             # servidor estático (0.0.0.0, MIME, traversal) + executa /api
│  ├─ validate-data.mjs     # validador do banco (esquema, ids, referências, espelho da prova)
│  ├─ smoke.mjs             # teste de fumaça em DOM virtual (jsdom): todas as rotas + interações
│  ├─ test-integracao.mjs   # 21 casos sem rede: contingência de chaves, proxy, Supabase
│  ├─ generate-content.mjs  # pipeline de expansão do banco com IA (ou fila de prompts)
│  └─ gerar-icones.py       # gera os PNGs dos ícones sem dependências externas
├─ icons/                   # icon.svg, 192, 512 e 512-maskable
└─ docs/                    # arquitetura, dados, metodologia, ia-gemini, deploy, fila
```

## 2. Fluxo de inicialização

1. `index.html` carrega `src/app.js` como módulo ES.
2. `boot()` mostra o estado de carregamento e chama `carregar()` (estado do usuário) → `aplicarTema()` / `aplicarDensidade()`.
3. `carregarTudo('data')` busca **em paralelo** `concurso.json`, `curriculo.json`, `questoes/index.json`, cada arquivo de questões listado no manifesto, `resumos.json`, `flashcards.json` e `simulados.json`. Falhas individuais não derrubam o app: entram em `dados.erros` e viram um aviso no Painel.
4. Normalização: os tópicos do edital usam `nome`; `data.js` expõe também `texto` (as views leem um ou outro). Questões de `complementares.json` trazem o campo `materia` próprio, que tem precedência sobre a matéria do arquivo.
5. `aplicarConfigPublica()` lê `config.json` (se o deploy tiver) e preenche só os campos vazios do estado; `iniciarSincronizacao()` liga o backup automático no Supabase (quando configurado) e, se ele estiver ativo, o progresso é enviado já na abertura.
6. `montarNav()` desenha os 12 itens da sidebar; `registrarRotas()` registra as 18 rotas; `iniciar(app)` faz o primeiro render e escuta `hashchange`.
7. `registrarServiceWorker()` registra `sw.js` (silencioso se o navegador não suportar).
8. `Ctrl+K` abre a busca global (`buscar()` em `data.js` percorre questões, resumos, flashcards e tópicos).

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
| `#/config` | `viewConfig` | perfil, metas, IA (provedor, modo, chaves + contingência, modelos), Supabase, exportar/importar, limpar |

## 4. Estado do usuário (`store.js`)

Uma única chave `alepa2026.state.v1` no `localStorage`:

- `perfil` — nome, cargo, edital, horas/dia, dias da semana, `dataProva`, meta de pontos;
- `questoes` — por id: `{ ultimoResultado, acertos, erros, seguidos, ultimoEm, marcadaParaRevisao, historico[] }`;
- `simulados` — registros completos (respostas, nota, acertos, tempo, pontos por matéria);
- `cards` — estado SRS por flashcard: `{ ease, intervalo, repeticoes, proxima, lapsos, acertos, erros }`;
- `topicos` — status por tópico do Anexo II (`novo|estudando|dominado`) + anotações;
- `plano` — dias gerados com blocos `{ materia, topicos, minutos, tipo }`;
- `ai` — `provedor`, `apiKey` (principal), `apiKeys[]` (contingência), `chaveAtiva`, `chaveGelada`, `modo` (`navegador|proxy`), `proxyUrl`, `modelo`, `baseUrl`, `temperatura`;
- `supabase` — `url`, `anonKey`, `sincronizar`, `ultimaSync`, `dispositivo`;
- `config` — tema, densidade, embaralhar alternativas, mostrar gabarito, som;
- `registro` — log de ações (até 400) para o gráfico de atividade.

Escrita sempre via `set(mutator)` / `patch(obj)` (nunca mutação direta), com `subscribe()` para reações e `registrar(tipo, detalhe)` alimentando a série de atividade. `exportar()` / `importar()` permitem backup em JSON, `registrarChavesIA()` guarda o resultado da rotação de chaves e `limparTudo()` zera com confirmação.

`carregar()`/`importar()` fazem **deep merge** do estado salvo sobre o `ESTADO_INICIAL`
(`mesclar()`): campos novos de versão aparecem para quem já usava o app, e chaves que só existem
no estado salvo (`questoes['lp-q001']`, `cards['fc-9']`…) são adotadas como estão.

**Nada de telemetria**: no modo Navegador a chave fica só no `localStorage` e as chamadas saem
direto do cliente; no modo Servidor, ela fica nas variáveis de ambiente do seu deploy. O backup no
Supabase é opt-in e nunca inclui chaves de IA.

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

**Provedor padrão: Google Gemini**, com a chave **gratuita** do AI Studio (`aistudio.google.com/apikey`) —
detalhes em [`docs/ia-gemini.md`](ia-gemini.md). Também são suportados OpenAI, Anthropic, qualquer
endpoint **compatível com OpenAI** (Groq, OpenRouter, Ollama, ou o próprio Gemini em `/v1beta/openai/`)
e o modo `nenhum` (100% offline).

- `PROVEDORES` traz, para o Gemini: modelo padrão **`gemini-flash-latest`** (apelido oficial que aponta
  para o Flash estável mais recente), lista de modelos sugeridos (Flash e Flash-Lite, os únicos da
  camada gratuita desde abril/2026) e a nota de limites por projeto.
- `chamarGemini()` envia a chave no cabeçalho **`x-goog-api-key`** (nunca na URL), usa
  `systemInstruction` para o prompt de sistema e `generationConfig.responseMimeType = 'application/json'`
  quando o chamador pede JSON; trata `promptFeedback.blockReason` e `finishReason` (`MAX_TOKENS`).
- `listarModelos(cfg)` chama `GET /models` com a chave do usuário e devolve os modelos liberados,
  com Flash-Lite primeiro — é o que alimenta o botão **"Listar modelos da minha chave"** em Configurações
  e evita digitar um nome que a chave gratuita não alcança.
- `dicaDeErro()` converte `429/RESOURCE_EXHAUSTED`, `400/401/403`, `404 NOT_FOUND` e falhas de rede/CORS
  em orientação acionável (cota diária zera à meia-noite do Pacífico; limites visíveis em
  `aistudio.google.com/rate-limit`). Em qualquer falha o app cai no modo offline, sem quebrar.
- `SYSTEM_PROMPT` fixa o contexto do concurso (estrutura da prova, 0,2 por questão, corte de 6,0,
  desempate) e proíbe inventar dispositivo legal.
- Prompts prontos: `promptExplicarAlternativas`, `promptResumoTopico`, `promptGerarQuestoes`, `promptPlanoDeEstudo`.
  Sem chave: `explicacaoOffline`, `resumoOffline` e `diagnosticoOffline`.
- Questões geradas passam por `extrairJSON` + `validarQuestaoGerada` antes de serem aceitas, e entram
  no banco local marcadas como `revisar`.

## 7b. Contingência de chaves e modo Servidor

**Várias chaves gratuitas.** Como os limites do free tier do Gemini são **por projeto**, o app
aceita uma chave principal (`ai.apiKey`) e N chaves de contingência (`ai.apiKeys[]`):

- `ordemDeChaves()` começa pela última que funcionou (`ai.chaveAtiva`), segue pelas livres e
  deixa as "geladas" para o fim; `registrarChavesIA()` (store) persiste quem respondeu e quem
  entrou na geladeira (60 s após um `429`);
- `ehErroDeChave()` decide se vale trocar de chave: `429`, `401`, `403`, `404`, `500`, `503` e
  falhas de rede, sim; resposta bloqueada por segurança ou `MAX_TOKENS`, não (não queima as outras);
- só quando **todas** as chaves falham o usuário vê a dica de cota — e o app segue no modo offline.

**Modo Servidor (`ai.modo = 'proxy'`).** Para deploy (Vercel), a chamada vai para `/api/ia`
(`api/ia.js` → `serverless/lib/gemini.js`), que guarda as chaves em `GEMINI_API_KEYS` e repete a
mesma rotação do lado do servidor, com limite por IP, teto de tokens, histórico limitado, CORS
restrito e health check que não revela segredo. O `SYSTEM_PROMPT` viaja no corpo da requisição,
então o servidor não duplica o prompt e a auditoria do que é enviado continua possível.
`tools/serve.mjs` executa as mesmas funções em desenvolvimento.

**Supabase (`src/supabase.js`, opcional).** Backup/restauro do progresso pela API REST
(`PostgREST`, sem SDK): `enviarProgresso()` faz upsert em `progresso` pelo id do dispositivo,
`restaurarProgresso()` reimporta preservando as chaves locais, e `estadoParaSync()` **remove
`ai.apiKey`/`ai.apiKeys`** antes de enviar. `aplicarConfigPublica()` lê `config.json` no boot
para um deploy já vir configurado (modo proxy + Supabase) sem sobrescrever escolhas locais.

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
| `npm run test:smoke` | sobe o app em DOM virtual (jsdom), visita as 18 rotas e executa interações (gerar plano, responder questão, sessão SRS, abrir simulado, Configurações com Gemini/contingência/Supabase) |
| `npm run test:ia` | 21 casos de integração **sem rede**: rotação de chaves em 429/401, geladeira, proxy `/api/ia` (health, validação, CORS, rate limit), descoberta de modelos e Supabase (envio sem chaves, restauro preservando-as) |
| `npm test` | validate + smoke + integração |
| `npm run lacunas` | relatório de cobertura do banco por matéria/tópico |
| `npm run fila` | escreve `docs/fila-de-conteudo.md` (fila priorizada + modelos de prompt) |
| `npm run gerar` | chama o Gemini para preencher lacunas (requer `GEMINI_API_KEY`; aceita `OPENAI_API_KEY`/`--provider`) e revalida |
| `npm run icones` | regenera os PNGs dos ícones (`python3 tools/gerar-icones.py`) |
| `node tools/diag.mjs /rota …` | depuração: imprime o texto renderizado e as classes CSS de rotas específicas em DOM virtual |
| `GEMINI_API_KEYS=… npm start` | servidor local com o proxy `/api/ia` ativo (mesmo código do deploy) |

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
| Contingência com N chaves gratuitas | Os limites do free tier são por projeto: rotacionar chaves multiplica a cota sem gastar nada, e o usuário nem vê o 429 |
| Proxy opcional em vez de backend obrigatório | O app continua hospedável em qualquer lugar (até GitHub Pages); quem publica na Vercel ganha a opção de não expor chave nenhuma |
| Supabase por REST, sem SDK | Backup na nuvem sem adicionar dependência nem build; se o Supabase não estiver configurado, nada muda no app |
| PWA + service worker | Instalável no celular e utilizável em modo avião — o cenário real de estudo |
| `h()` em vez de templates/`innerHTML` | Segurança (dados externos nunca viram HTML) e simplicidade de depuração |
| Deep merge defensivo no `store.mesclar()` | Estado salvo tem chaves que não existem no `ESTADO_INICIAL` (`questoes['lp-q001']`…); sem tratar isso, o merge lançava erro e o reload **perdia todo o progresso** |

## 12. Deploy

Publicação na Vercel (app estático + funções `/api`) e sincronização de progresso no Supabase,
com duas chaves gratuitas do Gemini em contingência: passo a passo, variáveis de ambiente,
migration SQL, checklist e solução de problemas em
[`docs/deploy-vercel-supabase.md`](deploy-vercel-supabase.md).
