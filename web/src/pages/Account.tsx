import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner, useToast } from "../components/ui";
import SignatureManager from "../components/SignatureManager";

export default function Account() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // Password change
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { unwrap(api.get("/account/profile")).then(setP).catch(() => setP({})); }, []);

  const saveProfile = async () => {
    if (!p.fullName?.trim()) return toast("Full name is required", true);
    setBusy(true);
    try {
      await api.put("/account/profile", { fullName: p.fullName, phone: p.phone, department: p.department, designation: p.designation });
      await refresh(); // reflect the new name in the header
      toast("Profile updated");
    } catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (nw.length < 8) return toast("New password must be at least 8 characters (incl. upper, lower & number)", true);
    if (nw !== confirm) return toast("New passwords do not match", true);
    setPwBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword: cur, newPassword: nw });
      setCur(""); setNw(""); setConfirm("");
      toast("Password changed");
    } catch (e) { toast(apiError(e), true); } finally { setPwBusy(false); }
  };

  if (!p) return <Spinner />;

  return (
    <div>
      <h1 className="page-title">My Account</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 640 }}>
        <div className="card card-pad">
          <h3 style={{ margin: "0 0 16px", fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>Profile</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div className="field"><label>Full name</label><input value={p.fullName || ""} onChange={(e) => setP({ ...p, fullName: e.target.value })} /></div>
            <div className="field"><label>Email <span className="muted">(managed by admin)</span></label><input value={p.email || ""} disabled /></div>
            <div className="field"><label>Phone</label><input value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></div>
            <div className="field"><label>Role <span className="muted">(managed by admin)</span></label><input value={p.role?.name || "—"} disabled /></div>
            <div className="field"><label>Department</label><input value={p.department || ""} placeholder="e.g. Finance" onChange={(e) => setP({ ...p, department: e.target.value })} /></div>
            <div className="field"><label>Designation / Title</label><input value={p.designation || ""} placeholder="e.g. Manager" onChange={(e) => setP({ ...p, designation: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={saveProfile}>{busy ? "Saving…" : "Save Profile"}</button>
        </div>

        <SignatureManager />

        <div className="card card-pad">
          <h3 style={{ margin: "0 0 16px", fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>Change Password</h3>
          <div className="field"><label>Current password</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div className="field"><label>New password</label><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
            <div className="field"><label>Confirm new password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword()} /></div>
          </div>
          <span className="muted" style={{ fontSize: 11, display: "block", marginBottom: 12 }}>At least 8 characters, including an uppercase letter, a lowercase letter and a number.</span>
          <button className="btn btn-primary" disabled={pwBusy} onClick={changePassword}>{pwBusy ? "Saving…" : "Change Password"}</button>
        </div>
      </div>
    </div>
  );
}
