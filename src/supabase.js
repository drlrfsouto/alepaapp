/* supabase.js — integração OPCIONAL com o Supabase, sem dependências (REST/PostgREST puro).
 *
 * Para que serve:
 *   1. **Sincronizar o progresso** entre dispositivos (tabela `progresso`, jsonb).
 *   2. **Configurar o app no deploy** (arquivo `config.json` na raiz): modo de IA
 *      (navegador ou proxy), URL do proxy e credenciais públicas do Supabase.
 *   3. (Opcional) **ler chaves de IA do Supabase** via `rpc('obter_chaves_ia')` — só
 *      recomendado se você entende que a chave volta para o navegador. Prefira o proxy.
 *
 * Segurança:
 *   - Use SEMPRE a chave `anon` (pública). A `service_role` NUNCA deve aparecer aqui.
 *   - O progresso enviado NÃO inclui chaves de IA (`ai.apiKey` / `ai.apiKeys` são
 *     removidos antes do upload) — veja `estadoParaSync()`.
 *   - Sem login, a linha é identificada por um UUID aleatório gerado neste navegador:
 *     quem souber o id consegue ler aquele progresso. Habilite o RLS por usuário
 *     (ver supabase/migrations) se quiser proteção de verdade.
 */

import { get, set, subscribe, importar, persistir } from './store.js';
import { uid } from './util.js';

const CAMPO = 'supabase';
let timerSync = null;
let enviando = false;
let ignorarProximoEvento = false;

/* ========================= configuração pública ========================= */

/**
 * Lê `config.json` da raiz (se existir) e preenche apenas os campos VAZIOS do estado.
 * Assim um deploy já vem configurado para todo mundo, sem sobrescrever escolhas locais.
 * Exemplo em `config.example.json`.
 */
export async function aplicarConfigPublica() {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const pub = await res.json();
    if (!pub || typeof pub !== 'object') return null;
    set((s) => {
      const ia = pub.ai || {};
      if (ia.modo && ['navegador', 'proxy'].includes(ia.modo)) s.ai.modo = ia.modo;
      if (ia.proxyUrl && !s.ai.proxyUrl) s.ai.proxyUrl = String(ia.proxyUrl);
      if (ia.modelo && !s.ai.modelo) s.ai.modelo = String(ia.modelo);
      if (ia.provedor && !s.ai.provedor) s.ai.provedor = String(ia.provedor);
      const sb = pub.supabase || pub[CAMPO] || {};
      if (sb.url && !s.supabase.url) s.supabase.url = String(sb.url).replace(/\/$/, '');
      if (sb.anonKey && !s.supabase.anonKey) s.supabase.anonKey = String(sb.anonKey);
      if (typeof sb.sincronizar === 'boolean') s.supabase.sincronizar = sb.sincronizar;
    });
    return pub;
  } catch {
    return null; // sem config.json: nada a fazer
  }
}

/* ========================= cliente REST ========================= */

export function supabaseConfigurado(sb = get()[CAMPO]) {
  return Boolean(sb && sb.url && sb.anonKey && /^https?:\/\//.test(sb.url));
}

/** Id deste dispositivo (criado na primeira vez) — chave da linha em `progresso`. */
export function idDispositivo() {
  const atual = get()[CAMPO]?.dispositivo;
  if (atual) return atual;
  const novo = uid('dev');
  set((s) => { s[CAMPO].dispositivo = novo; });
  return novo;
}

async function sbFetch(caminho, { sb = get()[CAMPO], metodo = 'GET', corpo = null, prefer = null } = {}) {
  if (!supabaseConfigurado(sb)) throw new Error('Supabase não configurado (URL + chave anon).');
  const url = `${sb.url.replace(/\/$/, '')}${caminho}`;
  const headers = {
    apikey: sb.anonKey,
    authorization: `Bearer ${sb.anonKey}`,
    'content-type': 'application/json',
  };
  if (prefer) headers.prefer = prefer;
  const res = await fetch(url, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await res.text().catch(() => '');
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  if (!res.ok) {
    const detalhe = (json && (json.message || json.hint || json.details)) || texto.slice(0, 200) || res.statusText;
    throw new Error(`Supabase HTTP ${res.status} — ${detalhe}`);
  }
  return json;
}

/* ========================= progresso ========================= */

/**
 * Estado que vai para a nuvem: sem chaves de IA e sem as próprias credenciais do Supabase.
 */
export function estadoParaSync(estado = get()) {
  const copia = JSON.parse(JSON.stringify(estado));
  if (copia.ai) {
    copia.ai.apiKey = '';
    copia.ai.apiKeys = [];
    copia.ai.chaveGelada = {};
  }
  delete copia.supabase;
  return copia;
}

/** Envia o progresso atual (upsert pela id do dispositivo). */
export async function enviarProgresso() {
  const sb = get()[CAMPO];
  const id = idDispositivo();
  const linha = {
    id,
    estado: estadoParaSync(),
    atualizado_em: new Date().toISOString(),
    origem: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 120) : 'node',
  };
  const r = await sbFetch('/rest/v1/progresso?on_conflict=id', {
    sb, metodo: 'POST', corpo: linha, prefer: 'resolution=merge-duplicates,return=minimal',
  });
  set((s) => { s[CAMPO].ultimaSync = linha.atualizado_em; });
  return { ok: true, id, quando: linha.atualizado_em, bruto: r };
}

/** Baixa o progresso gravado (por padrão o deste dispositivo). */
export async function baixarProgresso(id = idDispositivo()) {
  const sb = get()[CAMPO];
  const linhas = await sbFetch(`/rest/v1/progresso?id=eq.${encodeURIComponent(id)}&select=id,estado,atualizado_em&limit=1`, { sb });
  const linha = Array.isArray(linhas) ? linhas[0] : linhas;
  if (!linha || !linha.estado) return null;
  return { id: linha.id, estado: linha.estado, atualizadoEm: linha.atualizado_em };
}

/** Restaura o estado a partir da nuvem, PRESERVANDO as chaves de IA locais. */
export async function restaurarProgresso(id) {
  const remoto = await baixarProgresso(id);
  if (!remoto) return null;
  const aiLocal = JSON.parse(JSON.stringify(get().ai));
  const sbLocal = JSON.parse(JSON.stringify(get()[CAMPO]));
  importar(remoto.estado);
  set((s) => {
    s.ai = Object.assign({}, s.ai, aiLocal, { apiKey: aiLocal.apiKey, apiKeys: aiLocal.apiKeys });
    s[CAMPO] = Object.assign({}, s[CAMPO], sbLocal, { ultimaSync: remoto.atualizadoEm });
  });
  persistir();
  return remoto;
}

/* ========================= sincronização automática ========================= */

/** Liga o backup automático: envia (com debounce) após cada mudança de estado. */
export function iniciarSincronizacao() {
  subscribe(() => {
    if (ignorarProximoEvento) { ignorarProximoEvento = false; return; }
    if (enviando) return;
    const sb = get()[CAMPO];
    if (!sb?.sincronizar || !supabaseConfigurado(sb)) return;
    clearTimeout(timerSync);
    timerSync = setTimeout(async () => {
      if (enviando) return;
      enviando = true;
      ignorarProximoEvento = true; // o set() de ultimaSync não deve gerar novo envio
      try {
        await enviarProgresso();
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[supabase] falha no backup automático:', e.message);
        ignorarProximoEvento = false;
      } finally {
        enviando = false;
      }
    }, 8000);
  });
}

/* ========================= chaves de IA via Supabase (opcional) ========================= */

/**
 * Busca chaves guardadas no Supabase pela função `obter_chaves_ia()` (SECURITY DEFINER).
 * ATENÇÃO: neste caminho a chave VOLTA para o navegador. Para produção prefira o proxy
 * (`api/ia.js`) com as chaves em variáveis de ambiente do deploy.
 */
export async function lerChavesIA() {
  const linhas = await sbFetch('/rest/v1/rpc/obter_chaves_ia', { metodo: 'POST', corpo: {} });
  const lista = (Array.isArray(linhas) ? linhas : [])
    .filter((l) => l && l.chave)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map((l) => String(l.chave).trim());
  return [...new Set(lista)];
}

/** Carrega as chaves do Supabase para o estado local (principal + contingência). */
export async function importarChavesIA() {
  const lista = await lerChavesIA();
  if (!lista.length) return { total: 0 };
  set((s) => {
    s.ai.provedor = 'gemini';
    s.ai.apiKey = lista[0];
    s.ai.apiKeys = lista.slice(1);
    s.ai.chaveAtiva = 0;
    s.ai.chaveGelada = {};
  });
  persistir();
  return { total: lista.length };
}
