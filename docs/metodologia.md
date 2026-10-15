# Metodologia de estudo

Este documento explica **por que** o app funciona do jeito que funciona: a aritmética da prova,
os princípios de aprendizagem aplicados e os algoritmos por trás de cada recurso.

> Contagem de referência: **hoje → 13/12/2026 = 59 dias**; 319 tópicos no Anexo II; 15 matérias.

---

## 1. A aritmética que decide a aprovação

| Bloco | Questões | Valor/questão | Pontos | % da prova |
|---|---|---|---|---|
| Conhecimentos Específicos (11 matérias) | 20 | 0,2 | **4,0** | 40% |
| Língua Portuguesa | 10 | 0,2 | 2,0 | 20% |
| Legislação Institucional e Ética | 10 | 0,2 | 2,0 | 20% |
| Informática Básica | 5 | 0,2 | 1,0 | 10% |
| Raciocínio Lógico | 5 | 0,2 | 1,0 | 10% |
| **Total** | **50** | — | **10,0** | 100% |

Consequências práticas:

- **Corte de aprovação: 6,0 pontos = 30 acertos em 50.** Além disso, só é aprovado quem ficar
  dentro de **4× o número de vagas** (11 vagas → os 44 primeiros, além dos empatados).
- **Meta segura: 8,0 = 40 acertos.** Com 11 vagas e corte classificatório, 6,0 é sobrevivência;
  8,0 é zona de nomeação.
- **Cada questão vale exatamente o mesmo (0,2).** Não existe "peso" por disciplina: o que muda é
  quantas questões cada bloco tem. Isso simplifica toda a otimização: *valor esperado de estudar
  uma matéria = pontos do bloco × probabilidade de acertar*.
- **Específicos é o maior bloco (4,0) e ainda é o primeiro critério de desempate depois da idade.**
  Empate em nota → ganha quem tiver mais pontos em Específicos, depois Legislação e Ética,
  depois Português, depois RL, depois Informática. Ou seja: a ordem de desempate é
  *exatamente* a ordem de prioridade de estudo.

Distribuição interna das 20 questões de Específicos **não é fixada pelo edital**.
O app usa uma estimativa configurável (`data/concurso.json → estimativaConhecimentosEspecificos`),
exposta na tela de Configurações: Dir. Administrativo 3 · Dir. Constitucional 3 ·
Processo Legislativo 3 · Dir. Civil 2 · Dir. Processual Civil 2 · Secretaria 2 ·
Dir. Processual Constitucional 1 · Dir. Financeiro 1 · Dir. Previdenciário 1 ·
Direitos Humanos 1 · Adm. Geral 1 = 20.

---

## 2. Princípios de aprendizagem aplicados

| Princípio (evidência) | Como o app aplica |
|---|---|
| **Practice testing / retrieval** — testar-se supera reler | Todo conteúdo vira pergunta: 101 questões comentadas, 164 flashcards, simulados espelho. Resumos terminam em `pontosChave` e `caiNaProva`, não em texto corrido |
| **Spaced repetition** — revisar no ponto de quase-esquecimento | SRS próprio (SM-2 adaptado) em `src/srs.js`; fila de "vencidos" no Painel e nos Flashcards |
| **Interleaving** — alternar matérias melhora discriminação | O plano alterna matérias a cada slot de ~45 min, sempre escolhendo a mais "atrasada" em relação à meta proporcional |
| **Feedback imediato e elaborado** | Comentário por alternativa, `pegadinhas`, `estrategia`, `estiloBanca`, `leiSeca` e `mnemonico` aparecem na hora da resposta |
| **Elaboração ("por que errei?")** | Caderno de erros só libera a questão após **2 acertos consecutivos** |
| **Priorização por valor esperado** | Score do plano = pontos da matéria × prioridade do edital × fator de ponto fraco |
| **Metacognição** | Autoavaliação em 4 graus no flashcard, projeção de nota em tempo real, contagem regressiva |
| **Aprendizagem distribuída (não massificada)** | Streak diário, meta de horas/dia, recomendação do dia; reta final com simulados semanais em vez de virada de noite |

---

## 3. Algoritmo de repetição espaçada (`src/srs.js`)

Estado por cartão: `{ ease, intervalo, repeticoes, proxima, lapsos, acertos, erros }`.
`ease` começa em **2,5** e vive entre **1,3 e 3,2**.

Autoavaliação em 4 graus:

| Grau | Botão | Efeito no `ease` | Próximo intervalo |
|---|---|---|---|
| 0 | 1 · Errei | −0,20 | volta **hoje**, na mesma sessão; `lapsos +1`; após 3 lapsos o intervalo cai para 1 dia |
| 1 | 2 · Difícil | −0,15 | `intervalo × 1,2` (mínimo 1 dia) |
| 2 | 3 · Bom | mantém | `intervalo × ease` |
| 3 | 4 · Fácil | +0,15 | `intervalo × ease`, com atalhos nas primeiras repetições |

Primeiras repetições (intervalos iniciais `[0, 1, 3]`): 1ª revisão no mesmo dia (ou 1 dia se "Fácil"),
2ª em 2 dias (4 se "Fácil"), 3ª em 4 dias (8 se "Fácil"); depois entra a multiplicação por `ease`.
Intervalo máximo: **240 dias**.

Cartão **dominado**: `intervalo ≥ 21 dias` e `ease ≥ 2,4` — é o que alimenta o progresso da tela de Flashcards.

Questões também alimentam o SRS (`avaliarQuestao`): acerto de primeira vale grau 2,
acerto depois de erro vale grau 1, erro vale grau 0.

---

## 4. Geração do plano de estudos (`src/planner.js`)

Entradas: matérias e tópicos do Anexo II, estrutura da prova, horas/dia, dias da semana,
data da prova e o histórico do usuário.

1. **Pontos por matéria** — `estruturaProva` do espelho da prova (Específicos expandido pela
   estimativa configurável). Total = 10,0.
2. **Fator de ponto fraco** — por matéria, com amostra mínima de 3 tentativas:
   `fator = clamp(1 + (0,75 − taxaDeAcerto), 0,85; 1,5)`. Acertando 40% → fator 1,35 (mais tempo);
   acertando 90% → fator 0,85 (menos tempo).
3. **Dias úteis** — apenas os dias da semana configurados, de hoje até a véspera da prova.
4. **Reserva de reta final** — os últimos **12% dos dias** (mínimo 2) são separados para revisão
   relâmpago + simulados; o conteúdo entra nos dias anteriores.
5. **Fila de tópicos** — cada tópico recebe
   `score = pontosDaMatéria × pesoDaPrioridade × fatorDePontoFraco`, com
   `S = 1,6 · A = 1,3 · B = 1,0 · C = 0,7`, e um custo em minutos
   (`estimarMinutos`: base 25 min para matérias específicas e 20 para básicas, × dificuldade
   (fácil 0,8 · médio 1,0 · difícil 1,3) × prioridade (S 1,3 · A 1,15 · B 1,0 · C 0,85) × tamanho do
   enunciado do tópico no edital; limitado a 10–60 min).
6. **Distribuição** — cada dia é fatiado em slots de até **45 min**; a cada slot o algoritmo escolhe
   a matéria **mais atrasada** em relação ao seu alvo de minutos
   (`alvo = minutosDeConteúdo × pontosDaMatéria / 10,0`), o que produz intercalação automática e
   garante que nenhuma matéria fique para o fim. Quando a fila de uma matéria acaba, o cursor
   reinicia — a matéria volta a aparecer, funcionando como revisão espaçada natural.
7. **Reta final** — a cada 3 dias entra um **simulado completo (180 min)**; o restante do tempo vai
   para revisão relâmpago dos tópicos **S e A** (20 min por tópico).

Saída: dias com blocos `{ materia, materiaNome, cor, minutos, tipo, topicos[] }`, resumo
(dias, horas totais, tópicos cobertos) e um **aviso honesto** quando o tempo disponível não cobre
os 319 tópicos — com a orientação de aumentar horas/dia. Cobrir tudo é impossível para a maioria dos
perfis; cobrir **S e A** é o objetivo real.

`recomendacaoDeHoje()` monta a fila do dia: simulado espelho (nos últimos 30 dias, a cada 7 dias) →
plano do dia → caderno de erros.

---

## 5. Métricas e projeção (`src/views/stats.js`)

- **Projeção de nota** = Σ (pontos do bloco × sua taxa de acerto no bloco).
  Matérias sem histórico contam como **50%** e aparecem marcadas com `*`
  (a projeção só fica confiável com ≥5 questões respondidas por matéria).
- **Desempenho por matéria** ordenado do pior para o melhor → é a lista de compras do seu tempo.
- **Atividade dos últimos 14 dias**, **streak** e minutos estimados do dia.
- **Simulados**: nota, acertos, tempo, taxa por matéria e pontos por bloco (sempre 0,2 por questão).

Gatilhos de ajuste sugeridos:

| Sinal | Ação |
|---|---|
| Projeção < 6,0 | Aumente horas/dia e concentre em Específicos (4,0) |
| Taxa < 60% em uma matéria | Refaça o resumo do tópico + 10 flashcards/dia daquela matéria |
| Projeção ≥ 7,0 estável | Troque tempo de leitura por simulado cronometrado |
| Muitos cartões "vencidos" | Reduza novos cartões por 2–3 dias e quite a fila |
| Últimos 14 dias | Só caderno de erros, flashcards S/A e simulados — nada de conteúdo novo |

---

## 6. Protocolo sugerido (do hoje à prova)

**Fase 1 — Base (15/10 a 04/11):** plano de conteúdo puro, 2 blocos de 45 min + 20 min de flashcards
por dia. Termine as inscrições até **04/11/2026** (o app mostra o evento como data crítica).
Objetivo: cobrir todos os tópicos **S** e a maior parte dos **A**, com 1 resumo + questões por matéria.

**Fase 2 — Consolidação (05/11 a 25/11):** mantém o plano, entra **1 simulado por semana**
(bloco específico num dia, bloco básico no outro) e o caderno de erros vira rotina diária de 20 min.
Em **25/11** saem a homologação das inscrições e os locais de prova — confira o seu.

**Fase 3 — Reta final (26/11 a 12/12):** apenas revisão relâmpago dos tópicos S/A, flashcards vencidos,
caderno de erros e **simulado espelho cronometrado (3 h) no mesmo turno da prova (manhã)**.
No dia **13/12**, prova às 8h em Belém: documento, caneta preta transparente, chegada com 1 h de antecedência.

**Depois da prova:** gabarito preliminar em 14/12, recursos em 15 e 16/12, gabarito definitivo em
20/01/2027 e resultado final em 10/03/2027 — todos no cronograma do app.

Ritmo de 3 h/dia (perfil padrão):
`2 × 45 min conteúdo novo (matérias alternadas)` + `30 min questões da matéria do dia`
+ `20 min flashcards vencidos` + `20 min releitura de pontos-chave e pegadinhas` + `20 min caderno de erros`.

---

## 7. Como a banca cobra (e como o app treina isso)

Padrões recorrentes da Fundação CETAP, embutidos nos campos `estiloBanca` e `pegadinhas`:

- **Literalidade da lei seca**: troca de *prazo*, *órgão*, *quórum*, *competência* e *maiúscula/minúscula*.
  Por isso cada questão guarda `leiSeca[]` com o teor do dispositivo.
- **Enunciados com "EXCETO", "INCORRETA", "NÃO"** — o app mantém a palavra em CAIXA ALTA e o
  resolvedor destaca o comando antes das alternativas.
- **Distratores longos e "quase certos"** — o comentário refuta **cada letra**, nomeando-a.
- **Casos concretos curtos** (um servidor, uma comissão, um parecer) — o campo `contexto` existe para isso.
- **Cobrança do Anexo II inteiro, inclusive temas "menores"** — por isso o currículo tem os 319 tópicos
  com prioridade, e o plano avisa quando não dá para cobrir tudo.

---

## 8. Uso responsável da IA

- A IA é **opcional** (`Config → Tutor IA`): sem chave, o app inteiro continua funcionando
  (explicações, resumos e diagnóstico têm modo offline derivado dos próprios dados).
- A chave fica **somente no `localStorage` do navegador**; nenhuma chamada passa por servidor nosso.
- O `SYSTEM_PROMPT` proíbe inventar artigo, súmula, prazo ou jurisprudência e exige que o modelo
  declare a incerteza. Ainda assim: **tudo que a IA produzir deve ser conferido na fonte oficial**.
- Conteúdo gerado que cita norma estadual/regimental entra no banco com `"revisar": "…"`;
  o validador lista esses itens como avisos até a conferência.
- Questões geradas só são aceitas se passarem por `validarQuestaoGerada`
  (5 alternativas A–E, gabarito único, comentário mínimo, sem duplicidade).

---

## 9. Limitações conhecidas

- A distribuição das 20 questões de Específicos é **estimativa** (o edital não a fixa).
- 6 questões do banco estão marcadas `revisar` por citarem norma estadual/regimental que precisa de
  conferência na fonte oficial (lista em `npm run validate`).
- Cobertura atual: 101 questões, 20 resumos e 164 flashcards para 319 tópicos —
  as lacunas estão mapeadas e priorizadas em `docs/fila-de-conteudo.md`, e o preenchimento é
  automatizável (`npm run gerar`).
- Este material **não é oficial**: não é produzido pela ALEPA nem pela Fundação CETAP.
  Em caso de divergência, prevalece o edital publicado no site da banca.
