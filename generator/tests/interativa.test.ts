import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { PALETTE } from "../../src/render/shared/palette-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractInterativa } from "../extract-interativa.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const spec = extractInterativa({ pluginRoot: ROOT });

/** Resolve um emojiPath ("grupo.Chave") no registry runtime. null = inválido. */
function resolveEmoji(path: string | null): string | null {
  if (!path) return null;
  const [group, key] = path.split(".");
  const table = (EMOJI as unknown as Record<string, Record<string, string>>)[group];
  return table?.[key] ?? null;
}
function cluster(key: string) {
  const c = spec.clusters.find((x: { key: string }) => x.key === key);
  if (!c) throw new Error(`cluster ${key} ausente`);
  return c;
}
function diamondByLabel(key: string, label: string) {
  return cluster(key).diamonds.find((d: { label: string }) => d.label === label);
}

describe("extract-interativa — estrutura de clusters", () => {
  it("cobre EXATAMENTE os 4 clusters em ordem visual", () => {
    expect(spec.clusters.map((c: { key: string }) => c.key)).toEqual([
      "vida",
      "atributos",
      "magias",
      "extras",
    ]);
  });

  it("cada cluster aponta pro arquivo-fonte do diamond e tem nome", () => {
    for (const c of spec.clusters) {
      expect(c.name).toBeTruthy();
      expect(c.file).toMatch(/diamonds\/diamond-.*\.ts$/);
      expect(c.diamonds.length).toBeGreaterThan(0);
    }
  });

  it("total de diamonds >= 25", () => {
    const total = spec.clusters.reduce(
      (n: number, c: { diamonds: unknown[] }) => n + c.diamonds.length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(25);
  });

  it("nenhum label vazio em nenhum diamond", () => {
    for (const c of spec.clusters) {
      for (const d of c.diamonds) {
        expect(typeof d.label).toBe("string");
        expect((d.label as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("todo diamond tem clickable boolean e states completo; clickable não-disabled abre painel", () => {
    for (const c of spec.clusters) {
      for (const d of c.diamonds) {
        expect(typeof d.clickable).toBe("boolean");
        expect(d.states).toBeTruthy();
        expect("selected" in d.states).toBe(true);
        expect("dim" in d.states).toBe(true);
        expect("disabled" in d.states).toBe(true);
        // Se é clicável SEM condição de disabled, precisa mapear um painel.
        if (d.clickable && d.states.disabled == null) {
          expect(d.opensPanel, `${c.key}/${d.label} clicável sem opensPanel`).toBeTruthy();
        }
      }
    }
  });

  it("todo emojiPath não-null resolve no registry runtime (nada inventado)", () => {
    for (const c of spec.clusters) {
      for (const d of c.diamonds) {
        if (d.emojiPath != null) {
          expect(resolveEmoji(d.emojiPath), `emojiPath inválido: ${d.emojiPath}`).toBeTruthy();
        }
      }
    }
  });
});

describe("extract-interativa — cluster Atributos (checklist)", () => {
  it("Defesa é clicável e abre 'defesa'; Vigor/Reflexo/Ímpeto não-clicáveis", () => {
    const defesa = diamondByLabel("atributos", "Defesa");
    expect(defesa).toBeTruthy();
    expect(defesa.clickable).toBe(true);
    expect(defesa.opensPanel).toBe("defesa");
    expect(resolveEmoji(defesa.emojiPath)).toBe(EMOJI.defesa.Defesa);
    for (const nome of ["Vigor", "Reflexo", "Impeto"]) {
      const d = diamondByLabel("atributos", nome);
      expect(d, `resistência ${nome}`).toBeTruthy();
      expect(d.clickable).toBe(false);
      expect(d.opensPanel).toBeNull();
      expect(d.notClickableReason).toBeTruthy();
    }
  });

  it("FOR/AGI/INT/PRE abrem attribute:<id> com emoji correto", () => {
    const want: Record<string, string> = {
      Força: "FOR",
      Agilidade: "AGI",
      Inteligência: "INT",
      Presença: "PRE",
    };
    for (const [titulo, id] of Object.entries(want)) {
      const d = diamondByLabel("atributos", titulo);
      expect(d, titulo).toBeTruthy();
      expect(d.clickable).toBe(true);
      expect(d.opensPanel).toBe(`attribute:${id}`);
      expect(resolveEmoji(d.emojiPath)).toBe(
        (EMOJI.atributo as Record<string, string>)[id],
      );
    }
  });

  it("mid Ataques/Técnicas/Habilidades clicáveis; Ofícios disabled em Monstro/CA", () => {
    const ataques = diamondByLabel("atributos", "Ataques e Ações");
    expect(ataques.clickable).toBe(true);
    expect(ataques.opensPanel).toBe("ataques");
    expect(resolveEmoji(ataques.emojiPath)).toBe(EMOJI.combate.Ataque);

    const tec = diamondByLabel("atributos", "Técnicas");
    expect(tec.opensPanel).toBe("tecnicas");
    const hab = diamondByLabel("atributos", "Habilidades");
    expect(hab.opensPanel).toBe("habilidades");

    const oficios = diamondByLabel("atributos", "Ofícios");
    expect(oficios.opensPanel).toBe("oficios");
    expect(oficios.states.disabled).toMatch(/Monstro/);
    expect(oficios.states.disabled).toMatch(/CompanheiroAnimal/);
    expect(oficios.notClickableReason).toBeTruthy();
  });

  it("Movimento clicável → 'movimento'; Percepção/Intuição read-only; Creature Badge decorativo", () => {
    const mov = diamondByLabel("atributos", "Movimentos");
    expect(mov.clickable).toBe(true);
    expect(mov.opensPanel).toBe("movimento");
    expect(resolveEmoji(mov.emojiPath)).toBe(EMOJI.subcategoria.Movimento);

    for (const nome of ["Percepcao", "Intuicao"]) {
      const d = diamondByLabel("atributos", nome);
      expect(d, `sentido ${nome}`).toBeTruthy();
      expect(d.clickable).toBe(false);
      expect(d.opensPanel).toBeNull();
    }

    const badge = diamondByLabel("atributos", "Creature Badge");
    expect(badge).toBeTruthy();
    expect(badge.clickable).toBe(false);
    expect(badge.opensPanel).toBeNull();
    // emoji por família — resolve cada path no registry.
    expect(badge.familyEmojiPaths).toBeTruthy();
    for (const fam of ["Heroi", "Monstro", "CompanheiroAnimal"]) {
      expect(resolveEmoji(badge.familyEmojiPaths[fam])).toBe(
        (EMOJI.subcategoria as Record<string, string>)[fam],
      );
    }
  });
});

describe("extract-interativa — cluster Vida (checklist)", () => {
  it("losango Vida clicável → sidebar 'vida'", () => {
    const vida = diamondByLabel("vida", "Vida");
    expect(vida.clickable).toBe(true);
    expect(vida.opensPanel).toBe("vida:vida");
    expect(resolveEmoji(vida.emojiPath)).toBe(EMOJI.subcategoria.Vitalidade);
  });

  it("minis Recuperação(disabled Monstro)/Condições/Anotações/Moedas presentes", () => {
    const rec = diamondByLabel("vida", "Recuperação");
    expect(rec).toBeTruthy();
    expect(rec.opensPanel).toBe("vida:recuperacao");
    expect(rec.states.disabled).toMatch(/Monstro/);
    expect(resolveEmoji(rec.emojiPath)).toBe(EMOJI.subcategoria.Dormir);

    const cond = diamondByLabel("vida", "Condições");
    expect(cond.opensPanel).toBe("vida:condicoes");
    // Condições NUNCA fica disabled (Monstro pode estar sob condição).
    expect(cond.states.disabled).toBeNull();
    expect(resolveEmoji(cond.emojiPath)).toBe(EMOJI.subcategoria.Condicao);

    const anot = diamondByLabel("vida", "Anotações");
    expect(anot.opensPanel).toBe("extras:anotacoes");

    const moe = cluster("vida").diamonds.find((d: { opensPanel: string }) =>
      d.opensPanel === "extras:moedas",
    );
    expect(moe, "mini Moedas da Vida").toBeTruthy();
    expect(resolveEmoji(moe.emojiPath)).toBe(EMOJI.inv.Moeda);
  });
});

describe("extract-interativa — cluster Magias (checklist)", () => {
  it("Tesouros sempre clicável; sem condição de proficiência (isDim:()=>false)", () => {
    const t = diamondByLabel("magias", "Tesouros");
    expect(t.clickable).toBe(true);
    expect(t.opensPanel).toBe("magia:tesouros");
    expect(resolveEmoji(t.emojiPath)).toBe(EMOJI.subcategoria.Tesouro);
  });

  it("Arcana/Anima/Secundária têm states.disabled com condição de proficiência", () => {
    const arcana = diamondByLabel("magias", "Magia Arcana");
    expect(arcana.states.disabled).toMatch(/hasPrimariaProf/);
    expect(arcana.states.disabled).toMatch(/ArcanaBranca/);
    expect(arcana.states.disabled).toMatch(/ArcanaNegra/);
    expect(arcana.states.dim).toMatch(/hasPrimariaProf/);
    expect(resolveEmoji(arcana.emojiPath)).toBe(EMOJI.escola.Arcana);

    const anima = diamondByLabel("magias", "Magia Anima");
    expect(anima.states.disabled).toMatch(/hasPrimariaProf/);
    expect(anima.states.disabled).toMatch(/Anima/);
    expect(anima.opensPanel).toMatch(/Anima/);
    expect(resolveEmoji(anima.emojiPath)).toBe(EMOJI.escola.Anima);

    const sec = diamondByLabel("magias", "Magia Secundária");
    expect(sec.states.disabled).toMatch(/hasAnyMagiaSecundariaProficiency/);
    expect(sec.opensPanel).toBe("magia:secundaria");
    expect(resolveEmoji(sec.emojiPath)).toBe(EMOJI.escola.Secundaria);
  });

  it("todo diamond de Magias é da família Heroi e tem disabled-por-prof exceto Tesouros", () => {
    const mags = cluster("magias").diamonds;
    expect(mags.length).toBe(4);
    for (const d of mags) {
      expect(d.family).toBe("Heroi");
      // Todos os 4 têm addEventListener("click") incondicional (o gate de
      // proficiência vai em states.disabled), então clickable=true p/ todos —
      // consistente com Secundária e com Ofícios (cluster atributos).
      expect(d.clickable).toBe(true);
    }
    // Gate de proficiência = condição que invoca um predicado de prof da
    // fonte (hasPrimariaProf p/ Arcana/Anima; hasAnyMagiaSecundariaProficiency
    // p/ Secundária). Tesouros (isDim:()=>false) NÃO tem gate.
    const withProfGate = mags.filter(
      (d: { states: { disabled: string | null } }) =>
        typeof d.states.disabled === "string" &&
        /hasPrimariaProf|hasAnyMagiaSecundariaProficiency/.test(d.states.disabled),
    );
    // Arcana + Anima + Secundária = 3 com gate de proficiência.
    expect(withProfGate.length).toBe(3);
    // E Tesouros é o único SEM disabled (sempre clicável).
    expect(
      mags.filter((d: { states: { disabled: string | null } }) => d.states.disabled == null).length,
    ).toBe(1);
  });
});

describe("extract-interativa — cluster Extras (checklist)", () => {
  it("Consumíveis sempre acessível; Experiência/Anotações/Moedas disabled em Monstro", () => {
    const cons = diamondByLabel("extras", "Consumíveis");
    expect(cons.clickable).toBe(true);
    expect(cons.opensPanel).toBe("extras:consumiveis");
    expect(cons.states.disabled).toBeNull();
    expect(resolveEmoji(cons.emojiPath)).toBe(EMOJI.categoria.Consumivel);

    const exp = diamondByLabel("extras", "Experiência");
    expect(exp.opensPanel).toBe("extras:experiencia");
    expect(exp.states.disabled).toMatch(/Monstro/);
    expect(resolveEmoji(exp.emojiPath)).toBe(EMOJI.tier.Gold);

    const moe = diamondByLabel("extras", "Moedas e Tesouros Especiais");
    expect(moe.states.disabled).toMatch(/Monstro/);
    expect(resolveEmoji(moe.emojiPath)).toBe(EMOJI.inv.Moeda);
  });
});

describe("extract-interativa — panelModes", () => {
  it("right contém os modos canônicos em ordem (ataques primeiro)", () => {
    expect(spec.panelModes.right[0]).toBe("ataques");
    for (const m of ["defesa", "movimento", "oficios", "attribute", "tecnicas", "habilidades", "tesouros"]) {
      expect(spec.panelModes.right).toContain(m);
    }
  });
  it("vida = vida/condicoes/recuperacao; extras = 4 ações; magias = 4 views", () => {
    expect(spec.panelModes.vida).toEqual(["vida", "condicoes", "recuperacao"]);
    expect([...spec.panelModes.extras].sort()).toEqual(
      ["anotacoes", "consumiveis", "experiencia", "moedas"].sort(),
    );
    expect([...spec.panelModes.magias].sort()).toEqual(
      ["arcana", "school", "secundaria", "tesouros"].sort(),
    );
  });
});

describe("extract-interativa — pills EM", () => {
  it("Primária 🔷 / Secundária 🔶, no título do painel Magia, não em tesouros", () => {
    expect(spec.emPills.pills).toHaveLength(2);
    const prim = spec.emPills.pills.find((p: { fonte: string }) => p.fonte === "primaria");
    const sec = spec.emPills.pills.find((p: { fonte: string }) => p.fonte === "secundaria");
    expect(resolveEmoji(prim.emojiPath)).toBe(EMOJI.subcategoria.EnergiaMagica);
    expect(resolveEmoji(sec.emojiPath)).toBe(EMOJI.subcategoria.EnergiaMagicaSecundaria);
    expect(spec.emPills.whereShown).toMatch(/painel Magia/i);
    expect(spec.emPills.behavior).toMatch(/tesouros/i);
  });
});

describe("extract-interativa — vidaNumber", () => {
  it("fórmula = vit + moral(se família) + moralTemp>0", () => {
    expect(spec.vidaNumber.formula).toMatch(/vitalidade/);
    expect(spec.vidaNumber.formula).toMatch(/moral/);
    expect(spec.vidaNumber.formula).toMatch(/moralTemporaria > 0/);
  });
  it("fills carregam colorPath válido na PALETTE pros recursos coloridos", () => {
    const byKey = Object.fromEntries(
      spec.vidaNumber.fills.map((f: { key: string }) => [f.key, f]),
    );
    expect(byKey.vit.colorPath).toBe("interativaResource.Vitalidade");
    expect(byKey.moral.colorPath).toBe("interativaResource.Moral");
    expect(byKey.tempMoral.colorPath).toBe("interativaResource.MoralTemporaria");
    // colorPath resolve na PALETTE runtime.
    for (const k of ["vit", "moral", "tempMoral"]) {
      const [g, key] = (byKey[k].colorPath as string).split(".");
      const table = (PALETTE as unknown as Record<string, Record<string, string>>)[g];
      expect(table?.[key], byKey[k].colorPath).toBeTruthy();
    }
  });
  it("maxVitLine + mortoPrefix(💀) têm condições reais e emoji válido", () => {
    expect(spec.vidaNumber.maxVitLine).toMatch(/vitalidade < maxVit/);
    expect(spec.vidaNumber.mortoPrefix.condition).toMatch(/vitalidade <= -maxVit/);
    expect(resolveEmoji(spec.vidaNumber.mortoPrefix.emojiPath)).toBe(
      EMOJI.combatTracker.Morto,
    );
  });
});

describe("extract-interativa — hiddenTabsV2", () => {
  it("3 abas ainda montadas, ocultas via a regra CSS verbatim do is-v2-only", () => {
    expect(spec.hiddenTabsV2.length).toBe(3);
    expect(spec.hiddenTabsV2.map((t: { tabId: string }) => t.tabId).sort()).toEqual(
      ["anotacoes", "inventario", "recursos"],
    );
    for (const t of spec.hiddenTabsV2) {
      expect(t.stillMounted).toBe(true);
      expect(t.name).toBeTruthy();
      expect(resolveEmoji(t.emojiPath), `tab ${t.tabId} emoji`).toBeTruthy();
      expect(t.migratedTo).toBeTruthy();
      // Regra CSS lida verbatim do styles.css — precisa conter o seletor real.
      expect(t.cssRule).toMatch(/\.interativa-shell\.is-v2-only > \.dvjs-tabs-master/);
      expect(t.cssRule).toMatch(/display:\s*none/);
    }
  });
});

describe("extract-interativa — counters", () => {
  it("Vit/Moral/Temp com colorPath + steps, e decremento-vida com cascade", () => {
    const byRes = Object.fromEntries(
      spec.counters.map((c: { resource: string }) => [c.resource, c]),
    );
    expect(byRes["Vitalidade"].colorPath).toBe("interativaResource.Vitalidade");
    expect(byRes["Moral"].colorPath).toBe("interativaResource.Moral");
    expect(byRes["Moral Temporária"].colorPath).toBe("interativaResource.MoralTemporaria");
    for (const r of ["Vitalidade", "Moral", "Moral Temporária"]) {
      expect(byRes[r].steps.inc).toEqual([1, 5, 10]);
      expect(byRes[r].steps.dec).toEqual([1, 5, 10]);
    }
    const dec = byRes["decremento-vida"];
    expect(dec).toBeTruthy();
    expect(dec.cascadeDamage).toMatch(/temp.*moral.*vida/);
    expect(dec.steps).toEqual([1, 5, 10]);
  });
});

describe("extract-interativa — sem gaps inventados", () => {
  it("gaps é array (idealmente vazio quando a fonte está completa)", () => {
    expect(Array.isArray(spec.gaps)).toBe(true);
    // Princípio: dado faltante vira gap, nunca chute. Se algo entrar em
    // gaps, é sinal honesto — não falha o teste por si só, mas garante o canal.
  });
});
