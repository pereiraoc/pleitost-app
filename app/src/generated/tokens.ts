/* GERADO por app/scripts/gen-tokens.mjs a partir de design-system/design-system.json — NÃO EDITAR À MÃO.
   Fonte: plugin pleitost-autosheet @ 339a0e77eb9c8d5a954bcbb54740d3f06a787741 */

/** Espelho 1:1 de design-system.json → tokens (registro central; nunca hardcodar no call-site). */
export const tokens = {
  "colors": {
    "aventureiro": {
      "MarcaPreenchida": "#ffd35a",
      "MarcaVazia": "var(--background-secondary)",
      "Maximo": "#4ade80",
      "ReconhecFill": "#ffb300"
    },
    "biografia": {
      "NegativaBorderDark": "rgba(220,80,80,0.30)",
      "NegativaBorderFcsDark": "rgba(220,80,80,0.55)",
      "NegativaBorderFcsLight": "rgba(180,40,40,0.85)",
      "NegativaBorderLight": "rgba(180,40,40,0.55)",
      "NegativaLabelDark": "rgba(220,80,80,0.70)",
      "NegativaLabelLight": "rgba(180,40,40,0.95)",
      "PositivaBorderDark": "rgba(255,211,90,0.30)",
      "PositivaBorderFcsDark": "rgba(255,211,90,0.55)",
      "PositivaBorderFcsLight": "rgba(150,110,0,0.85)",
      "PositivaBorderLight": "rgba(150,110,0,0.55)",
      "PositivaLabelDark": "rgba(255,211,90,0.70)",
      "PositivaLabelLight": "rgba(150,110,0,0.95)"
    },
    "diff": {
      "AutoBg": "rgba(255,211,90,0.12)",
      "ConflictBg": "rgba(255,77,77,0.15)",
      "InvalidatedBg": "rgba(168,85,247,0.12)",
      "ManualBg": "rgba(59,130,246,0.12)"
    },
    "feedback": {
      "Aviso": "#ffd35a",
      "Down": "#ff4d4d",
      "Erro": "#ff4d4d",
      "Info": "#3b82f6",
      "Sucesso": "#4ade80",
      "Up": "#ffd35a"
    },
    "interativaBtn": {
      "DmgBg": "#313334",
      "DmgBgActive": "#202121",
      "DmgBgHover": "#434748",
      "EmDec": "rgba(6, 182, 212, 0.30)",
      "EmInc": "rgba(6, 182, 212, 0.95)",
      "MoralDec": "rgba(59, 130, 246, 0.30)",
      "MoralInc": "rgba(59, 130, 246, 0.95)",
      "TempDec": "rgba(34, 197, 94, 0.30)",
      "TempInc": "rgba(34, 197, 94, 0.95)",
      "VitDec": "rgba(239, 68, 68, 0.30)",
      "VitInc": "rgba(239, 68, 68, 0.95)"
    },
    "interativaCond": {
      "Bonus": "#22c55e",
      "Penalty": "#ef4444"
    },
    "interativaResource": {
      "Moral": "#4488ff",
      "MoralTemporaria": "#44cc44",
      "Vitalidade": "#ff4444"
    },
    "interativaTone": {
      "AttrAccent": "#c23b3b",
      "DimAccent": "#d6d6d6",
      "JobAccent": "#d6d6d6",
      "MagicAccent": "#7a3cff",
      "MidAccent": "#2f7df6",
      "PotAccent": "#60748c",
      "ResAccent": "#c8a93a",
      "SenseAccent": "#2f9e6a"
    },
    "partyBountyRank": {
      "ABg": "rgba(212,175,55,0.14)",
      "AColor": "#d4af37",
      "AGlow": "rgba(212,175,55,0.28)",
      "BBg": "rgba(148,163,184,0.16)",
      "BColor": "#94a3b8",
      "BGlow": "rgba(148,163,184,0.24)",
      "CBg": "rgba(205,127,50,0.14)",
      "CColor": "#cd7f32",
      "CGlow": "rgba(205,127,50,0.22)",
      "DBg": "rgba(107,114,128,0.12)",
      "DColor": "#6b7280",
      "DGlow": "rgba(107,114,128,0.15)",
      "SBg": "rgba(143,211,255,0.14)",
      "SColor": "#8fd3ff",
      "SGlow": "rgba(143,211,255,0.30)"
    },
    "partyRoles": {
      "Abatedor": "#f87171",
      "Controlador": "#c084fc",
      "Lider": "#4ade80",
      "Vanguarda": "#60a5fa"
    },
    "partyTierBar": {
      "Tier1": "#cd7f32",
      "Tier2": "#94a3b8",
      "Tier3": "#d4af37",
      "Tier4": "#8fd3ff"
    },
    "rank": {
      "A": "#4ade80",
      "E": "#3b82f6",
      "M": "#a855f7",
      "N": "#6b7280"
    },
    "selecao": {
      "BinP": "rgb(34,197,94)",
      "BinPBg": "rgba(34,197,94,0.16)",
      "BinPLine": "rgba(34,197,94,0.55)",
      "NeutroBg": "rgba(120,120,120,0.18)",
      "NeutroLine": "rgba(160,160,160,0.55)",
      "Regra": "#d4a520",
      "RegraBg": "rgba(255,211,90,0.22)",
      "RegraDim": "rgba(255,211,90,0.35)",
      "RegraLine": "rgba(255,211,90,0.65)",
      "SlotBg": "rgba(0,0,0,0.4)",
      "SlotLine": "rgba(220,38,38,0.6)",
      "UserSel": "rgb(220,38,38)",
      "UserSelBg": "rgba(220,38,38,0.18)",
      "UserSelLine": "rgba(220,38,38,0.50)",
      "Usuario": "#ffd35a"
    },
    "shadow": {
      "Tooltip": "0 12px 28px rgba(0,0,0,0.30)"
    },
    "theme": {
      "BgModHover": "var(--background-modifier-hover)",
      "BgPrimary": "var(--background-primary)",
      "BgSecondary": "var(--background-secondary)",
      "BorderNormal": "var(--background-modifier-border)",
      "TextFaint": "var(--text-faint)",
      "TextMuted": "var(--text-muted)",
      "TextNormal": "var(--text-normal)"
    },
    "tier": {
      "BgDiamond": "#1c1f24",
      "Bronze": "#b87333",
      "Gold": "#d4af37",
      "Num": "#ffffff",
      "Platina": "#8fd3ff",
      "Silver": "#bfc6cf",
      "Zero": "#111111"
    }
  },
  "emojiCostExtra": {
    "Empty": "▫️",
    "Fallback": "🔢",
    "Livre": "🆓",
    "Reacao": "↩️",
    "digits": {
      "0": "0️⃣",
      "1": "1️⃣",
      "2": "2️⃣",
      "3": "3️⃣",
      "4": "4️⃣",
      "5": "5️⃣",
      "6": "6️⃣",
      "7": "7️⃣",
      "8": "8️⃣",
      "9": "9️⃣"
    }
  },
  "emojis": {
    "atributo": {
      "AGI": "💨",
      "FOR": "💪",
      "INT": "🧠",
      "PRE": "🗣️"
    },
    "aventureiro": {
      "Deletar": "🗑️",
      "Legado": "🧿",
      "Marca": "💠",
      "Maximo": "❇️",
      "Reconhecimento": "🟨",
      "Vazio": "▫️"
    },
    "biografia": {
      "Altura": "📏",
      "Defeitos": "⚓",
      "Desprezos": "🚫",
      "Genero": "⚧️",
      "Idade": "🎂",
      "Ideais": "🔱",
      "Motivacao": "🧭",
      "Naturalidade": "🏞️",
      "Peso": "⚖️",
      "Qualidades": "🏆"
    },
    "bolinha": {
      "Bullet": "•",
      "Cheia": "⚪",
      "Vazia": "⚫"
    },
    "bonus": {
      "Item": "🎒"
    },
    "bonusType": {
      "Circunstancia": "💫",
      "Condicao": "🌟",
      "Especializacao": "⭐",
      "Item": "💍",
      "Unico": "🌟"
    },
    "categoria": {
      "Classe": "👑",
      "Consumivel": "🧪",
      "Habilidade": "📕",
      "Intuicao": "💡",
      "Percepcao": "👁️",
      "Tecnica": "📘"
    },
    "combatTracker": {
      "Adiado": "⌛",
      "AdicionarSessao": "🔗",
      "Aguardar": "🕒",
      "Anterior": "⏮️",
      "Defesa": "🛡️",
      "DragHandle": "☰",
      "Evasao": "⚡",
      "Filter": "🔎",
      "ForaIniciativa": "🟡",
      "Generico": "🧍",
      "IdentidadeOculta": "❓",
      "IdentidadeRevelada": "❗",
      "Impeto": "🔥",
      "Iniciar": "⚔️",
      "Intuicao": "💡",
      "Limpar": "🧹",
      "Morto": "💀",
      "Parar": "🛑",
      "Proximo": "⏭️",
      "Remover": "✕",
      "SelectArrow": "▾",
      "SetaBaixo": "▼",
      "SetaCima": "▲",
      "TurnoAtual": "👉"
    },
    "combate": {
      "Ataque": "🥊"
    },
    "condicaoOverride": {
      "Vantagem de Combate": "⚔️"
    },
    "custo": {
      "1A": "1️⃣",
      "2A": "2️⃣",
      "3A": "3️⃣",
      "L": "0️⃣",
      "Min": "⏲",
      "P": "🅿️",
      "R": "↩️"
    },
    "defesa": {
      "Defesa": "🛡️",
      "Impeto": "🔥",
      "Reflexo": "⚡",
      "Vigor": "❤️"
    },
    "delta": {
      "Base": "●",
      "Down1": "▼",
      "Down2": "⏬",
      "Up1": "▲",
      "Up2": "⏫",
      "Up3": "👑",
      "Zero": "⦰"
    },
    "diff": {
      "Add": "➕",
      "Auto": "⚙️",
      "Change": "✏️",
      "Demo": "🔻",
      "Escolha": "🎯",
      "Invalidado": "❌",
      "Manual": "📝",
      "Promo": "🔼",
      "Remove": "➖"
    },
    "dificuldade": {
      "Dificil": "🟠",
      "Facil": "🟢",
      "Letal": "🔴",
      "Trivial": "🔵"
    },
    "elemento": {
      "Agua": "💧",
      "Cura": "💚",
      "Eterico": "🌀",
      "Fogo": "🔥",
      "Frio": "❄️",
      "Terra": "🌿",
      "Trovao": "⚡",
      "Veneno": "🧪",
      "Vento": "🌪️"
    },
    "equipProf": {
      "Armadura": "🥋",
      "ArmasMarciais": "🗡️",
      "ArmasSimples": "⚔️",
      "Escudo": "🛡️"
    },
    "escola": {
      "Anima": "☄️",
      "Arcana": "🌗",
      "Branca": "✨",
      "Especial": "🌟",
      "Essencial": "☄️",
      "Negra": "🔮",
      "Secundaria": "🌀"
    },
    "glyph": {
      "Arrow": "→",
      "Bolt": "⚡",
      "Bullet": "◆",
      "Check": "✓",
      "ChevronDown": "▾",
      "DeltaTri": "△",
      "DownMark": "▼",
      "EditMark": "●",
      "GoldCoin": "🪙",
      "LevelDown": "▼",
      "LevelStar": "⭐",
      "LevelUp": "▲",
      "MinusMark": "−",
      "MoneyBag": "💰",
      "PartyGroup": "👥",
      "PlusMark": "+",
      "SpellMinus": "−",
      "SpellRule": "●",
      "Star": "★",
      "StarEmpty": "☆",
      "UpMark": "▲",
      "Warning": "⚠️"
    },
    "grupoArma": {
      "CaCMarcial": "⚔️",
      "CaCSimples": "🗡️",
      "DistMarcial": "🏹",
      "DistSimples": "🪃",
      "Especial": "🌟",
      "Natural": "🐾"
    },
    "inv": {
      "AdicionarArma": "➕",
      "Dureza": "🪨",
      "Equipamentos": "⚔️",
      "Moeda": "🪙",
      "Reverter": "↩️",
      "TesouroEspecial": "💎"
    },
    "modo": {
      "Editavel": "📝",
      "Interativa": "🎲",
      "Leitura": "📖",
      "Resumo": "🪪"
    },
    "partyEquip": {
      "ArmadurasLeves": "👕",
      "ArmadurasPesadas": "🛡️",
      "ArmasMarciais": "⚔️",
      "Escudos": "🔰"
    },
    "perfil": {
      "Atributos": "⚖️",
      "Atuacao": "🗣️",
      "Classe": "👑",
      "OficioPassado": "🧠",
      "OficioPassadoCampo": "⚒️",
      "Passado": "📝",
      "PassadoSecao": "📖",
      "PericiaPassado": "🎓",
      "Raca": "🧬",
      "Sintonia": "☄️",
      "Subclasse": "📘",
      "TextoOficio": "📋",
      "Tipo": "🐾",
      "Tutor": "👤"
    },
    "pericia": {
      "Acrobacia": "💨",
      "Anima": "🗣️",
      "Arcana": "🧠",
      "Atletismo": "💪",
      "Diplomacia": "🗣️",
      "Enganacao": "🗣️",
      "Furtividade": "💨",
      "Guerra": "🧠",
      "Intimidacao": "🗣️",
      "Ladinagem": "💨",
      "Medicina": "🧠",
      "Sobrevivencia": "🧠",
      "Sociedades": "🧠"
    },
    "pocao": {
      "Cooldown": "⌛",
      "Pronto": "🟢"
    },
    "propriedadeImbuicao": {
      "Arcano": "✨",
      "Fogo": "🔥",
      "Qualidade": "💎",
      "Terra": "🌿",
      "Vento": "🌪️",
      "Água": "💧"
    },
    "sintonia": {
      "Agua": "💧",
      "Fogo": "🔥",
      "Terra": "🌿",
      "Vento": "🌪️"
    },
    "subcategoria": {
      "Armadura": "🥋",
      "AtivadoAuto": "🔗",
      "Atributo": "⚖️",
      "Bonus": "⏫",
      "CD": "🎯",
      "Capital": "🏛️",
      "CargaStatusOn": "🔵",
      "CompanheiroAnimal": "🐾",
      "Condicao": "💫",
      "DanoEscudo": "✖️",
      "Descansar": "⌛",
      "Dormir": "💤",
      "EfeitoInterativo": "🌟",
      "EnergiaMagica": "🔷",
      "EnergiaMagicaSecundaria": "🔶",
      "Escudo": "🛡️",
      "Especializacao": "🎖️",
      "GrandeCidade": "🏰",
      "Heroi": "👤",
      "Monstro": "👹",
      "Moral": "💙",
      "MoralTemporaria": "💚",
      "Movimento": "👣",
      "Nacao": "🏳️",
      "Oficio": "⚒️",
      "Passado": "📖",
      "Penalidade": "⏬",
      "PequenaCidade": "🏘️",
      "Pericia": "🧠",
      "PotenciaMagica": "🌟",
      "Proficiencia": "🎓",
      "Propriedade": "💎",
      "Raca": "🧬",
      "Regiao": "🗺️",
      "RepararEscudo": "🔨",
      "Sangue": "🩸",
      "SlotMagia": "🔷",
      "Tesouro": "💍",
      "UsoConsumir": "🔘",
      "UsoRestaurar": "🟢",
      "UsoStatusOn": "🟢",
      "Vitalidade": "❤️"
    },
    "tabHeroi": {
      "Anotacoes": "🪶",
      "HabilidadesTecnicas": "📕",
      "Inventario": "🎒",
      "Magias": "🪄",
      "Perfil": "👤",
      "Proficiencias": "🎓"
    },
    "tabInterativa": {
      "AcessoRapido": "✋",
      "Anotacoes": "🪶",
      "Companheiros": "🤝",
      "Experiencia": "💠",
      "Inventario": "🎒",
      "Recursos": "⚔️"
    },
    "tier": {
      "Bronze": "🥉",
      "Gold": "🥇",
      "Platina": "🏅",
      "Silver": "🥈"
    },
    "tipoDano": {
      "Contusao": "💥",
      "Corte": "🔪",
      "Perfuracao": "🪡"
    },
    "tooltip": {
      "Atributo": "⚖️",
      "Base": "●",
      "Bonus": "⏫",
      "Especializacao": "⭐",
      "HeaderAtaque": "🥊",
      "HeaderMagia": "🌟",
      "HeaderManobra": "💪",
      "HeaderMovimento": "👣",
      "HeaderOficio": "📘",
      "HeaderPericia": "🧠",
      "HeaderResistencia": "❤️",
      "HeaderSentido": "👁️",
      "Item": "💍",
      "Origem": "🔍",
      "Penalidade": "⏬",
      "Proficiencia": "🎓"
    },
    "ui": {
      "Adicionar": "➕",
      "Aprendidas": "📖",
      "Carregando": "⏳",
      "CheckboxOff": "☐",
      "CheckboxOn": "☑",
      "Decrement": "−",
      "Detalhes": "ℹ️",
      "Erro": "⚠️",
      "Falha": "❌",
      "Fonte": "🔍",
      "Increment": "+",
      "NaoAprendidas": "📚️",
      "NaoSalvo": "✍️",
      "Oculto": "👁️‍🗨️",
      "Outro": "✏️",
      "Proibido": "🚫",
      "Remover": "🗑️",
      "Reverter": "↩️",
      "Salvar": "💾",
      "Salvo": "✅"
    }
  },
  "typography": {
    "$source": "docs:modes.md#Modos — arquitetura interna > Hierarquia tipográfica de títulos",
    "tiers": [
      {
        "name": "Tier H",
        "role": "primeiro nível de container",
        "size": "13px",
        "style": "caps muted",
        "weight": 500
      },
      {
        "name": "Tier SH",
        "role": "sub-painel dentro de container",
        "size": "12px",
        "style": "caps muted",
        "weight": 600
      },
      {
        "name": "Tier F",
        "role": "field/coluna inline",
        "size": "11px",
        "style": "caps muted",
        "weight": 700
      }
    ]
  }
} as const

/** Nome da custom property CSS de cada cor de tokens.colors (mesmo kebab-case de tokens.css). */
export const colorVars = {
  "aventureiro": {
    "MarcaPreenchida": "var(--pleitost-color-aventureiro-marca-preenchida)",
    "MarcaVazia": "var(--pleitost-color-aventureiro-marca-vazia)",
    "Maximo": "var(--pleitost-color-aventureiro-maximo)",
    "ReconhecFill": "var(--pleitost-color-aventureiro-reconhec-fill)"
  },
  "biografia": {
    "NegativaBorderDark": "var(--pleitost-color-biografia-negativa-border-dark)",
    "NegativaBorderFcsDark": "var(--pleitost-color-biografia-negativa-border-fcs-dark)",
    "NegativaBorderFcsLight": "var(--pleitost-color-biografia-negativa-border-fcs-light)",
    "NegativaBorderLight": "var(--pleitost-color-biografia-negativa-border-light)",
    "NegativaLabelDark": "var(--pleitost-color-biografia-negativa-label-dark)",
    "NegativaLabelLight": "var(--pleitost-color-biografia-negativa-label-light)",
    "PositivaBorderDark": "var(--pleitost-color-biografia-positiva-border-dark)",
    "PositivaBorderFcsDark": "var(--pleitost-color-biografia-positiva-border-fcs-dark)",
    "PositivaBorderFcsLight": "var(--pleitost-color-biografia-positiva-border-fcs-light)",
    "PositivaBorderLight": "var(--pleitost-color-biografia-positiva-border-light)",
    "PositivaLabelDark": "var(--pleitost-color-biografia-positiva-label-dark)",
    "PositivaLabelLight": "var(--pleitost-color-biografia-positiva-label-light)"
  },
  "diff": {
    "AutoBg": "var(--pleitost-color-diff-auto-bg)",
    "ConflictBg": "var(--pleitost-color-diff-conflict-bg)",
    "InvalidatedBg": "var(--pleitost-color-diff-invalidated-bg)",
    "ManualBg": "var(--pleitost-color-diff-manual-bg)"
  },
  "feedback": {
    "Aviso": "var(--pleitost-color-feedback-aviso)",
    "Down": "var(--pleitost-color-feedback-down)",
    "Erro": "var(--pleitost-color-feedback-erro)",
    "Info": "var(--pleitost-color-feedback-info)",
    "Sucesso": "var(--pleitost-color-feedback-sucesso)",
    "Up": "var(--pleitost-color-feedback-up)"
  },
  "interativaBtn": {
    "DmgBg": "var(--pleitost-color-interativa-btn-dmg-bg)",
    "DmgBgActive": "var(--pleitost-color-interativa-btn-dmg-bg-active)",
    "DmgBgHover": "var(--pleitost-color-interativa-btn-dmg-bg-hover)",
    "EmDec": "var(--pleitost-color-interativa-btn-em-dec)",
    "EmInc": "var(--pleitost-color-interativa-btn-em-inc)",
    "MoralDec": "var(--pleitost-color-interativa-btn-moral-dec)",
    "MoralInc": "var(--pleitost-color-interativa-btn-moral-inc)",
    "TempDec": "var(--pleitost-color-interativa-btn-temp-dec)",
    "TempInc": "var(--pleitost-color-interativa-btn-temp-inc)",
    "VitDec": "var(--pleitost-color-interativa-btn-vit-dec)",
    "VitInc": "var(--pleitost-color-interativa-btn-vit-inc)"
  },
  "interativaCond": {
    "Bonus": "var(--pleitost-color-interativa-cond-bonus)",
    "Penalty": "var(--pleitost-color-interativa-cond-penalty)"
  },
  "interativaResource": {
    "Moral": "var(--pleitost-color-interativa-resource-moral)",
    "MoralTemporaria": "var(--pleitost-color-interativa-resource-moral-temporaria)",
    "Vitalidade": "var(--pleitost-color-interativa-resource-vitalidade)"
  },
  "interativaTone": {
    "AttrAccent": "var(--pleitost-color-interativa-tone-attr-accent)",
    "DimAccent": "var(--pleitost-color-interativa-tone-dim-accent)",
    "JobAccent": "var(--pleitost-color-interativa-tone-job-accent)",
    "MagicAccent": "var(--pleitost-color-interativa-tone-magic-accent)",
    "MidAccent": "var(--pleitost-color-interativa-tone-mid-accent)",
    "PotAccent": "var(--pleitost-color-interativa-tone-pot-accent)",
    "ResAccent": "var(--pleitost-color-interativa-tone-res-accent)",
    "SenseAccent": "var(--pleitost-color-interativa-tone-sense-accent)"
  },
  "partyBountyRank": {
    "ABg": "var(--pleitost-color-party-bounty-rank-abg)",
    "AColor": "var(--pleitost-color-party-bounty-rank-acolor)",
    "AGlow": "var(--pleitost-color-party-bounty-rank-aglow)",
    "BBg": "var(--pleitost-color-party-bounty-rank-bbg)",
    "BColor": "var(--pleitost-color-party-bounty-rank-bcolor)",
    "BGlow": "var(--pleitost-color-party-bounty-rank-bglow)",
    "CBg": "var(--pleitost-color-party-bounty-rank-cbg)",
    "CColor": "var(--pleitost-color-party-bounty-rank-ccolor)",
    "CGlow": "var(--pleitost-color-party-bounty-rank-cglow)",
    "DBg": "var(--pleitost-color-party-bounty-rank-dbg)",
    "DColor": "var(--pleitost-color-party-bounty-rank-dcolor)",
    "DGlow": "var(--pleitost-color-party-bounty-rank-dglow)",
    "SBg": "var(--pleitost-color-party-bounty-rank-sbg)",
    "SColor": "var(--pleitost-color-party-bounty-rank-scolor)",
    "SGlow": "var(--pleitost-color-party-bounty-rank-sglow)"
  },
  "partyRoles": {
    "Abatedor": "var(--pleitost-color-party-roles-abatedor)",
    "Controlador": "var(--pleitost-color-party-roles-controlador)",
    "Lider": "var(--pleitost-color-party-roles-lider)",
    "Vanguarda": "var(--pleitost-color-party-roles-vanguarda)"
  },
  "partyTierBar": {
    "Tier1": "var(--pleitost-color-party-tier-bar-tier1)",
    "Tier2": "var(--pleitost-color-party-tier-bar-tier2)",
    "Tier3": "var(--pleitost-color-party-tier-bar-tier3)",
    "Tier4": "var(--pleitost-color-party-tier-bar-tier4)"
  },
  "rank": {
    "A": "var(--pleitost-color-rank-a)",
    "E": "var(--pleitost-color-rank-e)",
    "M": "var(--pleitost-color-rank-m)",
    "N": "var(--pleitost-color-rank-n)"
  },
  "selecao": {
    "BinP": "var(--pleitost-color-selecao-bin-p)",
    "BinPBg": "var(--pleitost-color-selecao-bin-pbg)",
    "BinPLine": "var(--pleitost-color-selecao-bin-pline)",
    "NeutroBg": "var(--pleitost-color-selecao-neutro-bg)",
    "NeutroLine": "var(--pleitost-color-selecao-neutro-line)",
    "Regra": "var(--pleitost-color-selecao-regra)",
    "RegraBg": "var(--pleitost-color-selecao-regra-bg)",
    "RegraDim": "var(--pleitost-color-selecao-regra-dim)",
    "RegraLine": "var(--pleitost-color-selecao-regra-line)",
    "SlotBg": "var(--pleitost-color-selecao-slot-bg)",
    "SlotLine": "var(--pleitost-color-selecao-slot-line)",
    "UserSel": "var(--pleitost-color-selecao-user-sel)",
    "UserSelBg": "var(--pleitost-color-selecao-user-sel-bg)",
    "UserSelLine": "var(--pleitost-color-selecao-user-sel-line)",
    "Usuario": "var(--pleitost-color-selecao-usuario)"
  },
  "shadow": {
    "Tooltip": "var(--pleitost-color-shadow-tooltip)"
  },
  "theme": {
    "BgModHover": "var(--pleitost-color-theme-bg-mod-hover)",
    "BgPrimary": "var(--pleitost-color-theme-bg-primary)",
    "BgSecondary": "var(--pleitost-color-theme-bg-secondary)",
    "BorderNormal": "var(--pleitost-color-theme-border-normal)",
    "TextFaint": "var(--pleitost-color-theme-text-faint)",
    "TextMuted": "var(--pleitost-color-theme-text-muted)",
    "TextNormal": "var(--pleitost-color-theme-text-normal)"
  },
  "tier": {
    "BgDiamond": "var(--pleitost-color-tier-bg-diamond)",
    "Bronze": "var(--pleitost-color-tier-bronze)",
    "Gold": "var(--pleitost-color-tier-gold)",
    "Num": "var(--pleitost-color-tier-num)",
    "Platina": "var(--pleitost-color-tier-platina)",
    "Silver": "var(--pleitost-color-tier-silver)",
    "Zero": "var(--pleitost-color-tier-zero)"
  }
} as const

export const colors = tokens.colors
export const emojis = tokens.emojis
export const emojiCostExtra = tokens.emojiCostExtra
export const typography = tokens.typography
