import { lazy, Suspense } from "react";
import { resolveRootRoute } from "./lib/rootRoutes";

const WorkspaceApp = lazy(() => import("./App").then((module) => ({ default: module.App })));
const PublicSite = lazy(() => import("./public-site/PublicSite").then((module) => ({ default: module.PublicSite })));
const DesktopAuthRelay = lazy(() => import("./components/shell/DesktopAuthRelay").then((module) => ({ default: module.DesktopAuthRelay })));

export function RootApp() {
  const route = resolveRootRoute(window.location.pathname);
  if (route.redirect && window.location.pathname !== route.redirect) window.history.replaceState({}, "", `${route.redirect}${window.location.search}`);
  const content = route.surface === "desktop-auth" ? <DesktopAuthRelay /> : route.surface === "public" ? <PublicSite /> : <WorkspaceApp />;
  return <Suspense fallback={<main className="auth-shell"><section className="auth-panel"><strong>Opening AI Agent Hub…</strong></section></main>}>{content}</Suspense>;
}
