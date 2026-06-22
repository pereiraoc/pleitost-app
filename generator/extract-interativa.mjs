// L· interativa — grafo COMPLETO do modo Interativa (clusters de diamantes,
// estados, mapeamentos clique→painel) lido LOSSLESS da AST + texto-fonte.
//
// Princípio inegociável: nada é inventado. Labels/emojis/condições/modos vêm
// dos arrays de spec declarativos (RESISTENCIA_SPECS, MID_SPECS, SPECS de
// magias/extras), dos union types dos estados (RightPanelMode/VidaSidebarMode/
// ExtrasAction/magiaPanelView), e do texto verbatim dos call-sites (regra CSS
// das abas v2, fórmula do número de Vida, cascade do decremento). Onde o dado
// genuinamente não existe na fonte → null + entrada em `gaps`.
//
// emojiPath é o caminho no registry SEM o prefixo "EMOJI." (ex "atributo.FOR",
// "defesa.Defesa"). Derivado da PropertyAccessExpression `EMOJI.<g>.<k>` na
// fonte — nunca de heurística por kind.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSourceFile, ts } from "./ast-helpers.mjs";

// ── Helpers de AST genéricos ────────────────────────────────────────────────

function findConstInitializer(sf, name) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  return null;
}

function unwrapExpr(node) {
  for (;;) {
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      node = node.expression;
      continue;
    }
    if (typeof ts.isSatisfiesExpression === "function" && ts.isSatisfiesExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }
  return node;
}

/** `EMOJI.defesa.Defesa` (PropertyAccessExpression) → "defesa.Defesa". Outras
 *  expressões → null (não é referência ao registry). */
function emojiPathFromNode(node, sf) {
  node = unwrapExpr(node);
  if (!ts.isPropertyAccessExpression(node)) return null;
  const txt = node.getText(sf);
  const m = txt.match(/^EMOJI\.([A-Za-z0-9_]+)\.([A-Za-z0-9_"']+)$/);
  if (!m) return null;
  return `${m[1]}.${m[2].replace(/["']/g, "")}`;
}

/** Valor "simples" de um initializer pra spec: string literal, boolean,
 *  number, ou — quando for `EMOJI.x.Y` — devolve o objeto { emojiPath }.
 *  Property-access que NÃO seja EMOJI vira o texto cru (ex POS_FOR). */
function simpleValue(node, sf) {
  const u = unwrapExpr(node);
  if (ts.isStringLiteralLike(u)) return u.text;
  if (ts.isNumericLiteral(u)) return Number(u.text);
  if (u.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (u.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (u.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPropertyAccessExpression(u)) {
    const ep = emojiPathFromNode(u, sf);
    if (ep) return { __emojiPath: ep };
    return { __ref: u.getText(sf) };
  }
  return { __ref: u.getText(sf) };
}

/** Object-literal node → { propName: simpleValue }. */
function objToSpec(objNode, sf) {
  const out = {};
  for (const prop of objNode.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name.getText(sf).replace(/["']/g, "");
    out[name] = simpleValue(prop.initializer, sf);
  }
  return out;
}

/** Array-literal de object-literals → array de specs. */
function arrayOfObjSpecs(initNode, sf) {
  const arr = unwrapExpr(initNode);
  if (!ts.isArrayLiteralExpression(arr)) return [];
  return arr.elements.map((el) => objToSpec(unwrapExpr(el), sf));
}

/** Lê os string-literals de um union `type X = "a" | "b" | ...` em ORDEM. */
function unionStringLiterals(sf, typeName) {
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt)) continue;
    if (stmt.name.text !== typeName) continue;
    return collectUnionLiterals(stmt.type);
  }
  return null;
}

function collectUnionLiterals(typeNode) {
  const out = [];
  const walk = (n) => {
    if (ts.isUnionTypeNode(n)) {
      for (const t of n.types) walk(t);
      return;
    }
    if (ts.isLiteralTypeNode(n) && ts.isStringLiteralLike(n.literal)) {
      out.push(n.literal.text);
    }
  };
  walk(typeNode);
  return out;
}

/** Lê os string-literals de uma propriedade de interface cujo tipo é union
 *  (ex `magiaPanelView?: "school" | "arcana" | ...`). Mantém ORDEM da fonte. */
function interfaceMemberUnion(sf, interfaceName, memberName) {
  for (const stmt of sf.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue;
    if (stmt.name.text !== interfaceName) continue;
    for (const member of stmt.members) {
      if (
        ts.isPropertySignature(member) &&
        member.name.getText(sf).replace(/["']/g, "") === memberName &&
        member.type
      ) {
        return collectUnionLiterals(member.type);
      }
    }
  }
  return null;
}

// ── Núcleo do extrator ──────────────────────────────────────────────────────

export function extractInterativa({ pluginRoot }) {
  const gaps = [];
  const P = (...parts) => resolve(pluginRoot, ...parts);

  const fAtributos = P("src/render/modes/interativa/diamonds/diamond-atributos.ts");
  const fVida = P("src/render/modes/interativa/diamonds/diamond-vida.ts");
  const fMagias = P("src/render/modes/interativa/diamonds/diamond-magias.ts");
  const fExtras = P("src/render/modes/interativa/diamonds/diamond-extras.ts");
  const fMount = P("src/render/modes/interativa/mount-interativa.ts");
  const fRightPanel = P("src/render/modes/interativa/panel/right-panel.ts");
  const fRightState = P("src/render/modes/interativa/panel/right-panel-state.ts");
  const fVidaPanel = P("src/render/modes/interativa/panel/vida-panel.ts");
  const fExtrasPanel = P("src/render/modes/interativa/panel/extras-panel.ts");
  const fVidaSection = P("src/render/modes/interativa/tabs/tab-recursos/sections/vida.ts");
  const fStyles = P("styles.css");

  const sfAtr = parseSourceFile(fAtributos);
  const sfVida = parseSourceFile(fVida);
  const sfMagias = parseSourceFile(fMagias);
  const sfExtras = parseSourceFile(fExtras);
  const sfMount = parseSourceFile(fMount);
  const sfRightState = parseSourceFile(fRightState);
  const sfVidaPanel = parseSourceFile(fVidaPanel);
  const sfExtrasPanel = parseSourceFile(fExtrasPanel);

  // ── Cluster ATRIBUTOS ─────────────────────────────────────────────────────
  const resSpecs = arrayOfObjSpecs(findConstInitializer(sfAtr, "RESISTENCIA_SPECS"), sfAtr);
  const sentSpecs = arrayOfObjSpecs(findConstInitializer(sfAtr, "SENTIDO_SPECS"), sfAtr);
  const attrSpecs = arrayOfObjSpecs(findConstInitializer(sfAtr, "ATRIBUTO_SPECS"), sfAtr);
  const midSpecs = arrayOfObjSpecs(findConstInitializer(sfAtr, "MID_SPECS"), sfAtr);

  const epOf = (v) => (v && typeof v === "object" && v.__emojiPath ? v.__emojiPath : null);

  const atributosDiamonds = [];

  // 4 Resistências grandes. Só Defesa é clickable (isDefesaClickable),
  // abre o painel direito "defesa". As demais (Vigor/Reflexo/Ímpeto) são
  // read-only — mostram valor + breakdown no tooltip, sem onClick.
  // (diamond-atributos.ts RESISTENCIA_SPECS + loop linhas 425-477.)
  for (const s of resSpecs) {
    const clickable = s.isDefesaClickable === true;
    atributosDiamonds.push({
      label: s.nome ?? null,
      emojiPath: epOf(s.emoji),
      variant: "res",
      clickable,
      opensPanel: clickable ? "defesa" : null,
      states: {
        selected: clickable ? 'state.mode === "defesa"' : null,
        dim: null,
        disabled: null,
      },
      family: "all",
      ...(clickable ? {} : { notClickableReason: "resistência read-only (valor + breakdown via tooltip; sem onClick)" }),
    });
  }

  // 4 Atributos mini cross — clique → painel "attribute:<id>" (onModeChange
  // ("attribute", spec.id) linha 535). Selected quando mode=attribute && attr=id.
  for (const s of attrSpecs) {
    atributosDiamonds.push({
      label: s.title ?? null,
      emojiPath: epOf(s.emoji),
      variant: "attr",
      clickable: true,
      opensPanel: `attribute:${s.id}`,
      states: {
        selected: `state.mode === "attribute" && state.attr === "${s.id}"`,
        dim: null,
        disabled: null,
      },
      family: "all",
    });
  }

  // 4 Mid buttons (Ataques/Ofícios/Técnicas/Habilidades). Ofícios fica
  // is-disabled (não-clicável) em Monstro e CompanheiroAnimal
  // (isOficiosDisabled linha 578-580). Os demais sempre clicáveis.
  for (const s of midSpecs) {
    const isOficios = s.mode === "oficios";
    atributosDiamonds.push({
      label: s.title ?? null,
      emojiPath: epOf(s.emoji),
      variant: "mid",
      clickable: true,
      opensPanel: s.mode ?? null,
      states: {
        selected: `state.mode === "${s.mode}"`,
        dim: null,
        disabled: isOficios ? 'family === "Monstro" || family === "CompanheiroAnimal"' : null,
      },
      family: "all",
      ...(isOficios
        ? { notClickableReason: 'is-disabled (não-clicável) quando family === "Monstro" || family === "CompanheiroAnimal"' }
        : {}),
    });
  }

  // Creature badge — substitui Ofícios no slot POS_OFICIOS. Estático,
  // não-selecionável, não-clicável; emoji por família via FAMILY_EMOJI
  // (subcategoria.Heroi/Monstro/CompanheiroAnimal). (linhas 483-506.)
  const familyEmoji = readFamilyEmojiMap(sfAtr);
  atributosDiamonds.push({
    label: "Creature Badge",
    emojiPath: null,
    variant: "mini",
    clickable: false,
    opensPanel: null,
    states: { selected: null, dim: null, disabled: null },
    family: null,
    notClickableReason: "badge estático decorativo (emoji+cor por família; setSelected no-op)",
    familyEmojiPaths: familyEmoji,
  });

  // 2 Sentidos (Percepção/Intuição) — read-only, sem onClick (setSelected
  // no-op, sem isDefesaClickable). Valor signed + breakdown via tooltip.
  for (const s of sentSpecs) {
    atributosDiamonds.push({
      label: s.nome ?? null,
      emojiPath: epOf(s.emoji),
      variant: "sense",
      clickable: false,
      opensPanel: null,
      states: { selected: null, dim: null, disabled: null },
      family: "all",
      notClickableReason: "sentido read-only (valor signed + breakdown via tooltip; sem onClick)",
    });
  }

  // Movimento — mini 👣 clicável → painel "movimento" (onModeChange
  // ("movimento") linha 693). Tooltip lista tipos. (linhas 658-708.)
  const movEmoji = readMovimentoEmojiPath(sfAtr);
  atributosDiamonds.push({
    label: "Movimentos",
    emojiPath: movEmoji,
    variant: "mini",
    clickable: true,
    opensPanel: "movimento",
    states: { selected: null, dim: null, disabled: null },
    family: "all",
    notClickableReason: undefined,
  });
  // drop undefined notClickableReason
  for (const d of atributosDiamonds) if (d.notClickableReason === undefined) delete d.notClickableReason;

  // ── Cluster VIDA ──────────────────────────────────────────────────────────
  // O diamond-vida.ts monta SÓ o losango central; os 4 mini diamonds da
  // tríade (Recuperação/Condições) + os mirror (Anotações/Moedas) são
  // construídos em mount-interativa.ts via buildSideMini (linhas 492-552).
  const vidaDiamonds = [];
  // Losango Vida — clicável → sidebar Vida modo "vida"
  // (mount-interativa onClick linha 482 showVidaPanel("vida")).
  vidaDiamonds.push({
    label: "Vida",
    emojiPath: readVidaIconEmojiPath(sfVida),
    variant: "vida",
    // Procedência real: o losango é montado em diamond-vida.ts; os side-minis
    // abaixo vêm de mount-interativa.ts (buildSideMini) — daí `file` per-diamond.
    file: relPath(pluginRoot, fVida),
    clickable: true,
    opensPanel: "vida:vida",
    states: {
      selected: 'sidebar Vida mode === "vida"',
      dim: null,
      disabled: null,
    },
    family: "all",
  });
  // Os 4 side-minis — emoji + título + action lidos das chamadas buildSideMini.
  const sideMinis = readSideMinis(sfMount);
  for (const sm of sideMinis) {
    vidaDiamonds.push({
      label: sm.title,
      emojiPath: sm.emojiPath,
      variant: "side-mini",
      file: relPath(pluginRoot, fMount),
      clickable: true,
      opensPanel: sm.opensPanel,
      states: {
        selected: `${sm.opensPanel} ativo na sidebar compartilhada`,
        dim: sm.disabledCond,
        disabled: sm.disabledCond,
      },
      family: sm.familyCond,
      ...(sm.disabledCond ? { notClickableReason: `is-disabled quando ${sm.disabledCond}` } : {}),
    });
  }

  // ── Cluster MAGIAS ────────────────────────────────────────────────────────
  // 3 diamonds da Primária (SPECS) + 1 diamond Secundária (lógica própria).
  const magiaSpecArr = arrayOfObjSpecs(findConstInitializer(sfMagias, "SPECS"), sfMagias);
  const magiaText = readFileSync(fMagias, "utf8");
  const magiasDiamonds = [];
  for (const s of magiaSpecArr) {
    // disableWhenDim=true → quando isDim, vira is-disabled (não-clicável).
    const disableWhenDim = s.disableWhenDim === true;
    const profCond = magiaProfConditionFor(s.action, magiaText);
    magiasDiamonds.push({
      label: s.label ?? null,
      emojiPath: epOf(s.emoji),
      variant: "magic",
      // clickable = tem listener de click (estrutural). Os diamonds da Primária
      // (Tesouros/Arcana/Anima) têm addEventListener("click") INCONDICIONAL
      // (diamond-magias.ts:277), curto-circuitado em runtime pelo .is-disabled.
      // O gate de proficiência vai em states.disabled — não em clickable — pra
      // ficar consistente com Secundária (:321) e com Ofícios (cluster atributos).
      clickable: true,
      opensPanel: magiaView(s.action),
      states: {
        selected: magiaSelectedCond(s.action),
        dim: profCond ? `!(${profCond})` : "false",
        disabled: disableWhenDim ? (profCond ? `!(${profCond})` : null) : null,
      },
      family: "Heroi",
      ...(disableWhenDim && profCond
        ? { notClickableReason: `dim + is-disabled (não-clicável) quando !(${profCond})` }
        : {}),
    });
  }
  // Diamond Secundária (bottom) — dim+is-disabled quando NÃO há prof
  // secundária (hasAnyMagiaSecundariaProficiency, linha 303 + refresh 370).
  magiasDiamonds.push({
    label: readSecundariaTitle(magiaText),
    emojiPath: readSecundariaEmojiPath(sfMagias),
    variant: "magic",
    clickable: true,
    opensPanel: "magia:secundaria",
    states: {
      selected: 'state.magiaPanelView === "secundaria" || state.magiaPanelSource === "secundaria"',
      dim: "!hasAnyMagiaSecundariaProficiency(model)",
      disabled: "!hasAnyMagiaSecundariaProficiency(model)",
    },
    family: "Heroi",
    notClickableReason: "dim + is-disabled (não-clicável) quando !hasAnyMagiaSecundariaProficiency(model)",
  });

  // ── Cluster EXTRAS ────────────────────────────────────────────────────────
  // SPECS (Experiência/Anotações/Consumíveis/Moedas). Monstro: só
  // Consumíveis clicável; outros 3 ficam is-disabled (isExtrasDisabled
  // linha 158-161). CompanheiroAnimal NÃO monta o cluster (mount linha 573).
  const extrasSpecArr = arrayOfObjSpecs(findConstInitializer(sfExtras, "SPECS"), sfExtras);
  const extrasDiamonds = [];
  for (const s of extrasSpecArr) {
    const alwaysOn = s.action === "consumiveis";
    extrasDiamonds.push({
      label: s.label ?? null,
      emojiPath: epOf(s.emoji),
      variant: "extras",
      clickable: true,
      opensPanel: `extras:${s.action}`,
      states: {
        selected: `extras-panel mode === "${s.action}"`,
        dim: null,
        disabled: alwaysOn ? null : 'family === "Monstro"',
      },
      family: null, // cluster montado p/ Heroi+Monstro; CA não monta
      ...(alwaysOn ? {} : { notClickableReason: 'is-disabled quando family === "Monstro" (só Consumíveis acessível)' }),
    });
  }

  const clusters = [
    {
      key: "vida",
      name: "Vida",
      file: relPath(pluginRoot, fVida),
      diamonds: vidaDiamonds,
    },
    {
      key: "atributos",
      name: "Atributos",
      file: relPath(pluginRoot, fAtributos),
      diamonds: atributosDiamonds,
    },
    {
      key: "magias",
      name: "Magias",
      file: relPath(pluginRoot, fMagias),
      diamonds: magiasDiamonds,
    },
    {
      key: "extras",
      name: "Extras",
      file: relPath(pluginRoot, fExtras),
      diamonds: extrasDiamonds,
    },
  ];

  // ── panelModes ────────────────────────────────────────────────────────────
  const rightModes = unionStringLiterals(sfRightState, "RightPanelMode");
  if (!rightModes) gaps.push("panelModes.right (union RightPanelMode não encontrado)");
  const vidaModes = unionStringLiterals(sfVidaPanel, "VidaSidebarMode");
  if (!vidaModes) gaps.push("panelModes.vida (union VidaSidebarMode não encontrado)");
  const extrasModes = unionStringLiterals(sfExtras, "ExtrasAction");
  if (!extrasModes) gaps.push("panelModes.extras (union ExtrasAction não encontrado)");
  const magiaViews = interfaceMemberUnion(sfRightState, "RightPanelState", "magiaPanelView");
  if (!magiaViews) gaps.push("panelModes.magias (magiaPanelView não encontrado)");

  const panelModes = {
    right: rightModes ?? [],
    vida: vidaModes ?? [],
    extras: extrasModes ?? [],
    magias: magiaViews ?? [],
  };

  // ── emPills ───────────────────────────────────────────────────────────────
  // appendEmPillsToTitle (right-panel.ts) planta as pills no TÍTULO do painel
  // Magia; "tesouros" retorna cedo (sem pills). Primária 🔷 / Secundária 🔶.
  const emPills = {
    pills: [
      {
        label: "Primária",
        emojiPath: "subcategoria.EnergiaMagica",
        fonte: "primaria",
      },
      {
        label: "Secundária",
        emojiPath: "subcategoria.EnergiaMagicaSecundaria",
        fonte: "secundaria",
      },
    ],
    whereShown: "título do painel Magia (mountMagiaPanel.appendEmPillsToTitle) — views school/arcana usam Primária; view secundaria usa Secundária",
    behavior:
      'view "tesouros" → return (sem pills); pills renderizadas via renderEmTogglePills (N pílulas toggle on🔷/🔶 off🔘); só aparecem quando baseEm > 0',
  };
  // Verificação: confirma na fonte que tesouros não mostra pill e os emojis.
  const rpText = readFileSync(fRightPanel, "utf8");
  if (!/if \(view === "tesouros"\) return;/.test(rpText)) {
    gaps.push("emPills.behavior (guard tesouros->return não confirmado em right-panel.ts)");
  }

  // ── vidaNumber ────────────────────────────────────────────────────────────
  // Número central do losango = vit + (moral se showMoral) + (moralTemp>0).
  // Prefixo de morte 💀 quando vit <= -maxVit. (diamond-vida.ts linhas 246-251.)
  const vidaText = readFileSync(fVida, "utf8");
  const showMoralCond = /const showMoral = family !== "Monstro";/.test(vidaText)
    ? 'family !== "Monstro"'
    : null;
  if (!showMoralCond) gaps.push("vidaNumber.fills showMoral (definição não encontrada)");
  const rockBottomCond = /maxVit > 0 && vitalidade <= -maxVit/.test(vidaText)
    ? "maxVit > 0 && vitalidade <= -maxVit"
    : null;
  if (!rockBottomCond) gaps.push("vidaNumber.mortoPrefix (cond rock-bottom não encontrada)");
  const mortoEmojiPath = /EMOJI\.combatTracker\.Morto/.test(vidaText) ? "combatTracker.Morto" : null;
  if (!mortoEmojiPath) gaps.push("vidaNumber.mortoPrefix emojiPath (EMOJI.combatTracker.Morto não encontrado)");
  const maxVitLineCond = /showMoral && maxVit > 0 && vitalidade < maxVit/.test(vidaText)
    ? "showMoral && maxVit > 0 && vitalidade < maxVit"
    : null;
  if (!maxVitLineCond) gaps.push("vidaNumber.maxVitLine (cond da linha pontilhada não encontrada)");

  const vidaNumber = {
    formula: "vitalidade + (showMoral ? moral : 0) + (moralTemporaria > 0 ? moralTemporaria : 0)",
    fills: [
      { key: "vit", colorPath: "interativaResource.Vitalidade", cssClass: "dv-vida-fill--vit" },
      {
        key: "moral",
        colorPath: "interativaResource.Moral",
        cssClass: "dv-vida-fill--moral",
        condition: showMoralCond ? `showMoral (${showMoralCond})` : null,
      },
      { key: "tempMoral", colorPath: "interativaResource.MoralTemporaria", cssClass: "dv-vida-fill--temp", condition: "moralTemporaria > 0" },
      { key: "neg1", colorPath: null, cssClass: "dv-vida-fill--neg1", condition: "vitalidade < 0 (0→-max/2, roxa)" },
      { key: "neg2", colorPath: null, cssClass: "dv-vida-fill--neg2", condition: "vitalidade < 0 (-max/2→-max, cinza)" },
    ],
    maxVitLine: maxVitLineCond,
    mortoPrefix: {
      condition: rockBottomCond,
      emojiPath: mortoEmojiPath,
    },
  };

  // ── hiddenTabsV2 ──────────────────────────────────────────────────────────
  // O cutover v2 (`is-v2-only`) esconde o tab-master inteiro via CSS, mas
  // ele continua MONTADO (save/dirty/autoSave). INTERATIVA_TAB_IDS lista as
  // abas ainda montadas. (mount-interativa.ts:72 + styles.css:9233-9236.)
  const cssRule = readV2HiddenCssRule(fStyles);
  if (!cssRule) gaps.push("hiddenTabsV2.cssRule (regra .is-v2-only > .dvjs-tabs-master não encontrada)");
  const tabIds = readTabIds(sfMount);
  if (!tabIds || tabIds.length === 0) gaps.push("hiddenTabsV2 (INTERATIVA_TAB_IDS não encontrado)");

  // Metadados por aba lidos dos makeSpec (label + staticEmoji) no mount.
  const tabMeta = readTabSpecMeta(sfMount);
  // Mapa de migração v2 — cada aba legacy migrou pro respectivo cluster v2.
  const MIGRATED_TO = {
    recursos: "cluster Vida (counters/dano/Escudo) + painel direito (Condições/Recuperação) + cluster Extras",
    inventario: "cluster Extras (Consumíveis) + painel Magia (Tesouros) — aba 'Acesso Rápido' no Heroi",
    anotacoes: "cluster Extras (Anotações)",
  };
  const hiddenTabsV2 = (tabIds ?? []).map((id) => {
    const meta = tabMeta[id] ?? null;
    if (!meta) gaps.push(`hiddenTabsV2.${id} (spec não encontrado — sem label/emoji)`);
    return {
      name: meta ? meta.label : null,
      tabId: id,
      emojiPath: meta ? meta.emojiPath : null,
      cssRule: cssRule,
      stillMounted: true,
      migratedTo: MIGRATED_TO[id] ?? null,
    };
  });

  // ── counters ──────────────────────────────────────────────────────────────
  // resourceCounter é genérico; os counters concretos (Vit/Moral/Temp) +
  // o cascade do decremento nascem em sections/vida.ts mountVidaSection.
  const counters = readVidaCounters(fVidaSection);
  if (counters.length === 0) gaps.push("counters (Vit/Moral/Temp não extraídos de sections/vida.ts)");

  return {
    clusters,
    panelModes,
    emPills,
    vidaNumber,
    hiddenTabsV2,
    counters,
    gaps,
  };
}

// ── Leitores específicos ─────────────────────────────────────────────────────

function relPath(root, abs) {
  const r = resolve(root);
  return abs.startsWith(r) ? abs.slice(r.length).replace(/^[/\\]/, "") : abs;
}

function readFamilyEmojiMap(sf) {
  // FAMILY_EMOJI: Record<SheetFamily, string> = { Heroi: EMOJI..., ... }
  const init = findConstInitializer(sf, "FAMILY_EMOJI");
  if (!init) return null;
  const obj = unwrapExpr(init);
  if (!ts.isObjectLiteralExpression(obj)) return null;
  const out = {};
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf).replace(/["']/g, "");
    out[key] = emojiPathFromNode(prop.initializer, sf);
  }
  return out;
}

function readMovimentoEmojiPath(sf) {
  // Diamond movimento usa `icon: EMOJI.subcategoria.Movimento`.
  const txt = sf.getFullText();
  return /EMOJI\.subcategoria\.Movimento/.test(txt) ? "subcategoria.Movimento" : null;
}

function readVidaIconEmojiPath(sf) {
  // dv-vida-icon usa EMOJI.subcategoria.Vitalidade.
  const txt = sf.getFullText();
  return /text:\s*EMOJI\.subcategoria\.Vitalidade/.test(txt) ? "subcategoria.Vitalidade" : null;
}

function readSecundariaEmojiPath(sf) {
  const txt = sf.getFullText();
  return /icon:\s*EMOJI\.escola\.Secundaria/.test(txt) ? "escola.Secundaria" : null;
}

function readSecundariaTitle(text) {
  // secHandle = diamond({ icon: EMOJI.escola.Secundaria, ... title: "Magia Secundária" })
  const m = text.match(/icon:\s*EMOJI\.escola\.Secundaria[\s\S]*?title:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

/** mapeia MagiaAction → opensPanel (magiaPanelView resultante). */
function magiaView(action) {
  switch (action) {
    case "tesouros": return "magia:tesouros";
    case "arcana": return "magia:arcana";
    case "anima": return "magia:school(Anima)";
    case "secundaria": return "magia:secundaria";
    default: return action ? `magia:${action}` : null;
  }
}

function magiaSelectedCond(action) {
  switch (action) {
    case "tesouros": return 'state.magiaPanelView === "tesouros"';
    case "arcana": return 'state.magiaPanelView === "arcana"';
    case "anima": return 'state.magiaPanelView === "school" && state.activeSchool === "Anima"';
    case "secundaria": return 'state.magiaPanelView === "secundaria"';
    default: return null;
  }
}

/** Condição de proficiência por action lida da fonte do diamond-magias
 *  (isDim usa hasPrimariaProf(...) / hasAnyMagiaSecundariaProficiency).
 *  Retorna a expressão de "TEM proficiência" (positiva) ou null. */
function magiaProfConditionFor(action, text) {
  if (action === "tesouros") return null; // sempre clicável, isDim:()=>false
  if (action === "arcana") {
    return /isDim:\s*\(m\)\s*=>\s*!hasPrimariaProf\(m,\s*\["ArcanaBranca",\s*"ArcanaNegra"\]\)/.test(text)
      ? 'hasPrimariaProf(model, ["ArcanaBranca","ArcanaNegra"])'
      : null;
  }
  if (action === "anima") {
    return /isDim:\s*\(m\)\s*=>\s*!hasPrimariaProf\(m,\s*\["Anima"\]\)/.test(text)
      ? 'hasPrimariaProf(model, ["Anima"])'
      : null;
  }
  return null;
}

/** Lê as chamadas buildSideMini(...) do mount-interativa pra obter os 4
 *  mini diamonds da Vida (Recuperação/Condições/Anotações/Moedas). */
function readSideMinis(sf) {
  const out = [];
  const text = sf.getFullText();
  // Cada chamada: buildSideMini( EMOJI.x.Y, "Title", "role", () => show...(...), <famCond?> )
  // Captura via varredura de CallExpression p/ robustez (args podem quebrar linha).
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "buildSideMini"
    ) {
      const args = node.arguments;
      const emojiPath = emojiPathFromNode(args[0], sf);
      const title = args[1] && ts.isStringLiteralLike(args[1]) ? args[1].text : null;
      const role = args[2] && ts.isStringLiteralLike(args[2]) ? args[2].text : null;
      // arg[3] = arrow chamando showVidaPanel("x") ou showExtrasPanel("x").
      let opensPanel = null;
      if (args[3]) {
        const bodyTxt = args[3].getText(sf);
        const mv = bodyTxt.match(/showVidaPanel\("([^"]+)"\)/);
        const me = bodyTxt.match(/showExtrasPanel\("([^"]+)"\)/);
        if (mv) opensPanel = `vida:${mv[1]}`;
        else if (me) opensPanel = `extras:${me[1]}`;
      }
      // arg[4] = condição de disabled (opcional). Pode ser `family === "Monstro"`.
      let disabledCond = null;
      let familyCond = "all";
      if (args[4]) {
        disabledCond = args[4].getText(sf).trim();
        // Mini Anotações/Moedas só são montados p/ Heroi||Monstro; quando
        // montados, disabled em Monstro. Recuperação idem. Condições nunca.
        familyCond = null; // montagem condicional — não é "all"
      }
      out.push({ emojiPath, title, role, opensPanel, disabledCond, familyCond });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Garantia de ordem visual estável: a ordem de inserção no DOM é
  // [Recuperação(insertBefore firstChild), Anotações, Moedas, Condições].
  // Mantemos a ordem de DECLARAÇÃO das chamadas (que é a ordem em que os
  // handles existem); a ordem visual exata é detalhe de layout. Para
  // determinismo + cobertura, ordenamos por role conhecido.
  const ROLE_ORDER = ["recuperacao", "condicoes", "extras-anotacoes", "extras-moedas"];
  out.sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.role);
    const ib = ROLE_ORDER.indexOf(b.role);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return out;
}

function readV2HiddenCssRule(stylesPath) {
  const css = readFileSync(stylesPath, "utf8");
  // Acha o seletor + bloco que contém `.is-v2-only > .dvjs-tabs-master`.
  const idx = css.indexOf(".interativa-shell.is-v2-only > .dvjs-tabs-master");
  if (idx < 0) return null;
  // Recua até o início do grupo de seletores (após o ; ou } ou */ anterior).
  let start = idx;
  for (let i = idx; i >= 0; i--) {
    const ch = css[i];
    if (ch === "}" || ch === "/") { start = i + 1; break; }
    if (i === 0) start = 0;
  }
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  const rule = css.slice(start, close + 1).trim();
  // Normaliza whitespace interno mantendo o conteúdo verbatim semântico.
  return rule.replace(/\s+/g, " ").trim();
}

function readTabIds(sf) {
  // export const INTERATIVA_TAB_IDS = ["recursos","inventario","anotacoes"] as const;
  const init = findConstInitializer(sf, "INTERATIVA_TAB_IDS");
  if (!init) return null;
  const arr = unwrapExpr(init);
  if (!ts.isArrayLiteralExpression(arr)) return null;
  return arr.elements
    .filter((e) => ts.isStringLiteralLike(e))
    .map((e) => e.text);
}

/** Lê label + staticEmoji de cada makeSpec(...) / inventarioSpec no mount.
 *  Retorna { tabId: { label, emojiPath } }. Inventário tem label/emoji
 *  condicionais por família (Heroi='Acesso Rápido'+AcessoRapido). */
function readTabSpecMeta(sf) {
  const out = {};
  const text = sf.getFullText();

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "makeSpec"
    ) {
      const args = node.arguments;
      // makeSpec(id, label, staticEmoji, mounter, getEmoji?)
      const id = args[0] && ts.isStringLiteralLike(args[0]) ? args[0].text : null;
      const label = args[1] && ts.isStringLiteralLike(args[1]) ? args[1].text : null;
      const emojiPath = args[2] ? emojiPathFromNode(args[2], sf) : null;
      if (id) {
        out[id] = {
          label: label,
          emojiPath: emojiPath,
        };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Inventário: makeSpec recebe variáveis (inventarioLabel/inventarioEmoji),
  // não literais. Resolve o ramo Heroi a partir das declarações.
  if (out.inventario && (out.inventario.label === null || out.inventario.emojiPath === null)) {
    const labelHeroi = text.match(/const inventarioLabel = family === "Heroi" \? "([^"]+)"/);
    const emojiHeroi = text.match(/const inventarioEmoji = family === "Heroi" \? (EMOJI\.[A-Za-z0-9_.]+)/);
    out.inventario.label = labelHeroi ? labelHeroi[1] : out.inventario.label;
    if (emojiHeroi) {
      const m = emojiHeroi[1].match(/^EMOJI\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
      out.inventario.emojiPath = m ? `${m[1]}.${m[2]}` : out.inventario.emojiPath;
    }
  }
  return out;
}

/** Lê os 3 counters concretos (Vit/Moral/Temp) + o cascade do decremento
 *  de sections/vida.ts. Cada resourceCounter({...}) traz label/colorTone/
 *  steps; cruzamos colorTone→colorPath via PALETTE.interativaResource. */
function readVidaCounters(vidaSectionPath) {
  const sf = parseSourceFile(vidaSectionPath);
  const text = readFileSync(vidaSectionPath, "utf8");
  const out = [];

  // Mapa colorTone → colorPath (paleta usada nas BARS — addBar usa
  // PALETTE.interativaResource.<X>; o counter usa colorTone="red"/"blue"/
  // "green" que correspondem 1:1 às mesmas cores).
  const TONE_TO_PATH = {
    red: "interativaResource.Vitalidade",
    blue: "interativaResource.Moral",
    green: "interativaResource.MoralTemporaria",
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "resourceCounter"
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const spec = objToSpec(arg, sf);
        const resource = typeof spec.label === "string" ? spec.label : null;
        const colorTone = typeof spec.colorTone === "string" ? spec.colorTone : null;
        const steps = readSteps(arg, sf);
        out.push({
          resource,
          colorPath: colorTone ? (TONE_TO_PATH[colorTone] ?? null) : null,
          colorTone,
          steps,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Cascade do decremento-vida (dmgRow): temp → moral → vida. Confirma na
  // fonte e anexa como counter "decremento-vida".
  const hasCascade =
    /state\.moralTemporaria -= useTemp/.test(text) &&
    /state\.moral -= useMoral/.test(text) &&
    /state\.vitalidade = Math\.max\(vitFloor, state\.vitalidade - r\)/.test(text);
  // steps dos botões de dano (`for (const dmg of [1, 5, 10])`).
  const dmgStepsMatch = text.match(/for \(const dmg of \[([0-9,\s]+)\]\)/);
  const dmgSteps = dmgStepsMatch
    ? dmgStepsMatch[1].split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    : null;
  out.push({
    resource: "decremento-vida",
    colorPath: null,
    colorTone: null,
    steps: dmgSteps,
    cascadeDamage: hasCascade ? "temp → moral → vida (vitFloor = allowNegativeVit ? -baseVit : 0)" : null,
  });

  return out;
}

/** Lê stepsInc/stepsDec de um object-literal de resourceCounter. Quando
 *  ausentes, o widget aplica DEFAULT_STEPS [1,5,10] — devolvemos esse
 *  default explicitando a fonte. */
function readSteps(objNode, sf) {
  const readArr = (propName) => {
    for (const prop of objNode.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (prop.name.getText(sf).replace(/["']/g, "") !== propName) continue;
      const arr = unwrapExpr(prop.initializer);
      if (ts.isArrayLiteralExpression(arr)) {
        return arr.elements
          .filter((e) => ts.isNumericLiteral(unwrapExpr(e)))
          .map((e) => Number(unwrapExpr(e).text));
      }
    }
    return null;
  };
  const inc = readArr("stepsInc");
  const dec = readArr("stepsDec");
  return {
    inc: inc ?? [1, 5, 10],
    dec: dec ?? [1, 5, 10],
    incFromDefault: inc === null,
    decFromDefault: dec === null,
  };
}
