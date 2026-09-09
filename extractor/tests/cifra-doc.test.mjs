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

// ── FIGURAS DA CAMPANHA (2026-09-08c): bytes cifrados com a chave do doc ──
import { cifrarBytes, decifrarBytes, chaveDoDoc, nomeCifrado } from "../cifra-doc.mjs";
import { randomBytes } from "node:crypto";

test("cifrarBytes/decifrarBytes: ida e volta com iv embutido; chave errada falha", () => {
  const K = randomBytes(32);
  const png = Buffer.from("PNG-FALSO-" + "x".repeat(100));
  const enc = cifrarBytes(K, png);
  assert.ok(!enc.includes(png)); // nada em claro
  assert.equal(enc.length, 12 + png.length + 16); // iv ‖ ct ‖ tag
  assert.deepEqual(decifrarBytes(K, enc), png);
  assert.throws(() => decifrarBytes(randomBytes(32), enc));
});

test("cifrarDoc com chave dada + privadoExtra: os arquivos viajam DENTRO da cifra e a chave sai pela senha", () => {
  const K = randomBytes(32);
  const arquivos = [{ target: "Segredo.png", path: "Recursos/Segredo.png", copiedTo: "assets-cifrados/abc.enc" }];
  const pub = cifrarDoc(record, { camposPublicos, senhaDev: "dev!", chave: K, privadoExtra: { arquivos } });
  assert.ok(!JSON.stringify(pub).includes("Segredo"));
  const aberto = decifrarDoc(pub, { senha: "abc123" });
  assert.deepEqual(aberto.arquivos, arquivos);
  assert.deepEqual(chaveDoDoc(pub, { senha: "abc123" }), K);
  assert.deepEqual(chaveDoDoc(pub, { senhaDev: "dev!" }), K);
});

test("nomeCifrado: opaco, determinístico por (doc, caminho), sem o nome do arquivo", () => {
  const a = nomeCifrado("Campanhas/Aventuras/X", "Recursos/Segredo.png");
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.equal(a, nomeCifrado("Campanhas/Aventuras/X", "Recursos/Segredo.png"));
  assert.notEqual(a, nomeCifrado("Campanhas/Aventuras/Y", "Recursos/Segredo.png"));
});

// ── DETERMINISMO (report 2026-09-08: "não salva que eu liberei a aventura") ──
// K vinha de randomBytes por extract: o aparelho guardava a chave, o deploy
// seguinte trocava a chave e o app esquecia — senha de novo a cada publicação.
import { chaveDeterministica } from "../cifra-doc.mjs";

test("mesma nota + mesma senha = MESMA chave e MESMOS bytes em extracts diferentes", () => {
  const a = cifrarDoc(record, { camposPublicos, senhaDev: "dev!" });
  const b = cifrarDoc(record, { camposPublicos, senhaDev: "dev!" });
  assert.deepEqual(chaveDoDoc(a, { senha: "abc123" }), chaveDoDoc(b, { senha: "abc123" }));
  assert.deepEqual(a, b); // saída reproduzível: o dataset não muda à toa
  assert.deepEqual(chaveDoDoc(a, { senha: "abc123" }), chaveDeterministica("abc123", record.id));
});

test("chave muda quando a SENHA ou a NOTA mudam (nunca duas notas com a mesma chave)", () => {
  const outraSenha = cifrarDoc({ ...record, frontmatter: { ...record.frontmatter, Senha: "outra" } }, { camposPublicos });
  const outraNota = cifrarDoc({ ...record, id: "Campanhas/Aventuras/Y", path: "Campanhas/Aventuras/Y.md" }, { camposPublicos });
  const k = chaveDoDoc(cifrarDoc(record, { camposPublicos }), { senha: "abc123" });
  assert.notDeepEqual(chaveDoDoc(outraSenha, { senha: "outra" }), k);
  assert.notDeepEqual(chaveDoDoc(outraNota, { senha: "abc123" }), k);
});

test("corpo diferente = iv diferente (nunca repete iv com a mesma chave)", () => {
  const a = cifrarDoc(record, { camposPublicos });
  const b = cifrarDoc({ ...record, body: "# 1. Resumo\nOUTRO TEXTO" }, { camposPublicos });
  assert.notEqual(a.protegido.iv, b.protegido.iv);
  assert.notEqual(a.protegido.cifra, b.protegido.cifra);
});

test("cifrarBytes: mesmo arquivo = mesmos bytes; arquivo diferente = iv diferente", () => {
  const K = chaveDeterministica("abc123", record.id);
  const ctx = `${record.id}\nImagens/a.png`;
  const png = Buffer.from("PNG-A".repeat(20));
  assert.deepEqual(cifrarBytes(K, png, ctx), cifrarBytes(K, png, ctx));
  const outro = cifrarBytes(K, Buffer.from("PNG-B".repeat(20)), ctx);
  assert.notEqual(outro.subarray(0, 12).toString("hex"), cifrarBytes(K, png, ctx).subarray(0, 12).toString("hex"));
  assert.deepEqual(decifrarBytes(K, cifrarBytes(K, png, ctx)), png);
});
