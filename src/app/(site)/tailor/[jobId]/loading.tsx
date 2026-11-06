import { LoadingLabel, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <LoadingLabel text="Loading your tailored resume" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-line bg-white p-10">
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-64" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className={`h-3.5 ${i % 4 === 0 ? "w-1/4" : "w-full"}`} />)}
          </div>
        </div>
        <div className="space-y-5">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
