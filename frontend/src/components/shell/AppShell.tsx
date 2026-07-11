import { Bot, FilePlus, LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { consumerNavIds, navItems, type SectionHeading, type SectionId } from "../../lib/appNavigation";

export function AppShell(props: {
  activeSection: SectionId;
  canUseCreatorTools: boolean;
  canModerateMarketplace: boolean;
  children: ReactNode;
  connectionState: string;
  heading: SectionHeading;
  onAddPrivateInfo: () => void;
  onFindHelper: () => void;
  onNavigate: (section: SectionId) => void;
  onSignOut?: () => void;
  userEmail?: string;
}) {
  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <nav>
          {navItems.filter((item) => consumerNavIds.has(item.id) || (item.id === "creator" && props.canUseCreatorTools) || (item.id === "moderation" && props.canModerateMarketplace)).map(({ id, label, mobileLabel, icon: Icon }) => (
            <button
              aria-current={props.activeSection === id ? "page" : undefined}
              aria-label={label}
              className={props.activeSection === id ? "nav-active" : ""}
              key={id}
              onClick={() => props.onNavigate(id)}
              type="button"
            >
              <Icon size={18} />
              <span aria-hidden="true" className="nav-label-full">{label}</span>
              <span aria-hidden="true" className="nav-label-mobile">{mobileLabel}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
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
              <button className="topbar-primary" onClick={props.onFindHelper} type="button"><Bot size={16} /> Find a Helper</button>
            ) : null}
            {props.activeSection === "vault" ? (
              <button className="topbar-primary" onClick={props.onAddPrivateInfo} type="button"><FilePlus size={16} /> Add Private Info</button>
            ) : null}
            {props.onSignOut ? <button className="topbar-secondary" onClick={props.onSignOut} type="button"><LogOut size={16} /> Sign out</button> : null}
          </div>
        </header>
        {props.children}
      </section>
    </main>
  );
}
