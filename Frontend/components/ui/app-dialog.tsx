"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Input } from "@/components/ui/field";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptOptions = ConfirmOptions & {
  defaultValue?: string;
  placeholder?: string;
};

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

type PendingDialog =
  | {
      type: "confirm";
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: "prompt";
      options: PromptOptions;
      value: string;
      resolve: (value: string | null) => void;
    };

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ type: "confirm", options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setDialog({ type: "prompt", options, value: options.defaultValue ?? "", resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  function closeConfirm(result: boolean) {
    if (!dialog || dialog.type !== "confirm") return;
    dialog.resolve(result);
    setDialog(null);
  }

  function closePrompt(result: string | null) {
    if (!dialog || dialog.type !== "prompt") return;
    dialog.resolve(result);
    setDialog(null);
  }

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-950">
                {dialog.options.title ?? (dialog.type === "prompt" ? "Enter value" : "Confirm action")}
              </h2>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm leading-6 text-zinc-600">{dialog.options.message}</p>
              {dialog.type === "prompt" ? (
                <Input
                  autoFocus
                  value={dialog.value}
                  placeholder={dialog.options.placeholder}
                  onChange={(event) =>
                    setDialog({ ...dialog, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") closePrompt(dialog.value);
                    if (event.key === "Escape") closePrompt(null);
                  }}
                />
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
              <Button
                variant="secondary"
                onClick={() => (dialog.type === "prompt" ? closePrompt(null) : closeConfirm(false))}
              >
                {dialog.options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={dialog.options.destructive ? "danger" : "primary"}
                onClick={() =>
                  dialog.type === "prompt" ? closePrompt(dialog.value) : closeConfirm(true)
                }
              >
                {dialog.options.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useAppDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useAppDialog must be used within AppDialogProvider");
  return ctx;
}
