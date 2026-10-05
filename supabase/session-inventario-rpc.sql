-- INVENTÁRIO DO GRUPO — escrita por MEMBRO, item a item, atômica (2026-10-04).
--
-- Motivo: o inventário do grupo (sessions.state.inventarioGrupo) é escrito
-- pelos JOGADORES (adicionar item, puxar pra ficha, receber item endereçado
-- pelo mestre), mas a RLS de UPDATE de `sessions` é gm-only → a escrita do
-- jogador afetava 0 linhas em silêncio: o item ia pra ficha e FICAVA no pool
-- (e podia ser puxado de novo depois de recarregar). Além disso o app gravava
-- o MAPA INTEIRO, então duas escritas simultâneas (mestre + jogador) se
-- desfaziam.
--
-- Mesmo molde do session_set_exploracao: SECURITY DEFINER, só membro da
-- sessão ou o mestre, e SÓ mexe em state.inventarioGrupo — uma chave por vez.

-- Põe/substitui (p_item não-nulo) ou remove (p_item nulo) UM item do pool.
create or replace function public.session_inventario_set(p_session_id uuid, p_chave text, p_item jsonb)
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
  if p_item is null then
    update sessions
       set state = jsonb_set(coalesce(state, '{}'::jsonb), array['inventarioGrupo'],
                             coalesce(state->'inventarioGrupo', '{}'::jsonb) - p_chave)
     where id = p_session_id;
  else
    update sessions
       set state = jsonb_set(coalesce(state, '{}'::jsonb), array['inventarioGrupo'],
                             coalesce(state->'inventarioGrupo', '{}'::jsonb) || jsonb_build_object(p_chave, p_item))
     where id = p_session_id;
  end if;
end;
$fn$;

-- Remove VÁRIOS itens de uma vez (recebimento em lote). Devolve as chaves que
-- de fato estavam no pool e saíram — o app só puxa pra ficha o que saiu, então
-- dois aparelhos do mesmo jogador não duplicam o item.
create or replace function public.session_inventario_tirar(p_session_id uuid, p_chaves text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $fn$
declare
  sairam text[];
begin
  if not (
    is_session_member(p_session_id)
    or exists (select 1 from sessions where id = p_session_id and gm_user_id = auth.uid())
  ) then
    raise exception 'not a session member';
  end if;
  -- trava a linha: a leitura das chaves presentes e a remoção são um passo só
  select array(select k from unnest(p_chaves) k
                where coalesce(s.state->'inventarioGrupo', '{}'::jsonb) ? k)
    into sairam
    from sessions s where s.id = p_session_id for update;
  if sairam is null or cardinality(sairam) = 0 then
    return '{}';
  end if;
  update sessions
     set state = jsonb_set(coalesce(state, '{}'::jsonb), array['inventarioGrupo'],
                           coalesce(state->'inventarioGrupo', '{}'::jsonb) - sairam)
   where id = p_session_id;
  return sairam;
end;
$fn$;

revoke all on function public.session_inventario_set(uuid, text, jsonb) from public;
revoke all on function public.session_inventario_tirar(uuid, text[]) from public;
grant execute on function public.session_inventario_set(uuid, text, jsonb) to authenticated;
grant execute on function public.session_inventario_tirar(uuid, text[]) to authenticated;
