-- RECUPERA ESPAÇO DOS DEAD TUPLES (Solução F do docs/armazenamento-supabase.md).
-- As tabelas de alto churn (state reescrito a cada dano/turno/hex) acumulam
-- versões mortas de linha entre passadas do autovacuum. Rodar isto UMA VEZ
-- recupera o espaço já perdido; o tuning no fim deixa o autovacuum mais agressivo
-- nessas tabelas pra não deixar inflar de novo.
--
-- NÃO executa sozinho. Rode FORA de uma sessão ativa: VACUUM FULL trava a tabela
-- durante a reescrita (rápido no plano free, mas evita rodar no meio do jogo).

-- Diagnóstico: quanto de "inchaço" (linhas mortas) tem hoje.
select relname as tabela,
       n_live_tup as vivas,
       n_dead_tup as mortas,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as pct_morto
from pg_stat_user_tables
where schemaname = 'public'
order by n_dead_tup desc;

-- Recupera o espaço (reescreve a tabela compactada + atualiza estatísticas).
vacuum (full, analyze) public.sessions;
vacuum (full, analyze) public.session_characters;
vacuum (full, analyze) public.session_encounters;

-- Opcional: autovacuum mais agressivo nas tabelas de churn (limpa a cada ~5% de
-- linhas mortas em vez do padrão 20%), pra segurar o inchaço entre jogos.
alter table public.sessions            set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.session_characters  set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.session_encounters  set (autovacuum_vacuum_scale_factor = 0.05);
