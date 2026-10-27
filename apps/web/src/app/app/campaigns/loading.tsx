import { Bone, HeaderSkeleton, Lines, LoadingScreen, SkeletonCard } from "@/components/Skeleton";

/** Campaigns list while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="campaigns">
      <HeaderSkeleton />
      <SkeletonCard className="divide-y divide-stone-100 p-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid items-center gap-4 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
            <div className="space-y-2">
              <Bone className="h-4 w-48" />
              <Bone className="h-3 w-32" />
            </div>
            <Bone className="hidden h-6 w-20 rounded-full sm:block" />
            <Lines n={1} className="hidden sm:block" />
            <Bone className="hidden h-2 w-full rounded-full sm:block" />
          </div>
        ))}
      </SkeletonCard>
    </LoadingScreen>
  );
}
