import { Bot, FilePlus, LogOut, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
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
  heading: SectionHeading;
  onAddPrivateInfo: () => void;
  onOpenAgentPoolNeed?: (needId: string) => void;
  onOpenAgentPool: () => void;
  onNavigate: (section: SectionId) => void;
  onSignOut?: () => void;
  userEmail?: string;
}) {
  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark" role="heading" aria-level={1}><ShieldCheck size={22} /> AI Agent Hub</div>
        <nav>
          {navItems.filter((item) => consumerNavIds.has(item.id) || (item.id === "creator" && props.canUseCreatorTools) || (item.id === "moderation" && props.canModerateMarketplace)).map(({ id, label, mobileLabel, icon: Icon, mobileVisible }) => (
            <div className="nav-item-group" key={id}>
              <button
                aria-current={props.activeSection === id ? "page" : undefined}
                aria-label={label}
                className={`${props.activeSection === id ? "nav-active" : ""} ${mobileVisible === false ? "nav-mobile-hidden" : ""}`}
                data-mobile-label={mobileLabel}
                onClick={() => props.onNavigate(id)}
                type="button"
              >
                <Icon size={18} />
                <span aria-hidden="true" className="nav-label-full">{label}</span>
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

      <section className="workspace">
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
