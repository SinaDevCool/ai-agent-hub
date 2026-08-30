import { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/index.css";

function DesktopAuthRelay() {
  const code = new URLSearchParams(window.location.search).get("code");
  const destination = code ? `ai-agent-hub://auth/callback?code=${encodeURIComponent(code)}` : "";

  if (!destination) {
    return <main className="auth-screen" role="alert"><section className="auth-card"><strong>Sign-in link is incomplete</strong><p>Return to AI Agent Hub and request a new sign-in link.</p></section></main>;
  }
  window.setTimeout(() => window.location.assign(destination), 50);
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <strong>Return to AI Agent Hub</strong>
        <p>Your email is verified. Open the desktop app to finish signing in.</p>
        <a className="button-link" href={destination}>Open AI Agent Hub</a>
      </section>
    </main>
  );
}

class StartupErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    globalThis.console.error("AI Agent Hub startup failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="auth-screen" role="alert">
        <section className="auth-card">
          <strong>AI Agent Hub could not start</strong>
          <p>{this.state.error.message || "An unexpected startup error occurred."}</p>
          <button onClick={() => window.location.reload()} type="button">Reload app</button>
        </section>
      </main>
    );
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("The application root element is missing.");
const content = window.location.pathname === "/desktop-auth" ? <DesktopAuthRelay /> : <App />;
ReactDOM.createRoot(root).render(<StartupErrorBoundary>{content}</StartupErrorBoundary>);
