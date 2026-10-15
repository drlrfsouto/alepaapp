/* tools/validate-data.mjs — validação de integridade dos dados estáticos.
 *
 * Verifica:
 *  - todos os JSON parseiam;
 *  - currículo: matérias únicas, tópicos com id único e campos mínimos;
 *  - questões: id único, 5 alternativas A-E sem repetição, gabarito existente,
 *    campos obrigatórios, topico e materia referenciados no currículo;
 *  - resumos/flashcards: referências de topico e materia válidas;
 *  - simulados: estrutura referencia matérias existentes e soma 50 questões
 *    no modelo espelho, com pesos coerentes com o edital;
 *  - index.json: soma declarada confere com os arquivos reais.
 *
 * Uso: node tools/validate-data.mjs   (exit code 1 se houver erro)
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = join(RAIZ, 'data');

const erros = [];
const avisos = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const erro = (msg) => { erros.push(msg); console.log(`  ✗ ${msg}`); };
const aviso = (msg) => { avisos.push(msg); console.log(`  ! ${msg}`); };

async function lerJSON(caminho) {
  try {
    return JSON.parse(await readFile(join(DATA, caminho), 'utf8'));
  } catch (e) {
    erro(`${caminho}: ${e.message}`);
    return null;
  }
}

console.log('Validando dados do ALEPA 2026…\n');

/* ---------- concurso ---------- */
console.log('• data/concurso.json');
const concurso = await lerJSON('concurso.json');
if (concurso) {
  if (!concurso.cargo) erro('concurso: falta "cargo"');
  if (!Array.isArray(concurso.cronograma)) erro('concurso: falta "cronograma" (array)');
  else ok(`cronograma com ${concurso.cronograma.length} eventos`);
  if (!Array.isArray(concurso.estruturaProva)) erro('concurso: falta "estruturaProva" (array de blocos)');
  else {
    const d = concurso.estruturaProva;
    const total = d.reduce((s, x) => s + (x.questoes || 0), 0);
    const pontos = d.reduce((s, x) => s + (x.pontos || 0), 0);
    if (total !== 50) erro(`estruturaProva: soma de questões = ${total} (esperado 50)`);
    else ok('estrutura da prova soma 50 questões');
    if (Math.round(pontos * 100) / 100 !== 10) erro(`estruturaProva: soma de pontos = ${pontos} (esperado 10,0)`);
    else ok('estrutura da prova soma 10,0 pontos');
    for (const b of d) {
      const esperado = Math.round((b.questoes || 0) * 0.2 * 100) / 100;
      if (Math.round((b.pontos || 0) * 100) / 100 !== esperado) erro(`estruturaProva: bloco ${b.id} pontos=${b.pontos}, esperado ${esperado} (questões × 0,2)`);
    }
    ok('cada bloco confere com 0,2 ponto por questão');
  }
  const fase = (concurso.fases || []).find((f) => /objetiva/i.test(f.id || f.nome || ''));
  if (fase?.data !== '2026-12-13') aviso(`fase objetiva com data ${fase?.data} (esperado 2026-12-13)`);
  else ok('data da prova objetiva: 13/12/2026');
}

/* ---------- currículo ---------- */
console.log('• data/curriculo.json');
const curriculo = await lerJSON('curriculo.json');
const materias = curriculo?.materias || [];
const topicosPorId = new Map();
const materiaIds = new Set();
if (curriculo) {
  for (const m of materias) {
    if (materiaIds.has(m.id)) erro(`curriculo: matéria duplicada "${m.id}"`);
    materiaIds.add(m.id);
    if (!m.nome) erro(`curriculo: matéria ${m.id} sem nome`);
    if (!['basica', 'especifica'].includes(m.bloco)) erro(`curriculo: matéria ${m.id} com bloco inválido (${m.bloco})`);
    for (const t of m.topicos || []) {
      if (topicosPorId.has(t.id)) erro(`curriculo: tópico duplicado "${t.id}"`);
      topicosPorId.set(t.id, { ...t, materia: m.id });
      const textoTopico = t.texto || t.nome;
      if (!textoTopico || String(textoTopico).trim().length < 3) erro(`curriculo: tópico ${t.id} sem texto/nome`);
      if (!t.prioridade) aviso(`curriculo: tópico ${t.id} sem prioridade`);
    }
  }
  ok(`${materias.length} matérias, ${topicosPorId.size} tópicos`);
}

/* ---------- questões ---------- */
console.log('• data/questoes/');
const indice = await lerJSON('questoes/index.json');
const questoes = [];
if (indice) {
  for (const entrada of indice.arquivos || []) {
    const arq = await lerJSON(`questoes/${entrada.arquivo}`);
    if (!arq) continue;
    for (const q of arq.questoes || []) {
      const materia = q.materia || entrada.materia;
      questoes.push({ ...q, materia });

      if (!q.id) erro(`${entrada.arquivo}: questão sem id`);
      if (!q.enunciado || q.enunciado.trim().length < 10) erro(`${q.id}: enunciado curto/vazio`);
      if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) erro(`${q.id}: ${q.alternativas?.length ?? 0} alternativas (esperado 5)`);
      const letras = (q.alternativas || []).map((a) => a.letra);
      if (letras.join('') !== 'ABCDE') erro(`${q.id}: letras fora de ordem ou repetidas (${letras.join('')})`);
      for (const a of q.alternativas || []) {
        if (!a.texto || !String(a.texto).trim()) erro(`${q.id}: alternativa ${a.letra} sem texto`);
      }
      if (!['A', 'B', 'C', 'D', 'E'].includes(q.gabarito)) erro(`${q.id}: gabarito inválido (${q.gabarito})`);
      if (!q.comentario || q.comentario.trim().length < 40) erro(`${q.id}: comentário ausente ou muito curto`);
      if (!['facil', 'medio', 'dificil'].includes(q.dificuldade)) erro(`${q.id}: dificuldade inválida (${q.dificuldade})`);
      if (!materiaIds.has(materia)) erro(`${q.id}: materia "${materia}" não existe no currículo`);
      if (q.topico && !topicosPorId.has(q.topico)) erro(`${q.id}: topico "${q.topico}" não existe no currículo`);
      if (q.revisar) aviso(`${q.id}: marcado para conferência na fonte oficial`);
    }
  }
  const ids = new Set();
  for (const q of questoes) {
    if (ids.has(q.id)) erro(`questão duplicada: ${q.id}`);
    ids.add(q.id);
  }
  ok(`${questoes.length} questões únicas`);

  const declarado = indice.totais?.questoes;
  if (declarado !== questoes.length) erro(`index.json declara ${declarado} questões, mas há ${questoes.length}`);
  else ok('contagem declarada no index.json confere');

  const porMat = {};
  for (const q of questoes) porMat[q.materia] = (porMat[q.materia] || 0) + 1;
  for (const [m, n] of Object.entries(indice.totais?.porMateria || {})) {
    if ((porMat[m] || 0) !== n) erro(`index.json: porMateria.${m} = ${n}, real = ${porMat[m] || 0}`);
  }
  const semQuestao = materias.filter((m) => !porMat[m.id]);
  if (semQuestao.length) aviso(`matérias sem questões no banco: ${semQuestao.map((m) => m.id).join(', ')}`);
}

/* ---------- resumos ---------- */
console.log('• data/resumos.json');
const resumos = (await lerJSON('resumos.json'))?.resumos || [];
for (const r of resumos) {
  if (!r.id) erro('resumo sem id');
  if (!r.titulo) erro(`${r.id}: sem título`);
  if (!r.texto || r.texto.length < 200) erro(`${r.id}: texto curto`);
  if (!materiaIds.has(r.materia)) erro(`${r.id}: materia inválida (${r.materia})`);
  if (r.topico && !topicosPorId.has(r.topico)) erro(`${r.id}: topico inválido (${r.topico})`);
}
ok(`${resumos.length} resumos`);

/* ---------- flashcards ---------- */
console.log('• data/flashcards.json');
const cards = (await lerJSON('flashcards.json'))?.flashcards || [];
const idsCard = new Set();
for (const c of cards) {
  if (!c.id) erro('flashcard sem id');
  if (idsCard.has(c.id)) erro(`flashcard duplicado: ${c.id}`);
  idsCard.add(c.id);
  if (!c.frente || !c.verso) erro(`${c.id}: frente/verso vazios`);
  if (!materiaIds.has(c.materia)) erro(`${c.id}: materia inválida (${c.materia})`);
  if (c.topico && !topicosPorId.has(c.topico)) erro(`${c.id}: topico inválido (${c.topico})`);
}
ok(`${cards.length} flashcards`);

/* ---------- simulados ---------- */
console.log('• data/simulados.json');
const simulados = (await lerJSON('simulados.json'))?.simulados || [];
for (const s of simulados) {
  if (!Array.isArray(s.estrutura)) continue;
  let total = 0;
  for (const b of s.estrutura) {
    if (!materiaIds.has(b.materia)) erro(`${s.id}: bloco com materia inválida (${b.materia})`);
    total += b.quantidade || 0;
  }
  if (s.totalQuestoes && total !== s.totalQuestoes) erro(`${s.id}: estrutura soma ${total}, declarado ${s.totalQuestoes}`);
  const pts = s.estrutura.reduce((a, b) => a + (b.pontos || 0), 0);
  for (const b of s.estrutura) {
    const esperado = Math.round((b.quantidade || 0) * 0.2 * 100) / 100;
    if (Math.round((b.pontos || 0) * 100) / 100 !== esperado) erro(`${s.id}: bloco ${b.materia} pontos=${b.pontos}, esperado ${esperado}`);
  }
  if (s.id === 'sim-prova-real') {
    if (total !== 50) erro('sim-prova-real: deveria somar 50 questões');
    else ok('simulado espelho soma 50 questões');
    if (Math.round(pts * 100) / 100 !== 10) erro(`sim-prova-real: soma de pontos = ${pts} (esperado 10,0)`);
    else ok('simulado espelho soma 10,0 pontos');
    const basicas = s.estrutura.filter((b) => ['lp', 'leg', 'inf', 'rl'].includes(b.materia)).reduce((s2, b) => s2 + b.quantidade, 0);
    if (basicas !== 30) erro(`sim-prova-real: bloco básico soma ${basicas} (esperado 30)`);
    const especificas = total - basicas;
    if (especificas !== 20) erro(`sim-prova-real: bloco específico soma ${especificas} (esperado 20)`);
    if (basicas === 30 && especificas === 20) ok('divisão 30 básicas + 20 específicas confere');
  }
}
ok(`${simulados.length} modelos de simulado`);

/* ---------- resumo ---------- */
console.log('\n———————————————');
console.log(`Questões: ${questoes.length} · Resumos: ${resumos.length} · Flashcards: ${cards.length} · Tópicos: ${topicosPorId.size} · Matérias: ${materias.length}`);
if (avisos.length) console.log(`\n${avisos.length} aviso(s):`);
for (const a of avisos) console.log(`  ! ${a}`);
if (erros.length) {
  console.log(`\n❌ ${erros.length} ERRO(S) encontrados.`);
  process.exit(1);
}
console.log('\n✅ Todos os dados são válidos e consistentes.');
