import axios from "axios";

const base = (import.meta as any).env?.VITE_API_BASE || "/api";

export const api = axios.create({ baseURL: base });

// attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// on 401, kick back to login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith("/login")) {
      localStorage.removeItem("token");
      location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// unwrap { data } envelope
export const unwrap = <T = any>(p: Promise<{ data: { data: T } }>): Promise<T> => p.then((r) => r.data.data);

export const apiError = (e: any): string => e?.response?.data?.error || e?.message || "Request failed";
