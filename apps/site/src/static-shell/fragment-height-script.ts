const FRAGMENT_HEIGHT_COOKIE_NAME = 'prom_frag_h'
const FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH = 1025

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const buildFragmentHeightPersistenceScript = ({
  path,
  lang,
  fragmentOrder,
  planSignature
}: {
  path: string
  lang: string
  fragmentOrder: string[]
  planSignature: string
}) =>
  `(() => {
  const route = ${serializeJson({ path, lang, fragmentOrder, planSignature })};
  if (!Array.isArray(route.fragmentOrder) || route.fragmentOrder.length === 0 || !route.planSignature) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const normalizePath = (value) => {
    const trimmed = String(value || '/').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };

  const normalizeHeight = (value) => {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(1, Math.round(parsed));
  };

  const getViewport = () => window.innerWidth >= ${FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH} ? 'desktop' : 'mobile';

  const buildStorageKey = (fragmentId, viewport) =>
    [
      'fragment:stable-height:v1',
      encodeURIComponent(normalizePath(route.path)),
      encodeURIComponent(String(route.lang)),
      viewport,
      encodeURIComponent(fragmentId)
    ].join(':');

  const readCookieValue = () => {
    const prefix = '${FRAGMENT_HEIGHT_COOKIE_NAME}=';
    const parts = document.cookie.split(/;\\s*/);
    for (const part of parts) {
      if (!part.startsWith(prefix)) continue;
      const raw = part.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return null;
  };

  const readCookieHeights = (viewport) => {
    const raw = readCookieValue();
    if (!raw) return null;
    const [version, rawPath, rawLang, rawViewport, rawSignature, rawHeights] = raw.split('|');
    if (version !== 'v1') return null;
    const cookiePath = normalizePath(rawPath ? decodeURIComponent(rawPath) : '');
    const cookieLang = rawLang ? decodeURIComponent(rawLang) : '';
    if (
      cookiePath !== normalizePath(route.path) ||
      cookieLang !== route.lang ||
      rawViewport !== viewport ||
      rawSignature !== route.planSignature
    ) {
      return null;
    }
    return (rawHeights ?? '').split(',').map((value) => normalizeHeight(value));
  };

  const writeCookieHeight = (planIndex, height) => {
    const viewport = getViewport();
    const existing = readCookieHeights(viewport) ?? [];
    const heights = Array.from(
      { length: Math.max(route.fragmentOrder.length, existing.length) },
      (_, index) => existing[index] ?? null
    );
    if (planIndex >= 0 && planIndex < heights.length) {
      heights[planIndex] = normalizeHeight(height);
    }
    const value = [
      'v1',
      encodeURIComponent(normalizePath(route.path)),
      encodeURIComponent(route.lang),
      viewport,
      route.planSignature,
      heights.map((entry) => normalizeHeight(entry) ?? '').join(',')
    ].join('|');
    document.cookie =
      '${FRAGMENT_HEIGHT_COOKIE_NAME}=' +
      encodeURIComponent(value) +
      '; path=/; max-age=${FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS}; samesite=lax';
  };

  const waitForImages = (card) =>
    new Promise((resolve) => {
      const pendingImages = Array.from(card.querySelectorAll('img')).filter(
        (image) => !(image.complete && image.naturalWidth >= 0)
      );
      if (pendingImages.length === 0) {
        resolve();
        return;
      }
      let remaining = pendingImages.length;
      const handleDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
        }
      };
      pendingImages.forEach((image) => {
        image.addEventListener('load', handleDone, { once: true });
        image.addEventListener('error', handleDone, { once: true });
      });
    });

  const nextFrame = () =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });

  const measureHeight = (card, fallbackHeight) =>
    Math.max(
      card.getAttribute('data-fragment-height-locked') === 'true'
        ? Math.ceil(card.scrollHeight || 0)
        : 0,
      Math.ceil(card.getBoundingClientRect?.().height || 0),
      normalizeHeight(fallbackHeight) ?? 0
    );

  const waitForStableHeight = async (card, fallbackHeight) => {
    let lastHeight = -1;
    let remainingStableFrames = 2;
    for (;;) {
      await nextFrame();
      const nextHeight = measureHeight(card, fallbackHeight);
      if (lastHeight >= 0 && Math.abs(nextHeight - lastHeight) <= 1) {
        remainingStableFrames -= 1;
        if (remainingStableFrames <= 0) {
          return nextHeight;
        }
      } else {
        remainingStableFrames = 2;
      }
      lastHeight = nextHeight;
    }
  };

  const persistHeights = async () => {
    const targets = Array.from(document.querySelectorAll('.fragment-card[data-fragment-id]'))
      .map((card) => {
        const fragmentId = card.getAttribute('data-fragment-id');
        if (!fragmentId) return null;
        const planIndex = route.fragmentOrder.indexOf(fragmentId);
        if (planIndex < 0) return null;
        const reservedHeight =
          normalizeHeight(card.getAttribute('data-fragment-height-hint')) ??
          normalizeHeight(getComputedStyle(card).getPropertyValue('--fragment-min-height')) ??
          0;
        return { card, fragmentId, planIndex, reservedHeight };
      })
      .filter(Boolean);

    await Promise.all(targets.map(({ card }) => waitForImages(card)));
    const measuredHeights = await Promise.all(
      targets.map(({ card, reservedHeight }) => waitForStableHeight(card, reservedHeight))
    );

    targets.forEach((target, index) => {
      const { card, fragmentId, planIndex, reservedHeight } = target;
      const settledHeight = Math.max(normalizeHeight(measuredHeights[index]) ?? 0, reservedHeight);
      if (settledHeight <= 0) return;
      card.style.setProperty('--fragment-min-height', settledHeight + 'px');
      card.setAttribute('data-fragment-height-hint', String(settledHeight));
      try {
        window.localStorage.setItem(buildStorageKey(fragmentId, getViewport()), String(settledHeight));
      } catch {}
      writeCookieHeight(planIndex, settledHeight);
      card.dispatchEvent(
        new CustomEvent('prom:fragment-stable-height', {
          bubbles: true,
          detail: { fragmentId, height: settledHeight }
        })
      );
    });
  };

  const start = () => {
    void nextFrame().then(() => nextFrame()).then(() => persistHeights());
  };

  if (document.readyState === 'complete') {
    start();
    return;
  }

  window.addEventListener('load', start, { once: true });
})();`
