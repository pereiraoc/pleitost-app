-- ESCRITAS ATÔMICAS DO STATE DA SESSÃO + MURAL (2026-10-04).
--
-- Motivo: updateSessionState fazia SELECT state → merge no cliente → UPDATE do
-- state INTEIRO. Qualquer escrita que caísse entre a leitura e o UPDATE era
-- desfeita — ex.: o jogador anda na trilha (session_set_exploracao) enquanto o
-- mestre empurra o mapa (mapaAtlas) → a trilha volta; dois recursos do mestre
-- gravando ao mesmo tempo (mural + mapa) → um some.
-- Aqui cada escrita é UM UPDATE no servidor, sem leitura prévia no cliente.
--
-- SECURITY INVOKER (padrão): a RLS de UPDATE de `sessions` (só o mestre)
-- continua valendo; sem permissão = 0 linhas → a função devolve false/null.
-- O app chama via rpc e, se a função não existir (PGRST202), cai no caminho
-- antigo.

-- 1) Patch por chave de topo: `state || p_patch` (substitui só as chaves
--    presentes no patch, mantém as demais).
create or replace function public.session_state_patch(p_session_id uuid, p_patch jsonb)
returns boolean
language plpgsql
set search_path = public
as $fn$
declare
  n integer;
begin
  update sessions
     set state = coalesce(state, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_session_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$fn$;

-- 2) Mural: pôr um item (no-op se a mesma imagem — mesmo `target`, ou mesma
--    `url` quando não há alvo — já estiver lá). Devolve o mural resultante
--    (null = sem permissão / sessão inexistente).
create or replace function public.session_mural_add(p_session_id uuid, p_item jsonb)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  resultado jsonb;
begin
  update sessions s
     set state = jsonb_set(
           coalesce(s.state, '{}'::jsonb),
           array['mural'],
           coalesce(s.state->'mural', '[]'::jsonb) || jsonb_build_array(p_item))
   where s.id = p_session_id
     and not exists (
       select 1 from jsonb_array_elements(coalesce(s.state->'mural', '[]'::jsonb)) e
        where (p_item ? 'target' and e->>'target' = p_item->>'target')
           or (not (p_item ? 'target') and p_item ? 'url' and e->>'url' = p_item->>'url'))
  returning s.state->'mural' into resultado;
  if resultado is null then
    -- duplicado (ou sem permissão): devolve o mural atual visível
    select coalesce(state->'mural', '[]'::jsonb) into resultado
      from sessions where id = p_session_id and gm_user_id = auth.uid();
  end if;
  return resultado;
end;
$fn$;

-- 3) Mural: tirar um item por id. Devolve o ITEM removido (pro app apagar o
--    objeto do Storage), ou null se não estava lá / sem permissão.
create or replace function public.session_mural_remove(p_session_id uuid, p_id text)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  removido jsonb;
begin
  select e into removido
    from sessions s, jsonb_array_elements(coalesce(s.state->'mural', '[]'::jsonb)) e
   where s.id = p_session_id and e->>'id' = p_id
   limit 1;
  if removido is null then
    return null;
  end if;
  update sessions s
     set state = jsonb_set(
           coalesce(s.state, '{}'::jsonb),
           array['mural'],
           coalesce((select jsonb_agg(e)
                       from jsonb_array_elements(coalesce(s.state->'mural', '[]'::jsonb)) e
                      where e->>'id' <> p_id), '[]'::jsonb))
   where s.id = p_session_id;
  if not found then
    return null;
  end if;
  return removido;
end;
$fn$;

revoke all on function public.session_state_patch(uuid, jsonb) from public;
revoke all on function public.session_mural_add(uuid, jsonb) from public;
revoke all on function public.session_mural_remove(uuid, text) from public;
grant execute on function public.session_state_patch(uuid, jsonb) to authenticated;
grant execute on function public.session_mural_add(uuid, jsonb) to authenticated;
grant execute on function public.session_mural_remove(uuid, text) to authenticated;
