import { Bone, HeaderSkeleton, LoadingScreen, SkeletonCard } from "@/components/Skeleton";

/** The campaign builder while it loads. */
export default function Loading() {
  return (
    <LoadingScreen label="campaign builder">
      <HeaderSkeleton back action={false} />
      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-7 w-7 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-3.5 w-24" />
                <Bone className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonCard className="space-y-5 p-7">
          <Bone className="h-3 w-20" />
          <Bone className="h-7 w-56" />
          <Bone className="h-11 w-full max-w-xl rounded-lg" />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Bone key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    </LoadingScreen>
  );
}
