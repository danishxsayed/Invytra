import { Bone, HeaderSkeleton, LoadingScreen, SkeletonCard } from "@/components/Skeleton";

/** Lead lists while they load. */
export default function Loading() {
  return (
    <LoadingScreen label="lead lists">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Bone className="h-5 w-40" />
            <Bone className="h-3.5 w-28" />
            <Bone className="h-2 w-full rounded-full" />
          </SkeletonCard>
        ))}
      </div>
    </LoadingScreen>
  );
}
