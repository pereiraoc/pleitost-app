import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorld, WORLD_BRAND } from '../../data/world'
import { applyPwaUpdate, initPwaUpdate, usePwaNeedRefresh } from '../../pwa-update'
import { heroPath } from '../../paths'
import { setSelectedCreature, useSelectedCreature } from '../../data/selected-creature-store'
import { usePendingTabs } from './use-pending-tabs'
import { abaFichaVisivel, familiaOf } from '../../data/familia'
import { useCatalog } from '../../data/CatalogContext'
import { groupIdsOf } from '../../grupo/party'
import { characterNaSessao, useLiveSession } from '../../data/session-repo/live-session'
import { useIsSessionMestre } from '../../data/session-mestre'
import { useSettings } from '../../settings'
import { useDoc } from '../../data/useDoc'
import { DetailProvider, DetailAutoReveal } from '../../data/detail-context'
import { TopbarFicha } from './TopbarFicha'
import { BugReportButton } from './BugReportButton'
import { RightSidebar } from './RightSidebar'
import { useEdgeSwipe } from './useEdgeSwipe'
import { wizardAtivo } from '../wizard/wizard-mode'
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
  disabled,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
  pending?: readonly string[]
  /** #378: aba sem conteúdo pro personagem atual (GRUPO sem grupo/sessão). */
  disabled?: boolean
}) {
  return (
    <button
      className={active ? 'nav-item active' : 'nav-item'}
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'default' } : undefined}
    >
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

/** Aviso de update do PWA (issue #191; #472: era um toast discreto no canto e
 *  ninguém via — agora é um OVERLAY CENTRAL bem grande, pedido do jogador
 *  "no meio da tela gigantescamente"). "Recarregar" ativa o SW novo e
 *  recarrega (src/pwa-update.ts). Vocabulário do design (panel/line/mono +
 *  canto chanfrado). */
function PwaUpdateToast() {
  const needRefresh = usePwaNeedRefresh()
  if (!needRefresh) return null
  return (
    <div
      data-pwa-update-overlay=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, #000 62%, transparent)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="status"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          padding: '34px 44px',
          maxWidth: 'min(92vw, 520px)',
          textAlign: 'center',
          background: 'var(--panel)',
          border: '1px solid var(--accent)',
          clipPath:
            'polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))',
          fontFamily: 'var(--mono)',
          color: 'var(--text)',
        }}
      >
        <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>
          ⟳
        </span>
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '.06em' }}>
          Atualização disponível
        </span>
        <span style={{ fontSize: 12.5, letterSpacing: '.04em', color: 'var(--muted)' }}>
          Uma versão nova do app acabou de sair — recarrega pra jogar com ela.
        </span>
        <button
          onClick={applyPwaUpdate}
          style={{
            padding: '13px 34px',
            cursor: 'pointer',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: 'var(--ink)',
            fontFamily: 'var(--mono)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '.1em',
            clipPath: 'polygon(0 0,100% 0,100% 100%,8px 100%,0 calc(100% - 8px))',
          }}
        >
          Recarregar
        </button>
      </div>
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
  const location = useLocation()
  // MUNDO ativo (#519): marca da topbar e saída da rota de herói na troca —
  // sem isso o herói da fantasia seguia aberto (abas + avatar) no cyberpunk
  // (report 2026-08-29).
  const world = useWorld()
  const mundoAnterior = useRef(world)
  useEffect(() => {
    if (mundoAnterior.current === world) return
    mundoAnterior.current = world
    if (location.pathname.startsWith('/heroi')) navigate('/', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world])
  const { pathname } = location
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // No mobile, NAVEGAR (trocar de rota) fecha os drawers — senão o painel
  // direito (Sessão/Detalhes) ficava por cima da tela navegada: abrir a FICHA
  // DO GRUPO da sessão não revelava a ficha. Detalhes (DetailAutoReveal) abrem
  // sem navegar, então não conflitam com isto.
  useEffect(() => {
    if (window.innerWidth < 820) {
      setDrawerOpen(false)
      setRightOpen(false)
    }
  }, [location.key])

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
  // #452: herói em CRIAÇÃO ACOMPANHADA (wizard) — as abas da ficha ficam
  // bloqueadas (o conteúdo é o wizard) e a sidebar direita mostra só DETALHES.
  const emWizard = wizardAtivo(heroDoc)
  // #302: abas com pendência (algo a preencher) — ponto no botão da sidebar.
  // Em CRIAÇÃO (wizard) não: as abas estão bloqueadas e o próprio wizard guia
  // o preenchimento — a bolinha só confundiria (pedido do usuário, #452 r9).
  const pendingTabs = usePendingTabs(emWizard ? undefined : heroDoc)
  // #378: personagem sem grupo (FM) e fora da sessão viva → o botão GRUPO
  // fica desabilitado (pedido do report: "não deixe clicável" em vez de cair
  // na mesa de outra sessão). Enquanto o doc carrega, segue clicável.
  const catalog = useCatalog()
  const liveSess = useLiveSession()
  const grupoDisponivel =
    !heroDoc ||
    groupIdsOf(catalog, heroDoc).length > 0 ||
    (!!liveSess?.sessionId && characterNaSessao(liveSess, heroDoc.id))
  // #191: registra o SW e liga o fluxo de update (idempotente)
  useEffect(() => {
    void initPwaUpdate()
  }, [])
  // #440: conectado a uma sessão, o Modo Mestre é DEFINIDO pelo papel (GM →
  // ligado; jogador → desligado). Fora da sessão o usuário mexe livremente.
  const { locked: mestreLocked, roleMestre } = useIsSessionMestre()
  const { mestre, setMestre } = useSettings()
  useEffect(() => {
    if (mestreLocked && mestre !== roleMestre) setMestre(roleMestre)
  }, [mestreLocked, roleMestre, mestre, setMestre])
  // LIBERADO 2026-08-31: o guard que bloqueava o cyberpunk sem modo
  // desenvolvedor (#528) saiu — o corte mestre×jogador (e95dcc1) garante que
  // o dataset público não carrega segredo.
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
        <span className="brand-badge">{WORLD_BRAND[world]}</span>
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
                  disabled={emWizard || (item.id === 'grupos' && !grupoDisponivel)}
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
          soDetalhes={emWizard}
        />
      </div>
      <PwaUpdateToast />
      </div>
    </DetailProvider>
  )
}
