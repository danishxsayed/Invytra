import { Bone, HeaderSkeleton, LoadingScreen, RowsSkeleton, SkeletonCard } from "@/components/Skeleton";

/** Activity while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="activity">
      <HeaderSkeleton action={false} />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-10 w-40 rounded-lg" />
        ))}
      </div>
      <SkeletonCard className="p-0">
        <RowsSkeleton rows={10} />
      </SkeletonCard>
    </LoadingScreen>
  );
}
