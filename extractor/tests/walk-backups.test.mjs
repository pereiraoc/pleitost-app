// O gerador de figuras guarda a versão ANTIGA em `_geracao/backups/<lote>/`
// antes de sobrescrever. Isso é lixo de processo: se entrar no dataset, cria
// duas imagens com o MESMO basename (a nova e a que ela substituiu) e o app,
// que resolve embed por basename, pode mostrar a velha. A varredura ignora.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkVault } from "../walk.mjs";

test("walkVault ignora os backups do gerador de figuras", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "vault-"));
  const ctx = join(raiz, "Recursos e Mídia/Recursos de Contextos");
  await mkdir(join(ctx, "Recursos"), { recursive: true });
  await mkdir(join(ctx, "_geracao/backups/recursos-20260909-abc"), { recursive: true });
  await mkdir(join(ctx, "_geracao/logos"), { recursive: true });
  await writeFile(join(ctx, "Recursos/Pescado do Cais.png"), "nova");
  await writeFile(join(ctx, "_geracao/backups/recursos-20260909-abc/Pescado do Cais.png"), "velha");
  await writeFile(join(ctx, "_geracao/logos/logo-Panvel.png"), "logo");

  const { images } = await walkVault(raiz);
  const pescado = images.filter((i) => i.basename === "Pescado do Cais.png");
  assert.equal(pescado.length, 1, "só a figura em uso entra");
  assert.ok(pescado[0].relPath.includes("Recursos de Contextos/Recursos/"));
  // o resto de _geracao segue: os logos são insumo do gerador, não duplicam nome
  assert.ok(images.some((i) => i.basename === "logo-Panvel.png"));
});
