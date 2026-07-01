import { useEffect, useState } from "react";

// Desktop-only bridge. Undefined on the web build.
const office: any = (typeof window !== "undefined" && (window as any).mico360?.office) || null;

// Banner shown (desktop) when LibreOffice isn't installed. Exact Word/Excel/
// PowerPoint → PDF conversion needs it; the button opens an elevated PowerShell
// that installs it via winget.
export default function OfficePrompt() {
  const [needed, setNeeded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!office) return;
    office.status().then((s: any) => setNeeded(s && s.supported && !s.available)).catch(() => {});
  }, []);

  if (!office || !needed || dismissed) return null;

  const install = async () => {
    setInstalling(true);
    try { await office.install(); } catch { /* ignore */ }
  };

  return (
    <div className="office-banner">
      <span className="office-banner-msg">
        {installing
          ? <>🛠 A PowerShell window is installing <strong>LibreOffice</strong>. When it finishes, restart the app and re-upload your document for exact formatting.</>
          : <>📄 For <strong>exact Word/Excel/PowerPoint</strong> formatting, install <strong>LibreOffice</strong> (free, one-time). Without it, Office files are converted with simplified formatting.</>}
      </span>
      <span className="office-banner-actions">
        {!installing && <button className="btn btn-sm" onClick={install}>Install LibreOffice</button>}
        <button className="office-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>✕</button>
      </span>
    </div>
  );
}
