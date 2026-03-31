import { normalizeFragmentHeight } from '@prometheus/ui/fragment-height'
import type { PretextAdapter, PretextTextSpec, PretextWhiteSpace } from './pretext-core'
import { pretextAdapter } from './pretext-runtime'

export const PRETEXT_ROLE_ATTR = 'data-pretext-role'
export const PRETEXT_FONT_ATTR = 'data-pretext-font'
export const PRETEXT_LINE_HEIGHT_ATTR = 'data-pretext-line-height'
export const PRETEXT_WHITE_SPACE_ATTR = 'data-pretext-white-space'
export const PRETEXT_LANG_ATTR = 'data-pretext-lang'
export const PRETEXT_MAX_LINES_ATTR = 'data-pretext-max-lines'
export const PRETEXT_MAX_HEIGHT_ATTR = 'data-pretext-max-height'
export const PRETEXT_HEIGHT_ATTR = 'data-pretext-height'
export const PRETEXT_CARD_HEIGHT_ATTR = 'data-pretext-card-height'

type PretextRole = 'body' | 'meta' | 'pill' | 'title'

type PretextTextElement = HTMLElement & {
  dataset: DOMStringMap
}

type PretextMeasureResult = {
  cards: Array<{ card: HTMLElement; height: number }>
  elementCount: number
}

type ResolvedPretextTextSpec = Pick<
  PretextTextSpec,
  'font' | 'lang' | 'lineHeight' | 'maxHeight' | 'maxLines' | 'text'
> & {
  role: PretextRole
  whiteSpace: PretextWhiteSpace
}

type PretextDomController = {
  destroy: () => void
  measureNow: () => void
  setLang: (lang: string) => void
  updateRoot: (root: ParentNode | null | undefined) => void
}

type PretextControllerWindow = Window & {
  __PROM_PRETEXT_CONTROLLER__?: {
    controller: PretextDomController
    refCount: number
  }
}

const MEASURABLE_FALLBACK_SELECTOR = [
  `[${PRETEXT_ROLE_ATTR}]`,
  '.fragment-card .meta-line',
  '.fragment-card h1',
  '.fragment-card h2',
  '.fragment-card h3',
  '.fragment-card p',
  '.fragment-card .home-demo-compact-kicker',
  '.fragment-card .home-demo-compact-copy',
  '.fragment-card .home-demo-compact-meta',
  '.fragment-card .home-fragment-shell-meta',
  '.fragment-card .home-manifest-pill',
  '.fragment-card .profile-card-title',
  '.fragment-card .profile-card-hint',
  '.fragment-card .settings-panel-title',
  '.fragment-card .settings-panel-description',
  '.fragment-card [data-static-login-runtime-label]',
  '.fragment-card [data-static-login-runtime-hint]',
  '.fragment-card [data-static-login-next-label]'
].join(', ')

const resolveRootNode = (root: ParentNode | null | undefined) =>
  root ?? (typeof document !== 'undefined' ? document.body : null)

const isHTMLElement = (value: unknown): value is HTMLElement =>
  typeof HTMLElement !== 'undefined' && value instanceof HTMLElement

const getComputedStyleSafe = (element: HTMLElement) => {
  if (typeof getComputedStyle !== 'function') {
    return null
  }
  return getComputedStyle(element)
}

const parsePx = (value: string | null | undefined) => {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

const resolveLineHeight = (computedStyle: CSSStyleDeclaration | null) => {
  const rawLineHeight = parsePx(computedStyle?.lineHeight)
  if (rawLineHeight && rawLineHeight > 0) {
    return rawLineHeight
  }
  const fontSize = parsePx(computedStyle?.fontSize) ?? 16
  return Number((fontSize * 1.2).toFixed(3))
}

const resolveFont = (computedStyle: CSSStyleDeclaration | null) => {
  if (!computedStyle) {
    return ''
  }
  const parts = [
    computedStyle.fontStyle,
    computedStyle.fontWeight,
    computedStyle.fontSize,
    computedStyle.fontFamily
  ]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
  return parts.join(' ')
}

const resolveWhiteSpace = (
  attrValue: string | null | undefined,
  computedStyle: CSSStyleDeclaration | null
): PretextWhiteSpace => {
  const normalizedAttr = attrValue?.trim()
  if (normalizedAttr === 'pre-wrap') {
    return 'pre-wrap'
  }
  const normalizedStyle = computedStyle?.whiteSpace?.trim().toLowerCase() ?? ''
  return normalizedStyle.startsWith('pre') ? 'pre-wrap' : 'normal'
}

const readNumberAttr = (element: HTMLElement, attr: string) => {
  const value = parsePx(element.getAttribute(attr))
  return value && value > 0 ? value : undefined
}

const resolveRole = (element: HTMLElement): PretextRole | null => {
  const explicit = element.getAttribute(PRETEXT_ROLE_ATTR)?.trim()
  if (explicit === 'meta' || explicit === 'title' || explicit === 'body' || explicit === 'pill') {
    return explicit
  }
  if (element.classList.contains('meta-line')) {
    return 'meta'
  }
  if (element.classList.contains('home-manifest-pill')) {
    return 'pill'
  }
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
    return 'title'
  }
  if (tagName === 'p' || tagName === 'div') {
    return 'body'
  }
  return null
}

const resolveText = (element: HTMLElement, whiteSpace: PretextWhiteSpace) => {
  const raw =
    element.getAttribute('data-pretext-text') ??
    element.textContent ??
    ''
  if (whiteSpace === 'pre-wrap') {
    return raw
  }
  return raw.replace(/\s+/g, ' ').trim()
}

const resolveWidth = (element: HTMLElement) => {
  const rect =
    typeof element.getBoundingClientRect === 'function'
      ? element.getBoundingClientRect()
      : null
  const fromRect = rect ? Math.ceil(rect.width) : 0
  if (fromRect > 0) {
    return fromRect
  }
  return Math.ceil(element.clientWidth)
}

const shouldSkipElement = (element: HTMLElement) => {
  if (element.closest('button, label, textarea, input, select, option, code, pre')) {
    return true
  }
  if (element.getAttribute('aria-hidden') === 'true') {
    return true
  }
  if (element.hasAttribute('hidden')) {
    return true
  }
  return false
}

const collectTextElements = (root: ParentNode): PretextTextElement[] => {
  if (typeof HTMLElement === 'undefined') {
    return []
  }
  const nodes = new Set<PretextTextElement>()
  if (isHTMLElement(root) && root.matches(MEASURABLE_FALLBACK_SELECTOR)) {
    nodes.add(root as PretextTextElement)
  }
  root.querySelectorAll?.(MEASURABLE_FALLBACK_SELECTOR).forEach((node) => {
    if (isHTMLElement(node)) {
      nodes.add(node as PretextTextElement)
    }
  })
  return [...nodes]
}

const resolveLang = (element: HTMLElement, fallbackLang?: string) => {
  const explicit =
    element.getAttribute(PRETEXT_LANG_ATTR)?.trim() ??
    element.closest<HTMLElement>('[lang]')?.lang?.trim() ??
    element.ownerDocument?.documentElement?.lang?.trim() ??
    fallbackLang?.trim() ??
    'en'
  return explicit.toLowerCase()
}

const writeElementContract = (
  element: HTMLElement,
  spec: Pick<PretextTextSpec, 'font' | 'lang' | 'lineHeight'> & {
    role: PretextRole
    whiteSpace: PretextWhiteSpace
  }
) => {
  if (element.getAttribute(PRETEXT_ROLE_ATTR) !== spec.role) {
    element.setAttribute(PRETEXT_ROLE_ATTR, spec.role)
  }
  if (element.getAttribute(PRETEXT_FONT_ATTR) !== spec.font) {
    element.setAttribute(PRETEXT_FONT_ATTR, spec.font)
  }
  const lineHeightValue = `${Number(spec.lineHeight.toFixed(3))}`
  if (element.getAttribute(PRETEXT_LINE_HEIGHT_ATTR) !== lineHeightValue) {
    element.setAttribute(PRETEXT_LINE_HEIGHT_ATTR, lineHeightValue)
  }
  if (element.getAttribute(PRETEXT_WHITE_SPACE_ATTR) !== spec.whiteSpace) {
    element.setAttribute(PRETEXT_WHITE_SPACE_ATTR, spec.whiteSpace)
  }
  if (element.getAttribute(PRETEXT_LANG_ATTR) !== spec.lang) {
    element.setAttribute(PRETEXT_LANG_ATTR, spec.lang)
  }
}

const resolveSpec = (
  element: HTMLElement,
  fallbackLang?: string
): ResolvedPretextTextSpec | null => {
  if (shouldSkipElement(element)) {
    return null
  }

  const role = resolveRole(element)
  if (!role) {
    return null
  }

  const computedStyle = getComputedStyleSafe(element)
  const whiteSpace = resolveWhiteSpace(element.getAttribute(PRETEXT_WHITE_SPACE_ATTR), computedStyle)
  const text = resolveText(element, whiteSpace)
  if (!text) {
    return null
  }

  const font = element.getAttribute(PRETEXT_FONT_ATTR)?.trim() || resolveFont(computedStyle)
  const lineHeight = readNumberAttr(element, PRETEXT_LINE_HEIGHT_ATTR) ?? resolveLineHeight(computedStyle)
  const lang = resolveLang(element, fallbackLang)
  const maxLines = readNumberAttr(element, PRETEXT_MAX_LINES_ATTR)
  const maxHeight = readNumberAttr(element, PRETEXT_MAX_HEIGHT_ATTR)

  if (!font || lineHeight <= 0) {
    return null
  }

  return {
    role,
    text,
    font,
    lineHeight,
    lang,
    whiteSpace,
    ...(maxLines ? { maxLines } : {}),
    ...(maxHeight ? { maxHeight } : {})
  }
}

const applyMeasuredHeight = (element: HTMLElement, height: number) => {
  const normalizedHeight = normalizeFragmentHeight(height) ?? 0
  if (normalizedHeight <= 0) {
    element.removeAttribute(PRETEXT_HEIGHT_ATTR)
    element.style.removeProperty('--pretext-height')
    element.style.removeProperty('min-height')
    return
  }

  const nextValue = `${normalizedHeight}`
  if (element.getAttribute(PRETEXT_HEIGHT_ATTR) !== nextValue) {
    element.setAttribute(PRETEXT_HEIGHT_ATTR, nextValue)
  }
  element.style.setProperty('--pretext-height', `${normalizedHeight}px`)
  element.style.setProperty('min-height', `${normalizedHeight}px`)
}

export const measurePretextLayout = ({
  adapter = pretextAdapter,
  lang,
  root = resolveRootNode(undefined)
}: {
  adapter?: PretextAdapter
  lang?: string
  root?: ParentNode | null
} = {}): PretextMeasureResult => {
  const resolvedRoot = resolveRootNode(root)
  if (!resolvedRoot) {
    return { cards: [], elementCount: 0 }
  }

  adapter.syncLocale(lang)
  const touchedCards = new Set<HTMLElement>()
  let elementCount = 0

  collectTextElements(resolvedRoot).forEach((element) => {
    const spec = resolveSpec(element, lang)
    if (!spec) {
      return
    }

    const width = resolveWidth(element)
    if (width <= 0) {
      return
    }

    writeElementContract(element, spec)
    const measurement = adapter.measure(spec, width)
    if (!measurement) {
      return
    }

    applyMeasuredHeight(element, measurement.height)
    elementCount += 1
    const card = element.closest<HTMLElement>('.fragment-card')
    if (card) {
      touchedCards.add(card)
    }
  })

  const cards = [...touchedCards].flatMap((card) => {
    const measuredHeight = normalizeFragmentHeight(card.scrollHeight) ?? 0
    if (measuredHeight <= 0) {
      card.removeAttribute(PRETEXT_CARD_HEIGHT_ATTR)
      return []
    }
    const nextValue = `${measuredHeight}`
    if (card.getAttribute(PRETEXT_CARD_HEIGHT_ATTR) !== nextValue) {
      card.setAttribute(PRETEXT_CARD_HEIGHT_ATTR, nextValue)
    }
    return [{ card, height: measuredHeight }]
  })

  return {
    cards,
    elementCount
  }
}

const createPretextDomController = ({
  adapter = pretextAdapter,
  initialLang,
  root
}: {
  adapter?: PretextAdapter
  initialLang: string
  root?: ParentNode | null
}): PretextDomController => {
  let currentLang = initialLang
  let currentRoot = resolveRootNode(root)
  let destroyed = false
  let rafHandle = 0
  let timeoutHandle = 0
  let mutationObserver: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null

  const clearScheduled = () => {
    if (rafHandle) {
      cancelAnimationFrame(rafHandle)
      rafHandle = 0
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = 0
    }
  }

  const measureNow = () => {
    if (destroyed) {
      return
    }
    clearScheduled()
    measurePretextLayout({
      adapter,
      lang: currentLang,
      root: currentRoot
    })
  }

  const schedule = () => {
    if (destroyed || typeof window === 'undefined') {
      return
    }
    if (rafHandle) {
      return
    }
    rafHandle = window.requestAnimationFrame(() => {
      rafHandle = 0
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = 0
        measureNow()
      }, 32)
    })
  }

  const reconnectObservers = () => {
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()

    if (destroyed || !currentRoot) {
      return
    }

    const observedNode = currentRoot as Node
    mutationObserver = new MutationObserver(() => {
      schedule()
    })
    mutationObserver.observe(observedNode, {
      characterData: true,
      childList: true,
      subtree: true
    })

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        schedule()
      })
      const resizeTarget =
        currentRoot instanceof Element
          ? currentRoot
          : currentRoot.ownerDocument?.documentElement ?? null
      if (resizeTarget) {
        resizeObserver.observe(resizeTarget)
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', schedule)
    document.fonts?.ready
      ?.then(() => {
        schedule()
      })
      .catch(() => {
        // Ignore font readiness failures.
      })
  }

  reconnectObservers()
  schedule()

  return {
    destroy: () => {
      destroyed = true
      clearScheduled()
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      mutationObserver = null
      resizeObserver = null
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', schedule)
      }
    },
    measureNow,
    setLang: (lang: string) => {
      const normalized = lang.trim().toLowerCase()
      if (!normalized || normalized === currentLang) {
        return
      }
      currentLang = normalized
      adapter.syncLocale(currentLang)
      schedule()
    },
    updateRoot: (root: ParentNode | null | undefined) => {
      const resolvedRoot = resolveRootNode(root)
      if (resolvedRoot === currentRoot) {
        return
      }
      currentRoot = resolvedRoot
      reconnectObservers()
      schedule()
    }
  }
}

export const acquirePretextDomController = ({
  initialLang,
  root
}: {
  initialLang: string
  root?: ParentNode | null
}) => {
  if (typeof window === 'undefined') {
    return null
  }

  const win = window as PretextControllerWindow
  if (!win.__PROM_PRETEXT_CONTROLLER__) {
    win.__PROM_PRETEXT_CONTROLLER__ = {
      controller: createPretextDomController({ initialLang, root }),
      refCount: 0
    }
  }

  win.__PROM_PRETEXT_CONTROLLER__.refCount += 1
  const { controller } = win.__PROM_PRETEXT_CONTROLLER__
  controller.updateRoot(root)
  controller.setLang(initialLang)

  return {
    controller,
    release: () => {
      const state = win.__PROM_PRETEXT_CONTROLLER__
      if (!state) {
        return
      }
      state.refCount = Math.max(0, state.refCount - 1)
      if (state.refCount > 0) {
        return
      }
      state.controller.destroy()
      delete win.__PROM_PRETEXT_CONTROLLER__
    }
  }
}
