import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";
import { api, apiError, unwrap } from "../lib/api";

export default function Login() {
  const { login, refresh } = useAuth();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("admin@mico360.com");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inactivity = (() => { try { const v = sessionStorage.getItem("logoutReason") === "inactivity"; if (v) sessionStorage.removeItem("logoutReason"); return v; } catch { return false; } })();

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await login(email, password); } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      const r = await unwrap<{ message: string }>(api.post("/auth/request-otp", { email }));
      setOtpSent(true);
      setInfo(r.message || "If that email is registered, a login code has been sent.");
    } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  const verifyOtp = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await unwrap<{ token: string }>(api.post("/auth/verify-otp", { email, otp: otp.trim() }));
      localStorage.setItem("token", r.token);
      await refresh();
    } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  const switchMode = (m: "password" | "otp") => { setMode(m); setErr(""); setInfo(""); setOtpSent(false); setOtp(""); };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={mode === "password" ? submitPassword : otpSent ? verifyOtp : requestOtp}>
        <img src="/logo.png" alt="eSign MICO360" />
        <h2 style={{ textAlign: "center", marginBottom: 4 }}>Admin Portal</h2>
        <p className="muted" style={{ textAlign: "center", marginBottom: 18 }}>Sign in to manage documents & approvals</p>

        {/* Mode toggle */}
        <div className="row" style={{ gap: 6, marginBottom: 16 }}>
          <button type="button" className={`btn btn-sm grow ${mode === "password" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("password")}>Password</button>
          <button type="button" className={`btn btn-sm grow ${mode === "otp" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("otp")}>Email OTP</button>
        </div>

        {inactivity && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, textAlign: "center" }}>You were signed out due to inactivity.</div>}

        <div className="field">
          <label>{mode === "otp" ? "Email" : "Email or username"}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === "otp" && otpSent} autoFocus />
        </div>

        {mode === "password" ? (
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin@123" />
          </div>
        ) : otpSent ? (
          <div className="field">
            <label>Login code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" inputMode="numeric" autoFocus />
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={requestOtp} disabled={busy}>Resend code</button>
          </div>
        ) : null}

        {info && <div style={{ color: "var(--info)", marginBottom: 12, fontSize: 13 }}>{info}</div>}
        {err && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Please wait…" : mode === "password" ? "Sign in" : otpSent ? "Verify & sign in" : "Send login code"}
        </button>

        <p className="muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 18 }}>
          {mode === "otp" ? "A one-time code is emailed to your registered address (requires email/SMTP configured)." : "Demo: admin@mico360.com / Admin@123"}
        </p>
      </form>
    </div>
  );
}
