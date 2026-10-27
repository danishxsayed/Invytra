import { Bone, HeaderSkeleton, Lines, LoadingScreen, SkeletonCard } from "@/components/Skeleton";

/** LinkedIn accounts while they load. */
export default function Loading() {
  return (
    <LoadingScreen label="accounts">
      <HeaderSkeleton />
      {Array.from({ length: 2 }, (_, i) => (
        <SkeletonCard key={i} className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <Bone className="h-14 w-14 rounded-full" />
            <Lines n={2} className="flex-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="space-y-2">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Bone className="h-10 w-24 rounded-lg" />
            <Bone className="h-10 w-28 rounded-lg" />
          </div>
        </SkeletonCard>
      ))}
    </LoadingScreen>
  );
}
