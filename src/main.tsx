import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FCOM.lib could not render", error, info);
  }

  render() {
    if (this.state.failed) return <main className="app-failure"><div><h1>FCOM.lib could not finish opening</h1><p>Your locally stored lectures have not been deleted. Reload the page to try again.</p><button onClick={() => window.location.reload()}>Reload FCOM.lib</button></div></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><Home /></AppErrorBoundary></StrictMode>);
