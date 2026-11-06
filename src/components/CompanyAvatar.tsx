import { cn } from "@/lib/utils";

const TONES = [
  ["#E8EBFF", "#3346F2"],
  ["#FFF4DB", "#B87800"],
  ["#E3F8F1", "#0B7A59"],
  ["#FDECEC", "#C2393E"],
  ["#EEF0F5", "#24314A"],
  ["#F1E9FF", "#6B3FD6"],
];

export function CompanyAvatar({ name, className }: { name: string; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TONES[h % TONES.length];
  return (
    <span
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-lg font-semibold", className)}
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
