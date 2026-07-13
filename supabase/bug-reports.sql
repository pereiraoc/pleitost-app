-- REPORTAR BUG (#220) — tabela de reportes abertos do app.
-- APLICADO no projeto em 2026-07-13 (SQL editor). Esta é a versão canônica.
--
-- Modelo de acesso: QUALQUER cliente com a chave publishable pode INSERIR
-- (jogador sem login reporta); NINGUÉM lê/edita/apaga pela API — os reportes
-- são lidos no dashboard (Table Editor) pelo dono do projeto.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  texto text not null,
  -- contexto automático do app: { pagina, versao, userAgent }
  contexto jsonb
);

alter table public.bug_reports enable row level security;

drop policy if exists qualquer_um_reporta on public.bug_reports;

create policy qualquer_um_reporta
  on public.bug_reports
  for insert
  to anon, authenticated
  with check (char_length(texto) between 3 and 4000);
-- sem policy de SELECT/UPDATE/DELETE: a API não lê nem altera reportes.
