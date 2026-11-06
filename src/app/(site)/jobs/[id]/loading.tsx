import { LoadingLabel, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <LoadingLabel text="Loading job" />
      <Skeleton className="h-4 w-28" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-6 h-4 w-2/3" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />)}
          </div>
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
