import type { Lang } from "../../lang/types";
import { getStaticHomeUiCopy } from "./home-copy-store";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";

export const updateFragmentStatus = (
  lang: Lang,
  state: "idle" | "streaming" | "error",
) => {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLElement>(
    "[data-static-fragment-status]",
  );
  if (!element) return;
  const copy = getStaticHomeUiCopy(lang);
  const label =
    state === "streaming"
      ? copy.fragmentStatusStreaming
      : state === "error"
        ? copy.fragmentStatusStalled
        : copy.fragmentStatusIdle;
  element.dataset.state = state;
  element.setAttribute("aria-label", label);
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
