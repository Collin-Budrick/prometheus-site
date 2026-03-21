export const HOME_DEFERRED_COMMIT_RELEASE_EVENT =
  "prom:static-home-deferred-commit-release";

type HomeDeferredCommitReleaseDocument = Pick<Document, "dispatchEvent">;

type DispatchHomeDeferredCommitReleaseEventOptions = {
  doc?: HomeDeferredCommitReleaseDocument | null;
  EventImpl?: typeof CustomEvent | null;
};

export const dispatchHomeDeferredCommitReleaseEvent = ({
  doc = typeof document !== "undefined" ? document : null,
  EventImpl = typeof CustomEvent !== "undefined" ? CustomEvent : null,
}: DispatchHomeDeferredCommitReleaseEventOptions = {}) => {
  if (!doc || typeof EventImpl !== "function") {
    return false;
  }

  return doc.dispatchEvent(
    new EventImpl(HOME_DEFERRED_COMMIT_RELEASE_EVENT),
  );
};
