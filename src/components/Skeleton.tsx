import { cn } from "@/lib/utils";

/** Shimmering placeholder block shown while a page streams in. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[length:800px_100%]",
        "bg-[linear-gradient(90deg,rgb(var(--c-line)/0.55)_0%,rgb(var(--c-line))_40%,rgb(var(--c-line)/0.55)_80%)]",
        className,
      )}
    />
  );
}

export function LoadingLabel({ text = "Loading" }: { text?: string }) {
  return <p className="sr-only" role="status">{text}…</p>;
}

export function JobRowSkeleton() {
  return (
    <div className="flex gap-4 border-b border-line px-1 py-5 sm:px-3">
      <Skeleton className="h-11 w-11 rounded-xl" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-3.5 w-3/5" />
        <div className="flex gap-1.5 pt-1">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-14" />)}
        </div>
      </div>
    </div>
  );
}
