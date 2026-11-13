-- TESTE DO ACESSO POR MEMBRO (TSK-106): sessões, entrada por código, overlay do
-- compêndio e bucket grupo-imagens, nas MESMAS policies do banco onde roda.
--
-- Roda tudo numa transação e DESFAZ no fim (ROLLBACK): dá para rodar numa
-- cópia isolada e também na produção, sem deixar nada. Usuários, sessões e
-- arquivos são sintéticos (uuids fixos, códigos com 0/1, que o gerador do app
-- nunca usa). Cada persona é emulada como o PostgREST/Storage fazem:
-- `set role authenticated|anon` + `request.jwt.claims` com o `sub`.
--
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f acesso-por-membro.test.sql
--
-- Precisa das migrações: sessoes-entrar-por-codigo.sql, doc-overlays.sql,
-- storage-grupo.sql. Falha = exceção 'FALHOU: ...' e saída != 0.

\set ON_ERROR_STOP 1
begin;

-- ── personas ────────────────────────────────────────────────────────────────
-- G = mestre da S1 · M = jogador da S1 · N = não membro da S1 (mestre da S2)
-- J = entra por código · E = editor do compêndio (não é membro de nada)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'tsk106-g@teste.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'tsk106-m@teste.invalid'),
  ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'tsk106-n@teste.invalid'),
  ('00000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'tsk106-j@teste.invalid'),
  ('00000000-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated', 'tsk106-e@teste.invalid');

insert into public.sessions (id, code, gm_user_id, name, state, ended_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'TST0S1', '00000000-0000-4000-8000-0000000000a1', 'Teste S1', '{}', null),
  ('00000000-0000-4000-8000-0000000000b2', 'TST0S2', '00000000-0000-4000-8000-0000000000a3', 'Teste S2', '{}', null),
  ('00000000-0000-4000-8000-0000000000b4', 'TST0S4', '00000000-0000-4000-8000-0000000000a1', 'Teste S4 encerrada', '{}', now());

insert into public.session_members (session_id, user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'gm', 'Mestre'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2', 'player', 'Membro');

insert into public.compendio_editores (user_id, nota) values ('00000000-0000-4000-8000-0000000000a5', 'teste');
insert into public.doc_overlays (id, patch, updated_by) values ('Teste/TSK-106', '{"body":"base"}', 'teste');
insert into storage.objects (bucket_id, name, owner) values
  ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/da-mesa.jpg', '00000000-0000-4000-8000-0000000000a1');

-- ── anônimo ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  if (select count(*) from public.sessions) <> 0 then
    raise exception 'FALHOU: anônimo lista sessões';
  end if;
  if exists (select 1 from public.sessions where code = 'TST0S1') then
    raise exception 'FALHOU: anônimo vê o code';
  end if;
  if (select count(*) from public.doc_overlays) <> 0 then
    raise exception 'FALHOU: anônimo lê o overlay';
  end if;
  begin
    perform public.session_join_by_code('TST0S1', 'Anônimo');
    raise exception 'FALHOU: anônimo chamou session_join_by_code';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/anon.jpg');
    raise exception 'FALHOU: anônimo subiu imagem';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anônimo';
end $$;

-- ── não membro (N) ──────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b1') then
    raise exception 'FALHOU: não membro vê a S1';
  end if;
  if not exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b2') then
    raise exception 'FALHOU: mestre não vê a própria S2';
  end if;
  if (select count(*) from public.doc_overlays where id = 'Teste/TSK-106') <> 1 then
    raise exception 'FALHOU: logado não lê o overlay';
  end if;
  -- overlay: nem cria, nem troca, nem apaga
  begin
    insert into public.doc_overlays (id, patch) values ('Teste/TSK-106-n', '{}');
    raise exception 'FALHOU: não editor criou overlay';
  exception when insufficient_privilege then null;
  end;
  update public.doc_overlays set patch = '{"body":"pichado"}' where id = 'Teste/TSK-106';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: não editor trocou overlay'; end if;
  delete from public.doc_overlays where id = 'Teste/TSK-106';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: não editor apagou overlay'; end if;
  -- imagem do grupo alheio: nem sobe, nem troca; na raiz do bucket também não
  begin
    insert into storage.objects (bucket_id, name) values ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/intruso.jpg');
    raise exception 'FALHOU: não membro subiu imagem na S1';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('grupo-imagens', 'solto.jpg');
    raise exception 'FALHOU: subiu imagem fora de pasta de sessão';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set metadata = '{"x":1}'
   where bucket_id = 'grupo-imagens' and name = '00000000-0000-4000-8000-0000000000b1/da-mesa.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: não membro trocou a imagem da S1'; end if;
  -- mestre da S2 sobe na pasta da S2
  insert into storage.objects (bucket_id, name, owner) values
    ('grupo-imagens', '00000000-0000-4000-8000-0000000000b2/minha.jpg', '00000000-0000-4000-8000-0000000000a3');
  -- entrar na S1 sem código (insert direto), nem como jogador nem como mestre
  begin
    insert into public.session_members (session_id, user_id, role, display_name)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3', 'player', 'Intruso');
    raise exception 'FALHOU: não membro se inseriu na S1 sem código';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.session_members (session_id, user_id, role, display_name)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3', 'gm', 'Intruso');
    raise exception 'FALHOU: não membro se inseriu como gm na S1';
  exception when insufficient_privilege then null;
  end;
  -- escrita na mesa alheia pelas RPCs de membro
  begin
    perform public.session_set_exploracao('00000000-0000-4000-8000-0000000000b1', '{"x":1}');
    raise exception 'FALHOU: não membro mexeu na trilha da S1';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  update public.sessions set name = 'pichado' where id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: não membro renomeou a S1'; end if;
  -- código errado: nenhuma linha, nada gravado
  if exists (select 1 from public.session_join_by_code('XXXXXX', 'N')) then
    raise exception 'FALHOU: código inexistente devolveu sessão';
  end if;
  -- mestre entrando pela RPC na própria mesa vira 'gm'
  perform public.session_join_by_code('TST0S2', 'Mestre S2');
  if (select role from public.session_members
       where session_id = '00000000-0000-4000-8000-0000000000b2'
         and user_id = '00000000-0000-4000-8000-0000000000a3') <> 'gm' then
    raise exception 'FALHOU: mestre entrou na própria mesa sem papel gm';
  end if;
  raise notice 'ok: não membro';
end $$;

-- ── membro (M) ──────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a2"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if (select code from public.sessions where id = '00000000-0000-4000-8000-0000000000b1') <> 'TST0S1' then
    raise exception 'FALHOU: membro não vê a S1/código';
  end if;
  if exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b2') then
    raise exception 'FALHOU: membro da S1 vê a S2';
  end if;
  if (select count(*) from public.session_members where session_id = '00000000-0000-4000-8000-0000000000b1') <> 2 then
    raise exception 'FALHOU: membro não vê os membros da S1';
  end if;
  -- imagem do próprio grupo: sobe e troca
  insert into storage.objects (bucket_id, name, owner) values
    ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/membro.jpg', '00000000-0000-4000-8000-0000000000a2');
  update storage.objects set metadata = '{"trocada":true}'
   where bucket_id = 'grupo-imagens' and name = '00000000-0000-4000-8000-0000000000b1/da-mesa.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: membro não trocou a imagem da S1'; end if;
  -- e não sobe no grupo dos outros
  begin
    insert into storage.objects (bucket_id, name) values ('grupo-imagens', '00000000-0000-4000-8000-0000000000b2/x.jpg');
    raise exception 'FALHOU: membro da S1 subiu imagem na S2';
  exception when insufficient_privilege then null;
  end;
  -- anotações da mesa (trilha e inventário do grupo pelas RPCs de membro)
  perform public.session_set_exploracao('00000000-0000-4000-8000-0000000000b1', '{"trilha":[1]}');
  perform public.session_inventario_set('00000000-0000-4000-8000-0000000000b1', 'item-teste', '{"nome":"Corda"}');
  if (select state->'inventarioGrupo'->'item-teste'->>'nome' from public.sessions
       where id = '00000000-0000-4000-8000-0000000000b1') <> 'Corda' then
    raise exception 'FALHOU: membro não anotou no inventário do grupo';
  end if;
  -- overlay do compêndio é do editor, não de quem está numa mesa
  begin
    insert into public.doc_overlays (id, patch) values ('Teste/TSK-106-m', '{}');
    raise exception 'FALHOU: membro (não editor) criou overlay';
  exception when insufficient_privilege then null;
  end;
  -- membro não põe outra pessoa (nem a si como gm) direto
  begin
    insert into public.session_members (session_id, user_id, role, display_name)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a4', 'player', 'Amigo');
    raise exception 'FALHOU: membro inseriu outra pessoa';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: membro';
end $$;

-- ── mestre (G) ──────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a1"}', true);
set local role authenticated;
do $$
begin
  -- "+ Criar" do app: cria a mesa e se insere como gm
  insert into public.sessions (id, code, gm_user_id, name)
  values ('00000000-0000-4000-8000-0000000000b3', 'TST0S3', '00000000-0000-4000-8000-0000000000a1', 'Teste S3');
  insert into public.session_members (session_id, user_id, role, display_name)
  values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'gm', 'Mestre');
  if not exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b3') then
    raise exception 'FALHOU: mestre não vê a mesa que criou';
  end if;
  -- o mestre vê a mesa encerrada dele
  if not exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b4') then
    raise exception 'FALHOU: mestre não vê a própria mesa encerrada';
  end if;
  insert into storage.objects (bucket_id, name, owner) values
    ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/mestre.jpg', '00000000-0000-4000-8000-0000000000a1');
  raise notice 'ok: mestre';
end $$;

-- ── entrar por código (J) ───────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a4"}', true);
set local role authenticated;
do $$
declare s public.sessions;
begin
  if exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b1') then
    raise exception 'FALHOU: J vê a S1 antes de entrar';
  end if;
  select * into s from public.session_join_by_code(' tst0s1 ', 'Joana');
  if s.id is distinct from '00000000-0000-4000-8000-0000000000b1'::uuid or s.code <> 'TST0S1' then
    raise exception 'FALHOU: entrar por código não devolveu a S1';
  end if;
  if (select role || '/' || display_name from public.session_members
       where session_id = s.id and user_id = '00000000-0000-4000-8000-0000000000a4') <> 'player/Joana' then
    raise exception 'FALHOU: entrar por código não gravou o membro como player';
  end if;
  -- idempotente
  select * into s from public.session_join_by_code('TST0S1', 'Joana de novo');
  if (select count(*) from public.session_members
       where session_id = s.id and user_id = '00000000-0000-4000-8000-0000000000a4') <> 1 then
    raise exception 'FALHOU: entrar duas vezes duplicou o membro';
  end if;
  if not exists (select 1 from public.sessions where id = '00000000-0000-4000-8000-0000000000b1') then
    raise exception 'FALHOU: J não vê a S1 depois de entrar';
  end if;
  -- mesa encerrada: não entra
  if exists (select 1 from public.session_join_by_code('TST0S4', 'Joana')) then
    raise exception 'FALHOU: entrou em mesa encerrada';
  end if;
  -- agora é membro: sobe imagem do grupo
  insert into storage.objects (bucket_id, name, owner) values
    ('grupo-imagens', '00000000-0000-4000-8000-0000000000b1/joana.jpg', '00000000-0000-4000-8000-0000000000a4');
  raise notice 'ok: entrar por código';
end $$;

-- nome vazio vira 'Convidado' (o CHECK do display_name não deixa vazio)
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a5"}', true);
set local role authenticated;
do $$
begin
  perform public.session_join_by_code('TST0S2', '   ');
  if (select display_name from public.session_members
       where session_id = '00000000-0000-4000-8000-0000000000b2'
         and user_id = '00000000-0000-4000-8000-0000000000a5') <> 'Convidado' then
    raise exception 'FALHOU: nome vazio não virou Convidado';
  end if;
  raise notice 'ok: nome vazio';
end $$;

-- ── editor do compêndio (E) ─────────────────────────────────────────────────
do $$
declare n int;
begin
  insert into public.doc_overlays (id, patch, updated_by) values ('Teste/TSK-106-e', '{"body":"editor"}', 'E')
  on conflict (id) do update set patch = excluded.patch;
  update public.doc_overlays set patch = '{"body":"editado"}' where id = 'Teste/TSK-106';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: editor não trocou overlay'; end if;
  if public.is_compendio_editor() is not true then
    raise exception 'FALHOU: is_compendio_editor() falso para o editor';
  end if;
  -- a lista de editores não é legível nem gravável pela API
  begin
    perform 1 from public.compendio_editores;
    raise exception 'FALHOU: logado leu compendio_editores';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: editor do compêndio';
end $$;

reset role;
\echo 'TODOS OS TESTES PASSARAM (desfazendo)'
rollback;
