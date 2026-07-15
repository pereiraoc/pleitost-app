// Papéis de combate de uma CLASSE (#276) — espelho 1:1 do pleitost-views
// (src/render/modes/class-roles/role-meta.ts): cor + descrição de cada papel.
// Fonte de verdade dos papéis; o call-site nunca inventa cor/texto.
export type RoleName = 'Líder' | 'Vanguarda' | 'Abatedor' | 'Controlador'

export interface RoleMeta {
  color: string
  desc: string
}

export const ROLE_META: Record<RoleName, RoleMeta> = {
  Líder: {
    color: '#4ade80',
    desc: 'fortalece aliados, sustenta o grupo e mantém o time eficiente com cura, bônus e/ou coordenação.',
  },
  Vanguarda: {
    color: '#60a5fa',
    desc: 'ocupa a linha de frente e serve como base física do grupo, segurando pressão e impondo presença em combate.',
  },
  Abatedor: {
    color: '#f87171',
    desc: 'foca em eliminar rapidamente um alvo específico com alto dano e pressão ofensiva.',
  },
  Controlador: {
    color: '#c084fc',
    desc: 'enfraquece inimigos e dita o ritmo da batalha com debuffs, restrições e dano em área.',
  },
}

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && value in ROLE_META
}
