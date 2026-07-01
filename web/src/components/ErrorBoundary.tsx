import { Component, ErrorInfo, ReactNode } from "react";
import { reportClientError } from "../lib/errorReport";

// Catches React render crashes anywhere below it, auto-reports them to the
// server (Error Log), and shows a friendly recovery screen instead of a blank
// page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error?.message || "React render error", `${error?.stack || ""}\nComponent stack:${info?.componentStack || ""}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg)" }}>
          <div className="card card-pad" style={{ maxWidth: 460, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ margin: "0 0 8px" }}>Something went wrong</h2>
            <p className="muted" style={{ marginBottom: 18 }}>
              The problem has been reported automatically so it can be fixed. You can reload to continue.
            </p>
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
