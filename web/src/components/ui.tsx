import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

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

// Tiny toast system
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string, err = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, err });
    timerRef.current = setTimeout(() => setToast(null), 3200);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}
