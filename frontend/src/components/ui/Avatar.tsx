import { cn } from "@/lib/cn";

interface AvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /**
   * Object URL da foto (via useAuthenticatedImage) — um <img src> direto não
   * enviaria o header Authorization. Sem foto, caem as iniciais.
   */
  src?: string | null;
  className?: string;
}

const sizes = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-20 w-20 text-xl",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = "md", src, className }: AvatarProps) {
  const base = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    sizes[size],
    className
  );

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- object URL de blob autenticado
      <img
        src={src}
        alt={name}
        className={cn(base, "bg-flauzino-slate-100 object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(base, "bg-flauzino-navy-700 font-semibold text-white")}
    >
      {initials(name)}
    </span>
  );
}
