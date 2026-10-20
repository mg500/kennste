/** The brand: the "?!" tile of the app icon, optionally with the word mark ("Kennste" plus "?!" in the accent color). */
export function Logo({ size = "md", mark }: { size?: "sm" | "md" | "lg" | "xl"; mark?: boolean }) {
  const s = {
    sm: { tile: "h-8 w-8 rounded-[9px] text-[19px]", word: "text-lg", gap: "gap-2" },
    md: { tile: "h-10 w-10 rounded-xl text-2xl lg:h-13 lg:w-13 lg:rounded-[15px] lg:text-[31px]", word: "text-[22px] lg:text-[30px]", gap: "gap-2.5 lg:gap-3.5" },
    lg: { tile: "h-15 w-15 rounded-[17px] text-[36px]", word: "text-[36px]", gap: "gap-4" },
    xl: { tile: "h-18 w-18 rounded-[20px] text-[44px]", word: "text-[44px]", gap: "gap-4" },
  }[size];
  return (
    <span className={`inline-flex items-center ${s.gap}`}>
      <span aria-hidden className={`logo-mark inline-flex shrink-0 items-center justify-center bg-on-accent font-extrabold text-primary shadow-[inset_0_0_0_2px_var(--surface-2)] ${s.tile}`}>?!</span>
      {mark
        ? <span className="sr-only">Kennste?!</span>
        : <span className={`font-display leading-none font-extrabold tracking-tight ${s.word}`}>Kennste<span className="text-primary-text">?!</span></span>}
    </span>
  );
}
