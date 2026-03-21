import { InChatLines, InDashboard, InFlask, InHomeSimple, InSettings, InShop, InUser, InUserCircle } from '@qwikest/icons/iconoir'
import type { JSXNode, QwikIntrinsicElements } from '@builder.io/qwik'
import type { Lang, UiCopy } from '../lang'
import { siteBrand, type NavLabelKey } from '../config'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../shared/nav-order'
import { toCanonicalStaticShellHref } from './constants'

type DockIconComponent = (props: QwikIntrinsicElements['svg']) => JSXNode

type StaticDockMarkupProps = {
  lang: Lang
  currentPath: string
  copy: Pick<UiCopy, 'dockAriaLabel' | NavLabelKey>
  isAuthenticated: boolean
}

export const DOCK_ICONS: Record<NavLabelKey, DockIconComponent> = {
  navHome: InHomeSimple,
  navStore: InShop,
  navLab: InFlask,
  navLogin: InUser,
  navProfile: InUserCircle,
  navChat: InChatLines,
  navSettings: InSettings,
  navDashboard: InDashboard
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어'
}

export const getLangLabel = (value: string) => LANGUAGE_LABELS[value.toLowerCase()] ?? value.toUpperCase()

export const withLangParam = (href: string, langValue: Lang) => {
  if (!href || !href.startsWith('/')) return href
  const base = typeof window === 'undefined' ? 'https://example.com' : window.location.origin
  try {
    const url = new URL(toCanonicalStaticShellHref(href), base)
    url.searchParams.set('lang', langValue)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return href
  }
}

export const resolveDockItems = (lang: Lang, copy: Pick<UiCopy, NavLabelKey>, isAuthenticated: boolean) => {
  const navItems = isAuthenticated ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS
  return navItems.map((item) => ({
    href: withLangParam(item.href, lang),
    label: copy[item.labelKey],
    icon: DOCK_ICONS[item.labelKey] ?? InHomeSimple
  }))
}

export const isDockItemActive = (currentPath: string, href: string) =>
  href === '/'
    ? currentPath === '/'
    : currentPath === href || currentPath.startsWith(`${href}/`)

export const StaticDockMarkup = ({ lang, currentPath, copy, isAuthenticated }: StaticDockMarkupProps) => {
  const navItems = isAuthenticated ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS
  return (
    <div class="dock-shell" data-dock-mode={isAuthenticated ? 'auth' : 'public'} style={{ '--dock-count': `${navItems.length}` }}>
      <nav class="dock-nav" aria-label={copy.dockAriaLabel}>
        <ul class="dock">
          {navItems.map((item) => {
            const Icon = DOCK_ICONS[item.labelKey] ?? InHomeSimple
            const href = withLangParam(item.href, lang)
            const isActive = isDockItemActive(currentPath, item.href)
            return (
              <li key={item.href} class="dock-icon" title={copy[item.labelKey]}>
                <a
                  class="dock-link"
                  href={href}
                  data-fragment-link
                  aria-label={copy[item.labelKey]}
                  aria-current={isActive ? 'page' : undefined}
                  title={copy[item.labelKey]}
                >
                  <Icon class="dock-icon-svg" aria-hidden="true" />
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

export const renderStaticBrand = () => (
  <div class="brand">
    <div class="brand-mark" aria-hidden="true" />
    <div class="brand-title">
      <strong>{siteBrand.name}</strong>
      <span>{siteBrand.product}</span>
    </div>
  </div>
)
