/**
 * Soft stage light behind the content (only visible in themes with --decor: 1, i.e. "Bühne").
 * Phones: from below, behind the buzzer; big screens and the end: from above. `color` overrides the tint (cover color).
 */
export function Decor({ variant = "corner", color }: { variant?: "corner" | "confetti" | "wide"; color?: string }) {
  const tint = color ?? (variant === "corner" ? "var(--buzz)" : "var(--primary)");
  const place = variant === "corner"
    ? "-bottom-40 h-[600px] w-[600px] lg:-bottom-[480px] lg:h-[1000px] lg:w-[1600px]"
    : "-top-[420px] h-[1000px] w-[1600px]";
  return (
    <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
      <span className={`absolute left-1/2 -translate-x-1/2 rounded-full ${place}`}
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${tint} 24%, transparent), transparent)` }} />
    </div>
  );
}
