import {
  getFragmentTextCopy,
  getUiCopy,
  seedLanguageResources,
} from "../../lang/client";
import {
  buildFragmentHeightVersionSignature,
  getFragmentHeightViewport,
  readFragmentReservationHeight,
  writeFragmentReservationHeight,
} from "@prometheus/ui/fragment-height";
import type { Lang } from "../../lang";
import { FragmentRuntimeBridge } from "../../fragment/runtime/client-bridge";
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimeSizingMap,
} from "../../fragment/runtime/protocol";
import {
  getCspNonce,
  installTrustedTypesFunctionBridge,
  primeTrustedTypesPolicies,
  asTrustedScript,
  setTrustedInnerHtml,
} from "../../security/client";
import type { StaticFragmentRouteData } from "../fragments/fragment-static-data";
import { buildFragmentHeightPersistenceScript } from "../fragments/fragment-height-script";
import { patchStaticFragmentCard } from "../fragments/fragment-stream";
import type { StaticShellSeed } from "./seed";
import type { StaticFragmentRouteModel } from "../fragments/static-fragment-model";
import { persistInitialFragmentCardHeights } from "../fragments/fragment-height";
import type { FragmentPayload } from "../../fragment/types";
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR,
  STATIC_SHELL_MAIN_REGION,
  normalizeStaticShellRoutePath,
  STATIC_SHELL_REGION_ATTR,
} from "./constants";
import {
  clearStoreStaticBootstrapFlag,
  consumeRegisteredStoreStaticControllerCleanup,
} from "../store/store-static-controller-state";
import { createStaticFragmentRouteData } from "../fragments/static-fragment-model";
import { scheduleStaticShellTask } from "./scheduler";
import { runAfterClientIntentIdle } from "../../shared/client-boot";
import {
  staticDockRootNeedsSync,
  readStaticShellSeed,
  syncStaticDockRootState,
  writeStaticShellSeed,
} from "./seed-client";
import { loadStaticShellLanguageSeed } from "./language-seed-client";
import {
  applyStaticShellSnapshot,
  loadStaticShellSnapshot,
  resolvePreferredStaticShellLang,
  updateStaticShellUrlLang,
} from "./snapshot-client";
import { shouldRetryFragmentStream } from "../fragments/fragment-stream-error";
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState,
} from "../../shared/overlay-a11y";
import { getPublicFragmentApiBase } from "../../shared/public-fragment-config";
import { appConfig } from "../../site-config";
import type { StoreSeed } from "../../features/store/store-seed";
import {
  createStaticShellThemeIcon,
  ensureStaticShellSettingsOverlay,
  ensureStaticShellSettingsPanelContent,
  readStaticShellTheme,
} from "./settings-overlay-dom";
import { acquirePretextDomController } from "../pretext/pretext-dom";

const loadStaticAuthClient = () => import("../auth/auth-client");
const loadStaticSettingsController = () =>
  import("./controllers/settings-static-controller");

type Theme = "light" | "dark";

type StaticFragmentController = {
  isAuthenticated: boolean;
  lang: Lang;
  path: string;
  snapshotKey: string;
  authPolicy: StaticShellSeed["authPolicy"];
  streamAbort: AbortController | null;
  streamRetryTimer: number;
  streamStartCancel: (() => void) | null;
  cleanupFns: Array<() => void>;
  destroyed: boolean;
  routeData: StaticFragmentRouteData;
  visibleFragmentIds: Set<string>;
  sharedRuntime: FragmentRuntimeBridge | null;
  commitQueue: StaticFragmentCommitQueue | null;
  didStartDirectStreamStartup: boolean;
};

type StaticFragmentCommitQueue = {
  enqueue: (payload: FragmentPayload) => void;
  setVisible: (fragmentId: string, visible: boolean) => void;
  flushNow: () => void;
  destroy: () => void;
};

const STATIC_THEME_STORAGE_KEY = "prometheus-theme";
const STATIC_THEME_COOKIE_KEY = "prometheus-theme";
const STATIC_THEME_PREFERENCE_KEY = "prometheus:pref:theme";
const STATIC_LANG_STORAGE_KEY = "prometheus-lang";
const STATIC_LANG_COOKIE_KEY = "prometheus-lang";
const STATIC_LANG_PREFERENCE_KEY = "prometheus:pref:locale";
const DARK_THEME_COLOR = "#0f172a";
const LIGHT_THEME_COLOR = "#f97316";
const STATIC_FRAGMENT_STREAM_ROOT_MARGIN = appConfig.fragmentVisibilityMargin;
const STATIC_FRAGMENT_STREAM_THRESHOLD = appConfig.fragmentVisibilityThreshold;
const STATIC_FRAGMENT_RUNTIME_ATTR = "data-static-fragment-runtime";
let activeController: StaticFragmentController | null = null;
let fragmentStreamRuntimePromise: Promise<
  typeof import("../fragments/fragment-stream")
> | null = null;
let languageSwapInFlight = false;

const readJsonScript = <T>(id: string): T | null => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLScriptElement) || !element.textContent)
    return null;
  try {
    return JSON.parse(element.textContent) as T;
  } catch {
    return null;
  }
};

installTrustedTypesFunctionBridge();

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

const escapeHtmlAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
};

const setThemeCookie = (value: Theme) => {
  document.cookie = `${STATIC_THEME_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};

const setLangCookie = (value: Lang) => {
  document.cookie = `${STATIC_LANG_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};

const setDocumentTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      value === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
    );
  }
};

const persistStaticTheme = (value: Theme) => {
  setDocumentTheme(value);
  writeLocalStorageValue(STATIC_THEME_STORAGE_KEY, value);
  writeLocalStorageValue(STATIC_THEME_PREFERENCE_KEY, value);
  setThemeCookie(value);
};

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value;
};

const persistStaticLang = (value: Lang) => {
  setDocumentLang(value);
  writeLocalStorageValue(STATIC_LANG_STORAGE_KEY, value);
  writeLocalStorageValue(STATIC_LANG_PREFERENCE_KEY, value);
  setLangCookie(value);
};

const updateFragmentStatus = (
  lang: Lang,
  state: "idle" | "streaming" | "error",
) => {
  const element = document.querySelector<HTMLElement>(
    "[data-static-fragment-status]",
  );
  if (!element) return;
  const copy = getUiCopy(lang);
  const label =
    state === "streaming"
      ? copy.fragmentStatusStreaming
      : state === "error"
        ? copy.fragmentStatusStalled
        : copy.fragmentStatusIdle;
  element.dataset.state = state;
  element.setAttribute("aria-label", label);
};

const loadFragmentStreamRuntime = () => {
  if (!fragmentStreamRuntimePromise) {
    fragmentStreamRuntimePromise = import("../fragments/fragment-stream");
  }
  return fragmentStreamRuntimePromise;
};

const syncStaticFragmentDockIfNeeded = async (
  controller: Pick<
    StaticFragmentController,
    "isAuthenticated" | "lang" | "path"
  >,
) => {
  const dockState = {
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    lang: controller.lang,
  };

  if (!staticDockRootNeedsSync(dockState)) {
    syncStaticDockRootState(dockState);
    return;
  }

  const dockRoot = syncStaticDockRootState(dockState);
  if (!dockRoot) return;

  const { syncStaticDockMarkup } = await import("../home/home-dock-dom");
  syncStaticDockMarkup({
    root: dockRoot,
    lang: controller.lang,
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    force: true,
    lockMetrics: true,
  });
};

const refreshStaticFragmentDockAuthIfNeeded = async (
  controller: StaticFragmentController,
) => {
  const { loadClientAuthSession } = await loadStaticAuthClient();
  const session = await loadClientAuthSession();
  if (controller.destroyed) return;
  const isAuthenticated = session.status === "authenticated";
  if (controller.isAuthenticated === isAuthenticated) return;
  controller.isAuthenticated = isAuthenticated;
  writeStaticShellSeed({ isAuthenticated });
  await syncStaticFragmentDockIfNeeded(controller);
};

const refreshThemeButton = (lang: Lang) => {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-static-theme-toggle]",
  );
  if (!button) return;
  const theme = readStaticShellTheme();
  const copy = getUiCopy(lang);
  button.dataset.theme = theme;
  button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  button.setAttribute(
    "aria-label",
    theme === "dark" ? copy.themeAriaToLight : copy.themeAriaToDark,
  );
  button.replaceChildren(createStaticShellThemeIcon(theme));
};

const hasStaticFragmentRoot = () =>
  Boolean(document.querySelector("[data-static-fragment-root]"));
const collectStaticFragmentCardIds = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`),
  )
    .map((element) => element.dataset.fragmentId)
    .filter((id): id is string => Boolean(id));

const collectVisibleStreamIds = (
  controller: Pick<
    StaticFragmentController,
    "routeData" | "visibleFragmentIds"
  >,
) =>
  controller.routeData.fragmentOrder.filter((id) =>
    controller.visibleFragmentIds.has(id),
  );

const setStaticFragmentRuntimeMode = (
  mode: "worker" | "direct" | "idle",
) => {
  document
    .querySelector<HTMLElement>("[data-static-fragment-root]")
    ?.setAttribute(STATIC_FRAGMENT_RUNTIME_ATTR, mode);
};

const createStaticFragmentCommitQueue = (
  controller: Pick<StaticFragmentController, "lang" | "routeData" | "visibleFragmentIds">,
): StaticFragmentCommitQueue => {
  const pendingPayloads = new Map<string, FragmentPayload>();
  let cancelScheduledFlush: (() => void) | null = null;
  let cancelHiddenFlush: (() => void) | null = null;
  let hiddenFlushReleased = false;
  let destroyed = false;

  const isEligible = (fragmentId: string) => {
    const card = getStaticFragmentCard(fragmentId);
    if (!card) return true;
    if (card.dataset.critical === "true") return true;
    return hiddenFlushReleased || controller.visibleFragmentIds.has(fragmentId);
  };

  const hasEligiblePayload = () =>
    controller.routeData.fragmentOrder.some(
      (fragmentId) =>
        pendingPayloads.has(fragmentId) && isEligible(fragmentId),
    );

  const hasHiddenPayload = () =>
    controller.routeData.fragmentOrder.some(
      (fragmentId) =>
        pendingPayloads.has(fragmentId) && !isEligible(fragmentId),
    );

  const flushNext = () => {
    let processed = false;
    controller.routeData.fragmentOrder.forEach((fragmentId) => {
      const payload = pendingPayloads.get(fragmentId);
      if (!payload || !isEligible(fragmentId)) return;
      pendingPayloads.delete(fragmentId);
      patchStaticFragmentCard(payload, controller.routeData, document);
      syncRouteDataVersion(controller.routeData, payload.id, payload.cacheUpdatedAt);
      processed = true;
    });
    return processed;
  };

  const flushNow = () => {
    if (destroyed) return;
    cancelScheduledFlush?.();
    cancelScheduledFlush = null;
    while (flushNext()) {
      // Drain immediately-eligible worker commits in a single turn.
    }
    scheduleFlush();
  };

  const scheduleHiddenFlush = () => {
    if (destroyed || hiddenFlushReleased || cancelHiddenFlush || !hasHiddenPayload()) {
      return;
    }
    cancelHiddenFlush = scheduleStaticShellTask(
      () => {
        cancelHiddenFlush = null;
        if (destroyed) return;
        hiddenFlushReleased = true;
        flushNow();
      },
      {
        waitForPaint: true,
        priority: "background",
        preferIdle: false,
        timeoutMs: 0,
      },
    );
  };

  const scheduleFlush = () => {
    if (destroyed || cancelScheduledFlush || !hasEligiblePayload()) return;
    cancelScheduledFlush = scheduleStaticShellTask(
      () => {
        cancelScheduledFlush = null;
        if (destroyed) return;
        while (flushNext()) {
          // Drain all visible/critical commits in one scheduled turn.
        }
        if (hasHiddenPayload()) {
          scheduleHiddenFlush();
        }
      },
      {
        priority: "user-visible",
        preferIdle: false,
        timeoutMs: 0,
      },
    );
  };

  return {
    enqueue(payload) {
      if (destroyed) return;
      pendingPayloads.set(payload.id, payload);
      flushNow();
      scheduleHiddenFlush();
    },
    setVisible(fragmentId, visible) {
      if (destroyed) return;
      if (visible) {
        controller.visibleFragmentIds.add(fragmentId);
      } else {
        controller.visibleFragmentIds.delete(fragmentId);
      }
      flushNow();
      scheduleHiddenFlush();
    },
    flushNow,
    destroy() {
      destroyed = true;
      pendingPayloads.clear();
      cancelScheduledFlush?.();
      cancelScheduledFlush = null;
      cancelHiddenFlush?.();
      cancelHiddenFlush = null;
    },
  };
};

const escapeFragmentId = (value: string) => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
};

const getStaticFragmentCard = (fragmentId: string) =>
  document.querySelector<HTMLElement>(
    `[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${escapeFragmentId(fragmentId)}"]`,
  );

const readStaticFragmentHeightHint = (card: HTMLElement) => {
  return readFragmentReservationHeight(card);
};

const readStaticFragmentCardWidth = (card: HTMLElement) => {
  const width = Math.ceil(card.getBoundingClientRect().width);
  return width > 0 ? width : null;
};

const readStaticFragmentWidthBucketHint = (card: HTMLElement) => {
  const viewport = getFragmentHeightViewport(
    typeof window !== "undefined" ? window.innerWidth : undefined,
  );
  const primaryAttr =
    viewport === "desktop"
      ? STATIC_FRAGMENT_WIDTH_BUCKET_ATTR
      : STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR;
  const fallbackAttr =
    viewport === "desktop"
      ? STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR
      : STATIC_FRAGMENT_WIDTH_BUCKET_ATTR;
  return card.getAttribute(primaryAttr) ?? card.getAttribute(fallbackAttr) ?? null;
};

const collectStaticFragmentKnownVersions = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`),
  ).reduce<Record<string, number>>((acc, card) => {
    const fragmentId = card.dataset.fragmentId;
    const rawVersion = card.getAttribute(STATIC_FRAGMENT_VERSION_ATTR);
    const parsedVersion = rawVersion ? Number(rawVersion) : Number.NaN;
    if (fragmentId && Number.isFinite(parsedVersion)) {
      acc[fragmentId] = parsedVersion;
    }
    return acc;
  }, {});

const collectStaticFragmentSizingSeeds = (
  fragmentOrder: string[],
): FragmentRuntimeSizingMap =>
  fragmentOrder.reduce<FragmentRuntimeSizingMap>((acc, fragmentId) => {
    const card = getStaticFragmentCard(fragmentId);
    if (!card) return acc;
    const stableHeight = readStaticFragmentHeightHint(card);
    const widthBucket = readStaticFragmentWidthBucketHint(card);
    if (stableHeight === null && widthBucket === null) {
      return acc;
    }
    acc[fragmentId] = {
      stableHeight,
      widthBucket,
    };
    return acc;
  }, {});

const applySharedRuntimeSizing = (sizing: FragmentRuntimeCardSizing) => {
  const card = getStaticFragmentCard(sizing.fragmentId);
  if (!card) return;
  if (sizing.reservedHeight > 0) {
    writeFragmentReservationHeight(card, sizing.reservedHeight);
  }
};

const readShellSeed = () => readStaticShellSeed();

const readRouteData = (shellSeed: StaticShellSeed) =>
  readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID) ??
  createStaticFragmentRouteData({
    path: shellSeed.currentPath || window.location.pathname,
    lang: shellSeed.lang,
  });

const cloneStoreSeed = (seed: StoreSeed | null | undefined): StoreSeed | null =>
  seed ? (JSON.parse(JSON.stringify(seed)) as StoreSeed) : null;

const hasStoreSeedData = (seed: StoreSeed | null | undefined) => {
  const streamItems = seed?.stream?.items;
  if (Array.isArray(streamItems) && streamItems.length > 0) return true;
  const cartItems = seed?.cart?.items;
  if (Array.isArray(cartItems) && cartItems.length > 0) return true;
  return typeof seed?.cart?.queuedCount === "number" && seed.cart.queuedCount > 0;
};

export const mergeStaticStoreSeedForSnapshot = (
  current: StaticFragmentRouteData | null,
  next: StaticFragmentRouteData | null,
) => {
  if (!current || !next) return next;
  if (
    normalizeStaticShellRoutePath(current.path) !== "/store" ||
    normalizeStaticShellRoutePath(next.path) !== "/store"
  ) {
    return next;
  }
  if (hasStoreSeedData(next.storeSeed) || !hasStoreSeedData(current.storeSeed)) {
    return next;
  }
  return {
    ...next,
    storeSeed: cloneStoreSeed(current.storeSeed),
  };
};

const writeStaticFragmentRouteData = (routeData: StaticFragmentRouteData | null) => {
  if (!routeData) return null;
  const element = document.getElementById(STATIC_FRAGMENT_DATA_SCRIPT_ID);
  if (!(element instanceof HTMLScriptElement)) return null;
  (element as unknown as { text: string | ReturnType<typeof asTrustedScript> }).text =
    asTrustedScript(serializeJson(routeData));
  return routeData;
};

const syncRouteDataVersion = (
  routeData: StaticFragmentRouteData,
  fragmentId: string,
  cacheUpdatedAt?: number,
) => {
  if (!Number.isFinite(cacheUpdatedAt)) return;
  routeData.fragmentVersions = {
    ...routeData.fragmentVersions,
    [fragmentId]: cacheUpdatedAt as number,
  };
  routeData.versionSignature = buildFragmentHeightVersionSignature(
    routeData.fragmentVersions,
    routeData.fragmentOrder,
  );
  writeStaticFragmentRouteData(routeData);
};

const connectSharedFragmentRuntime = (
  controller: StaticFragmentController,
) => {
  controller.sharedRuntime?.dispose();
  controller.sharedRuntime = null;

  const runtimePlanEntries = controller.routeData.runtimePlanEntries ?? [];
  if (!runtimePlanEntries.length) {
    setStaticFragmentRuntimeMode("direct");
    return false;
  }

  const bridge = new FragmentRuntimeBridge();
  const connected = bridge.connect({
    clientId:
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? `static-fragment-runtime:${crypto.randomUUID()}`
        : `static-fragment-runtime:${Date.now().toString(36)}`,
    apiBase: getPublicFragmentApiBase(),
    path: controller.routeData.path,
    lang: controller.lang,
    planEntries: runtimePlanEntries,
    fetchGroups: controller.routeData.runtimeFetchGroups ?? [],
    initialFragments: controller.routeData.runtimeInitialFragments ?? [],
    initialSizing: collectStaticFragmentSizingSeeds(
      controller.routeData.fragmentOrder,
    ),
    knownVersions: collectStaticFragmentKnownVersions(),
    visibleIds: collectVisibleStreamIds(controller),
    viewportWidth: window.innerWidth,
    enableStreaming: true,
    startupMode: "eager-visible-first",
    onCommit: (payload) => {
      controller.commitQueue?.enqueue(payload);
    },
    onSizing: applySharedRuntimeSizing,
    onStatus: (nextStatus) => {
      updateFragmentStatus(
        controller.lang,
        nextStatus === "idle" ? "idle" : "streaming",
      );
    },
    onError: (message) => {
      console.error("Static fragment worker runtime failed:", message);
      updateFragmentStatus(controller.lang, "error");
    },
  });

  if (!connected) {
    setStaticFragmentRuntimeMode("direct");
    return false;
  }

  controller.sharedRuntime = bridge;
  setStaticFragmentRuntimeMode("worker");

  const handleStableHeight = (event: Event) => {
    const detail = (
      event as CustomEvent<{ fragmentId?: string; height?: number }>
    ).detail;
    const fragmentId = detail?.fragmentId?.trim();
    if (!fragmentId || typeof detail.height !== "number") return;
    const card = getStaticFragmentCard(fragmentId);
    if (!card) return;
    bridge.measureCard(
      fragmentId,
      Math.ceil(detail.height),
      readStaticFragmentCardWidth(card),
      card.dataset.fragmentReady === "true",
    );
  };

  document.addEventListener(
    "prom:fragment-stable-height",
    handleStableHeight as EventListener,
  );
  controller.cleanupFns.push(() =>
    document.removeEventListener(
      "prom:fragment-stable-height",
      handleStableHeight as EventListener,
    ),
  );

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target as HTMLElement;
        const fragmentId = card.dataset.fragmentId;
        if (!fragmentId) return;
        const width = readStaticFragmentCardWidth(card);
        if (width !== null) {
          bridge.reportCardWidth(fragmentId, width);
        }
        if (card.dataset.fragmentReady === "true") {
          bridge.measureCard(
            fragmentId,
            Math.ceil(entry.contentRect.height),
            width,
            true,
          );
        }
      });
    });
    document
      .querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`)
      .forEach((card) => resizeObserver.observe(card));
    controller.cleanupFns.push(() => resizeObserver.disconnect());
  }

  return true;
};

const swapStaticFragmentLanguage = async (nextLang: Lang) => {
  if (languageSwapInFlight) return;
  const shellSeed = readShellSeed();
  if (!shellSeed || shellSeed.lang === nextLang) return;
  languageSwapInFlight = true;
  const currentRouteData = activeController?.routeData ?? readRouteData(shellSeed);

  try {
    const snapshot = await loadStaticShellSnapshot(
      shellSeed.snapshotKey,
      nextLang,
    );
    const languageSeed = await loadStaticShellLanguageSeed(
      shellSeed.currentPath || window.location.pathname,
      nextLang,
    );
    await destroyController(activeController);
    activeController = null;
    applyStaticShellSnapshot(snapshot, {
      dockState: {
        lang: nextLang,
        currentPath: shellSeed.currentPath || window.location.pathname,
        isAuthenticated: shellSeed.isAuthenticated ?? false,
      },
    });
    writeStaticFragmentRouteData(
      mergeStaticStoreSeedForSnapshot(
        currentRouteData,
        readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID),
      ),
    );
    writeStaticShellSeed({
      lang: nextLang,
      currentPath: shellSeed.currentPath || window.location.pathname,
      snapshotKey: shellSeed.snapshotKey,
      languageSeed,
      isAuthenticated: shellSeed.isAuthenticated,
    });
    persistStaticLang(nextLang);
    updateStaticShellUrlLang(nextLang);
    await bootstrapStaticFragmentShell();
  } catch (error) {
    console.error("Failed to switch static fragment language:", error);
  } finally {
    languageSwapInFlight = false;
  }
};

const bindShellControls = (controller: StaticFragmentController) => {
  const settingsRoot = document.querySelector<HTMLElement>(".topbar-settings");
  const settingsToggle = document.querySelector<HTMLButtonElement>(
    "[data-static-settings-toggle]",
  );
  const overlay =
    settingsRoot
      ? ensureStaticShellSettingsOverlay({
          settingsRoot,
          lang: controller.lang,
          copy: getUiCopy(controller.lang),
        })
      : null;

  if (!settingsRoot || !settingsToggle || !overlay)
    return;

  const { settingsPanel, languageMenuToggle, languageDrawer, themeToggle } =
    overlay;
  let settingsPanelContentPromise: Promise<unknown> | null = null;
  let settingsControllerCleanup: (() => void) | null = null;

  const ensureSettingsContent = () => {
    settingsPanelContentPromise ??= Promise.resolve(
      ensureStaticShellSettingsPanelContent({
        settingsPanel,
        lang: controller.lang,
      }),
    ).then(() => {
      if (!settingsControllerCleanup) {
        return loadStaticSettingsController().then(
          ({ mountStaticSettingsController }) => {
            settingsControllerCleanup = mountStaticSettingsController({
              lang: controller.lang,
            }).cleanup;
          },
        );
      }
      return undefined;
    });
    return settingsPanelContentPromise;
  };

  const closeLanguageMenu = (restoreFocus = false) => {
    const wasOpen = languageDrawer?.dataset.open === "true";
    if (restoreFocus && wasOpen && languageMenuToggle) {
      restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle);
    }
    setOverlaySurfaceState(languageDrawer, false);
    if (languageMenuToggle) {
      languageMenuToggle.setAttribute("aria-expanded", "false");
    }
  };

  const closeMenus = (restoreFocus = false) => {
    const wasOpen = settingsRoot.dataset.open === "true";
    settingsRoot.dataset.open = "false";
    settingsToggle.setAttribute("aria-expanded", "false");
    closeLanguageMenu(false);
    if (restoreFocus && wasOpen) {
      restoreOverlayFocusBeforeHide(settingsPanel, settingsToggle);
    }
    setOverlaySurfaceState(settingsPanel, false);
  };

  const toggleSettings = () => {
    const next = settingsRoot.dataset.open !== "true";
    settingsRoot.dataset.open = next ? "true" : "false";
    settingsToggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (!next) {
      closeMenus(false);
      return;
    }
    void ensureSettingsContent();
    setOverlaySurfaceState(settingsPanel, true);
    focusOverlayEntry(settingsPanel, languageMenuToggle ?? themeToggle);
  };

  const toggleLanguageMenu = () => {
    if (!languageDrawer || !languageMenuToggle) return;
    const next = languageDrawer.dataset.open !== "true";
    setOverlaySurfaceState(languageDrawer, next);
    languageMenuToggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      focusOverlayEntry(languageDrawer, [
        'input[name="static-topbar-language"]:checked',
        'input[name="static-topbar-language"]',
      ]);
      return;
    }
    restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle);
    setOverlaySurfaceState(languageDrawer, false);
  };

  const handleThemeClick = () => {
    const nextTheme: Theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    persistStaticTheme(nextTheme);
    refreshThemeButton(controller.lang);
  };

  settingsToggle.addEventListener("click", toggleSettings);
  themeToggle.addEventListener("click", handleThemeClick);
  controller.cleanupFns.push(() =>
    settingsToggle.removeEventListener("click", toggleSettings),
  );
  controller.cleanupFns.push(() =>
    themeToggle.removeEventListener("click", handleThemeClick),
  );
  controller.cleanupFns.push(
    bindOverlayDismiss({
      root: settingsRoot,
      onDismiss: () => {
        if (
          settingsRoot.dataset.open !== "true" &&
          languageDrawer?.dataset.open !== "true"
        ) {
          return;
        }
        closeMenus(true);
      },
    }),
  );

  if (languageMenuToggle && languageDrawer) {
    languageMenuToggle.addEventListener("click", toggleLanguageMenu);
    controller.cleanupFns.push(() =>
      languageMenuToggle.removeEventListener("click", toggleLanguageMenu),
    );
  }

  document
    .querySelectorAll<HTMLInputElement>("[data-static-language-option]")
    .forEach((input) => {
      const handleChange = () => {
        const nextLang = input.dataset.lang as Lang | undefined;
        input.blur();
        const finalizeLanguageChange = () => {
          closeMenus(true);
          if (!nextLang || nextLang === controller.lang) return;
          void swapStaticFragmentLanguage(nextLang);
        };
        if (typeof queueMicrotask === "function") {
          queueMicrotask(finalizeLanguageChange);
          return;
        }
        finalizeLanguageChange();
      };

      input.addEventListener("change", handleChange);
      controller.cleanupFns.push(() =>
        input.removeEventListener("change", handleChange),
      );
    });

  setOverlaySurfaceState(settingsPanel, false);
  closeLanguageMenu(false);
  refreshThemeButton(controller.lang);
  controller.cleanupFns.push(() => {
    settingsControllerCleanup?.();
    settingsControllerCleanup = null;
  });
};

const stopConnections = (controller: StaticFragmentController) => {
  controller.sharedRuntime?.pause();
  controller.streamStartCancel?.();
  controller.streamStartCancel = null;
  if (controller.streamAbort) {
    controller.streamAbort.abort();
    controller.streamAbort = null;
  }
  if (controller.streamRetryTimer) {
    window.clearTimeout(controller.streamRetryTimer);
    controller.streamRetryTimer = 0;
  }
};

const scheduleStreamRetry = (
  controller: StaticFragmentController,
  delayMs: number,
) => {
  if (controller.destroyed || !hasStaticFragmentRoot()) return;
  controller.streamRetryTimer = window.setTimeout(() => {
    controller.streamRetryTimer = 0;
    void startDeferredStream(controller);
  }, delayMs);
};

const startDeferredStream = async (controller: StaticFragmentController) => {
  if (controller.destroyed || !hasStaticFragmentRoot()) return;
  if (controller.streamAbort) {
    controller.streamAbort.abort();
  }

  const visibleIds = collectVisibleStreamIds(controller);
  if (controller.sharedRuntime) {
    controller.sharedRuntime.resumeAfterPageShow();
    controller.sharedRuntime.setVisibleIds(visibleIds);
    if (visibleIds.length) {
      controller.sharedRuntime.resume();
    } else {
      updateFragmentStatus(controller.lang, "idle");
    }
    return;
  }

  const streamIds = controller.didStartDirectStreamStartup
    ? visibleIds
    : controller.routeData.fragmentOrder;
  if (streamIds.length === 0) {
    controller.streamAbort = null;
    updateFragmentStatus(controller.lang, "idle");
    return;
  }

  const streamAbort = new AbortController();
  controller.streamAbort = streamAbort;
  controller.didStartDirectStreamStartup = true;
  setStaticFragmentRuntimeMode("direct");
  updateFragmentStatus(controller.lang, "streaming");

  try {
    const runtime = await loadFragmentStreamRuntime();
    await runtime.streamStaticFragments({
      path: controller.routeData.path,
      lang: controller.lang,
      ids: streamIds,
      signal: streamAbort.signal,
      routeData: controller.routeData,
      onFragment: () => {
        updateFragmentStatus(controller.lang, "streaming");
      },
      onError: () => {
        updateFragmentStatus(controller.lang, "error");
      },
    });
    if (
      !controller.destroyed &&
      controller.streamAbort === streamAbort &&
      !streamAbort.signal.aborted
    ) {
      updateFragmentStatus(controller.lang, "idle");
      scheduleStreamRetry(controller, 2000);
    }
  } catch (error) {
    if (
      controller.destroyed ||
      controller.streamAbort !== streamAbort ||
      streamAbort.signal.aborted
    )
      return;
    console.error("Static fragment stream failed:", error);
    updateFragmentStatus(controller.lang, "error");
    if (shouldRetryFragmentStream(error)) {
      scheduleStreamRetry(controller, 2000);
    }
  }
};

const scheduleDeferredStreamStart = (
  controller: StaticFragmentController,
  delayMs = 1800,
) => {
  if (!hasStaticFragmentRoot()) return;
  controller.streamStartCancel?.();
  const cancelSchedule = scheduleStaticShellTask(
    () => {
      controller.streamStartCancel = null;
      if (controller.destroyed || document.visibilityState === "hidden") return;
      void startDeferredStream(controller);
    },
    {
      delayMs,
      priority: "background",
      timeoutMs: delayMs > 0 ? delayMs : 120,
    },
  );
  controller.streamStartCancel = () => {
    cancelSchedule();
    controller.streamStartCancel = null;
  };
};

const observeVisibleStaticFragments = (
  controller: StaticFragmentController,
) => {
  const cardIds = collectStaticFragmentCardIds();
  if (!cardIds.length) return () => undefined;

  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`),
  ).filter((card) => Boolean(card.dataset.fragmentId));
  const ObserverImpl = (
    globalThis as typeof globalThis & {
      IntersectionObserver?: typeof IntersectionObserver;
    }
  ).IntersectionObserver;

  if (typeof ObserverImpl !== "function") {
    cardIds.forEach((id) => controller.visibleFragmentIds.add(id));
    scheduleDeferredStreamStart(controller, 0);
    return () => {
      controller.visibleFragmentIds.clear();
    };
  }

  const observer = new ObserverImpl(
    (entries) => {
      let changed = false;
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement).dataset.fragmentId;
        if (!id) return;
        const isVisible = entry.isIntersecting || entry.intersectionRatio > 0;
        if (isVisible) {
          if (!controller.visibleFragmentIds.has(id)) {
            controller.visibleFragmentIds.add(id);
            changed = true;
          }
          return;
        }
        if (controller.visibleFragmentIds.delete(id)) {
          changed = true;
        }
      });
      if (!changed) return;
      const visibleIds = collectVisibleStreamIds(controller);
      visibleIds.forEach((id) => controller.commitQueue?.setVisible(id, true));
      controller.routeData.fragmentOrder
        .filter((id) => !visibleIds.includes(id))
        .forEach((id) => controller.commitQueue?.setVisible(id, false));
      if (controller.sharedRuntime) {
        controller.sharedRuntime.resumeAfterPageShow();
        controller.sharedRuntime.setVisibleIds(visibleIds);
        if (visibleIds.length) {
          controller.sharedRuntime.resume();
        } else {
          updateFragmentStatus(controller.lang, "idle");
        }
        return;
      }
      scheduleDeferredStreamStart(
        controller,
        controller.visibleFragmentIds.size > 0 ? 0 : 120,
      );
    },
    {
      root: null,
      rootMargin: STATIC_FRAGMENT_STREAM_ROOT_MARGIN,
      threshold: STATIC_FRAGMENT_STREAM_THRESHOLD,
    },
  );

  cards.forEach((card) => observer.observe(card));

  return () => {
    observer.disconnect();
    controller.visibleFragmentIds.clear();
  };
};

const destroyController = async (
  controller: StaticFragmentController | null,
) => {
  if (!controller) return;
  controller.destroyed = true;
  stopConnections(controller);
  controller.sharedRuntime?.dispose();
  controller.sharedRuntime = null;
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup());
};

const buildStaticFragmentMarkup = (model: StaticFragmentRouteModel) => {
  const nonce = getCspNonce();
  const nonceAttr = nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : "";
  const inlineStyles = model.inlineStyles
    .map(
      (fragment) =>
        `<style${nonceAttr} data-fragment-css="${fragment.id}">${fragment.css}</style>`,
    )
    .join("");
  const entries = model.entries
    .map((entry, index) => {
      const column = entry.layout.column || "span 12";
      const versionAttr = entry.version
        ? ` ${STATIC_FRAGMENT_VERSION_ATTR}="${entry.version}"`
        : "";
      const sizeAttr = entry.size ? ` data-size="${entry.size}"` : "";
      const criticalAttr = entry.critical ? ` data-critical="true"` : "";
      const layoutAttr = ` data-fragment-height-layout="${escapeHtmlAttr(JSON.stringify(entry.layout))}"`;
      const desktopWidthBucketAttr = entry.desktopWidthBucket || entry.mobileWidthBucket
        ? ` ${STATIC_FRAGMENT_WIDTH_BUCKET_ATTR}="${escapeHtmlAttr(entry.desktopWidthBucket ?? entry.mobileWidthBucket ?? "")}"`
        : "";
      const mobileWidthBucketAttr =
        entry.mobileWidthBucket && entry.mobileWidthBucket !== entry.desktopWidthBucket
          ? ` ${STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR}="${escapeHtmlAttr(entry.mobileWidthBucket)}"`
          : "";
      return `<article class="fragment-card fragment-card-static-home" data-fragment-id="${entry.id}" data-fragment-height-hint="${entry.reservedHeight}"${layoutAttr}${criticalAttr} data-fragment-loaded="true" data-fragment-ready="true" data-fragment-stage="ready" data-reveal-phase="visible" data-reveal-locked="false" data-draggable="false" data-ready-stagger-state="done"${sizeAttr}${versionAttr}${desktopWidthBucketAttr}${mobileWidthBucketAttr} ${STATIC_FRAGMENT_CARD_ATTR}="true" style="--fragment-reserved-height:${entry.reservedHeight}px;grid-column:${column};"><div class="fragment-card-body" ${STATIC_FRAGMENT_BODY_ATTR}="${entry.id}"><div class="fragment-html">${entry.html}</div></div></article>`;
    })
    .join("");

  const heightScript = buildFragmentHeightPersistenceScript({
    path: model.path,
    lang: model.lang,
    fragmentOrder: model.routeData.fragmentOrder,
    planSignature: model.routeData.planSignature,
    versionSignature: model.routeData.versionSignature,
  });

  return `${inlineStyles}<section class="fragment-shell fragment-shell-static" data-static-fragment-root data-static-fragment-paint="initial" data-static-path="${model.path}" data-static-lang="${model.lang}"><noscript><style${nonceAttr}>[data-static-fragment-root] .fragment-card[data-reveal-phase="visible"]{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;}</style></noscript><div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">${entries}</div><script id="${STATIC_FRAGMENT_DATA_SCRIPT_ID}" type="application/json"${nonceAttr}>${serializeJson(model.routeData)}</script><script${nonceAttr}>${heightScript}</script></section>`;
};

const hydrateProtectedStaticFragments = async (
  controller: StaticFragmentController,
) => {
  const [
    { fetchFragmentBatch, fetchFragmentPlan },
    { buildStaticFragmentRouteModel },
  ] = await Promise.all([
    import("../../fragment/client"),
    import("../fragments/static-fragment-model"),
  ]);
  const plan = await fetchFragmentPlan(controller.path, controller.lang);
  const fragments = await fetchFragmentBatch(
    plan.fragments.map((entry) => ({ id: entry.id })),
    {
      lang: controller.lang,
    },
  );
  const model = buildStaticFragmentRouteModel({
    plan,
    fragments,
    lang: controller.lang,
    fragmentCopy: getFragmentTextCopy(controller.lang),
    storeSeed: controller.routeData.storeSeed ?? null,
    contactInvitesSeed: controller.routeData.contactInvitesSeed ?? null,
  });
  const mainRegion = document.querySelector<HTMLElement>(
    `[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"]`,
  );
  if (!mainRegion) return;
  setTrustedInnerHtml(mainRegion, buildStaticFragmentMarkup(model), "server");
  controller.routeData = model.routeData;
};

const scheduleProtectedAuthUpgrade = (controller: StaticFragmentController) => {
  const runAuthUpgrade = async () => {
    try {
      const { loadClientAuthSession, redirectProtectedStaticRouteToLogin } =
        await loadStaticAuthClient();
      const session = await loadClientAuthSession();
      if (controller.destroyed) return;
      if (session.status !== "authenticated") {
        redirectProtectedStaticRouteToLogin(controller.lang);
        return;
      }
      if (!controller.isAuthenticated) {
        controller.isAuthenticated = true;
        writeStaticShellSeed({ isAuthenticated: true });
        await syncStaticFragmentDockIfNeeded(controller);
      }
      if (!hasStaticFragmentRoot()) {
        await hydrateProtectedStaticFragments(controller);
        connectSharedFragmentRuntime(controller);
      }
      scheduleDeferredStreamStart(controller, 0);
    } catch (error) {
      if (!controller.destroyed) {
        console.error("Protected static fragment auth upgrade failed:", error);
      }
    }
  };

  let cancelDeferredIntent: () => void = () => undefined;
  const cancelScheduledStart = scheduleStaticShellTask(
    () => {
      cancelDeferredIntent = runAfterClientIntentIdle(() => {
        void runAuthUpgrade();
      });
    },
    {
      priority: "background",
      timeoutMs: 900,
      waitForPaint: true,
    },
  );

  return () => {
    cancelScheduledStart();
    cancelDeferredIntent();
  };
};

const bindRouteControllers = async (controller: StaticFragmentController) => {
  if (normalizeStaticShellRoutePath(controller.path) !== "/store") return;
  const existingCleanup = consumeRegisteredStoreStaticControllerCleanup();
  if (existingCleanup) {
    controller.cleanupFns.push(() => {
      existingCleanup();
      clearStoreStaticBootstrapFlag();
    });
    return;
  }
  const { activateStoreStaticController } =
    await import("./controllers/store-static-controller");
  const cleanup = await activateStoreStaticController({
    routeData: controller.routeData,
  });
  controller.cleanupFns.push(() => {
    cleanup();
    clearStoreStaticBootstrapFlag();
  });
};

export const bootstrapStaticFragmentShell = async () => {
  const shellSeed = readShellSeed();
  if (!shellSeed) return;
  primeTrustedTypesPolicies();
  const preferredLang = resolvePreferredStaticShellLang(shellSeed.lang);
  if (preferredLang !== shellSeed.lang) {
    const currentRouteData = readRouteData(shellSeed);
    try {
      const snapshot = await loadStaticShellSnapshot(
        shellSeed.snapshotKey,
        preferredLang,
      );
      const languageSeed = await loadStaticShellLanguageSeed(
        shellSeed.currentPath || window.location.pathname,
        preferredLang,
      );
      applyStaticShellSnapshot(snapshot, {
        dockState: {
          lang: preferredLang,
          currentPath: shellSeed.currentPath || window.location.pathname,
          isAuthenticated: shellSeed.isAuthenticated ?? false,
        },
      });
      writeStaticFragmentRouteData(
        mergeStaticStoreSeedForSnapshot(
          currentRouteData,
          readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID),
        ),
      );
      writeStaticShellSeed({
        lang: preferredLang,
        currentPath: shellSeed.currentPath || window.location.pathname,
        snapshotKey: shellSeed.snapshotKey,
        languageSeed,
        isAuthenticated: shellSeed.isAuthenticated,
      });
      persistStaticLang(preferredLang);
      updateStaticShellUrlLang(preferredLang);
      await bootstrapStaticFragmentShell();
      return;
    } catch (error) {
      console.error(
        "Failed to restore preferred fragment language snapshot:",
        error,
      );
    }
  }

  seedLanguageResources(shellSeed.lang, shellSeed.languageSeed ?? {});
  setDocumentLang(shellSeed.lang);
  await destroyController(activeController);

  const routeData = readRouteData(shellSeed);
  const controller: StaticFragmentController = {
    isAuthenticated: shellSeed.isAuthenticated ?? false,
    lang: shellSeed.lang,
    path: shellSeed.currentPath || window.location.pathname,
    snapshotKey: shellSeed.snapshotKey,
    authPolicy: shellSeed.authPolicy,
    streamAbort: null,
    streamRetryTimer: 0,
    streamStartCancel: null,
    cleanupFns: [],
    destroyed: false,
    routeData,
    visibleFragmentIds: new Set<string>(),
    sharedRuntime: null,
    commitQueue: null,
    didStartDirectStreamStartup: false,
  };
  activeController = controller;
  const pretextController = acquirePretextDomController({
    initialLang: controller.lang,
    root: document.body,
  });
  if (pretextController) {
    controller.cleanupFns.push(() => pretextController.release());
  }
  controller.commitQueue = createStaticFragmentCommitQueue(controller);
  controller.cleanupFns.push(() => controller.commitQueue?.destroy());

  await syncStaticFragmentDockIfNeeded(controller);
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed || controller.authPolicy === "protected")
          return;
        void refreshStaticFragmentDockAuthIfNeeded(controller).catch(
          (error) => {
            console.error("Static fragment auth dock refresh failed:", error);
          },
        );
      },
      {
        priority: "background",
        timeoutMs: 600,
        waitForPaint: true,
      },
    ),
  );
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed) return;
        void persistInitialFragmentCardHeights({
          routeContext: {
            path: controller.path,
            lang: controller.lang,
            fragmentOrder: controller.routeData.fragmentOrder,
            planSignature: controller.routeData.planSignature,
            versionSignature: controller.routeData.versionSignature,
          },
        }).catch((error) => {
          console.error("Static fragment height persistence failed:", error);
        });
      },
      {
        priority: "background",
        timeoutMs: 1200,
        waitForPaint: true,
      },
    ),
  );
  bindShellControls(controller);
  await bindRouteControllers(controller);
  connectSharedFragmentRuntime(controller);
  controller.cleanupFns.push(observeVisibleStaticFragments(controller));
  updateFragmentStatus(controller.lang, "idle");

  const handlePageHide = () => {
    stopConnections(controller);
    controller.sharedRuntime?.suspendForPageHide();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return;
    controller.sharedRuntime?.resumeAfterPageShow();
    updateFragmentStatus(controller.lang, "idle");
    if (controller.authPolicy === "protected") {
      scheduleProtectedAuthUpgrade(controller);
      return;
    }
    void syncStaticFragmentDockIfNeeded(controller);
    void refreshStaticFragmentDockAuthIfNeeded(controller).catch((error) => {
      console.error("Static fragment auth dock refresh failed:", error);
    });
    scheduleDeferredStreamStart(controller, 0);
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  controller.cleanupFns.push(() =>
    window.removeEventListener("pagehide", handlePageHide),
  );
  controller.cleanupFns.push(() =>
    window.removeEventListener("pageshow", handlePageShow),
  );

  if (controller.authPolicy === "protected") {
    scheduleProtectedAuthUpgrade(controller);
    return;
  }

  scheduleDeferredStreamStart(controller);
};

export const bootstrapStaticShell = bootstrapStaticFragmentShell;
