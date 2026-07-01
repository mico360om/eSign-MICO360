import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, unwrap } from "./api";

export interface Me {
  id: string;
  fullName: string;
  email: string;
  role: string | null;
  permissions: string[];
  profiles: { id: string; name: string; isActive: boolean }[];
  hasSignature?: boolean;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

// "Remember me": keep the user signed in for up to 30 days of inactivity. Any
// app use refreshes the clock; after 30 days idle the token is cleared.
const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

export const markActivity = () => {
  if (localStorage.getItem("rememberMe") === "1") localStorage.setItem("lastActivity", String(Date.now()));
};

/** True if a "remember me" session has been idle longer than 30 days. */
function rememberExpired() {
  if (localStorage.getItem("rememberMe") !== "1") return false;
  const last = Number(localStorage.getItem("lastActivity") || 0);
  return last > 0 && Date.now() - last > REMEMBER_MS;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setMe(await unwrap<Me>(api.get("/auth/me")));
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    (async () => {
      // Enforce the 30-day inactivity cap for "remember me" sessions.
      if (rememberExpired()) {
        localStorage.removeItem("token");
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("lastActivity");
      }
      if (localStorage.getItem("token")) { await refresh(); markActivity(); }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string, rememberMe?: boolean) => {
    const res = await unwrap<{ token: string }>(api.post("/auth/login", { email, password, rememberMe: !!rememberMe }));
    localStorage.setItem("token", res.token);
    if (rememberMe) {
      localStorage.setItem("rememberMe", "1");
      localStorage.setItem("lastActivity", String(Date.now()));
    } else {
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("lastActivity");
    }
    await refresh();
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("rememberMe");
    localStorage.removeItem("lastActivity");
    setMe(null);
    location.href = "/login";
  };

  const can = (perm: string) => !!me?.permissions.includes(perm);

  return <Ctx.Provider value={{ me, loading, login, logout, can, refresh }}>{children}</Ctx.Provider>;
}
