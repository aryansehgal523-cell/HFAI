import { LoadingLabel, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-x py-12">
      <LoadingLabel text="Loading your tracker" />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-16 w-56 rounded-2xl" />
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
