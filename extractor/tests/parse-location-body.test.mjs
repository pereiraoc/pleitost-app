// Cobertura do parser dos callouts de Localização (Descrição/Aparência/
// População + Distritos e Locais de Interesse). Fixtures espelham a
// convenção do template real da vault (Varadas/Riqueza/Mundo Livre).

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseLocationBody } from "../parse-location-body.mjs";

const CIDADE_BODY = `#Local
![[Varadas.png]]
> [!abstract] Contexto da \`= this.subcategoria\`: \`= this.file.name\`
> 🗺️**Geolocalização:** \`= this.Geolocalização\`
> 📖**Contexto Histórico:**

> [!info] Informações da \`= this.subcategoria\`: \`= this.file.name\`
> 👥**População:** 20.000 (40% Classe Baixa, 55% Classe Média, 5% Classe Alta)
>
> 💰**Recursos:** \`= this.Recursos\`.
>
> ℹ️**Descrição:** Pequena cidade pecuária do [[Principado das Flores]].
>
> 👁️**Aparência do Local:** Núcleo de casas de tijolo com empenas.
>
> 🛡️**Influências:**
>- **[[Sociedade Aberta]]:**
>
>📖**Acontecimento Recente:**

> [!info] Distritos e Locais de Interesse
> **Largo do Laço** *(vermelho — centro)* — o coração da cidade.
> - **Praça do Laço:** praça circular.
> - **Casa do Conselho Local:** edifício de empenas.
>
> **Bairro das Estâncias** *(ocre — norte)* — casario esparso.

---
`;

test("Localização (cidade): extrai População/Descrição/Aparência do callout Informações", () => {
  const r = parseLocationBody(CIDADE_BODY);
  assert.equal(r.populacao, "20.000 (40% Classe Baixa, 55% Classe Média, 5% Classe Alta)");
  assert.equal(r.descricao, "Pequena cidade pecuária do [[Principado das Flores]].");
  assert.equal(r.aparencia, "Núcleo de casas de tijolo com empenas.");
});

test("Localização (cidade): extrai Locais de Interesse como markdown do callout", () => {
  const r = parseLocationBody(CIDADE_BODY);
  assert.ok(r.locaisInteresse);
  // Todas as linhas do callout, sem o prefixo `> `.
  assert.ok(r.locaisInteresse.includes("**Largo do Laço** *(vermelho — centro)*"));
  assert.ok(r.locaisInteresse.includes("- **Praça do Laço:** praça circular."));
  assert.ok(r.locaisInteresse.includes("**Bairro das Estâncias** *(ocre — norte)*"));
  // NÃO inclui o header do callout.
  assert.ok(!r.locaisInteresse.includes("[!info]"));
});

const REGIAO_BODY = `#Local
> [!info] Informações da \`= this.subcategoria\`: \`= this.file.name\`
> 👥**População:**
>
> 💰**Recursos:** \`= this.Recursos\`.
>
> ℹ️**Descrição:** O Mundo Livre é o conjunto das terras livres.
>
> 👁️**Aparência do Local:** Um continente compacto cercado de oceano.

---
`;

test("Localização (região): sem callout de Distritos → locaisInteresse = null", () => {
  const r = parseLocationBody(REGIAO_BODY);
  assert.equal(r.descricao, "O Mundo Livre é o conjunto das terras livres.");
  assert.equal(r.aparencia, "Um continente compacto cercado de oceano.");
  assert.equal(r.populacao, null); // População vazia → não vira "".
  assert.equal(r.locaisInteresse, null);
});

test("Localização sem body: tudo null", () => {
  const r = parseLocationBody("");
  // Shape completo do parser atual (725def2 adicionou os campos de
  // callout-prosa; leaflet veio do mapa #418) — tudo null sem body.
  assert.deepEqual(r, {
    populacao: null,
    descricao: null,
    aparencia: null,
    locaisInteresse: null,
    acontecimentoRecente: null,
    contexto: null,
    organizacoesInfluentes: null,
    leaflet: null,
  });
});

test("Body sem callout de Informações: campos null (não erra)", () => {
  const r = parseLocationBody("Só prosa solta, sem callout algum.");
  assert.equal(r.descricao, null);
  assert.equal(r.aparencia, null);
  assert.equal(r.populacao, null);
});

test("Emoji com VS-16 (👁️) reconhecido — Aparência não vira null", () => {
  // O 👁️ do template REAL da vault tem U+FE0F (VS-16) grudado. Regressão:
  // parser não pode depender de comparação byte-a-byte sem VS-16.
  const body = `> [!info] Informações
> 👁️**Aparência do Local:** teste
`;
  const r = parseLocationBody(body);
  assert.equal(r.aparencia, "teste");
});

test("leaflet: captura defaultZoom e os gates minZoom/maxZoom dos markers", () => {
  // Linhas REAIS do bloco da nota Porto Alegre (POA 1987): Bairro tem
  // maxZoom (só no zoom afastado), ponto de interesse tem minZoom (só no
  // aproximado), Padre Chagas com minZoom 0.
  const body = [
    "```leaflet",
    "image: [[Mapa de Porto Alegre RPG.png]]",
    "bounds: [[0,0], [1170,850]]",
    "defaultZoom: -1",
    "marker: Bairro,990.078125,405.5,Nova Sarandi,,,-0.1",
    "marker: Mercado,876,258,Mercado Público,,-0.1,",
    "marker: Bar,883,343,Padre Chagas,,0,",
    "```",
  ].join("\n");
  const r = parseLocationBody(body);
  assert.equal(r.leaflet.defaultZoom, -1);
  assert.deepEqual(r.leaflet.markers, [
    { tipo: "Bairro", lat: 990.078125, long: 405.5, nome: "Nova Sarandi", minZoom: null, maxZoom: -0.1 },
    { tipo: "Mercado", lat: 876, long: 258, nome: "Mercado Público", minZoom: -0.1, maxZoom: null },
    { tipo: "Bar", lat: 883, long: 343, nome: "Padre Chagas", minZoom: 0, maxZoom: null },
  ]);
});
