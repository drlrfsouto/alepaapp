# ALEPA 2026 · Assessor Técnico — app de estudo inteligente

Aplicativo **PWA offline-first** de estudo e revisão para o **Concurso Público nº 002/2026 da ALEPA**
(Assembleia Legislativa do Estado do Pará), **Cargo 02 — Assessoramento Legislativo / Assessor Técnico
PL.AL.102**, banca **Fundação CETAP**, prova em **13/12/2026**.

Sem backend, sem login, sem build: `index.html` + módulos ES + conteúdo em JSON.
Instala no celular e funciona em modo avião depois do primeiro acesso.

```bash
npm start          # http://localhost:8080  (0.0.0.0)
npm run validate   # valida todo o banco de dados
npm test           # validate + teste de fumaça em DOM virtual (requer jsdom)
```

> `jsdom` é a única dependência, e apenas de desenvolvimento (`npm i jsdom` para rodar os testes).
> O app em si não depende de nada além de um servidor estático — `python3 -m http.server` também serve.

---

## O que tem dentro

**Conteúdo (fonte da verdade em `data/`)**

| | |
|---|---|
| **101 questões** comentadas | 5 alternativas (A–E), gabarito, comentário que refuta cada letra, mnemônico, lei seca, pegadinhas, estratégia e estilo da banca |
| **20 resumos** longos | texto com pontos-chave, mnemônicos, "cai na prova" e dispositivos citados |
| **164 flashcards** | atômicos, com repetição espaçada (SRS próprio) |
| **319 tópicos / 15 matérias** | Anexo II completo, com prioridade (S/A/B/C) e dificuldade |
| **6 modelos de simulado** | incluindo o **espelho exato da prova**: 50 questões, 10,0 pontos, 3 horas |
| **Edital em dados** | cargo, vagas, remuneração, fases, estrutura da prova, desempate e 21 eventos do cronograma |

**Funcionalidades**

- 🏠 **Painel** — contagem regressiva, recomendação do dia, progresso, datas críticas
- 🗓 **Plano de estudos** — distribui os 319 tópicos até 13/12/2026, alternando matérias por blocos
  de 45 min na proporção dos pontos, com os últimos 12% dos dias reservados para simulados e revisão
- 📝 **Banco de questões** — filtros por matéria, tópico, dificuldade, tags e busca; treino por matéria
- 🚫 **Caderno de erros** — questão só sai depois de **2 acertos consecutivos**
- 🎯 **Simulados** — espelho da prova, blocos separados, treino diário por SRS, por matéria e de erros,
  com cronômetro e correção na escala oficial (0,2 por questão)
- 🃏 **Flashcards** — fila SRS (vencidos/novos/próximos 7 dias), 4 graus de autoavaliação com prévia do
  próximo intervalo, cartões "dominados"
- 📖 **Resumos** — leitura com markdown seguro, tempo estimado, filtro e busca
- 📚 **Edital** — estrutura oficial da prova, dados do cargo e todos os tópicos com status
  (novo/estudando/dominado) e anotações
- 📅 **Cronograma** — 21 eventos com status e destaque para inscrições, locais, prova e gabaritos
- 📊 **Estatísticas** — **projeção da nota na prova**, desempenho por matéria (do pior para o melhor),
  atividade de 14 dias e streak
- 🤖 **Tutor IA (opcional)** — chat com contexto do concurso + ações rápidas; **sem chave configurada
  o app continua 100% funcional** (explicações, resumos e diagnóstico têm modo offline)
- ⚙ **Configurações** — perfil, meta, tema claro/escuro, densidade, exportar/importar/limpar dados

Atalho **Ctrl+K** abre a busca global (questões, resumos, flashcards e tópicos).

---

## A prova em números

| Bloco | Questões | Pontos |
|---|---|---|
| Conhecimentos Específicos (11 matérias) | 20 | **4,0** |
| Língua Portuguesa | 10 | 2,0 |
| Legislação Institucional e Ética | 10 | 2,0 |
| Informática Básica | 5 | 1,0 |
| Raciocínio Lógico | 5 | 1,0 |
| **Total** | **50** | **10,0** |

Cada questão vale **0,2 ponto** — o valor é uniforme; os blocos diferem só pelo número de questões.
Aprovação: **mínimo 6,0** (30 acertos) **e** classificação dentro de 4× as **11 vagas**.
Desempate: idade → Específicos → Legislação e Ética → Português → RL → Informática
(ou seja: a ordem do desempate é a ordem de prioridade do estudo).

---

## Como estudar com o app

1. **Configure o perfil** (`#/config`): horas por dia, dias da semana e meta de pontos.
2. **Gere o plano** (`#/plano`) e siga os blocos do dia — ele alterna matérias e prioriza os tópicos
   S e A do edital.
3. **Todo dia**: 20 min de flashcards vencidos + 20 min de caderno de erros + o bloco de conteúdo.
4. **Toda semana**: 1 simulado (específicos num dia, básicos no outro).
5. **Últimos 14 dias**: só revisão relâmpago, flashcards, erros e simulado espelho cronometrado
   **no turno da manhã** (o mesmo da prova).

Detalhes dos algoritmos (SRS, plano, projeção) e o protocolo dia a dia estão em
[`docs/metodologia.md`](docs/metodologia.md).

---

## Estrutura do projeto

```
index.html · manifest.webmanifest · sw.js · icons/     # shell PWA
data/       concurso.json curriculo.json questoes/ resumos.json flashcards.json simulados.json
src/        app.js router.js util.js store.js data.js srs.js planner.js ai.js components.js styles.css
src/views/  dashboard questoes resolver simulados flashcards resumos curriculo plano stats tutor config
tools/      serve.mjs validate-data.mjs smoke.mjs generate-content.mjs gerar-icones.py
docs/       arquitetura.md dados.md metodologia.md fila-de-conteudo.md
PROMPT_MASTER.md   prompt pronto para colar em IAs construtoras de apps
```

Documentação: [arquitetura](docs/arquitetura.md) · [esquemas de dados](docs/dados.md) ·
[metodologia](docs/metodologia.md) · [fila de conteúdo](docs/fila-de-conteudo.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` / `npm run serve` | servidor estático em `0.0.0.0:8080` (`node tools/serve.mjs [porta]`) |
| `npm run validate` | valida esquema, ids únicos, 5 alternativas A–E, gabarito, referências de matéria/tópico, totais do manifesto e a aritmética da prova (50 questões / 10,0 pontos / 30+20) |
| `npm run test:smoke` | sobe o app em DOM virtual, visita as 18 rotas e testa gerar plano, responder questão, sessão SRS e abrir simulado |
| `npm test` | `validate` + `smoke` |
| `npm run lacunas` | relatório de cobertura do banco por matéria (tópicos × questões × resumos × cards × pontos) |
| `npm run fila` | escreve `docs/fila-de-conteudo.md` — fila priorizada de produção + modelos de prompt |
| `npm run gerar` | chama um LLM para preencher lacunas, valida cada item e regrava o banco |
| `npm run icones` | regenera os PNGs dos ícones (`python3 tools/gerar-icones.py`, sem dependências) |

## Expandindo o banco

```bash
npm run lacunas                                  # onde falta conteúdo
npm run fila -- --completo --tipo=questoes       # prompts prontos para colar (sem API)
OPENAI_API_KEY=... npm run gerar                 # geração automática + validação
```

O gerador pontua as lacunas por `prioridade do edital × (1 + pontos da matéria) × (1 + itens
faltantes)`, exige 5 alternativas A–E com gabarito único e comentário ≥ 400 caracteres, descarta
duplicados e recalcula `index.json`. Aceita qualquer endpoint compatível com OpenAI
(`OPENAI_BASE_URL`, `OPENAI_MODEL`) ou Anthropic (`--provider=anthropic`).

## IA opcional e privacidade

A chave de API é informada em `#/config` e fica **somente no `localStorage` do seu navegador**; as
chamadas saem direto do cliente, sem servidor intermediário. O `SYSTEM_PROMPT` proíbe inventar
artigo, súmula, prazo ou jurisprudência. Nada é coletado, enviado ou rastreado — o progresso é seu.

## PWA / offline

`sw.js` usa *network-first* para navegações (com fallback para o `index.html` em cache),
*stale-while-revalidate* para `/data/**` e *cache-first* para assets. O cache é versionado
(`alepa-2026-v1.0.0`); para forçar atualização, o app envia a mensagem `pular-espera` ao worker.
Requer HTTPS (ou `localhost`) — comportamento padrão de service workers.

## Fontes

- Edital de Abertura nº 001/2026 (28/09/2026) e **Retificação nº 002/2026** (01/10/2026) —
  Concurso Público nº 002/2026 da ALEPA, banca Fundação CETAP;
  portal oficial: <https://fundacaocetap.selecao.net.br/informacoes/156/>
- Anexo II — Conteúdo Programático (Cargo 02): 15 matérias, 319 tópicos
- Anexo III — Cronograma; Anexo I — Informações dos cargos

## Aviso

Material de estudo **independente e não oficial**: não é produzido, revisado ou endossado pela ALEPA
nem pela Fundação CETAP. Questões do banco são **inéditas**, elaboradas no estilo da banca — não são
questões oficiais de provas anteriores. Itens que citam norma estadual ou regimental podem aparecer
marcados com `revisar` (`npm run validate` lista todos) até a conferência na fonte oficial.
**Em caso de divergência, prevalece o edital publicado pela banca.**

## Licença

MIT — use, adapte e compartilhe. Se ajudar na sua aprovação, volte e conte. 🎯
