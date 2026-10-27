import { Bone, HeaderSkeleton, LoadingScreen, RowsSkeleton, SkeletonCard } from "@/components/Skeleton";

/** One campaign while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="campaign">
      <HeaderSkeleton back />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-3.5 w-20" />
            <Bone className="mt-3 h-7 w-14" />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard className="p-0">
        <div className="flex gap-2 px-5 pt-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Bone key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <RowsSkeleton rows={6} />
      </SkeletonCard>
    </LoadingScreen>
  );
}
