"use client";

// Small shared UI primitives used across dashboard pages.

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const VARIANTS: Record<string, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-400",
  ghost: "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/40",
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-md font-medium transition disabled:opacity-50 ${VARIANTS[variant]} ${pad} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </Card>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <Card className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      {label}
    </Card>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-10 text-center">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {description ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30 p-10 text-center">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      {onRetry ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 dark:text-zinc-50">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
