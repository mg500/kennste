import type { ButtonHTMLAttributes, CSSProperties } from "react";

type Variant = "primary" | "buzz" | "positive" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, { className: string; shade?: string }> = {
  primary: { className: "bg-primary text-on-accent pressable", shade: "var(--primary-shade)" },
  buzz: { className: "bg-buzz text-on-accent pressable", shade: "var(--buzz-shade)" },
  positive: { className: "bg-positive text-on-accent pressable", shade: "var(--positive-shade)" },
  secondary: { className: "bg-surface-2 text-text hover:brightness-110" },
  outline: { className: "border-2 border-surface-2 text-text hover:border-muted" },
  ghost: { className: "text-muted hover:text-text" },
};

const SIZES: Record<Size, string> = {
  sm: "h-10 px-3.5 text-sm rounded-xl",
  md: "h-12 px-5 text-base rounded-2xl",
  lg: "h-15 px-6 text-lg rounded-card",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({ variant = "primary", size = "md", block, className = "", style, ...props }: ButtonProps) {
  const v = VARIANTS[variant];
  return (
    <button
      {...props}
      style={{ ...(v.shade ? ({ "--shade": v.shade } as CSSProperties) : {}), ...style }}
      className={`inline-flex items-center justify-center gap-2 font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${v.className} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
    />
  );
}
