# Deploy: Vercel + Supabase (com duas chaves gratuitas do Gemini)

Guia para publicar o app na **Vercel**, guardar as chaves do Gemini **no servidor** e
sincronizar o progresso no **Supabase** — usando apenas cotas gratuitas.

Cenário coberto:

| Peça | Papel | Custo |
|---|---|---|
| **Vercel** | hospeda o app estático (PWA) **e** as funções de `/api` que falam com o Gemini | Hobby (grátis) |
| **Google AI Studio** | 2+ chaves gratuitas do Gemini (uma por projeto) = contingência de cota | grátis |
| **Supabase** | backup/restauro do progresso entre dispositivos (tabela `progresso`) | Free (grátis) |

> Nada disso é obrigatório. Sem Vercel, o app roda em qualquer hospedagem estática no modo
> "Navegador" (chave no `localStorage`). Sem Supabase, o progresso continua salvo localmente
> e pode ser exportado em JSON.

---

## 1. As duas chaves gratuitas do Gemini (contingência)

Os limites da camada gratuita são **por projeto**, então uma segunda chave em um projeto
diferente dobra sua folga: quando a primeira devolve `429 RESOURCE_EXHAUSTED`, o app (ou o
proxy) passa automaticamente para a próxima e deixa a esgotada **1 minuto na geladeira**.

1. Em <https://aistudio.google.com/apikey>, crie a **chave 1** no projeto padrão.
2. No seletor de projetos (canto superior esquerdo do AI Studio ou
   <https://console.cloud.google.com/projectcreate>), crie um **segundo projeto**
   — ex.: `alepa-estudo-2` — e gere nele a **chave 2**.
3. Use assim:
   - **Modo Navegador:** Configurações → *Chave 1 (principal)* + *Chaves de contingência*
     (uma por linha). Pode cadastrar quantas quiser.
   - **Modo Servidor (Vercel):** variável `GEMINI_API_KEYS="AIza1,AIza2"` — separadas por
     vírgula, espaço ou quebra de linha.

Como cada chave tem sua própria cota diária (RPD), duas chaves ≈ o dobro de requisições por
dia. Os limites exatos de cada projeto estão em <https://aistudio.google.com/rate-limit>.

---

## 2. Vercel

### 2.1 Publicar

1. Suba o repositório para o GitHub (`drlrfsouto/alepaapp`).
2. Em <https://vercel.com/new>, **Import** o repositório. O `vercel.json` já define tudo:
   `installCommand: ""` (não há dependências de runtime), `outputDirectory: "."`,
   funções em `api/` com `maxDuration: 60` e cabeçalhos de cache corretos para o PWA.
3. **Settings → Environment Variables** (aplique a Production e Preview):

   | Variável | Exemplo | Obrigatória |
   |---|---|---|
   | `GEMINI_API_KEYS` | `AIza1,AIza2` | sim, para o modo Servidor |
   | `GEMINI_MODEL` | `gemini-flash-latest` | não |
   | `ALLOWED_ORIGINS` | `https://SEU-APP.vercel.app,https://*.vercel.app` | só se o app chamar o proxy de outro domínio |
   | `IA_RATE_LIMIT` | `30` (requisições/min por IP; `0` desliga) | não |
   | `IA_MAX_TOKENS` | `4096` | não |
   | `IA_TIMEOUT_MS` | `60000` | não |

   O arquivo `.env.example` documenta todas. **Nunca** coloque a `service_role` do Supabase
   nem as chaves do Gemini em `config.json` (esse arquivo é público).
4. **Deploy**. Se o plano Hobby reclamar de `maxDuration: 60`, reduza para `10` no
   `vercel.json` (ou remova o bloco `functions`) — gerações longas podem precisar de mais tempo.

### 2.2 O que as funções fazem

| Rota | Método | Comportamento |
|---|---|---|
| `/api/ia` | `GET` | Health check: `{ ok, chaves, modelo, limitePorMinuto }` — **nunca** devolve o valor das chaves |
| `/api/ia` | `POST` | Gera a resposta: corpo `{ mensagens, system?, maxTokens?, temperatura?, json?, modelo? }` → `{ texto, modelo, chave, totalChaves, contingencia, uso }` |
| `/api/modelos` | `GET` | Lista os modelos liberados para as chaves do servidor (Flash-Lite primeiro) |

Proteções embutidas: rotação de chaves com geladeira de 60 s em `429`, limite de requisições
por IP, teto de `maxOutputTokens`, histórico limitado a 24 mensagens, corpo máx. 200 KB,
CORS só para origens listadas em `ALLOWED_ORIGINS` e erros devolvidos com dica em português.

### 2.3 Ligar o app ao proxy

- **Para todos os usuários do deploy:** copie `config.example.json` para `config.json`,
  ajuste e publique. No boot o app lê esse arquivo e aplica `ai.modo = "proxy"`
  (campos já preenchidos pelo usuário não são sobrescritos).
- **Só para você:** Configurações → Inteligência artificial → **Modo de conexão** =
  *Servidor (proxy `/api/ia`)* → **Testar conexão**.

### 2.4 Testar localmente (sem Vercel)

`tools/serve.mjs` executa **as mesmas funções** de `api/`:

```bash
GEMINI_API_KEYS="AIza1,AIza2" npm start
curl http://localhost:8080/api/ia                     # health
curl -X POST http://localhost:8080/api/ia -H 'content-type: application/json' \
     -d '{"mensagens":[{"role":"user","content":"Responda: CONEXÃO OK"}],"maxTokens":40}'
```

---

## 3. Supabase

### 3.1 Criar o projeto e as tabelas

1. Crie um projeto em <https://supabase.com/dashboard> (plano Free).
2. **SQL Editor** → cole o conteúdo de
   [`supabase/migrations/0001_progresso_e_chaves.sql`](../supabase/migrations/0001_progresso_e_chaves.sql)
   → **Run**. Ele cria:
   - `progresso (id, estado jsonb, atualizado_em, origem)` com **RLS ligado** e políticas
     para usuário autenticado *e* para o modo anônimo (id aleatório do navegador);
   - `chaves_ia (ordem, chave, rotulo, ativa)` **sem** política de leitura direta, exposta
     apenas pela função `obter_chaves_ia()` — caminho opcional, veja o aviso abaixo.
3. **Project Settings → API**: copie a `Project URL` e a chave `anon` **public**.

### 3.2 Configurar o app

- **Configurações → Supabase:** cole URL e chave anon, marque *Sincronizar automaticamente*
  e clique em **Testar conexão** → depois **⬆ Enviar backup agora**.
- Ou publique em `config.json` (valores públicos) para o deploy inteiro:

```json
{
  "ai": { "modo": "proxy", "proxyUrl": "/api/ia" },
  "supabase": { "url": "https://SEU-PROJETO.supabase.co", "anonKey": "eyJhbGciOi…", "sincronizar": true }
}
```

O que sincroniza: respostas, flashcards (SRS), simulados, plano, perfil, metas e preferências.
**O que nunca sincroniza:** suas chaves de IA — `estadoParaSync()` remove `ai.apiKey`,
`ai.apiKeys` e as credenciais do Supabase antes do envio (há teste automatizado para isso).

**Restaurar em outro dispositivo:** abra o app, configure URL + anon key e use
**⬇ Restaurar da nuvem**. Sem login, o app usa o id aleatório daquele navegador; para
restaurar em outro aparelho, informe o mesmo id ou copie o backup JSON.

### 3.3 Guardar as chaves de IA no Supabase? Poder, pode — mas prefira a Vercel

A migration inclui a tabela `chaves_ia` + a função `obter_chaves_ia()`, e o app tem o botão
**🔑 Importar chaves de IA do Supabase**. Funciona bem para uso pessoal, mas entenda o
trade-off: a função é `SECURITY DEFINER` com `grant ... to anon`, ou seja **qualquer pessoa
com a sua anon key consegue chamar a RPC e ler as chaves** no navegador.

Ordem de preferência:

1. **`GEMINI_API_KEYS` na Vercel + modo Servidor** → a chave nunca chega ao cliente. ✅
2. **Chave no `localStorage` (modo Navegador)** → só o seu navegador vê. ✅ para uso pessoal.
3. **Chaves no Supabase via RPC** → a chave volta para o navegador de quem chamar a função. ⚠️

Se quiser o caminho 3 com mais segurança, restrinja a execução da função:

```sql
revoke execute on function public.obter_chaves_ia() from anon;
-- só usuários logados conseguem ler as chaves
grant execute on function public.obter_chaves_ia() to authenticated;
```

(Isso exige adicionar login ao app — o código atual não implementa autenticação.)

---

## 4. Verificação final

```bash
npm test                       # validate + smoke (18 rotas) + 21 testes de integração
```

Os testes de integração (`tools/test-integracao.mjs`) cobrem, sem rede: rotação de chaves em
`429`/`401`, geladeira de 60 s, todas as chaves esgotadas (dica + fallback offline), erro não
trocável, `/api/ia` (health sem vazar segredo, validação, rotação, limite por IP, CORS),
`/api/modelos`, envio do progresso **sem** chaves de IA e restauro **preservando** as chaves locais.

Checklist do deploy:

- [ ] `GET https://SEU-APP.vercel.app/api/ia` devolve `{"ok":true,"chaves":2,...}`
- [ ] Configurações → Modo **Servidor** → **Testar conexão** responde `CONEXÃO OK`
- [ ] Configurações → **Listar modelos disponíveis** retorna os modelos Flash/Flash-Lite
- [ ] Simular cota: com apenas 1 chave, gerar 10 questões seguidas deve produzir a dica de `429`
      (e, com 2 chaves, o app deve alternar e continuar respondendo)
- [ ] SQL do Supabase executado; **Testar conexão** + **Enviar backup agora** OK
- [ ] Abrir em outro navegador/dispositivo e **Restaurar da nuvem** traz o progresso
- [ ] PWA: instalar, ficar offline e conferir que o banco continua abrindo (`sw.js` v1.2.0)

## 5. Solução de problemas

| Sintoma | Causa | Correção |
|---|---|---|
| `/api/ia` devolve `404` na Vercel | pasta `api/` fora da raiz do projeto ou `vercel.json` ignorado | confira o *Root Directory* do projeto na Vercel (deve ser a raiz do repo) |
| `Nenhuma chave do Gemini configurada no servidor` | `GEMINI_API_KEYS` ausente ou só em Preview | defina a variável para Production **e** Preview e refaça o deploy |
| `fetch failed` / `ENOTFOUND` vindo do proxy | saída de rede bloqueada no ambiente | libere `generativelanguage.googleapis.com` |
| `Muitas requisições deste IP` | `IA_RATE_LIMIT` baixo ou vários usuários atrás do mesmo IP | aumente `IA_RATE_LIMIT` (o limite é por instância "quente", não é global) |
| CORS bloqueado no navegador | app e proxy em domínios diferentes | liste a origem em `ALLOWED_ORIGINS` (aceita curinga: `https://*.vercel.app`) |
| `Supabase HTTP 404 — relation "public.progresso" does not exist` | migration não foi executada | rode o SQL de `supabase/migrations/0001_…` |
| `Supabase HTTP 401/403` | usou a chave errada | use a **anon public**, nunca a `service_role` no app |
| Backup não acontece sozinho | *Sincronizar automaticamente* desmarcado ou URL/chave vazias | marque a opção e use **Testar conexão**; o envio ocorre 8 s após cada mudança |
| O progresso sumiu depois de um reload | bug antigo de deep merge do `store.js` (corrigido) | atualize para a versão com `mesclar()` corrigido; backups em JSON voltam a importar normalmente |
