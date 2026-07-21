-- FAXINA DE SESSÕES INATIVAS (Solução B do docs/armazenamento-supabase.md).
-- Bounda o crescimento do banco apagando mesas sem atividade há muito tempo.
-- O ON DELETE CASCADE já existente no schema leva junto session_members,
-- session_characters e session_encounters — então apagar a `sessions` basta.
--
-- NÃO executa sozinho: aplique no SQL editor quando quiser, ou agende com pg_cron.
-- Ajuste o prazo (padrão 60 dias) conforme o ritmo das mesas.

-- Função idempotente: apaga sessões cuja atividade mais recente passou do prazo.
-- "Atividade" = maior updated_at entre a sessão e seus personagens (uma mesa em
-- pausa longa mas com ficha editada ontem NÃO é apagada).
create or replace function public.faxina_sessoes(dias int default 60)
returns int
language plpgsql
security definer
as $$
declare
  apagadas int;
begin
  with mortas as (
    select s.id
    from public.sessions s
    left join public.session_characters c on c.session_id = s.id
    group by s.id, s.updated_at
    having greatest(
             s.updated_at,
             coalesce(max(c.updated_at), s.updated_at)
           ) < now() - make_interval(days => dias)
  )
  delete from public.sessions where id in (select id from mortas);
  get diagnostics apagadas = row_count;
  return apagadas;
end;
$$;

-- Rodar manualmente:
--   select public.faxina_sessoes(60);   -- retorna quantas mesas foram apagadas

-- Agendar diário às 4h (requer a extensão pg_cron habilitada no projeto):
--   select cron.schedule('faxina-sessoes', '0 4 * * *', $$select public.faxina_sessoes(60)$$);
-- Cancelar depois, se quiser:
--   select cron.unschedule('faxina-sessoes');
