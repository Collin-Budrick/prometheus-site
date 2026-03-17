import { primeTrustedTypesPolicies } from "../security/client";
import {
  bindHomeDemoActivation,
  resetHomeDemoActivations,
  type HomeDemoController,
} from "./home-demo-controller";
import {
  readStaticHomeBootstrapData,
  type HomeStaticBootstrapData,
} from "./home-bootstrap-data";
import {
  clearHomeDemoControllerBinding,
  getHomeDemoControllerBinding,
  setHomeDemoControllerBinding,
} from "./home-demo-controller-state";
import {
  HOME_DEMO_OBSERVE_EVENT,
  type HomeDemoObserveEventDetail,
} from "./home-demo-observe-event";
import { markHomeDemoPerformance } from "./home-demo-performance";
import { normalizeHomeDemoAssetMap } from "./home-demo-runtime-types";
import { scheduleStaticShellTask } from "./scheduler";
import {
  measureStaticShellPerformance,
  markStaticShellPerformance,
  markStaticShellUserTiming,
  measureStaticShellUserTiming,
} from "./static-shell-performance";
import { ensureStaticHomeDeferredStylesheet } from "./home-deferred-stylesheet";

type HomeDemoEntryWindow = Window & {
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean;
};

type InstallHomeDemoEntryOptions = {
  win?: HomeDemoEntryWindow | null;
  doc?: Document | null;
  scheduleTask?: typeof scheduleStaticShellTask;
};

type HomeDemoObserveDocument = Pick<
  Document,
  "addEventListener" | "removeEventListener"
>;

const destroyHomeDemoController = (controller: HomeDemoController) => {
  controller.destroyed = true;
  resetHomeDemoActivations(controller);
};

const syncHomeDemoController = (
  controller: HomeDemoController,
  data: HomeStaticBootstrapData,
) => {
  const langChanged = controller.lang !== data.lang;
  controller.path = data.currentPath;
  controller.lang = data.lang;
  controller.fragmentOrder = data.fragmentOrder;
  controller.planSignature = data.planSignature ?? "";
  controller.versionSignature = data.versionSignature ?? "";
  controller.assets = normalizeHomeDemoAssetMap(data.homeDemoAssets);
  if (langChanged) {
    resetHomeDemoActivations(controller);
  }
};

const bindHomeDemoObserveRequests = ({
  binding,
  doc,
}: {
  binding: NonNullable<ReturnType<typeof getHomeDemoControllerBinding>>;
  doc: HomeDemoObserveDocument | null;
}) => {
  if (!doc) {
    return () => undefined;
  }

  const handleObserveRequest = (event: Event) => {
    const data = readStaticHomeBootstrapData({
      doc: doc as unknown as Document,
    });
    if (data) {
      syncHomeDemoController(binding.controller, data);
    }

    const detail = (event as CustomEvent<HomeDemoObserveEventDetail>).detail;
    binding.manager.observeWithin(
      (detail?.root ?? doc) as unknown as ParentNode,
    );
  };

  doc.addEventListener(
    HOME_DEMO_OBSERVE_EVENT,
    handleObserveRequest as EventListener,
  );

  return () => {
    doc.removeEventListener(
      HOME_DEMO_OBSERVE_EVENT,
      handleObserveRequest as EventListener,
    );
  };
};

export const installHomeDemoEntry = ({
  win = typeof window !== "undefined" ? (window as HomeDemoEntryWindow) : null,
  doc = typeof document !== "undefined" ? document : null,
  scheduleTask = scheduleStaticShellTask,
}: InstallHomeDemoEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_DEMO_ENTRY__) {
    return () => undefined;
  }

  const data = readStaticHomeBootstrapData({ doc });
  if (!data) {
    return () => undefined;
  }

  primeTrustedTypesPolicies();
  win.__PROM_STATIC_HOME_DEMO_ENTRY__ = true;
  markHomeDemoPerformance("prom:home:demo-entry-install");
  void ensureStaticHomeDeferredStylesheet({
    href: data.homeDemoStylesheetHref,
    doc,
  });
  const observeRoot = doc as unknown as ParentNode;

  const scheduleInitialObserve = (
    binding: NonNullable<ReturnType<typeof getHomeDemoControllerBinding>>,
  ) =>
    scheduleTask(
      () => {
        markStaticShellPerformance("prom:home:demo-observe-start");
        markStaticShellUserTiming("prom:home:demo-observe-start");
        binding.manager.observeWithin(observeRoot);
        markStaticShellPerformance("prom:home:demo-observe-ready");
        markStaticShellUserTiming("prom:home:demo-observe-ready");
        measureStaticShellPerformance(
          "prom:home:demo-observe",
          "prom:home:demo-observe-start",
          "prom:home:demo-observe-ready",
        );
        measureStaticShellUserTiming(
          "prom:home:demo-observe",
          "prom:home:demo-observe-start",
          "prom:home:demo-observe-ready",
        );
      },
      {
        priority: "user-visible",
        timeoutMs: 0,
        preferIdle: false,
      },
    );

  const existingBinding = getHomeDemoControllerBinding(win);
  if (existingBinding && !existingBinding.controller.destroyed) {
    syncHomeDemoController(existingBinding.controller, data);
    const cleanupObserveRequests = bindHomeDemoObserveRequests({
      binding: existingBinding,
      doc,
    });
    const cleanupInitialObserve = scheduleInitialObserve(existingBinding);
    markStaticShellPerformance("prom:home:demo-entry-install-ready");
    measureStaticShellPerformance(
      "prom:home:demo-entry-install-duration",
      "prom:home:demo-entry-install",
      "prom:home:demo-entry-install-ready",
    );
    return () => {
      cleanupInitialObserve();
      cleanupObserveRequests();
      win.__PROM_STATIC_HOME_DEMO_ENTRY__ = false;
    };
  }

  const controller: HomeDemoController = {
    path: data.currentPath,
    lang: data.lang,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? "",
    versionSignature: data.versionSignature ?? "",
    assets: normalizeHomeDemoAssetMap(data.homeDemoAssets),
    demoRenders: new Map(),
    pendingDemoRoots: new Set(),
    activationEpoch: 0,
    destroyed: false,
  };

  const manager = bindHomeDemoActivation({ controller });
  const binding = setHomeDemoControllerBinding(
    {
      controller,
      manager,
    },
    win,
  );
  const cleanupObserveRequests = bindHomeDemoObserveRequests({
    binding,
    doc,
  });
  const cleanupInitialObserve = scheduleInitialObserve(binding);
  markStaticShellPerformance("prom:home:demo-entry-install-ready");
  measureStaticShellPerformance(
    "prom:home:demo-entry-install-duration",
    "prom:home:demo-entry-install",
    "prom:home:demo-entry-install-ready",
  );

  return () => {
    cleanupInitialObserve();
    cleanupObserveRequests();
    clearHomeDemoControllerBinding(binding, win);
    manager.destroy();
    destroyHomeDemoController(controller);
    win.__PROM_STATIC_HOME_DEMO_ENTRY__ = false;
  };
};

if (typeof window !== "undefined") {
  installHomeDemoEntry();
}
