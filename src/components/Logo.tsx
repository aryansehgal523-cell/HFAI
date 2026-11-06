import Link from "next/link";
import { cn } from "@/lib/utils";

/** The HireFlow mark: three stacked strokes (X, Y, Z) that flow into an arrow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8", className)}>
      <rect width="32" height="32" rx="9" fill="#0F1A2E" />
      <rect x="7" y="8.5" width="12" height="3.5" rx="1.75" fill="#3346F2" />
      <rect x="7" y="14.25" width="15" height="3.5" rx="1.75" fill="#FFB627" />
      <rect x="7" y="20" width="9" height="3.5" rx="1.75" fill="#12B886" />
      <path d="M21 18.5l4 3.25-4 3.25" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="HireFlow AI home">
      <LogoMark />
      <span className={cn("font-display text-[19px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>
        HireFlow<span className="text-cobalt"> AI</span>
      </span>
    </Link>
  );
}
