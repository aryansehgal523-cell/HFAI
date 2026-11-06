import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center py-12">
          <main id="main" className="mx-auto w-full max-w-sm">{children}</main>
        </div>
        <p className="text-xs text-slate">
          <Link href="/terms" className="hover:text-ink">Terms</Link> <span className="mx-2">/</span>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link> <span className="mx-2">/</span>
          <Link href="/contact" className="hover:text-ink">Help</Link>
        </p>
      </div>

      <div className="light-scope relative hidden overflow-hidden bg-ink lg:block" aria-hidden>
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-cobalt/40 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-mint/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="max-w-md font-display text-[34px] font-medium leading-[1.25] text-white">
            <span className="seg-x">Landed 3 interviews in 2 weeks</span>, <span className="seg-y">from 41 applications</span>,{" "}
            <span className="seg-z">by sending a tailored resume to every single one.</span>
          </p>
          <p className="mt-8 text-white/60">The kind of line HireFlow writes for your resume, from your own facts.</p>
          <div className="mt-12 flex gap-6 text-sm text-white/70">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-cobalt" /> what you did</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-marigold" /> the proof</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-mint" /> how</span>
          </div>
        </div>
      </div>
    </div>
  );
}
