import { bootstrapStaticHomeAnchor } from "./home-bootstrap-anchor";
import { installHomeBootstrapDeferredRuntime } from "./home-bootstrap-deferred";

export const bootstrapStaticHome = async () => {
  await bootstrapStaticHomeAnchor();
  await installHomeBootstrapDeferredRuntime();
};
