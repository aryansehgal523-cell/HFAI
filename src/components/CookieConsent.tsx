"use client";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";

type Choice = "all" | "essential";
const KEY = "hf-consent-v1";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/** Reopen the banner from anywhere, e.g. a "Cookie settings" link. */
export function openCookieSettings() {
  window.dispatchEvent(new Event("hf:cookie-settings"));
}

/**
 * Consent banner. Essential cookies (sign in, security) are always on and need no consent.
 * Analytics (Google Analytics 4) loads only after the person chooses "Allow analytics".
 * The choice is stored in localStorage and can be changed from the footer.
 */
export function CookieConsent() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Choice | null;
      if (saved === "all" || saved === "essential") setChoice(saved);
      else setOpen(true);
    } catch {
      setOpen(true);
    }
    const reopen = () => setOpen(true);
    window.addEventListener("hf:cookie-settings", reopen);
    return () => window.removeEventListener("hf:cookie-settings", reopen);
  }, []);

  function decide(c: Choice) {
    setChoice(c);
    setOpen(false);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    // If analytics was running and the person withdraws consent, stop it and clear GA cookies.
    if (c === "essential" && GA_ID) {
      (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
      document.cookie.split(";").map((x) => x.split("=")[0].trim()).filter((n) => n.startsWith("_ga")).forEach((n) => {
        document.cookie = `${n}=; Max-Age=0; path=/; domain=${location.hostname.replace(/^www\./, ".")}`;
        document.cookie = `${n}=; Max-Age=0; path=/`;
      });
    }
  }

  return (
    <>
      {GA_ID && choice === "all" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-live="polite"
            aria-label="Cookie preferences"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="no-print fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-xl rounded-2xl border border-line bg-white p-5 shadow-2xl shadow-black/20 sm:bottom-5"
          >
            <div className="flex gap-3">
              <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-marigold-deep" aria-hidden />
              <div>
                <p className="text-[15px] font-semibold text-ink">Cookies on HireFlow</p>
                <p className="mt-1 text-sm text-slate">
                  We use essential cookies to keep you signed in and secure. With your permission we also use analytics cookies to learn which features help. No advertising cookies, ever.{" "}
                  <Link href="/privacy#cookies" className="text-cobalt underline">Details</Link>
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => decide("essential")} className="btn-ghost btn-sm">Essential only</button>
              <button onClick={() => decide("all")} className="btn-primary btn-sm">Allow analytics</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
