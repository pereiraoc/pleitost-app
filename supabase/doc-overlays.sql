-- OVERLAY COMPARTILHADO do compêndio (#252/#243, F8/F9) — edições publicadas do
-- Modo Desenvolvedor que TODOS os jogadores leem (doc efetivo = base vault-data
-- ⊕ este overlay ⊕ rascunho local do dev). "Publicar" faz upsert aqui; a
-- vault-data segue READ-ONLY. Round-trip: exportar reconstrói o .md pro Obsidian.
--
-- Modelo de acesso (mesmo espírito de bug-reports.sql / sessions):
--   • leitura PÚBLICA — o compêndio é público, como a vault-data deployada;
--   • escrita só AUTENTICADO — login GitHub via Supabase Auth (módulo de sessões).
--
-- APLICADO no projeto via Management API em 2026-07-14. Versão canônica.

create table if not exists public.doc_overlays (
  id text primary key,                 -- caminho do doc na vault (ex.: "Sistema/Regras/Condições/Agarrado")
  patch jsonb not null,                -- patch parcial de VaultDoc { frontmatter?, body?, ruleElements?, inlineFields? }
  updated_at timestamptz not null default now(),
  updated_by text                      -- github handle de quem publicou
);

alter table public.doc_overlays enable row level security;

drop policy if exists doc_overlays_read on public.doc_overlays;
create policy doc_overlays_read
  on public.doc_overlays for select
  to anon, authenticated
  using (true);

drop policy if exists doc_overlays_write on public.doc_overlays;
create policy doc_overlays_write
  on public.doc_overlays for all
  to authenticated
  using (true) with check (true);

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
