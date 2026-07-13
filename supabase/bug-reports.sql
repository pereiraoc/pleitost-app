-- REPORTAR BUG (#220) — tabela de reportes abertos do app.
-- Aplicar no SQL editor do projeto Supabase (mesmo fluxo do install.sql).
--
-- Modelo de acesso: QUALQUER cliente com a chave publishable pode INSERIR
-- (jogador sem login reporta); NINGUÉM lê/edita/apaga pela API — os reportes
-- são lidos no dashboard (Table Editor) pelo dono do projeto.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  texto text not null check (char_length(texto) between 3 and 4000),
  -- contexto automático do app: { pagina, versao, userAgent }
  contexto jsonb
);

alter table public.bug_reports enable row level security;

drop policy if exists "qualquer um reporta" on public.bug_reports;
create policy "qualquer um reporta"
  on public.bug_reports for insert
  to anon, authenticated
  with check (true);
-- sem policy de SELECT/UPDATE/DELETE: a API não lê nem altera reportes.
