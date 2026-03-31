const FRAGMENT_HEIGHT_COOKIE_NAME = 'prom_frag_h'
const FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH = 1025
const FRAGMENT_HEIGHT_BUCKET_STEP = 160

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const buildFragmentHeightPersistenceScript = ({
  path,
  lang,
  fragmentOrder,
  planSignature,
  versionSignature
}: {
  path: string
  lang: string
  fragmentOrder: string[]
  planSignature: string
  versionSignature?: string | null
}) =>
  `(() => {
  const route = ${serializeJson({ path, lang, fragmentOrder, planSignature, versionSignature: versionSignature ?? '' })};
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

  const normalizeWidth = (value) => {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(1, Math.round(parsed));
  };

  const normalizeBucket = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed ? trimmed : null;
  };

  const getViewport = (width) => {
    const resolvedWidth = normalizeWidth(width) ?? window.innerWidth;
    return resolvedWidth >= ${FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH} ? 'desktop' : 'mobile';
  };

  const buildStorageKey = (fragmentId, viewport, widthBucket) =>
    [
      'fragment:stable-height:v2',
      encodeURIComponent(normalizePath(route.path)),
      encodeURIComponent(String(route.lang)),
      viewport,
      encodeURIComponent(route.planSignature),
      encodeURIComponent(route.versionSignature || ''),
      encodeURIComponent(normalizeBucket(widthBucket) || ''),
      encodeURIComponent(fragmentId)
    ].join(':');

  const buildLegacyStorageKey = (fragmentId, viewport) =>
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

  const readCookieHeights = (viewport, widthBucket) => {
    const raw = readCookieValue();
    if (!raw) return null;
    const parts = raw.split('|');
    if (parts[0] === 'v2') {
      const [, rawPath, rawLang, rawViewport, rawSignature, rawVersionSignature, rawWidthBucket, rawHeights] = parts;
      const cookiePath = normalizePath(rawPath ? decodeURIComponent(rawPath) : '');
      const cookieLang = rawLang ? decodeURIComponent(rawLang) : '';
      const cookieVersionSignature = rawVersionSignature ? decodeURIComponent(rawVersionSignature) : '';
      const cookieWidthBucket = normalizeBucket(rawWidthBucket ? decodeURIComponent(rawWidthBucket) : '');
      if (
        cookiePath !== normalizePath(route.path) ||
        cookieLang !== route.lang ||
        rawViewport !== viewport ||
        rawSignature !== route.planSignature ||
        cookieVersionSignature !== (route.versionSignature || '') ||
        cookieWidthBucket !== normalizeBucket(widthBucket)
      ) {
        return null;
      }
      return (rawHeights ?? '').split(',').map((value) => normalizeHeight(value));
    }

    if (parts[0] !== 'v1') return null;
    const [, rawPath, rawLang, rawViewport, rawSignature, rawHeights] = parts;
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

  const writeCookieHeight = (planIndex, height, widthBucket) => {
    const viewport = getViewport();
    const existing = readCookieHeights(viewport, widthBucket) ?? [];
    const heights = Array.from({ length: Math.max(route.fragmentOrder.length, existing.length) }, (_, index) => existing[index] ?? null);
    if (planIndex >= 0 && planIndex < heights.length) {
      heights[planIndex] = normalizeHeight(height);
    }
    const value = [
      'v2',
      encodeURIComponent(normalizePath(route.path)),
      encodeURIComponent(route.lang),
      viewport,
      route.planSignature,
      encodeURIComponent(route.versionSignature || ''),
      encodeURIComponent(normalizeBucket(widthBucket) || ''),
      heights.map((entry) => normalizeHeight(entry) ?? '').join(',')
    ].join('|');
    document.cookie =
      '${FRAGMENT_HEIGHT_COOKIE_NAME}=' +
      encodeURIComponent(value) +
      '; path=/; max-age=${FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS}; samesite=lax';
  };

  const readCardHint = (card) =>
    normalizeHeight(card.getAttribute('data-fragment-height-hint')) ??
    normalizeHeight(card.getAttribute('data-pretext-card-height')) ??
    normalizeHeight(getComputedStyle(card).getPropertyValue('--fragment-reserved-height')) ??
    normalizeHeight(getComputedStyle(card).getPropertyValue('--fragment-min-height')) ??
    0;

  const writeReservedHeight = (card, height) => {
    const normalizedHeight = normalizeHeight(height);
    if (normalizedHeight === null) return null;
    card.style.setProperty('--fragment-reserved-height', normalizedHeight + 'px');
    card.style.removeProperty('--fragment-min-height');
    card.setAttribute('data-fragment-height-hint', String(normalizedHeight));
    return normalizedHeight;
  };

  const dispatchStableHeight = (card, fragmentId, height, previousHeight, force = false) => {
    const normalizedHeight = normalizeHeight(height);
    if (normalizedHeight === null) return false;
    if (!force && Math.abs(normalizedHeight - (normalizeHeight(previousHeight) ?? 0)) <= 1) {
      return false;
    }
    card.dispatchEvent(
      new CustomEvent('prom:fragment-stable-height', {
        bubbles: true,
        detail: { fragmentId, height: normalizedHeight }
      })
    );
    return true;
  };

  const readCardSize = (card) => {
    const raw = String(card.getAttribute('data-size') || '').trim();
    return raw === 'small' || raw === 'big' || raw === 'tall' ? raw : null;
  };

  const readLayout = (card) => {
    const raw = card.getAttribute('data-fragment-height-layout');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const buildFallbackLayout = (card) => {
    const minHeight = readCardHint(card);
    const size = readCardSize(card);
    if (minHeight <= 0 && !size) return null;
    return {
      ...(size ? { size } : {}),
      ...(minHeight > 0 ? { minHeight } : {})
    };
  };

  const readWidthBucketHint = (card, viewport) => {
    const primaryAttr =
      viewport === 'desktop'
        ? 'data-fragment-width-bucket'
        : 'data-fragment-width-bucket-mobile';
    const fallbackAttr =
      viewport === 'desktop'
        ? 'data-fragment-width-bucket-mobile'
        : 'data-fragment-width-bucket';
    const primaryValue = normalizeBucket(card.getAttribute(primaryAttr));
    if (primaryValue) return primaryValue;
    return normalizeBucket(card.getAttribute(fallbackAttr));
  };

  const resolveCardWidthFromBucketHint = (widthBucket) => {
    const trimmed = normalizeBucket(widthBucket);
    if (!trimmed) return null;
    const [, rawMaxWidth = ''] = trimmed.split(':', 2);
    const parsed = Number.parseInt(String(rawMaxWidth).trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const resolveProfileBucket = (layout, viewport, cardWidth) => {
    const buckets = Array.isArray(layout?.heightProfile?.[viewport]) ? layout.heightProfile[viewport] : null;
    if (!buckets || buckets.length === 0) return null;
    const normalized = buckets
      .map((entry) => {
        const maxWidth = normalizeWidth(entry?.maxWidth);
        const height = normalizeHeight(entry?.height);
        if (maxWidth === null || height === null) return null;
        return { maxWidth, height };
      })
      .filter(Boolean)
      .sort((left, right) => left.maxWidth - right.maxWidth);
    if (!normalized.length) return null;
    const width = normalizeWidth(cardWidth);
    const selected =
      width === null
        ? normalized[0]
        : normalized.find((entry) => width <= entry.maxWidth) ?? normalized[normalized.length - 1];
    return selected ? { height: selected.height, widthBucket: 'profile:' + selected.maxWidth } : null;
  };

  const resolveWidthBucket = (layout, viewport, cardWidth) => {
    const profileBucket = resolveProfileBucket(layout, viewport, cardWidth);
    if (profileBucket) return profileBucket.widthBucket;
    const width = normalizeWidth(cardWidth);
    if (width === null) return null;
    const upperBound = Math.max(
      ${FRAGMENT_HEIGHT_BUCKET_STEP},
      Math.ceil(width / ${FRAGMENT_HEIGHT_BUCKET_STEP}) * ${FRAGMENT_HEIGHT_BUCKET_STEP}
    );
    return 'width:' + upperBound;
  };

  const resolveReservedHeight = ({ layout, viewport, cardWidth, cookieHeight, stableHeight, fallbackHeight }) => {
    const profileHeight = resolveProfileBucket(layout, viewport, cardWidth)?.height ?? null;
    const authoredHint = normalizeHeight(layout?.heightHint?.[viewport]);
    const minHeight = normalizeHeight(layout?.minHeight);
    const size = layout?.size === 'small'
      ? 440
      : layout?.size === 'big'
        ? 640
        : layout?.size === 'tall'
          ? 904
          : null;
    const fallback = minHeight ?? normalizeHeight(size) ?? normalizeHeight(fallbackHeight) ?? 180;
    const floor = Math.max(fallback, profileHeight ?? 0, authoredHint ?? 0);
    const candidate =
      normalizeHeight(stableHeight) ??
      normalizeHeight(cookieHeight) ??
      profileHeight ??
      authoredHint ??
      fallback;
    return Math.max(candidate ?? 180, floor);
  };

  const readStableHeight = (fragmentId, viewport, widthBucket) => {
    try {
      const stable = normalizeHeight(window.localStorage.getItem(buildStorageKey(fragmentId, viewport, widthBucket)));
      if (stable !== null) return stable;
      return normalizeHeight(window.localStorage.getItem(buildLegacyStorageKey(fragmentId, viewport)));
    } catch {
      return null;
    }
  };

  const readCurrentStableHeight = (fragmentId, viewport, widthBucket) => {
    try {
      return normalizeHeight(window.localStorage.getItem(buildStorageKey(fragmentId, viewport, widthBucket)));
    } catch {
      return null;
    }
  };

  const isCardVisible = (card) => {
    if (typeof card.getBoundingClientRect !== 'function') {
      return true;
    }
    const rect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return true;
    }
    return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;
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

  const buildTarget = (card) => {
    const fragmentId = card.getAttribute('data-fragment-id');
    if (!fragmentId) return null;
    const planIndex = route.fragmentOrder.indexOf(fragmentId);
    if (planIndex < 0) return null;
    const layout = readLayout(card) ?? buildFallbackLayout(card);
    const viewport = getViewport();
    const widthBucket =
      readWidthBucketHint(card, viewport) ?? null;
    const cardWidth =
      resolveCardWidthFromBucketHint(widthBucket) ??
      normalizeWidth(card.getBoundingClientRect?.().width || 0);
    const resolvedWidthBucket =
      widthBucket ?? resolveWidthBucket(layout, viewport, cardWidth);
    const cookieHeights = readCookieHeights(viewport, resolvedWidthBucket);
    const cookieHeight = cookieHeights?.[planIndex] ?? null;
    const stableHeight = readStableHeight(fragmentId, viewport, resolvedWidthBucket);
    const reservedHeight = resolveReservedHeight({
      layout,
      viewport,
      cardWidth,
      cookieHeight,
      stableHeight,
      fallbackHeight: readCardHint(card)
    });
    const currentStableHeight = readCurrentStableHeight(fragmentId, viewport, resolvedWidthBucket);

    if (reservedHeight > readCardHint(card)) {
      writeReservedHeight(card, reservedHeight);
    }

    return {
      card,
      fragmentId,
      planIndex,
      viewport,
      widthBucket: resolvedWidthBucket,
      reservedHeight,
      shouldMeasure: currentStableHeight === null && isCardVisible(card)
    };
  };

  const persistHeights = async () => {
    const targets = Array.from(document.querySelectorAll('.fragment-card[data-fragment-id]'))
      .map((card) => buildTarget(card))
      .filter(Boolean);
    const measurableTargets = targets
      .filter((target) => target.shouldMeasure)
      .map((target) => ({
        ...target,
        previousRenderedHeight: Math.ceil(target.card.getBoundingClientRect?.().height || 0)
      }));

    if (measurableTargets.length === 0) {
      return;
    }

    await Promise.all(measurableTargets.map(({ card }) => waitForImages(card)));
    const measuredHeights = await Promise.all(
      measurableTargets.map(({ card, reservedHeight }) => waitForStableHeight(card, reservedHeight))
    );

    measurableTargets.forEach((target, index) => {
      const { card, fragmentId, planIndex, viewport, widthBucket, reservedHeight, previousRenderedHeight } = target;
      const settledHeight = normalizeHeight(measuredHeights[index]) ?? 0;
      if (settledHeight <= 0) return;
      writeReservedHeight(card, settledHeight);
      try {
        window.localStorage.setItem(buildStorageKey(fragmentId, viewport, widthBucket), String(settledHeight));
      } catch {}
      writeCookieHeight(planIndex, settledHeight, widthBucket);
      if (settledHeight > reservedHeight) {
        card.dispatchEvent(
          new CustomEvent('prom:fragment-height-miss', {
            bubbles: true,
            detail: { fragmentId, reservedHeight, height: settledHeight, widthBucket }
          })
        );
      }
      dispatchStableHeight(card, fragmentId, settledHeight, previousRenderedHeight, false);
    });
  };

  const start = () => {
    void nextFrame().then(() => nextFrame()).then(() => persistHeights());
  };

  const scheduleStart = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => start(), { timeout: 1200 });
      return;
    }
    window.setTimeout(start, 240);
  };

  if (document.readyState === 'complete') {
    scheduleStart();
    return;
  }

  window.addEventListener('load', scheduleStart, { once: true });
})();`
