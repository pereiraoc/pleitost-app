-- BUCKET DO MURAL DA SESSÃO (2026-10-04).
--
-- >>> APLICAR UMA VEZ no projeto Supabase (SQL Editor → colar → Run). <<<
-- O app NÃO aplica sozinho. Enquanto o bucket não existir:
--   • imagem PÚBLICA da vault entra no mural normalmente (o mural guarda só o
--     alvo; cada aparelho resolve no próprio manifesto);
--   • imagem CIFRADA de aventura (o jogador não tem a chave) não sobe e o botão
--     📌 MURAL mostra "bucket do mural não configurado — aplique
--     supabase/storage-mural.sql".
--
-- Uso: o MESTRE comprime a figura decifrada (~1600px JPEG) e sobe em
-- `mural/<sessionId>/<uuid>.jpg`; o item do mural (sessions.state.mural) guarda
-- a URL pública. Tirar o item do mural apaga o objeto.
--
-- Modelo de acesso (mesmo de storage-grupo.sql):
--   • leitura PÚBLICA (a imagem aparece pra qualquer membro da mesa);
--   • escrita/remoção só o MESTRE da sessão dona da pasta
--     (`<sessionId>/...` → is_session_gm(sessionId)).

-- 1) Cria o bucket público (idempotente).
insert into storage.buckets (id, name, public)
values ('mural', 'mural', true)
on conflict (id) do nothing;

-- 2) Policies no storage.objects restritas a este bucket.
drop policy if exists mural_read on storage.objects;
create policy mural_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'mural');

drop policy if exists mural_insert on storage.objects;
create policy mural_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'mural' and public.is_session_gm(((storage.foldername(name))[1])::uuid));

drop policy if exists mural_update on storage.objects;
create policy mural_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'mural' and public.is_session_gm(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'mural' and public.is_session_gm(((storage.foldername(name))[1])::uuid));

drop policy if exists mural_delete on storage.objects;
create policy mural_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'mural' and public.is_session_gm(((storage.foldername(name))[1])::uuid));
