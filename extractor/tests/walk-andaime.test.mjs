// Imagem em pasta de andaime não entra no dataset. A regra já existia pros
// `.md` (SCAFFOLDING_PREFIXES), mas o ramo de imagem não consultava —
// resultado: `Rascunhos/Inbox de Imagens/` (staging de arte, com cópia do que
// já foi oficializado e com o que foi rejeitado) era copiada pro dataset e
// PUBLICADA no gh-pages, e os `.excalidraw.png` (reexportados a cada
// interação, grandes demais pro webp) iam junto.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkVault } from "../walk.mjs";

test("walkVault ignora imagem em pasta de andaime", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "vault-"));
  const rm = join(raiz, "Recursos e Mídia");
  await mkdir(join(rm, "Recursos de Contextos/Bestiário"), { recursive: true });
  await mkdir(join(rm, "Rascunhos/Inbox de Imagens/Bestiário"), { recursive: true });
  await mkdir(join(rm, "Excalidraw"), { recursive: true });
  await mkdir(join(rm, "Templates"), { recursive: true });
  await writeFile(join(rm, "Recursos de Contextos/Bestiário/Vulcanizador.png"), "oficial");
  await writeFile(join(rm, "Rascunhos/Inbox de Imagens/Bestiário/Vulcanizador.png"), "staging");
  await writeFile(join(rm, "Excalidraw/Rascunho.excalidraw.png"), "reexportado");
  await writeFile(join(rm, "Templates/exemplo.png"), "molde");

  const { images } = await walkVault(raiz);
  const vulca = images.filter((i) => i.basename === "Vulcanizador.png");
  assert.equal(vulca.length, 1, "só a oficializada entra — a de staging não duplica o basename");
  assert.ok(vulca[0].relPath.includes("Recursos de Contextos/Bestiário/"));
  assert.ok(!images.some((i) => i.relPath.includes("Rascunhos/")), "nada de Rascunhos");
  assert.ok(!images.some((i) => i.relPath.includes("Excalidraw/")), "nada de Excalidraw");
  assert.ok(!images.some((i) => i.relPath.includes("Templates/")), "nada de Templates");
});
