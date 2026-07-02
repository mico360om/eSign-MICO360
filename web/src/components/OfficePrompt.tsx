import { useEffect, useState } from "react";

// Desktop-only bridge. Undefined on the web build.
const office: any = (typeof window !== "undefined" && (window as any).mico360?.office) || null;

// Manual install command per platform, shown when LibreOffice isn't installed.
const MANUAL: Record<string, { label: string; cmd: string }> = {
  win32: { label: "Windows — run in Command Prompt / PowerShell:", cmd: "winget install -e --id TheDocumentFoundation.LibreOffice" },
  darwin: { label: "macOS — run in Terminal (requires Homebrew):", cmd: "brew install --cask libreoffice" },
  linux: { label: "Linux — run in your terminal:", cmd: "sudo apt install libreoffice" },
};

// Banner shown (desktop) ONLY when LibreOffice isn't installed. Exact Word/Excel/
// PowerPoint → PDF conversion needs it; the button runs a one-click install
// (winget on Windows, Homebrew on macOS) and the manual command is shown too.
export default function OfficePrompt() {
  const [needed, setNeeded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState("");
  const [phase, setPhase] = useState<"prompt" | "installing" | "browser" | "error">("prompt");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!office) return;
    // available === false means LibreOffice is genuinely not installed.
    const recheck = () => office.status()
      .then((s: any) => { setNeeded(!!(s && s.supported && s.available === false)); if (s?.platform) setPlatform(s.platform); })
      .catch(() => {});
    recheck();
    // Re-detect when the window regains focus, so the banner disappears as soon
    // as LibreOffice is installed — no app restart required.
    const onFocus = () => recheck();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  if (!office || !needed || dismissed) return null;

  const install = async () => {
    try {
      const r = await office.install();
      if (r?.alreadyInstalled) { setNeeded(false); return; } // detected mid-session
      if (r?.opened === "browser") setPhase("browser");
      else if (r?.ok) setPhase("installing");
      else setPhase("error");
    } catch { setPhase("error"); }
  };

  const manual = MANUAL[platform] || MANUAL.linux;
  const copyCmd = async () => {
    try { await navigator.clipboard.writeText(manual.cmd); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked — text is selectable */ }
  };

  const msg = {
    prompt: <>📄 For <strong>exact Word/Excel/PowerPoint</strong> formatting, install <strong>LibreOffice</strong> (free, one-time). Without it, Office files use simplified formatting.</>,
    installing: platform === "darwin"
      ? <>🛠 A Terminal window is installing <strong>LibreOffice</strong> via Homebrew. When it finishes, restart the app and re-upload your document.</>
      : <>🛠 Approve the Windows prompt — a PowerShell window is installing <strong>LibreOffice</strong>. When it finishes, restart the app and re-upload your document.</>,
    browser: <>🌐 Opened the LibreOffice download page. Install it, then restart the app and re-upload your document.</>,
    error: <>⚠ Couldn't start the installer automatically. Use the manual command below, or download from <a href="https://www.libreoffice.org/download" target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}>libreoffice.org</a>.</>,
  }[phase];

  // Show the copy-paste command whenever the user still needs to install it.
  const showManual = phase === "prompt" || phase === "error";

  return (
    <div className="office-banner">
      <span className="office-banner-msg">{msg}</span>
      <span className="office-banner-actions">
        {phase === "prompt" && <button className="btn btn-sm" onClick={install}>Install LibreOffice</button>}
        <button className="office-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>✕</button>
      </span>
      {showManual && (
        <div className="office-banner-manual">
          <span className="office-banner-manual-label">{manual.label}</span>
          <code className="office-banner-code">{manual.cmd}</code>
          <button className="btn btn-sm" onClick={copyCmd}>{copied ? "Copied ✓" : "Copy"}</button>
          <a className="office-banner-manual-link" href="https://www.libreoffice.org/download" target="_blank" rel="noreferrer">or download manually</a>
        </div>
      )}
    </div>
  );
}
