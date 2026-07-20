import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { applyPwaUpdate, initPwaUpdate, usePwaNeedRefresh } from '../../pwa-update'
import { heroPath } from '../../paths'
import { setSelectedCreature, useSelectedCreature } from '../../data/selected-creature-store'
import { usePendingTabs } from './use-pending-tabs'
import { abaFichaVisivel, familiaOf } from '../../data/familia'
import { useDoc } from '../../data/useDoc'
import { DetailProvider, DetailAutoReveal } from '../../data/detail-context'
import { TopbarFicha } from './TopbarFicha'
import { BugReportButton } from './BugReportButton'
import { RightSidebar } from './RightSidebar'
import { useEdgeSwipe } from './useEdgeSwipe'
import {
  APP_NAV,
  CHAR_TABS,
  NAV_ICON_PATHS,
  NAV_ROUTES,
  TITLES,
  type NavItem,
} from './design-nav'

/** Espelho do ICON_WRAP do design: mesmo wrapper <svg>, miolo verbatim do pull. */
function NavIcon({ id }: { id: string }) {
  const paths = NAV_ICON_PATHS[id]
  if (!paths) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  )
}

function NavButton({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const route = NAV_ROUTES[item.id]
  // itens sem tela implementada ficam desenhados porém disabled
  if (route) {
    return (
      <NavLink
        to={route}
        onClick={onNavigate}
        className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
      >
        <span className="nav-ic" aria-hidden>
          <NavIcon id={item.id} />
        </span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
    )
  }
  return (
    <button className="nav-item" disabled>
      <span className="nav-ic" aria-hidden>
        <NavIcon id={item.id} />
      </span>
      <span className="nav-label">{item.label}</span>
    </button>
  )
}

/** CHAR_TAB com ficha aberta: ativo e trocando a ?tab= da própria ficha. */
function CharTabButton({
  item,
  active,
  onSelect,
  pending,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
  pending?: readonly string[]
}) {
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onSelect}>
      <span className="nav-ic" aria-hidden>
        <NavIcon id={item.id} />
      </span>
      <span className="nav-label">{item.label}</span>
      {/* #302: ponto de pendência — algo a preencher nesta aba (slots livres,
          escolhas não feitas). Some quando a aba está completa. O tooltip
          (hover no ponto) lista exatamente o que falta. */}
      {pending && pending.length ? (
        <span
          className="nav-pending"
          aria-hidden
          title={pending.map((m) => `• ${m}`).join('\n')}
        />
      ) : null}
    </button>
  )
}

/** Toast fixo de update do PWA (issue #191): aparece quando um deploy novo
 *  está em espera (onNeedRefresh, ver src/pwa-update.ts); "Recarregar" ativa
 *  o SW novo e recarrega. Inline styles no vocabulário do design (panel/line/
 *  mono + canto chanfrado), como as linhas do CONFIG. */
function PwaUpdateToast() {
  const needRefresh = usePwaNeedRefresh()
  if (!needRefresh) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 18,
        right: 18,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 15px',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        clipPath:
          'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.05em',
        color: 'var(--text)',
      }}
    >
      <span>Atualização disponível</span>
      <button
        onClick={applyPwaUpdate}
        style={{
          padding: '7px 12px',
          cursor: 'pointer',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: 'var(--ink)',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '.08em',
          clipPath: 'polygon(0 0,100% 0,100% 100%,6px 100%,0 calc(100% - 6px))',
        }}
      >
        Recarregar
      </button>
    </div>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  // #87: drawer da sidebar DIREITA (Sessão/Detalhes) — no mobile.
  const [rightOpen, setRightOpen] = useState(false)
  // Colapso da sidebar em desktop (navCollapsed do design; toggleNav do
  // renderVals: <820 abre o drawer, >=820 colapsa pra 64px só-ícones).
  const [collapsed, setCollapsed] = useState(false)
  // Colapso da sidebar DIREITA no desktop (feedback do mestre) — vira trilho.
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Ficha aberta (/heroi/...): CHAR_TABS ficam ativas e trocam a ?tab=.
  const fichaOpen = pathname.startsWith('/heroi/')
  const fichaTab = fichaOpen ? (searchParams.get('tab') ?? 'perfil') : null
  const routeHeroId = fichaOpen ? decodeURIComponent(pathname.slice('/heroi/'.length)) : null
  // #86: seleção PERSISTIDA — o personagem "selecionado" continua ativo mesmo
  // fora da ficha (na tela de seleção etc.), até escolher outro. heroId efetivo
  // = o da rota OU o selecionado.
  const selectedId = useSelectedCreature()
  const heroId = routeHeroId ?? selectedId
  useEffect(() => {
    if (routeHeroId) setSelectedCreature(routeHeroId) // abrir uma ficha memoriza a seleção
  }, [routeHeroId])
  // Abas da ficha por FAMÍLIA (#201): CA não tem ANOTAÇÕES (plugin
  // mount-interativa.ts:897 — CA fica só com Recursos). Mesmo predicado
  // central da FichaPage (abaFichaVisivel); enquanto o doc carrega, mostra
  // tudo (o gate da rota segura o conteúdo).
  const { doc: heroDoc } = useDoc(heroId ?? '')
  const charTabs = heroDoc
    ? CHAR_TABS.filter((t) => abaFichaVisivel(familiaOf(heroDoc), t.id))
    : CHAR_TABS
  // #302: abas com pendência (algo a preencher) — ponto no botão da sidebar.
  const pendingTabs = usePendingTabs(heroDoc)
  // #191: registra o SW e liga o fluxo de update (idempotente)
  useEffect(() => {
    void initPwaUpdate()
  }, [])
  // #259: gesto de swipe pra abrir/fechar as sidebars no mobile — puxar da
  // borda esquerda→direita abre a esquerda; direita→esquerda abre a direita
  // (e o gesto oposto sobre um drawer aberto fecha).
  useEdgeSwipe(
    { leftOpen: drawerOpen, rightOpen: rightOpen },
    {
      openLeft: () => setDrawerOpen(true),
      closeLeft: () => setDrawerOpen(false),
      openRight: () => setRightOpen(true),
      closeRight: () => setRightOpen(false),
    },
  )

  const section = fichaOpen
    ? fichaTab
    : pathname.startsWith('/herois')
      ? 'herois'
      : pathname.startsWith('/npcs')
        ? 'npcs'
        : pathname.startsWith('/config')
          ? 'config'
          : pathname.startsWith('/compendio') || pathname.startsWith('/doc')
            ? 'compendio'
            : null
  const title = section ? TITLES[section] : ''
  const closeDrawer = () => setDrawerOpen(false)

  const selectFichaTab = (id: string) => {
    // navega pra ficha do personagem selecionado, na aba pedida (#86: funciona
    // mesmo estando na tela de seleção — não fica "não clicável").
    if (heroId) navigate(heroPath(heroId, id === 'perfil' ? undefined : id))
    closeDrawer()
  }

  return (
    <DetailProvider>
      {/* No mobile, abrir algo nos DETALHES (link/ação) revela o painel direito
          automaticamente — no desktop o painel já é fixo, e abrir o drawer lá
          mostraria um scrim indevido, então só revela abaixo de 820px. */}
      <DetailAutoReveal onReveal={() => window.innerWidth < 820 && setRightOpen(true)} />
      <div className="app-root">
      <header className="topbar">
        <button
          className="topbar-menu"
          onClick={() => {
            // Mobile: abrir a esquerda fecha a direita (drawers mutuamente
            // exclusivos — senão a esquerda abria ATRÁS da direita, #bug).
            if (window.innerWidth < 820) {
              setRightOpen(false)
              setDrawerOpen((open) => !open)
            } else setCollapsed((c) => !c)
          }}
          title="Menu"
        >
          ☰
        </button>
        <span className="brand-badge">PE</span>
        <span className="topbar-title">{title}</span>
        <div className="topbar-spacer" />
        {/* #307: toggle claro/escuro saiu do topo (já está no CONFIG) — o espaço
            fica pro avatar do personagem selecionado (TopbarFicha). */}
        {heroId ? <TopbarFicha key={heroId} id={heroId} tab={fichaTab ?? 'perfil'} /> : null}
        {/* #87: toggle da sidebar direita (Sessão/Detalhes) — no mobile */}
        <button
          className="right-toggle"
          onClick={() => {
            // Abrir a direita fecha a esquerda (mesma exclusão mútua mobile).
            setDrawerOpen(false)
            setRightOpen((o) => !o)
          }}
          aria-pressed={rightOpen}
          title="Sessão / Detalhes"
        >
          ⧉
        </button>
      </header>
      <div className="body-row">
        <aside
          className={[
            'sidebar',
            drawerOpen ? 'drawer-open' : '',
            collapsed ? 'collapsed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <nav className="nav-group">
            {charTabs.map((item) =>
              // #86: clicáveis sempre que HÁ personagem (rota OU selecionado) —
              // não ficam mortas na tela de seleção. Só destacam a aba ativa
              // quando de fato na ficha.
              heroId ? (
                <CharTabButton
                  key={item.id}
                  item={item}
                  active={fichaOpen && fichaTab === item.id}
                  onSelect={() => selectFichaTab(item.id)}
                  pending={pendingTabs.get(item.id)}
                />
              ) : (
                <NavButton key={item.id} item={item} onNavigate={closeDrawer} />
              ),
            )}
          </nav>
          <div className="sidebar-spacer" />
          <nav className="nav-group">
            {APP_NAV.map((item) => (
              <NavButton key={item.id} item={item} onNavigate={closeDrawer} />
            ))}
            {/* #308: report de bugs ABAIXO do CONFIG (fundo vermelho) */}
            <BugReportButton onOpenChange={closeDrawer} />
          </nav>
        </aside>
        {drawerOpen ? <div className="drawer-scrim" onClick={closeDrawer} /> : null}
        <main className="app-main">
          <Outlet />
        </main>
        {rightOpen ? (
          <div className="drawer-scrim right" onClick={() => setRightOpen(false)} />
        ) : null}
        <RightSidebar
          drawerOpen={rightOpen}
          onCloseDrawer={() => setRightOpen(false)}
          collapsed={rightCollapsed}
          onToggleCollapse={() => setRightCollapsed((c) => !c)}
        />
      </div>
      <PwaUpdateToast />
      </div>
    </DetailProvider>
  )
}
