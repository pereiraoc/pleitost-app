// ESCUDO DO MESTRE como PÁGINA (report 2026-10-08): o escudo é da sessão, não
// de um personagem — rota própria (/escudo), aberta pelo botão da barra com
// ou sem personagem selecionado. Jogador (sem modo mestre) volta pros heróis.
import { Navigate } from 'react-router-dom'
import { useSettings } from '../../../settings'
import { EscudoDoMestreTab } from './EscudoDoMestreTab'

export function EscudoPage() {
  const { mestre } = useSettings()
  if (!mestre) return <Navigate to="/herois" replace />
  return <EscudoDoMestreTab />
}
