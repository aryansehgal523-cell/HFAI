import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Format salary: INR yearly as LPA, everything else with currency symbol. */
export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  period?: string | null,
) {
  if (!min && !max) return null;
  const cur = currency ?? "INR";
  if (cur === "INR" && (period ?? "YEAR") === "YEAR") {
    const lpa = (n: number) => `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}`;
    if (min && max && min !== max) return `₹${lpa(min)} to ${lpa(max)} LPA`;
    return `₹${lpa((min ?? max)!)} LPA`;
  }
  const fmt = new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0, notation: "compact" });
  const per = period === "HOUR" ? "/hr" : period === "MONTH" ? "/mo" : "/yr";
  if (min && max && min !== max) return `${fmt.format(min)} to ${fmt.format(max)}${per}`;
  return `${fmt.format((min ?? max)!)}${per}`;
}

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function absoluteUrl(path = "") {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${path}`;
}
