import { useEffect, useRef, useState } from "react";
import { APP_INFO } from "./legal/content";

// Desktop-only updater bridge (Electron preload). Undefined on the web build.
const bridge: any = (typeof window !== "undefined" && (window as any).mico360?.updates) || null;
const isDesktop = !!(typeof window !== "undefined" && (window as any).mico360);

type Phase = "idle" | "checking" | "available" | "uptodate" | "downloading" | "downloaded" | "error";

function fmtBytes(n?: number) {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export default function Updates() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<string>(APP_INFO.appVersion);
  const [info, setInfo] = useState<any>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [forced, setForced] = useState(false);
  const off = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.status().then((s: any) => setCurrent(s?.currentVersion || APP_INFO.appVersion)).catch(() => {});
    off.current = bridge.onEvent((p: any) => {
      switch (p.type) {
        case "checking": setPhase("checking"); setError(""); break;
        case "available":
          setInfo(p); setForced(!!p.forced); if (p.currentVersion) setCurrent(p.currentVersion);
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
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Software Update</h1>

      {/* Current version */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Installed version</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)", lineHeight: 1.1 }}>v{current}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{APP_INFO.appName} · {isDesktop ? "Desktop edition" : "Web edition"}</div>
          </div>
          {isDesktop && (phase === "idle" || phase === "uptodate" || phase === "error" || phase === "available") && (
            <button className="btn btn-primary" onClick={check} disabled={phase === "checking"}>↻ Check for Updates</button>
          )}
        </div>
      </div>

      {/* Update status (desktop) */}
      {isDesktop && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="section-title">Update status</div>

          {phase === "idle" && <div className="muted" style={{ fontSize: 13 }}>Click “Check for Updates” to see if a newer version is available. The app also checks automatically on startup.</div>}
          {phase === "checking" && <div className="muted" style={{ fontSize: 13 }}>Checking for updates…</div>}
          {phase === "uptodate" && <div style={{ fontSize: 14, color: "var(--success)", fontWeight: 600 }}>✓ You are on the latest version.</div>}

          {(phase === "available" || phase === "downloading" || phase === "downloaded") && info && (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginBottom: 12 }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "var(--muted)", width: 130 }}>New version</td><td><strong style={{ color: "var(--primary)" }}>v{info.version}</strong> {forced && <span className="badge" style={{ background: "var(--warning)", marginLeft: 6 }}>Required</span>}</td></tr>
                  {info.sizeBytes ? <tr><td style={{ padding: "5px 0", color: "var(--muted)" }}>Download size</td><td>{fmtBytes(info.sizeBytes)}</td></tr> : null}
                  {info.releaseDate ? <tr><td style={{ padding: "5px 0", color: "var(--muted)" }}>Released</td><td>{new Date(info.releaseDate).toLocaleDateString()}</td></tr> : null}
                </tbody>
              </table>
              {info.changelog && (
                <>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>What's new</div>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, color: "var(--ink-soft)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", maxHeight: 220, overflow: "auto", margin: "0 0 14px" }}>{info.changelog}</pre>
                </>
              )}

              {phase === "available" && !forced && <button className="btn btn-primary" onClick={download}>⬇ Download Update</button>}

              {phase === "downloading" && (
                <div>
                  <div style={{ height: 12, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary)", transition: "width 0.2s" }} />
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Downloading &amp; verifying… {percent}%</div>
                </div>
              )}

              {phase === "downloaded" && (
                <div>
                  <div style={{ fontSize: 14, color: "var(--success)", fontWeight: 600, marginBottom: 8 }}>✓ Update downloaded and integrity-verified.</div>
                  <button className="btn btn-primary" onClick={install}>Restart &amp; Install Now</button>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Your data, settings, companies and records are preserved.</div>
                </div>
              )}
            </div>
          )}

          {phase === "error" && <div style={{ fontSize: 13.5, color: "var(--danger)", fontWeight: 600 }}>⚠ {error}</div>}
        </div>
      )}

      {/* Manual update / GitHub */}
      <div className="card card-pad">
        <div className="section-title">Update manually</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          {isDesktop
            ? "You can also download the installer directly from the official repository and run it — your data is preserved."
            : "You are using the web edition (updated by your administrator). To install the desktop app, download the latest installer from the official repository."}
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn-primary btn-sm" href={APP_INFO.latestReleaseUrl} target="_blank" rel="noreferrer">⬇ Download latest release</a>
          <a className="btn btn-ghost btn-sm" href={APP_INFO.releasesUrl} target="_blank" rel="noreferrer">All releases</a>
          <a className="btn btn-ghost btn-sm" href={APP_INFO.repoUrl} target="_blank" rel="noreferrer">GitHub repository</a>
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="muted">Repository: </span>
          <a href={APP_INFO.repoUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{APP_INFO.repoUrl}</a>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          <span className="muted">Latest release: </span>
          <a href={APP_INFO.latestReleaseUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{APP_INFO.latestReleaseUrl}</a>
        </div>
      </div>
    </div>
  );
}
