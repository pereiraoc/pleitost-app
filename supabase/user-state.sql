-- DADOS DO USUÁRIO ENTRE DISPOSITIVOS (#239) — espelho do localStorage
-- (pleitost.*/local:*) por CONTA. APLICADO em 2026-07-13 via Management API.
-- RLS: cada usuário autenticado lê/escreve SÓ a própria linha.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists proprio_estado on public.user_state;
create policy proprio_estado on public.user_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
