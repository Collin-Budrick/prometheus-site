import { type NavLabelKey } from '../config'
import type { Lang } from '../lang'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../shared/nav-order'
import { getStaticHomeUiCopy, type HomeStaticUiCopy } from './home-copy-store'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { readStaticShellSeed, syncStaticDockRootState, type StaticDockState } from './seed-client'

type SyncStaticDockOptions = {
  root: HTMLElement
  lang: Lang
  currentPath: string
  isAuthenticated: boolean
  force?: boolean
  lockMetrics?: boolean
}

const dockIconMarkup: Record<NavLabelKey, string> = {
  navHome:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M17 21H7C4.79086 21 3 19.2091 3 17V10.7076C3 9.30887 3.73061 8.01175 4.92679 7.28679L9.92679 4.25649C11.2011 3.48421 12.7989 3.48421 14.0732 4.25649L19.0732 7.28679C20.2694 8.01175 21 9.30887 21 10.7076V17C21 19.2091 19.2091 21 17 21Z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 17H15" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navStore:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M3 9V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9"></path><path d="M20.485 3H16.4933L16.9933 8C16.9933 8 17.9933 9 19.4933 9C20.5703 9 21.3036 8.48445 21.6316 8.1937C21.7623 8.07782 21.8101 7.90091 21.7814 7.72861L21.0768 3.50136C21.0286 3.21205 20.7783 3 20.485 3Z"></path><path d="M16.4933 3L16.9933 8C16.9933 8 15.9933 9 14.4933 9C12.9933 9 11.9933 8 11.9933 8V3H16.4933Z"></path><path d="M11.9933 3V8C11.9933 8 10.9933 9 9.49329 9C7.99329 9 6.99329 8 6.99329 8L7.49329 3H11.9933Z"></path><path d="M7.49331 3H3.50158C3.20828 3 2.95797 3.21205 2.90975 3.50136L2.2052 7.72862C2.17649 7.90091 2.22432 8.07782 2.35502 8.1937C2.68294 8.48445 3.41626 9 4.49329 9C5.99329 9 6.99331 8 6.99331 8L7.49331 3Z"></path></svg>',
  navLab:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M18.5 15H5.5" stroke-linejoin="round"></path><path d="M16 4H8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 4.5V10.2602C9 10.7376 8.82922 11.1992 8.51851 11.5617L3.48149 17.4383C3.17078 17.8008 3 18.2624 3 18.7398V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V18.7398C21 18.2624 20.8292 17.8008 20.5185 17.4383L15.4815 11.5617C15.1708 11.1992 15 10.7376 15 10.2602V4.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 9.01L12.01 8.99889" stroke-linecap="round" stroke-linejoin="round"></path><path d="M11 2.01L11.01 1.99889" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navLogin:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M5 20V19C5 15.134 8.13401 12 12 12C15.866 12 19 15.134 19 19V20" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navProfile:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 21C4.85038 18.0717 7.55049 16 10.6667 16H13.3333C16.4495 16 19.1496 18.0717 20 21" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navChat:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M8 10H16" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8 14H13" stroke-linecap="round" stroke-linejoin="round"></path><path d="M7 19.5C4.79086 19.5 3 17.7091 3 15.5V8.5C3 6.29086 4.79086 4.5 7 4.5H17C19.2091 4.5 21 6.29086 21 8.5V15.5C21 17.7091 19.2091 19.5 17 19.5H10.5L6 21V19.5H7Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navSettings:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M19.4 15A1.65 1.65 0 0 0 20 16.3L20.1 16.4A2 2 0 0 1 20.1 19.2L19.2 20.1A2 2 0 0 1 16.4 20.1L16.3 20A1.65 1.65 0 0 0 15 19.4A1.65 1.65 0 0 0 13.7 20V20.2A2 2 0 0 1 11.7 22H10.3A2 2 0 0 1 8.3 20.2V20A1.65 1.65 0 0 0 7 19.4A1.65 1.65 0 0 0 5.7 20L5.6 20.1A2 2 0 0 1 2.8 20.1L1.9 19.2A2 2 0 0 1 1.9 16.4L2 16.3A1.65 1.65 0 0 0 2.6 15A1.65 1.65 0 0 0 2 13.7L1.9 13.6A2 2 0 0 1 1.9 10.8L2.8 9.9A2 2 0 0 1 5.6 9.9L5.7 10A1.65 1.65 0 0 0 7 10.6A1.65 1.65 0 0 0 8.3 10V9.8A2 2 0 0 1 10.3 8H11.7A2 2 0 0 1 13.7 9.8V10A1.65 1.65 0 0 0 15 10.6A1.65 1.65 0 0 0 16.3 10L16.4 9.9A2 2 0 0 1 19.2 9.9L20.1 10.8A2 2 0 0 1 20.1 13.6L20 13.7A1.65 1.65 0 0 0 19.4 15Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  navDashboard:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg"><path d="M4 13.5C4 9.35786 7.35786 6 11.5 6H12.5C16.6421 6 20 9.35786 20 13.5V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V13.5Z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 3V10" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 14.5H15" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
}

const withLangParam = (href: string, langValue: Lang) => {
  if (!href || !href.startsWith('/')) return href
  const base =
    typeof window === 'undefined' ? 'https://prometheus.test' : window.location.origin
  const url = new URL(href, base)
  url.searchParams.set('lang', langValue)
  return `${url.pathname}${url.search}${url.hash}`
}

const isDockItemActive = (currentPath: string, href: string) =>
  href === '/'
    ? currentPath === '/'
    : currentPath === href || currentPath.startsWith(`${href}/`)

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const isHtmlElement = (value: unknown): value is HTMLElement => {
  if (!value) return false
  if (typeof HTMLElement !== 'undefined') {
    return value instanceof HTMLElement
  }
  return typeof (value as { innerHTML?: unknown }).innerHTML === 'string'
}

type DockCopy = Pick<HomeStaticUiCopy, NavLabelKey | 'dockAriaLabel'>

const getDockCopyFromSeed = (lang: Lang): Partial<DockCopy> => {
  if (typeof document === 'undefined') return {}
  const seed = readStaticShellSeed()
  if (!seed || seed.lang !== lang) return {}
  return {
    navHome: seed.languageSeed?.ui?.navHome,
    navStore: seed.languageSeed?.ui?.navStore,
    navLab: seed.languageSeed?.ui?.navLab,
    navLogin: seed.languageSeed?.ui?.navLogin,
    navProfile: seed.languageSeed?.ui?.navProfile,
    navChat: seed.languageSeed?.ui?.navChat,
    navSettings: seed.languageSeed?.ui?.navSettings,
    navDashboard: seed.languageSeed?.ui?.navDashboard,
    dockAriaLabel: seed.languageSeed?.ui?.dockAriaLabel
  }
}

const resolveDockCopy = (lang: Lang): DockCopy => ({
  ...getStaticHomeUiCopy(lang),
  ...getDockCopyFromSeed(lang)
})

const getDockCount = (authenticated: boolean) => (authenticated ? AUTH_NAV_ITEMS.length : TOPBAR_NAV_ITEMS.length)

const renderDockItemsHtml = (lang: Lang, currentPath: string, authenticated: boolean) => {
  const copy = resolveDockCopy(lang)
  const navItems = authenticated ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS
  return {
    copy,
    items: navItems
      .map((item) => {
        const label = copy[item.labelKey]
        const href = withLangParam(item.href, lang)
        const active = isDockItemActive(currentPath, item.href)
        const current = active ? ' aria-current="page"' : ''
        return `<div class="dock-icon" role="listitem" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><a class="dock-link" href="${escapeHtml(href)}" data-fragment-link aria-label="${escapeHtml(label)}"${current} title="${escapeHtml(label)}">${dockIconMarkup[item.labelKey]}</a></div>`
      })
      .join('')
  }
}

export const renderDockHtml = (lang: Lang, currentPath: string, authenticated: boolean) => {
  const { copy, items } = renderDockItemsHtml(lang, currentPath, authenticated)
  return `<div class="dock-shell" data-dock-mode="${authenticated ? 'auth' : 'public'}" style="--dock-count:${getDockCount(authenticated)}"><div class="dock" role="list" aria-label="${escapeHtml(copy.dockAriaLabel)}">${items}</div></div>`
}

export const renderDockRegionHtml = ({ lang, currentPath, isAuthenticated }: StaticDockState) =>
  `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}" ${STATIC_DOCK_ROOT_ATTR}="true" data-static-dock-lang="${escapeHtml(lang)}" data-static-dock-mode="${isAuthenticated ? 'auth' : 'public'}" data-static-dock-path="${escapeHtml(currentPath)}">${renderDockHtml(lang, currentPath, isAuthenticated)}</div>`

const parseDockShell = (html: string) => {
  if (typeof document === 'undefined') return null
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const next = template.content.firstElementChild
  return isHtmlElement(next) ? next : null
}

const lockDockGeometry = (dockShell: HTMLElement) => {
  if (typeof dockShell.getBoundingClientRect !== 'function') return () => undefined
  const rect = dockShell.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return () => undefined

  const previousWidth = dockShell.style.width
  const previousHeight = dockShell.style.height
  dockShell.style.width = `${rect.width}px`
  dockShell.style.height = `${rect.height}px`

  let released = false
  return () => {
    if (released) return
    released = true
    const clear = () => {
      dockShell.style.width = previousWidth
      dockShell.style.height = previousHeight
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(clear)
      })
      return
    }

    if (typeof window !== 'undefined') {
      window.setTimeout(clear, 32)
      return
    }

    clear()
  }
}

export const syncStaticDockMarkup = ({
  root,
  lang,
  currentPath,
  isAuthenticated,
  force = false,
  lockMetrics = false
}: SyncStaticDockOptions) => {
  const nextMode = isAuthenticated ? 'auth' : 'public'
  const shouldUpdate =
    force ||
    root.dataset.staticDockLang !== lang ||
    root.dataset.staticDockMode !== nextMode ||
    root.dataset.staticDockPath !== currentPath ||
    !root.firstElementChild

  if (!shouldUpdate) {
    return false
  }

  const nextDockHtml = renderDockHtml(lang, currentPath, isAuthenticated)
  const currentShell = isHtmlElement(root.firstElementChild) ? root.firstElementChild : null

  if (currentShell?.classList.contains('dock-shell')) {
    const nextShell = parseDockShell(nextDockHtml)
    if (nextShell) {
      const unlockMetrics = lockMetrics ? lockDockGeometry(currentShell) : () => undefined
      currentShell.setAttribute('data-dock-mode', nextMode)
      currentShell.style.setProperty('--dock-count', `${getDockCount(isAuthenticated)}`)
      currentShell.innerHTML = nextShell.innerHTML
      unlockMetrics()
    } else {
      root.innerHTML = nextDockHtml
    }
  } else {
    root.innerHTML = nextDockHtml
  }

  syncStaticDockRootState({ currentPath, isAuthenticated, lang })
  return true
}
