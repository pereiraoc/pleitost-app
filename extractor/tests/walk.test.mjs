import { test } from "node:test";
import assert from "node:assert/strict";
import { isScaffolding } from "../walk.mjs";

test("walk: conteúdo vs scaffolding", () => {
  // conteúdo
  assert.equal(isScaffolding("Sistema/Regras/Regras.md"), false);
  assert.equal(isScaffolding("Atlas/Mundo Livre/X.md"), false);
  assert.equal(isScaffolding("Recursos e Mídia/Documentação Adicional/Y.md"), false);

  // scaffolding (listado, não extraído)
  assert.equal(isScaffolding("Recursos e Mídia/Templates/T.md"), true);
  assert.equal(isScaffolding("Recursos e Mídia/Rascunhos/R.md"), true);
  assert.equal(isScaffolding("Recursos e Mídia/Notas de Teste/N.md"), true);
  assert.equal(isScaffolding("Recursos e Mídia/Exportação/E.md"), true);
  // Excalidraw é fonte volátil → scaffolding
  assert.equal(isScaffolding("Recursos e Mídia/Excalidraw/Companion App Draft.excalidraw.md"), true);
});
