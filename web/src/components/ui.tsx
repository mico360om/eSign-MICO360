import { createContext, CSSProperties, ReactNode, useContext, useEffect, useRef, useState } from "react";

// Document status -> color (mirrors shared/brand.js)
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#8a8c8a",
  UPLOADED: "#1565c0",
  PDF_CONVERTED: "#1565c0",
  PENDING_APPROVAL: "#c77700",
  PENDING_SIGNATURE: "#c77700",
  PARTIALLY_APPROVED: "#b33235",
  APPROVED: "#2e7d32",
  REJECTED: "#b3261e",
  COMPLETED: "#2e7d32",
  CANCELLED: "#8a8c8a",
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className="badge" style={{ background: STATUS_COLORS[status] || "#8a8c8a" }}>
    {status.replace(/_/g, " ")}
  </span>
);

export const Spinner = () => <div className="spin" />;

// Skeleton placeholder shimmer — used by DataTable (and cards) while loading,
// so the layout is visible immediately instead of a blank full-page spinner.
export const Skeleton = ({ width = "100%", height = 12, style }: { width?: number | string; height?: number; style?: CSSProperties }) => (
  <span className="skeleton skeleton-line" style={{ width, height, ...style }} />
);

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>{title}</header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// Toast system — longer/auto duration, manual dismiss, optional action button
// (e.g. Undo) and success styling. Backward compatible with existing
// `toast(msg)` / `toast(msg, true)` call sites.
export interface ToastOpts { action?: { label: string; onClick: () => void }; duration?: number; type?: "success" | "error" }
type ToastState = { msg: string; err?: boolean; type?: string; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(msg: string, err?: boolean, opts?: ToastOpts) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = () => { if (timerRef.current) clearTimeout(timerRef.current); setToast(null); };
  const show = (msg: string, err = false, opts: ToastOpts = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, err: err || opts.type === "error", type: opts.type, action: opts.action });
    const duration = opts.duration ?? (opts.action ? 7000 : 5000);
    timerRef.current = setTimeout(() => setToast(null), duration);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.err ? "err" : toast.type === "success" ? "success" : ""}`} role="status" aria-live="polite">
          <span className="toast-msg">{toast.msg}</span>
          {toast.action && (
            <button className="toast-action" onClick={() => { toast.action!.onClick(); dismiss(); }}>{toast.action.label}</button>
          )}
          <button className="toast-x" aria-label="Dismiss" onClick={dismiss}>✕</button>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
