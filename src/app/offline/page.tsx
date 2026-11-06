import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-6">
      <div className="max-w-sm text-center">
        <Logo className="justify-center" />
        <span className="mx-auto mt-10 grid h-14 w-14 place-items-center rounded-2xl bg-cobalt-tint text-cobalt">
          <WifiOff className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-slate">Jobs and pages you opened recently still work. Reconnect to search for new jobs or tailor a resume.</p>
        <RetryButton />
      </div>
    </main>
  );
}
