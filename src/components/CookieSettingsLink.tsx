"use client";
import { openCookieSettings } from "./CookieConsent";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button onClick={openCookieSettings} className={className}>
      Cookie settings
    </button>
  );
}
