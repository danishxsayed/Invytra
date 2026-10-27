import { Bone, HeaderSkeleton, LoadingScreen, RowsSkeleton, SkeletonCard } from "@/components/Skeleton";

/** One lead list while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="lead list">
      <HeaderSkeleton back />
      <SkeletonCard className="p-0">
        <div className="border-b border-stone-100 p-4">
          <Bone className="h-9 w-full rounded-lg" />
        </div>
        <RowsSkeleton rows={8} />
      </SkeletonCard>
    </LoadingScreen>
  );
}
