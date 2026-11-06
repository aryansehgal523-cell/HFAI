import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <Logo className="justify-center" />
        <p className="mt-10 font-display text-8xl font-semibold text-line">404</p>
        <h1 className="mt-2 text-3xl font-semibold">This page has been filled</h1>
        <p className="mt-2 text-slate">The link may be old, or the job was removed by the company.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/jobs" className="btn-primary">Browse open jobs</Link>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  );
}
