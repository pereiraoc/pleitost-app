// TABELAS AUDITÁVEIS DAS CONTEXTO-DEFS (report 2026-09-01: "muita chance de
// ter algo no texto mas não nas properties"). O FM é a ÚNICA fonte de
// máquina; as tabelas do corpo são GERADAS dele entre os marcadores
//   <!-- auto:contexto -->  …  <!-- /auto:contexto -->
// pelo gen-contexto-doc.mjs, e o compile-contexto FALHA o extract se o bloco
// estiver desatualizado — corpo e properties nunca divergem.

/** Agrupa os renames de nota por TIPO da nota (Classe/Técnica/Magia/…). */
function grupos(notas, typeByBasename) {
  const por = new Map();
  for (const [de, para] of Object.entries(notas ?? {})) {
    const t = typeByBasename?.get?.(de) ?? "Outros";
    if (!por.has(t)) por.set(t, []);
    por.get(t).push([de, para]);
  }
  return por;
}

const ORDEM_TIPOS = [
  "Classe",
  "Habilidade",
  "Técnica",
  "Ação",
  "Regra",
  "Magia",
  "Tesouro",
  "Condição",
  "Outros",
];

function tabela(titulo, linhas, cab = ["Fantasia", "POA 1987"]) {
  if (!linhas.length) return [];
  return [
    `#### ${titulo}`,
    "",
    `| ${cab[0]} | ${cab[1]} |`,
    "|---|---|",
    ...linhas.map(([a, b]) => `| ${a} | ${b} |`),
    "",
  ];
}

/** Corpo canônico do bloco auto de uma Contexto-Def (qualquer uma das três —
 *  cada seção só aparece se o FM correspondente existir). */
export function renderContextoDoc(contexto, typeByBasename) {
  const out = [];
  const c = contexto ?? {};

  // Identidade
  const ident = [];
  if (c.id) ident.push(["id", `\`${c.id}\``]);
  if (c.nome) ident.push(["nome", c.nome]);
  if (c.moeda) ident.push(["moeda", `${c.moeda.simbolo} (${c.moeda.nome})`]);
  if (c.atlas) ident.push(["atlas", `raiz \`${c.atlas.raiz}\`${c.atlas.mapa ? ` · mapa \`${c.atlas.mapa}\`` : ""}`]);
  out.push(...tabela("Identidade", ident, ["Campo", "Valor"]));

  // Perícias com display próprio
  out.push(...tabela("Perícias (display do mundo)", Object.entries(c.pericias ?? {})));

  // Reskin de notas, agrupado por tipo
  const por = grupos(c.reskin?.notas, typeByBasename);
  const tipos = [...por.keys()].sort(
    (a, b) => (ORDEM_TIPOS.indexOf(a) + 99 || 999) - (ORDEM_TIPOS.indexOf(b) + 99 || 999),
  );
  for (const t of tipos) {
    const linhas = por.get(t).sort((x, y) => x[0].localeCompare(y[0], "pt-BR"));
    out.push(...tabela(`Renames — ${t}`, linhas));
  }
  out.push(
    ...tabela(
      "Renames — notas futuras (ainda não existem na vault; aplicam pela cascata)",
      Object.entries(c.reskin?.notas_futuras ?? {}).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    ),
  );
  out.push(
    ...tabela(
      "Termos (vocabulário em textos — chave mais longa primeiro, case-sensitive)",
      Object.entries(c.reskin?.termos ?? {}),
    ),
  );
  const exc = (c.reskin?.excecoes ?? []).map((e) => [e, "cascata NÃO se aplica"]);
  out.push(...tabela("Exceções", exc, ["String", "Regra"]));

  // Disponibilidade
  if (c.disponibilidade) {
    const d = c.disponibilidade;
    out.push(...tabela("Disponibilidade", [["padrão", d.padrao ?? "disponivel"]], ["Campo", "Valor"]));
    out.push(...tabela("Itens indisponíveis neste mundo", (d.indisponiveis ?? []).map((i) => [i, "fora do catálogo"]), ["Item", "Status"]));
    out.push(...tabela("Itens restritos (onde/como se obtém)", Object.entries(d.restritos ?? {}), ["Item", "Obtenção"]));
  }

  // Base: garantias/visibilidade/conteúdo de mundo
  if (c.sempre_disponiveis) {
    out.push(
      ...tabela(
        "Garantia: sempre disponíveis (nenhum mundo pode excluir)",
        c.sempre_disponiveis.map((i) => [i, "garantido"]),
        ["Item", "Status"],
      ),
    );
  }
  if (c.conteudo_de_mundo) {
    const cm = c.conteudo_de_mundo;
    out.push(
      ...tabela(
        "Conteúdo POR MUNDO (não herda entre mundos)",
        [
          ...(cm.pastas ?? []).map((p) => ["pasta", `\`${p}\``]),
          ...(cm.tipos ?? []).map((t) => ["tipo", t]),
        ],
        ["Espécie", "Valor"],
      ),
    );
  }
  if (c.gm?.campos_publicos) {
    out.push(
      ...tabela(
        "Visibilidade: campos PÚBLICOS por categoria (o resto é do mestre)",
        Object.entries(c.gm.campos_publicos).map(([cat, campos]) => [cat, campos.join(", ")]),
        ["Categoria", "Campos públicos"],
      ),
    );
  }

  return out.join("\n").trimEnd();
}

export const AUTO_INI = "<!-- auto:contexto -->";
export const AUTO_FIM = "<!-- /auto:contexto -->";

/** Substitui (ou confere) o bloco auto num corpo de nota. */
export function aplicarBlocoAuto(body, blocoNovo) {
  const i = body.indexOf(AUTO_INI);
  const j = body.indexOf(AUTO_FIM);
  if (i === -1 || j === -1 || j < i) return null;
  return body.slice(0, i) + AUTO_INI + "\n" + blocoNovo + "\n" + AUTO_FIM + body.slice(j + AUTO_FIM.length);
}

export function blocoAutoAtual(body) {
  const i = body.indexOf(AUTO_INI);
  const j = body.indexOf(AUTO_FIM);
  if (i === -1 || j === -1 || j < i) return null;
  return body.slice(i + AUTO_INI.length, j).trim();
}
