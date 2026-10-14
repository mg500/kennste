/** Playful background shapes (only visible in themes with --decor: 1). */
export function Decor({ variant = "corner" }: { variant?: "corner" | "confetti" | "wide" }) {
  if (variant === "confetti") {
    return (
      <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute w-4 h-4 rounded bg-primary rotate-12" style={{ top: 110, left: "10%" }} />
        <span className="absolute w-3.5 h-3.5 rounded-full bg-info" style={{ top: 80, right: "18%" }} />
        <span className="absolute w-5 h-2.5 rounded bg-positive -rotate-30" style={{ top: 250, right: "9%" }} />
        <span className="absolute w-3 h-3 rounded-full bg-buzz" style={{ top: 290, left: "7%" }} />
      </div>
    );
  }
  if (variant === "wide") {
    return (
      <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute w-[420px] h-[420px] rounded-full bg-buzz" style={{ left: -160, bottom: -220 }} />
        <span className="absolute w-[200px] h-[200px] rounded-[40px] bg-info rotate-20" style={{ left: "52%", top: -90 }} />
      </div>
    );
  }
  return (
    <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute w-64 h-64 rounded-full bg-buzz opacity-90" style={{ top: -90, right: -110 }} />
      <span className="absolute w-36 h-36 rounded-full bg-info" style={{ top: 150, right: -50 }} />
      <span className="absolute w-44 h-44 rounded-[36px] bg-positive rotate-[18deg]" style={{ bottom: 120, left: -100 }} />
    </div>
  );
}
