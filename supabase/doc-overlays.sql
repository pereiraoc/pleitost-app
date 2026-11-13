-- OVERLAY COMPARTILHADO do compêndio (#252/#243, F8/F9) — edições publicadas do
-- Modo Desenvolvedor que TODOS os jogadores leem (doc efetivo = base vault-data
-- ⊕ este overlay ⊕ rascunho local do dev). "Publicar" faz upsert aqui; a
-- vault-data segue READ-ONLY. Round-trip: exportar reconstrói o .md pro Obsidian.
--
-- O overlay NÃO é de uma sessão: é o compêndio/mundo de todas as mesas (ex.: o
-- terreno do Mundo Livre pintado no Modo Dev). Por isso, desde o TSK-106
-- (12/11/2026, regra do dono: ninguém escreve em grupo de que não faz parte):
--   • leitura: só LOGADO (o app só lê depois do portão de login, desde 05/11);
--   • escrita: só quem está em `compendio_editores` (semeada com a conta do
--     dono no GitHub). Antes (14/07–12/11) qualquer conta do GitHub escrevia:
--     o cadastro pelo GitHub é aberto de propósito (jogadores novos), e a senha
--     do Modo Dev é só um portão de UI (o hash está no código público).
--   • novo editor: `insert into public.compendio_editores (user_id, nota) ...`
--     pelo SQL (não há escrita pela API).
--
-- Idempotente. Versão canônica.

create table if not exists public.doc_overlays (
  id text primary key,                 -- caminho do doc na vault (ex.: "Sistema/Regras/Condições/Agarrado")
  patch jsonb not null,                -- patch parcial de VaultDoc { frontmatter?, body?, ruleElements?, inlineFields? }
  updated_at timestamptz not null default now(),
  updated_by text                      -- nome de quem publicou (só exibição; quem pode é a tabela abaixo)
);

alter table public.doc_overlays enable row level security;

-- Quem publica no compêndio. Sem policy: a API não lê nem escreve aqui.
create table if not exists public.compendio_editores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nota text,
  criado_em timestamptz not null default now()
);
alter table public.compendio_editores enable row level security;
revoke all on public.compendio_editores from anon, authenticated;

create or replace function public.is_compendio_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.compendio_editores where user_id = auth.uid());
$$;
revoke all on function public.is_compendio_editor() from public, anon;
grant execute on function public.is_compendio_editor() to authenticated;

-- Semente: a conta do dono (identidade do GitHub, que o usuário não edita —
-- o user_metadata ele edita, por isso não serve).
insert into public.compendio_editores (user_id, nota)
select i.user_id, 'dono do Pleitost (GitHub pereiraoc)'
  from auth.identities i
 where i.provider = 'github' and i.identity_data ->> 'user_name' = 'pereiraoc'
on conflict (user_id) do nothing;

drop policy if exists doc_overlays_read on public.doc_overlays;
create policy doc_overlays_read
  on public.doc_overlays for select
  to authenticated
  using (true);

drop policy if exists doc_overlays_write on public.doc_overlays;
create policy doc_overlays_write
  on public.doc_overlays for all
  to authenticated
  using (public.is_compendio_editor())
  with check (public.is_compendio_editor());

-- Realtime: propaga edições publicadas ao vivo (estratégia sync-first).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'doc_overlays'
  ) then
    alter publication supabase_realtime add table public.doc_overlays;
  end if;
end $$;
