import type { LanguageSeedPayload } from "../lang/selection";
import type { Lang } from "../lang/types";
import { seedStaticHomeCopy } from "./home-copy-store";
import { loadHomeBootstrapPostLcpRuntime } from "./home-bootstrap-post-lcp-runtime-loader";
import { resolvePreferredStaticHomeLang } from "./home-language-preference";
import { collectStaticHomeKnownVersions } from "./home-fragment-version-state";
import {
  clearActiveHomeController,
  type HomeControllerState,
  type HomeFragmentHydrationManager,
} from "./home-active-controller";

const LEGACY_HOME_CLEANUP_SESSION_KEY = "prom-static-home-cleanup:v1";
const HOME_STABLE_HEIGHT_PREFIX = `fragment:stable-height:v1:${encodeURIComponent("/")}:`;
const LEGACY_HOME_STORAGE_KEYS = [
  "fragment:card-order:v1:/",
  "fragment:card-order:v1:columns:/",
  "fragment-critical:/:desktop",
  "fragment-critical:/:mobile",
];
const HOME_CRITICAL_COOKIE_KEYS = [
  "prom-frag-critical-m",
  "prom-frag-critical-d",
] as const;
const HOME_POST_LCP_RUNTIME_INTENT_EVENTS = [
  "pointerdown",
  "touchstart",
  "keydown",
] as const;

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value;
};

const readCookieValue = (key: string) => {
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [name, raw] = part.trim().split("=");
    if (name !== key) continue;
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
};

const clearCookie = (key: string) => {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
};

export const cleanupLegacyHomePersistence = () => {
  if (typeof window === "undefined") return;
  try {
    if (
      window.sessionStorage.getItem(LEGACY_HOME_CLEANUP_SESSION_KEY) === "1"
    ) {
      return;
    }
  } catch {
    // Ignore sessionStorage failures and still attempt cleanup once.
  }

  try {
    LEGACY_HOME_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith(HOME_STABLE_HEIGHT_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore localStorage cleanup failures; startup must continue.
  }

  HOME_CRITICAL_COOKIE_KEYS.forEach((key) => {
    try {
      const raw = readCookieValue(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { path?: string } | null;
      if (parsed?.path === "/") {
        clearCookie(key);
      }
    } catch {
      clearCookie(key);
    }
  });

  try {
    window.sessionStorage.setItem(LEGACY_HOME_CLEANUP_SESSION_KEY, "1");
  } catch {
    // Ignore sessionStorage failures.
  }
};

export const applyShellLanguageSeed = (
  lang: Lang,
  shellSeed: LanguageSeedPayload,
  routeSeed: LanguageSeedPayload,
) => {
  seedStaticHomeCopy(lang, shellSeed, routeSeed);
  setDocumentLang(lang);
};

export const stopHomeHydrationFetches = (
  controller: Pick<HomeControllerState, "fetchAbort">,
) => {
  if (controller.fetchAbort) {
    controller.fetchAbort.abort();
    controller.fetchAbort = null;
  }
};

export const destroyHomeController = async (
  controller: HomeControllerState | null,
) => {
  if (!controller) return;
  controller.destroyed = true;
  stopHomeHydrationFetches(controller);
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup());
  controller.patchQueue = null;
  controller.sharedRuntime = null;
  controller.homeFragmentHydration = null;
  controller.deferredRuntimeCleanup = null;
  clearActiveHomeController(controller);
};

export const installDeferredHomePostLcpRuntime = ({
  controller,
  homeFragmentHydration,
  bootstrapStaticHome,
  destroyActiveController,
}: {
  controller: HomeControllerState;
  homeFragmentHydration: Pick<
    HomeFragmentHydrationManager,
    "schedulePreviewRefreshes" | "retryPending"
  >;
  bootstrapStaticHome: () => Promise<void>;
  destroyActiveController: () => Promise<void>;
}) => {
  const settingsRoot = document.querySelector<HTMLElement>(".topbar-settings");
  let runtimeCleanup: (() => void) | null = null;
  let runtimePromise: Promise<void> | null = null;
  const eventOptions: AddEventListenerOptions = { capture: true };

  const cleanupTriggers = () => {
    if (!settingsRoot) {
      return;
    }
    settingsRoot.removeEventListener(
      "pointerdown",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
    settingsRoot.removeEventListener(
      "touchstart",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
    settingsRoot.removeEventListener(
      "keydown",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
  };

  const startPostLcpRuntime = () => {
    if (controller.destroyed || runtimePromise) {
      return;
    }

    runtimePromise = loadHomeBootstrapPostLcpRuntime()
      .then(({ installHomeBootstrapPostLcpRuntime }) => {
        cleanupTriggers();
        if (controller.destroyed) {
          return;
        }
        runtimeCleanup = installHomeBootstrapPostLcpRuntime({
          controller,
          homeFragmentHydration,
          bootstrapStaticHome,
          destroyActiveController,
        });
      })
      .catch((error) => {
        runtimePromise = null;
        console.error("Static home post-LCP runtime failed:", error);
      });
  };

  function handleDeferredPostLcpIntent() {
    startPostLcpRuntime();
  }

  if (settingsRoot) {
    HOME_POST_LCP_RUNTIME_INTENT_EVENTS.forEach((eventName) => {
      settingsRoot.addEventListener(
        eventName,
        handleDeferredPostLcpIntent,
        eventOptions,
      );
    });
  }

  return () => {
    cleanupTriggers();
    runtimeCleanup?.();
    runtimeCleanup = null;
  };
};

export const hasStaticHomeVersionMismatch = (
  controller: Pick<HomeControllerState, "fragmentOrder">,
  knownVersions: Record<string, number>,
) =>
  controller.fragmentOrder.some((fragmentId) => {
    const renderedVersion = collectStaticHomeKnownVersions(document)[fragmentId];
    const nextVersion = knownVersions[fragmentId];
    return typeof renderedVersion === "number" &&
      typeof nextVersion === "number" &&
      renderedVersion !== nextVersion;
  });
