import { Skeleton } from "@/components/ui";

// A skeleton shaped like the screen that is coming, rather than three grey
// bars: the shape itself tells you what is loading, so the transition reads as
// the page arriving instead of the page breaking.
export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Loading" aria-busy="true">
      <div>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="mt-2 h-3 w-96" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
