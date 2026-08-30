import { Bot, FilePlus, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sun } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { consumerNavIds, navItems, type SectionHeading, type SectionId } from "../../lib/appNavigation";
import { pathForSection } from "../../lib/appRoutes";

export function AppShell(props: {
  activeSection: SectionId;
  canUseCreatorTools: boolean;
  canModerateMarketplace: boolean;
  children: ReactNode;
  connectionState: string;
  environmentLabel?: string;
  heading: SectionHeading;
  onAddPrivateInfo: () => void;
  onOpenAgentPool: () => void;
  onNavigate: (section: SectionId) => void;
  onSignOut?: () => void;
  userEmail?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const [isNavCompact, setIsNavCompact] = useState(() => window.localStorage.getItem("ai-agent-hub-nav") === "compact");
  const connectionLabel = props.connectionState === "live" ? "Online" : props.connectionState === "offline" ? "Offline" : "Syncing";

  function toggleNavigation() {
    setIsNavCompact((current) => {
      window.localStorage.setItem("ai-agent-hub-nav", current ? "expanded" : "compact");
      return !current;
    });
  }

  function navigate(event: MouseEvent, section: SectionId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    props.onNavigate(section);
  }

  return (
    <main className={`app-shell ${isNavCompact ? "nav-is-compact" : ""}`}>
      <a className="skip-link" href="#workspace-content">Skip to main content</a>
      <aside className="nav-rail">
        <div className="nav-brand-row">
          <a className="brand-mark" href={pathForSection("home")} onClick={(event) => navigate(event, "home")}><ShieldCheck aria-hidden="true" size={22} /><span>AI Agent Hub</span></a>
          <button aria-label={isNavCompact ? "Expand navigation" : "Collapse navigation"} className="nav-collapse" onClick={toggleNavigation} title={isNavCompact ? "Expand navigation" : "Collapse navigation"} type="button">
            {isNavCompact ? <PanelLeftOpen aria-hidden="true" size={18} /> : <PanelLeftClose aria-hidden="true" size={18} />}
          </button>
        </div>
        <nav>
          {navItems.filter((item) => consumerNavIds.has(item.id)).map(({ id, label, mobileLabel, icon: Icon, mobileVisible }) => (
            <div className="nav-item-group" key={id}>
              <a
                aria-current={props.activeSection === id ? "page" : undefined}
                aria-label={label}
                className={`${props.activeSection === id ? "nav-active" : ""} ${mobileVisible === false ? "nav-mobile-hidden" : ""}`}
                data-mobile-label={mobileLabel}
                href={pathForSection(id)}
                onClick={(event) => navigate(event, id)}
                title={label}
              >
                <Icon aria-hidden="true" size={18} />
                <span className="nav-label-full">{label}</span>
              </a>
            </div>
          ))}
        </nav>
        {(props.canUseCreatorTools || props.canModerateMarketplace) ? (
          <nav aria-label="Professional tools" className="nav-role-tools">
            <span className="nav-group-label">Workspace tools</span>
            {navItems.filter((item) => (item.id === "creator" && props.canUseCreatorTools) || ((item.id === "moderation" || item.id === "operations" || item.id === "beta") && props.canModerateMarketplace)).map(({ id, label, mobileLabel, icon: Icon, mobileVisible }) => (
              <div className="nav-item-group" key={id}>
                <a aria-current={props.activeSection === id ? "page" : undefined} aria-label={label} className={`${props.activeSection === id ? "nav-active" : ""} ${mobileVisible === false ? "nav-mobile-hidden" : ""}`} data-mobile-label={mobileLabel} href={pathForSection(id)} onClick={(event) => navigate(event, id)} title={label}>
                  <Icon aria-hidden="true" size={18} /><span className="nav-label-full">{label}</span>
                </a>
              </div>
            ))}
          </nav>
        ) : null}
      </aside>

      <section className="workspace" id="workspace-content" tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-heading">
            <a className="mobile-topbar-brand" aria-label="AI Agent Hub home" href={pathForSection("home")} onClick={(event) => navigate(event, "home")}>
              <ShieldCheck aria-hidden="true" size={18} />
              <span>AI Agent Hub</span>
            </a>
            <h1>{props.heading.title}</h1>
            <p>{props.heading.description}</p>
          </div>
          <div className="topbar-actions">
            <button aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="theme-toggle" onClick={toggleTheme} title={`Use ${theme === "dark" ? "light" : "dark"} theme`} type="button">
              {theme === "dark" ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            {props.environmentLabel ? <span className="environment-chip">{props.environmentLabel}</span> : null}
            <span aria-live="polite" className={`connection-status ${props.connectionState === "live" ? "is-live" : props.connectionState === "offline" ? "is-offline" : "is-syncing"}`}>
              <span aria-hidden="true" className="connection-dot" />
              <span className="connection-text">{connectionLabel}</span>
            </span>
            {props.userEmail ? <span className="user-chip">{props.userEmail}</span> : null}
            {props.activeSection !== "marketplace" && props.activeSection !== "vault" ? (
              <a aria-label="Discover agents" className="topbar-primary" href={pathForSection("marketplace")} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); props.onOpenAgentPool(); } }}><Bot aria-hidden="true" size={16} /> Discover</a>
            ) : null}
            {props.activeSection === "vault" ? (
              <button className="topbar-primary" onClick={props.onAddPrivateInfo} type="button"><FilePlus aria-hidden="true" size={16} /> Add Private Info</button>
            ) : null}
            <a
              aria-label="Settings"
              className={`mobile-settings-button ${props.activeSection === "settings" ? "is-active" : ""}`}
              href={pathForSection("settings")}
              onClick={(event) => navigate(event, "settings")}
            >
              <Settings aria-hidden="true" size={20} />
            </a>
            {props.onSignOut ? <button className="topbar-secondary" onClick={props.onSignOut} type="button"><LogOut aria-hidden="true" size={16} /> Sign out</button> : null}
          </div>
        </header>
        {props.children}
      </section>
    </main>
  );
}
