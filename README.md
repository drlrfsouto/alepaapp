# ALEPA 2026 · Assessor Técnico — app de estudo inteligente

Aplicativo **PWA offline-first** de estudo e revisão para o **Concurso Público nº 002/2026 da ALEPA**
(Assembleia Legislativa do Estado do Pará), **Cargo 02 — Assessoramento Legislativo / Assessor Técnico
PL.AL.102**, banca **Fundação CETAP**, prova em **13/12/2026**.

Sem backend, sem login, sem build: `index.html` + módulos ES + conteúdo em JSON.
Instala no celular e funciona em modo avião depois do primeiro acesso.

```bash
npm start          # http://localhost:8080  (0.0.0.0) — também serve /api/ia se houver chave
npm run validate   # valida todo o banco de dados
npm test           # validate + fumaça (18 rotas) + 21 testes de integração (requer jsdom)
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
- 🤖 **Tutor IA (opcional)** — chat com contexto do concurso + ações rápidas, usando a **chave
  gratuita do Google AI Studio (Gemini)**, com **contingência automática entre várias chaves**
  (quando uma estoura a cota, o app passa para a próxima); **sem chave o app continua 100%
  funcional** (explicações, resumos e diagnóstico têm modo offline)
- ☁️ **Deploy pronto** — Vercel (app estático + proxy `/api/ia` que guarda as chaves no servidor)
  e Supabase opcional para **backup do progresso entre dispositivos**
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
src/        app.js router.js util.js store.js data.js srs.js planner.js ai.js supabase.js components.js styles.css
src/views/  dashboard questoes resolver simulados flashcards resumos curriculo plano stats tutor config
api/        ia.js modelos.js                    # funções serverless do modo "Servidor" (proxy)
serverless/ lib/gemini.js                       # chaves do ambiente, rotação, rate limit, CORS
supabase/   migrations/0001_progresso_e_chaves.sql   # tabelas + RLS + RPC
tools/      serve.mjs validate-data.mjs smoke.mjs test-integracao.mjs generate-content.mjs gerar-icones.py
docs/       arquitetura.md dados.md metodologia.md ia-gemini.md deploy-vercel-supabase.md fila-de-conteudo.md
vercel.json · .env.example · config.example.json     # deploy
PROMPT_MASTER.md   prompt pronto para colar em IAs construtoras de apps
```

Documentação: [arquitetura](docs/arquitetura.md) · [esquemas de dados](docs/dados.md) ·
[metodologia](docs/metodologia.md) · [IA com chave gratuita do Gemini](docs/ia-gemini.md) ·
[deploy Vercel + Supabase](docs/deploy-vercel-supabase.md) · [fila de conteúdo](docs/fila-de-conteudo.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` / `npm run serve` | servidor estático em `0.0.0.0:8080` (`node tools/serve.mjs [porta]`) — com `GEMINI_API_KEYS="AIza1,AIza2" npm start` ele também executa o proxy `/api/ia` |
| `npm run validate` | valida esquema, ids únicos, 5 alternativas A–E, gabarito, referências de matéria/tópico, totais do manifesto e a aritmética da prova (50 questões / 10,0 pontos / 30+20) |
| `npm run test:smoke` | sobe o app em DOM virtual, visita as 18 rotas e testa gerar plano, responder questão, sessão SRS, abrir simulado e a tela de Configurações (Gemini, contingência, Supabase) |
| `npm run test:ia` | 21 casos de integração **sem rede**: rotação de chaves em 429/401, geladeira de 60 s, proxy `/api/ia` (health, validação, CORS, rate limit), descoberta de modelos, Supabase (envio sem chaves, restauro preservando-as) e reload sem perder progresso |
| `npm test` | `validate` + `smoke` + `test:ia` |
| `npm run lacunas` | relatório de cobertura do banco por matéria (tópicos × questões × resumos × cards × pontos) |
| `npm run fila` | escreve `docs/fila-de-conteudo.md` — fila priorizada de produção + modelos de prompt |
| `npm run gerar` | chama o Gemini (chave gratuita) para preencher lacunas, valida cada item e regrava o banco |
| `npm run icones` | regenera os PNGs dos ícones (`python3 tools/gerar-icones.py`, sem dependências) |

## Expandindo o banco

```bash
npm run lacunas                                  # onde falta conteúdo
npm run fila -- --completo --tipo=questoes       # prompts prontos para colar (sem API)

# geração automática com a chave GRATUITA do Google AI Studio
export GEMINI_API_KEY="AIza..."
node tools/generate-content.mjs --tipo=questoes --materia=lp --limite=4 --ritmo=10
```

O gerador pontua as lacunas por `prioridade do edital × (1 + pontos da matéria) × (1 + itens
faltantes)`, exige 5 alternativas A–E com gabarito único e comentário ≥ 400 caracteres, descarta
duplicados e recalcula `index.json`. Vem calibrado para a cota gratuita do Gemini: pausa de 8 s
entre chamadas (`--ritmo`) e nova tentativa automática em `429`/`5xx` (`--tentativas`).
Também aceita OpenAI (`OPENAI_API_KEY`), Anthropic (`--provider=anthropic`) e qualquer endpoint
compatível (`--provider=custom --base-url=…`).

## IA opcional (chave gratuita do Gemini) e privacidade

O provedor padrão é o **Google Gemini**, com a chave **gratuita** do AI Studio
(<https://aistudio.google.com/apikey>, sem cartão de crédito). Cole a chave em `#/config`, clique em
**Testar conexão** e pronto — o modelo padrão é `gemini-flash-latest`, e o botão
**"Listar modelos da minha chave"** mostra o que a sua chave alcança (na camada gratuita, apenas
modelos **Flash / Flash-Lite**).

A chave fica **somente no `localStorage` do seu navegador** e é enviada **direto ao Google**, no
cabeçalho `x-goog-api-key` (nunca na URL). Sem servidor intermediário, sem coleta, sem rastreamento.
Erros de cota (`429`) viram orientação na tela e o app cai no modo offline sem quebrar.
O `SYSTEM_PROMPT` proíbe inventar artigo, súmula, prazo ou jurisprudência.

**Contingência com várias chaves:** cadastre a chave 1 e quantas quiser em "Chaves de contingência"
(uma por linha, cada uma de um projeto diferente do AI Studio). Os limites gratuitos são **por
projeto**, então N chaves ≈ N cotas: em caso de `429` o app tenta a próxima sozinho e deixa a
esgotada 60 s em espera. Só se **todas** falharem você vê a dica de cota — e o app segue offline.

**Modo Servidor (opcional):** publique na Vercel e escolha o modo *Servidor (proxy `/api/ia`)* —
as chaves ficam em `GEMINI_API_KEYS` no servidor e **nunca chegam ao navegador**. O proxy ainda
aplica limite por IP, teto de tokens e CORS restrito.

Passo a passo completo, escolha de modelo, limites e solução de problemas:
[`docs/ia-gemini.md`](docs/ia-gemini.md). Publicação (Vercel + Supabase):
[`docs/deploy-vercel-supabase.md`](docs/deploy-vercel-supabase.md).

## Publicar (Vercel + Supabase)

```bash
# 1. chaves gratuitas do Gemini no servidor (uma por projeto = contingência)
#    Vercel → Settings → Environment Variables
GEMINI_API_KEYS="AIza-chave-1,AIza-chave-2"

# 2. deploy: importe o repositório em vercel.com/new (o vercel.json já configura tudo)

# 3. Supabase (opcional, para backup do progresso entre dispositivos)
#    SQL Editor → rode supabase/migrations/0001_progresso_e_chaves.sql
#    Configurações do app → Supabase → URL + chave anon → "Sincronizar automaticamente"
```

Teste o proxy localmente antes de publicar: `GEMINI_API_KEYS="AIza1,AIza2" npm start` e
`curl -X POST localhost:8080/api/ia -H 'content-type: application/json' -d '{"mensagens":[{"role":"user","content":"oi"}]}'`.

O backup no Supabase **nunca envia suas chaves de IA** (elas são removidas antes do upload —
há teste automatizado disso). Guia completo com checklist e solução de problemas:
[`docs/deploy-vercel-supabase.md`](docs/deploy-vercel-supabase.md).

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
