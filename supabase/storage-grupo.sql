-- BUCKET DA IMAGEM DO GRUPO (Solução A do docs/armazenamento-supabase.md).
-- Tira a foto da mesa de dentro de sessions.state (jsonb) e coloca no Storage,
-- que é separado do banco, mais barato, e não sofre a amplificação de escrita
-- (andar um hex na exploração deixa de reescrever a foto inteira).
--
-- NÃO executa sozinho: aplique quando decidir migrar. Depois do bucket existir,
-- eu ligo o código (upload → URL pública; o state guarda só a URL).
--
-- Modelo de acesso (mesmo espírito de doc-overlays.sql):
--   • leitura PÚBLICA (a foto aparece pra qualquer membro da mesa);
--   • escrita só AUTENTICADO (quem está logado na sessão troca a foto).

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
  with check (bucket_id = 'grupo-imagens');

drop policy if exists grupo_imagens_update on storage.objects;
create policy grupo_imagens_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'grupo-imagens')
  with check (bucket_id = 'grupo-imagens');

-- Migração das fotos antigas: NÃO precisa. O leitor da imagem aceita tanto uma
-- URL (novo) quanto um data-url base64 (antigo em sessions.state.grupoImagem),
-- então as mesas já existentes seguem funcionando até trocarem a foto.
