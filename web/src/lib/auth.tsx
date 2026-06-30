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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

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
      if (localStorage.getItem("token")) await refresh();
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await unwrap<{ token: string; user: any }>(api.post("/auth/login", { email, password }));
    localStorage.setItem("token", res.token);
    await refresh();
  };

  const logout = () => {
    localStorage.removeItem("token");
    setMe(null);
    location.href = "/login";
  };

  const can = (perm: string) => !!me?.permissions.includes(perm);

  return <Ctx.Provider value={{ me, loading, login, logout, can, refresh }}>{children}</Ctx.Provider>;
}
