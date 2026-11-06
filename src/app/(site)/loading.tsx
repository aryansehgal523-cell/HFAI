import { LoadingLabel, Skeleton } from "@/components/Skeleton";

/** Fallback for any page in the site that doesn't define its own skeleton. */
export default function Loading() {
  return (
    <div className="container-x max-w-4xl py-12">
      <LoadingLabel />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 space-y-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
