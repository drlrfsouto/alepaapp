/* srs.js — repetição espaçada (SM-2 adaptado) para flashcards e questões.
 *
 * Cada item guarda: { ease, intervalo, repeticoes, proxima, ultimoEm, acertos, erros, lapsos }
 * `ease` (fator E-F) começa em 2.5. `intervalo` é em dias. `proxima` é uma data ISO (YYYY-MM-DD).
 *
 * Graus de resposta (flashcards): 0 = Errei | 1 = Difícil | 2 = Bom | 3 = Fácil
 * Questões usam um mapeamento próprio (ver `avaliarQuestao`).
 */

import { todayKey, addDays, clamp } from './util.js';

export const NOVOS = { ease: 2.5, intervalo: 0, repeticoes: 0, proxima: null, lapsos: 0, acertos: 0, erros: 0 };

export function novoCard() { return { ...NOVOS }; }

export function estadoDe(cards, id) {
  return cards[id] || novoCard();
}

/** Intervalos iniciais para itens nunca vistos (em dias). */
const INTERVALOS_INICIAIS = [0, 1, 3]; // 1ª revisão = hoje, 2ª = amanhã, 3ª = em 3 dias

/**
 * Aplica o algoritmo. Retorna o NOVO estado do card (não muta o original).
 */
export function revisar(card, grau, { hoje = todayKey() } = {}) {
  const c = card && card.ease ? { ...card } : novoCard();
  const hojeDate = hoje;

  c.ultimoEm = new Date().toISOString();
  c.ultimoDia = hojeDate;

  let ease = c.ease ?? 2.5;
  let reps = c.repeticoes ?? 0;
  let intervalo = c.intervalo ?? 0;

  if (grau === 0) {
    // ERROU: volta para o começo, mas com intervalo curto (10 min no mesmo dia → 1 dia)
    reps = 0;
    intervalo = c.lapsos >= 3 ? 1 : 0;
    ease = clamp(ease - 0.2, 1.3, 3.0);
    c.lapsos = (c.lapsos || 0) + 1;
    c.erros = (c.erros || 0) + 1;
  } else {
    c.acertos = (c.acertos || 0) + 1;
    if (grau === 1) ease = clamp(ease - 0.15, 1.3, 3.0);
    else if (grau === 2) ease = ease; // mantém
    else ease = clamp(ease + 0.15, 1.3, 3.2); // fácil

    if (reps === 0) intervalo = INTERVALOS_INICIAIS[0] === 0 ? (grau === 3 ? 1 : 0) : 1;
    else if (reps === 1) intervalo = grau === 3 ? 4 : 2;
    else if (reps === 2) intervalo = grau === 3 ? 8 : 4;
    else {
      const base = Math.max(intervalo, 1) * ease;
      intervalo = grau === 1 ? Math.max(1, Math.round(intervalo * 1.2)) : Math.round(base);
    }
    reps += 1;
  }

  intervalo = clamp(Math.round(intervalo), 0, 240);
  c.ease = clamp(ease, 1.3, 3.2);
  c.repeticoes = reps;
  c.intervalo = intervalo;
  c.proxima = addDays(hojeDate, Math.max(intervalo, grau === 0 ? 0 : 1));
  if (grau === 0) c.proxima = hojeDate; // reaparece na mesma sessão
  return c;
}

/** Questões: acerto "de primeira" vale 2 (Bom); acerto após erro vale 1 (Difícil); erro vale 0. */
export function avaliarQuestao(acertou, { jaTinhaErrado = false } = {}) {
  if (!acertou) return 0;
  return jaTinhaErrado ? 1 : 2;
}

export function vencidos(cards, ids, { hoje = todayKey() } = {}) {
  const out = [];
  for (const id of ids) {
    const c = cards[id];
    if (!c || !c.proxima) { out.push({ id, card: novoCard(), atraso: null, novo: true }); continue; }
    if (c.proxima <= hoje) out.push({ id, card: c, atraso: diasEntre(c.proxima, hoje), novo: false });
  }
  return out.sort((a, b) => (b.atraso ?? -1) - (a.atraso ?? -1));
}

export function proximos(cards, ids, dias = 7, { hoje = todayKey() } = {}) {
  const limite = addDays(hoje, dias);
  const buckets = new Map();
  for (let i = 0; i <= dias; i++) buckets.set(addDays(hoje, i), []);
  for (const id of ids) {
    const c = cards[id];
    if (!c) continue;
    if (c.proxima && c.proxima >= hoje && c.proxima <= limite) buckets.get(c.proxima).push(id);
  }
  return [...buckets.entries()].map(([dia, lista]) => ({ dia, total: lista.length, ids: lista }));
}

function diasEntre(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

export function progresso(cards, ids) {
  let dominados = 0;
  let emDia = 0;
  let vencidos = 0;
  let novos = 0;
  const hoje = todayKey();
  for (const id of ids) {
    const c = cards[id];
    if (!c || !c.proxima) { novos += 1; continue; }
    if (c.intervalo >= 21 && (c.ease ?? 2.5) >= 2.4) dominados += 1;
    if (c.proxima > hoje) emDia += 1;
    else vencidos += 1;
  }
  return { dominados, emDia, vencidos, novos, total: ids.length };
}
