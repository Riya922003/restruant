"use client";

const baseInput =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:hover:border-zinc-600 dark:focus:border-zinc-300 dark:focus:ring-zinc-300/10 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-500";

// Inline SVG chevron (zinc-500) so the dropdown has a modern custom caret
// instead of the dated native browser arrow.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInput} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInput} ${props.className ?? ""}`} />;
}

export function Select({ className = "", style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${baseInput} cursor-pointer appearance-none bg-no-repeat pr-9 ${className}`}
      style={{
        backgroundImage: CHEVRON,
        backgroundPosition: "right 0.65rem center",
        backgroundSize: "1.15rem",
        ...style,
      }}
    />
  );
}
