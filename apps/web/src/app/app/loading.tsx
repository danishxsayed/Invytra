import { Bone, HeaderSkeleton, Lines, LoadingScreen, RowsSkeleton, SkeletonCard } from "@/components/Skeleton";

/** Dashboard while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="dashboard">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-3.5 w-24" />
            <Bone className="mt-3 h-8 w-16" />
            <Bone className="mt-3 h-3 w-28" />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard>
        <div className="flex items-center gap-3">
          <Bone className="h-12 w-12 rounded-full" />
          <Lines n={2} className="flex-1" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="p-0">
          <div className="px-5 pt-5">
            <Bone className="h-5 w-36" />
          </div>
          <RowsSkeleton rows={5} pill={false} />
        </SkeletonCard>
        <SkeletonCard className="p-0">
          <div className="px-5 pt-5">
            <Bone className="h-5 w-28" />
          </div>
          <RowsSkeleton rows={5} pill={false} />
        </SkeletonCard>
      </div>
    </LoadingScreen>
  );
}
