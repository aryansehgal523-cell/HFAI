"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export function MobileNav({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const items = [
    ["/jobs", "Find jobs"],
    ["/#resume", "Resume builder"],
    ["/pricing", "Pricing"],
    ...(loggedIn ? [["/dashboard", "Tracker"], ["/profile", "Master resume"]] : [["/login", "Log in"]]),
  ];
  return (
    <div className="md:hidden">
      <button onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute inset-x-0 top-16 overflow-hidden border-b border-line bg-paper"
          >
            <div className="container-x flex flex-col py-3">
              {items.map(([href, label]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="py-3 font-display text-xl text-ink">
                  {label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
