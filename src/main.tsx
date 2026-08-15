import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { ComponentReview } from "../app/components/ComponentReview";
import "../app/globals.css";
import { downloadDiagnostics, installGlobalDiagnostics, recordDiagnostic } from "../lib/diagnostics";

installGlobalDiagnostics();

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FCOM.lib could not render", error, info);
    recordDiagnostic("render-error", "React stopped rendering the application", { error, componentStack: info.componentStack ?? "Unavailable" });
  }

  render() {
    if (this.state.failed) return <main className="app-failure"><div><h1>FCOM.lib could not finish opening</h1><p>Your locally stored lectures have not been deleted. Download the diagnostic log before reloading if you want to report this failure.</p><div className="app-failure-actions"><button onClick={() => window.location.reload()}>Reload FCOM.lib</button><button className="secondary" onClick={downloadDiagnostics}>Download diagnostics</button></div></div></main>;
    return this.props.children;
  }
}

const reviewMode = window.location.pathname === "/ui-review";

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary>{reviewMode ? <ComponentReview /> : <Home />}</AppErrorBoundary></StrictMode>);
