import type { Lang } from "../../lang/types";
import {
  applyFragmentStatusIndicator,
  readFragmentRuntimeStateFromElement,
  readServerReachabilitySnapshot,
  SERVER_REACHABILITY_EVENT,
} from "../../shared/server-reachability";
import { getStaticHomeUiCopy } from "./home-copy-store";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";

const STATIC_FRAGMENT_STATUS_SELECTOR = "[data-static-fragment-status]";

export const updateFragmentStatus = (
  lang: Lang,
  state: "idle" | "streaming" | "error",
) => {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLElement>(
    STATIC_FRAGMENT_STATUS_SELECTOR,
  );
  if (!element) return;
  const copy = getStaticHomeUiCopy(lang);
  applyFragmentStatusIndicator({
    element,
    runtimeState: state,
    labels: {
      idle: copy.fragmentStatusIdle,
      streaming: copy.fragmentStatusStreaming,
      error: copy.fragmentStatusStalled,
    },
    reachability: readServerReachabilitySnapshot(),
  });
};

export const bindHomeServerReachabilityStatus = ({
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
}: {
  win?: Window | null;
  doc?: Document | null;
} = {}) => {
  if (!win || !doc) {
    return () => undefined;
  }

  const handleReachabilityChange = () => {
    const element = doc.querySelector<HTMLElement>(STATIC_FRAGMENT_STATUS_SELECTOR);
    if (!element) return;
    updateFragmentStatus(
      (doc.documentElement.lang || "en") as Lang,
      readFragmentRuntimeStateFromElement(element),
    );
  };

  win.addEventListener(SERVER_REACHABILITY_EVENT, handleReachabilityChange as EventListener);
  handleReachabilityChange();
  return () => {
    win.removeEventListener(
      SERVER_REACHABILITY_EVENT,
      handleReachabilityChange as EventListener,
    );
  };
};

type RequestHomeDemoObserveOptions = {
  root?: ParentNode | null;
  doc?: Document | null;
};

export const requestHomeDemoObserve = ({
  root = typeof document !== "undefined" ? document : null,
  doc = typeof document !== "undefined" ? document : null,
}: RequestHomeDemoObserveOptions = {}) =>
  dispatchHomeDemoObserveEvent({
    root,
    doc,
  });
