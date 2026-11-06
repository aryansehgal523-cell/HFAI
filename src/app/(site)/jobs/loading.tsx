import { JobRowSkeleton, LoadingLabel, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <LoadingLabel text="Loading jobs" />
      <Skeleton className="h-[58px] rounded-2xl" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[250px_1fr]">
        <div className="hidden space-y-6 lg:block">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="flex flex-wrap gap-2">{[0, 1, 2].map((j) => <Skeleton key={j} className="h-8 w-20 rounded-full" />)}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between border-b border-line pb-4">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: 6 }, (_, i) => <JobRowSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}
