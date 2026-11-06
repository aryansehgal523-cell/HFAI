"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Theme: match device", light: "Theme: light", dark: "Theme: dark" };

/** Runs before paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", next);
        document.documentElement.dataset.theme = next;
      }
    } catch {}
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      onClick={cycle}
      className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line bg-white text-ink transition hover:border-ink/30"
      aria-label={`${LABEL[theme]}. Click to change.`}
      title={LABEL[theme]}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ y: 12, opacity: 0, rotate: -30 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.18 }}>
          <Icon className="h-4 w-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
