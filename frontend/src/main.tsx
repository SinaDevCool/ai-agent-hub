import { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopAuthRelay } from "./components/shell/DesktopAuthRelay";
import "./styles/index.css";

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
