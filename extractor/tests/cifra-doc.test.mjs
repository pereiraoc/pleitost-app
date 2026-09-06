// SENHA POR AVENTURA — ida e volta da cifra: o público não vaza nada além dos
// campos declarados; a senha da aventura E a do dev destravam; senha errada
// falha (GCM autentica).
import test from "node:test";
import assert from "node:assert/strict";
import { cifrarDoc, decifrarDoc, SALT_DEV } from "../cifra-doc.mjs";

const record = {
  id: "Campanhas/Aventuras/X",
  path: "Campanhas/Aventuras/X.md",
  basename: "X",
  type: "Aventura",
  subtype: "Resgate",
  grupo: null,
  frontmatter: {
    categoria: "Aventura",
    subcategoria: "Resgate",
    rank: "C",
    Chamada: "Uma noite qualquer.",
    Senha: "abc123",
    Duração: "3h",
    Contato: "Fulano (spoiler)",
  },
  inlineFields: {},
  ruleElements: [],
  links: [{ target: "Vilão Secreto", kind: "wikilink" }],
  images: [],
  headings: [{ level: 1, text: "1. Resumo" }],
  body: "# 1. Resumo\nSEGREDO DA TRAMA\n```bounty\nTitulo: Resgate do Vilão\n```",
};
const camposPublicos = ["Chamada", "rank", "Formato", "Duração", "Jogadores", "Tom"];

test("público = só campos da lista trancada + estruturais; nada de corpo/links/senha", () => {
  const pub = cifrarDoc(record, { camposPublicos, senhaDev: "dev!" });
  assert.deepEqual(pub.frontmatter, { categoria: "Aventura", rank: "C", Chamada: "Uma noite qualquer.", Duração: "3h" });
  assert.equal(pub.body, "");
  assert.equal(pub.subtype, null); // tipo de missão fora da lista trancada
  assert.deepEqual(pub.links, []);
  assert.deepEqual(pub.headings, []);
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("SEGREDO"));
  assert.ok(!json.includes("abc123"));
  assert.ok(!json.includes("Vilão"));
  assert.ok(!json.includes("Fulano"));
  assert.equal(pub.protegido.alg, "AES-256-GCM");
  assert.equal(pub.protegido.chaves.dev.salt, Buffer.from(SALT_DEV).toString("base64"));
});

test("senha da aventura e senha do dev decifram o MESMO record (sem a Senha no FM)", () => {
  const pub = cifrarDoc(record, { camposPublicos, senhaDev: "dev!" });
  const a = decifrarDoc(pub, { senha: "abc123" });
  const b = decifrarDoc(pub, { senhaDev: "dev!" });
  assert.deepEqual(a, b);
  assert.equal(a.body, record.body);
  assert.equal(a.frontmatter.Contato, "Fulano (spoiler)");
  assert.equal("Senha" in a.frontmatter, false);
  assert.deepEqual(a.links, record.links);
  assert.equal("protegido" in a, false);
});

test("senha errada falha (autenticação GCM)", () => {
  const pub = cifrarDoc(record, { camposPublicos, senhaDev: null });
  assert.throws(() => decifrarDoc(pub, { senha: "errada" }));
  assert.equal(pub.protegido.chaves.dev, undefined);
});

test("doc sem Senha não cifra", () => {
  assert.throws(() => cifrarDoc({ ...record, frontmatter: { categoria: "Aventura" } }, { camposPublicos }), /sem FM Senha/);
});
