import { Activity, ArrowRight, Bot, Check, ChevronRight, Database, Download, KeyRound, Laptop, Menu, Moon, Search, ShieldCheck, Sparkles, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getPublicMarketplaceAgent, listPublicMarketplaceAgents, type PublicMarketplaceAgent } from "../api/publicMarketplace";
import { useTheme } from "../hooks/useTheme";
import "../styles/public-site.css";

const categories = ["All", "Travel", "Financial", "Executive", "Wellness", "Domestic", "Maintenance", "Legal", "Custom"];

function usePublicAgents(params?: { featured?: boolean }) {
  const [agents, setAgents] = useState<PublicMarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void listPublicMarketplaceAgents().then((result) => { if (active) setAgents(params?.featured ? result.agents.slice(0, 6) : result.agents); }).catch(() => { if (active) setError("The agent catalog is temporarily unavailable."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params?.featured]);
  return { agents, loading, error };
}

function setMetadata(title: string, description: string) {
  document.title = title;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.append(meta); }
  meta.setAttribute("content", description);
}

function PublicLayout(props: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="public-site">
    <a className="skip-link" href="#public-content">Skip to main content</a>
    <header className="public-header"><div className="public-container public-header-inner">
      <a className="public-brand" href="/"><ShieldCheck aria-hidden="true" size={23} /><span>AI Agent Hub</span></a>
      <button aria-expanded={menuOpen} aria-label={menuOpen ? "Close menu" : "Open menu"} className="public-menu-button" onClick={() => setMenuOpen((value) => !value)} type="button">{menuOpen ? <X /> : <Menu />}</button>
      <nav aria-label="Main navigation" className={menuOpen ? "public-nav is-open" : "public-nav"}>
        <a href="/agents">Explore agents</a><a href="/how-it-works">How it works</a><a href="/privacy">Privacy</a><a href="/download">Desktop</a>
        <button aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="public-theme" onClick={toggleTheme} type="button">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
        <a className="public-sign-in" href="/login">Sign in</a><a className="public-primary-link" href="/signup">Create account</a>
      </nav>
    </div></header>
    <main id="public-content">{props.children}</main>
    <footer className="public-footer"><div className="public-container public-footer-grid"><div><a className="public-brand" href="/"><ShieldCheck size={21} /> AI Agent Hub</a><p>Personal AI agents with permissions, approvals, and understandable receipts.</p><span className="public-beta">Private beta · Windows and web</span></div><nav aria-label="Footer navigation"><a href="/agents">Agents</a><a href="/how-it-works">How it works</a><a href="/privacy">Privacy</a><a href="/security">Security</a><a href="/download">Desktop</a></nav></div></footer>
  </div>;
}

function AgentCard({ agent }: { agent: PublicMarketplaceAgent }) {
  const access = agent.capabilities.requestedDataCategories.length;
  return <article className="public-agent-card"><div className="public-agent-card-top"><span className="public-agent-icon"><Bot size={20} /></span><span className={`public-availability ${agent.capabilities.availability}`}>{agent.capabilities.availability.replace(/_/g, " ")}</span></div><div><span className="public-eyebrow">{agent.category}</span><h3>{agent.name}</h3><p>{agent.tagline || agent.description}</p></div><div className="public-agent-facts"><span><Database size={14} /> {access ? `${access} data ${access === 1 ? "category" : "categories"}` : "No saved data required"}</span><span><KeyRound size={14} /> {agent.capabilities.approvalRequired ? "Asks before sensitive actions" : "No declared high-risk actions"}</span></div><a href={`/agents/${agent.slug}`}>View agent <ArrowRight size={15} /></a></article>;
}

function LandingPage() {
  const { agents, loading, error } = usePublicAgents({ featured: true });
  useEffect(() => setMetadata("AI Agent Hub — Personal AI agents, under your control", "Find privacy-focused AI agents for everyday tasks. Review access, approve sensitive actions, and use local AI on Windows."), []);
  return <>
    <section className="public-hero"><div className="public-container public-hero-grid"><div className="public-hero-copy"><span className="public-kicker"><ShieldCheck size={15} /> Private by default</span><h1>Your personal team of AI agents—without giving up control.</h1><p>Find trusted agents for everyday tasks. Decide what each one may access, approve sensitive actions, and keep AI local on your Windows device when you choose.</p><div className="public-hero-actions"><a className="public-primary-link" href="/agents">Explore agents <ArrowRight size={17} /></a><a className="public-secondary-link" href="/how-it-works">See how it works</a></div><div className="public-trust-row"><span><Check /> Narrow permissions</span><span><Check /> Approval before sensitive actions</span><span><Check /> Visible receipts</span></div></div><div className="hero-product" aria-label="Example AI Agent Hub interaction"><div className="hero-product-bar"><span><span className="product-dot" /> Daily Task Agent</span><span className="public-availability beta">Example flow</span></div><div className="hero-message user">Help me prepare tomorrow’s priorities.</div><div className="hero-message agent"><span><Sparkles size={15} /> Proposed plan</span><strong>Three priorities for tomorrow</strong><ul><li>Review the dentist call reminder</li><li>Prepare the application draft</li><li>Check the travel itinerary</li></ul></div><div className="hero-permission"><ShieldCheck size={18} /><div><strong>You stay in control</strong><span>This example reads no private data and takes no external action.</span></div></div><div className="hero-receipt"><Activity size={16} /> Preview only · nothing was sent</div></div></div></section>
    <section className="public-section public-use-cases"><div className="public-container"><div className="public-section-heading"><span className="public-eyebrow">Built for everyday life</span><h2>Start with what you need help with</h2><p>Choose a real task first. The marketplace explains what each agent can read or do before you add it.</p></div><div className="use-case-grid">{[
      ["Plan a trip", "Travel", "Flights, stays, preferences and itineraries"], ["Organize daily tasks", "daily tasks", "Reminders, priorities and personal administration"], ["Prepare applications", "applications", "Structure job-search and application work"], ["Understand spending", "budget", "Read-only budgeting and financial organization"], ["Manage appointments", "appointments", "Search and prepare appointment requests"], ["Handle home tasks", "home", "Maintenance, shopping and household planning"]
    ].map(([title, query, detail]) => <a href={`/agents?q=${encodeURIComponent(query)}`} key={title}><ChevronRight size={18} /><strong>{title}</strong><span>{detail}</span></a>)}</div></div></section>
    <section className="public-section"><div className="public-container"><div className="public-section-heading split"><div><span className="public-eyebrow">Agent marketplace</span><h2>Choose an agent with its boundaries visible</h2></div><a className="public-secondary-link" href="/agents">Browse all agents <ArrowRight size={16} /></a></div>{loading ? <p className="public-state">Loading published agents…</p> : error ? <p className="public-state error">{error}</p> : <div className="public-agent-grid">{agents.map((agent) => <AgentCard agent={agent} key={agent.id} />)}</div>}</div></section>
    <HowItWorksSection />
    <PrivacyModes />
    <RuntimeComparison />
    <section className="public-cta"><div className="public-container"><ShieldCheck size={32} /><h2>Start with one agent and one real task.</h2><p>See its permissions before you add it. Nothing sensitive continues without your approval.</p><div><a className="public-primary-link" href="/agents">Explore agents</a><a className="public-secondary-link" href="/signup">Create your hub</a></div></div></section>
  </>;
}

function HowItWorksSection() {
  const steps = [[Search, "Find an agent", "Browse by the task you want help with."], [Database, "Review access", "See requested data categories and capabilities first."], [KeyRound, "Approve sensitive actions", "The backend pauses protected actions until you decide."], [Activity, "Keep the receipt", "Review what happened, what was used, and the result."]];
  return <section className="public-section public-how"><div className="public-container"><div className="public-section-heading"><span className="public-eyebrow">How it works</span><h2>Useful assistance without invisible access</h2></div><ol className="public-steps">{steps.map(([Icon, title, description], index) => { const StepIcon = Icon as typeof Search; return <li key={String(title)}><span className="step-number">{index + 1}</span><StepIcon size={22} /><strong>{String(title)}</strong><p>{String(description)}</p></li>; })}</ol></div></section>;
}

function PrivacyModes() {
  return <section className="public-section public-privacy-preview"><div className="public-container public-two-column"><div><span className="public-eyebrow">Privacy choices</span><h2>Choose where interpretation happens</h2><p>Privacy mode and action permission are separate. Even when an agent understands a request, provider access and sensitive actions still pass through policy checks.</p><a className="public-secondary-link" href="/privacy">Understand the privacy model <ArrowRight size={16} /></a></div><div className="privacy-mode-list"><article><Laptop /><div><strong>Local only</strong><span>Desktop interpretation stays on your device. External provider actions are disabled.</span></div></article><article><ShieldCheck /><div><strong>Local first</strong><span>The desktop interprets locally; only a validated plan may reach the policy gate.</span></div></article><article><Sparkles /><div><strong>Cloud assisted</strong><span>Raw prompts may use the configured cloud interpretation service.</span></div></article></div></div></section>;
}

function RuntimeComparison() {
  return <section className="public-section"><div className="public-container"><div className="public-section-heading"><span className="public-eyebrow">Web and Windows</span><h2>Use the hub anywhere. Add local AI on desktop.</h2></div><div className="runtime-grid"><article><Sparkles /><h3>Web application</h3><p>Browse and use agents through the configured backend rules or cloud interpretation path.</p><ul><li>Nothing to install</li><li>Encrypted signed-in workspace</li><li>No local GGUF model execution</li></ul></article><article><Laptop /><h3>Windows desktop</h3><p>Use the same workspace with optional local models managed on your computer.</p><ul><li>Local-only and local-first modes</li><li>Ministral 3B and 8B options</li><li>Model testing and local storage controls</li></ul><a href="/download">Desktop details <ArrowRight size={15} /></a></article></div></div></section>;
}

function PublicMarketplacePage() {
  const source = usePublicAgents();
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "All");
  const visible = useMemo(() => source.agents.filter((agent) => { const haystack = `${agent.name} ${agent.tagline} ${agent.description} ${agent.category}`.toLowerCase(); return (!search || haystack.includes(search.toLowerCase())) && (category === "All" || agent.category === category); }), [category, search, source.agents]);
  useEffect(() => setMetadata("Explore personal AI agents — AI Agent Hub", "Browse privacy-focused personal AI agents and review their access and approval requirements before creating an account."), []);
  useEffect(() => { const query = new URLSearchParams(); if (search) query.set("q", search); if (category !== "All") query.set("category", category); window.history.replaceState({}, "", `/agents${query.size ? `?${query}` : ""}`); }, [category, search]);
  return <section className="public-section public-marketplace-page"><div className="public-container"><div className="public-section-heading"><span className="public-eyebrow">Public marketplace</span><h1>Find an agent for everyday life</h1><p>Review what an agent can access and whether it may propose sensitive actions before you create an account.</p></div><div className="public-marketplace-controls"><label><Search size={17} /><span className="sr-only">Search agents</span><input aria-label="Search agents" onChange={(event) => setSearch(event.target.value)} placeholder="Search by task or agent…" value={search} /></label><label><span className="sr-only">Filter by category</span><select aria-label="Filter by category" onChange={(event) => setCategory(event.target.value)} value={category}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div>{source.loading ? <p className="public-state">Loading published agents…</p> : source.error ? <p className="public-state error">{source.error}</p> : visible.length ? <div className="public-agent-grid">{visible.map((agent) => <AgentCard agent={agent} key={agent.id} />)}</div> : <div className="public-empty"><Search size={26} /><h2>No matching agents</h2><p>Try a broader task or another category.</p><button onClick={() => { setSearch(""); setCategory("All"); }} type="button">Clear filters</button></div>}</div></section>;
}

function PublicAgentPage({ slug }: { slug: string }) {
  const [agent, setAgent] = useState<PublicMarketplaceAgent | null>(null); const [loading, setLoading] = useState(true); const [missing, setMissing] = useState(false);
  useEffect(() => { void getPublicMarketplaceAgent(slug).then(({ agent: result }) => { setAgent(result); setMetadata(`${result.name} — AI Agent Hub`, result.tagline || result.description); }).catch(() => setMissing(true)).finally(() => setLoading(false)); }, [slug]);
  if (loading) return <section className="public-section"><div className="public-container"><p className="public-state">Loading agent profile…</p></div></section>;
  if (missing || !agent) return <section className="public-section"><div className="public-container public-empty"><Bot /><h1>Agent not found</h1><p>This agent is not currently published.</p><a className="public-primary-link" href="/agents">Explore available agents</a></div></section>;
  const returnTo = `/app/discover/agents/${agent.id}?intent=install`;
  return <section className="public-section public-agent-page"><div className="public-container"><a className="public-back" href="/agents">← Back to agents</a><div className="public-agent-hero"><div><span className="public-eyebrow">{agent.category} · {agent.capabilities.availability.replace(/_/g, " ")}</span><h1>{agent.name}</h1><p>{agent.description}</p><div className="public-hero-actions"><a className="public-primary-link" href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Add to my hub <ArrowRight size={16} /></a><a className="public-secondary-link" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in to add</a></div></div><div className="agent-trust-summary"><ShieldCheck /><strong>Boundaries visible before installation</strong><span>{agent.capabilities.approvalRequired ? "This agent declares actions that require approval." : "This agent declares no high-risk actions."}</span></div></div><div className="public-agent-detail-grid"><article><h2>Good for</h2>{agent.capabilities.examplePrompts.length ? <ul>{agent.capabilities.examplePrompts.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{agent.tagline}</p>}</article><article><h2>Private data</h2>{agent.capabilities.requestedDataCategories.length ? <ul>{agent.capabilities.requestedDataCategories.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No saved-data categories are declared.</p>}</article><article><h2>Why this is safer</h2>{agent.capabilities.trustReasons.length ? <ul>{agent.capabilities.trustReasons.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Actions remain behind the hub’s permission and approval checks.</p>}</article></div></div></section>;
}

function InformationPage({ kind }: { kind: "how" | "privacy" | "security" | "download" }) {
  const content = {
    how: { title: "Help from agents, with you in control", intro: "AI Agent Hub separates understanding a request, accessing private information, and taking an external action.", body: <><HowItWorksSection /><PrivacyModes /></> },
    privacy: { title: "Privacy is a set of controls—not a vague promise", intro: "Choose where prompts are interpreted, what information an agent may read, and which actions require your approval.", body: <><PrivacyModes /><section className="public-section"><div className="public-container public-prose"><h2>Four separate controls</h2><ol><li><strong>Stored information:</strong> notes saved in your private-data vault.</li><li><strong>Agent permission:</strong> the categories a specific agent may read.</li><li><strong>Action approval:</strong> a one-time decision for a sensitive proposed action.</li><li><strong>Provider connection:</strong> credentials held behind the backend policy gate.</li></ol><p>These controls are not merged into one unrestricted access switch. Access can be reviewed and revoked.</p></div></section></> },
    security: { title: "Security boundaries designed around real actions", intro: "Agents request tools through a policy gate instead of receiving unrestricted credentials or direct file access.", body: <section className="public-section"><div className="public-container public-prose"><h2>Current security model</h2><ul><li>Authenticated, tenant-scoped workspaces</li><li>Narrow agent permissions</li><li>Approval gates for sensitive actions</li><li>Replay and deduplication protection</li><li>Provider credentials stored behind the backend</li><li>Activity records and provider receipts</li></ul><h2>Beta status</h2><p>Some providers remain sandboxed, disabled, or dependent on production configuration. A feature is not presented as live merely because integration code exists.</p></div></section> },
    download: { title: "Local AI on your Windows computer", intro: "The desktop application adds downloadable local models, local-only interpretation, and device-level model controls.", body: <section className="public-section"><div className="public-container"><div className="runtime-grid"><article><Download /><h2>Ministral 3B</h2><p>Approximately 2 GB. Recommended for computers with about 8 GB of memory.</p><span className="public-availability beta">Desktop beta</span></article><article><Laptop /><h2>Ministral 8B</h2><p>Approximately 5.2 GB. Recommended for computers with about 16 GB of memory.</p><span className="public-availability beta">Desktop beta</span></article></div><div className="public-disclosure"><ShieldCheck /><div><strong>Installer availability</strong><p>The Windows desktop application is currently a beta build. Public download distribution should begin only after the packaged installer and release signature are verified for the current release.</p></div></div></div></section> }
  }[kind];
  useEffect(() => setMetadata(`${content.title} — AI Agent Hub`, content.intro), [content.intro, content.title]);
  return <><section className="public-page-hero"><div className="public-container"><span className="public-kicker"><ShieldCheck size={15} /> AI Agent Hub</span><h1>{content.title}</h1><p>{content.intro}</p></div></section>{content.body}</>;
}

export function PublicSite() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  let page: ReactNode;
  if (path === "/") page = <LandingPage />;
  else if (path === "/agents") page = <PublicMarketplacePage />;
  else if (path.startsWith("/agents/")) page = <PublicAgentPage slug={decodeURIComponent(path.slice("/agents/".length))} />;
  else if (path === "/how-it-works") page = <InformationPage kind="how" />;
  else if (path === "/privacy") page = <InformationPage kind="privacy" />;
  else if (path === "/security") page = <InformationPage kind="security" />;
  else if (path === "/download") page = <InformationPage kind="download" />;
  else page = <section className="public-section"><div className="public-container public-empty"><h1>Page not found</h1><a className="public-primary-link" href="/">Return home</a></div></section>;
  return <PublicLayout>{page}</PublicLayout>;
}
