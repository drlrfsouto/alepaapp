# Dados — esquemas e regras

Todo o conteúdo vive em `data/` como JSON puro, versionado no Git.
Rode `npm run validate` depois de qualquer edição: o validador confere esquema, ids, referências cruzadas e a aritmética da prova.

**Princípio inegociável: cada questão tem exatamente uma alternativa correta, e o comentário nunca admite ambiguidade.**
Conteúdo que cita dispositivo estadual/regimental sem conferência na fonte oficial recebe `"revisar": "…"`, que aparece como aviso no validador e na tela da questão.

---

## 1. `concurso.json` — o edital em dados

```jsonc
{
  "meta": {
    "orgao": "Assembleia Legislativa do Estado do Pará (ALEPA)",
    "concurso": "Concurso Público nº 002/2026",
    "edital": "Edital de Abertura nº 001/2026, de 28/09/2026",
    "retificacao": "Edital de Retificação nº 002/2026, de 01/10/2026",
    "banca": "Fundação CETAP",
    "siteBanca": "https://fundacaocetap.selecao.net.br/informacoes/156/",
    "siteInscricao": "…",
    "comissao": "…", "regimeJuridico": "…", "validade": "…",
    "localProva": "Belém/PA", "fonteConteudo": "Anexo II — Conteúdo Programático"
  },

  "cargo": {
    "codigo": "02", "nome": "Assessoramento Legislativo — Assessor Técnico",
    "planoCargo": "PL.AL.102", "escolaridade": "…", "requisito": "…",
    "jornada": "30 horas semanais",
    "vencimentoBasico": "R$ 3.697,73",
    "gratificacaoNS": "80% (nível superior)", "gratificacaoDL0412": "100% (DL 04/12)",
    "remuneracaoTotal": "R$ 10.353,64", "taxaInscricao": "R$ 118,00",
    "vagas": { "total": 11, "amplaConcorrencia": 7, "pessoaComDeficiencia": 1,
               "pretosEPardos": 1, "quilombolas": 1, "indigenas": 1 },
    "atribuicoes": ["…", "…"]
  },

  "fases": [{
    "id": "objetiva", "nome": "Prova Objetiva",
    "carater": "Eliminatória e classificatória",
    "data": "2026-12-13", "turno": "MANHÃ", "duracaoMinutos": 180,
    "formato": "50 questões de múltipla escolha com 5 alternativas (A a E) e apenas uma correta",
    "valorQuestao": 0.2,            // ← CADA questão vale 0,2 (valor uniforme)
    "pontuacaoMaxima": 10.0,
    "notaMinimaAprovacao": 6.0,
    "corteClassificatorio": "aprovados os classificados até 4× o número de vagas (4:1)"
  }, { "id": "titulos", "…" : "…" }],

  "estruturaProva": [                // ← ARRAY, um elemento por bloco/disciplina
    { "id": "lp",  "disciplina": "Língua Portuguesa", "questoes": 10, "peso": 0.2, "pontos": 2.0, "bloco": "basica" },
    { "id": "leg", "disciplina": "Legislação Institucional e Ética no Serviço Público", "questoes": 10, "peso": 0.2, "pontos": 2.0, "bloco": "basica" },
    { "id": "inf", "disciplina": "Informática Básica", "questoes": 5, "peso": 0.2, "pontos": 1.0, "bloco": "basica" },
    { "id": "rl",  "disciplina": "Raciocínio Lógico", "questoes": 5, "peso": 0.2, "pontos": 1.0, "bloco": "basica" },
    { "id": "ce",  "disciplina": "Conhecimentos Específicos", "questoes": 20, "peso": 0.2, "pontos": 4.0, "bloco": "especifica" }
  ],

  "estimativaConhecimentosEspecificos": {
    "aviso": "Distribuição ESTIMADA das 20 questões…",
    "porMateria": { "dir-adm": 3, "dir-const": 3, "proc-leg": 3, "dir-civil": 2,
                    "dir-proc-civ": 2, "dir-proc-const": 1, "dir-fin": 1, "dir-prev": 1,
                    "dir-humanos": 1, "adm-geral": 1, "secretaria": 2 }   // soma 20
  },

  "criteriosDesempate": ["a) maior idade (60+, art. 27, parágrafo único, da Lei nº 10.741/2003)",
                         "b) maior nota em Conhecimentos Específicos", "…"],
  "cronograma": [ { "data": "2026-09-28", "evento": "Publicação do Edital…", "status": "concluido" } ],
  "observacoes": ["A Retificação nº 002/2026 alterou…", "…"]
}
```

Regras que o validador exige:
- `estruturaProva` soma **50 questões** e **10,0 pontos**, e `pontos == questoes × 0,2` em cada bloco;
- `fases` contém a fase `objetiva` com `data: "2026-12-13"`;
- `cronograma[].status` ∈ `concluido | em-andamento | futuro` (não existe campo `critico`: a marcação de datas críticas é derivada no código por `ehCritico()` em `src/data.js`);
- `estimativaConhecimentosEspecificos.porMateria` soma **20** e usa apenas ids de `curriculo.json`.

> **Armadilha histórica:** `peso: 0.2` é o **valor por questão**, não um multiplicador por disciplina.
> Os números 2,0 / 1,0 / 4,0 são os **pontos do bloco** (`pontos`). Errar isso infla ou encolhe a nota
> simulada em até 4×.

---

## 2. `curriculo.json` — Anexo II (319 tópicos / 15 matérias)

```jsonc
{
  "_fonte": "ALEPA — Concurso Público nº 002/2026 — Anexo II — Cargo 02",
  "_totalTopicos": 319, "_totalMaterias": 15,
  "_legenda": { "bloco.basica": "…", "bloco.especifica": "…", "prioridade": "S|A|B|C", "dificuldade": "facil|medio|dificil" },
  "materias": [{
    "id": "dir-adm", "nome": "Direito Administrativo", "sigla": "DADM",
    "bloco": "especifica", "questoesProva": 3, "pontosProva": 0.6, "cor": "#f59e0b",
    "topicos": [
      { "id": "dadm-01", "nome": "Regime jurídico administrativo: princípios expressos e implícitos",
        "prioridade": "S", "dificuldade": "medio" }
    ]
  }]
}
```

- O texto do tópico fica em **`nome`** (o app normaliza para `texto` em `src/data.js` — as views aceitam ambos);
- `id` de tópico é a chave que liga **questões, resumos, flashcards, status do usuário e plano de estudos**;
- `prioridade` S/A/B/C alimenta o peso do plano (`PESO_PRIORIDADE` em `src/planner.js`);
- `questoesProva`/`pontosProva` das matérias específicas vêm da estimativa configurável, não do edital.

---

## 3. `questoes/` — o banco

### `index.json` (manifesto)

```jsonc
{
  "descricao": "…", "versao": "1.0.0", "atualizadoEm": "2026-10-15",
  "arquivos": [
    { "arquivo": "lp.json", "materia": "lp", "descricao": "Língua Portuguesa" },
    { "arquivo": "complementares.json", "materia": null,
      "descricao": "…a matéria é definida por questão" }
  ],
  "totais": { "questoes": 101, "porMateria": { "leg": 14, "dir-adm": 12, "…": 0 } },
  "esquema": {
    "obrigatorios": ["id","topico","dificuldade","enunciado","alternativas","gabarito","comentario"],
    "opcionais": ["materia","contexto","mnemonico","leiSeca","tags","pegadinhas","estrategia","estiloBanca","origem","revisar"],
    "dificuldades": ["facil","medio","dificil"],
    "alternativas": "sempre A-E, nesta ordem"
  }
}
```

### Arquivo de matéria (`lp.json`, `dir-adm.json`, …)

```jsonc
{
  "materia": "lp", "descricao": "…", "atualizadoEm": "2026-10-15",
  "questoes": [{
    "id": "lp-q001",                  // prefixo da matéria + qNNN (único no banco inteiro)
    "topico": "lp-06",                // obrigatório existir em curriculo.json
    "dificuldade": "medio",
    "contexto": "1 frase de situação (opcional, recomendado em questões jurídicas)",
    "enunciado": "Assinale a alternativa…",
    "alternativas": [
      { "letra": "A", "texto": "…" }, { "letra": "B", "texto": "…" }, { "letra": "C", "texto": "…" },
      { "letra": "D", "texto": "…" }, { "letra": "E", "texto": "…" }
    ],
    "gabarito": "B",                  // uma letra, única correta
    "comentario": "Explica o acerto, refuta cada distrator nomeando a letra e fecha com a regra prática.",
    "mnemonico": "…", "leiSeca": ["Art. X — teor"], "tags": ["crase","norma-padrão"],
    "pegadinhas": ["…"], "estrategia": "…", "estiloBanca": "…",
    "origem": "inédita — elaborada para este banco",
    "revisar": "texto livre: por que conferir na fonte oficial (opcional)"
  }]
}
```

Regras:
- **sempre 5 alternativas**, letras `A,B,C,D,E` nesta ordem, textos de tamanho comparável;
- proibido "todas as anteriores" / "nenhuma das anteriores";
- `topico` precisa existir no currículo; `materia` própria só em `complementares.json`;
- ids únicos em todo o banco (o validador confere);
- `totais` do manifesto deve bater com a contagem real.

Prefixos usados: `lp-q`, `leg-q`, `inf-q`, `rl-q`, `dadm-q`, `dcon-q`, `pleg-q`, `dciv-q`, `dpc-q`, `dpconst-q`, `dfin-q`, `dprev-q`, `dh-q`, `adm-q`, `sec-q`.

---

## 4. `resumos.json`

```jsonc
{
  "descricao": "…", "atualizadoEm": "2026-10-15",
  "resumos": [{
    "id": "res-dadm-01",                 // res-<sigla>-NN
    "materia": "dir-adm", "topico": "dadm-01",
    "titulo": "Regime jurídico administrativo: princípios expressos e implícitos",
    "tempoLeituraMin": 6,
    "texto": "parágrafos separados por \\n\\n, • para listas, CAIXA ALTA nos termos-chave…",
    "pontosChave": ["5 a 9 fatos testáveis"],
    "mnemonicos": ["LIMPE — Legalidade, Impessoalidade, Moralidade, Publicidade, Eficiência"],
    "caiNaProva": ["3 a 5 observações sobre como a banca cobra o tema"],
    "leiSeca": ["CF, art. 37, caput"],
    "origem": "inédito — elaborado para este banco",
    "revisar": "opcional"
  }]
}
```

`texto` é renderizado pelo subconjunto seguro de markdown de `components.js` (negrito, itálico, listas, títulos, tabelas, código) — nada de HTML cru.

---

## 5. `flashcards.json`

```jsonc
{
  "descricao": "…", "atualizadoEm": "2026-10-15",
  "flashcards": [{
    "id": "fc-001",                      // fc-NNN, sequência global
    "materia": "dir-adm", "topico": "dadm-01",
    "frente": "Quais são os princípios EXPRESSOS no art. 37, caput, da CF?",
    "verso": "LEGALIDADE, IMPESSOALIDADE, MORALIDADE, PUBLICIDADE e EFICIÊNCIA (LIMPE)…",
    "tags": ["princípios","LIMPE"],
    "dificuldade": "facil"
  }]
}
```

Boas práticas: **um fato por cartão**, frente ≤ 180 caracteres, verso ≤ 400, pergunta de lacuna quando possível.
O estado de revisão (ease, intervalo, próxima data) fica no `localStorage` do usuário, nunca aqui.

---

## 6. `simulados.json`

```jsonc
{
  "descricao": "…", "atualizadoEm": "2026-10-15",
  "config": { "valorPorQuestao": 0.2, "pontuacaoMaxima": 10.0, "notaMinima": 6.0,
              "regraCorte": "…", "alternativasPorQuestao": 5, "duracaoMinutos": 180, "turno": "MANHÃ" },
  "simulados": [{
    "id": "sim-prova-real",
    "nome": "Simulado Espelho da Prova — Cargo 02",
    "descricao": "Reproduz EXATAMENTE a prova objetiva…",
    "tipo": "espelho",                    // espelho | bloco | srs | parametrizado | erros
    "duracaoMin": 180, "totalQuestoes": 50,
    "estrutura": [
      { "materia": "lp", "quantidade": 10, "pontos": 2.0, "blocoProva": "Conhecimentos Básicos" },
      { "materia": "dir-adm", "quantidade": 3, "pontos": 0.6, "blocoProva": "Conhecimentos Específicos" }
    ],
    "observacao": "…", "regras": ["…"]
  }],
  "ordemDeDesempate": ["maior idade (60+)", "Conhecimentos Específicos", "…"]
}
```

- `estrutura` **declarativa**: o app sorteia as questões do banco. `estrutura: "dinamica"` = SRS + caderno de erros; `estrutura: "usuario"` = parâmetros escolhidos na tela;
- `pontos = quantidade × 0,2` sempre (o validador confere);
- o espelho precisa somar **50 questões / 10,0 pontos / 30 básicas + 20 específicas**;
- se o banco não tiver questões suficientes para uma matéria, o simulado completa com as disponíveis e avisa na tela — por isso manter a distribuição de `lp` acima de 10 questões é prioridade de produção.

---

## 7. Cobertura e expansão

```bash
npm run lacunas     # tabela: matérias × tópicos × questões × resumos × cards × pontos em jogo
npm run fila        # docs/fila-de-conteudo.md (fila priorizada + modelos de prompt)
npm run gerar       # chama o LLM para preencher lacunas (OPENAI_API_KEY) e revalida
```

Meta de cobertura por tópico: **2 questões, 1 resumo, 3 flashcards**.
O gerador pontua as lacunas por `prioridade do edital × (1 + pontos da matéria) × (1 + itens faltantes)`,
valida cada item gerado (5 alternativas A–E, gabarito único, comentário ≥ 400 caracteres, duplicidade)
e só então grava, recalculando `index.json`.

Estado atual: **101 questões · 20 resumos · 164 flashcards · 319 tópicos · 15 matérias**.
