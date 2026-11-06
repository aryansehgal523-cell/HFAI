"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Something went wrong on our side</h1>
        <p className="mt-2 text-slate">The error has been logged. Try again, and if it keeps happening, contact support.</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={reset} className="btn-primary">Try again</button>
          <Link href="/contact" className="btn-ghost">Contact support</Link>
        </div>
      </div>
    </div>
  );
}
