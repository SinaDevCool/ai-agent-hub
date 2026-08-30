import { Bot, FilePlus, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { consumerNavIds, navItems, type SectionHeading, type SectionId } from "../../lib/appNavigation";

type NavShortcut = {
  id: string;
  label: string;
  meta?: string;
};

export function AppShell(props: {
  activeSection: SectionId;
  agentPoolShortcuts?: NavShortcut[];
  canUseCreatorTools: boolean;
  canModerateMarketplace: boolean;
  children: ReactNode;
  connectionState: string;
  environmentLabel?: string;
  heading: SectionHeading;
  onAddPrivateInfo: () => void;
  onOpenAgentPoolNeed?: (needId: string) => void;
  onOpenAgentPool: () => void;
  onNavigate: (section: SectionId) => void;
  onSignOut?: () => void;
  userEmail?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const [isNavCompact, setIsNavCompact] = useState(() => window.localStorage.getItem("ai-agent-hub-nav") === "compact");

  function toggleNavigation() {
    setIsNavCompact((current) => {
      window.localStorage.setItem("ai-agent-hub-nav", current ? "expanded" : "compact");
      return !current;
    });
  }

  return (
    <main className={`app-shell ${isNavCompact ? "nav-is-compact" : ""}`}>
      <a className="skip-link" href="#workspace-content">Skip to main content</a>
      <aside className="nav-rail">
        <div className="nav-brand-row">
          <div className="brand-mark" role="heading" aria-level={1}><ShieldCheck aria-hidden="true" size={22} /><span>AI Agent Hub</span></div>
          <button aria-label={isNavCompact ? "Expand navigation" : "Collapse navigation"} className="nav-collapse" onClick={toggleNavigation} title={isNavCompact ? "Expand navigation" : "Collapse navigation"} type="button">
            {isNavCompact ? <PanelLeftOpen aria-hidden="true" size={18} /> : <PanelLeftClose aria-hidden="true" size={18} />}
          </button>
        </div>
        <nav>
          {navItems.filter((item) => consumerNavIds.has(item.id) || (item.id === "creator" && props.canUseCreatorTools) || ((item.id === "moderation" || item.id === "operations" || item.id === "beta") && props.canModerateMarketplace)).map(({ id, label, mobileLabel, icon: Icon, mobileVisible }) => (
            <div className="nav-item-group" key={id}>
              <button
                aria-current={props.activeSection === id ? "page" : undefined}
                aria-label={label}
                className={`${props.activeSection === id ? "nav-active" : ""} ${mobileVisible === false ? "nav-mobile-hidden" : ""}`}
                data-mobile-label={mobileLabel}
                onClick={() => props.onNavigate(id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                <span className="nav-label-full">{label}</span>
              </button>
              {id === "marketplace" && props.agentPoolShortcuts?.length ? (
                <div className="nav-sublist" aria-label="Agent Pool categories">
                  {props.agentPoolShortcuts.slice(0, 5).map((item) => (
                    <button key={item.id} onClick={() => props.onOpenAgentPoolNeed?.(item.id)} type="button">
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>

      <section className="workspace" id="workspace-content" tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-heading">
            <h1 className="mobile-topbar-brand" aria-label="AI Agent Hub">
              <ShieldCheck aria-hidden="true" size={18} />
              <span>AI Agent Hub</span>
            </h1>
            <h1>{props.heading.title}</h1>
            <p>{props.heading.description}</p>
          </div>
          <div className="topbar-actions">
            <button aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="theme-toggle" onClick={toggleTheme} title={`Use ${theme === "dark" ? "light" : "dark"} theme`} type="button">
              {theme === "dark" ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            {props.environmentLabel ? <span className="environment-chip">{props.environmentLabel}</span> : null}
            <span className={`connection-status ${props.connectionState === "live" ? "is-live" : "is-syncing"}`} title={`Connection: ${props.connectionState}`}>
              <span className="connection-dot" />
              <span className="connection-text">{props.connectionState === "live" ? "live" : "syncing"}</span>
            </span>
            {props.userEmail ? <span className="user-chip">{props.userEmail}</span> : null}
            {props.activeSection !== "marketplace" && props.activeSection !== "vault" ? (
              <button aria-label="Open Agent Pool" className="topbar-primary" onClick={props.onOpenAgentPool} type="button"><Bot size={16} /> Agent Pool</button>
            ) : null}
            {props.activeSection === "vault" ? (
              <button className="topbar-primary" onClick={props.onAddPrivateInfo} type="button"><FilePlus size={16} /> Add Private Info</button>
            ) : null}
            <button
              aria-label="Settings"
              className={`mobile-settings-button ${props.activeSection === "settings" ? "is-active" : ""}`}
              onClick={() => props.onNavigate("settings")}
              type="button"
            >
              <Settings aria-hidden="true" size={20} />
            </button>
            {props.onSignOut ? <button className="topbar-secondary" onClick={props.onSignOut} type="button"><LogOut size={16} /> Sign out</button> : null}
          </div>
        </header>
        {props.children}
      </section>
    </main>
  );
}
