# IA com chave gratuita do Google AI Studio (Gemini)

Guia prático para usar o Tutor IA e a geração de conteúdo **sem pagar nada**, com a chave
gratuita do Google AI Studio. Nada aqui é obrigatório: sem chave, o app inteiro continua
funcionando (101 questões comentadas, 20 resumos, 164 flashcards, plano, estatísticas e
diagnóstico são locais).

---

## 1. Criar a chave (2 minutos, sem cartão de crédito)

1. Abra <https://aistudio.google.com/apikey> e entre com sua conta Google.
2. Clique em **Create API key** → escolha um projeto (o padrão serve) → **copie a chave**.
   Ela começa com `AIza…`.
3. Trate essa chave como senha: qualquer pessoa com ela gasta a sua cota.

## 2. Configurar no app

1. Rode `npm start` e abra `#/config` (**Configurações → Inteligência artificial**).
2. **Provedor:** `Google Gemini — chave GRÁTIS no AI Studio (recomendado)` — já vem selecionado por padrão.
3. **Chave de API:** cole a chave.
4. **Modelo:** deixe vazio para usar `gemini-flash-latest` (apelido oficial que aponta sempre para o
   Flash estável mais recente) — ou clique em **Listar modelos da minha chave** para ver exatamente o
   que a sua chave alcança e escolher um da lista.
5. Clique em **Testar conexão**. Deve aparecer `Conexão OK com <modelo> — "CONEXÃO OK"`.

A chave fica **somente no `localStorage` do seu navegador** e viaja **direto para o Google** no
cabeçalho `x-goog-api-key` — nunca na URL (não vaza em log, histórico ou `Referer`).
Para remover: apague o campo, ou use **Apagar TUDO**.

## 3. Qual modelo escolher na camada gratuita

Desde abril/2026 a camada gratuita do Google cobre a família **Flash** e **Flash-Lite**
(os modelos **Pro** passaram a ser pagos). O Google também deixou de publicar uma tabela fixa de
limites: eles variam por projeto e por modelo, e os seus números exatos aparecem em
<https://aistudio.google.com/rate-limit>.

| Modelo | Quando usar |
|---|---|
| `gemini-flash-latest` | **Padrão do app.** Sempre o Flash estável mais recente — melhor qualidade para explicar questões e redigir comentários |
| `gemini-flash-lite-latest` / `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` | Geração **em lote** de questões/resumos/flashcards: costumam ter cota mais folgada |
| `gemini-3.8-flash` / `gemini-3.6-flash` / `gemini-2.5-flash` | Versões estáveis fixas, se quiser reproducibilidade (o `latest` é trocado a cada lançamento) |

Como os nomes mudam com o tempo, o botão **Listar modelos da minha chave** é a fonte da verdade:
ele chama `GET /v1beta/models` com a sua chave e mostra o que está liberado, com Flash-Lite primeiro.

## 3b. Contingência: cadastre mais de uma chave gratuita

Os limites do free tier são **por projeto**. Então a forma mais barata de dobrar a folga é ter
**duas chaves, cada uma num projeto diferente** do AI Studio:

1. Crie a chave 1 em <https://aistudio.google.com/apikey> (projeto padrão).
2. Crie um segundo projeto (<https://console.cloud.google.com/projectcreate>) e gere nele a chave 2.
3. No app: **Configurações → Chave 1 (principal)** e **Chaves de contingência** (uma por linha).

Como o app usa as chaves:

- começa sempre pela **última que funcionou** (`chaveAtiva`, persistida no estado);
- se uma chave devolver `429`, `401`, `403`, `404` ou `5xx`, tenta **imediatamente a próxima** —
  você não vê erro nenhum, só a resposta;
- a chave que tomou `429` entra na **"geladeira" por 60 s** (fica no fim da fila);
- só quando **todas** falham o app mostra a dica de cota e cai no modo offline;
- erros que não são de chave (resposta bloqueada por segurança, `MAX_TOKENS`) **não** queimam as
  outras chaves;
- o Tutor mostra qual chave respondeu: `Google Gemini · gemini-flash-latest · chave 2 de 2 (contingência)`.

Erros que não são de cota (ex.: resposta bloqueada) não fazem o app queimar as outras chaves.

## 3c. Modo Servidor (proxy) — as chaves nunca chegam ao navegador

Se você publicar o app (Vercel, Netlify…), prefira o modo **Servidor**: as chaves ficam em
variáveis de ambiente (`GEMINI_API_KEYS="AIza1,AIza2"`) e o navegador chama `/api/ia`, que faz a
mesma rotação de contingência do lado do servidor.

- **Configurações → Modo de conexão → "Servidor — proxy /api/ia do deploy"**.
- O proxy (`api/ia.js` + `serverless/lib/gemini.js`) ainda adiciona: limite de requisições por IP,
  teto de tokens, histórico limitado a 24 mensagens, CORS restrito e health check em `GET /api/ia`.
- Para testar localmente: `GEMINI_API_KEYS="AIza1,AIza2" npm start` — o `tools/serve.mjs` executa
  as mesmas funções em `http://localhost:8080/api/ia`.
- Guia completo de publicação: [`docs/deploy-vercel-supabase.md`](deploy-vercel-supabase.md).

## 4. Limites e o erro 429

- Limites por **projeto** (não por chave): **RPM** (requisições/minuto), **TPM** (tokens/minuto) e
  **RPD** (requisições/dia). A cota diária zera à **meia-noite, horário do Pacífico**.
- Estourou → `HTTP 429 RESOURCE_EXHAUSTED`. O app traduz isso em orientação na tela
  (aguardar, trocar para Flash-Lite, gerar menos itens por vez) e cai automaticamente no
  **modo offline**, sem quebrar nada.
- Não existe cobrança automática: na camada gratuita a requisição simplesmente falha.

Boas práticas no app:
- **Tutor:** uma conversa normal gasta poucas requisições; evite disparar dezenas de "gere questões".
- **Gerar conteúdo em lote** (`tools/generate-content.mjs`): use `--limite` pequeno (4–8) e deixe o
  `--ritmo` padrão de 8 s entre chamadas. O script já faz nova tentativa automática em 429/5xx
  (30 s, 60 s, 90 s) e avisa quando a resposta vier truncada (`MAX_TOKENS`).

## 5. Gerar conteúdo com a cota gratuita

```bash
# 1) ver onde falta conteúdo
npm run lacunas

# 2) fila priorizada + prompts prontos (não gasta cota nenhuma)
npm run fila
node tools/generate-content.mjs --fila --completo --tipo=questoes --top=10

# 3) geração automática com a chave gratuita
export GEMINI_API_KEY="AIza..."
node tools/generate-content.mjs --tipo=questoes --materia=lp --limite=4 --ritmo=10
node tools/generate-content.mjs --tipo=flashcards --materia=dir-adm --n=3 --limite=6
node tools/generate-content.mjs --tipo=todos --materia=dir-proc-const --limite=8
```

Cada item gerado passa por validação antes de gravar (5 alternativas A–E, gabarito único,
comentário ≥ 400 caracteres, duplicidade, tópico existente); os descartados são reportados.
No fim, o validador roda sozinho. Confira os avisos de `revisar` antes de memorizar qualquer coisa.

**Orçamento de cota:** cada tópico = 1 chamada por tipo de conteúdo. Com `--limite=4` você usa
4 requisições — confortável até nas cotas gratuitas mais apertadas. Para preencher as 249 lacunas
priorizadas, faça em lotes diários.

## 6. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `429 RESOURCE_EXHAUSTED` | cota por minuto ou por dia esgotada | esperar; trocar para Flash-Lite; reduzir `--limite`/aumentar `--ritmo`; ver <https://aistudio.google.com/rate-limit> |
| `404 NOT_FOUND … models/…` | o modelo digitado não existe **para a sua chave** | usar **Listar modelos da minha chave** ou deixar o campo vazio (`gemini-flash-latest`) |
| `400 API_KEY_INVALID` / `403` | chave errada, revogada ou de outro projeto | gerar outra em <https://aistudio.google.com/apikey> |
| Resposta vazia com `finishReason=MAX_TOKENS` | saída maior que o limite pedido | gerar menos itens por vez (`--n=1`) ou aumentar `maxTokens` no Tutor |
| `Failed to fetch` / erro de CORS | rede bloqueando a chamada direta do navegador | verificar conexão/proxy; o Gemini permite chamadas client-side, então em geral é bloqueio local. Alternativa: rodar a geração pelo `tools/generate-content.mjs` (Node, sem CORS) |
| "Resposta bloqueada pelo provedor" | filtro de segurança do Google | reformular a pergunta (evite colar textos com marcas de formatação estranhas) |
| Nada acontece e aparece "modo offline" | chave não salva ou provedor `nenhum` | conferir em `#/config` o selo `✓ IA configurada` e clicar em **Salvar** |

## 7. Privacidade e limites do uso gratuito

- **Sem servidor intermediário**: navegador → Google. Este projeto não vê, coleta ou registra nada.
- **Conteúdo enviado**: os prompts incluem o enunciado da questão/tópico e o contexto do edital;
  nos diagnósticos, suas estatísticas agregadas (taxas por matéria), nunca dados pessoais.
- **Atenção aos termos da camada gratuita**: dados de serviços não pagos podem ser usados pelo
  Google para melhorar produtos, e a disponibilidade pode variar por região. Se isso for um
  problema para você, use um provedor pago ou fique no modo offline — o app foi desenhado para
  ser útil sem IA.
- **Não compartilhe tela/print com a chave visível**; o campo é do tipo senha, mas o botão
  "Listar modelos" e a URL do AI Studio podem expor o projeto.

## 8. Onde isso está no código

| Arquivo | Papel |
|---|---|
| `src/ai.js` | `PROVEDORES` (Gemini primeiro), `chavesIA()`/`ordemDeChaves()`/`ehErroDeChave()` (contingência), `conversar()` com opção `json`, `chamarGemini()` com rotação (header `x-goog-api-key`, `systemInstruction`, `responseMimeType`), `chamarProxy()`, `listarModelos()`, `dicaDeErro()` |
| `src/views/config.js` | provedor, **modo** (navegador/servidor), chave principal, **chaves de contingência**, `datalist` + **Listar modelos disponíveis**, aviso de limites, **Testar conexão** e o cartão do Supabase |
| `src/views/tutor.js` | chat, ações rápidas, geração de questões com `json: true`, indicação da chave usada e fallback offline |
| `src/store.js` | `ai: { provedor, apiKey, apiKeys[], chaveAtiva, chaveGelada, modo, proxyUrl, modelo, … }` + `registrarChavesIA()` |
| `src/supabase.js` | backup/restauro do progresso no Supabase (REST puro) e `config.json` do deploy; remove as chaves de IA antes de enviar |
| `api/ia.js`, `api/modelos.js` | funções serverless (Vercel) do modo Servidor |
| `serverless/lib/gemini.js` | chaves do ambiente, rotação/geladeira, limite por IP, CORS, dicas de erro |
| `supabase/migrations/0001_…sql` | tabelas `progresso` e `chaves_ia` + RLS + `obter_chaves_ia()` |
| `tools/test-integracao.mjs` | 21 casos sem rede: rotação, geladeira, proxy, modelos, Supabase |
| `tools/generate-content.mjs` | provedor `gemini` nativo (padrão quando há `GEMINI_API_KEY`/`GOOGLE_API_KEY`), pausa entre chamadas (`--ritmo`) e nova tentativa em 429 (`--tentativas`) |
| `tools/serve.mjs` | servidor de desenvolvimento que também executa as funções de `/api` |
