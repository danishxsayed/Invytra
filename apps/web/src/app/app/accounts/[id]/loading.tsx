import { Bone, HeaderSkeleton, LoadingScreen, SkeletonCard } from "@/components/Skeleton";

/** One account and its settings while they load. */
export default function Loading() {
  return (
    <LoadingScreen label="account">
      <HeaderSkeleton back action={false} />
      {Array.from({ length: 3 }, (_, i) => (
        <SkeletonCard key={i} className="grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8">
          <div className="space-y-2">
            <Bone className="h-5 w-32" />
            <Bone className="h-3.5 w-48" />
          </div>
          <div className="space-y-4">
            <Bone className="h-11 w-full rounded-lg" />
            <Bone className="h-11 w-full rounded-lg" />
          </div>
        </SkeletonCard>
      ))}
    </LoadingScreen>
  );
}
