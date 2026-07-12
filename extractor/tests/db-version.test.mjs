// Stamp de versão da database (#190): `npm run extract` DE VERDADE (a vault
// local existe — deploy/extract são operações locais, ver docs/deploy.md) e
// assert no vault-data/db-version.json gravado. Teste pesado de propósito:
// é o fluxo real que o publish-db roda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { VAULT_ROOT, OUT_DIR, REPO_ROOT } from "../paths.mjs";

test("#190: extract real grava db-version.json com extractedAt ISO + docCount", (t) => {
  if (!existsSync(VAULT_ROOT)) {
    // Máquina sem a vault (ex.: CI) — o extract é impossível por definição.
    t.skip(`vault ausente em ${VAULT_ROOT}`);
    return;
  }

  const before = Date.now();
  execFileSync("npm", ["run", "extract"], { cwd: REPO_ROOT, encoding: "utf8" });

  const stampPath = join(OUT_DIR, "db-version.json");
  assert.ok(existsSync(stampPath), "extract deve gravar vault-data/db-version.json");
  const stamp = JSON.parse(readFileSync(stampPath, "utf8"));

  // extractedAt: ISO 8601 válido e DESTA rodada (o stamp muda a cada extract).
  const at = new Date(stamp.extractedAt);
  assert.ok(!Number.isNaN(at.getTime()), "extractedAt deve ser data válida");
  assert.equal(stamp.extractedAt, at.toISOString(), "extractedAt deve ser ISO 8601");
  assert.ok(at.getTime() >= before - 1000, "stamp deve ser desta rodada, não resíduo");

  // docCount casa com o manifesto (docs de CONTEÚDO — o que o app navega).
  const index = JSON.parse(readFileSync(join(OUT_DIR, "index.json"), "utf8"));
  assert.equal(typeof stamp.docCount, "number");
  assert.ok(stamp.docCount > 0);
  assert.equal(stamp.docCount, index.counts.content, "docCount = counts.content do index.json");
});
