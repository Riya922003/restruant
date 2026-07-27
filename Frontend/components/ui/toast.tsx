"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Errors linger longer than confirmations so they are not missed.
const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  error: 6000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((cur) => [...cur, { id, kind, message }]);
      setTimeout(() => remove(id), AUTO_DISMISS_MS[kind]);
    },
    [remove],
  );

  const success = useCallback((m: string) => push(m, "success"), [push]);
  const error = useCallback((m: string) => push(m, "error"), [push]);
  const info = useCallback((m: string) => push(m, "info"), [push]);

  return (
    <ToastContext.Provider value={{ push, success, error, info }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const TONE: Record<ToastKind, { border: string; icon: string; chip: string }> = {
  success: { border: "border-emerald-200", icon: "✓", chip: "bg-emerald-100 text-emerald-700" },
  error: { border: "border-red-200", icon: "!", chip: "bg-red-100 text-red-700" },
  info: { border: "border-zinc-200", icon: "i", chip: "bg-zinc-100 text-zinc-600" },
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${tone.border} bg-white px-3.5 py-3 shadow-lg`}
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone.chip}`}>
              {tone.icon}
            </span>
            <p className="flex-1 text-sm text-zinc-800">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-lg leading-none text-zinc-400 transition hover:text-zinc-700"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
