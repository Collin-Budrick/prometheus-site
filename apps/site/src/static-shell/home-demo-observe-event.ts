export const HOME_DEMO_OBSERVE_EVENT = "prom:static-home-demo-observe";

export type HomeDemoObserveEventDetail = {
  root?: ParentNode | null;
};

type HomeDemoObserveDocument = Pick<Document, "dispatchEvent">;

type DispatchHomeDemoObserveEventOptions = {
  root?: ParentNode | null;
  doc?: HomeDemoObserveDocument | null;
  EventImpl?: typeof CustomEvent | null;
};

export const dispatchHomeDemoObserveEvent = ({
  root = typeof document !== "undefined" ? document : null,
  doc = typeof document !== "undefined" ? document : null,
  EventImpl = typeof CustomEvent !== "undefined" ? CustomEvent : null,
}: DispatchHomeDemoObserveEventOptions = {}) => {
  if (!doc || typeof EventImpl !== "function") {
    return false;
  }

  return doc.dispatchEvent(
    new EventImpl<HomeDemoObserveEventDetail>(HOME_DEMO_OBSERVE_EVENT, {
      detail: { root },
    }),
  );
};
