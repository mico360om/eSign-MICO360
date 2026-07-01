import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Desktop-only bridge (Electron preload). Undefined on the web build.
const bridge: any = (typeof window !== "undefined" && (window as any).mico360?.updates) || null;

type State = { version?: string; forced?: boolean; phase: "available" | "downloading" | "downloaded"; percent?: number };

// Global "an update is available" banner shown on every page (desktop only),
// so the user is notified to update no matter where they are in the app.
export default function UpdateNotifier() {
  const [state, setState] = useState<State | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!bridge) return;
    const off = bridge.onEvent((p: any) => {
      if (p.type === "available") setState({ version: p.version, forced: !!p.forced, phase: "available" });
      else if (p.type === "progress") setState((s) => ({ ...(s || { phase: "downloading" }), phase: "downloading", percent: Math.round(p.percent || 0) }));
      else if (p.type === "downloaded") setState((s) => ({ ...(s || {}), version: p.version, phase: "downloaded" }));
    });
    // Also check now, in case the silent startup check already fired its event
    // before this component mounted.
    bridge.check().then((r: any) => {
      if (r?.updateAvailable) setState({ version: r.version, forced: !!r.forced, phase: "available" });
    }).catch(() => {});
    return off;
  }, []);

  if (!bridge || !state || (dismissed && !state.forced && state.phase !== "downloaded")) return null;

  return (
    <div className="update-banner">
      <span className="update-banner-msg">
        {state.phase === "downloaded"
          ? <>✅ Update {state.version ? `v${state.version} ` : ""}downloaded and verified — restart to install.</>
          : state.phase === "downloading"
            ? <>⬇ Downloading update… {state.percent ?? 0}%</>
            : <>🔔 A new version {state.version ? <strong>v{state.version}</strong> : ""} is available.{state.forced ? " This update is required." : ""}</>}
      </span>
      <span className="update-banner-actions">
        {state.phase === "downloaded"
          ? <button className="btn btn-sm" onClick={() => bridge.install()}>Restart &amp; Install</button>
          : state.phase === "available"
            ? <button className="btn btn-sm" onClick={() => nav("/legal/about")}>View &amp; Update</button>
            : null}
        {!state.forced && state.phase !== "downloaded" && (
          <button className="update-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>✕</button>
        )}
      </span>
    </div>
  );
}
