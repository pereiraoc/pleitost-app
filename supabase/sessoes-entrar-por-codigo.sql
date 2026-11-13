-- SESSÃO SÓ PARA QUEM ESTÁ NELA (TSK-106, 12/11/2026).
--
-- Regra do dono: "dentro da mesma sessão as pessoas podem colocar anotações,
-- mas não de grupos (sessões) que elas não estão".
--
-- Antes: `sessions_select` valia para `public` com `ended_at IS NULL` — qualquer
-- um, mesmo sem login, listava as mesas ativas e lia o `code` de entrada (e o
-- `state` inteiro). E `members_insert` só exigia `user_id = auth.uid()`: quem
-- soubesse o id de uma sessão entrava nela sem código, com o papel que quisesse.
--
-- Agora:
--   • ler `sessions`: só o mestre (gm_user_id) e os membros;
--   • entrar numa mesa: só pela RPC `session_join_by_code(código, nome)`
--     (SECURITY DEFINER) — recebe o código, devolve a sessão e grava o membro
--     com o papel calculado no servidor; código errado/mesa encerrada = nenhuma
--     linha, sem expor a lista;
--   • inserir em `session_members` direto: só o MESTRE inserindo a si mesmo
--     como 'gm' (o "+ Criar" do app); jogador nunca mais insere direto.
--
-- Idempotente. O app (SupabaseSessionRepo.joinSessionByCode) usa a RPC e, num
-- projeto sem ela (PGRST202), cai no caminho antigo.

-- 1) Entrar por código.
create or replace function public.session_join_by_code(p_code text, p_display_name text)
returns setof public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_sess public.sessions;
  v_nome text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_uid is null then
    raise exception 'login required' using errcode = '42501';
  end if;
  select * into v_sess
    from public.sessions
   where code = upper(btrim(coalesce(p_code, '')))
     and ended_at is null;
  if not found then
    return; -- código inexistente ou mesa encerrada: nenhuma linha
  end if;
  insert into public.session_members (session_id, user_id, role, display_name)
  values (v_sess.id, v_uid,
          case when v_sess.gm_user_id = v_uid then 'gm' else 'player' end,
          coalesce(v_nome, 'Convidado'))
  on conflict (session_id, user_id) do nothing;
  return next v_sess;
end;
$$;

revoke all on function public.session_join_by_code(text, text) from public, anon;
grant execute on function public.session_join_by_code(text, text) to authenticated;

-- 2) Ler sessões: só mestre e membros (nada para anônimo).
drop policy if exists sessions_select on public.sessions;
create policy sessions_select
  on public.sessions for select
  to authenticated
  using (gm_user_id = auth.uid() or public.is_session_member(id));

-- 3) Inserir membro direto: só o mestre, a si mesmo, como 'gm'.
drop policy if exists members_insert on public.session_members;
create policy members_insert
  on public.session_members for insert
  to authenticated
  with check (user_id = auth.uid() and role = 'gm' and public.is_session_gm(session_id));

-- 4) Sessão dona de um caminho do Storage (`<sessionId>/<arquivo>`), para as
--    policies dos buckets por mesa (storage-grupo.sql). Caminho fora do padrão
--    = null (nunca dá erro de cast; is_session_member(null) = false).
create or replace function public.sessao_da_pasta(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+'
      then substr(p_name, 1, 36)::uuid
  end
$$;
