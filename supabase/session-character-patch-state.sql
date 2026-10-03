-- session_character_patch_state (2026-10-02): patch ATÔMICO do `state` de um
-- personagem da sessão (merge por chave de topo, no servidor).
--
-- Motivo: updateCharacterState fazia SELECT state → merge no cliente → UPDATE
-- (duas idas ao servidor, e uma corrida clássica de lost update: dois writes
-- quase simultâneos — o mestre desligando uma condição no Escudo enquanto o
-- stepper de vida/outro aparelho escreve — e o segundo UPDATE devolve a chave
-- que o primeiro tinha apagado; a Vantagem de Combate "voltava"). Aqui é UM
-- UPDATE com `state || p_delta` (jsonb concat = substitui as chaves de topo
-- presentes no delta, mantém as demais), sem leitura prévia.
--
-- SECURITY INVOKER (padrão): a RLS de UPDATE de `session_characters` continua
-- valendo — quem não pode editar a linha recebe 0 linhas afetadas (a função
-- devolve false e o app cai pro caminho antigo, que também falha na RLS).
-- O app chama via repo.updateCharacterState → this.sb.rpc('session_character_patch_state', …)
-- e, se a função ainda não existir no projeto (PGRST202), usa o read-modify-write.
--
-- Aplicar no SQL Editor do projeto Supabase (como o session-exploracao-rpc.sql).

create or replace function public.session_character_patch_state(p_character_id uuid, p_delta jsonb)
returns boolean
language plpgsql
set search_path = public
as $fn$
declare
  n integer;
begin
  update session_characters
     set state = coalesce(state, '{}'::jsonb) || coalesce(p_delta, '{}'::jsonb),
         updated_at = now()
   where id = p_character_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$fn$;

revoke all on function public.session_character_patch_state(uuid, jsonb) from public;
grant execute on function public.session_character_patch_state(uuid, jsonb) to authenticated;
