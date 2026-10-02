// ESCUDO DO MESTRE — ponte entre as escritas VOLÁTEIS da ficha
// (model.setVolatile('Interativa.<container>', mapa)) e o state do combatente
// na sessão (updateCharacterState, merge por chave de topo). O mestre edita o
// volátil de NPC pelos MESMOS painéis da ficha (AtaquesPanel: Vantagem de
// Combate, Acerto Decisivo, ações locais, toggles de propriedade, cargas).
// Caminhos fora do contrato são ignorados (devolve false) — nunca inventam
// chave no state.
import type { CharacterState, SessionRepo } from '../../../data/session-repo/contract'

const MAPA: Record<string, keyof CharacterState> = {
  'Interativa.Condicoes_Ativas': 'condicoesAtivas',
  'Interativa.Efeitos_Ativos': 'efeitosAtivos',
  'Interativa.Invocacoes_Ativas': 'invocacoesAtivas',
  'Interativa.Usos_Recursos': 'usosRecursos',
}

/** Patch de state pra uma escrita volátil; null = caminho sem home no state. */
export function patchVolatil(path: string, value: unknown): Partial<CharacterState> | null {
  const chave = MAPA[path]
  if (!chave) return null
  return { [chave]: value } as Partial<CharacterState>
}

export function escreverVolatilNaSessao(repo: SessionRepo, charId: string, path: string, value: unknown): boolean {
  const patch = patchVolatil(path, value)
  if (!patch) return false
  void repo.updateCharacterState(charId, patch)
  return true
}
