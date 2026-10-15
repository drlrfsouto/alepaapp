-- supabase/migrations/0001_progresso_e_chaves.sql
-- Rode no SQL Editor do Supabase (ou `supabase db push` se usar a CLI).
-- Cria: (1) sincronização do progresso do app e (2) caminho OPCIONAL para guardar
-- chaves de IA no banco. Idempotente: pode rodar de novo sem estragar nada.

-- ============================================================
-- 1. Progresso do app (jsonb) — backup/restauro entre dispositivos
-- ============================================================
create table if not exists public.progresso (
  id             text primary key,                 -- uuid do dispositivo ou auth.uid()::text
  estado         jsonb not null,                   -- estado do app SEM chaves de IA
  atualizado_em  timestamptz not null default now(),
  origem         text
);

comment on table public.progresso is
  'Estado do app ALEPA 2026 (respostas, SRS, simulados, plano). Não contém chaves de IA.';

alter table public.progresso enable row level security;

-- (a) usuário autenticado: só enxerga a própria linha
drop policy if exists "progresso_select_autenticado" on public.progresso;
create policy "progresso_select_autenticado" on public.progresso
  for select to authenticated
  using (id = auth.uid()::text);

drop policy if exists "progresso_upsert_autenticado" on public.progresso;
create policy "progresso_upsert_autenticado" on public.progresso
  for insert to authenticated
  with check (id = auth.uid()::text);

drop policy if exists "progresso_update_autenticado" on public.progresso;
create policy "progresso_update_autenticado" on public.progresso
  for update to authenticated
  using (id = auth.uid()::text) with check (id = auth.uid()::text);

-- (b) modo ANÔNIMO (app sem login): o id é um UUID aleatório gerado no navegador.
--     Quem souber o id lê aquele progresso — é "segurança por obscuridade".
--     Se isso não bastar para você, apague estas três políticas e use login.
drop policy if exists "progresso_select_anon" on public.progresso;
create policy "progresso_select_anon" on public.progresso
  for select to anon
  using (true);

drop policy if exists "progresso_insert_anon" on public.progresso;
create policy "progresso_insert_anon" on public.progresso
  for insert to anon
  with check (true);

drop policy if exists "progresso_update_anon" on public.progresso;
create policy "progresso_update_anon" on public.progresso
  for update to anon
  using (true) with check (true);

-- índice para consultas por data (opcional, útil com muitas linhas)
create index if not exists progresso_atualizado_em_idx on public.progresso (atualizado_em desc);

-- ============================================================
-- 2. Chaves de IA no banco (OPCIONAL — prefira variáveis de ambiente do deploy)
-- ============================================================
-- ATENÇÃO: a função abaixo é SECURITY DEFINER e, com `grant ... to anon`, devolve as
-- chaves para QUALQUER pessoa que consiga chamar a RPC (a chave anon é pública).
-- Só use este caminho para um app de uso pessoal. Em produção, deixe as chaves em
-- GEMINI_API_KEYS na Vercel e use o proxy /api/ia — assim elas nunca chegam ao navegador.
create table if not exists public.chaves_ia (
  ordem   int primary key,
  chave   text not null,
  rotulo  text,
  ativa   boolean not null default true,
  criada_em timestamptz not null default now()
);

comment on table public.chaves_ia is
  'Chaves do Gemini para contingência (uma por projeto do AI Studio). Sem política de leitura direta.';

alter table public.chaves_ia enable row level security;
-- nenhuma policy => ninguém lê/grava a tabela direto pelo REST; só a função abaixo.

create or replace function public.obter_chaves_ia()
returns table (chave text, rotulo text, ordem int)
language sql
security definer
stable
set search_path = public
as $$
  select c.chave, c.rotulo, c.ordem
  from public.chaves_ia c
  where c.ativa
  order by c.ordem
$$;

revoke execute on function public.obter_chaves_ia() from public;
grant execute on function public.obter_chaves_ia() to anon, authenticated;

-- Insira as chaves pelo SQL Editor (nunca pelo app):
--   insert into public.chaves_ia (ordem, chave, rotulo) values
--     (1, 'AIza...sua-chave-1', 'projeto principal'),
--     (2, 'AIza...sua-chave-2', 'contingência')
--   on conflict (ordem) do update set chave = excluded.chave, rotulo = excluded.rotulo;

-- ============================================================
-- 3. Verificação rápida
-- ============================================================
-- select id, atualizado_em, jsonb_array_length(coalesce(estado->'plano','[]'::jsonb)) as dias
--   from public.progresso order by atualizado_em desc limit 5;
-- select * from public.obter_chaves_ia();
