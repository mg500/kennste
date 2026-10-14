"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet dialog. Closes on backdrop click and Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Only on open/close — re-running on every render would steal focus from inputs inside the sheet
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button aria-label="Schließen" onClick={onClose} className="absolute inset-0 cursor-default bg-black/60" />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-[28px] bg-surface px-5 pt-3 pb-7 outline-none">
        <span aria-hidden className="h-1.5 w-11 self-center rounded-full bg-surface-2" />
        <h2 className="font-display text-2xl font-extrabold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
