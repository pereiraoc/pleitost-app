// Subárvores CONGELADAS (Heróis/Grupos, pedido 2026-08-15): o extract NÃO
// re-extrai personagens/grupos da vault — preserva os JSONs e entradas de
// índice da extração anterior (a fonte deles agora é o app, onde estão mais
// atualizados). Teste HERMÉTICO: vault e OUT_DIR temporários — NÃO roda o
// extract real (não toca o vault-data do repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractVault, isFrozenPath, FROZEN_PREFIXES } from "../extract-vault.mjs";

const HERO_DIR = "Sistema/Criaturas/Heróis";
const GRUPO_DIR = "Sistema/Criaturas/Grupos de Criaturas";

async function makeFakeVault(root) {
  // Doc normal (re-extraído sempre) + herói/grupo (versões DESATUALIZADAS da
  // vault, que NÃO podem vencer o vault-data preservado).
  await mkdir(join(root, "Sistema/Regras"), { recursive: true });
  await writeFile(
    join(root, "Sistema/Regras/Coisa.md"),
    "---\ncategoria: Regra\n---\nUm doc normal.\n",
    "utf8",
  );
  await mkdir(join(root, HERO_DIR), { recursive: true });
  await writeFile(
    join(root, HERO_DIR, "Fulano.md"),
    "---\ncategoria: Heroi\nNível: 1\n---\nVersão VELHA da vault.\n",
    "utf8",
  );
  await mkdir(join(root, GRUPO_DIR), { recursive: true });
  await writeFile(
    join(root, GRUPO_DIR, "Bando.md"),
    "---\ncategoria: Grupo\n---\nVersão VELHA da vault.\n",
    "utf8",
  );
}

/** Semeia um OUT_DIR "anterior" com herói/grupo mais NOVOS que a vault. */
async function seedPreviousOut(out) {
  const heroPath = `${HERO_DIR}/Fulano.md`;
  const grupoPath = `${GRUPO_DIR}/Bando.md`;
  const hero = {
    id: heroPath.replace(/\.md$/i, ""),
    path: heroPath,
    basename: "Fulano",
    type: "Heroi",
    subtype: null,
    grupo: null,
    frontmatter: { categoria: "Heroi", "Nível": 7 },
    images: [{ target: "Fulano.png", from: "frontmatter:Imagem" }],
    links: [{ target: "Bando" }],
    body: "Versão NOVA preservada do app.",
  };
  const grupo = {
    id: grupoPath.replace(/\.md$/i, ""),
    path: grupoPath,
    basename: "Bando",
    type: "Grupo",
    subtype: null,
    grupo: null,
    frontmatter: { categoria: "Grupo" },
    images: [],
    links: [],
    body: "Versão NOVA preservada do app.",
  };
  for (const rec of [hero, grupo]) {
    await mkdir(join(out, rec.path, ".."), { recursive: true });
    await writeFile(join(out, rec.path.replace(/\.md$/i, ".json")), JSON.stringify(rec, null, 2) + "\n", "utf8");
  }
  const entry = (r) => ({
    id: r.id,
    path: r.path,
    basename: r.basename,
    type: r.type,
    subtype: r.subtype,
    grupo: r.grupo,
    kind: "content",
  });
  await writeFile(
    join(out, "index.json"),
    JSON.stringify({ docs: [entry(hero), entry(grupo)] }, null, 2) + "\n",
    "utf8",
  );
}

test("isFrozenPath cobre Heróis e Grupos de Criaturas (e nada além)", () => {
  assert.ok(isFrozenPath(`${HERO_DIR}/Carlos.md`));
  assert.ok(isFrozenPath(`${GRUPO_DIR}/A, B, C.md`));
  assert.ok(!isFrozenPath("Sistema/Criaturas/Bestiário/Goblin.md"));
  assert.ok(!isFrozenPath("Sistema/Criaturas/Companheiros Animais/Mera.md"));
  assert.equal(FROZEN_PREFIXES.length, 2);
});

test("extract preserva Heróis/Grupos do OUT_DIR anterior e ignora os .md da vault", async () => {
  const vault = await mkdtemp(join(tmpdir(), "pleitost-vault-"));
  const out = await mkdtemp(join(tmpdir(), "pleitost-out-"));
  try {
    await makeFakeVault(vault);
    await seedPreviousOut(out);

    const summary = await extractVault({ vaultRoot: vault, outDir: out });
    assert.equal(summary.frozenPreserved, 2, "herói + grupo preservados");

    // Herói: conteúdo do vault-data ANTERIOR intacto (não a versão da vault).
    const heroJson = JSON.parse(await readFile(join(out, `${HERO_DIR}/Fulano.json`), "utf8"));
    assert.equal(heroJson.frontmatter["Nível"], 7, "versão preservada do app, não a da vault");
    assert.equal(heroJson.body, "Versão NOVA preservada do app.");
    const grupoJson = JSON.parse(await readFile(join(out, `${GRUPO_DIR}/Bando.json`), "utf8"));
    assert.equal(grupoJson.body, "Versão NOVA preservada do app.");

    // Índice: docs congelados seguem como content; doc normal re-extraído.
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    const ids = index.docs.filter((d) => d.kind === "content").map((d) => d.id);
    assert.ok(ids.includes(`${HERO_DIR}/Fulano`));
    assert.ok(ids.includes(`${GRUPO_DIR}/Bando`));
    assert.ok(ids.includes("Sistema/Regras/Coisa"));
    assert.equal(index.counts.content, 3);

    // Doc normal veio da VAULT (re-extraído de verdade).
    const coisa = JSON.parse(await readFile(join(out, "Sistema/Regras/Coisa.json"), "utf8"));
    assert.match(coisa.body, /Um doc normal/);
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});

test("sem snapshot anterior: pastas congeladas ficam fora (com aviso), sem quebrar", async () => {
  const vault = await mkdtemp(join(tmpdir(), "pleitost-vault-"));
  const out = await mkdtemp(join(tmpdir(), "pleitost-out-"));
  try {
    await makeFakeVault(vault);
    // OUT_DIR sem index.json anterior
    const summary = await extractVault({ vaultRoot: vault, outDir: out });
    assert.equal(summary.frozenPreserved, 0);
    assert.ok(!existsSync(join(out, `${HERO_DIR}/Fulano.json`)), "herói da vault NÃO extraído");
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    assert.equal(index.counts.content, 1, "só o doc normal");
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
