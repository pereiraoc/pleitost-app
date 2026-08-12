-- session_set_exploracao (#449): QUALQUER membro da sessão pode editar SÓ a
-- trilha (state->exploracao), sem poder tocar o resto do state.
--
-- Motivo: a RLS de UPDATE em `sessions` é gm-only (gm_user_id = auth.uid()), então
-- a marcação de caminho de um JOGADOR caía na RLS e falhava em silêncio
-- (updateSessionState). A trilha é do GRUPO — todos os membros veem E editam.
-- Combate/iniciativa/imagem continuam do mestre (via updateSessionState/RLS).
--
-- SECURITY DEFINER contorna a RLS gm-only APENAS pra a chave `exploracao`, e só
-- depois de validar que quem chama é membro (is_session_member) ou o mestre.
-- O app chama via repo.setExploracao → this.sb.rpc('session_set_exploracao', …).

create or replace function public.session_set_exploracao(p_session_id uuid, p_exploracao jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not (
    is_session_member(p_session_id)
    or exists (select 1 from sessions where id = p_session_id and gm_user_id = auth.uid())
  ) then
    raise exception 'not a session member';
  end if;
  update sessions
     set state = jsonb_set(coalesce(state, '{}'::jsonb), array['exploracao'], p_exploracao)
   where id = p_session_id;
end;
$fn$;

revoke all on function public.session_set_exploracao(uuid, jsonb) from public;
grant execute on function public.session_set_exploracao(uuid, jsonb) to authenticated;
