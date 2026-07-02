import { useEffect, useState } from "react";

// Desktop-only bridge. Undefined on the web build.
const office: any = (typeof window !== "undefined" && (window as any).mico360?.office) || null;

// Banner shown (desktop) when LibreOffice isn't installed. Exact Word/Excel/
// PowerPoint → PDF conversion needs it; the button runs a one-click install —
// winget on Windows, Homebrew on macOS.
export default function OfficePrompt() {
  const [needed, setNeeded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState("");
  const [phase, setPhase] = useState<"prompt" | "installing" | "browser" | "error">("prompt");

  useEffect(() => {
    if (!office) return;
    // Only prompt when LibreOffice is genuinely not installed.
    office.status().then((s: any) => { setNeeded(s && s.supported && s.available === false); if (s?.platform) setPlatform(s.platform); }).catch(() => {});
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

  const msg = {
    prompt: <>📄 For <strong>exact Word/Excel/PowerPoint</strong> formatting, install <strong>LibreOffice</strong> (free, one-time). Without it, Office files use simplified formatting.</>,
    installing: platform === "darwin"
      ? <>🛠 A Terminal window is installing <strong>LibreOffice</strong> via Homebrew. When it finishes, restart the app and re-upload your document.</>
      : <>🛠 Approve the Windows prompt — a PowerShell window is installing <strong>LibreOffice</strong>. When it finishes, restart the app and re-upload your document.</>,
    browser: <>🌐 Opened the LibreOffice download page. Install it, then restart the app and re-upload your document.</>,
    error: <>⚠ Couldn't start the installer automatically. Download LibreOffice from <a href="https://www.libreoffice.org/download/download/" target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}>libreoffice.org</a>, then restart the app.</>,
  }[phase];

  return (
    <div className="office-banner">
      <span className="office-banner-msg">{msg}</span>
      <span className="office-banner-actions">
        {phase === "prompt" && <button className="btn btn-sm" onClick={install}>Install LibreOffice</button>}
        <button className="office-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>✕</button>
      </span>
    </div>
  );
}
