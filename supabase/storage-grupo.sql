-- BUCKET DA IMAGEM DO GRUPO (Solução A do docs/armazenamento-supabase.md).
-- Tira a foto da mesa de dentro de sessions.state (jsonb) e coloca no Storage,
-- que é separado do banco, mais barato, e não sofre a amplificação de escrita
-- (andar um hex na exploração deixa de reescrever a foto inteira).
--
-- O bucket existe (aplicado em 2026), mas o app AINDA NÃO sobe aqui: a foto
-- segue em sessions.state.grupoImagem. Quando o código for ligado, o caminho é
-- `<sessionId>/<arquivo>` (o mesmo padrão do bucket `mural`).
--
-- Modelo de acesso (TSK-106, 12/11/2026 — regra do dono: ninguém mexe em grupo
-- de que não faz parte):
--   • leitura PÚBLICA (bucket público: a URL abre para qualquer membro da mesa);
--   • subir/trocar: só MEMBRO (ou o mestre) da sessão dona da pasta. Antes
--     qualquer conta logada subia e trocava qualquer arquivo do bucket.
--
-- Depende de public.sessao_da_pasta (sessoes-entrar-por-codigo.sql).
-- Policies em storage.objects: aplicar como supabase_admin (o dono da tabela é
-- o supabase_storage_admin; o postgres não cria policy nela).

-- 1) Cria o bucket público (idempotente).
insert into storage.buckets (id, name, public)
values ('grupo-imagens', 'grupo-imagens', true)
on conflict (id) do nothing;

-- 2) Policies no storage.objects restritas a este bucket.
drop policy if exists grupo_imagens_read on storage.objects;
create policy grupo_imagens_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'grupo-imagens');

drop policy if exists grupo_imagens_write on storage.objects;
create policy grupo_imagens_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'grupo-imagens'
    and (public.is_session_member(public.sessao_da_pasta(name))
         or public.is_session_gm(public.sessao_da_pasta(name)))
  );

drop policy if exists grupo_imagens_update on storage.objects;
create policy grupo_imagens_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'grupo-imagens'
    and (public.is_session_member(public.sessao_da_pasta(name))
         or public.is_session_gm(public.sessao_da_pasta(name)))
  )
  with check (
    bucket_id = 'grupo-imagens'
    and (public.is_session_member(public.sessao_da_pasta(name))
         or public.is_session_gm(public.sessao_da_pasta(name)))
  );

-- Migração das fotos antigas: NÃO precisa. O leitor da imagem aceita tanto uma
-- URL (novo) quanto um data-url base64 (antigo em sessions.state.grupoImagem),
-- então as mesas já existentes seguem funcionando até trocarem a foto.
