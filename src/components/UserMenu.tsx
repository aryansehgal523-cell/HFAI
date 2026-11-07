"use client";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

export function UserMenu(props: {
  name: string;
  email: string;
  image?: string | null;
  plan: "FREE" | "PREMIUM";
  credits: number;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const initial = props.name.trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 transition hover:border-ink/25"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {props.image ? (
          <Image src={props.image} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-cobalt text-sm font-semibold text-white">{initial}</span>
        )}
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-ink">
          {props.credits}
          <span className="font-normal text-slate"> <span className="sm:hidden" aria-hidden>cr</span><span className="hidden sm:inline">credits</span><span className="sr-only sm:hidden">credits</span></span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-xl shadow-ink/5"
          >
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-medium text-ink">{props.name}</p>
              <p className="truncate text-xs text-slate">{props.email}</p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs text-ink">
                {props.plan === "PREMIUM" ? <><Sparkles className="h-3 w-3 text-marigold-deep" /> Premium</> : "Free plan"}
              </p>
            </div>
            <div className="my-1 h-px bg-line" />
            {[
              ["/dashboard", "Application tracker"],
              ["/profile", "Master resume"],
              ["/settings", "Account and billing"],
              ...(props.isAdmin ? [["/admin", "Admin"]] : []),
            ].map(([href, label]) => (
              <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper">
                {label}
              </Link>
            ))}
            {props.plan === "FREE" && (
              <Link href="/pricing" role="menuitem" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-cobalt hover:bg-cobalt-tint">
                Upgrade to Premium
              </Link>
            )}
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" onClick={() => signOut({ callbackUrl: "/" })} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate hover:bg-paper">
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
