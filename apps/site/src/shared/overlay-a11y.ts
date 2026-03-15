type FocusTarget =
  | HTMLElement
  | string
  | Array<HTMLElement | string | null | undefined>
  | (() => HTMLElement | null | undefined)
  | null
  | undefined;

type OverlayDismissReason = "pointer" | "escape";

type OverlayDismissEventTarget = Pick<
  Document,
  "addEventListener" | "removeEventListener"
>;
type OverlayDismissWindowTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

const FALLBACK_FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([hidden])",
  'input:not([disabled]):not([type="hidden"]):not([hidden])',
  "select:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  "a[href]:not([hidden])",
  '[tabindex]:not([tabindex="-1"]):not([hidden])',
].join(", ");

const isFocusableElement = (value: unknown): value is HTMLElement =>
  Boolean(value) && typeof (value as { focus?: unknown }).focus === "function";

const isBlurElement = (
  value: unknown,
): value is HTMLElement & { blur: () => void } =>
  Boolean(value) && typeof (value as { blur?: unknown }).blur === "function";

const resolveFocusTarget = (
  root: ParentNode,
  target: FocusTarget,
): HTMLElement | null => {
  if (!target) return null;
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveFocusTarget(root, candidate);
      if (resolved) return resolved;
    }
    return null;
  }
  if (typeof target === "function") {
    return resolveFocusTarget(root, target());
  }
  if (typeof target === "string") {
    return root.querySelector<HTMLElement>(target);
  }
  return isFocusableElement(target) ? target : null;
};

const setElementInert = (element: HTMLElement, inert: boolean) => {
  const overlayElement = element as HTMLElement & { inert?: boolean };
  if ("inert" in overlayElement) {
    overlayElement.inert = inert;
  }
  if (inert) {
    element.setAttribute("inert", "");
    return;
  }
  element.removeAttribute("inert");
};

export const setOverlaySurfaceState = (
  surface: HTMLElement | null | undefined,
  open: boolean,
) => {
  if (!surface) return;
  if (!open) {
    const ownerDocument =
      surface.ownerDocument ??
      (typeof document !== "undefined" ? document : null);
    const activeElement =
      ownerDocument && "activeElement" in ownerDocument
        ? ((ownerDocument as Document & { activeElement?: unknown })
            .activeElement ?? null)
        : null;
    const focusWithinSurface =
      activeElement !== null && typeof surface.contains === "function"
        ? surface.contains(activeElement as Node)
        : false;

    if (focusWithinSurface && isBlurElement(activeElement)) {
      activeElement.blur();
    }
  }
  surface.dataset.open = open ? "true" : "false";
  surface.hidden = !open;
  surface.setAttribute("aria-hidden", open ? "false" : "true");
  setElementInert(surface, !open);
};

export const focusOverlayEntry = (
  root: ParentNode | null | undefined,
  preferredTarget?: FocusTarget,
) => {
  if (!root) return null;
  const preferred = preferredTarget
    ? resolveFocusTarget(root, preferredTarget)
    : null;
  const fallback =
    typeof root.querySelector === "function"
      ? root.querySelector<HTMLElement>(FALLBACK_FOCUSABLE_SELECTOR)
      : null;
  const target =
    preferred ??
    fallback ??
    ((root as HTMLElement).tabIndex >= 0 && isFocusableElement(root)
      ? (root as HTMLElement)
      : null);
  if (!target) return null;
  target.focus();
  return target;
};

export const restoreOverlayFocus = (target: HTMLElement | null | undefined) => {
  if (!isFocusableElement(target)) return null;
  if ((target as HTMLElement & { isConnected?: boolean }).isConnected === false)
    return null;
  target.focus();
  return target;
};

export const restoreOverlayFocusBeforeHide = (
  surface: HTMLElement | null | undefined,
  target: HTMLElement | null | undefined,
) => {
  const ownerDocument =
    surface?.ownerDocument ??
    target?.ownerDocument ??
    (typeof document !== "undefined" ? document : null);
  const activeElement =
    ownerDocument && "activeElement" in ownerDocument
      ? ((ownerDocument as Document & { activeElement?: unknown })
          .activeElement ?? null)
      : null;

  const focusedWithinSurface =
    Boolean(surface) &&
    activeElement !== null &&
    typeof surface?.contains === "function"
      ? surface.contains(activeElement)
      : false;

  const restoredTarget = restoreOverlayFocus(target);
  const focusStillWithinSurface =
    focusedWithinSurface &&
    Boolean(surface) &&
    activeElement !== null &&
    typeof surface?.contains === "function"
      ? surface.contains(
          ((ownerDocument as (Document & { activeElement?: unknown }) | null)
            ?.activeElement ?? activeElement) as Node,
        )
      : false;

  if (focusStillWithinSurface && isBlurElement(activeElement)) {
    activeElement.blur();
  }

  return restoredTarget;
};

export const bindOverlayDismiss = ({
  root,
  onDismiss,
  doc = typeof document !== "undefined" ? document : null,
  win = typeof window !== "undefined" ? window : null,
}: {
  root: HTMLElement | null | undefined;
  onDismiss: (reason: OverlayDismissReason) => void;
  doc?: OverlayDismissEventTarget | null;
  win?: OverlayDismissWindowTarget | null;
}) => {
  if (!root || !doc || !win) return () => undefined;

  const handlePointerDown = (event: Event) => {
    const target = (event as PointerEvent).target as Node | null;
    if (!target || root.contains(target)) return;
    onDismiss("pointer");
  };

  const handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Escape") return;
    keyboardEvent.preventDefault?.();
    onDismiss("escape");
  };

  doc.addEventListener("pointerdown", handlePointerDown);
  win.addEventListener("keydown", handleKeyDown);

  return () => {
    doc.removeEventListener("pointerdown", handlePointerDown);
    win.removeEventListener("keydown", handleKeyDown);
  };
};
