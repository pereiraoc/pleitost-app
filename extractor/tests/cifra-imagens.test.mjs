// FIGURAS DA CAMPANHA (2026-09-08c): imagem embutida SÓ por um doc trancado
// (FM `Senha:`) NÃO sai em claro no dataset público — vai cifrada com a chave
// do doc, com nome opaco, e a tabela alvo → arquivo viaja dentro da cifra.
// Imagem que um doc público também referencia continua pública (o mapa da
// cidade). Teste HERMÉTICO: vault e OUT_DIR temporários.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractVault } from "../extract-vault.mjs";
import { decifrarDoc, decifrarBytes, chaveDoDoc, nomeCifrado } from "../cifra-doc.mjs";

const SECRETA = randomBytes(300);
const PUBLICA = randomBytes(200);
const MAPA = randomBytes(250);

async function makeFakeVault(root) {
  await mkdir(join(root, "Atlas"), { recursive: true });
  await writeFile(join(root, "Atlas/Publico.md"), "---\ncategoria: Localização\n---\n![[Mapa.png]]\n![[publica.png]]\n", "utf8");
  await mkdir(join(root, "Campanhas/Aventuras"), { recursive: true });
  await writeFile(
    join(root, "Campanhas/Aventuras/Secreta.md"),
    "---\ncategoria: Aventura\nSenha: s3nha\nChamada: teaser\n---\n# 1. Resumo\n![[secreta.png|Vilão]]\n![[Mapa.png]]\n",
    "utf8",
  );
  await mkdir(join(root, "Imagens"), { recursive: true });
  await writeFile(join(root, "Imagens/secreta.png"), SECRETA);
  await writeFile(join(root, "Imagens/publica.png"), PUBLICA);
  await writeFile(join(root, "Imagens/Mapa.png"), MAPA);
}

test("imagem só de doc trancado sai cifrada e fora do manifesto; a compartilhada fica pública", async () => {
  const root = await mkdtemp(join(tmpdir(), "pleitost-vault-"));
  const out = await mkdtemp(join(tmpdir(), "pleitost-out-"));
  try {
    await makeFakeVault(root);
    await extractVault({ vaultRoot: root, outDir: out });

    const assetsJson = await readFile(join(out, "assets.json"), "utf8");
    const assets = JSON.parse(assetsJson);
    assert.deepEqual(
      assets.assets.map((a) => a.path).sort(),
      ["Imagens/Mapa.png", "Imagens/publica.png"],
    );
    assert.ok(!assetsJson.includes("secreta"), "o manifesto público não cita a imagem secreta");
    assert.equal(existsSync(join(out, "assets/Imagens/secreta.png")), false, "nada em claro no dataset");
    assert.equal(existsSync(join(out, "assets/Imagens/Mapa.png")), true);
    assert.equal(assets.counts.cifradas, 1);
    assert.deepEqual(assets.cifrados, [
      `assets-cifrados/${nomeCifrado("Campanhas/Aventuras/Secreta", "Imagens/secreta.png")}.enc`,
    ]);

    const indexJson = await readFile(join(out, "index.json"), "utf8");
    assert.ok(!indexJson.includes("secreta"));
    assert.equal(JSON.parse(indexJson).counts.imagesCifradas, 1);

    const docJson = await readFile(join(out, "Campanhas/Aventuras/Secreta.json"), "utf8");
    assert.ok(!docJson.includes("secreta"), "o envelope público não cita a imagem");
    const pub = JSON.parse(docJson);
    const aberto = decifrarDoc(pub, { senha: "s3nha" });
    const esperado = `assets-cifrados/${nomeCifrado("Campanhas/Aventuras/Secreta", "Imagens/secreta.png")}.enc`;
    assert.deepEqual(aberto.arquivos, [{ target: "secreta.png", path: "Imagens/secreta.png", copiedTo: esperado }]);

    const encs = await readdir(join(out, "assets-cifrados"));
    assert.deepEqual(encs, [esperado.split("/")[1]]);
    const blob = await readFile(join(out, esperado));
    assert.ok(!blob.includes(SECRETA.subarray(0, 32)));
    assert.deepEqual(decifrarBytes(chaveDoDoc(pub, { senha: "s3nha" }), blob), SECRETA);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
