import { useEffect, useRef, useState } from "react";

// Bridge exposed by the Electron preload (desktop only). On the web build this
// is undefined and the whole panel renders a graceful "web edition" note.
const bridge: any = (typeof window !== "undefined" && (window as any).mico360?.updates) || null;

type Phase = "idle" | "checking" | "available" | "uptodate" | "downloading" | "downloaded" | "error";

function fmtBytes(n?: number) {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export default function UpdatePanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<string>("");
  const [info, setInfo] = useState<any>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [forced, setForced] = useState(false);
  const off = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.status().then((s: any) => setCurrent(s?.currentVersion || "")).catch(() => {});
    off.current = bridge.onEvent((p: any) => {
      switch (p.type) {
        case "checking": setPhase("checking"); setError(""); break;
        case "available":
          setInfo(p); setForced(!!p.forced); setCurrent(p.currentVersion || current);
          setPhase(p.forced ? "downloading" : "available");
          break;
        case "up-to-date": setPhase("uptodate"); break;
        case "progress": setPhase("downloading"); setPercent(Math.round(p.percent || 0)); break;
        case "downloaded": setPhase("downloaded"); setInfo((i: any) => ({ ...(i || {}), version: p.version })); break;
        case "error": setPhase("error"); setError(p.error || "Update failed"); break;
      }
    });
    return () => { off.current?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bridge) {
    return (
      <div className="card card-pad" style={{ marginBottom: 22, background: "var(--bg)" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Software Updates</h2>
        <div className="muted" style={{ fontSize: 13 }}>Automatic updates are available in the desktop edition. You are using the web edition, which is updated by your administrator.</div>
      </div>
    );
  }

  const check = async () => {
    setPhase("checking"); setError("");
    const r = await bridge.check();
    if (r?.ok === false && r?.error) { setPhase("error"); setError(r.error); }
    else if (r?.updateAvailable) { setInfo(r); setForced(!!r.forced); setPhase(r.forced ? "downloading" : "available"); if (r.forced) bridge.download(); }
    else if (r?.ok) setPhase("uptodate");
  };
  const download = async () => { setPhase("downloading"); setPercent(0); const r = await bridge.download(); if (r?.ok === false) { setPhase("error"); setError(r.error || "Download failed"); } };
  const install = () => bridge.install();

  return (
    <div className="card card-pad" style={{ marginBottom: 22, background: "var(--bg)" }}>
      <div className="between" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Software Updates</h2>
        {(phase === "idle" || phase === "uptodate" || phase === "error" || phase === "available") && (
          <button className="btn btn-ghost btn-sm" onClick={check} disabled={phase === "checking"}>↻ Check for Updates</button>
        )}
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: phase === "idle" ? 0 : 12 }}>
        Current version: <strong style={{ color: "var(--ink)" }}>v{current || "—"}</strong>
      </div>

      {phase === "checking" && <div className="muted" style={{ fontSize: 13 }}>Checking for updates…</div>}
      {phase === "uptodate" && <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>✓ You are on the latest version.</div>}

      {(phase === "available" || phase === "downloading" || phase === "downloaded") && info && (
        <div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            New version <strong style={{ color: "var(--primary)" }}>v{info.version}</strong> available
            {info.sizeBytes ? <span className="muted"> · {fmtBytes(info.sizeBytes)}</span> : null}
            {forced && <span className="badge" style={{ background: "var(--warning)", marginLeft: 8 }}>Required</span>}
          </div>
          {info.changelog && (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, color: "var(--ink-soft)", background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", maxHeight: 160, overflow: "auto", margin: "0 0 12px" }}>{info.changelog}</pre>
          )}

          {phase === "available" && !forced && (
            <button className="btn btn-primary btn-sm" onClick={download}>Download Update</button>
          )}

          {phase === "downloading" && (
            <div>
              <div style={{ height: 10, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary)", transition: "width 0.2s" }} />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Downloading… {percent}%</div>
            </div>
          )}

          {phase === "downloaded" && (
            <div>
              <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600, marginBottom: 8 }}>✓ Update downloaded and verified.</div>
              <button className="btn btn-primary btn-sm" onClick={install}>Restart &amp; Install</button>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your data, settings and records are preserved.</div>
            </div>
          )}
        </div>
      )}

      {phase === "error" && (
        <div style={{ fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>⚠ {error}</div>
      )}
    </div>
  );
}
