import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";
import { apiError } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@mico360.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="eSign MICO360" />
        <h2 style={{ textAlign: "center", marginBottom: 4 }}>Admin Portal</h2>
        <p className="muted" style={{ textAlign: "center", marginBottom: 22 }}>
          Sign in to manage documents & approvals
        </p>
        <div className="field">
          <label>Email or username</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin@123" />
        </div>
        {err && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 18 }}>
          Demo: admin@mico360.com / Admin@123
        </p>
      </form>
    </div>
  );
}
